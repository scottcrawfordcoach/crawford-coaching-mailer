/**
 * mail-sender/index.ts
 * --------------------
 * Crawford Coaching — Mail Sender Edge Function
 *
 * Auth: Bearer token in Authorization header.
 *       Token must match MAIL_SENDER_BEARER_TOKEN secret.
 *
 * Actions (POST):
 *   send_campaign       — render, personalise, inject tracking, send via SMTP, archive
 *   get_campaigns       — paginated campaign list with aggregate analytics
 *   get_campaign_detail — full campaign detail with recipients and events
 *
 * Deploy:
 *   supabase functions deploy mail-sender --no-verify-jwt
 *
 * Secrets required:
 *   supabase secrets set MAIL_SENDER_BEARER_TOKEN=<value>
 *   supabase secrets set GMAIL_BUSINESS=scott@crawford-coaching.ca
 *   supabase secrets set GMAIL_APP_PASSWORD_BUSINESS=<app_password>
 *   supabase secrets set MAIL_TRACKER_BASE_URL=https://<project>.supabase.co/functions/v1/mail-tracker
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Recipient {
  email: string;
  first_name?: string;
  contact_id?: string;
}

interface SendCampaignPayload {
  campaign_type: "general" | "newsletter";
  subject: string;
  html_body: string;
  text_body?: string;
  recipients: Recipient[];
  edition_slug?: string;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function checkAuth(req: Request): boolean {
  const token = Deno.env.get("MAIL_SENDER_BEARER_TOKEN");
  if (!token) return false;
  const auth = req.headers.get("Authorization") ?? "";
  return auth === `Bearer ${token}`;
}

// ---------------------------------------------------------------------------
// SMTP transporter
// ---------------------------------------------------------------------------

function createTransporter() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: Deno.env.get("GMAIL_BUSINESS"),
      pass: Deno.env.get("GMAIL_APP_PASSWORD_BUSINESS"),
    },
  });
}

// ---------------------------------------------------------------------------
// Per-recipient HTML personalisation + tracking injection
// ---------------------------------------------------------------------------

function personaliseHtml(
  html: string,
  recipient: Recipient,
  recipientId: string,
  trackerBase: string,
): string {
  const firstName = recipient.first_name ?? "there";
  const year = new Date().getFullYear().toString();
  const unsubscribeUrl = `${trackerBase}?action=unsubscribe&r=${encodeURIComponent(recipientId)}`;
  const openPixelUrl = `${trackerBase}?action=open&r=${encodeURIComponent(recipientId)}`;

  let out = html
    .replace(/\{\{FIRST_NAME\}\}/g, escapeHtml(firstName))
    .replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubscribeUrl)
    .replace(/\{\{CURRENT_YEAR\}\}/g, year);

  // Rewrite all href links through click tracker (skip mailto: and unsubscribe links)
  out = out.replace(/href="(https?:\/\/[^"]+)"/g, (_match, url: string) => {
    if (url.startsWith(trackerBase)) return `href="${url}"`;
    const clickUrl = `${trackerBase}?action=click&r=${encodeURIComponent(recipientId)}&url=${encodeURIComponent(url)}`;
    return `href="${clickUrl}"`;
  });

  // Inject open pixel — replace placeholder comment or insert before </body>
  const pixelTag = `<img src="${openPixelUrl}" width="1" height="1" alt="" style="display:none;">`;
  if (out.includes("<!-- {{OPEN_PIXEL}} -->")) {
    out = out.replace("<!-- {{OPEN_PIXEL}} -->", pixelTag);
  } else {
    out = out.replace("</body>", `${pixelTag}\n</body>`);
  }

  return out;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// send_campaign
// ---------------------------------------------------------------------------

async function sendCampaign(
  payload: SendCampaignPayload,
  supabase: ReturnType<typeof createClient>,
): Promise<Record<string, unknown>> {
  if (!payload.recipients?.length) {
    return { error: "recipients array is required and must not be empty" };
  }

  const trackerBase = Deno.env.get("MAIL_TRACKER_BASE_URL");
  if (!trackerBase) return { error: "MAIL_TRACKER_BASE_URL secret not set" };

  const fromEmail = Deno.env.get("GMAIL_BUSINESS") ?? "scott@crawford-coaching.ca";
  const fromName = "Scott Crawford Coaching";

  // Insert campaign row as 'sending'
  const { data: campaign, error: campaignError } = await supabase
    .from("sent_campaigns")
    .insert({
      campaign_type: payload.campaign_type,
      subject: payload.subject,
      from_name: fromName,
      from_email: fromEmail,
      html_body: payload.html_body,
      text_body: payload.text_body ?? null,
      recipient_count: payload.recipients.length,
      status: "sending",
      edition_slug: payload.edition_slug ?? null,
    })
    .select("id")
    .single();

  if (campaignError) return { error: campaignError.message };

  const campaignId: string = campaign.id;
  const transporter = createTransporter();

  let successCount = 0;
  const errors: string[] = [];

  for (const recipient of payload.recipients) {
    // Insert recipient row
    const { data: recipientRow, error: recipientError } = await supabase
      .from("campaign_recipients")
      .insert({
        campaign_id: campaignId,
        contact_id: recipient.contact_id ?? null,
        email: recipient.email.toLowerCase().trim(),
        first_name: recipient.first_name ?? null,
        status: "sent",
      })
      .select("id")
      .single();

    if (recipientError) {
      errors.push(`${recipient.email}: ${recipientError.message}`);
      continue;
    }

    const recipientId: string = recipientRow.id;

    // Personalise HTML
    const personalHtml = personaliseHtml(
      payload.html_body,
      recipient,
      recipientId,
      trackerBase,
    );

    // Send via SMTP
    try {
      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: recipient.email,
        subject: payload.subject,
        html: personalHtml,
        text: payload.text_body ?? undefined,
        headers: {
          "List-Unsubscribe": `<${trackerBase}?action=unsubscribe&r=${encodeURIComponent(recipientId)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      successCount++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${recipient.email}: ${msg}`);
      // Mark recipient as bounced
      await supabase
        .from("campaign_recipients")
        .update({ status: "bounced" })
        .eq("id", recipientId);
    }
  }

  // Update campaign to 'sent'
  await supabase
    .from("sent_campaigns")
    .update({
      status: successCount > 0 ? "sent" : "failed",
      recipient_count: successCount,
      sent_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  return {
    data: {
      campaign_id: campaignId,
      recipient_count: successCount,
      errors: errors.length > 0 ? errors : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// get_campaigns
// ---------------------------------------------------------------------------

async function getCampaigns(
  payload: { limit?: number; offset?: number },
  supabase: ReturnType<typeof createClient>,
): Promise<Record<string, unknown>> {
  const limit = payload.limit ?? 50;
  const offset = payload.offset ?? 0;

  const { data, error } = await supabase
    .from("sent_campaigns")
    .select("id, campaign_type, subject, from_email, recipient_count, status, sent_at, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return { error: error.message };

  // Fetch per-campaign event counts in a single query
  const ids = (data ?? []).map((c: { id: string }) => c.id);
  const { data: events } = await supabase
    .from("campaign_events")
    .select("campaign_id, event_type")
    .in("campaign_id", ids);

  const countMap: Record<string, { open: number; click: number; unsubscribe: number }> = {};
  for (const e of events ?? []) {
    const ev = e as { campaign_id: string; event_type: string };
    if (!countMap[ev.campaign_id]) {
      countMap[ev.campaign_id] = { open: 0, click: 0, unsubscribe: 0 };
    }
    if (ev.event_type === "open") countMap[ev.campaign_id].open++;
    if (ev.event_type === "click") countMap[ev.campaign_id].click++;
    if (ev.event_type === "unsubscribe") countMap[ev.campaign_id].unsubscribe++;
  }

  const result = (data ?? []).map((c: Record<string, unknown>) => ({
    ...c,
    open_count: countMap[c.id as string]?.open ?? 0,
    click_count: countMap[c.id as string]?.click ?? 0,
    unsubscribe_count: countMap[c.id as string]?.unsubscribe ?? 0,
  }));

  return { data: result };
}

// ---------------------------------------------------------------------------
// get_campaign_detail
// ---------------------------------------------------------------------------

async function getCampaignDetail(
  payload: { campaign_id: string },
  supabase: ReturnType<typeof createClient>,
): Promise<Record<string, unknown>> {
  if (!payload.campaign_id) return { error: "campaign_id is required" };

  const { data: campaign, error: cErr } = await supabase
    .from("sent_campaigns")
    .select("*")
    .eq("id", payload.campaign_id)
    .single();

  if (cErr) return { error: cErr.message };

  const { data: recipients, error: rErr } = await supabase
    .from("campaign_recipients")
    .select("*")
    .eq("campaign_id", payload.campaign_id)
    .order("sent_at");

  if (rErr) return { error: rErr.message };

  const { data: events, error: eErr } = await supabase
    .from("campaign_events")
    .select("*")
    .eq("campaign_id", payload.campaign_id)
    .order("occurred_at");

  if (eErr) return { error: eErr.message };

  return { data: { campaign, recipients, events } };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!checkAuth(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let body: { action: string; payload: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let result: Record<string, unknown>;
  try {
    switch (body.action) {
      case "send_campaign":
        result = await sendCampaign(
          body.payload as unknown as SendCampaignPayload,
          supabase,
        );
        break;
      case "get_campaigns":
        result = await getCampaigns(
          body.payload as { limit?: number; offset?: number },
          supabase,
        );
        break;
      case "get_campaign_detail":
        result = await getCampaignDetail(
          body.payload as { campaign_id: string },
          supabase,
        );
        break;
      default:
        result = { error: `Unknown action: ${body.action}` };
    }
  } catch (err) {
    result = { error: err instanceof Error ? err.message : String(err) };
  }

  const status = result.error ? 400 : 200;
  return new Response(JSON.stringify(result), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
