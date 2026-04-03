/**
 * mail-tracker/index.ts
 * ---------------------
 * Crawford Coaching — Mail Tracker Edge Function
 *
 * Public GET routes (no auth — must be reachable by email clients):
 *   GET /mail-tracker?action=open&r={recipient_id}        → 1x1 transparent GIF
 *   GET /mail-tracker?action=click&r={recipient_id}&url={encoded_url}  → 302 redirect
 *   GET /mail-tracker?action=unsubscribe&r={recipient_id} → confirmation HTML
 *
 * Deploy:
 *   supabase functions deploy mail-tracker --no-verify-jwt
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TRANSPARENT_GIF = new Uint8Array([
  0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,0x01,0x00,0x80,0x00,0x00,
  0xff,0xff,0xff,0x00,0x00,0x00,0x21,0xf9,0x04,0x00,0x00,0x00,0x00,0x00,
  0x2c,0x00,0x00,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0x02,0x02,0x44,0x01,0x00,0x3b,
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function supabaseClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function getCampaignIdForRecipient(
  supabase: ReturnType<typeof supabaseClient>,
  recipientId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("campaign_recipients")
    .select("campaign_id")
    .eq("id", recipientId)
    .maybeSingle();
  return data?.campaign_id ?? null;
}

// ---------------------------------------------------------------------------
// Open pixel
// ---------------------------------------------------------------------------
async function handleOpen(recipientId: string, req: Request): Promise<Response> {
  const supabase = supabaseClient();
  const campaignId = await getCampaignIdForRecipient(supabase, recipientId);

  if (campaignId) {
    const ip = req.headers.get("x-forwarded-for") ?? undefined;
    const ua = req.headers.get("user-agent") ?? undefined;
    await supabase.from("campaign_events").insert({
      campaign_id: campaignId,
      recipient_id: recipientId,
      event_type: "open",
      ip,
      user_agent: ua,
    });
  }

  return new Response(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}

// ---------------------------------------------------------------------------
// Click redirect
// ---------------------------------------------------------------------------
async function handleClick(
  recipientId: string,
  encodedUrl: string,
  req: Request,
): Promise<Response> {
  let destination: string;
  try {
    destination = decodeURIComponent(encodedUrl);
    // Validate it's a safe absolute URL
    const parsed = new URL(destination);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Invalid protocol");
    }
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }

  const supabase = supabaseClient();
  const campaignId = await getCampaignIdForRecipient(supabase, recipientId);

  if (campaignId) {
    const ip = req.headers.get("x-forwarded-for") ?? undefined;
    const ua = req.headers.get("user-agent") ?? undefined;
    await supabase.from("campaign_events").insert({
      campaign_id: campaignId,
      recipient_id: recipientId,
      event_type: "click",
      url: destination,
      ip,
      user_agent: ua,
    });
  }

  return new Response(null, {
    status: 302,
    headers: { ...CORS_HEADERS, Location: destination },
  });
}

// ---------------------------------------------------------------------------
// Unsubscribe
// ---------------------------------------------------------------------------
async function handleUnsubscribe(recipientId: string): Promise<Response> {
  const supabase = supabaseClient();

  // Get recipient details
  const { data: recipient } = await supabase
    .from("campaign_recipients")
    .select("campaign_id, contact_id, email")
    .eq("id", recipientId)
    .maybeSingle();

  if (recipient) {
    // Insert event
    await supabase.from("campaign_events").insert({
      campaign_id: recipient.campaign_id,
      recipient_id: recipientId,
      event_type: "unsubscribe",
    });

    // Mark recipient as unsubscribed
    await supabase
      .from("campaign_recipients")
      .update({ status: "unsubscribed" })
      .eq("id", recipientId);

    // Update contact newsletter status if contact_id is present
    if (recipient.contact_id) {
      await supabase
        .from("contacts")
        .update({ newsletter_status: "unsubscribed" })
        .eq("id", recipient.contact_id);
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unsubscribed — Crawford Coaching</title>
<style>
  body { margin: 0; padding: 0; background: #0e0f10; font-family: Georgia, serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .card { max-width: 480px; padding: 48px 40px; background: #1c2330; border-top: 3px solid #2d86c4; text-align: center; }
  h1 { margin: 0 0 16px; font-size: 22px; color: #f5f3ef; font-weight: 400; }
  p { margin: 0; font-size: 15px; line-height: 1.7; color: #7a8fa3; }
  a { color: #2d86c4; }
</style>
</head>
<body>
  <div class="card">
    <h1>You have been unsubscribed.</h1>
    <p>You will no longer receive emails from Crawford Coaching.<br>
    You can <a href="https://crawford-coaching.ca/contact">contact us</a> at any time.</p>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const recipientId = url.searchParams.get("r");

  if (!recipientId) {
    return new Response("Missing recipient id", { status: 400 });
  }

  switch (action) {
    case "open":
      return handleOpen(recipientId, req);
    case "click": {
      const encodedUrl = url.searchParams.get("url");
      if (!encodedUrl) return new Response("Missing url param", { status: 400 });
      return handleClick(recipientId, encodedUrl, req);
    }
    case "unsubscribe":
      return handleUnsubscribe(recipientId);
    default:
      return new Response("Unknown action", { status: 400 });
  }
});
