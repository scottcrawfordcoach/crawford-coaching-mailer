# Crawford Coaching Mailing Tool
## Architecture & Build Specification
**Version 1.0 — April 2026**

---

## 1. Overview

The Crawford Coaching Mailing Tool is a private, authenticated web application hosted on Vercel. It enables Scott Crawford to compose, address, preview, send, and archive transactional emails and newsletters using two built-in HTML templates that match the Crawford Coaching brand. Recipient data is drawn from the existing CRM via the `data-handler` Supabase Edge Function. Sending is handled by a new `mail-sender` Supabase Edge Function using the `scott@crawford-coaching.ca` Gmail App Password via SMTP. Analytics (open, click, unsubscribe) are captured through a third `mail-tracker` Edge Function that acts as a pixel and redirect proxy.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Vercel (Frontend)                      │
│              crawford-mail.vercel.app                    │
│                                                          │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────┐  │
│  │  Compose UI  │  │  Preview Panel │  │  Archives   │  │
│  │  (React/Next)│  │  (live render) │  │  (sent log) │  │
│  └──────┬───────┘  └────────────────┘  └─────────────┘  │
└─────────┼───────────────────────────────────────────────┘
          │  HTTPS + Bearer Token
          ▼
┌─────────────────────────────────────────────────────────┐
│              Supabase Edge Functions                     │
│                                                          │
│  ┌──────────────────┐  (existing, unchanged)            │
│  │  data-handler    │◄─── CRM read: contacts, tags      │
│  └──────────────────┘                                   │
│                                                          │
│  ┌──────────────────┐  (NEW)                            │
│  │  mail-sender     │◄─── compose + send via Gmail SMTP │
│  └──────────────────┘                                   │
│                                                          │
│  ┌──────────────────┐  (NEW)                            │
│  │  mail-tracker    │◄─── open pixel, click redirect,   │
│  └──────────────────┘     unsubscribe handler           │
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│            Supabase Database (existing schema)           │
│                                                          │
│  contacts / contact_tags / enrollment / engagements     │
│                                                          │
│  + NEW TABLES:                                           │
│    sent_campaigns / campaign_recipients /                │
│    campaign_events                                       │
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│         Gmail SMTP (smtp.gmail.com:587)                  │
│         From: scott@crawford-coaching.ca                 │
│         Auth: App Password (stored as Supabase secret)  │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Database — New Tables

Run this migration after the existing `001_crm_schema.sql`.

```sql
-- ============================================================
-- Migration 002: Mailing Tool Tables
-- ============================================================

-- sent_campaigns
-- One row per send operation (general email or newsletter)
CREATE TABLE IF NOT EXISTS sent_campaigns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_type    text NOT NULL CHECK (campaign_type IN ('general', 'newsletter')),
  subject          text NOT NULL,
  from_name        text NOT NULL DEFAULT 'Scott Crawford Coaching',
  from_email       text NOT NULL DEFAULT 'scott@crawford-coaching.ca',
  html_body        text NOT NULL,        -- final rendered HTML
  text_body        text,                 -- plain text fallback
  recipient_count  integer NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'sent'
                     CHECK (status IN ('draft', 'sending', 'sent', 'failed')),
  sent_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- campaign_recipients
-- One row per (campaign × contact)
CREATE TABLE IF NOT EXISTS campaign_recipients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES sent_campaigns(id) ON DELETE CASCADE,
  contact_id   uuid REFERENCES contacts(id) ON DELETE SET NULL,
  email        text NOT NULL,
  first_name   text,
  status       text NOT NULL DEFAULT 'sent'
                 CHECK (status IN ('sent', 'bounced', 'unsubscribed')),
  sent_at      timestamptz NOT NULL DEFAULT now()
);

-- campaign_events
-- Tracking events: open, click, unsubscribe
CREATE TABLE IF NOT EXISTS campaign_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    uuid NOT NULL REFERENCES sent_campaigns(id) ON DELETE CASCADE,
  recipient_id   uuid REFERENCES campaign_recipients(id) ON DELETE SET NULL,
  event_type     text NOT NULL CHECK (event_type IN ('open', 'click', 'unsubscribe')),
  url            text,    -- for click events
  ip             text,    -- optional, for deduplication
  user_agent     text,
  occurred_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_events_campaign     ON campaign_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_events_recipient    ON campaign_events(recipient_id);
CREATE INDEX IF NOT EXISTS idx_campaign_events_type         ON campaign_events(event_type);
```

