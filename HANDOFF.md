# Crawford Coaching Mailer — Handoff Note

**Session date:** current  
**Reason for handoff:** Switching from Zed (Flatpak) to VS Code for better terminal access  
**Next session should start at:** Git push → Vercel deploy → smoke test

---

## Current state

All code is written and TypeScript-clean. The webapp is **not yet pushed to git**.
The next action is a `git add / commit / push` from a real terminal (VS Code integrated
terminal works fine), then verify the Vercel deploy.

---

## Project location

```
/mnt/e/crawford-coaching-mailer/   (WSL path — adjust mount letter if needed)
```

Node modules are installed (`webapp/node_modules/` exists).  
`.env.local` still needs to be created for local dev (see below).  
Vercel environment variables are already set in the Vercel dashboard.  
Migration `003_edition_slug.sql` has already been run in Supabase.

---

## What is complete

### Python pipeline (fully working, no changes needed)

| File | Status |
|---|---|
| `renderer.py` | Rewritten — JSON input, Anthropic proofreading, archive output |
| `templates/newsletter.html` | Updated — all placeholders, EDITION_LABEL, per-story gym section, image captions/URLs |
| `newsletter-form.html` | Standalone browser form in project root — exports JSON to clipboard |
| `send.py` | Updated — render_newsletter call signature fixed |
| `content/15-becoming-a-snacker.json` | Example edition content, Issue 15 |
| `requirements.txt` | Includes anthropic, python-dotenv |
| `.env` | Contains ANTHROPIC_API_KEY — loaded automatically by renderer.py |

Test any time:
```bash
python renderer.py content/15-becoming-a-snacker.json
# output: archives/15-becoming-a-snacker/rendered.html
```

---

### webapp/ — fully built, TypeScript clean

#### Config / shell (no changes needed)
- `webapp/package.json`
- `webapp/tsconfig.json`
- `webapp/tailwind.config.ts` — custom color tokens: ink, slate, slate-mid, fog, mist, pale, white, brand-blue
- `webapp/next.config.mjs` — `config.resolve.symlinks = false` (keep this)
- `webapp/postcss.config.js`
- `webapp/next-env.d.ts`
- `webapp/vercel.json` — buildCommand, outputDirectory, framework: nextjs

#### App shell
- `webapp/app/globals.css` — Tailwind base + `.field`, `.label`, `.btn-primary`, `.btn-ghost`, `.chip`
- `webapp/app/layout.tsx` — HTML shell, Google Fonts (Cormorant Garamond, Libre Baskerville, Jost)
- `webapp/app/page.tsx` — root redirect: unauthenticated → /login, authenticated → /editions
- `webapp/app/login/page.tsx` — passcode gate, POSTs to /api/auth

#### Auth
- `webapp/lib/auth.ts` — `checkSession()` / `setSessionCookie()` / `clearSessionCookie()`
- `webapp/app/api/auth/route.ts` — POST (login) / DELETE (logout)
- Env var: `TOOL_PASSWORD`

#### Supabase client
- `webapp/lib/supabase.ts` — `getSupabaseClient()` + `newsletterPublicUrl()`
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

#### Template rendering
- `webapp/lib/templates.ts` — TypeScript port of renderer.py
  - Types: `NewsletterContent`, `FoodSection`, `GymSection`, `LocalSection`, `GymStory`
  - Exports: `renderNewsletterPreview(data: Partial<NewsletterContent>): string`
  - Reads from `webapp/templates/newsletter.html`
- `webapp/templates/newsletter.html` — copy of root `templates/newsletter.html`
- `webapp/templates/general.html` — copy of root `templates/general.html`

#### API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/auth` | POST | Login — sets 7-day session cookie |
| `/api/auth` | DELETE | Logout — clears cookie |
| `/api/preview` | POST | Body: `{ vars: Partial<NewsletterContent> }` → returns raw HTML |
| `/api/assets` | POST | FormData `{ file, slug }` → uploads to `newsletters/{slug}/images/` → returns `{ url, filename }` |
| `/api/editions` | GET | List edition folders from Supabase storage |
| `/api/editions` | POST | Body: `{ slug }` → create folder + empty content.json |
| `/api/editions/[slug]` | GET | Returns `{ content: NewsletterContent \| null }` |
| `/api/editions/[slug]` | PUT | Body: NewsletterContent → saves content.json, upsert |

