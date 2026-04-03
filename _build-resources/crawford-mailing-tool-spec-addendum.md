# Crawford Coaching Mailing Tool
## Spec Addendum — Implementation Detail
**Companion to: crawford-mailing-tool-spec.md**

---

## A. Repo Structure

Build the repo exactly as follows. All paths are relative to `E:\crawford-coaching-mailer\`.

```
crawford-coaching-mailer/
├── .env                                  ← already exists
├── _data-handler-index                   ← already exists (reference copy)
│
├── supabase/
│   └── functions/
│       ├── mail-sender/
│       │   └── index.ts
│       └── mail-tracker/
│           └── index.ts
│
├── migrations/
│   └── 002_mailing_tables.sql
│
├── templates/
│   ├── general.html                      ← built separately (see deliverable 2)
│   └── newsletter.html                   ← built separately (see deliverable 3)
│
├── app/                                  ← Next.js 14 App Router root
│   ├── layout.tsx
│   ├── page.tsx                          ← redirects to /compose
│   ├── login/
│   │   └── page.tsx
│   ├── compose/
│   │   ├── page.tsx                      ← general email compose
│   │   └── newsletter/
│   │       └── page.tsx                  ← newsletter compose
│   ├── archive/
│   │   ├── page.tsx                      ← campaign list
│   │   └── [id]/
│   │       └── page.tsx                  ← campaign detail + analytics
│   └── api/
│       ├── auth/
│       │   └── route.ts                  ← password gate
│       ├── contacts/
│       │   ├── lookup/
│       │   │   └── route.ts              ← proxies data-handler contact_lookup
│       │   └── tags/
│       │       └── route.ts              ← proxies data-handler contact_list
│       ├── campaigns/
│       │   ├── route.ts                  ← GET list, POST send
│       │   └── [id]/
│       │       └── route.ts              ← GET detail
│       └── assets/
│           └── route.ts                  ← image upload to Supabase Storage
│
├── components/
│   ├── RecipientSelector.tsx
│   ├── PreviewPanel.tsx
│   ├── SectionBlock.tsx                  ← newsletter section input block
│   ├── CampaignTable.tsx
│   └── AnalyticsPanel.tsx
│
├── lib/
│   ├── auth.ts                           ← session cookie helpers
│   ├── supabase.ts                       ← Supabase client (server-side only)
│   └── templates.ts                      ← template rendering / merge tag replacement
│
├── public/
│   └── assets/
│       └── cc-header.png                 ← newsletter header image (copy from site)
│
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## B. Environment Variable Usage Map

| Variable | Used In | Purpose |
|---|---|---|
| `GMAIL_BUSINESS` | `supabase/functions/mail-sender/index.ts` | SMTP username (from address) |
| `GMAIL_APP_PASSWORD_BUSINESS` | `supabase/functions/mail-sender/index.ts` | SMTP password |
| `SUPABASE_URL` | Edge Functions (auto-injected by Supabase) | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions (auto-injected by Supabase) | DB access bypassing RLS |
| `DATA_HANDLER_BEARER_TOKEN` | `app/api/contacts/lookup/route.ts`, `app/api/contacts/tags/route.ts` | Auth for data-handler calls |
| `MAIL_SENDER_BEARER_TOKEN` | `app/api/campaigns/route.ts`, `supabase/functions/mail-sender/index.ts` | Auth for mail-sender calls |
| `NEXT_PUBLIC_` prefix | None — no env vars exposed to browser | All calls go through API routes |

**Note on Supabase secrets vs .env:**
- `GMAIL_BUSINESS` and `GMAIL_APP_PASSWORD_BUSINESS` must be set as Supabase secrets:
  `supabase secrets set GMAIL_BUSINESS=<value>`
  `supabase secrets set GMAIL_APP_PASSWORD_BUSINESS=<value>`
  `supabase secrets set MAIL_SENDER_BEARER_TOKEN=<value>`
- The `.env` file is used by the Next.js app only (never by Edge Functions directly).
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected into Edge Functions by Supabase — do not pass them manually.

---

## C. Nodemailer / Gmail SMTP Config

Inside `supabase/functions/mail-sender/index.ts`, import and configure nodemailer as follows.

