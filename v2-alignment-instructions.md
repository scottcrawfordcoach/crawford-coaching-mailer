# Crawford Coaching Mailer — V2 Alignment Update

**Purpose:** This document is a comprehensive instruction set for implementing all
template, renderer, and pipeline updates to bring the Crawford Coaching newsletter
system into full alignment. The canonical design reference is `issue-15-reference.html`
— a hand-polished final output that the author was satisfied with.

Every change in this document has been validated against that reference. The test
render produced from the new template + issue 15 content JSON achieved structural
parity with the reference across all markers (section counts, class usage, image
patterns, colour values, structural elements).

---

## Summary of changes

1. **Replace the newsletter HTML template** — new version matches the reference design
2. **Update `renderer.py`** — add missing flags, new `_CAPTION_PLAIN` flags, fix styling
3. **Update `templates.ts`** — add `_CAPTION_PLAIN` flags, match renderer parity
4. **Update `send.py`** — pass `edition_slug` to edge function
5. **Update `mailer.py`** — include `edition_slug` in payload
6. **Update `mail-sender/index.ts`** — accept and persist `edition_slug`
7. **Update `archiver.py`** — write JSON instead of legacy `content.py`
8. **Consolidate archive directories** — single canonical path
9. **Clean up stale files**
10. **Enforce template sync** — symlink or build step

---

## 1. Replace the newsletter HTML template

Replace **both** template files with identical content. The new template is based
directly on `issue-15-reference.html` with template tokens re-inserted.

**Files to replace:**
- `templates/newsletter.html`
- `webapp/templates/newsletter.html`

**Source:** The complete new template is provided below in Appendix A. Copy it
verbatim into both locations.

### Key design changes from the old template

These are the specific differences between the old template and the new one. Every
change is intentional and matches the reference.

#### Typography & spacing (food sections)

| Property | Old template | New template (matches reference) |
|---|---|---|
| Food section body copy font-size | 16px | 14px |
| Food section subtitle font-size | 16px | 15px |
| Food section subtitle line-height | (not set) | 1.3 |
| Food section subtitle margin-bottom | 12px | 11px |
| Food section paragraph margin | 0 0 16px 0 | 0 0 12px 0 (via content) |
| Section super-label letter-spacing | 0.18em | 0.2em |
| Section super-label margin-bottom | 4px | 5px |

#### Intro section

| Property | Old | New |
|---|---|---|
| Edition label margin-bottom | 12px | 14px |
| Forward text line-height | 1.6 | 1.65 |
| Forward text wording | "forward it to a friend." | "forward it to a friend who would benefit." |
| Subscribe text wording | "Subscribe here." | "Subscribe here to receive future issues." |
| Website CTA button border | rgba(245,243,239,0.25) | rgba(245,243,239,0.2) |
| Website CTA button margin-top | 32px | 28px |
| Website CTA button padding | 10px 28px | 11px 32px |
| Website CTA button font-size | 13px | 12px |
| Website CTA button letter-spacing | 0.1em | 0.12em |

#### Gym News section (major structural change)

The old template used a flat layout with an all-caps sans-serif heading. The new
template uses the reference design:

- Super-label: "From the gym" (10px uppercase sans-serif, `#2d86c4`)
- Heading: "Gym News" in Georgia serif, 22px bold, `#f5f3ef`
- Closure dates block wrapped in `border-left: 2px solid rgba(45,134,196,0.35)`
  with 16px left padding
- Each story wrapped in the same `border-left` container
- Closure dates heading: 22px (was embedded in body copy)
- Gym Calendar button sits inside the closure dates container (left-aligned, not centred)
- Story CTA buttons: left-aligned within the border-left container
- Story CTA button margin-top: 18px (was 20px)
- Story CTA button padding: 9px 24px (was 10px 28px)

#### Local News section

| Property | Old | New |
|---|---|---|
| Super-label | (none) | "Around Kingston" (10px uppercase) |
| Heading | "LOCAL NEWS" (18px sans-serif uppercase) | "Local News" (22px Georgia serif bold) |
| Image class | img-gym-float (120px, float right) | img-float-left (160px, float left) |
| Subtitle font-size | 16px | 15px |
| Body copy font-size | 15px | 14px |

#### Footer

| Property | Old | New |
|---|---|---|
| Legal text colour | #7a8fa3 | #3d4a58 |
| Divider above copyright | (none) | 1px line, #2a3444, 20px margin-bottom |
| Logo width | 160px | 140px |
| Logo margin-bottom | 20px | 24px |
| Unsubscribe link colour | #7a8fa3 | #3d4a58 |
| Copyright margin-bottom | 6px | 6px |
| Address margin-bottom | 10px | 12px |

#### New feature: smart caption links

When an image has both a caption and an `image_url`, the caption now renders as a
clickable link with arrow (→) using the `img-caption-link` class. When the caption
exists but there is no `image_url`, it renders as a plain static `<span>`.

This requires a new conditional flag per section: `*_IMAGE_CAPTION_PLAIN`.

The template pattern for each image block is now:

```html
{{#if BODY_IMAGE_CAPTION}}
  {{#if BODY_IMAGE_URL}}<a href="{{BODY_IMAGE_URL}}" class="img-caption img-caption-link">{{BODY_IMAGE_CAPTION}} &nbsp;&#8594;</a>
  {{/if BODY_IMAGE_URL}}
  {{#if BODY_IMAGE_CAPTION_PLAIN}}<span class="img-caption">{{BODY_IMAGE_CAPTION}}</span>{{/if BODY_IMAGE_CAPTION_PLAIN}}
{{/if BODY_IMAGE_CAPTION}}
```

This applies to all image blocks: BODY, THOUGHT, BRAIN, SOUL, GYM1, GYM2, LOCAL.

#### CTA button styling (all food sections)

| Property | Old | New |
|---|---|---|
| font-size | 13px | 12px |
| letter-spacing | 0.1em | 0.12em |
| font-weight | 400 | (removed, inherits normal) |

