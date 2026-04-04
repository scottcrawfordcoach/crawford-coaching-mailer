# Crawford Coaching Newsletter — Design Refinement Briefing

## What This Is

You are refining the HTML email template for Crawford Coaching's newsletter. The template has been built and rendered with real content (Issue 15: "Becoming a Snacker"). Your job is to improve the visual design of the rendered HTML while preserving the template placeholder system so the result can be brought back into the build pipeline.

---

## Project Context

### Build Pipeline

This newsletter is built with a local Python CLI tool. The workflow is:

1. **Draft** — Scott writes newsletter content in a `.docx` file
2. **Content file** — The draft is converted to a Python dict (`content.py`) that maps content to template slots
3. **Renderer** — `renderer.py` loads the HTML template, replaces `{{PLACEHOLDERS}}` with content, and processes `{{#if FLAG}}...{{/if FLAG}}` conditionals
4. **Archiver** — The rendered HTML is saved to an archive folder with images copied alongside it
5. **Send** — When ready, the HTML is sent via Gmail SMTP through a Supabase Edge Function that injects per-recipient tracking (open pixel, click-wrapped links, unsubscribe URL)

### What This Means for You

- **All styles must be inline.** Email clients strip `<head>` styles inconsistently. The `<style>` block in `<head>` is a progressive enhancement only (used for the `a { color: #2d86c4; }` default and the `@media` responsive overrides).
- **Do not use CSS variables, flexbox, or grid.** Email rendering requires `<table>` layouts with inline styles.
- **Preserve all `{{PLACEHOLDER}}` names exactly.** These are replaced by the renderer at build time.
- **Preserve all `{{#if FLAG}}...{{/if FLAG}}` conditional blocks.** These control whether optional sections appear.
- **The `<!-- {{OPEN_PIXEL}} -->` comment near `</body>` must remain.** The mail-sender replaces it with a tracking pixel per recipient.
- **`{{UNSUBSCRIBE_URL}}` must remain in the footer.** It's replaced with a per-recipient unsubscribe link at send time.
- **Images referenced as local filenames** (like `body-plate.png`) are correct for preview. Before actual sending, they'll be replaced with Supabase storage URLs.

---

## Design Language