---

## 4. Supabase Edge Functions

### 4.1 `mail-sender` (NEW)

**Deploy:** `supabase functions deploy mail-sender --no-verify-jwt`

**Secrets required:**
```
supabase secrets set MAIL_SENDER_BEARER_TOKEN=<your_token>
supabase secrets set GMAIL_APP_PASSWORD=<gmail_app_password>
supabase secrets set MAIL_TRACKER_BASE_URL=https://<project>.supabase.co/functions/v1/mail-tracker
```

**Auth:** Bearer token in `Authorization` header (same pattern as `data-handler`).

**Actions (POST):**

---

#### `action: send_campaign`

Composes final HTML, injects per-recipient tracking tokens, sends via Gmail SMTP, archives to `sent_campaigns` and `campaign_recipients`.

**Payload:**
```typescript
{
  action: "send_campaign",
  payload: {
    campaign_type: "general" | "newsletter",
    subject: string,
    html_body: string,           // rendered template HTML with {{FIRST_NAME}} etc.
    text_body?: string,
    recipients: Array<{
      email: string,
      first_name?: string,
      contact_id?: string,       // UUID if from CRM
    }>
  }
}
```

**Logic:**
1. Insert row into `sent_campaigns` with status `'sending'`.
2. For each recipient:
   a. Insert row into `campaign_recipients` — get `recipient_id`.
   b. Personalize HTML: replace `{{FIRST_NAME}}` etc.
   c. Inject open-tracking pixel: append `<img src="${TRACKER_URL}/open?r=${recipient_id}" width="1" height="1">` before `</body>`.
   d. Rewrite all `<a href="...">` links through click tracker: `${TRACKER_URL}/click?r=${recipient_id}&url=${encodeURIComponent(href)}`.
   e. Inject unsubscribe link: replace `{{UNSUBSCRIBE_URL}}` with `${TRACKER_URL}/unsubscribe?r=${recipient_id}`.
   f. Send via `nodemailer` (SMTP: `smtp.gmail.com:587`, STARTTLS, user: `scott@crawford-coaching.ca`, pass: `GMAIL_APP_PASSWORD`).
3. Update `sent_campaigns.status` to `'sent'`, set `sent_at`, `recipient_count`.

**Response:** `{ data: { campaign_id, recipient_count } }`

---

#### `action: get_campaigns`

Returns paginated list of sent campaigns with aggregate analytics.

**Payload:**
```typescript
{ limit?: number, offset?: number }
```

**Response:** Array of campaigns with `open_count`, `click_count`, `unsubscribe_count` joined from `campaign_events`.

---

#### `action: get_campaign_detail`

Returns full campaign detail: HTML body, all recipients, all events.

**Payload:**
```typescript
{ campaign_id: string }
```

---

### 4.2 `mail-tracker` (NEW)

**Deploy:** `supabase functions deploy mail-tracker --no-verify-jwt`

No auth required — called by email clients and browsers.

**GET routes (query params: `r` = recipient_id):**

---

#### `GET /open?r={recipient_id}`

1. Insert `campaign_events` row: `event_type = 'open'`, look up `campaign_id` from `campaign_recipients`.
2. Return 1×1 transparent GIF (`Content-Type: image/gif`).

---

#### `GET /click?r={recipient_id}&url={encoded_url}`

1. Insert `campaign_events` row: `event_type = 'click'`, `url = decoded url`.
2. Return HTTP 302 redirect to destination URL.

