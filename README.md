# Crawford Coaching Mailer

Hybrid local workflow: Python CLI for composition/orchestration, Next.js webapp for editing/preview, Supabase Edge Functions for sending/tracking.

## What Is Implemented

**Python CLI pipeline:**
- `send.py` — CLI orchestrator: render → archive → send
- `renderer.py` — template rendering with JSON content, optional AI proofreading (`--proofread` via Anthropic)
- `recipients.py` — recipient resolution (newsletter subscribers, tags, name search, manual, file)
- `mailer.py` — HTTP client to `mail-sender` edge function (passes `edition_slug`)
- `archiver.py` — archives rendered HTML + `content.json` to `archives/{slug}/`

**Webapp (Next.js) — deployed at https://app.crawford-coaching.ca:**
- Split-pane newsletter edition editor with live preview
- Branded email compose + send (`/email`)
- Image upload to Supabase Storage with drag-drop
- Edition listing with send analytics (opens, clicks, unsubs)
- **Test Links** button on both editor pages — checks all hrefs in rendered HTML, reports HTTP status codes
- Share page proxy at `/share/[slug]/[section]` — serves Supabase HTML with correct `Content-Type` (disabled at send time for MVP)
- Asset proxy at `/assets/[...path]` — proxies dynamic Supabase Storage files (newsletter images, audio) through `app.crawford-coaching.ca` to eliminate `supabase.co` URLs from emails
- Static brand assets (`webapp/public/mail-assets/`) served directly at `/mail-assets/...` — logo, header, badges, social icons

**Infrastructure:**
- `supabase/functions/mail-sender/` — send campaigns via Gmail SMTP, per-recipient personalisation, open tracking injection
- `supabase/functions/mail-tracker/` — open pixel, unsubscribe handling *(click redirect removed — caused Gmail phishing flag)*
- `templates/newsletter.html` — single source of truth (396-line v2 template); auto-copied to `webapp/templates/` via `npm run sync-templates`
- `templates/general.html` — branded general-purpose email template (logo, body, signature, badges, social links)

## Webapp Deployment

The webapp is deployed to **https://app.crawford-coaching.ca** via Vercel.

Build must be run from a local ext4 path (not the exFAT Crucial X9 drive — symlinks not supported):

```bash
rm -rf ~/crawford-webapp-build
cp -r webapp ~/crawford-webapp-build
cp templates/newsletter.html ~/crawford-webapp-build/templates/
cp templates/general.html ~/crawford-webapp-build/templates/
bash -i -c "cd ~/crawford-webapp-build && npx next build && npx vercel --prod"
```

Vercel env vars required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MAIL_SENDER_BEARER_TOKEN`, `ANTHROPIC_API_KEY`, `TOOL_PASSWORD`

## Template Sync

`templates/` is the canonical location. The webapp's copies in `webapp/templates/` are auto-synced via `predev` and `prebuild` scripts in `webapp/package.json`. The sync script is graceful — skips silently when `../templates/` isn't present (e.g. on Vercel build servers). Edit only `templates/newsletter.html` — never edit the webapp copy directly.

## Archive

- `archives/{slug}/` — canonical archive directory (rendered HTML + content.json + images)
- `_archive/` — retired artifacts (legacy webapp, old form, stale build resources)

## Required Environment

Create `.env` and set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MAIL_SENDER_BEARER_TOKEN`
- `ANTHROPIC_API_KEY` (optional — `--proofread` only)

Webapp (Vercel env vars): same as above plus `TOOL_PASSWORD`

Optional Python CLI:

- `MAIL_SENDER_URL` (defaults to `${SUPABASE_URL}/functions/v1/mail-sender`)
- `FROM_NAME`

## Install Python Dependencies

```bash
python3 -m pip install -r requirements.txt
```

## Deliverability Notes