#### Minified whitespace

The old template used deeply indented, prettified HTML (1213 lines). The new template
uses compact formatting matching the reference style (~396 lines). This reduces email
payload size and eliminates whitespace rendering differences across email clients.

---

## 2. Update `renderer.py`

### 2a. Update `_image_flags()` to include `_CAPTION_PLAIN`

In the function `_image_flags(section, prefix)`, add the new flag:

```python
def _image_flags(section: dict, prefix: str) -> dict[str, bool]:
    has_image = bool(section.get("image"))
    has_url = bool(section.get("image_url"))
    is_landscape = str(section.get("image_layout", "portrait")).lower() == "landscape"
    return {
        f"{prefix}_IMAGE": has_image,
        f"{prefix}_IMAGE_URL": has_url and has_image,
        f"{prefix}_IMAGE_CAPTION": bool(section.get("image_caption")) and has_image,
        f"{prefix}_IMAGE_CAPTION_PLAIN": bool(section.get("image_caption")) and not has_url and has_image,
        f"{prefix}_IMAGE_LAYOUT_LANDSCAPE": is_landscape and has_image,
    }
```

### 2b. Add the same `_CAPTION_PLAIN` flag to gym and local image flags

In the `_gym_image_flags()` function (and anywhere gym/local image flags are built),
add the `_CAPTION_PLAIN` flag:

```python
def _gym_image_flags(story: dict, prefix: str) -> dict[str, bool]:
    has_image = bool(story.get("image"))
    has_url = bool(story.get("image_url"))
    return {
        f"{prefix}_IMAGE": has_image,
        f"{prefix}_IMAGE_URL": has_url and has_image,
        f"{prefix}_IMAGE_CAPTION": bool(story.get("image_caption")) and has_image,
        f"{prefix}_IMAGE_CAPTION_PLAIN": bool(story.get("image_caption")) and not has_url and has_image,
    }
```

### 2c. Add missing food section CTA flags

In the `render_newsletter()` function, the `flags` dict is missing CTA flags for the
four food sections. Add these to the flags dict:

```python
"BODY_CTA_LABEL": bool(body.get("cta_label")),
"THOUGHT_CTA_LABEL": bool(thought.get("cta_label")),
"BRAIN_CTA_LABEL": bool(brain.get("cta_label")),
"SOUL_CTA_LABEL": bool(soul.get("cta_label")),
```

### 2d. Add `_CAPTION_PLAIN` flags for gym and local sections

In the `flags` dict, add:

```python
"GYM1_IMAGE_CAPTION_PLAIN": bool(gym1.get("image_caption")) and not bool(gym1.get("image_url")) and bool(gym1.get("image")),
"GYM2_IMAGE_CAPTION_PLAIN": bool(gym2.get("image_caption")) and not bool(gym2.get("image_url")) and bool(gym2.get("image")),
"LOCAL_IMAGE_CAPTION_PLAIN": bool(local.get("image_caption")) and not bool(local.get("image_url")) and bool(local.get("image")),
```

Or refactor to use `_gym_image_flags()` for gym stories and a similar helper for local,
calling `flags.update(...)` as is done for the food sections.

### 2e. Leave `{{UNSUBSCRIBE_URL}}` unreplaced (already correct)

The renderer currently sets `"UNSUBSCRIBE_URL": "{{UNSUBSCRIBE_URL}}"` which leaves the
token for the edge function to replace per-recipient. This is correct — do not change it.

---

## 3. Update `templates.ts` (webapp renderer)

### 3a. Add `_CAPTION_PLAIN` to `imageFlagsForSection()`

```typescript
function imageFlagsForSection(
  section: Partial<FoodSection>,
  prefix: string,
): Record<string, boolean> {
  const hasImage = Boolean(section.image);
  const hasUrl = Boolean(section.image_url);
  const isLandscape =
    (section.image_layout ?? "portrait").toLowerCase() === "landscape";
  return {
    [`${prefix}_IMAGE`]: hasImage,
    [`${prefix}_IMAGE_URL`]: hasUrl && hasImage,
    [`${prefix}_IMAGE_CAPTION`]: Boolean(section.image_caption) && hasImage,
    [`${prefix}_IMAGE_CAPTION_PLAIN`]: Boolean(section.image_caption) && !hasUrl && hasImage,
    [`${prefix}_IMAGE_LAYOUT_LANDSCAPE`]: isLandscape && hasImage,
  };
}
```

### 3b. Add `_CAPTION_PLAIN` flags for gym and local sections

In the `flags` object inside `renderNewsletterPreview()`, add:

```typescript
GYM1_IMAGE_CAPTION_PLAIN: Boolean(gym1.image_caption) && !Boolean(gym1.image_url) && Boolean(gym1.image),
GYM2_IMAGE_CAPTION_PLAIN: Boolean(gym2.image_caption) && !Boolean(gym2.image_url) && Boolean(gym2.image),
LOCAL_IMAGE_CAPTION_PLAIN: Boolean(local.image_caption) && !Boolean(local.image_url) && Boolean(local.image),
```

### 3c. Ensure parity with renderer.py

After these changes, both renderers must produce identical flags for identical content.
Verify that the TypeScript flags object contains every flag that appears in the Python
`flags` dict, and vice versa.

**Complete flag checklist (both renderers must have all of these):**

