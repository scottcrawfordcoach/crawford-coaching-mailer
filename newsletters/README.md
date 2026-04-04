# Newsletter Folder Workflow

Create one subfolder per issue inside `newsletters/`.

Example:

- `newsletters/2026-04-failed-tactic/`
  - `draft.docx`
  - `assets/`
  - `newsletter_content.py` (generated)

## DOCX Draft Format

Use these exact heading lines in the docx (uppercase):

- `SUBJECT`
- `TITLE`
- `OPENING_QUOTE`
- `INTRO`
- `INTRO_ACTIONS`
- `FOOD_BODY`
- `FOOD_BRAIN`
- `FOOD_THOUGHT`
- `FOOD_SOUL`
- `GYM_NEWS`
- `LOCAL_NEWS`

### Section rules

`INTRO`
- Write regular paragraphs.
- Inline links can be written as markdown links: `[link text](https://example.com)`.

`INTRO_ACTIONS`
- Add key/value lines:
  - `share_url: https://...`
  - `subscribe_url: https://...`
  - `full_blog_url: https://...`

`FOOD_*` sections
- Recommended structure:
  - first line = subtitle (or use `subtitle: ...`)
  - remaining lines = body copy
- Optional key/value lines in any order:
  - `image: https://...` or `image: assets/example.jpg`
  - `cta_label: ...`
  - `cta_url: https://...`
- Inline links supported in body using markdown style links.

`GYM_NEWS`
- Add item lines like:
  - `item: Heading :: Body text with [inline link](https://example.com)`
- Optional:
  - `cta_label: ...`
  - `cta_url: https://...`

`LOCAL_NEWS`
- Optional:
  - `subtitle: ...`
- Remaining lines are body.
- Inline links supported using markdown style links.

## Extract command

From repo root:

```bash
python3 tools/extract_newsletter_from_docx.py \
  --edition-dir newsletters/2026-04-failed-tactic
```

This generates:

- `newsletters/2026-04-failed-tactic/newsletter_content.py`

## Send command

```bash
python3 send.py \
  --template newsletter \
  --subject "April Issue" \
  --recipients tag:ACTIVE \
  --content newsletters/2026-04-failed-tactic/newsletter_content.py \
  --dry-run
```

Drop `--dry-run` for live send.
