/**
 * mail-webhook/index.ts
 * ---------------------
 * Crawford Coaching — Resend Webhook Receiver
 *
 * Receives webhook POSTs from Resend for email events (delivered, opened,
 * clicked, bounced, complained) and writes them to the campaign_events table.
 *
 * Deploy:
 *   supabase functions deploy mail-webhook --no-verify-jwt
 *
 * Configure the webhook URL in Resend Dashboard:
 *   https://<project>.supabase.co/functions/v1/mail-webhook?secret=<WEBHOOK_SECRET>
 *
 * Events to subscribe to in Resend:
 *   email.delivered, email.opened, email.clicked, email.bounced, email.complained
 *
 * Secrets required:
 *   supabase secrets set WEBHOOK_SECRET=<random_string>
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Map Resend event types to our campaign_events.event_type values
const EVENT_TYPE_MAP: Record<string, string> = {
  "email.delivered": "delivered",
  "email.opened": "open",
  "email.clicked": "click",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Verify shared secret
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const expectedSecret = Deno.env.get("WEBHOOK_SECRET");
  if (!expectedSecret || secret !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  let event: {
    type: string;
    created_at: string;
    data: {
      email_id: string;
      from: string;
      to: string[];
      subject: string;
      headers?: { name: string; value: string }[];
      tags?: { name: string; value: string }[];
      click?: { link: string };
    };
  };

  try {
    event = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const eventType = EVENT_TYPE_MAP[event.type];
  if (!eventType) {
    // Event type we don't track — acknowledge and ignore
    return new Response(JSON.stringify({ ignored: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Resolve recipient_id from tags (set at send time) or by email_id lookup
  let recipientId: string | null = null;

  if (event.data.tags) {
    const tag = event.data.tags.find((t) => t.name === "recipient_id");
    if (tag) recipientId = tag.value;
  }

  if (!recipientId && event.data.email_id) {
    const { data: row } = await supabase
      .from("campaign_recipients")
      .select("id")
      .eq("resend_email_id", event.data.email_id)
      .maybeSingle();

    if (row) recipientId = row.id;
  }

  if (!recipientId) {
    console.warn(`mail-webhook: Could not resolve recipient for email_id=${event.data.email_id}`);
    return new Response(JSON.stringify({ warning: "recipient not found" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Look up campaign_id from the recipient row
  const { data: recipientRow } = await supabase
    .from("campaign_recipients")
    .select("campaign_id")
    .eq("id", recipientId)
    .maybeSingle();

  if (!recipientRow) {
    return new Response(JSON.stringify({ warning: "recipient row not found" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Insert the event
  const insertData: Record<string, unknown> = {
    campaign_id: recipientRow.campaign_id,
    recipient_id: recipientId,
    event_type: eventType,
  };

  // For click events, store the clicked URL
  if (eventType === "click" && event.data.click?.link) {
    insertData.url = event.data.click.link;
  }

  const { error } = await supabase
    .from("campaign_events")
    .insert(insertData);

  if (error) {
    console.error(`mail-webhook: Failed to insert event: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // For bounces, also update the recipient status
  if (eventType === "bounced") {
    await supabase
      .from("campaign_recipients")
      .update({ status: "bounced" })
      .eq("id", recipientId);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