---

#### `GET /unsubscribe?r={recipient_id}`

1. Insert `campaign_events` row: `event_type = 'unsubscribe'`.
2. Update `campaign_recipients.status = 'unsubscribed'`.
3. Update `contacts.newsletter_status = 'unsubscribed'` (if `contact_id` is set).
4. Return a simple HTML confirmation page: "You have been unsubscribed from Crawford Coaching emails."

---

### 4.3 `data-handler` — No Changes Required

The frontend calls the existing `data-handler` for:
- `contact_lookup` — name search
- `contact_list` — tag-based recipient selection

These calls are authenticated with the existing `DATA_HANDLER_BEARER_TOKEN`.

---

## 5. Frontend — Vercel App

**Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS
**Auth:** Single password gate (env var `TOOL_PASSWORD`) — simple session cookie. No OAuth required for a single-user private tool.
**Hosting:** Vercel, private repo

**Environment Variables (Vercel):**
```
TOOL_PASSWORD=<chosen_password>
DATA_HANDLER_URL=https://<project>.supabase.co/functions/v1/data-handler
DATA_HANDLER_TOKEN=<bearer_token>
MAIL_SENDER_URL=https://<project>.supabase.co/functions/v1/mail-sender
MAIL_SENDER_TOKEN=<bearer_token>
```

---

### 5.1 Routes

```
/                   → redirect to /compose
/login              → password gate
/compose            → main compose UI (default: general email)
/compose/newsletter → newsletter compose UI
/archive            → sent campaigns list
/archive/[id]       → campaign detail + analytics
```

---

### 5.2 Design Language

The UI inherits directly from the Crawford Coaching website design system:

```css
:root {
  --ink:        #0e0f10;
  --slate:      #1c2330;
  --slate-mid:  #232f3e;
  --fog:        #3d4a58;
  --mist:       #7a8fa3;
  --pale:       #c8d4de;
  --white:      #f5f3ef;
  --brand-blue: #2d86c4;
  --brand-blue-light: #4fa3d8;
  --serif-display: 'Cormorant Garamond', Georgia, serif;
  --serif-body:    'Libre Baskerville', Georgia, serif;
  --sans:          'Jost', sans-serif;
}
```

Background: `var(--ink)`. All panels: `var(--slate)`. Labels: `var(--brand-blue)`. Body text: `var(--pale)`. Interactive elements mirror nav/CTA styles from the homepage.

---

### 5.3 Compose UI — General Email

**Layout:** Two-column. Left: inputs. Right: live preview iframe.

**Left Panel Sections:**

**① Subject**
- Single text input. Full width.

**② Recipients**
Three tabs:

- **Manual** — free-text area, one email per line or comma-separated.
- **Name Lookup** — type-ahead search field. Calls `data-handler → contact_lookup`. Shows matched contact name + email. Click to add to recipient list.
- **Tag Select** — multi-select tag picker. Loads all known tags via `data-handler → contact_list`. Shows tags grouped by category (`day`, `slot`, `program`, `status`). On selection, previews count of matching contacts. Confirm to load recipient list.

Selected recipients shown as removable chips below the tabs. Count displayed.

**③ Message Body**
- Rich textarea (plain HTML input, not a WYSIWYG — Scott writes the content, the template handles the chrome).
- Supports `{{FIRST_NAME}}` merge tag — documented inline.

**④ Action Bar**
- `Preview` button — renders final HTML in the right panel iframe.
- `Send` button — confirms recipient count, then calls `mail-sender → send_campaign`.
- `Save Draft` (phase 2).

---

### 5.4 Compose UI — Newsletter

**Layout:** Same two-column structure.

**Left Panel Sections:**

**① Subject**

**② Recipients** — same three-tab component as general email.

**③ Newsletter Sections**

The newsletter template has five fixed sections. Each section has its own input block:

