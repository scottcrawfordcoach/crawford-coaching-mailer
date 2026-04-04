# Crawford Coaching Mailer

Hybrid local workflow: Python CLI for composition/orchestration, Supabase Edge Functions for sending/tracking.

## Legacy Web App Archive

The previous Next.js web app version has been archived (not deleted) at:

- `_archive/legacy-webapp-2026-04-04/`

See the archive manifest for details and restore examples:

- `_archive/legacy-webapp-2026-04-04/ARCHIVE_MANIFEST.md`

## What Is Implemented

- Local CLI entrypoint in `send.py`
- Recipient resolution modes in `recipients.py`:
  - manual emails (`a@b.com,c@d.com`)
  - file mode (`file:path.txt`)
  - newsletter mode (`newsletter`)
  - tag mode (`tag:ACTIVE` or `tag:ACTIVE,SYNERGIZE`)
  - name mode (`name:Scott Crawford`)
- Template rendering in `renderer.py` using `templates/general.html` and `templates/newsletter.html`
- Local archive output in `archive/` via `archiver.py`
- Send execution through existing Supabase mail-sender function in `mailer.py`

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
  --content ./newsletter_content_example.py \
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

List recent campaigns:

```bash
python3 send.py --action campaigns --limit 10 --offset 0
```

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