```
GYM_ENABLED, GYM2_ENABLED, LOCAL_ENABLED, GYM_CALENDAR_URL

BODY_CTA_LABEL, THOUGHT_CTA_LABEL, BRAIN_CTA_LABEL, SOUL_CTA_LABEL
GYM1_CTA_LABEL, GYM2_CTA_LABEL, LOCAL_CTA_LABEL

BODY_IMAGE, BODY_IMAGE_URL, BODY_IMAGE_CAPTION, BODY_IMAGE_CAPTION_PLAIN, BODY_IMAGE_LAYOUT_LANDSCAPE
THOUGHT_IMAGE, THOUGHT_IMAGE_URL, THOUGHT_IMAGE_CAPTION, THOUGHT_IMAGE_CAPTION_PLAIN, THOUGHT_IMAGE_LAYOUT_LANDSCAPE
BRAIN_IMAGE, BRAIN_IMAGE_URL, BRAIN_IMAGE_CAPTION, BRAIN_IMAGE_CAPTION_PLAIN, BRAIN_IMAGE_LAYOUT_LANDSCAPE
SOUL_IMAGE, SOUL_IMAGE_URL, SOUL_IMAGE_CAPTION, SOUL_IMAGE_CAPTION_PLAIN, SOUL_IMAGE_LAYOUT_LANDSCAPE

GYM1_IMAGE, GYM1_IMAGE_URL, GYM1_IMAGE_CAPTION, GYM1_IMAGE_CAPTION_PLAIN
GYM2_IMAGE, GYM2_IMAGE_URL, GYM2_IMAGE_CAPTION, GYM2_IMAGE_CAPTION_PLAIN
LOCAL_IMAGE, LOCAL_IMAGE_URL, LOCAL_IMAGE_CAPTION, LOCAL_IMAGE_CAPTION_PLAIN

BODY_SHARE_URL, THOUGHT_SHARE_URL, BRAIN_SHARE_URL, SOUL_SHARE_URL
```

---

## 4. Update `send.py` — pass `edition_slug`

### 4a. Extract slug from content path

In the newsletter send branch of `main()`, derive the edition slug from the content
filename and pass it to `send_campaign()`:

```python
# After rendering the newsletter
edition_slug = Path(args.content).stem  # e.g. "15-becoming-a-snacker"

result = send_campaign(
    settings=settings,
    campaign_type=args.template,
    subject=args.subject,
    html_body=rendered_html,
    recipients=recipients,
    edition_slug=edition_slug if args.template == "newsletter" else None,
)
```

### 4b. Update the general send branch

For general emails, pass `edition_slug=None`.

---

## 5. Update `mailer.py` — include `edition_slug` in payload

**Note:** `mailer.py` was not included in the shared project files, but it is imported
by `send.py` and provides `send_campaign()`. The following changes need to be applied:

### 5a. Accept `edition_slug` parameter

Update the `send_campaign()` function signature to accept `edition_slug: str | None = None`.

### 5b. Include in payload

Add `edition_slug` to the payload dict sent to the edge function:

```python
payload = {
    "action": "send_campaign",
    "payload": {
        "campaign_type": campaign_type,
        "subject": subject,
        "html_body": html_body,
        "recipients": [/* ... */],
        "edition_slug": edition_slug,  # NEW
    },
}
```

---

## 6. Update `mail-sender/index.ts` (edge function)

### 6a. Add `edition_slug` to `SendCampaignPayload` interface

```typescript
interface SendCampaignPayload {
  campaign_type: "general" | "newsletter";
  subject: string;
  html_body: string;
  text_body?: string;
  recipients: Recipient[];
  edition_slug?: string;  // NEW
}
```

### 6b. Include `edition_slug` in the campaign insert

In the `sendCampaign()` function, add `edition_slug` to the insert:

```typescript
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
    edition_slug: payload.edition_slug ?? null,  // NEW
  })
  .select("id")
  .single();
```

### 6c. Redeploy

After updating, redeploy:

```bash
supabase functions deploy mail-sender --no-verify-jwt
```

---

## 7. Update `archiver.py` — write JSON, not legacy `content.py`

### 7a. Change archive format

In `archive_newsletter()`, replace the `content.py` write with `content.json`:

```python
content_path = out_dir / "content.json"
import json
content_path.write_text(
    json.dumps(newsletter_payload, indent=2, ensure_ascii=False),
    encoding="utf-8",
)
```

Remove the old `content.py` write entirely.

---

## 8. Consolidate archive directories

Currently two archive paths exist:

| Path | Created by | Format |
|---|---|---|
| `archives/{slug}/` | `renderer.py` standalone | `rendered.html` + `images/` |
| `archive/newsletters/{date}_{slug}/` | `archiver.py` via `send.py` | `rendered.html` + `content.py` |

### Recommended consolidation

Choose `archives/` as the canonical directory (it matches the renderer's pattern).
Update `archiver.py` to use the same structure:

```python
ARCHIVE_DIR = ROOT_DIR / "archives"

def archive_newsletter(
    subject: str, rendered_html: str, newsletter_payload: dict[str, Any],
    edition_slug: str | None = None,
) -> Path:
    slug = edition_slug or _slugify(subject)
    out_dir = ARCHIVE_DIR / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    # ... rest of function
```

Update `send.py` to pass `edition_slug` to `archive_newsletter()`:

```python
archive_path = archive_newsletter(
    subject=args.subject,
    rendered_html=rendered_html,
    newsletter_payload=payload_data,
    edition_slug=edition_slug,
)
```

After verifying the new archive path works, delete the old `archive/` directory.

---

## 9. Clean up stale files

### Delete or move to `_archive/`:

- `newsletter-form.html` — superseded by the webapp editor
- `_build-resources/newsletter.html` — stale 453-line early draft
- `newsletters/15-becoming-a-snacker/content.py` — legacy duplicate of
  `content/15-becoming-a-snacker.json`

### Recommended:

```bash
mkdir -p _archive
mv newsletter-form.html _archive/
mv _build-resources/ _archive/
rm newsletters/15-becoming-a-snacker/content.py  # JSON version is canonical
```

---

## 10. Enforce template sync

The two template files (`templates/newsletter.html` and `webapp/templates/newsletter.html`)
must remain identical. Choose one approach:

### Option A: Symlink (simplest)

```bash
cd webapp/templates
rm newsletter.html
ln -s ../../templates/newsletter.html newsletter.html
```

Verify the webapp's `loadTemplate()` follows symlinks (Node.js `fs.readFileSync` does
by default).

