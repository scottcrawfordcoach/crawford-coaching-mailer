# Crawford Coaching Mailer — Project Summary

*Generated: April 6, 2026. Updated: April 9, 2026 — webapp deployment, Test Links feature, DMARC, social share disabled.*

---

## Pipeline Overview

```
AUTHORING          PREVIEW           CLI RENDER        SEND              TRACKING
─────────          ───────           ──────────        ────              ────────
Webapp editor  →   /api/preview  →   renderer.py   →   send.py       →   mail-tracker
  (Next.js)          (iframe)          (Python)          │                 (Edge Fn)
     │                                    │              ↓
     │                              archives/         mail-sender
     ↓                                                (Edge Fn)
Supabase Storage                                          │
  content.json                                           ↓
  images/                                           Gmail SMTP

Webapp Email:  /email form  →  /api/email/preview  →  renderEmailPreview()  →  iframe
                                       │
                              /api/email/send  →  mail-sender (Edge Fn)  →  Gmail SMTP
```

---

## Stage 1 — Content Authoring

### Active path: Webapp Editor

| File | Role |
|---|---|
| `webapp/app/editions/[slug]/page.tsx` | Full split-pane content editor with live preview iframe |
| `webapp/app/api/editions/[slug]/route.ts` | GET (load content.json from Supabase Storage) / PUT (save back) |
| `webapp/app/api/editions/route.ts` | GET (list all edition slugs) / POST (create new edition folder) |
| `webapp/components/NewEditionModal.tsx` | Modal to create a new edition — auto-generates `{number}-{kebab-title}` slug |
| `webapp/app/editions/page.tsx` | Edition list dashboard with most-recent-send analytics |

Content is stored in Supabase Storage at `newsletters/{slug}/content.json`.

### Superseded path: Standalone Form

| File | Role |
|---|---|
| `newsletter-form.html` | Legacy HTML form that exported JSON to clipboard for manual editing |

This is now superseded by the webapp editor. Field names match the current JSON schema so it remains technically functional, but it is not integrated into any active workflow.

---

## Stage 2 — Image Upload & Storage

| File | Role |
|---|---|
| `webapp/components/ImageUpload.tsx` | Drag-drop file upload component; fills image field on upload |
| `webapp/app/api/assets/route.ts` | POST multipart → uploads to Supabase Storage `newsletters/{slug}/images/` → returns public URL |

**Image path resolution** — relative paths like `assets/{slug}/{filename}` are converted to full Supabase URLs at render time by both renderers:

- **Python:** `_resolve_image()` in `renderer.py`
- **TypeScript:** `resolveImageSrc()` in `webapp/lib/templates.ts`

Pattern: `assets/{slug}/{filename}` → `{SUPABASE_URL}/storage/v1/object/public/newsletters/{slug}/images/{filename}`

Absolute `https://` URLs are passed through unchanged.

---

## Stage 3 — Preview (Webapp)

| File | Role |
|---|---|
| `webapp/app/api/preview/route.ts` | POST `{ vars: NewsletterContent }` → returns rendered HTML string |
| `webapp/lib/templates.ts` | TypeScript renderer: `renderNewsletterPreview()` — fills tokens, resolves conditionals, resolves image paths |
| `webapp/templates/newsletter.html` | Template loaded by the webapp at runtime via `fs.readFileSync(process.cwd(), "templates", ...)` |
| `webapp/components/PreviewPanel.tsx` | Renders returned HTML in `<iframe srcDoc={html}>` with loading overlay |

The preview is the canonical reference for what the final email should look like.

### Test Links

| File | Role |
|---|---|
| `webapp/app/api/check-links/route.ts` | POST `{ html }` → extracts all hrefs, HEAD-checks each (8 s timeout, max 40), returns `{url, status, ok, error}` array |

Both the edition editor (`/editions/[slug]`) and email compose page (`/email`) have a **Test Links** button in the action bar. On click, the current rendered HTML is sent to `/api/check-links`, and the right panel switches from the live preview to a results table showing status codes for every link. 405 responses are retried with GET. LinkedIn 999 responses are flagged as `ok` with annotation `"anti-bot block"`.

---

## Stage 4 — CLI Render (Local Preview / Final Draft)

```bash
python renderer.py content/{slug}.json
python renderer.py content/{slug}.json --proofread
python renderer.py content/{slug}.json --name "Sarah"
```

