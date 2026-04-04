# Crawford Coaching Mailer — Handoff Note

**Session date:** current  
**Reason for handoff:** Rebooting from Windows to Linux dual-boot to continue Next.js webapp build  
**Next session should start at:** Step 3 — Landing page

---

## Why Linux

Next.js dynamic routes use `[slug]` directory names. Windows / Node.js cannot
handle square brackets in filesystem paths reliably (EISDIR on readlink). The
webapp will build and run correctly on Linux without any code changes.

---

## Project location

```
E:\crawford-coaching-mailer\   (Windows)
/mnt/e/crawford-coaching-mailer/   (WSL / Linux path to same files)
```

The Linux path will depend on your mount. The project is a single repo — no
separate clone needed if using the same drive.

---

## What is complete

### Python pipeline (fully working)

| File | Status |
|---|---|
| `renderer.py` | Rewritten — JSON input, Anthropic proofreading, archive output |
| `templates/newsletter.html` | Updated — new placeholders (BODY_SUBTITLE etc.), EDITION_LABEL, per-story gym section, image captions/URLs |
| `newsletter-form.html` | In project root — standalone browser form, exports JSON to clipboard |
| `send.py` | Updated — render_newsletter call signature fixed |
| `content/15-becoming-a-snacker.json` | Example edition content, Issue 15 |
| `requirements.txt` | Added anthropic, python-dotenv |
| `.env` | Contains ANTHROPIC_API_KEY — loaded automatically by renderer.py |
| `assets/` | Created (empty — images go here per edition for local preview) |
| `content/` | Created |

Test the Python pipeline any time:
```bash
python renderer.py content/15-becoming-a-snacker.json
# output: archives/15-becoming-a-snacker/rendered.html
```

### Database migration

`migrations/003_edition_slug.sql` — adds `edition_slug` column to
`sent_campaigns`. Run this against Supabase before the webapp goes live.

### webapp/ structure (built, not yet verified on Linux)

All files created. Node modules not committed — run `npm install` first.

**Structural / config (all complete, no changes needed):**
- `webapp/package.json`
- `webapp/tsconfig.json`
- `webapp/tailwind.config.ts`
- `webapp/next.config.mjs` — includes `webpack: config.resolve.symlinks = false` (keep this)
- `webapp/postcss.config.js`
- `webapp/next-env.d.ts`

**App shell (all complete, no changes needed):**
- `webapp/app/globals.css` — Tailwind base + custom classes (field, label, btn-primary, btn-ghost)
- `webapp/app/layout.tsx` — HTML shell, Google Fonts (Cormorant Garamond, Libre Baskerville, Jost)
- `webapp/app/page.tsx` — root redirect: unauthenticated → /login, authenticated → /editions
- `webapp/app/login/page.tsx` — passcode gate, posts to /api/auth

**Auth (complete, no changes needed):**
- `webapp/lib/auth.ts` — checkSession / setSessionCookie / clearSessionCookie
- `webapp/app/api/auth/route.ts` — POST (login) / DELETE (logout)
- Env var required: `TOOL_PASSWORD`

**Supabase client (complete):**
- `webapp/lib/supabase.ts` — getSupabaseClient() + newsletterPublicUrl()
- Env vars required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

**Template rendering (complete):**
- `webapp/lib/templates.ts` — full TypeScript port of renderer.py
  - Exports: `NewsletterContent`, `FoodSection`, `GymSection`, `LocalSection`, `GymStory`
  - Exports: `renderNewsletterPreview(data: Partial<NewsletterContent>): string`
  - Loads from `webapp/templates/newsletter.html` (copy of project root template)
- `webapp/templates/newsletter.html` — copy of root `templates/newsletter.html`
- `webapp/templates/general.html` — copy of root `templates/general.html`

**API routes (complete):**

| Route | Method | Purpose |
|---|---|---|
| `/api/auth` | POST | Login — sets session cookie |
| `/api/auth` | DELETE | Logout |
| `/api/preview` | POST | Render newsletter HTML preview |
| `/api/assets` | POST | Upload image → `newsletters/{slug}/images/{file}` |
| `/api/editions` | GET | List edition folders from Supabase storage |
| `/api/editions` | POST | Create new edition folder + stub content.json |
| `/api/editions/[slug]` | GET | Load content.json for an edition |
| `/api/editions/[slug]` | PUT | Save content.json for an edition |

**Components (complete):**
- `webapp/components/PreviewPanel.tsx` — iframe preview, unchanged from archive
- `webapp/components/Nav.tsx` — Editions link + Sign Out button

---

## What is NOT yet built (do these in order)

### Step 3 — Landing page: `webapp/app/editions/page.tsx`

A server component. Needs to:
1. Check session — redirect to /login if not authenticated
2. Fetch edition folder list via Supabase storage (`newsletters/` bucket, top-level folders)
3. Fetch most recent sent campaign from `sent_campaigns` table (order by sent_at desc, limit 1)
   — join with `campaign_events` for open/click/unsubscribe counts