### Option B: Build-time copy with hash check

Add a pre-build script that copies `templates/newsletter.html` to
`webapp/templates/newsletter.html` and fails if they differ:

```bash
# In package.json scripts or CI
diff templates/newsletter.html webapp/templates/newsletter.html || \
  (echo "ERROR: Templates out of sync" && exit 1)
```

### Option C: Single source, dynamic path

Update `templates.ts` to read from `../templates/` instead of `./templates/`:

```typescript
function loadTemplate(name: "general" | "newsletter"): string {
  const filePath = path.join(process.cwd(), "..", "templates", `${name}.html`);
  return fs.readFileSync(filePath, "utf-8");
}
```

This eliminates the duplicate entirely. Verify the working directory assumption holds
in your deployment.

---

## Verification checklist

After implementing all changes, verify:

- [ ] `python renderer.py content/15-becoming-a-snacker.json` produces output that
  structurally matches `issue-15-reference.html`
- [ ] Webapp preview renders identically to CLI render for the same content
- [ ] `--dry-run` send includes `edition_slug` in the payload (add a print statement
  or log)
- [ ] Food section CTA buttons are hidden when `cta_label` is empty in both renderers
- [ ] Image captions render as links with arrows when `image_url` is set
- [ ] Image captions render as plain text when `image_url` is empty
- [ ] Archive output writes `content.json` (not `content.py`)
- [ ] Template files are synced (symlink or hash check passes)
- [ ] Stale files have been moved to `_archive/` or deleted
- [ ] `supabase functions deploy mail-sender --no-verify-jwt` succeeds
- [ ] A test send populates `edition_slug` in the `sent_campaigns` table

---

## Appendix A: Complete newsletter template (v2)

Replace the contents of both `templates/newsletter.html` and
`webapp/templates/newsletter.html` with the following:

```html
<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="x-apple-disable-message-reformatting" />
<title>Crawford Coaching Newsletter</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style>
body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
a{color:#2d86c4;}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;}
body{margin:0!important;padding:0!important;width:100%!important;}
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}
.clearfix::after{content:'';display:table;clear:both;}
.img-float-left{float:left;margin:0 22px 8px 0;width:160px;}
.img-float-right{float:right;margin:0 0 8px 22px;width:160px;}
.img-float-left img,.img-float-right img{display:block;width:160px;height:210px;object-fit:cover;border:1px solid rgba(45,134,196,0.2);box-shadow:inset 0 0 0 1px rgba(0,0,0,0.35);}
.img-caption{display:block;width:160px;margin:6px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.45;text-align:center;color:#8ca0b3;text-decoration:none;}
.img-caption-link{color:#2d86c4;text-decoration:underline;}
.img-gym-float{float:right;margin:0 0 10px 16px;width:120px;}
.img-gym-float img{display:block;width:120px;height:150px;object-fit:cover;border:1px solid rgba(45,134,196,0.2);box-shadow:inset 0 0 0 1px rgba(0,0,0,0.35);}
.img-gym-float .img-caption{width:120px;}
@media only screen and (max-width:600px){
  .email-container{width:100%!important;}
  .content-cell{padding:28px 20px!important;}
  .img-float-left,.img-float-right{float:none!important;width:100%!important;margin:0 0 6px 0!important;}
  .img-float-left img,.img-float-right img{width:100%!important;height:220px!important;max-width:100%!important;}
  .img-float-left .img-caption,.img-float-right .img-caption{width:100%!important;margin:6px 0 16px 0!important;}
  .img-gym-float{float:none!important;width:100%!important;margin:0 0 6px 0!important;}
  .img-gym-float img{width:100%!important;height:180px!important;}
  .img-gym-float .img-caption{width:100%!important;}
  .section-label{font-size:20px!important;}
  .footer-cell{padding:20px!important;}
}
</style>
</head>
<body style="margin:0;padding:0;background-color:#0e0f10;font-family:Georgia,serif;">

<!-- Preheader -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">{{INTRO_TITLE}} &#8212; Crawford Coaching Newsletter&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;</div>

<!-- Outer wrapper -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0e0f10;">
<tr><td align="center" style="padding:0;">

<!-- Email container -->
<table class="email-container" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#1c2330;">

  <!-- ══ HEADER IMAGE ══ -->
  <tr><td style="padding:0;background-color:#1c2330;">
    <img src="https://yxndmpwqvdatkujcukdv.supabase.co/storage/v1/object/public/mail-assets/cc-email-header.png" alt="Crawford Coaching — Lead with Clarity. Live with Purpose." width="600" style="display:block;width:100%;max-width:600px;height:auto;" />
  </td></tr>

  <!-- ══ INTRO SECTION ══ -->
  <tr><td class="content-cell" style="padding:44px 48px 36px 48px;background-color:#1c2330;">

    <!-- Edition label -->
    <p style="margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#2d86c4;">{{EDITION_LABEL}}</p>

    <!-- Issue title -->
    <h1 style="margin:0 0 22px 0;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:700;line-height:1.15;color:#f5f3ef;">{{INTRO_TITLE}}</h1>

    <!-- Tagline / opening quote -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px 0;">
      <tr>
        <td width="3" style="background-color:#2d86c4;border-radius:2px;">&nbsp;</td>
        <td style="padding:4px 0 4px 16px;">
          <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:17px;line-height:1.65;color:#7a8fa3;">{{INTRO_TAGLINE}}</p>
        </td>
      </tr>
    </table>

    <!-- Greeting -->
    <p style="margin:0 0 20px 0;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.75;color:#f5f3ef;">Hi {{FIRST_NAME}},</p>

    <!-- Intro body copy -->
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.85;color:#c8d4de;text-align:justify;">{{INTRO_BODY}}</div>

    <!-- Forward / subscribe / blog links -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0 0 0;">
      <tr><td style="border-top:1px solid #2a3444;padding-top:24px;">
        <p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.65;color:#7a8fa3;">If you found this valuable, please forward it to a friend who would benefit.</p>
        <p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.65;color:#7a8fa3;">Were you sent this by a friend? <a href="{{SUBSCRIBE_URL}}" style="color:#2d86c4;text-decoration:underline;">Subscribe here</a> to receive future issues.</p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.65;color:#7a8fa3;">Interested? Read the <a href="{{FULL_BLOG_URL}}" style="color:#2d86c4;text-decoration:underline;">full blog article</a> or <a href="{{BLOGCAST_URL}}" style="color:#2d86c4;text-decoration:underline;">hear it discussed</a>.</p>
      </td></tr>
    </table>

    <!-- Website CTA button -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 0 auto;">
      <tr><td style="border:1px solid rgba(245,243,239,0.2);border-radius:2px;">
        <a href="https://crawford-coaching.ca" style="display:inline-block;padding:11px 32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#c8d4de;text-decoration:none;">Crawford Coaching Website</a>
      </td></tr>
    </table>

  </td></tr>

  <!-- SECTION DIVIDER -->
  <tr><td style="background-color:#1c2330;padding:0 48px;"><div style="height:1px;background-color:#2a3444;"></div></td></tr>

  <!-- ══ FOOD FOR THE BODY ══ -->
  <tr><td class="content-cell" style="padding:36px 48px;background-color:#1c2330;">
    <p style="margin:0 0 5px 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#2d86c4;">Food for the</p>
    <h2 class="section-label" style="margin:0 0 20px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;color:#f5f3ef;line-height:1.1;">Body</h2>
    <div class="clearfix">
      {{#if BODY_IMAGE}}
      <div class="img-float-left">
        {{#if BODY_IMAGE_URL}}<a href="{{BODY_IMAGE_URL}}" style="display:block;">{{/if BODY_IMAGE_URL}}
          <img src="{{BODY_IMAGE}}" alt="{{BODY_IMAGE_ALT}}" width="160" />
        {{#if BODY_IMAGE_URL}}</a>{{/if BODY_IMAGE_URL}}
        {{#if BODY_IMAGE_CAPTION}}
          {{#if BODY_IMAGE_URL}}<a href="{{BODY_IMAGE_URL}}" class="img-caption img-caption-link">{{BODY_IMAGE_CAPTION}} &nbsp;&#8594;</a>
          {{/if BODY_IMAGE_URL}}
          {{#if BODY_IMAGE_CAPTION_PLAIN}}<span class="img-caption">{{BODY_IMAGE_CAPTION}}</span>{{/if BODY_IMAGE_CAPTION_PLAIN}}
        {{/if BODY_IMAGE_CAPTION}}
      </div>
      {{/if BODY_IMAGE}}
      <h3 style="margin:0 0 11px 0;font-family:Georgia,'Times New Roman',serif;font-size:15px;font-weight:700;color:#f5f3ef;line-height:1.3;">{{BODY_SUBTITLE}}</h3>
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.85;color:#c8d4de;text-align:justify;">{{BODY_COPY}}</div>
    </div>
    {{#if BODY_CTA_LABEL}}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 0 auto;">
      <tr><td style="border:1px solid rgba(45,134,196,0.4);border-radius:2px;">
        <a href="{{BODY_CTA_URL}}" style="display:inline-block;padding:10px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#c8d4de;text-decoration:none;">{{BODY_CTA_LABEL}}</a>
      </td></tr>
    </table>
    {{/if BODY_CTA_LABEL}}
  </td></tr>

  <!-- SECTION DIVIDER -->
  <tr><td style="background-color:#1c2330;padding:0 48px;"><div style="height:1px;background-color:#2a3444;"></div></td></tr>

  <!-- ══ FOOD FOR THOUGHT ══ -->
  <tr><td class="content-cell" style="padding:36px 48px;background-color:#1c2330;">
    <p style="margin:0 0 5px 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#2d86c4;">Food for</p>
    <h2 class="section-label" style="margin:0 0 20px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;color:#f5f3ef;line-height:1.1;">Thought</h2>
    <div class="clearfix">
      {{#if THOUGHT_IMAGE}}
      <div class="img-float-right">
        {{#if THOUGHT_IMAGE_URL}}<a href="{{THOUGHT_IMAGE_URL}}" style="display:block;">{{/if THOUGHT_IMAGE_URL}}
          <img src="{{THOUGHT_IMAGE}}" alt="{{THOUGHT_IMAGE_ALT}}" width="160" />
        {{#if THOUGHT_IMAGE_URL}}</a>{{/if THOUGHT_IMAGE_URL}}
        {{#if THOUGHT_IMAGE_CAPTION}}
          {{#if THOUGHT_IMAGE_URL}}<a href="{{THOUGHT_IMAGE_URL}}" class="img-caption img-caption-link">{{THOUGHT_IMAGE_CAPTION}} &nbsp;&#8594;</a>
          {{/if THOUGHT_IMAGE_URL}}
          {{#if THOUGHT_IMAGE_CAPTION_PLAIN}}<span class="img-caption">{{THOUGHT_IMAGE_CAPTION}}</span>{{/if THOUGHT_IMAGE_CAPTION_PLAIN}}
        {{/if THOUGHT_IMAGE_CAPTION}}
      </div>
      {{/if THOUGHT_IMAGE}}
      <h3 style="margin:0 0 11px 0;font-family:Georgia,'Times New Roman',serif;font-size:15px;font-weight:700;color:#f5f3ef;line-height:1.3;">{{THOUGHT_SUBTITLE}}</h3>
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.85;color:#c8d4de;text-align:justify;">{{THOUGHT_COPY}}</div>
    </div>
    {{#if THOUGHT_CTA_LABEL}}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 0 auto;">
      <tr><td style="border:1px solid rgba(45,134,196,0.4);border-radius:2px;">
        <a href="{{THOUGHT_CTA_URL}}" style="display:inline-block;padding:10px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#c8d4de;text-decoration:none;">{{THOUGHT_CTA_LABEL}}</a>
      </td></tr>
    </table>
    {{/if THOUGHT_CTA_LABEL}}
  </td></tr>

  <!-- SECTION DIVIDER -->
  <tr><td style="background-color:#1c2330;padding:0 48px;"><div style="height:1px;background-color:#2a3444;"></div></td></tr>

  <!-- ══ FOOD FOR THE BRAIN ══ -->
  <tr><td class="content-cell" style="padding:36px 48px;background-color:#1c2330;">
    <p style="margin:0 0 5px 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#2d86c4;">Food for the</p>
    <h2 class="section-label" style="margin:0 0 20px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;color:#f5f3ef;line-height:1.1;">Brain</h2>
    <div class="clearfix">
      {{#if BRAIN_IMAGE}}
      <div class="img-float-left">
        {{#if BRAIN_IMAGE_URL}}<a href="{{BRAIN_IMAGE_URL}}" style="display:block;">{{/if BRAIN_IMAGE_URL}}
          <img src="{{BRAIN_IMAGE}}" alt="{{BRAIN_IMAGE_ALT}}" width="160" />
        {{#if BRAIN_IMAGE_URL}}</a>{{/if BRAIN_IMAGE_URL}}
        {{#if BRAIN_IMAGE_CAPTION}}
          {{#if BRAIN_IMAGE_URL}}<a href="{{BRAIN_IMAGE_URL}}" class="img-caption img-caption-link">{{BRAIN_IMAGE_CAPTION}} &nbsp;&#8594;</a>
          {{/if BRAIN_IMAGE_URL}}
          {{#if BRAIN_IMAGE_CAPTION_PLAIN}}<span class="img-caption">{{BRAIN_IMAGE_CAPTION}}</span>{{/if BRAIN_IMAGE_CAPTION_PLAIN}}
        {{/if BRAIN_IMAGE_CAPTION}}
      </div>
      {{/if BRAIN_IMAGE}}
      <h3 style="margin:0 0 11px 0;font-family:Georgia,'Times New Roman',serif;font-size:15px;font-weight:700;color:#f5f3ef;line-height:1.3;">{{BRAIN_SUBTITLE}}</h3>
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.85;color:#c8d4de;text-align:justify;">{{BRAIN_COPY}}</div>
    </div>
    {{#if BRAIN_CTA_LABEL}}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 0 auto;">
      <tr><td style="border:1px solid rgba(45,134,196,0.4);border-radius:2px;">
        <a href="{{BRAIN_CTA_URL}}" style="display:inline-block;padding:10px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#c8d4de;text-decoration:none;">{{BRAIN_CTA_LABEL}}</a>
      </td></tr>
    </table>
    {{/if BRAIN_CTA_LABEL}}
  </td></tr>

  <!-- SECTION DIVIDER -->
  <tr><td style="background-color:#1c2330;padding:0 48px;"><div style="height:1px;background-color:#2a3444;"></div></td></tr>

  <!-- ══ FOOD FOR THE SOUL ══ -->
  <tr><td class="content-cell" style="padding:36px 48px;background-color:#1c2330;">
    <p style="margin:0 0 5px 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#2d86c4;">Food for the</p>
    <h2 class="section-label" style="margin:0 0 20px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;color:#f5f3ef;line-height:1.1;">Soul</h2>
    <div class="clearfix">
      {{#if SOUL_IMAGE}}
      <div class="img-float-right">
        {{#if SOUL_IMAGE_URL}}<a href="{{SOUL_IMAGE_URL}}" style="display:block;">{{/if SOUL_IMAGE_URL}}
          <img src="{{SOUL_IMAGE}}" alt="{{SOUL_IMAGE_ALT}}" width="160" />
        {{#if SOUL_IMAGE_URL}}</a>{{/if SOUL_IMAGE_URL}}
        {{#if SOUL_IMAGE_CAPTION}}
          {{#if SOUL_IMAGE_URL}}<a href="{{SOUL_IMAGE_URL}}" class="img-caption img-caption-link">{{SOUL_IMAGE_CAPTION}} &nbsp;&#8594;</a>
          {{/if SOUL_IMAGE_URL}}
          {{#if SOUL_IMAGE_CAPTION_PLAIN}}<span class="img-caption">{{SOUL_IMAGE_CAPTION}}</span>{{/if SOUL_IMAGE_CAPTION_PLAIN}}
        {{/if SOUL_IMAGE_CAPTION}}
      </div>
      {{/if SOUL_IMAGE}}
      <h3 style="margin:0 0 11px 0;font-family:Georgia,'Times New Roman',serif;font-size:15px;font-weight:700;color:#f5f3ef;line-height:1.3;">{{SOUL_SUBTITLE}}</h3>
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.85;color:#c8d4de;text-align:justify;">{{SOUL_COPY}}</div>
    </div>
    {{#if SOUL_CTA_LABEL}}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 0 auto;">
      <tr><td style="border:1px solid rgba(45,134,196,0.4);border-radius:2px;">
        <a href="{{SOUL_CTA_URL}}" style="display:inline-block;padding:10px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#c8d4de;text-decoration:none;">{{SOUL_CTA_LABEL}}</a>
      </td></tr>
    </table>
    {{/if SOUL_CTA_LABEL}}
  </td></tr>

  <!-- ══ GYM NEWS (conditional) ══ -->
  {{#if GYM_ENABLED}}
  <tr><td style="padding:0 48px;background-color:#232f3e;"><div style="height:1px;background-color:#2a3444;"></div></td></tr>
  <tr><td class="content-cell" style="padding:36px 48px;background-color:#232f3e;">
    <p style="margin:0 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#2d86c4;">From the gym</p>
    <h2 style="margin:0 0 28px 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#f5f3ef;line-height:1.1;">Gym News</h2>

    <!-- Closure dates -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px 0;">
      <tr><td style="border-left:2px solid rgba(45,134,196,0.35);padding-left:16px;">
        <h3 style="margin:0 0 10px 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#f5f3ef;line-height:1.1;">Upcoming Gym Closures</h3>
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.75;color:#c8d4de;text-align:justify;">{{GYM_CLOSURE_DATES}}</div>
        {{#if GYM_CALENDAR_URL}}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 0 0;">
          <tr><td style="border:1px solid rgba(45,134,196,0.4);border-radius:2px;">
            <a href="{{GYM_CALENDAR_URL}}" style="display:inline-block;padding:9px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#c8d4de;text-decoration:none;">Gym Calendar</a>
          </td></tr>
        </table>
        {{/if GYM_CALENDAR_URL}}
      </td></tr>
    </table>

    <!-- Story 1 -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="border-left:2px solid rgba(45,134,196,0.35);padding-left:16px;">
        <h3 style="margin:0 0 12px 0;font-family:Georgia,'Times New Roman',serif;font-size:15px;font-weight:700;color:#f5f3ef;">{{GYM1_HEADING}}</h3>
        <div class="clearfix">
          {{#if GYM1_IMAGE}}
          <div class="img-gym-float">
            {{#if GYM1_IMAGE_URL}}<a href="{{GYM1_IMAGE_URL}}" style="display:block;">{{/if GYM1_IMAGE_URL}}
              <img src="{{GYM1_IMAGE}}" alt="{{GYM1_IMAGE_ALT}}" width="120" />
            {{#if GYM1_IMAGE_URL}}</a>{{/if GYM1_IMAGE_URL}}
            {{#if GYM1_IMAGE_CAPTION}}
              {{#if GYM1_IMAGE_URL}}<a href="{{GYM1_IMAGE_URL}}" class="img-caption img-caption-link">{{GYM1_IMAGE_CAPTION}} &nbsp;&#8594;</a>
              {{/if GYM1_IMAGE_URL}}
              {{#if GYM1_IMAGE_CAPTION_PLAIN}}<span class="img-caption">{{GYM1_IMAGE_CAPTION}}</span>{{/if GYM1_IMAGE_CAPTION_PLAIN}}
            {{/if GYM1_IMAGE_CAPTION}}
          </div>
          {{/if GYM1_IMAGE}}
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.75;color:#c8d4de;text-align:justify;">{{GYM1_COPY}}</div>
        </div>
        {{#if GYM1_CTA_LABEL}}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0 0;">
          <tr><td style="border:1px solid rgba(45,134,196,0.4);border-radius:2px;">
            <a href="{{GYM1_CTA_URL}}" style="display:inline-block;padding:9px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#c8d4de;text-decoration:none;">{{GYM1_CTA_LABEL}}</a>
          </td></tr>
        </table>
        {{/if GYM1_CTA_LABEL}}
      </td></tr>
    </table>

    <!-- Story 2 (optional) -->
    {{#if GYM2_ENABLED}}
    <div style="height:1px;background-color:#2a3444;margin:24px 0;"></div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="border-left:2px solid rgba(45,134,196,0.35);padding-left:16px;">
        <h3 style="margin:0 0 12px 0;font-family:Georgia,'Times New Roman',serif;font-size:15px;font-weight:700;color:#f5f3ef;">{{GYM2_HEADING}}</h3>
        <div class="clearfix">
          {{#if GYM2_IMAGE}}
          <div class="img-gym-float">
            {{#if GYM2_IMAGE_URL}}<a href="{{GYM2_IMAGE_URL}}" style="display:block;">{{/if GYM2_IMAGE_URL}}
              <img src="{{GYM2_IMAGE}}" alt="{{GYM2_IMAGE_ALT}}" width="120" />
            {{#if GYM2_IMAGE_URL}}</a>{{/if GYM2_IMAGE_URL}}
            {{#if GYM2_IMAGE_CAPTION}}
              {{#if GYM2_IMAGE_URL}}<a href="{{GYM2_IMAGE_URL}}" class="img-caption img-caption-link">{{GYM2_IMAGE_CAPTION}} &nbsp;&#8594;</a>
              {{/if GYM2_IMAGE_URL}}
              {{#if GYM2_IMAGE_CAPTION_PLAIN}}<span class="img-caption">{{GYM2_IMAGE_CAPTION}}</span>{{/if GYM2_IMAGE_CAPTION_PLAIN}}
            {{/if GYM2_IMAGE_CAPTION}}
          </div>
          {{/if GYM2_IMAGE}}
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.75;color:#c8d4de;text-align:justify;">{{GYM2_COPY}}</div>
        </div>
        {{#if GYM2_CTA_LABEL}}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0 0;">
          <tr><td style="border:1px solid rgba(45,134,196,0.4);border-radius:2px;">
            <a href="{{GYM2_CTA_URL}}" style="display:inline-block;padding:9px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#c8d4de;text-decoration:none;">{{GYM2_CTA_LABEL}}</a>
          </td></tr>
        </table>
        {{/if GYM2_CTA_LABEL}}
      </td></tr>
    </table>
    {{/if GYM2_ENABLED}}

  </td></tr>
  {{/if GYM_ENABLED}}

  <!-- ══ LOCAL NEWS (conditional) ══ -->
  {{#if LOCAL_ENABLED}}
  <tr><td style="padding:0 48px;background-color:#232f3e;"><div style="height:1px;background-color:#2a3444;"></div></td></tr>
  <tr><td class="content-cell" style="padding:36px 48px;background-color:#232f3e;">
    <p style="margin:0 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#2d86c4;">Around Kingston</p>
    <h2 style="margin:0 0 24px 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#f5f3ef;line-height:1.1;">Local News</h2>
    <div class="clearfix">
      {{#if LOCAL_IMAGE}}
      <div class="img-float-left">
        {{#if LOCAL_IMAGE_URL}}<a href="{{LOCAL_IMAGE_URL}}" style="display:block;">{{/if LOCAL_IMAGE_URL}}
          <img src="{{LOCAL_IMAGE}}" alt="{{LOCAL_IMAGE_ALT}}" width="160" />
        {{#if LOCAL_IMAGE_URL}}</a>{{/if LOCAL_IMAGE_URL}}
        {{#if LOCAL_IMAGE_CAPTION}}
          {{#if LOCAL_IMAGE_URL}}<a href="{{LOCAL_IMAGE_URL}}" class="img-caption img-caption-link">{{LOCAL_IMAGE_CAPTION}} &nbsp;&#8594;</a>
          {{/if LOCAL_IMAGE_URL}}
          {{#if LOCAL_IMAGE_CAPTION_PLAIN}}<span class="img-caption">{{LOCAL_IMAGE_CAPTION}}</span>{{/if LOCAL_IMAGE_CAPTION_PLAIN}}
        {{/if LOCAL_IMAGE_CAPTION}}
      </div>
      {{/if LOCAL_IMAGE}}
      <h3 style="margin:0 0 10px 0;font-family:Georgia,'Times New Roman',serif;font-size:15px;font-weight:700;color:#f5f3ef;">{{LOCAL_SUBTITLE}}</h3>
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.75;color:#c8d4de;text-align:justify;">{{LOCAL_COPY}}</div>
    </div>
    {{#if LOCAL_CTA_LABEL}}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 0 auto;">
      <tr><td style="border:1px solid rgba(45,134,196,0.4);border-radius:2px;">
        <a href="{{LOCAL_CTA_URL}}" style="display:inline-block;padding:10px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#c8d4de;text-decoration:none;">{{LOCAL_CTA_LABEL}}</a>
      </td></tr>
    </table>
    {{/if LOCAL_CTA_LABEL}}
  </td></tr>
  {{/if LOCAL_ENABLED}}

  <!-- ══ FOOTER ══ -->
  <tr><td style="background-color:#1c2330;padding:0 48px;"><div style="height:1px;background-color:#2a3444;"></div></td></tr>
  <tr><td class="footer-cell" style="padding:32px 40px;background-color:#1c2330;text-align:center;">

    <!-- Social icons -->
    <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px auto;">
      <tr>
        <td style="padding:0 8px;"><a href="https://www.facebook.com/CrawfordCoachingKingston" style="text-decoration:none;"><img src="https://yxndmpwqvdatkujcukdv.supabase.co/storage/v1/object/public/mail-assets/icon-facebook-dark.png" alt="Facebook" width="28" height="28" style="display:block;" /></a></td>
        <td style="padding:0 8px;"><a href="https://www.instagram.com/scott.crawford.coaching/" style="text-decoration:none;"><img src="https://yxndmpwqvdatkujcukdv.supabase.co/storage/v1/object/public/mail-assets/icon-instagram-dark.png" alt="Instagram" width="28" height="28" style="display:block;" /></a></td>
        <td style="padding:0 8px;"><a href="https://www.linkedin.com/in/scott-crawford-acc-9043b91a1/" style="text-decoration:none;"><img src="https://yxndmpwqvdatkujcukdv.supabase.co/storage/v1/object/public/mail-assets/icon-linkedin-dark.png" alt="LinkedIn" width="28" height="28" style="display:block;" /></a></td>
      </tr>
    </table>

    <!-- Crawford Coaching logo -->
    <img src="https://yxndmpwqvdatkujcukdv.supabase.co/storage/v1/object/public/mail-assets/cc-logo-dark.png" alt="Crawford Coaching" width="140" style="display:block;margin:0 auto 24px auto;max-width:140px;height:auto;" />

    <!-- Credential badges -->
    <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px auto;">
      <tr>
        <td style="padding:0 10px;"><img src="https://yxndmpwqvdatkujcukdv.supabase.co/storage/v1/object/public/mail-assets/badge-icf-acc.png" alt="ICF Associate Certified Coach" width="52" height="52" style="display:block;width:52px;height:52px;" /></td>
        <td style="padding:0 10px;"><img src="https://yxndmpwqvdatkujcukdv.supabase.co/storage/v1/object/public/mail-assets/badge-dare-to-lead.png" alt="Dare to Lead Trained" width="52" height="52" style="display:block;width:52px;height:52px;" /></td>
        <td style="padding:0 10px;"><img src="https://yxndmpwqvdatkujcukdv.supabase.co/storage/v1/object/public/mail-assets/badge-issa.png" alt="ISSA Certified" width="52" height="52" style="display:block;width:52px;height:52px;" /></td>
      </tr>
    </table>

    <div style="height:1px;background-color:#2a3444;margin:0 0 20px 0;"></div>

    <!-- Legal / unsubscribe -->
    <p style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#3d4a58;">Copyright &copy; {{CURRENT_YEAR}} Crawford Coaching. All rights reserved.</p>
    <p style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#3d4a58;">You are receiving this email because you signed up at CrawfordCoaching.ca or the Synergize Fitness website, or have expressed an interest in our services.</p>
    <p style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#3d4a58;">Crawford Coaching &middot; 544 Gore Rd &middot; Kingston, ON &middot; K7L 0C3 &middot; Canada</p>
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#3d4a58;">
      <a href="{{UNSUBSCRIBE_URL}}" style="color:#3d4a58;text-decoration:underline;">Unsubscribe</a>
      &nbsp;&middot;&nbsp;
      <a href="https://crawford-coaching.ca/contact" style="color:#3d4a58;text-decoration:underline;">Update your preferences</a>
    </p>

  </td></tr>

</table>
<!-- /Email container -->
</td></tr>
</table>

<!-- Open tracking pixel (injected by mail-sender per recipient) -->
<!-- {{OPEN_PIXEL}} -->

</body>
</html>
```

---

*End of instruction set.*
