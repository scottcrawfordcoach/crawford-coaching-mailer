/**
 * data-handler/index.ts
 * ---------------------
 * Crawford Coaching CRM — Data Handler Edge Function
 *
 * Single access point for all CRM operations from external callers:
 *   - Crawford Site (contact forms, newsletter signups)
 *   - Website Assistant (faq-bot: contact lookup, engagement logging)
 *   - Local accounting scripts (contact list, e-transfer name lookup)
 *
 * Auth: Bearer token in Authorization header.
 *       Token must match DATA_HANDLER_BEARER_TOKEN secret.
 *
 * Request format:
 *   POST /data-handler
 *   { "action": "<action_name>", "payload": { ... } }
 *
 * Deploy:
 *   supabase functions deploy data-handler --no-verify-jwt
 *
 * Secrets required:
 *   supabase secrets set DATA_HANDLER_BEARER_TOKEN=<your_token>
 *   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected by Supabase)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContactUpsertPayload {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  contact_id?: string;
  etransfer_name?: string;
  newsletter_enabled?: boolean;
  newsletter_status?: string;
  source_subscribed?: boolean;
  billing_enabled?: boolean;
  default_rate?: number;
  billing_note?: string;
  notes?: string;
  tags_add?: string[];       // tags to add
  tags_remove?: string[];    // tags to remove
  offer?: string;            // source offer (e.g. 'synergize', 'newsletter')
}

interface ContactLookupPayload {
  email?: string;
  contact_id?: string;       // CT0001-style legacy ID
  etransfer_name?: string;
}

interface ContactListPayload {
  tags?: string[];           // filter: contacts having ALL of these tags
  status?: string;           // filter: contact_status
  billing_enabled?: boolean;
  limit?: number;
  offset?: number;
}

interface EngagementLogPayload {
  contact_id?: string;       // UUID (if known)
  email_hint?: string;       // email captured before contact exists
  source: string;            // e.g. 'crawford-site/contact', 'assistant', 'newsletter'
  offer?: string;            // e.g. 'synergize', 'whole', 'coaching'
  action: string;            // e.g. 'form_submit', 'newsletter_signup', 'assistant_chat'
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function checkAuth(req: Request): boolean {
  const token = Deno.env.get("DATA_HANDLER_BEARER_TOKEN");
  if (!token) return false;
  const auth = req.headers.get("Authorization") ?? "";
  return auth === `Bearer ${token}`;
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * contact_upsert
 * Create or update a contact. Matches on email.
 * Supports adding/removing individual tags without replacing the full set.
 */
async function contactUpsert(payload: ContactUpsertPayload, supabase: ReturnType<typeof createClient>) {
  if (!payload.email) {
    return { error: "email is required for contact_upsert" };
  }

  const contactRecord: Record<string, unknown> = {
    email: payload.email.toLowerCase().trim(),
  };

  // Only include fields that are explicitly provided
  const fields: (keyof ContactUpsertPayload)[] = [
    "first_name", "last_name", "phone", "contact_id", "etransfer_name",
    "newsletter_enabled", "newsletter_status", "source_subscribed",
    "billing_enabled", "default_rate", "billing_note", "notes",
  ];
  for (const f of fields) {
    if (payload[f] !== undefined) contactRecord[f] = payload[f];
  }

  // Upsert the contact
  const { data: contact, error: upsertError } = await supabase
    .from("contacts")
    .upsert(contactRecord, { onConflict: "email" })
    .select("id, contact_id, email")
    .single();

  if (upsertError) return { error: upsertError.message };

  const contactUuid = contact.id;

  // Handle tag additions
  if (payload.tags_add?.length) {
    const tagCategoryMap = getTagCategoryMap();
    const tagRows = payload.tags_add.map((tag) => ({
      contact_id: contactUuid,
      tag,
      category: tagCategoryMap[tag] ?? "status",
    }));
    // upsert — ignore if tag already exists
    await supabase.from("contact_tags").upsert(tagRows, { onConflict: "contact_id,tag" });
  }

  // Handle tag removals
  if (payload.tags_remove?.length) {
    for (const tag of payload.tags_remove) {
      await supabase.from("contact_tags")
        .delete()
        .eq("contact_id", contactUuid)
        .eq("tag", tag);
    }
  }

  // Log engagement if offer context provided
  if (payload.offer) {
    await supabase.from("engagements").insert({
      contact_id: contactUuid,
      source: "contact_upsert",
      offer: payload.offer,
      action: "contact_created_or_updated",
    });
  }

  return { data: contact };
}

/**
 * contact_lookup
 * Fetch a contact with their tags and active enrollment.
 * Returns null data (not an error) if no contact found.
 */
