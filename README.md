# Crawford Coaching Mailer

Hybrid local workflow: Python CLI for composition/orchestration, Next.js webapp for editing/preview, Supabase Edge Functions for sending/tracking.

## What Is Implemented

**Python CLI pipeline:**
- `send.py` — CLI orchestrator: render → archive → send
- `renderer.py` — template rendering with JSON content, optional AI proofreading (`--proofread` via Anthropic)
- `recipients.py` — recipient resolution (newsletter subscribers, tags, name search, manual, file)
- `mailer.py` — HTTP client to `mail-sender` edge function (passes `edition_slug`)
- `archiver.py` — archives rendered HTML + `content.json` to `archives/{slug}/`

**Webapp (Next.js):**
- Split-pane edition editor with live preview at `webapp/`
- Content stored in Supabase Storage as `newsletters/{slug}/content.json`
- Image upload to Supabase Storage with drag-drop
- Edition listing with send analytics (opens, clicks, unsubs)

**Infrastructure:**
- `supabase/functions/mail-sender/` — send campaigns via Gmail SMTP, per-recipient personalisation, click/open tracking injection
- `supabase/functions/mail-tracker/` — open pixel, click redirect, unsubscribe handling
- `templates/newsletter.html` — single source of truth (396-line v2 template); auto-copied to `webapp/templates/` via `npm run sync-templates`
- `templates/general.html` — branded general-purpose email template (logo, body, signature, badges, social links)

## Template Sync

`templates/` is the canonical location. The webapp's copies in `webapp/templates/` are auto-synced via `predev` and `prebuild` scripts in `webapp/package.json`. Edit only `templates/newsletter.html` — never edit the webapp copy directly.

## Archive

- `archives/{slug}/` — canonical archive directory (rendered HTML + content.json + images)
- `_archive/` — retired artifacts (legacy webapp, old form, stale build resources)

## Required Environment

Create `.env` from `.env.example` and set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MAIL_SENDER_BEARER_TOKEN`

Optional:

- `MAIL_SENDER_URL` (defaults to `${SUPABASE_URL}/functions/v1/mail-sender`)
- `FROM_NAME`

## Install Python Dependency

The CLI requires `supabase`:

```bash
python3 -m pip install -r requirements.txt
```

If `pip` is missing on Linux, install it first using your package manager, then run the command above.

## General Email Template

`templates/general.html` is a standalone branded email template for one-off and direct reply emails. It includes:

- Crawford Coaching header with logo and tagline
- `{{FIRST_NAME}}` greeting and `{{BODY}}` placeholder
- Branded signature block (Scott Crawford / ACC / crawford-coaching.ca)
- Footer with social icons (Facebook, Instagram, LinkedIn) and credential badges (ICF ACC, Dare to Lead, ISSA)
- Copyright line

`renderer.py` → `render_general(body, first_name)` renders the template. Plain text is auto-converted to HTML paragraphs; pre-formatted HTML is passed through unchanged.

For one-off customisations (e.g. greeting changes, removing the unsubscribe block), see `render-jasu-reply.py` as a working reference.

**Planned:** The webapp welcome screen will offer a choice between EMAIL and NEWSLETTER, enabling quick branded email composition in the browser using the same template.

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

## Webapp

```bash
cd webapp
npm install
npm run dev    # http://localhost:3000
```

Requires `.env.local` with `TOOL_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

Get campaign detail:

```bash
python3 send.py --action campaign-detail --campaign-id <campaign_uuid>
```

## Archive Output

- General sends/dry-runs: `archive/sent/YYYY-MM-DD_subject-slug.html`
- Newsletter sends/dry-runs: `archive/newsletters/YYYY-MM-DD_subject-slug/`
  - `rendered.html`
  - `content.py`

## Notes

- `--dry-run` renders and archives without sending.
- Live sends call Supabase `mail-sender` with action `send_campaign`.
- Campaign list/detail call Supabase `mail-sender` actions `get_campaigns` and `get_campaign_detail`.
- Tracking links and open pixel are still injected by the existing mail-sender + mail-tracker functions.

## DOCX Draft Workflow

You can author each issue from a DOCX draft and generate a run-ready Python content file.

Structure:

- `newsletters/<edition-slug>/draft.docx`
- `newsletters/<edition-slug>/assets/` (optional)
- `newsletters/<edition-slug>/newsletter_content.py` (generated)

Generate content file:

```bash
python3 tools/extract_newsletter_from_docx.py --edition-dir newsletters/<edition-slug>
```

Then run as normal:

```bash
python3 send.py \
  --template newsletter \
  --subject "Issue Subject" \
  --recipients tag:ACTIVE \
  --content newsletters/<edition-slug>/newsletter_content.py \
  --dry-run
```

See detailed heading format and section rules in `newsletters/README.md`.
