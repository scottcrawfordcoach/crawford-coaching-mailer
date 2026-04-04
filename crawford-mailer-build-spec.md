# Crawford Coaching Mailer — Build Spec for Copilot

## Overview

A local Python-based email sending tool for Crawford Coaching. Runs from VS Code. No web deployment. Sends branded HTML emails and newsletters via Gmail SMTP using an app password. Recipients are pulled from a Supabase CRM or entered manually. Analytics (opens, clicks, unsubscribes) route through an already-deployed Supabase edge function.

---

## Project Structure

```
crawford-mailer/
├── .env                          # secrets — never commit
├── .gitignore                    # must include .env
├── send.py                       # main CLI entry point
├── config.py                     # loads .env, exposes constants
├── recipients.py                 # resolves recipient list from various sources
├── renderer.py                   # renders HTML templates with content
├── mailer.py                     # Gmail SMTP send function
├── tracker.py                    # injects tracking pixel + wraps links
├── archiver.py                   # saves rendered HTML to archive/
├── templates/
│   ├── general_email.html        # branded single-body HTML email
│   └── newsletter.html           # 5-section newsletter template
├── assets/
│   └── cc-header.png             # email header image (inline base64 or hosted URL)
├── archive/
│   ├── sent/                     # YYYY-MM-DD_subject-slug.html per send
│   └── newsletters/              # one subfolder per newsletter issue
└── README.md
```

---

## Environment Variables (.env)

```env
SUPABASE_URL=https://yxndmpwqvdatkujcukdv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_srk_here
GMAIL_ADDRESS=scott@crawford-coaching.ca
GMAIL_APP_PASSWORD=your_app_password_here
FROM_NAME=Scott Crawford Coaching
DATA_HANDLER_URL=https://yxndmpwqvdatkujcukdv.supabase.co/functions/v1/data-handler
BASE_TRACKING_URL=https://yxndmpwqvdatkujcukdv.supabase.co/functions/v1/data-handler
```

Note: SUPABASE_SERVICE_ROLE_KEY is used directly for all outbound CRM reads (recipient lookup, tag filtering). This is safe because the script runs locally only and is never deployed. Inbound analytics (opens, clicks, unsubscribes) use the public data-handler endpoint, which requires no auth for engagement_log.

---

## Dependencies

```
pip install supabase python-dotenv
```

Standard library handles the rest: `smtplib`, `email`, `argparse`, `pathlib`, `datetime`, `base64`, `urllib`.

---

## CLI Usage

```bash
# Newsletter to all contacts with ACTIVE tag
python send.py --template newsletter --subject "April Issue" --recipients tag:ACTIVE

# General email to contacts with newsletter_enabled = true
python send.py --template general --subject "Quick note" --recipients newsletter

# General email to manual list
python send.py --template general --subject "Hey" --recipients "jane@example.com,bob@example.com"

# General email from a text file (one email per line)
python send.py --template general --subject "Update" --recipients file:list.txt

# Newsletter with content file
python send.py --template newsletter --subject "April Issue" --content april.py --recipients tag:ACTIVE

# Dry run — renders HTML and saves to archive but does not send
python send.py --template newsletter --subject "Test" --recipients "scott@crawford-coaching.ca" --dry-run
```

---

## recipients.py

Resolves a recipient list to a list of dicts: `[{ "email": "...", "first_name": "..." }]`

Three resolution modes, determined by the `--recipients` argument:

1. **Manual emails** — comma-separated string of raw email addresses. No CRM lookup.
2. **File** — `file:path.txt`, one email per line.
3. **newsletter** — queries Supabase `contacts` table directly (using SRK) for all rows where `newsletter_enabled = true` and `contact_status = 'active'`.
4. **Tag filter** — `tag:TAGNAME` or `tag:TAG1,TAG2`. Queries Supabase `contact_tags` table for contacts having ALL specified tags, then fetches their email and first_name from `contacts`.
5. **Name lookup** — `name:Scott Crawford`. Fuzzy match on `first_name || ' ' || last_name` in Supabase.

Use the `supabase-py` client with the service role key for all queries.

---

## mailer.py

Sends via Gmail SMTP with TLS.