async function contactLookup(payload: ContactLookupPayload, supabase: ReturnType<typeof createClient>) {
  if (!payload.email && !payload.contact_id && !payload.etransfer_name) {
    return { error: "One of email, contact_id, or etransfer_name is required" };
  }

  let query = supabase
    .from("contacts")
    .select(`
      *,
      contact_tags ( tag, category ),
      enrollment ( enrolled_group, enrolled_days, attending_group, attending_days, billing_note, is_active )
    `);

  if (payload.email) {
    query = query.eq("email", payload.email.toLowerCase().trim());
  } else if (payload.contact_id) {
    query = query.eq("contact_id", payload.contact_id);
  } else if (payload.etransfer_name) {
    query = query.ilike("etransfer_name", payload.etransfer_name);
  }

  const { data, error } = await query.maybeSingle();
  if (error) return { error: error.message };
  return { data };
}

/**
 * contact_list
 * Return a filtered list of contacts with tags.
 * Used by accounting scripts and future admin surfaces.
 */
async function contactList(payload: ContactListPayload, supabase: ReturnType<typeof createClient>) {
  const limit = payload.limit ?? 200;
  const offset = payload.offset ?? 0;

  let query = supabase
    .from("contacts")
    .select(`
      id, contact_id, first_name, last_name, email, contact_status,
      billing_enabled, default_rate, etransfer_name, billing_note,
      contact_tags ( tag, category ),
      enrollment ( enrolled_group, enrolled_days, is_active )
    `)
    .order("contact_id")
    .range(offset, offset + limit - 1);

  if (payload.status) {
    query = query.eq("contact_status", payload.status);
  }

  if (payload.billing_enabled !== undefined) {
    query = query.eq("billing_enabled", payload.billing_enabled);
  }

  const { data, error } = await query;
  if (error) return { error: error.message };

  // Filter by tags (contacts must have ALL requested tags)
  let result = data ?? [];
  if (payload.tags?.length) {
    result = result.filter((c: Record<string, unknown>) => {
      const contactTagList = ((c.contact_tags as Array<{ tag: string }>) ?? []).map((t) => t.tag);
      return (payload.tags ?? []).every((t) => contactTagList.includes(t));
    });
  }

  return { data: result, count: result.length };
}

/**
 * engagement_log
 * Record a website or assistant interaction event.
 * contact_id is optional — anonymous events are welcome.
 */
async function engagementLog(payload: EngagementLogPayload, supabase: ReturnType<typeof createClient>) {
  if (!payload.source || !payload.action) {
    return { error: "source and action are required for engagement_log" };
  }

  const record: Record<string, unknown> = {
    source: payload.source,
    action: payload.action,
  };

  if (payload.contact_id)  record.contact_id = payload.contact_id;
  if (payload.email_hint)  record.email_hint = payload.email_hint.toLowerCase().trim();
  if (payload.offer)       record.offer = payload.offer;
  if (payload.metadata)    record.metadata = payload.metadata;

  const { data, error } = await supabase.from("engagements").insert(record).select("id").single();
  if (error) return { error: error.message };
  return { data };
}

// ---------------------------------------------------------------------------
// knowledge_base_load — authenticated
// Lists and downloads all knowledge files from website_assistant_knowledge.
// Allows faq-bot to proxy storage reads through data-handler (no SRK in faq-bot).
// ---------------------------------------------------------------------------

/**
 * knowledge_base_load
 * Lists and downloads all knowledge files (.md, .csv, .json) from the
 * website_assistant_knowledge storage bucket.
 * Returns Array<{ name: string; content: string }>.
 */
async function knowledgeBaseLoad(supabase: ReturnType<typeof createClient>) {
  const bucketName = "website_assistant_knowledge";
  const allowedExtensions = [".md", ".csv", ".json"];

  const { data: fileList, error: listError } = await supabase
    .storage
    .from(bucketName)
    .list();

  if (listError) {
    return { error: `Failed to list knowledge files: ${listError.message}` };
  }

  const knowledgeFiles = (fileList ?? []).filter(
    (f) => allowedExtensions.some((ext) => f.name.endsWith(ext))
  );

  const results: Array<{ name: string; content: string }> = [];

  for (const file of knowledgeFiles) {
    const { data, error: downloadError } = await supabase
      .storage
      .from(bucketName)
      .download(file.name);

    if (downloadError) {
      console.error(`Error downloading ${file.name}:`, downloadError);
      continue;
    }

    const content = await data.text();
    results.push({ name: file.name, content });
  }

  return { data: results };
}

/**
 * knowledge_file_upload
 * Accepts a base64-encoded file and upserts it into the
 * website_assistant_knowledge storage bucket.
 * Payload: { name: string; content_b64: string; content_type: string }
 */
