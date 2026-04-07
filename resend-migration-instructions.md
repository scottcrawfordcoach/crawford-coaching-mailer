# Crawford Coaching — Migrate from Gmail SMTP to Resend API

## Overview

The newsletter is landing in Gmail spam because:

1. Sending via Gmail SMTP with `from: scott@crawford-coaching.ca` fails SPF/DKIM alignment (Gmail SMTP is not authorised to send for `crawford-coaching.ca`)
2. The edge function's custom link-rewriting and open-pixel injection creates suspicious redirect URLs through the Supabase function domain, which Gmail flags as phishing
3. No `List-Unsubscribe-Post` header with RFC 8058 one-click compliance

**Solution:** Replace Gmail SMTP with Resend API. Resend handles SPF/DKIM/DMARC-aligned sending, and provides native open/click tracking through reputable domains that Gmail trusts. The domain `crawford-coaching.ca` is already verified in Resend with DKIM + SPF confirmed.

---

## What Changes

| Component | Current | After migration |
|-----------|---------|-----------------|
| `mail-sender/index.ts` | Gmail SMTP via nodemailer | Resend HTTP API |
| Open tracking | Custom pixel injection via `mail-tracker` | Resend native (optional: webhook to DB) |
| Click tracking | Custom link rewriting via `mail-tracker` | Resend native (optional: webhook to DB) |
| Unsubscribe | Custom `mail-tracker?action=unsubscribe` | **Unchanged** — still custom via `mail-tracker` |
| `mail-tracker/index.ts` | Handles open, click, unsubscribe | **Reduced** — only handles unsubscribe now |
| New: `mail-webhook/index.ts` | N/A | Receives Resend webhook events → writes to `campaign_events` |
| `campaign_events` table | `open`, `click`, `unsubscribe` | Add: `delivered`, `bounced`, `complained` |
| `mailer.py` | Unchanged | Unchanged |
| `send.py` | Unchanged | Unchanged |
| `renderer.py` | Unchanged | Unchanged |
| `config.py` | Unchanged | Unchanged |

---

## Secrets / Environment Variables

### New secret to add

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxx
```

Use the value from your `.env` variable `RESEND_API_KEY`.

### Secrets to keep

```
MAIL_SENDER_BEARER_TOKEN    — still used for CLI → edge function auth
MAIL_TRACKER_BASE_URL       — still used for unsubscribe URLs
SUPABASE_URL                — unchanged
SUPABASE_SERVICE_ROLE_KEY   — unchanged
```

### Secrets no longer needed (can remove later)

```
GMAIL_BUSINESS
GMAIL_APP_PASSWORD_BUSINESS
```

---

## Step 1: Database Migration

Create a new migration file: `supabase/migrations/004_resend_event_types.sql`

```sql
-- ============================================================
-- Migration 004: Expand campaign_events for Resend webhooks
-- Run after 003_edition_slug.sql
-- ============================================================

-- Widen the event_type CHECK constraint to accept Resend webhook events.
-- Existing values (open, click, unsubscribe) are preserved.
-- New values: delivered, bounced, complained

ALTER TABLE campaign_events
  DROP CONSTRAINT IF EXISTS campaign_events_event_type_check;

ALTER TABLE campaign_events
  ADD CONSTRAINT campaign_events_event_type_check
  CHECK (event_type IN ('open', 'click', 'unsubscribe', 'delivered', 'bounced', 'complained'));

-- Add a column to store Resend's email ID for cross-referencing
ALTER TABLE campaign_recipients
  ADD COLUMN IF NOT EXISTS resend_email_id text;
