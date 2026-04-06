# Crawford Coaching Mailer — Project Summary

*Generated: April 6, 2026. Updated after V2 alignment implementation.*

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
- Rewrites all `href` links through the `mail-tracker` click URL
- Injects the open-tracking pixel `<img>`
- Inserts rows into `sent_campaigns`, `campaign_recipients`

---

## Stage 7 — Tracking

| File | Role |
|---|---|
| `supabase/functions/mail-tracker/index.ts` | Handles open pixel (`?action=open`), click redirects (`?action=click`), unsubscribe confirmation (`?action=unsubscribe`) → writes to `campaign_events` |

---

## Template Files

| Path | Lines | Status | Notes |
|---|---|---|---|
| `templates/newsletter.html` | 396 | ✅ Active | Single source of truth — read by `renderer.py` at send time |
| `webapp/templates/newsletter.html` | 396 | ✅ Auto-synced | Copied from `templates/` by `npm run sync-templates` (runs on `predev`/`prebuild`) |
| `templates/general.html` | — | ✅ Active | Plain/general email template |
| `webapp/templates/general.html` | — | ✅ Auto-synced | Copied from `templates/` by sync script |

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

---

## Required Environment Variables (`.env`)

| Variable | Used by | Required for |
|---|---|---|
| `SUPABASE_URL` | `config.py`, `renderer.py`, `webapp` | All Supabase operations; image URL resolution |
| `SUPABASE_SERVICE_ROLE_KEY` | `config.py`, `webapp` | Supabase Storage and DB queries |
| `MAIL_SENDER_BEARER_TOKEN` | `mailer.py` | Authenticating calls to `mail-sender` edge function |
| `ANTHROPIC_API_KEY` | `renderer.py` | `--proofread` flag only |
| `TOOL_PASSWORD` | `webapp/lib/auth.ts` | Webapp login |
| `MAIL_SENDER_URL` | `config.py` | Optional override; defaults to `{SUPABASE_URL}/functions/v1/mail-sender` |

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

## Remaining Items

### 1. Old `archive/` directory
The pre-V2 `archive/newsletters/2026-04-04_april-edition-1-2026-newsletter-becoming-a-snacker/` directory is a one-off legacy send archive. Can be moved to `_archive/` or deleted once confirmed no longer needed.

### 2. Content images in Supabase Storage
Content JSON files may reference relative image paths (`assets/{slug}/{filename}`). These resolve to Supabase public URLs at render time, but only work if images have been uploaded. Verify before sending.

### 3. Edge function redeployment
The `mail-sender` edge function has been updated locally to accept `edition_slug`. Run `supabase functions deploy mail-sender --no-verify-jwt` to deploy the change.
