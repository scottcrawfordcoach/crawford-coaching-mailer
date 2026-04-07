# Crawford Coaching — Send Email Feature

## Overview

This document covers two things:

1. **Deploying the new branded email template** (replacing `templates/general.html`)
2. **Adding a "Send Email" menu option** to the webapp alongside "Draft Newsletter"

The new email template uses the same `{{FIRST_NAME}}`, `{{BODY}}`, and `{{CURRENT_YEAR}}` placeholders as the existing `render_general()` function in `renderer.py` — no backend code changes needed. The template includes:

- Banner header image inset within a slate border (not full-width)
- Georgia serif body text on dark slate
- Signature block (Scott Crawford / ACC · Crawford Coaching)
- Four mini-cards linking to services: WHOLE, Coaching, Synergize, Growth Zone
- Social icons, credential badges, copyright footer

---

## 1. Deploy the new email template

### Replace `templates/general.html`

Copy the contents of `branded-email-template.html` (attached) to `templates/general.html`, replacing the existing file entirely. If you have a webapp template sync step (`predev` script), it will propagate automatically.

### Upload to Supabase Storage (if not already present)

The template references these assets in the `mail-assets` bucket — confirm they exist:

```
cc-email-header.png       (banner with logo + photo)
cc-logo-white.png         (white logo)
icon-facebook-dark.png
icon-instagram-dark.png
icon-linkedin-dark.png
badge-icf-acc.png
badge-dare-to-lead.png
badge-issa.png
```

### Test

```bash
python send.py \
  --template general \
  --subject "Test — new template" \
  --recipients "your@email.com" \
  --body "This is a test of the new branded email template." \
  --dry-run
```

Remove `--dry-run` to send for real.

---

## 2. Webapp — Welcome screen menu

### Current state

The webapp currently opens directly into the newsletter content form. We need a welcome/home screen that lets you choose between two workflows.

### Implementation

Add a new view component (or conditional render at the top level) that shows two options:

```
┌─────────────────────────────────────────────┐
│                                             │
│         Crawford Coaching                   │
│         Lead with Clarity.                  │
│         Live with Purpose.                  │
│                                             │
│    ┌──────────────┐  ┌──────────────┐       │
│    │              │  │              │       │
│    │  DRAFT       │  │  SEND        │       │
│    │  NEWSLETTER  │  │  EMAIL       │       │
│    │              │  │              │       │
│    └──────────────┘  └──────────────┘       │
│                                             │
└─────────────────────────────────────────────┘
```