async function knowledgeFileUpload(
  payload: { name: string; content_b64: string; content_type: string },
  supabase: ReturnType<typeof createClient>
) {
  if (!payload.name || !payload.content_b64 || !payload.content_type) {
    return { error: "name, content_b64, and content_type are required" };
  }

  const bucketName = "website_assistant_knowledge";

  // Decode base64 to binary
  const binaryString = atob(payload.content_b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const fileBlob = new Blob([bytes], { type: payload.content_type });

  const { error } = await supabase
    .storage
    .from(bucketName)
    .upload(payload.name, fileBlob, {
      contentType: payload.content_type,
      upsert: true,
    });

  if (error) return { error: error.message };
  return { data: { uploaded: payload.name } };
}

// ---------------------------------------------------------------------------
// Tag category map (mirrors seed_contacts.py)
// ---------------------------------------------------------------------------

function getTagCategoryMap(): Record<string, string> {
  return {
    MON: "day", TUE: "day", WED: "day", THU: "day", FRI: "day",
    SAT: "day", SUN: "day",
    "M/W/F 9": "slot", "M/W/F 6:15": "slot", "M/W/F 7:30": "slot",
    "M/W 4:30": "slot", "M/W 6:30": "slot",
    "TU/TH 6:15": "slot", "TU/TH 7:30": "slot", "TU/TH 9": "slot",
    "Synergize Fitness": "program", "Crawford Coaching": "program", "WHOLE": "program",
    ACTIVE: "status", "PREVIOUS CLIENT": "status", "PREVIOUS CLIENT - RECENT": "status",
    INVOICE_CLIENT: "status", BILLING_AUTO_MATCHED: "status",
    EXCLUDE: "status", "HAS INQUIRED": "status", ADMIN: "status",
  };
}

// ---------------------------------------------------------------------------
// classSchedule — public, no auth required
// Reads class_availability.md from storage and returns parsed schedule.
// ---------------------------------------------------------------------------

async function classSchedule(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .storage
    .from("website_assistant_knowledge")
    .download("class_availability.md");

  if (error || !data) {
    return { error: "Failed to load class schedule" };
  }

  const text = await data.text();
  const schedule: Array<{ day: string; time: string; freeSpaces: number }> = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    // Skip non-table lines, the header row, and separator rows
    if (!trimmed.startsWith("|") || trimmed.startsWith("|---") || trimmed.includes("Day") && trimmed.includes("Time")) {
      continue;
    }
    const cols = trimmed.split("|").map((c) => c.trim()).filter((c) => c.length > 0);
    if (cols.length < 3) continue;
    const freeSpaces = parseInt(cols[2], 10);
    if (isNaN(freeSpaces)) continue;
    schedule.push({ day: cols[0], time: cols[1], freeSpaces });
  }

  return { data: schedule };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Public GET routes — no auth required
  // ---------------------------------------------------------------------------
  if (req.method === "GET") {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "class_schedule") {
      const result = await classSchedule(supabase);
      const status = result.error ? 500 : 200;
      return new Response(JSON.stringify(result), {
        status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown GET action: ${action}` }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  // ---------------------------------------------------------------------------
  // Public POST routes — no auth required
  // ---------------------------------------------------------------------------
  let publicBody: { action: string; payload: Record<string, unknown> };
  try {
    publicBody = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  if (publicBody.action === "engagement_log") {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const result = await engagementLog(publicBody.payload as EngagementLogPayload, supabase);
    const status = result.error ? 400 : 200;
    return new Response(JSON.stringify(result), {
      status,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  // Auth check — required for all other POST actions
  if (!checkAuth(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { action, payload } = publicBody;
  if (!action) {
    return new Response(JSON.stringify({ error: "action is required" }), { status: 400 });
  }

  // Supabase client (service role — bypasses RLS)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Dispatch
  let result: Record<string, unknown>;
  try {
    switch (action) {
      case "contact_upsert":
        result = await contactUpsert(payload as ContactUpsertPayload, supabase);
        break;
      case "contact_lookup":
        result = await contactLookup(payload as ContactLookupPayload, supabase);
        break;
      case "contact_list":
        result = await contactList(payload as ContactListPayload, supabase);
        break;
      case "knowledge_base_load":
        result = await knowledgeBaseLoad(supabase);
        break;
      case "knowledge_file_upload":
        result = await knowledgeFileUpload(payload as { name: string; content_b64: string; content_type: string }, supabase);
        break;
      default:
        result = { error: `Unknown action: ${action}` };
    }
  } catch (err) {
    result = { error: err instanceof Error ? err.message : String(err) };
  }

  const status = result.error ? 400 : 200;
  return new Response(JSON.stringify(result), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