```

Run this migration:

```bash
supabase db push
# or apply manually in the Supabase SQL Editor
```

---

## Step 2: Rewrite `mail-sender/index.ts`

Replace the **entire file** `supabase/functions/mail-sender/index.ts` with the following:

```typescript
/**
 * mail-sender/index.ts
 * --------------------
 * Crawford Coaching — Mail Sender Edge Function (Resend API)
 *
 * Auth: Bearer token in Authorization header.
 *       Token must match MAIL_SENDER_BEARER_TOKEN secret.
 *
 * Actions (POST):
 *   send_campaign       — personalise per recipient, send via Resend, record in DB
 *   get_campaigns       — paginated campaign list with aggregate analytics
 *   get_campaign_detail — full campaign detail with recipients and events
 *
 * Deploy:
 *   supabase functions deploy mail-sender --no-verify-jwt
 *
 * Secrets required:
 *   supabase secrets set MAIL_SENDER_BEARER_TOKEN=<value>
 *   supabase secrets set RESEND_API_KEY=<resend_api_key>
 *   supabase secrets set MAIL_TRACKER_BASE_URL=https://<project>.supabase.co/functions/v1/mail-tracker
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
// HTML helpers
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Per-recipient HTML personalisation (NO link rewriting, NO pixel injection)
//
// Resend handles open tracking and click tracking natively.
// We only replace per-recipient placeholders: name, unsubscribe URL, year.
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

  let out = html
    .replace(/\{\{FIRST_NAME\}\}/g, escapeHtml(firstName))
    .replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubscribeUrl)
    .replace(/\{\{CURRENT_YEAR\}\}/g, year);

  // Remove the open pixel placeholder — Resend injects its own
  out = out.replace("<!-- {{OPEN_PIXEL}} -->", "");

  return out;
}

// ---------------------------------------------------------------------------
// Resend API call
// ---------------------------------------------------------------------------

async function sendViaResend(params: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  unsubscribeUrl: string;
  recipientId: string;
}): Promise<{ id: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY secret not set");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text ?? undefined,
      headers: {
        "List-Unsubscribe": `<${params.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        // Custom header to link Resend events back to our recipient row
        "X-CC-Recipient-Id": params.recipientId,
      },
      tags: [
        { name: "recipient_id", value: params.recipientId },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Resend API error (${response.status}): ${errorBody}`);
  }

  return await response.json();
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

  const fromEmail = "scott@crawford-coaching.ca";
  const fromName = "Scott Crawford Coaching";
  const fromFormatted = `${fromName} <${fromEmail}>`;

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
    const unsubscribeUrl = `${trackerBase}?action=unsubscribe&r=${encodeURIComponent(recipientId)}`;

    // Personalise HTML (no link rewriting — Resend handles tracking)
    const personalHtml = personaliseHtml(
      payload.html_body,
      recipient,
      recipientId,
      trackerBase,
    );

    // Send via Resend
    try {
      const result = await sendViaResend({
        from: fromFormatted,
        to: recipient.email,
        subject: payload.subject,
        html: personalHtml,
        text: payload.text_body,
        unsubscribeUrl,
        recipientId,
      });

      // Store Resend's email ID for webhook cross-referencing
      await supabase
        .from("campaign_recipients")
        .update({ resend_email_id: result.id })
        .eq("id", recipientId);

      successCount++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${recipient.email}: ${msg}`);
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
// get_campaigns (unchanged)
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
// get_campaign_detail (unchanged)
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
// Main handler (unchanged)
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
```

### What changed vs the old version

- **Removed:** `import nodemailer` and `createTransporter()` — no more Gmail SMTP
- **Removed:** Link rewriting in `personaliseHtml()` — no more `href` replacement loop
- **Removed:** Open pixel injection in `personaliseHtml()` — no more custom tracking pixel
- **Added:** `sendViaResend()` — single `fetch` call to Resend's API
- **Added:** `resend_email_id` stored on each recipient row for webhook cross-referencing
- **Added:** `X-CC-Recipient-Id` custom header and Resend tags for linking webhook events back to your DB
- **Kept:** `personaliseHtml()` still replaces `{{FIRST_NAME}}`, `{{UNSUBSCRIBE_URL}}`, `{{CURRENT_YEAR}}`
- **Kept:** `getCampaigns()` and `getCampaignDetail()` completely unchanged
- **Kept:** Campaign and recipient DB inserts unchanged (except new `resend_email_id` column)

---

## Step 3: Create `mail-webhook/index.ts`

Create a new edge function: `supabase/functions/mail-webhook/index.ts`

This receives POST requests from Resend's webhook system and writes events to your `campaign_events` table. It maps Resend event types to your existing schema.

```typescript
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
 * Then configure the webhook URL in Resend Dashboard:
 *   https://<project>.supabase.co/functions/v1/mail-webhook
 *
 * Events to subscribe to in Resend:
 *   email.delivered, email.opened, email.clicked, email.bounced, email.complained
 *
 * No auth token needed — Resend signs webhooks, but for simplicity we use
 * a shared secret in a query param. Set:
 *   supabase secrets set WEBHOOK_SECRET=<random_string>
 *
 * Then configure the webhook URL as:
 *   https://<project>.supabase.co/functions/v1/mail-webhook?secret=<random_string>
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

  // Extract our recipient_id from the tags or custom header
  let recipientId: string | null = null;

  // Try tags first (most reliable)
  if (event.data.tags) {
    const tag = event.data.tags.find((t) => t.name === "recipient_id");
    if (tag) recipientId = tag.value;
  }

  // Fallback: look up by Resend email_id in our campaign_recipients table
  if (!recipientId && event.data.email_id) {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: row } = await supabase
      .from("campaign_recipients")
      .select("id, campaign_id")
      .eq("resend_email_id", event.data.email_id)
      .maybeSingle();

    if (row) recipientId = row.id;
  }

  if (!recipientId) {
    // Can't link to a recipient — log and acknowledge
    console.warn(`mail-webhook: Could not resolve recipient for email_id=${event.data.email_id}`);
    return new Response(JSON.stringify({ warning: "recipient not found" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

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
```

---

## Step 4: Update `mail-tracker/index.ts`

The `mail-tracker` function now only needs to handle **unsubscribe**. The `open` and `click` handlers are no longer called since links are no longer rewritten through it.

However, **do not remove the open and click handlers yet**. Previously sent emails still have the old tracking URLs baked into them. Leave `mail-tracker` as-is for backward compatibility. Old emails with rewritten links will continue to work. New emails sent through Resend will not use these routes.

**No changes needed to `mail-tracker/index.ts`.**

---

## Step 5: Enable Tracking in Resend Dashboard

1. Go to [resend.com/domains](https://resend.com/domains)
2. Click on `crawford-coaching.ca`
3. Go to **Configuration** tab
4. Enable **Open tracking** → ON
5. Enable **Click tracking** → ON

This tells Resend to automatically inject a tracking pixel and rewrite links for all emails sent through the API. These use Resend's trusted tracking domains, which Gmail recognises and does not flag.

---

## Step 6: Configure Resend Webhooks

1. Go to [resend.com/webhooks](https://resend.com/webhooks)
2. Click **Add Webhook**
3. Set the endpoint URL:
   ```
   https://yxndmpwqvdatkujcukdv.supabase.co/functions/v1/mail-webhook?secret=YOUR_WEBHOOK_SECRET
   ```
4. Select these events:
   - `email.delivered`
   - `email.opened`
   - `email.clicked`
   - `email.bounced`
   - `email.complained`
5. Save

Generate a random webhook secret and set it:

```bash
# Generate a random secret (use any method you like)
openssl rand -hex 32

# Set it in Supabase
supabase secrets set WEBHOOK_SECRET=<the_generated_secret>
```

---

## Step 7: Deploy

Deploy both edge functions:

```bash
# Deploy the updated mail-sender
supabase functions deploy mail-sender --no-verify-jwt

# Deploy the new webhook receiver
supabase functions deploy mail-webhook --no-verify-jwt
```

Set the Resend API key secret:

```bash
supabase secrets set RESEND_API_KEY=<your_resend_api_key>
```

---

## Step 8: Test

### Test 1 — Dry run (no send, just render + archive)

```bash
python3 send.py \
  --template general \
  --subject "Resend test" \
  --recipients "scott@crawford-coaching.ca" \
  --body "Testing the Resend migration." \
  --dry-run
```

This confirms the Python pipeline still works. Nothing changed on the Python side.

### Test 2 — Live send to yourself

```bash
python3 send.py \
  --template general \
  --subject "Resend delivery test" \
  --recipients "scott@crawford-coaching.ca" \
  --body "If you're reading this in your inbox (not spam), the migration worked."
```

**Check:**
- Email arrives in inbox (not spam)
- `From` shows `Scott Crawford Coaching <scott@crawford-coaching.ca>`
- Open the email headers (Gmail → Show Original) and verify:
  - `spf=pass`
  - `dkim=pass`
  - `dmarc=pass`
- Unsubscribe link works (uses your existing `mail-tracker` function)
- Click a link in the email, then check `campaign_events` table for a `click` row

### Test 3 — Newsletter send

```bash
python3 send.py \
  --template newsletter \
  --subject "Newsletter Resend test" \
  --recipients "scott@crawford-coaching.ca" \
  --content content/15-becoming-a-snacker.json
```

### Test 4 — Verify webhook events

After opening the test email and clicking a link, check the Supabase `campaign_events` table. You should see:

- A `delivered` event (from Resend webhook)
- An `open` event (from Resend webhook, after you opened the email)
- A `click` event (from Resend webhook, after you clicked a link)

```sql
SELECT * FROM campaign_events ORDER BY occurred_at DESC LIMIT 10;
```

---

## Step 9: Verify Email Headers

After receiving the test email, open it in Gmail and click **Show original** (three dots → Show original). Look for these three lines:

```
SPF:   PASS
DKIM:  PASS
DMARC: PASS
```

All three should show PASS. If any show FAIL:

- **SPF FAIL** — the SPF DNS record for `crawford-coaching.ca` may not include Resend. Your Resend dashboard showed this as verified, so it should be fine.
- **DKIM FAIL** — the DKIM record may not have propagated yet. Wait 15 minutes and resend.
- **DMARC FAIL** — your DMARC record is set to `p=none` which is correct for now. This should pass once SPF and DKIM pass.

---

## Rollback Plan

If something goes wrong, you can revert to Gmail SMTP by:

1. Restoring the old `mail-sender/index.ts` from git
2. Redeploying: `supabase functions deploy mail-sender --no-verify-jwt`

The old secrets (`GMAIL_BUSINESS`, `GMAIL_APP_PASSWORD_BUSINESS`) are still set until you explicitly remove them.

---

## Summary of Files Changed

| File | Action |
|------|--------|
| `supabase/migrations/004_resend_event_types.sql` | **New** — widen event_type constraint, add resend_email_id column |
| `supabase/functions/mail-sender/index.ts` | **Replace entirely** — Resend API instead of Gmail SMTP |
| `supabase/functions/mail-webhook/index.ts` | **New** — receives Resend webhook events |
| `supabase/functions/mail-tracker/index.ts` | **No change** — keep for backward compat + unsubscribe |
| `mailer.py` | **No change** |
| `send.py` | **No change** |
| `renderer.py` | **No change** |
| `config.py` | **No change** |

---

## Post-Migration Cleanup (Optional, Later)

Once you've confirmed everything works and old emails have aged out:

1. Remove Gmail secrets: `supabase secrets unset GMAIL_BUSINESS GMAIL_APP_PASSWORD_BUSINESS`
2. Optionally simplify `mail-tracker` by removing the `open` and `click` handlers (keep `unsubscribe`)
3. Optionally upgrade DMARC policy from `p=none` to `p=quarantine` or `p=reject` for stronger protection

---

*End of instruction set.*