| File | Role |
|---|---|
| `renderer.py` | Loads content JSON/PY, fills `{{TOKENS}}`, resolves conditionals, resolves image paths, optionally proofreads via Anthropic API |
| `templates/newsletter.html` | Template read by `renderer.py` |
| `archives/{slug}/rendered.html` | Output of standalone render |
| `archives/{slug}/images/` | Copies of any local images referenced in the content |

### Proofreading

The `--proofread` flag calls `claude-sonnet-4` via the Anthropic API. Only proofreads plain-text fields (subtitle lines). Skips fields that contain HTML. Requires `ANTHROPIC_API_KEY` in `.env`.

### Content loading

`renderer.py` supports both formats:
- **JSON** (`content/*.json`) — current schema
- **Python** (`newsletters/{slug}/content.py`) — legacy format; `_load_python_content()` re-maps old keys to the current schema

---

## Stage 5 — Send

```bash
python send.py \
  --template newsletter \
  --subject "Subject line here" \
  --recipients newsletter \
  --content content/{slug}.json \
  [--dry-run]
```

| File | Role |
|---|---|
| `send.py` | CLI orchestrator: parses args, calls render → archive → send |
| `renderer.py` | Renders HTML (same as Stage 4) |
| `archiver.py` | Archives send output to `archives/{slug}/rendered.html` + `content.json` |
| `recipients.py` | Resolves recipient list: Supabase contacts query, tag filter, name search, manual list, or CSV file |
| `mailer.py` | HTTP client: POSTs to `mail-sender` edge function |
| `config.py` + `.env` | Loads environment / credentials |

### Recipient resolution modes (`--recipients`)

| Mode | Syntax | Behaviour |
|---|---|---|
| All newsletter subscribers | `newsletter` | Queries `contacts` where `newsletter_enabled=true` AND `contact_status=active` |
| By tag | `tag:ACTIVE` | Joins `contact_tags` |
| By name | `name:Scott` | Fuzzy name search on contacts |
| Manual emails | `a@b.com,c@d.com` | Parsed inline |
| From file | `file:path.txt` | Reads email addresses from file |

### What `send.py` passes to the edge function

`edition_slug` is derived from the content filename (e.g. `15-becoming-a-snacker`) and included in the edge function payload. The `sent_campaigns` row will have `edition_slug` populated for newsletter sends, linking the campaign to its Supabase Storage folder for webapp analytics.

---

## Stage 6 — Mail Sender Edge Function

| File | Role |
|---|---|
| `supabase/functions/mail-sender/index.ts` | Receives campaign payload; personalises HTML per recipient; sends via Gmail SMTP; records to DB |

**Per-recipient tokens injected here (NOT by renderer.py):**

| Token | Value |
|---|---|
| `{{FIRST_NAME}}` | Recipient first name |
| `{{UNSUBSCRIBE_URL}}` | Unique unsubscribe link via `mail-tracker` |
| `{{CURRENT_YEAR}}` | Current year |

The edge function also:
- ~~Rewrites `href` links through `mail-tracker` click URL~~ — **removed** (caused Gmail phishing flag)
- Injects the open-tracking pixel `<img>`
- Inserts UTM parameters (`utm_source`, `utm_medium`, `utm_campaign`) on all `crawford-coaching.ca` links
- Inserts rows into `sent_campaigns`, `campaign_recipients`

---

## Stage 7 — Tracking

| File | Role |
|---|---|
| `supabase/functions/mail-tracker/index.ts` | Handles open pixel (`?action=open`), unsubscribe confirmation (`?action=unsubscribe`) → writes to `campaign_events`. ~~Click redirect~~ removed (caused Gmail phishing flag). |

---

## Template Files

| Path | Lines | Status | Notes |
|---|---|---|---|
| `templates/newsletter.html` | 396 | ✅ Active | Single source of truth — read by `renderer.py` at send time |
| `webapp/templates/newsletter.html` | 396 | ✅ Auto-synced | Copied from `templates/` by `npm run sync-templates` (runs on `predev`/`prebuild`) |
| `templates/general.html` | ~170 | ✅ Active | Branded general-purpose email template (header, body, signature, social icons, credential badges). Used for one-off and direct-reply emails. |
| `webapp/templates/general.html` | ~170 | ✅ Auto-synced | Copied from `templates/` by sync script |

> **Template sync:** `webapp/package.json` has `predev` and `prebuild` scripts that copy from `templates/` before every `npm run dev` and `npm run build`. Edit only the root `templates/` copies.

---

## Content Schema

Canonical definition: `NewsletterContent` interface in `webapp/lib/templates.ts`.