```python
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

def send_email(to_email, to_name, subject, html_body, from_name, from_email, app_password):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = f"{to_name} <{to_email}>" if to_name else to_email
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(from_email, app_password)
        server.sendmail(from_email, to_email, msg.as_string())
```

Personalise each send: substitute `{{first_name}}` in the HTML body before sending. If first_name is unavailable, fall back to "there" (e.g. "Hi there,").

---

## tracker.py

Injects analytics into the rendered HTML before sending. Each email gets a unique `send_id` (UUID).

### Open Tracking
Appends a 1x1 pixel image to the bottom of the email body:

```html
<img src="{{BASE_TRACKING_URL}}?action=track_open&send_id={{send_id}}&email={{encoded_email}}" width="1" height="1" style="display:none;" />
```

### Link Wrapping
Replaces all `href="https://..."` links in the HTML (except unsubscribe and mailto) with a redirect through data-handler:

```
{{BASE_TRACKING_URL}}?action=track_click&send_id={{send_id}}&url={{encoded_original_url}}&email={{encoded_email}}
```

### Unsubscribe Link
Every email must include an unsubscribe link. In the template, use `{{unsubscribe_url}}`. tracker.py replaces this with:

```
{{BASE_TRACKING_URL}}?action=unsubscribe&email={{encoded_email}}
```

---

## Data Handler — Required Additions (index.ts)

The existing data-handler edge function needs three new public GET actions (no auth required). Add these to the GET handler block alongside the existing `class_schedule` action.

### action=track_open
Logs an engagement event. Does not redirect. Returns a 1x1 transparent GIF.

```typescript
if (action === "track_open") {
  const email = url.searchParams.get("email") ?? "";
  const sendId = url.searchParams.get("send_id") ?? "";
  await supabase.from("engagements").insert({
    email_hint: email,
    source: "email",
    action: "open",
    metadata: { send_id: sendId }
  });
  // Return 1x1 transparent GIF
  const gif = new Uint8Array([71,73,70,56,57,97,1,0,1,0,0,0,0,59]);
  return new Response(gif.buffer, {
    headers: { "Content-Type": "image/gif", "Access-Control-Allow-Origin": "*" }
  });
}
```

### action=track_click
Logs a click event, then redirects to the original URL.

```typescript
if (action === "track_click") {
  const email = url.searchParams.get("email") ?? "";
  const sendId = url.searchParams.get("send_id") ?? "";
  const dest = decodeURIComponent(url.searchParams.get("url") ?? "");
  await supabase.from("engagements").insert({
    email_hint: email,
    source: "email",
    action: "click",
    metadata: { send_id: sendId, url: dest }
  });
  return new Response(null, {
    status: 302,
    headers: { "Location": dest, "Access-Control-Allow-Origin": "*" }
  });
}
```

### action=unsubscribe
Sets `newsletter_enabled = false` on the contact. Shows a plain confirmation page.

```typescript
if (action === "unsubscribe") {
  const email = decodeURIComponent(url.searchParams.get("email") ?? "");
  await supabase.from("contacts")
    .update({ newsletter_enabled: false, newsletter_status: "unsubscribed" })
    .eq("email", email.toLowerCase().trim());
  await supabase.from("engagements").insert({
    email_hint: email,
    source: "email",
    action: "unsubscribe"
  });
  return new Response(
    "<html><body style='font-family:sans-serif;padding:2rem;'><h2>You've been unsubscribed.</h2><p>You won't receive further emails from Crawford Coaching.</p></body></html>",
    { headers: { "Content-Type": "text/html", "Access-Control-Allow-Origin": "*" } }
  );
}
```

---

## archiver.py

After each successful send (or dry run), saves the fully rendered HTML (with tracking injected) to:

```
archive/sent/YYYY-MM-DD_subject-slug.html       # general emails
archive/newsletters/YYYY-MM-DD_subject-slug/
    rendered.html                                # full rendered newsletter
    content.py                                   # copy of the content input used
```

`subject-slug` is the subject line lowercased, spaces replaced with hyphens, special chars stripped.

---

## Template 1: General Email (general_email.html)

A single-body branded HTML email matching the Crawford Coaching site design language.