| Section | Inputs |
|---|---|
| **Intro** | Title (text), Tagline/quote (text, italic), Body copy (textarea, ~500 words) |
| **Food for the Body** | Section heading (pre-filled "Food for the BODY"), Subsection title (text), Body copy (textarea), Image upload (optional), CTA label + URL |
| **Food for the Brain** | Same structure as Body |
| **Food for Thought** | Same structure |
| **Food for the Soul** | Same structure |
| **Gym News** *(optional)* | Toggle to include. Free-form content blocks: text fields + image upload. |
| **Local News** *(optional)* | Toggle to include. Same. |

Each section has a collapse/expand toggle to reduce visual noise while composing.

**④ Global Options**
- Reply-to address (default: `scott@crawford-coaching.ca`)
- Unsubscribe link text (default: pre-filled)

**⑤ Action Bar** — same as general email.

---

### 5.5 Archive & Analytics

**`/archive`**
Table of sent campaigns, columns: Date, Subject, Type, Recipients, Opens, Clicks, Unsubscribes. Sortable. Click row → detail view.

**`/archive/[id]`**
- Campaign metadata header.
- Analytics summary: open rate, click rate, unsubscribe count.
- Event timeline (opens and clicks over time — simple chart).
- Full recipient list with per-recipient event indicators.
- "View HTML" — renders the archived HTML body in an iframe.
- "Download HTML" — exports the archived HTML file.

---

## 6. Email Templates (HTML)

Both templates are self-contained HTML files stored in the repo at `templates/`. They use inline CSS only (required for email client compatibility). No external fonts or resources — web-safe font stacks with the brand fonts as preferences.

### 6.1 General Email Template

**Structure:**
```
┌──────────────────────────────────────┐
│  [Crawford Coaching logo — hosted]   │
├──────────────────────────────────────┤
│  Hi {{FIRST_NAME}},                  │
│                                      │
│  {{BODY}}                            │
│                                      │
│  Scott Crawford                      │
│  Crawford Coaching                   │
│  crawford-coaching.ca                │
├──────────────────────────────────────┤
│  [Social icons] | Unsubscribe        │
│  © 2026 Crawford Coaching            │
└──────────────────────────────────────┘
```

**Styling:** Dark background (`#1c2330`), white body text (`#f5f3ef`), brand blue accents (`#2d86c4`), Libre Baskerville body, max-width 600px centered.

**Merge tags available:** `{{FIRST_NAME}}`, `{{UNSUBSCRIBE_URL}}`

---

### 6.2 Newsletter Template

Modelled directly on the March 2026 newsletter. Structure:

```
┌──────────────────────────────────────┐
│  [Header image: logo + Scott photo]  │
│  Lead with Clarity. Live with Purpose│
├──────────────────────────────────────┤
│  {{INTRO_TITLE}}                     │
│  "{{INTRO_TAGLINE}}"                 │
│                                      │
│  Hi {{FIRST_NAME}},                  │
│  {{INTRO_BODY}}                      │
│                                      │
│  [Crawford Coaching Website button]  │
├──────────────────────────────────────┤
│  Food for the BODY                   │
│  [Image left] | {{BODY_TITLE}}       │
│               | {{BODY_COPY}}        │
│               | [{{BODY_CTA}}]       │
├──────────────────────────────────────┤
│  Food for THOUGHT                    │
│  {{THOUGHT_TITLE}}                   │
│  {{THOUGHT_COPY}} | [Image right]    │
│  [{{THOUGHT_CTA}}]                   │
├──────────────────────────────────────┤
│  Food for the BRAIN                  │
│  [Image left] | {{BRAIN_TITLE}}      │
│               | {{BRAIN_COPY}}       │
│  [{{BRAIN_CTA}}]                     │
├──────────────────────────────────────┤
│  Food for the SOUL                   │
│  {{SOUL_TITLE}}                      │
│  {{SOUL_COPY}} | [Image right]       │
│  [{{SOUL_CTA}}]                      │
├──────────────────────────────────────┤
│  GYM NEWS (conditional)              │
│  {{GYM_CONTENT}}                     │
├──────────────────────────────────────┤
│  LOCAL NEWS (conditional)            │
│  {{LOCAL_CONTENT}}                   │
├──────────────────────────────────────┤
│  [Facebook] [Instagram] [LinkedIn]   │
│  [Crawford Coaching logo]            │
│  Unsubscribe | Update Preferences    │
│  © 2026 Crawford Coaching            │
│  544 Gore Rd, Kingston ON K7L 0C3   │
└──────────────────────────────────────┘
```