```
{
  edition_label, subject,
  intro_title, intro_tagline, intro_body,
  full_blog_url, blogcast_url, subscribe_url,

  food_body:    { subtitle, copy, image, image_alt, image_caption,
                  image_url, image_layout, cta_label, cta_url, share_url },
  food_thought: (same as food_body),
  food_brain:   (same as food_body),
  food_soul:    (same as food_body),

  gym_news: {
    enabled, closure_dates, calendar_url,
    story1: { heading, copy, image, image_alt, image_caption, image_url, cta_label, cta_url },
    story2_enabled,
    story2: (same as story1)
  },

  local_news: {
    enabled, subtitle, copy,
    image, image_alt, image_caption, image_url,
    cta_label, cta_url
  }
}
```

---

## Template Token Reference

### Scalar tokens (filled by renderer / webapp)

| Token | Source |
|---|---|
| `{{EDITION_LABEL}}` | `edition_label` |
| `{{INTRO_TITLE}}` | `intro_title` |
| `{{INTRO_TAGLINE}}` | `intro_tagline` |
| `{{INTRO_BODY}}` | `intro_body` (HTML or plain text) |
| `{{FULL_BLOG_URL}}`, `{{BLOGCAST_URL}}`, `{{SUBSCRIBE_URL}}` | Top-level fields |
| `{{BODY_SUBTITLE}}`, `{{BODY_COPY}}`, `{{BODY_IMAGE}}`, `{{BODY_IMAGE_ALT}}`, `{{BODY_IMAGE_CAPTION}}`, `{{BODY_IMAGE_URL}}`, `{{BODY_CTA_LABEL}}`, `{{BODY_CTA_URL}}` | `food_body.*` |
| Same pattern for `THOUGHT_`, `BRAIN_`, `SOUL_` | `food_thought.*`, `food_brain.*`, `food_soul.*` |
| `{{GYM_CLOSURE_DATES}}`, `{{GYM_CALENDAR_URL}}`, `{{GYM1_HEADING}}`, `{{GYM1_COPY}}`, `{{GYM1_IMAGE}}`, etc. | `gym_news.*` |
| `{{LOCAL_SUBTITLE}}`, `{{LOCAL_COPY}}`, `{{LOCAL_IMAGE}}`, `{{LOCAL_CTA_LABEL}}`, etc. | `local_news.*` |

### Tokens injected at send time by edge function (NOT pre-rendered)

| Token | Injected by |
|---|---|
| `{{FIRST_NAME}}` | `mail-sender/index.ts` `personaliseHtml()` |
| `{{UNSUBSCRIBE_URL}}` | Same |
| `{{CURRENT_YEAR}}` | Same |

### Conditional flags

| Flag | Meaning |
|---|---|
| `{{#if BODY_IMAGE}}` | Food section has an image |
| `{{#if BODY_IMAGE_URL}}` | Image is wrapped in a link |
| `{{#if BODY_IMAGE_CAPTION}}` | Caption text is non-empty |
| `{{#if BODY_IMAGE_CAPTION_PLAIN}}` | Caption exists but no image_url — renders as plain `<span>` |
| Same `_CAPTION_PLAIN` for `THOUGHT_`, `BRAIN_`, `SOUL_`, `GYM1_`, `GYM2_`, `LOCAL_` | Smart caption: link with arrow when URL set, plain text when not |
| `{{#if GYM_ENABLED}}` | Gym news block is shown |
| `{{#if GYM2_ENABLED}}` | Second gym story is shown |
| `{{#if GYM_CALENDAR_URL}}` | Gym calendar link is shown |
| `{{#if LOCAL_ENABLED}}` | Local news block is shown |
| `{{#if LOCAL_CTA_LABEL}}` | Local news CTA button shown |
| `{{#if *_CTA_LABEL}}` | CTA button shown for any section |
| `{{#if *_SHARE_URL}}` | "Share it →" link shown for a section — suppressed when `share_url` is empty (disabled for MVP) |

---

## Database Schema

**Migration 001 — CRM (`contacts`):**
- `id` uuid PK, `email` unique, `first_name`, `last_name`, `contact_status` (active / previous_client / lead / inactive)
- `newsletter_enabled` bool, `newsletter_status` (subscribed / unsubscribed / cleaned)
- Billing fields, `billing_payer_id` (household grouping), `auth_user_id` (reserved)

