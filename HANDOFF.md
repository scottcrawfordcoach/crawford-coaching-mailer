# Crawford Coaching Mailer — Handoff

**Last updated:** April 9, 2026
**Context:** Webapp deployed to app.crawford-coaching.ca. DMARC set. Test Links feature added. Social share generation disabled for MVP. Documentation updated. `TOOL_PASSWORD` still needs to be set in Vercel.

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
| `webapp/app/api/check-links/route.ts` | POST rendered HTML → HEAD-checks all hrefs → returns {url, status, ok, error} per link |
| `webapp/app/share/[slug]/[section]/route.ts` | GET proxy: fetches HTML from Supabase Storage, re-serves as `text/html` (Storage overrides to `text/plain`) |
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

## April 9, 2026 session additions

### Test Links feature
- New `/api/check-links` route: extracts all hrefs from rendered HTML, HEAD-checks each (8 s timeout, max 40), returns status per link. 405 responses retried with GET. LinkedIn 999 treated as `ok: true` with `error: "anti-bot block"`.
- **Test Links** button added to both `/editions/[slug]` and `/email` action bars. Right panel switches from preview to results table on click.
- Committed: `a3b3bb6`

### DMARC
- `v=DMARC1; p=none; rua=mailto:scott@crawford-coaching.ca` added to `_dmarc.crawford-coaching.ca`
- Verified via Google DNS API

### Social share generation disabled for MVP
- `renderer.py`: `_generate_share_pages()` call commented out
- `webapp/app/editions/[slug]/page.tsx`: `needsSharePages` block removed from send handler
- `{{#if *_SHARE_URL}}` blocks naturally suppress "Share it →" links when `share_url` is empty
- Revisit when share pages are stable

---

### ~~Deploy edge function~~ (likely done)
If `mail-sender` hasn't been redeployed since V2 changes:
```bash
supabase functions deploy mail-sender --no-verify-jwt
```

### Set `TOOL_PASSWORD` on Vercel
Webapp login will fail without this. Set in:
https://vercel.com/scott-crawfords-projects-b5b5a730/webapp/settings/environment-variables

After setting, redeploy:
```bash
rm -rf ~/crawford-webapp-build && cp -r webapp ~/crawford-webapp-build
cp templates/newsletter.html ~/crawford-webapp-build/templates/
cp templates/general.html ~/crawford-webapp-build/templates/
bash -i -c "cd ~/crawford-webapp-build && npx vercel --prod"
```

### Short URL replacement in content
Replace `youtu.be/...` and `a.co/...` links with full URLs before sending. Short URLs can trigger spam filters.

### Content images
Before sending, verify every image in content JSON exists at its Supabase Storage URL. Relative `assets/{slug}/{filename}` paths are auto-resolved at render time.

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

---

## ~~ACTIVE TASK: Fix Social Share Page 404s~~ — COMPLETED April 9 2026

### What was done
- `renderer.py` + `webapp/app/api/newsletter/share-pages/route.ts` — share URLs updated to `https://app.crawford-coaching.ca/share/{slug}/{section}`
- `webapp/package.json` — `prebuild`/`predev` `sync-templates` made graceful (skips copy if `../templates/` not found; required for Vercel build env)
- Webapp built on Linux (exFAT drive can't create symlinks; built in `~/crawford-webapp-build/` then deployed)
- Deployed to Vercel at **https://app.crawford-coaching.ca** (domain already on Vercel nameservers, auto-provisioned)
- Env vars set on Vercel: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MAIL_SENDER_BEARER_TOKEN`, `ANTHROPIC_API_KEY`
- Verified: `curl -sI https://app.crawford-coaching.ca/share/15-becoming-a-snacker/body` → **200 text/html** ✓
- Committed and pushed as `3668752`

### Still needs manual action
- **`TOOL_PASSWORD`** — set in Vercel dashboard (webapp login password; currently unset, login will fail)
  - Dashboard: https://vercel.com/scott-crawfords-projects-b5b5a730/webapp/settings/environment-variables
  - After setting, run: `npx vercel --prod` from `~/crawford-webapp-build/`

### Note on already-sent emails
The newsletter already delivered has `crawford-coaching.ca/share/...` URLs
baked in. Those stay broken unless a redirect is added. Future newsletters
will use the correct `app.crawford-coaching.ca` URLs.

---

## Resend deliverability warnings (April 9 2026)

Resend flagged these issues on the issue-15 send. Addressed/not-addressed status:

| Issue | Status | Notes |
|-------|--------|-------|
| Share links pointing to Supabase URL | ✅ Fixed | Now use `app.crawford-coaching.ca` |
| Unsubscribe link on Supabase domain | ⚠️ Low priority | `mail-tracker` edge function — acceptable |
| Images hosted on Supabase (not sending domain) | ⚠️ Design limitation | Would require CDN on `crawford-coaching.ca` |
| Amazon short links (`a.co/...`) in content | ⚠️ Fix in content | Replace with full `amazon.ca/...` URLs in newsletter content JSON |
| YouTube short links (`youtu.be/...`) | ⚠️ Fix in content | Replace with `youtube.com/watch?v=...` in content JSON |
| No DMARC record | ⚠️ DNS action needed | Add `TXT _dmarc.crawford-coaching.ca "v=DMARC1; p=none; rua=mailto:scott@crawford-coaching.ca"` |

---

## Recent changes (April 7–9, 2026)

### Email tracking
- **Open pixel tracking** — works via `mail-tracker` (custom 1×1 GIF)
- **Click tracking** — REMOVED (redirect links caused Gmail to flag as phishing/spam)
- **UTM parameters** — added to all `crawford-coaching.ca` links in sent emails
  - `utm_source` = campaign type (`general` / `newsletter`)
  - `utm_medium` = `email`
  - `utm_campaign` = edition slug or slugified subject
  - Handles both single and double-quoted href attributes
  - Unsubscribe + external links are untouched
- **Resend tracking** — `tracking: { open: true, click: true }` enabled in API call, but Resend webhook delivery to Supabase is not working (deferred)

### Unsubscribe flow
- Email unsubscribe link → `mail-tracker?action=unsubscribe&r={id}` → sets `contacts.newsletter_enabled = false`
- Preference center unsubscribe wrote to `subscription_changes` but did NOT update `contacts` table (bug — manually fixed for `scott.synergize@gmail.com`)

### Commits since last handoff
```
cf03d50 Add UTM parameter tagging to all emails
3875169 Remove click-tracking link rewriting to avoid spam
375065e Fix share pages: proxy HTML through webapp route
b51f075 Re-enable custom open/click tracking via mail-tracker
```
- **Migration 003** (`edition_slug` column on `sent_campaigns`) — already run in Supabase