**Style notes:**
- Use the existing project palette: `--ink` (#0e0f10) background, `--slate` (#1c2330) cards
- Cards should have a subtle `--blue-border` (rgba(45,134,196,0.35)) border
- Georgia serif for headings, Jost/Arial sans for labels
- On click, each card navigates to its respective form view

### State management

Add a simple view state:

```typescript
type AppView = 'home' | 'newsletter' | 'email';
```

The "Draft Newsletter" card loads the existing newsletter form. The "Send Email" card loads the new email form (see below).

---

## 3. Webapp — Send Email form

### Form fields

The email form needs only these fields:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| **Send mode** | Toggle | Yes | "Individual" or "Group" — controls which recipient fields appear |
| **Recipient(s)** | Text input + search | Conditional | Shown in Individual mode. Autocomplete search against `contacts` by name/email |
| **Tag category** | Dropdown | Conditional | Shown in Group mode. One of: `day`, `slot`, `program`, `status` |
| **Tags** | Multi-select dropdown | Conditional | Shown in Group mode. Populated from `contact_tags` filtered by selected category |
| **Contact status** | Dropdown | Conditional | Shown in Group mode. Filter: `active`, `previous_client`, `lead`, `inactive`, or "All" |
| **Subject** | Text input | Yes | Email subject line |
| **Message** | Textarea | Yes | Plain text body. Double newlines become paragraph breaks |

### Database schema — quick reference

The `contact_tags` table has a `category` column with a CHECK constraint:

```sql
category text NOT NULL CHECK (category IN ('day', 'slot', 'program', 'status'))
```

**Tag categories and typical values:**

| Category | What it means | Example tags |
|----------|--------------|--------------|
| `day` | Day of the week | MON, TUE, WED, THU, FRI |
| `slot` | Group time slot | M/W/F 6:15, TH 9 |
| `program` | Service/program | Synergize Fitness, WHOLE, Coaching |
| `status` | Operational status | ACTIVE, INVOICE_CLIENT |

The `contacts` table has a `contact_status` column:

```sql
contact_status text NOT NULL DEFAULT 'active'
  CHECK (contact_status IN ('active', 'previous_client', 'lead', 'inactive'))
```

### Send mode toggle

```
┌─────────────────────────────────────────────┐
│  Send to:                                   │
│                                             │
│  [● Individual]  [○ Group]                  │
│                                             │
│  ┌─ Individual ──────────────────────────┐  │
│  │  Search contacts:  [              ]   │  │
│  │  Results: J. Smith (j@email.com) ✓    │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ── or, when Group is selected ──           │
│                                             │
│  ┌─ Group ───────────────────────────────┐  │
│  │  Tag category: [program       ▼]     │  │
│  │  Tags:         [Synergize ▼] [▼]     │  │
│  │  Status:       [active        ▼]     │  │
│  │  Matching: 14 recipients              │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  Subject:  [                            ]   │
│  Message:                                   │
│  ┌──────────────────────────────────────┐   │
│  │                                      │   │
│  │                                      │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  [Preview]  [Send]                          │
└─────────────────────────────────────────────┘
```

### Backend API calls

The form needs these Supabase queries for the recipient selection:

#### Individual — contact search

Already implemented in `recipients.py` as `_name_lookup()`. The webapp can call this via the existing edge function, or query the `contacts` table directly:

```sql
SELECT id, email, first_name, last_name, contact_status
FROM contacts
WHERE (first_name ILIKE '%query%' OR last_name ILIKE '%query%' OR email ILIKE '%query%')
  AND email IS NOT NULL
ORDER BY first_name
LIMIT 20
```

#### Group — available tag categories

Hardcoded from the CHECK constraint (no query needed):

```typescript
const TAG_CATEGORIES = ['day', 'slot', 'program', 'status'] as const;
```

#### Group — tags within a category

```sql
SELECT DISTINCT tag FROM contact_tags
WHERE category = 'program'   -- or 'day', 'slot', 'status'
ORDER BY tag
```

#### Group — resolve recipients by tags + status

Already implemented in `recipients.py` as `_tag_contacts()`. Enhanced version with status filter:

1. Query `contact_tags` for all `contact_id` values matching the selected tags
2. If multiple tags selected, require ALL tags (intersection, not union)
3. Join against `contacts` where `email IS NOT NULL`
4. Apply `contact_status` filter if not "All" (e.g. `contact_status = 'active'`)
5. Return deduplicated list with count

```sql
-- Step 1: Find contacts matching all selected tags
SELECT ct.contact_id
FROM contact_tags ct
WHERE ct.tag IN ('Synergize Fitness', 'MON')  -- selected tags
GROUP BY ct.contact_id
HAVING COUNT(DISTINCT ct.tag) = 2             -- must match ALL tags

-- Step 2: Get contact details with status filter
SELECT c.id, c.email, c.first_name, c.last_name
FROM contacts c
WHERE c.id IN (/* step 1 results */)
  AND c.email IS NOT NULL
  AND c.contact_status = 'active'             -- or omit for "All"
```

#### Group — contact status presets

Populated from the CHECK constraint on `contacts.contact_status`:

| Dropdown label | Filter |
|----------------|--------|
| All | No status filter |
| Active | `contact_status = 'active'` |
| Previous clients | `contact_status = 'previous_client'` |
| Leads | `contact_status = 'lead'` |
| Newsletter subscribers | `newsletter_enabled = true AND contact_status = 'active'` |

### Preview

When the user clicks "Preview", render the email using the general template:

```typescript
// In templates.ts or equivalent
function renderEmailPreview(firstName: string, body: string): string {
  const template = loadTemplate('general');
  
  // Convert plain text to HTML paragraphs
  let bodyHtml = body;
  if (!body.includes('<')) {
    bodyHtml = body
      .split('\n\n')
      .filter(p => p.trim())
      .map(p => `<p style="margin:0 0 18px 0;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
      .join('\n');
  }
  
  return template
    .replace('{{BODY}}', bodyHtml)
    .replace('{{FIRST_NAME}}', escapeHtml(firstName || 'there'))
    .replace('{{CURRENT_YEAR}}', new Date().getFullYear().toString());
}
```

Show in an iframe, same as the newsletter preview.

### Send

The send action calls the same `send_campaign` endpoint used by `send.py`:

```typescript
const payload = {
  action: 'send_campaign',
  payload: {
    campaign_type: 'general',
    subject: subject,
    html_body: renderedHtml,
    recipients: resolvedRecipients.map(r => ({
      email: r.email,
      first_name: r.first_name,
      contact_id: r.id,
    })),
  },
};

const response = await fetch(MAIL_SENDER_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${MAIL_SENDER_BEARER_TOKEN}`,
  },
  body: JSON.stringify(payload),
});
```

The edge function handles per-recipient personalisation (replacing `{{FIRST_NAME}}` with each recipient's name) and tracking pixel injection.

---

## 4. Recipient resolution summary

All recipient resolution patterns from `recipients.py`, for reference:

| Spec format | What it does | Use case |
|-------------|-------------|----------|
| `newsletter` | All contacts with `newsletter_enabled = true` | Newsletter sends |
| `tag:CLIENT` | Contacts tagged CLIENT | Group email to clients |
| `tag:CLIENT,LEAD` | Contacts with BOTH tags | Intersection filter |
| `name:Jasu` | Search by first or last name | Individual lookup |
| `scott@email.com` | Direct email address | Manual recipient |
| `a@b.com, c@d.com` | Comma-separated emails | Multiple manual |
| `file:recipients.txt` | One email per line from file | Bulk import |

---

## 5. Analytics

All emails sent through the pipeline automatically get:

- **Open tracking** via the `{{OPEN_PIXEL}}` injected by the edge function
- **Click tracking** via link rewriting in the edge function
- **Unsubscribe tracking** via the `{{UNSUBSCRIBE_URL}}` placeholder
- **Campaign logging** in the `campaigns` and `campaign_recipients` tables

Query campaign results:

```bash
python send.py --action campaigns
python send.py --action campaign-detail --campaign-id <id>
```

---

## 6. File checklist

| File | Action | Notes |
|------|--------|-------|
| `templates/general.html` | **Replace** | With `branded-email-template.html` |
| `webapp/templates/general.html` | **Auto-sync** | Via `predev` script if configured |
| `renderer.py` | **No change** | `render_general()` already uses the right placeholders |
| `send.py` | **No change** | CLI send already supports `--template general` |
| Webapp home view | **New** | Welcome screen with two menu cards |
| Webapp email form | **New** | Fields: mode toggle, recipients, subject, message |
| Webapp email preview | **New** | Reuses `renderEmailPreview()` in iframe |
| Webapp email send | **New** | Calls `send_campaign` endpoint |