**Migration 002 — Mailing tables:**
- `sent_campaigns` — `id`, `campaign_type` (general/newsletter), `subject`, `html_body`, `recipient_count`, `status` (draft/sending/sent/failed), `sent_at`
- `campaign_recipients` — `campaign_id` → `sent_campaigns`, `contact_id` → `contacts`, `email`, `status` (sent/bounced/unsubscribed)
- `campaign_events` — `campaign_id`, `recipient_id`, `event_type` (open/click/unsubscribe), `url`, `ip`, `user_agent`

**Migration 003 — Edition slug:**
- Adds `edition_slug text nullable` to `sent_campaigns` — links a send to its Supabase Storage folder

**Migration 004 — Resend event types:**
- Widens `campaign_events.event_type` CHECK constraint to include `delivered`, `bounced`, `complained` (for Resend webhook compatibility; existing `open`, `click`, `unsubscribe` preserved)
- Adds `resend_email_id text` to `campaign_recipients` for webhook cross-referencing

---

## Required Environment Variables (`.env`)

| Variable | Used by | Required for |
|---|---|---|
| `SUPABASE_URL` | `config.py`, `renderer.py`, `webapp` | All Supabase operations; image URL resolution |
| `SUPABASE_SERVICE_ROLE_KEY` | `config.py`, `webapp` | Supabase Storage and DB queries |
| `MAIL_SENDER_BEARER_TOKEN` | `mailer.py`, webapp | Authenticating calls to `mail-sender` edge function (Python CLI + webapp Send Email) |
| `ANTHROPIC_API_KEY` | `renderer.py` | `--proofread` flag only |
| `TOOL_PASSWORD` | `webapp/lib/auth.ts` | Webapp login |
| `MAIL_SENDER_URL` | `config.py`, webapp | Optional override; defaults to `{SUPABASE_URL}/functions/v1/mail-sender` |

---

## General Email Template

`templates/general.html` provides a branded email layout for one-off and direct-reply emails, distinct from the full newsletter template.

**Structure:** Crawford Coaching banner header (inset image) → greeting (`Hello {{FIRST_NAME}},`) → `{{BODY}}` content → branded signature (Scott Crawford ACC / Certified Coach and Personal Trainer) → 4 service mini-cards (WHOLE, Coaching, Synergize, Growth Zone) → social icons (Facebook, Instagram, LinkedIn) → credential badges (ICF ACC, Dare to Lead, ISSA) → copyright + address.

**Rendering:** `renderer.py` → `render_general(body, first_name)` fills placeholders. `webapp/lib/templates.ts` → `renderEmailPreview(firstName, body)` does the same in TypeScript. Plain text is auto-converted to `<p>` tags with `<br>` for single newlines. HTML content is passed through unchanged.

**One-off customisation pattern:** `render-jasu-reply.py` demonstrates how to render a general email with custom tweaks (greeting style change, unsubscribe removal, icon URL remapping). This can be adapted for future one-off sends.

**Mail assets:** Social icons use `-dark` suffix filenames in Supabase Storage (`icon-facebook-dark.png`, `icon-instagram-dark.png`, `icon-linkedin-dark.png`). Badges and logo use their standard names.

---

## Webapp — Send Email Feature

The webapp includes a full browser-based email compose and send workflow alongside the newsletter editor.

### Welcome screen (`/`)

Two cards: "Draft Newsletter" → `/editions`, "Send Email" → `/email`. Navigation bar has Home, Editions, Email, Sign Out links.

### Email compose page (`/email`)

Split-pane layout with resizable divider (same pattern as the edition editor):

- **Left panel:** Form with send mode toggle (Individual/Group), recipient selection, subject, message textarea
- **Right panel:** Live iframe preview via `renderEmailPreview()`

### Send modes

**Individual mode:**
- Autocomplete search against `contacts` table by name or email
- Select one or more recipients as chips
- API: `GET /api/contacts/search?q=query`

**Group mode:**
- Pick a tag category (`day`, `slot`, `program`, `status`) — hardcoded from `contact_tags.category` CHECK constraint
- Multi-select tags within that category — API: `GET /api/contacts/tags?category=X`
- Optional contact status filter (`active`, `previous_client`, `lead`, `inactive`, or All)
- Intersection logic: contact must match ALL selected tags
- Shows matched recipient count — API: `GET /api/contacts/resolve?tags=X&tags=Y&status=Z`

### Preview and send