The newsletter should feel like it belongs on [crawford-coaching.ca](https://crawford-coaching.ca). The website's CSS custom properties define the palette:

### Colour Tokens

| Token | Hex | Usage |
|---|---|---|
| `--ink` | `#0e0f10` | Outer background / page canvas |
| `--slate` | `#1c2330` | Main content panel background |
| `--slate-mid` | `#232f3e` | Secondary panels (gym news, local news) |
| `--fog` | `#3d4a58` | Subtle UI elements, borders |
| `--mist` | `#7a8fa3` | Muted text (quotes, footer, captions) |
| `--pale` | `#c8d4de` | Body text, button labels |
| `--white` | `#f5f3ef` | Headings, greeting, high-emphasis text |
| `--brand-blue` | `#2d86c4` | Accent — links, section labels, button borders |
| `--brand-blue-light` | `#4fa3d8` | Hover states (not usable in email, but reference) |

### Typography

The website uses `Cormorant Garamond`, `Libre Baskerville`, and `Jost`. Email clients won't load web fonts, so the template uses email-safe fallbacks:

| Role | Font stack |
|---|---|
| Serif (headings, body copy) | `Georgia, 'Times New Roman', serif` |
| Sans-serif (section labels, buttons, footer) | `Arial, Helvetica, sans-serif` |

### Visual Characteristics

- **Dark, quiet, editorial.** Not flashy. Feels like a well-designed long-read.
- **Generous whitespace.** Content breathes. Sections are clearly separated.
- **Subtle blue accents.** Links and interactive elements use `#2d86c4` sparingly.
- **Ghost-style CTA buttons.** Transparent background, subtle border (`rgba(45,134,196,0.4)`), uppercase label in `#c8d4de`. Not loud.
- **Section images** have a faint blue border: `border: 1px solid rgba(45,134,196,0.15)`.
- **Dividers** between sections are 1px lines in `#2a3444`.
- **The overall tone is:** thoughtful coach writing a personal letter, not a marketing blast.

---

## Template Structure

The newsletter has this section order:

```
[Header image]                    — hosted at Supabase, full-width
[Intro]                           — title, opening quote, greeting, long-form body, action links, website CTA
  — divider —
[Food for the BODY]               — image left, text right, CTA button
  — divider —
[Food for THOUGHT]                — text left, image right, CTA button
  — divider —
[Food for the BRAIN]              — image left, text right, CTA button
  — divider —
[Food for the SOUL]               — text left, image right, CTA button
  — divider —
[GYM NEWS]        {{#if GYM_ENABLED}}     — slate-mid background, items list, CTA
  — divider —
[LOCAL NEWS]      {{#if LOCAL_ENABLED}}    — slate-mid background, subtitle + body
  — divider —
[Footer]                          — social icons, logo, credential badges, legal, unsubscribe
[Open pixel]                      — <!-- {{OPEN_PIXEL}} --> comment
```

### Template Placeholders (must be preserved exactly)

**Simple replacements:**
`{{INTRO_TITLE}}`, `{{INTRO_TAGLINE}}`, `{{FIRST_NAME}}`, `{{INTRO_BODY}}`, `{{SHARE_URL}}`, `{{SUBSCRIBE_URL}}`, `{{FULL_BLOG_URL}}`, `{{BODY_TITLE}}`, `{{BODY_COPY}}`, `{{BODY_IMAGE}}`, `{{BODY_CTA_LABEL}}`, `{{BODY_CTA_URL}}`, `{{THOUGHT_TITLE}}`, `{{THOUGHT_COPY}}`, `{{THOUGHT_IMAGE}}`, `{{THOUGHT_CTA_LABEL}}`, `{{THOUGHT_CTA_URL}}`, `{{BRAIN_TITLE}}`, `{{BRAIN_COPY}}`, `{{BRAIN_IMAGE}}`, `{{BRAIN_CTA_LABEL}}`, `{{BRAIN_CTA_URL}}`, `{{SOUL_TITLE}}`, `{{SOUL_COPY}}`, `{{SOUL_IMAGE}}`, `{{SOUL_CTA_LABEL}}`, `{{SOUL_CTA_URL}}`, `{{GYM_CONTENT}}`, `{{GYM_CTA_LABEL}}`, `{{GYM_CTA_URL}}`, `{{LOCAL_CONTENT}}`, `{{CURRENT_YEAR}}`, `{{UNSUBSCRIBE_URL}}`

**Conditional blocks:**
`{{#if INTRO_ACTIONS_ENABLED}}...{{/if INTRO_ACTIONS_ENABLED}}`, `{{#if BODY_IMAGE}}...{{/if BODY_IMAGE}}`, `{{#if BODY_CTA_LABEL}}...{{/if BODY_CTA_LABEL}}`, `{{#if THOUGHT_IMAGE}}...{{/if THOUGHT_IMAGE}}`, `{{#if THOUGHT_CTA_LABEL}}...{{/if THOUGHT_CTA_LABEL}}`, `{{#if BRAIN_IMAGE}}...{{/if BRAIN_IMAGE}}`, `{{#if BRAIN_CTA_LABEL}}...{{/if BRAIN_CTA_LABEL}}`, `{{#if SOUL_IMAGE}}...{{/if SOUL_IMAGE}}`, `{{#if SOUL_CTA_LABEL}}...{{/if SOUL_CTA_LABEL}}`, `{{#if GYM_ENABLED}}...{{/if GYM_ENABLED}}`, `{{#if GYM_CTA_LABEL}}...{{/if GYM_CTA_LABEL}}`, `{{#if LOCAL_ENABLED}}...{{/if LOCAL_ENABLED}}`

---

## Content Features Not Yet in Template

These fields are defined in the content data but the current template does not render them. If your design wants to use them, add the corresponding placeholder and I'll wire it up in the renderer.

| Feature | Where | Notes |
|---|---|---|
| `image_alt` | All four food sections | Currently the subtitle is used as alt text. Custom alt text is available. |
| `image_credit` | food_brain (`"Jacob Zocherman"`) | Photo credit line beneath the image |
| `blogcast_url` | intro_actions | Audio link — "Listen to the blogcast" |
| Per-item `image` | gym_news items (e.g. `timer.png`) | Currently gym items are text-only |
| `image` | local_news (`ten.png`) | Currently local news is text-only |

---

## Files to Upload to This Project

1. **`rendered.html`** — The current rendered output. This is what you're refining. It has real content filled in so you can see the actual newsletter.
2. **`newsletter.html`** — The template with `{{PLACEHOLDERS}}` intact. This is what you'll modify and return. Your design changes go here.
3. **This file** (`design-briefing.md`) — The briefing you're reading now.
4. **Images** (optional, for visual reference): `body-plate.png`, `jasmin-paris.jpg`, `rx-bar.png`, `peaceful-grass.png`, `timer.png`, `ten.png`

---

## What I Need Back

A single revised `newsletter.html` file that:

1. Has all `{{PLACEHOLDER}}` names and `{{#if}}` blocks intact and unchanged
2. Uses only inline styles (with the `<style>` block kept for the `a` colour default and `@media` responsive rules)
3. Uses `<table>` layout (no flexbox/grid)
4. Keeps the `<!-- {{OPEN_PIXEL}} -->` comment before `</body>`
5. Keeps `{{UNSUBSCRIBE_URL}}` in the footer

I will drop this file directly into `templates/newsletter.html` in the build pipeline, rebuild, and preview.