Design tokens (from crawford-homepage.html):
- Background: `#0e0f10` (ink) or `#1c2330` (slate) for email body wrapper
- Text: `#f5f3ef` (white), `#c8d4de` (pale), `#7a8fa3` (mist)
- Accent blue: `#2d86c4`
- Fonts: email-safe fallbacks — Georgia for serif display, Arial/sans-serif for body
- Header: the Crawford Coaching email header image (Crawofrd_Coaching_Email_Header.png — note the filename typo, keep as-is)

Structure:
```
[Header image — full width]
[Body content area]
  Hi {{first_name}},

  {{body}}

  {{cta_button}} (optional)
[Footer]
  Social icons | Unsubscribe | Address
  © 2026 Crawford Coaching
```

Template variables: `{{first_name}}`, `{{body}}`, `{{subject}}`, `{{cta_label}}`, `{{cta_url}}`, `{{unsubscribe_url}}`

---

## Template 2: Newsletter (newsletter.html)

Matches the format of the existing Crawford Coaching newsletter (sample: March 2026 issue).

Structure:
```
[Header image]
[Title + opening quote]
Hi {{first_name}},

[Intro section — ~500 words, narrative]

[Food for the BODY]
  subtitle, body copy, optional image (left or right), optional CTA button

[Food for the BRAIN]
  subtitle, body copy, optional image, optional CTA button

[Food for THOUGHT]
  subtitle, body copy, optional image, optional CTA button

[Food for the SOUL]
  subtitle, body copy, optional image, optional CTA button

[GYM NEWS] (optional section)
[LOCAL NEWS] (optional section)

[Footer]
  Social icons (Facebook, Instagram, LinkedIn)
  Unsubscribe | Update preferences
  Address: Crawford Coaching, 544 Gore Rd, Kingston, ON K7L 0C3
  © 2026 Crawford Coaching
```

### Content Input Format (content.py)

Each newsletter is defined as a Python dict passed to the renderer:

```python
newsletter = {
    "subject": "A Failed Tactic, Not a Failed Strategy",
    "title": "A Failed Tactic Isn't a Failed Strategy",
    "opening_quote": "Consistency isn't built by never drifting. It's built by returning.",
    "intro": {
        "body": "...",  # full HTML or plain text paragraphs
    },
    "food_body": {
        "subtitle": "The Smallest Version That Still Counts",
        "body": "...",
        "image": "assets/fitness.jpg",   # optional, None if not used
        "image_side": "left",            # "left" or "right"
        "cta_label": "Book A Gym Visit",
        "cta_url": "https://...",
    },
    "food_brain": {
        "subtitle": "Three Questions Before You Plan",
        "body": "...",
        "image": None,
        "cta_label": "Explore The Blog",
        "cta_url": "https://crawford-coaching.ca/writing",
    },
    "food_thought": {
        "subtitle": "Compassion First, Lesson Second",
        "body": "...",
        "image": "assets/reflection.jpg",
        "image_side": "right",
        "cta_label": None,
        "cta_url": None,
    },
    "food_soul": {
        "subtitle": "The Compass Does Not Care About Wednesday",
        "body": "...",
        "image": "assets/path.jpg",
        "image_side": "right",
        "cta_label": "Coaching Discovery Call",
        "cta_url": "https://calendar.app.google/R66fNg5m7w3aKPKd6",
    },
    "gym_news": {          # optional — omit key or set to None to hide section
        "items": [
            { "heading": "Gym Closures", "body": "Mar 30-31 & Apr 1-6" },
            { "heading": "Reminder", "body": "Monthly payments are normalized..." },
        ],
        "image": "assets/hudson.jpg",
        "cta_label": "See My Gym Calendar",
        "cta_url": "https://...",
    },
    "local_news": {        # optional
        "subtitle": "Children's Thrift Sale",
        "body": "...",
        "image": "assets/thrift.jpg",
    },
}
```

---

## Archiving in Supabase Storage (optional enhancement)

If local archive/ folder is not sufficient, rendered HTMLs can also be uploaded to a Supabase Storage bucket named `email_archive` using the SRK client. Structure mirrors the local archive.

---

## What Does NOT Need to Be Built

- No web UI
- No Vercel deployment
- No OAuth — Gmail app password only
- No Mailchimp integration (replacing it)
- No database schema changes — existing `contacts`, `contact_tags`, and `engagements` tables handle everything
- No new Supabase edge functions — only three new action handlers added to the existing data-handler index.ts