**Images** are uploaded via the UI and stored in Supabase Storage bucket `mail-assets`. The template references hosted URLs (not embedded base64).

**Conditional sections** (Gym News, Local News) are toggled in the UI. If disabled, the HTML block is omitted entirely from the render.

---

## 7. File & Archive Structure

Sent emails are archived in the Vercel project repo under `archive/`:

```
archive/
  general/
    2026-04-03_subject-slug.html
    2026-04-15_subject-slug.html
  newsletter/
    2026-03-11_a-failed-tactic-not-a-failed-strategy.html
    2026-04-XX_next-issue-title.html
```

Archiving is handled server-side by `mail-sender` writing to Supabase Storage bucket `sent-mail-archive`, organized by type and date. The frontend's `/archive` view reads from the `sent_campaigns` database table for metadata, and fetches the HTML body on demand.

---

## 8. Build Order & Milestones

### Phase 1 — Infrastructure
1. Create Supabase migration `002_mailing_tables.sql` and run it.
2. Create Supabase Storage buckets: `mail-assets` (public), `sent-mail-archive` (private).
3. Build and deploy `mail-tracker` Edge Function.
4. Build and deploy `mail-sender` Edge Function (use `nodemailer` via npm in Deno: `npm:nodemailer`).
5. Test end-to-end: send a test email to `scott@crawford-coaching.ca`, confirm tracking pixel fires, confirm archive row written.

### Phase 2 — Templates
6. Build `templates/general.html` — fully inline-CSS branded template.
7. Build `templates/newsletter.html` — fully inline-CSS branded newsletter template, all merge tags.
8. Test both templates in Mail Tester (mail-tester.com) and across Gmail, Apple Mail, Outlook.

### Phase 3 — Frontend
9. Initialize Next.js 14 app in `/apps/mail-tool`, deploy to Vercel.
10. Build password gate (`/login`).
11. Build recipient selector component (Manual / Name Lookup / Tag Select).
12. Build General Email compose page.
13. Build Newsletter compose page (section-by-section input blocks).
14. Build live preview panel (renders template into iframe via `srcdoc`).
15. Wire send button to `mail-sender`.

### Phase 4 — Archive & Analytics
16. Build `/archive` list view.
17. Build `/archive/[id]` detail + analytics view.
18. Add CSV export for recipient + event data.

---

## 9. Security Notes

- The Vercel app is protected by a password gate. It is not a public tool.
- All calls from the frontend to Supabase Edge Functions use bearer tokens stored in Vercel environment variables — never exposed to the browser directly (all calls go through Next.js API routes).
- The Gmail App Password is stored only as a Supabase secret, never in the repo or Vercel env.
- The `mail-tracker` function is intentionally public (no auth) — it must be reachable by email clients.
- Unsubscribe tokens are `recipient_id` UUIDs — non-guessable, single-use in effect (idempotent inserts).

---

## 10. Key Dependencies

| Package | Purpose |
|---|---|
| `nodemailer` (via `npm:nodemailer`) | SMTP sending inside Deno Edge Function |
| `@supabase/supabase-js` | Database access in Edge Functions |
| `next` 14 | Frontend framework |
| `tailwindcss` | Utility CSS |
| Supabase Storage | Image hosting, archive storage |

---

*This document is the canonical reference for the Crawford Coaching Mailing Tool build. All implementation decisions should refer back to it.*
