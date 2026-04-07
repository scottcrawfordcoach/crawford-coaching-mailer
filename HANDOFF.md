# Crawford Coaching Mailer — Handoff

**Last updated:** April 6, 2026
**Context:** Send Email feature implemented. New branded email template deployed, webapp now has a welcome screen with Newsletter/Email workflows, and full email compose + send via browser.

---

## What this project is

A newsletter and email system for Crawford Coaching. Two main parts:

1. **Python CLI pipeline** — renders newsletter HTML from JSON content, sends via Supabase Edge Function + Gmail SMTP, archives output locally
2. **Next.js webapp** — browser-based edition editor with live preview, **plus branded email compose and send**, hosted on Vercel

Content lives in Supabase Storage (`newsletters/{slug}/content.json`). Sending happens locally via `send.py`. Tracking (opens, clicks, unsubscribes) is handled by `mail-tracker` edge function.

---

## Project location

```
E:\crawford-coaching-mailer\
```

---

## Architecture at a glance

```
content.json  →  renderer.py  →  send.py  →  mailer.py  →  mail-sender (Edge Fn)  →  Gmail SMTP
  (Storage)       (templates/)     (CLI)       (HTTP)         (personalise+track)      (delivery)
                                     ↓
                               archives/{slug}/
                               rendered.html + content.json

Webapp:  editions editor  →  /api/preview  →  templates.ts  →  iframe preview
```

---

## Key files (what does what)

### Python pipeline

| File | Role |
|---|---|
| `renderer.py` | Loads content JSON, fills template tokens, resolves conditionals, optional `--proofread` via Anthropic |
| `send.py` | CLI orchestrator: render → archive → send. Derives `edition_slug` from content filename |
| `mailer.py` | HTTP client to `mail-sender` edge function. Sends `edition_slug` in payload |
| `archiver.py` | Writes `archives/{slug}/rendered.html` + `content.json`. General emails go to `archives/sent/` |
| `recipients.py` | Resolves recipients: `newsletter`, `tag:X`, `name:X`, manual emails, `file:path` |
| `config.py` | Loads `.env` settings |

### Templates

| File | Role |
|---|---|
| `templates/newsletter.html` | **Single source of truth** — 396-line v2 template |
| `templates/general.html` | Branded email template — banner header, signature, 4 service mini-cards, badges, social icons |
| `webapp/templates/*` | Auto-copied from `templates/` by `npm run sync-templates` (wired into `predev`/`prebuild`) |

**Rule:** Only edit `templates/newsletter.html`. The webapp copies are auto-synced.

### Webapp (Next.js)

| File | Role |
|---|---|
| `webapp/lib/templates.ts` | TypeScript renderer port — `renderNewsletterPreview()` + `renderEmailPreview()`. Has `_CAPTION_PLAIN` flags matching Python |
| `webapp/app/page.tsx` | Welcome screen — two cards: "Draft Newsletter" → `/editions`, "Send Email" → `/email` |
| `webapp/app/email/page.tsx` | Email compose form: Individual/Group send modes, split-pane preview, send action |
| `webapp/app/editions/[slug]/page.tsx` | Split-pane editor: form left, live preview right |
| `webapp/app/editions/page.tsx` | Edition list with analytics |
| `webapp/app/api/contacts/search/route.ts` | Contact search by name/email (autocomplete) |
| `webapp/app/api/contacts/tags/route.ts` | List tags by category (day/slot/program/status) |
| `webapp/app/api/contacts/resolve/route.ts` | Resolve group recipients by tags + status filter |
| `webapp/app/api/email/preview/route.ts` | Render branded email preview HTML |
| `webapp/app/api/email/send/route.ts` | Send email via mail-sender edge function |
| `webapp/components/ImageUpload.tsx` | Drag-drop image upload to Supabase Storage |
| `webapp/components/PreviewPanel.tsx` | Iframe preview of rendered HTML |
| `webapp/components/Nav.tsx` | Navigation bar — Home, Editions, Email, Sign Out |
| `webapp/package.json` | Has `sync-templates`, `predev`, `prebuild` scripts |

### Edge functions

| File | Role |
|---|---|
| `supabase/functions/mail-sender/index.ts` | Sends campaign: personalises per-recipient, injects tracking, sends via SMTP, persists `edition_slug` |
| `supabase/functions/mail-tracker/index.ts` | Handles open pixels, click redirects, unsubscribe |

---

## V2 changes (completed this session)

All changes from `v2-alignment-instructions.md` have been implemented:

1. **Template replaced** — both locations now have the 396-line v2 template matching `issue-15-reference.html`
2. **`renderer.py`** — added `_CAPTION_PLAIN` flags to `_image_flags()` and `_gym_image_flags()`; added `BODY/THOUGHT/BRAIN/SOUL_CTA_LABEL` flags; added `GYM1/GYM2/LOCAL_IMAGE_CAPTION_PLAIN` flags
3. **`templates.ts`** — matching `_CAPTION_PLAIN` flags added to `imageFlagsForSection()` and gym/local sections
4. **`send.py`** — derives `edition_slug` from content filename, passes to archiver and mailer
5. **`mailer.py`** — `send_campaign()` accepts and sends `edition_slug`
6. **`mail-sender/index.ts`** — `SendCampaignPayload` includes `edition_slug`; persisted in campaign insert
7. **`archiver.py`** — writes `content.json` (not `content.py`); uses `archives/` as canonical path; accepts `edition_slug`
8. **Template sync** — `webapp/package.json` has auto-copy scripts
9. **Stale files cleaned** — `newsletter-form.html` and `_build-resources/` moved to `_archive/`; legacy `content.py` deleted

### Verification

Renderer output was diffed against `test-render-issue15.html`. Only difference: `{{UNSUBSCRIBE_URL}}` left as token (correct — edge function replaces per-recipient) vs `#` in test render. Structural parity confirmed.

---

## Send Email feature (implemented April 6 2026)

### What was built
- **New branded email template** (`templates/general.html`) — banner header image inset, Georgia serif body, signature block, 4 service mini-cards (WHOLE, Coaching, Synergize, Growth Zone), social icons, credential badges, copyright footer
- **Webapp welcome screen** (`/`) — two cards: "Draft Newsletter" → `/editions`, "Send Email" → `/email`
- **Email compose page** (`/email`) — split-pane with form (left) and live preview (right)
  - **Individual mode** — search contacts by name/email, select one or more
  - **Group mode** — pick tag category → select tags (intersection logic) → optional status filter → shows matched count
  - Subject line + message textarea (plain text → auto-paragraphed)
  - Preview button renders in iframe; Send button calls mail-sender edge function
- **5 API routes** — `/api/contacts/search`, `/api/contacts/tags`, `/api/contacts/resolve`, `/api/email/preview`, `/api/email/send`
- **`renderEmailPreview()`** added to `webapp/lib/templates.ts`
- Navigation updated with Home, Editions, Email links

### Webapp env vars for email send
The webapp needs `MAIL_SENDER_BEARER_TOKEN` in Vercel env vars (and optionally `MAIL_SENDER_URL`) for the Send Email feature to work in production.

---

## What still needs doing

### Deploy edge function
```bash
supabase functions deploy mail-sender --no-verify-jwt
```
The local code has the `edition_slug` changes. This must be deployed before the next newsletter send.

### Vercel env vars
Ensure `MAIL_SENDER_BEARER_TOKEN` is set in Vercel project settings for the Send Email feature.

### Old `archive/` directory
`archive/newsletters/` contains one pre-V2 legacy send. Can be moved to `_archive/` or deleted.

### Content images
Before any newsletter send, verify every image in the content JSON exists at its resolved Supabase Storage URL. Relative paths like `assets/{slug}/{filename}` are auto-resolved to Supabase public URLs by both renderers, but only work if images have been uploaded.

---

## Quick reference commands

```bash
# Standalone render (no send)
python renderer.py content/15-becoming-a-snacker.json

# Render with proofreading
python renderer.py content/15-becoming-a-snacker.json --proofread

# Dry-run send
python send.py --template newsletter --subject "Subject" --recipients newsletter --content content/15-becoming-a-snacker.json --dry-run

# List campaigns
python send.py --action campaigns --limit 10

# Webapp dev
cd webapp && npm run dev

# Sync templates manually (also runs automatically on dev/build)
cd webapp && npm run sync-templates
```

---

## Environment variables

| Variable | Used by | Notes |
|---|---|---|
| `SUPABASE_URL` | Python + webapp | All Supabase operations |
| `SUPABASE_SERVICE_ROLE_KEY` | Python + webapp | Storage + DB access |
| `MAIL_SENDER_BEARER_TOKEN` | `mailer.py` | Auth for edge function |
| `ANTHROPIC_API_KEY` | `renderer.py` | `--proofread` only |
| `TOOL_PASSWORD` | Webapp | Login passcode |
| `MAIL_SENDER_BEARER_TOKEN` | Webapp + `mailer.py` | Auth for edge function (needed for webapp Send Email) |
| `MAIL_SENDER_URL` | Webapp + `config.py` | Optional override; defaults to `{SUPABASE_URL}/functions/v1/mail-sender` |

Python reads from `.env`. Webapp reads from `.env.local` (local) or Vercel env vars (production).

---

## Design decisions to preserve

- **`config.resolve.symlinks = false`** in `next.config.mjs` — required for `[slug]` dynamic routes
- **`{{UNSUBSCRIBE_URL}}`** left as literal token by renderer — edge function replaces per-recipient at send time
- **Slug format:** `{number}-{kebab-title}` e.g. `15-becoming-a-snacker`
- **No Supabase Auth** — shared passcode via `TOOL_PASSWORD`, 7-day cookie
- **Python renderer is the send-time renderer for newsletters** — webapp can also send general emails directly via its own `/api/email/send` route
- **Migration 003** (`edition_slug` column on `sent_campaigns`) — already run in Supabase