#### Components
- `webapp/components/Nav.tsx` — top bar: "Crawford Coaching" wordmark, Editions link, Sign Out
- `webapp/components/PreviewPanel.tsx` — iframe that writes HTML via `doc.write()`
- `webapp/components/NewEditionModal.tsx` — inline expandable form: edition number + title → computes slug → POST /api/editions → router.push
- `webapp/components/ImageUpload.tsx` — drag-and-drop or click-to-browse; POSTs to /api/assets; shows filename badge when URL is set

#### Pages
- `webapp/app/editions/page.tsx` — **Server Component**
  - Session guard → redirect /login
  - Fetches storage folders, most recent campaign + event counts (opens/clicks/unsubs), all sent slugs
  - Renders: analytics card, Editions heading + New Edition button, edition list (Draft / Sent ✓)
- `webapp/app/editions/[slug]/page.tsx` — **Client Component**
  - `h-screen` split: 520px scrollable form left | flex-1 preview right
  - All 8 form sections: Edition Details, Introduction, Food ×4, Gym News (optional, up to 2 stories), Local News (optional)
  - `ImageUpload` on every image field — auto-fills filename + URL on upload
  - Sticky action bar: Save → PUT content.json · Preview → POST /api/preview → iframe · Export JSON → clipboard
  - On mount: GET content.json, deep-merge with empty defaults

---

## Immediate next actions

### 1. Push to git (from VS Code terminal)

```bash
git add webapp/app/editions/page.tsx \
        "webapp/app/editions/[slug]/page.tsx" \
        webapp/components/NewEditionModal.tsx \
        webapp/components/ImageUpload.tsx \
        webapp/vercel.json

git commit -m "feat: add editions landing page, editor, and vercel config (steps 3-5)"

git push
```

### 2. Verify Vercel settings

In the Vercel project dashboard:
- **Root Directory:** `webapp`
- **Framework Preset:** Next.js
- **Environment Variables** (all three must be present):
  - `TOOL_PASSWORD`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

### 3. Smoke test after deploy

1. Open the deployed URL → should redirect to `/login`
2. Enter password → should land on `/editions`
3. If the `sent_campaigns` table has rows, the analytics card appears at top
4. Click **+ New Edition** → enter a number + title → Create → should navigate to `/editions/{slug}`
5. Fill in Edition Details + Introduction → click **Preview** → right panel should render the email
6. Click **Save** → should show "Saved ✓" briefly
7. Upload an image in a food section → filename badge should appear; URL field should auto-populate

### 4. Local dev (optional, for faster iteration)

```bash
cd webapp

# Create .env.local if it doesn't exist yet
cat > .env.local << 'EOF'
TOOL_PASSWORD=your-passcode-here
SUPABASE_URL=https://yxndmpwqvdatkujcukdv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
EOF

npm run build   # verify — should produce no errors
npm run dev     # http://localhost:3000
```

---

## Supabase storage requirements

- `newsletters` bucket must exist and allow service-role reads + writes
- `mail-assets` bucket exists with fixed assets (header, logo, badges)
- `migrations/003_edition_slug.sql` — **already run** ✓

---

## Key design decisions

- **Slug format:** `{number}-{slugified-title}` e.g. `15-becoming-a-snacker`
- **Content format:** JSON matching `NewsletterContent` in `webapp/lib/templates.ts`
- **Preview API:** expects `{ vars: Partial<NewsletterContent> }`, returns raw `text/html` (not JSON)
- **Template copies:** `templates/newsletter.html` (Python) and `webapp/templates/newsletter.html` (webapp) must be kept in sync when the template changes
- **Python renderer stays local** — used for final send only, after all image URLs are Supabase public URLs. The webapp is for editing and preview only.
- **No Supabase Auth** — shared passcode via `TOOL_PASSWORD`. 7-day session cookie. Fine for a private single-user tool.
- **Analytics join:** `sent_campaigns.edition_slug` links DB campaign rows to storage folders. Populate this column when the send flow is built.
- **`config.resolve.symlinks = false`** in `next.config.mjs` — keep this, required for the `[slug]` dynamic route to resolve correctly.

---

## What is NOT yet built

- **Send flow** — the workflow for doing a final render via `renderer.py` and dispatching the newsletter via the Python mailer. This is intentionally kept as a local Python step for now.
- **Edition slug written to `sent_campaigns`** — when a send is triggered, `edition_slug` should be saved alongside the campaign row so the landing page analytics card links back to the correct edition.

---

*End of handoff. Next step: git push and Vercel smoke test.*