Deno Edge Functions support npm packages via the `npm:` specifier.

```typescript
import nodemailer from "npm:nodemailer@6";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,           // STARTTLS — do NOT use port 465 / secure: true
  auth: {
    user: Deno.env.get("GMAIL_BUSINESS"),
    pass: Deno.env.get("GMAIL_APP_PASSWORD_BUSINESS"),
  },
});

// Send a single message
await transporter.sendMail({
  from: `"Scott Crawford Coaching" <${Deno.env.get("GMAIL_BUSINESS")}>`,
  to: recipientEmail,
  subject: subject,
  html: personalizedHtml,
  text: textFallback,       // always include plain text fallback
  headers: {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  },
});
```

**Common Gmail App Password pitfalls:**
- App Password is a 16-character code (no spaces) generated at myaccount.google.com → Security → App Passwords.
- 2-Step Verification must be enabled on the Google account first.
- Use `port: 587` with `secure: false` (STARTTLS). Port 465 with `secure: true` also works but 587 is preferred.
- The `from` display name and address must match the authenticated account or Gmail will override it.

---

## D. Next.js API Route Proxy Pattern

All frontend → Supabase communication goes through Next.js API routes. The browser never sees tokens.

This is the canonical pattern. All other API routes follow the same structure.

**`app/api/contacts/lookup/route.ts`**
```typescript
import { NextRequest, NextResponse } from "next/server";

const DATA_HANDLER_URL = process.env.SUPABASE_URL + "/functions/v1/data-handler";
const DATA_HANDLER_TOKEN = process.env.DATA_HANDLER_BEARER_TOKEN;

export async function POST(req: NextRequest) {
  // Auth gate — check session cookie
  const session = req.cookies.get("cc-mail-session");
  if (!session || session.value !== process.env.TOOL_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const response = await fetch(DATA_HANDLER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${DATA_HANDLER_TOKEN}`,
    },
    body: JSON.stringify({
      action: "contact_lookup",
      payload: body,
    }),
  });

  const data = await response.json();
  return NextResponse.json(data);
}
```

**`app/api/campaigns/route.ts`** (send)
```typescript
import { NextRequest, NextResponse } from "next/server";

const MAIL_SENDER_URL = process.env.SUPABASE_URL + "/functions/v1/mail-sender";
const MAIL_SENDER_TOKEN = process.env.MAIL_SENDER_BEARER_TOKEN;