- **DMARC** — `v=DMARC1; p=none; rua=mailto:scott@crawford-coaching.ca` set on `_dmarc.crawford-coaching.ca`
- **`supabase.co` URLs eliminated** — static brand assets served from Vercel at `/mail-assets/...`; dynamic newsletter images and `blogcast_url` audio proxied through `/assets/...`; absolute `supabase.co/storage/...` URLs in content JSON are auto-rewritten at render time by both renderers
- **Click tracking removed** — caused Gmail phishing flag; open pixel tracking retained
- **UTM parameters** — added to all `crawford-coaching.ca` links at send time
- **Avoid short URLs** — use `youtube.com/watch?v=...` not `youtu.be/...`; full Amazon URLs not `a.co/...`
- **Social share links** — disabled for MVP; `{{#if *_SHARE_URL}}` blocks won't render when `share_url` is empty

## General Email Template

`templates/general.html` is a standalone branded email template for one-off and direct reply emails. It includes:

- Crawford Coaching header with logo and tagline
- `{{FIRST_NAME}}` greeting and `{{BODY}}` placeholder
- Branded signature block (Scott Crawford / ACC / crawford-coaching.ca)
- Footer with social icons (Facebook, Instagram, LinkedIn) and credential badges (ICF ACC, Dare to Lead, ISSA)
- Copyright line

`renderer.py` → `render_general(body, first_name)` renders the template. Plain text is auto-converted to HTML paragraphs; pre-formatted HTML is passed through unchanged.

For one-off customisations (e.g. greeting changes, removing the unsubscribe block), see `render-jasu-reply.py` as a working reference.

The webapp `/email` page enables quick branded email composition in the browser using the same template.

## Usage

General email dry-run:

```bash
python3 send.py \
  --template general \
  --subject "Quick note" \
  --recipients "test@example.com" \
  --body "Hi there, this is a test." \
  --dry-run
```

General email from file:

```bash
python3 send.py \
  --template general \
  --subject "Quick note" \
  --recipients newsletter \
  --body-file ./message.txt
```

Newsletter dry-run:

```bash
python3 send.py \
  --template newsletter \
  --subject "April Issue" \
  --recipients tag:ACTIVE \
  --content content/15-becoming-a-snacker.json \
  --dry-run
```

Live send:

```bash
python3 send.py \
  --template general \
  --subject "Client update" \
  --recipients "name:Scott" \
  --body-file ./message.txt
```

Standalone render (no send):

```bash
python3 renderer.py content/15-becoming-a-snacker.json
# Output: archives/15-becoming-a-snacker/rendered.html

python3 renderer.py content/15-becoming-a-snacker.json --proofread
# Same, with AI proofreading pass (requires ANTHROPIC_API_KEY)
```

List recent campaigns:

```bash
python3 send.py --action campaigns --limit 10 --offset 0
```

## Webapp (Local Dev)

> **Note:** `npm install` must be run from an ext4 path, not the exFAT Crucial X9 drive.

```bash
rm -rf ~/crawford-webapp-build
cp -r webapp ~/crawford-webapp-build
cd ~/crawford-webapp-build
bash -i -c "npm install && npm run dev"   # http://localhost:3000
```

Requires `.env.local` with `TOOL_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

Get campaign detail:

```bash
python3 send.py --action campaign-detail --campaign-id <campaign_uuid>
```

## Archive Output

- Newsletter renders: `archives/{slug}/rendered.html` + `content.json`
- Sent/test HTML snapshots: `archives/sent/YYYY-MM-DD_subject-slug.html`

## Notes

- `--dry-run` renders and archives without sending.
- Live sends call Supabase `mail-sender` with action `send_campaign`.
- Campaign list/detail call Supabase `mail-sender` actions `get_campaigns` and `get_campaign_detail`.
- Tracking links and open pixel are still injected by the existing mail-sender + mail-tracker functions.

## DOCX Draft Workflow

Optional: author each issue from a DOCX draft.

```bash
python3 tools/extract_newsletter_from_docx.py --edition-dir newsletters/<edition-slug>
```

See `newsletters/README.md` for heading format and section rules.