4. Render:
   - Analytics card at top (most recent send: subject, sent date, recipients, open rate, clicks, unsubs)
   - "New Edition" button → opens a modal or inline form: edition number + article title inputs
     — slug computed as `{number}-{slugified-title}` (lowercase, spaces to hyphens)
     — POST to /api/editions → redirects to /editions/{slug}
   - Edition list below: one row per folder, showing slug + "Sent ✓" or "Draft" status
     (match folder name against `edition_slug` in sent_campaigns to determine status)
   - Each edition row links to /editions/{slug}

Layout uses Nav component at top.

Design language: dark theme (bg-ink, cards bg-slate, borders border-fog, text-pale).
Keep it simple and functional — this is a private tool.

### Step 4 — Edition form: `webapp/app/editions/[slug]/page.tsx`

A client component. Split-screen layout: form left (~520px), preview right (fills remaining space).

On mount:
- GET /api/editions/{slug} → pre-fill all form fields if content.json exists

Fields match `newsletter-form.html` exactly (same field names, same sections):
- Edition Details: edition_label, subject
- Intro: intro_title, intro_tagline, intro_body (tall textarea), full_blog_url, blogcast_url, subscribe_url
- Food for the Body: subtitle, copy (tall textarea), image (text + drag-drop upload), image_alt,
  image_caption, image_url, image_layout (portrait/landscape select), cta_label, cta_url
- Food for Thought: same fields
- Food for the Brain: same fields
- Food for the Soul: same fields
- Gym News (optional toggle): enabled checkbox, closure_dates, then story1 fields
  (heading, copy, image+upload, image_alt, image_caption, image_url, cta_label, cta_url),
  story2_enabled checkbox, story2 same fields
- Local News (optional toggle): enabled checkbox, subtitle, copy, image+upload,
  image_alt, image_caption, image_url

Image upload behaviour (on each image field):
- Drag-drop zone OR click-to-browse
- On file drop/select: POST to /api/assets with { file, slug }
- On success: auto-fill the image URL field with the returned Supabase URL

Action bar (sticky at bottom of form column):
- "Save" button → PUT /api/editions/{slug} with current form state → show brief "Saved" confirmation
- "Preview" button → POST /api/preview with current form state → update PreviewPanel
- "Export JSON" button → JSON.stringify current state → copy to clipboard (same as newsletter-form.html)
- Auto-save on blur (optional, nice to have)

Preview panel (right column):
- Uses PreviewPanel component (already built)
- Initially empty with placeholder text
- Updated on Preview button click

Nav at top (already built).

### Step 5 — Vercel deployment config

Create `webapp/vercel.json`:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs"
}
```

Set these environment variables in the Vercel project settings:
- `TOOL_PASSWORD` — shared passcode for the tool
- `SUPABASE_URL` — e.g. https://yxndmpwqvdatkujcukdv.supabase.co
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (server-side only, never public)

In Vercel project settings, set **Root Directory** to `webapp`.

---

## First actions when you boot into Linux

```bash
# 1. Navigate to the project (adjust mount path if needed)
cd /mnt/e/crawford-coaching-mailer/webapp

# 2. Install dependencies
npm install

# 3. Create .env.local for local dev
cat > .env.local << 'EOF'
TOOL_PASSWORD=your-passcode-here
SUPABASE_URL=https://yxndmpwqvdatkujcukdv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
EOF

# 4. Verify the build works
npm run build

# 5. If build passes, start dev server and open http://localhost:3000
npm run dev
```

If the build passes, proceed to Step 3 (landing page).
If there are TypeScript errors, they will be specific and fixable — check diagnostics.

---

## Supabase storage bucket requirements

The `newsletters` bucket must exist in Supabase storage and allow authenticated
(service role) reads and writes. The `mail-assets` bucket already exists with
the fixed assets (header, logo, badges).

Run `migrations/003_edition_slug.sql` against the Supabase database before testing
the landing page analytics card.

---

## Key design decisions already made

- **Slug format:** `{number}-{slugified-title}` e.g. `15-becoming-a-snacker`
- **Content format:** JSON matching the schema in `webapp/lib/templates.ts` (`NewsletterContent`)
- **Template:** Python renderer and webapp both read `newsletter.html` — Python from
  `templates/newsletter.html`, webapp from `webapp/templates/newsletter.html` (a copy).
  When the template changes, update both copies.
- **Python renderer stays local** for final render before sending (all image URLs
  must be Supabase public URLs at that point). The webapp handles content editing
  and preview only.
- **No Supabase Auth** — simple shared passcode (`TOOL_PASSWORD` env var).
  7-day session cookie. Suitable for a private single-user tool.
- **Analytics join:** `sent_campaigns.edition_slug` (added in migration 003) links
  database campaign rows to storage folder names. Populate this when sending via webapp.

---

*End of handoff. Resume at Step 3.*