export async function POST(req: NextRequest) {
  const session = req.cookies.get("cc-mail-session");
  if (!session || session.value !== process.env.TOOL_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const response = await fetch(MAIL_SENDER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${MAIL_SENDER_TOKEN}`,
    },
    body: JSON.stringify({
      action: "send_campaign",
      payload: body,
    }),
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.ok ? 200 : 500 });
}
```

**Session cookie pattern** (`lib/auth.ts`):
```typescript
import { cookies } from "next/headers";

export function checkSession(): boolean {
  const cookieStore = cookies();
  const session = cookieStore.get("cc-mail-session");
  return session?.value === process.env.TOOL_PASSWORD;
}

// In login route (app/api/auth/route.ts):
// On correct password → set cookie:
// response.cookies.set("cc-mail-session", password, {
//   httpOnly: true, secure: true, sameSite: "strict", maxAge: 60 * 60 * 24 * 7
// });
```

---

## E. Data-Handler Call Reference

The frontend uses three calls to the existing `data-handler` function. These map to API routes in the Next.js app.

---

### E.1 Contact Name Lookup
Used by the **Name Lookup** tab in RecipientSelector.

**Frontend call:** `POST /api/contacts/lookup`
**Proxied to:** `data-handler` action `contact_lookup`

**Request payload:**
```json
{ "email": "partial-or-full@email.com" }
```
or
```json
{ "contact_id": "CT0001" }
```

**Response shape:**
```typescript
{
  data: {
    id: string,                    // UUID
    first_name: string | null,
    last_name: string | null,
    email: string,
    contact_status: string,
    contact_tags: Array<{ tag: string, category: string }>,
    enrollment: Array<{ enrolled_group: string, is_active: boolean }>
  } | null
}
```

**UI usage:** Type-ahead search — call on each keystroke (debounced 300ms). If `data` is null, show "No contact found." If found, show name + email as a selectable chip.

---

### E.2 Tag-Based Recipient Selection
Used by the **Tag Select** tab in RecipientSelector.

**Frontend call:** `POST /api/contacts/tags`
**Proxied to:** `data-handler` action `contact_list`

**Request payload (fetch all active contacts with tags):**
```json
{
  "status": "active",
  "limit": 500
}
```

**Request payload (filter by one or more tags):**
```json
{
  "tags": ["Synergize Fitness", "ACTIVE"],
  "status": "active",
  "limit": 500
}
```

**Response shape:**
```typescript
{
  data: Array<{
    id: string,
    first_name: string | null,
    last_name: string | null,
    email: string,
    contact_status: string,
    contact_tags: Array<{ tag: string, category: string }>
  }>,
  count: number
}
```

**UI usage:**
1. On tab open, fetch all contacts (no tag filter) to populate available tag list from their `contact_tags`.
2. As user selects tags, re-fetch with `tags` filter to get matching contacts.
3. Display count: "14 contacts match". Confirm button loads them as recipient chips.

**Known tag categories and values** (from `data-handler` source):
```
day:     MON, TUE, WED, THU, FRI, SAT, SUN
slot:    "M/W/F 9", "M/W/F 6:15", "M/W/F 7:30", "M/W 4:30", "M/W 6:30",
         "TU/TH 6:15", "TU/TH 7:30", "TU/TH 9"
program: "Synergize Fitness", "Crawford Coaching", "WHOLE"
status:  ACTIVE, "PREVIOUS CLIENT", "PREVIOUS CLIENT - RECENT",
         INVOICE_CLIENT, BILLING_AUTO_MATCHED, EXCLUDE, "HAS INQUIRED", ADMIN
```

---

### E.3 Manual Email Entry
No API call — handled entirely client-side.

Textarea accepts one email per line or comma-separated. On parse, display as removable chips. No CRM lookup — these recipients will have `contact_id: null` and `first_name: null` when passed to `mail-sender` (the template will use a fallback like "there" for `{{FIRST_NAME}}`).

---

## F. Merge Tags Reference

Both templates support these merge tags. Replacement happens in `lib/templates.ts` and again per-recipient in `mail-sender`.

| Tag | Replaced by | Fallback if null |
|---|---|---|
| `{{FIRST_NAME}}` | `recipient.first_name` | `"there"` |
| `{{UNSUBSCRIBE_URL}}` | Tracker unsubscribe URL | Required — always present |
| `{{CURRENT_YEAR}}` | Current year (e.g. 2026) | — |

Newsletter-specific tags are the section content blocks (e.g. `{{INTRO_TITLE}}`, `{{BODY_COPY}}`) — these are replaced during template assembly in `lib/templates.ts` before the email is sent, so they are not per-recipient.

---

## G. MAIL_SENDER_BEARER_TOKEN — Generation

Generate a secure random token before first deploy:

```bash
# In terminal (Node.js)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add the output to:
1. `.env` as `MAIL_SENDER_BEARER_TOKEN=<value>`
2. Supabase secrets: `supabase secrets set MAIL_SENDER_BEARER_TOKEN=<value>`

---

## H. Supabase Storage Buckets

Create two buckets before first deploy (via Supabase dashboard or CLI):

| Bucket | Public | Purpose |
|---|---|---|
| `mail-assets` | Yes (public) | Uploaded images referenced in emails |
| `sent-mail-archive` | No (private) | Archived HTML of sent campaigns |

Images uploaded via the compose UI are stored in `mail-assets` and referenced by URL in the template HTML. The URL pattern is:
```
${SUPABASE_URL}/storage/v1/object/public/mail-assets/{filename}
```

---

## I. Package.json Starting Point

```json
{
  "name": "crawford-coaching-mailer",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@supabase/supabase-js": "^2.43.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "tailwindcss": "^3.4.0",
    "postcss": "^8",
    "autoprefixer": "^10",
    "typescript": "^5"
  }
}
```

Note: `nodemailer` is not in `package.json` — it is imported via `npm:nodemailer@6` inside the Deno Edge Function only.

---

*This addendum is the implementation companion to crawford-mailing-tool-spec.md. Read both together before starting a build session with Copilot.*