- **Preview:** `POST /api/email/preview` → calls `renderEmailPreview()` → returns HTML for iframe
- **Send:** `POST /api/email/send` → renders HTML with `{{FIRST_NAME}}` token → calls `mail-sender` edge function → per-recipient personalisation and tracking
- Confirmation dialog before send; success/error feedback inline

### API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/contacts/search` | GET | Search contacts by name/email |
| `/api/contacts/tags` | GET | List distinct tags for a category |
| `/api/contacts/resolve` | GET | Resolve recipients by tag intersection + status |
| `/api/email/preview` | POST | Render branded email preview HTML |
| `/api/email/send` | POST | Send email via mail-sender edge function |
| `/api/check-links` | POST | Check all hrefs in rendered HTML, return HTTP status per link |
| `/share/[slug]/[section]` | GET | Proxy: fetch Supabase Storage HTML, re-serve as `text/html` (workaround for Storage `text/plain` override) |

---

## Webapp Deployment

The webapp is deployed to **https://app.crawford-coaching.ca** via Vercel.

- **Vercel project:** `scott-crawfords-projects-b5b5a730/webapp`
- **DNS:** `app` CNAME on `crawford-coaching.ca` → Vercel; auto-provisioned TLS
- **Build constraint:** `npm install` must run from an ext4 path (exFAT Crucial X9 doesn't support symlinks). Copy webapp to `~/crawford-webapp-build/` before every build/deploy.
- **`sync-templates` prebuild:** Made graceful with shell conditional guards — skips silently on Vercel build servers where `../templates/` doesn't exist.
- **Vercel env vars:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MAIL_SENDER_BEARER_TOKEN`, `ANTHROPIC_API_KEY`, `TOOL_PASSWORD`

---

## Resolved Misalignments (V2 Update)

The following issues were identified pre-V2 and have been resolved:

1. **Template sync** — `webapp/package.json` now has `sync-templates`/`predev`/`prebuild` scripts that auto-copy from `templates/` before dev and build.
2. **Archive consolidation** — `archiver.py` now writes to `archives/{slug}/` (same as `renderer.py`) with `content.json` instead of legacy `content.py`. The old `archive/newsletters/` directory contains one pre-V2 send and can be cleaned up.
3. **`edition_slug` passed in CLI send** — `send.py` derives slug from content filename, passes through `mailer.py` to the edge function, which persists it in `sent_campaigns`.
4. **Dual content files** — `newsletters/15-becoming-a-snacker/content.py` removed. `content/15-becoming-a-snacker.json` is the sole source.
5. **`newsletter-form.html` superseded** — moved to `_archive/`.
6. **`_build-resources/` stale** — moved to `_archive/`.
7. **Template v2** — both templates replaced with 396-line compact version matching the reference design. Adds smart caption links (`_CAPTION_PLAIN` flags), corrected typography/spacing, restructured Gym News and Local News sections.
8. **DMARC** — `v=DMARC1; p=none; rua=mailto:scott@crawford-coaching.ca` added to DNS; verified via Google DNS API.
9. **Click tracking removed** — `mail-tracker` click redirect caused Gmail phishing flag; removed from edge function. Open pixel tracking retained.
10. **Social share disabled for MVP** — `renderer.py` `_generate_share_pages()` call commented out; `needsSharePages` block removed from webapp send handler. `{{#if *_SHARE_URL}}` blocks naturally suppress share links when `share_url` is empty. Revisit when share links are stable.
11. **Test Links feature** — `/api/check-links` route + button on both editor pages; 405→GET retry; LinkedIn 999 treated as ok.

## Remaining Items

### 1. Old `archive/` directory
The pre-V2 `archive/newsletters/2026-04-04_april-edition-1-2026-newsletter-becoming-a-snacker/` directory is a one-off legacy send archive. Can be moved to `_archive/` or deleted once confirmed no longer needed.

### 2. Content images in Supabase Storage
Content JSON files may reference relative image paths (`assets/{slug}/{filename}`). These resolve to Supabase public URLs at render time, but only work if images have been uploaded. Verify before sending.

### 3. Edge function redeployment
The `mail-sender` edge function has been updated locally to accept `edition_slug`. Run `supabase functions deploy mail-sender --no-verify-jwt` to deploy the change.

### 4. Short URL replacement in content
Replace `youtu.be/...` and `a.co/...` links in content JSON with full URLs before sending — Gmail and other clients may flag shortened URLs as suspicious.

### 5. `TOOL_PASSWORD` on Vercel
Confirm `TOOL_PASSWORD` is set in Vercel env vars (required for webapp login gate).
