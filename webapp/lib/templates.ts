import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Template loading
// ---------------------------------------------------------------------------

function loadTemplate(name: "general" | "newsletter"): string {
  const filePath = path.join(process.cwd(), "templates", `${name}.html`);
  return fs.readFileSync(filePath, "utf-8");
}

// ---------------------------------------------------------------------------
// Conditional processing — mirrors renderer.py's _process_conditionals
// Loops until stable to handle nested blocks.
// ---------------------------------------------------------------------------

function processConditionals(html: string, flags: Record<string, boolean>): string {
  const pattern = /\{\{#if\s+([A-Z0-9_]+)\s*\}\}([\s\S]*?)\{\{\/if\s+\1\s*\}\}/g;
  let result = html;
  let prev = "";
  while (prev !== result) {
    prev = result;
    result = result.replace(pattern, (_match, tag: string, inner: string) => {
      return flags[tag] ? inner : "";
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Text helpers — mirror renderer.py's _rich_text and _str
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function linkifyEscapedText(escapedText: string): string {
  const tokenPrefix = "__CC_LINK_";
  const links: string[] = [];

  const stash = (html: string) => {
    const token = `${tokenPrefix}${links.length}__`;
    links.push(html);
    return token;
  };

  // Support markdown-style links in plain text: [label](https://example.com)
  let result = escapedText.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) => {
    return stash(`<a href="${url}" style="color:#2d86c4;text-decoration:underline;">${label}</a>`);
  });

  // Auto-link bare URLs in plain text.
  result = result.replace(/https?:\/\/[^\s<]+/g, (rawUrl) => {
    let url = rawUrl;
    let trailing = "";

    const trailingMatch = url.match(/[.,!?;:]+$/);
    if (trailingMatch) {
      trailing = trailingMatch[0];
      url = url.slice(0, -trailing.length);
    }

    return `${stash(`<a href="${url}" style="color:#2d86c4;text-decoration:underline;">${url}</a>`)}${trailing}`;
  });

  return links.reduce((acc, html, idx) => acc.replace(`${tokenPrefix}${idx}__`, html), result);
}

function richText(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return "";
  if (text.includes("<")) return text;
  return text
    .split(/\n\n+/)
    .filter(Boolean)
    .map((p) => {
      const linked = linkifyEscapedText(escapeHtml(p.trim()));
      return `<p style="margin:0 0 16px 0;">${linked.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
}

function str(value: string | null | undefined): string {
  return (value ?? "").trim();
}

// Resolves a legacy relative image path (e.g. "assets/15-becoming-a-snacker/rx-bar.png")
// to its full Supabase public URL. Absolute URLs are returned unchanged.
function resolveImageSrc(image: string | null | undefined): string {
  const val = (image ?? "").trim();
  if (!val || val.startsWith("http")) return val;
  // Pattern: assets/{slug}/{filename}  — extract last two segments
  const parts = val.replace(/\\/g, "/").split("/").filter(Boolean);
  const filename = parts[parts.length - 1] ?? "";
  const slug = parts[parts.length - 2] ?? "";
  const base = process.env.SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/newsletters/${slug}/images/${filename}`;
}

// ---------------------------------------------------------------------------
// Content types — match content.json schema exactly
// ---------------------------------------------------------------------------

export interface FoodSection {
  subtitle: string;
  copy: string;
  image: string;
  image_alt: string;
  image_caption: string;
  image_url: string;
  image_layout: string;
  cta_label: string;
  cta_url: string;
  share_url?: string;
}

export interface GymStory {
  heading: string;
  copy: string;
  image: string;
  image_alt: string;
  image_caption: string;
  image_url: string;
  cta_label: string;
  cta_url: string;
}

export interface GymSection {
  enabled: boolean;
  closure_dates: string;
  story1: GymStory;
  story2_enabled: boolean;
  story2: GymStory;
}

export interface LocalSection {
  enabled: boolean;
  subtitle: string;
  copy: string;
  image: string;
  image_alt: string;
  image_caption: string;
  image_url: string;
}

export interface NewsletterContent {
  edition_label: string;
  subject: string;
  intro_title: string;
  intro_tagline: string;
  intro_body: string;
  full_blog_url: string;
  blogcast_url: string;
  subscribe_url: string;
  food_body: FoodSection;
  food_thought: FoodSection;
  food_brain: FoodSection;
  food_soul: FoodSection;
  gym_news: GymSection;
  local_news: LocalSection;
}

// ---------------------------------------------------------------------------
// Image flags — mirrors renderer.py's _image_flags
// ---------------------------------------------------------------------------

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
    [`${prefix}_IMAGE_LAYOUT_LANDSCAPE`]: isLandscape && hasImage,
  };
}

// ---------------------------------------------------------------------------
// Empty defaults
// ---------------------------------------------------------------------------

const EMPTY_FOOD: FoodSection = {
  subtitle: "", copy: "", image: "", image_alt: "", image_caption: "",
  image_url: "", image_layout: "portrait", cta_label: "", cta_url: "", share_url: "",
};

const EMPTY_STORY: GymStory = {
  heading: "", copy: "", image: "", image_alt: "", image_caption: "",
  image_url: "", cta_label: "", cta_url: "",
};

const EMPTY_GYM: GymSection = {
  enabled: false, closure_dates: "",
  story1: { ...EMPTY_STORY }, story2_enabled: false, story2: { ...EMPTY_STORY },
};

const EMPTY_LOCAL: LocalSection = {
  enabled: false, subtitle: "", copy: "", image: "",
  image_alt: "", image_caption: "", image_url: "",
};

// ---------------------------------------------------------------------------
// Newsletter preview render
// Mirrors renderer.py's render_newsletter, with FIRST_NAME set to "there"
// and UNSUBSCRIBE_URL set to "#" for safe preview display.
// ---------------------------------------------------------------------------

export function renderNewsletterPreview(data: Partial<NewsletterContent>): string {
  let html = loadTemplate("newsletter");

  const body    = { ...EMPTY_FOOD,  ...(data.food_body    ?? {}) };
  const thought = { ...EMPTY_FOOD,  ...(data.food_thought ?? {}) };
  const brain   = { ...EMPTY_FOOD,  ...(data.food_brain   ?? {}) };
  const soul    = { ...EMPTY_FOOD,  ...(data.food_soul    ?? {}) };
  const gym     = { ...EMPTY_GYM,   ...(data.gym_news     ?? {}) };
  const local   = { ...EMPTY_LOCAL, ...(data.local_news   ?? {}) };
  const gym1    = { ...EMPTY_STORY, ...(gym.story1 ?? {}) };
  const gym2    = { ...EMPTY_STORY, ...(gym.story2 ?? {}) };

  const replacements: Record<string, string> = {
    // Global
    EDITION_LABEL:   str(data.edition_label),
    INTRO_TITLE:     str(data.intro_title),
    INTRO_TAGLINE:   str(data.intro_tagline),
    INTRO_BODY:      richText(data.intro_body),
    FULL_BLOG_URL:   str(data.full_blog_url),
    BLOGCAST_URL:    str(data.blogcast_url),
    SUBSCRIBE_URL:   str(data.subscribe_url),
    // Food for the Body
    BODY_SUBTITLE:       str(body.subtitle),
    BODY_COPY:           richText(body.copy),
    BODY_IMAGE:          resolveImageSrc(body.image),
    BODY_IMAGE_ALT:      str(body.image_alt),
    BODY_IMAGE_CAPTION:  str(body.image_caption),
    BODY_IMAGE_URL:      str(body.image_url),
    BODY_CTA_LABEL:      str(body.cta_label),
    BODY_CTA_URL:        str(body.cta_url),
    BODY_SHARE_URL:      str(body.share_url),
    // Food for Thought
    THOUGHT_SUBTITLE:       str(thought.subtitle),
    THOUGHT_COPY:           richText(thought.copy),
    THOUGHT_IMAGE:          resolveImageSrc(thought.image),
    THOUGHT_IMAGE_ALT:      str(thought.image_alt),
    THOUGHT_IMAGE_CAPTION:  str(thought.image_caption),
    THOUGHT_IMAGE_URL:      str(thought.image_url),
    THOUGHT_CTA_LABEL:      str(thought.cta_label),
    THOUGHT_CTA_URL:        str(thought.cta_url),
    THOUGHT_SHARE_URL:      str(thought.share_url),
    // Food for the Brain
    BRAIN_SUBTITLE:       str(brain.subtitle),
    BRAIN_COPY:           richText(brain.copy),
    BRAIN_IMAGE:          resolveImageSrc(brain.image),
    BRAIN_IMAGE_ALT:      str(brain.image_alt),
    BRAIN_IMAGE_CAPTION:  str(brain.image_caption),
    BRAIN_IMAGE_URL:      str(brain.image_url),
    BRAIN_CTA_LABEL:      str(brain.cta_label),
    BRAIN_CTA_URL:        str(brain.cta_url),
    BRAIN_SHARE_URL:      str(brain.share_url),
    // Food for the Soul
    SOUL_SUBTITLE:        str(soul.subtitle),
    SOUL_COPY:            richText(soul.copy),
    SOUL_IMAGE:           resolveImageSrc(soul.image),
    SOUL_IMAGE_ALT:       str(soul.image_alt),
    SOUL_IMAGE_CAPTION:   str(soul.image_caption),
    SOUL_IMAGE_URL:       str(soul.image_url),
    SOUL_CTA_LABEL:       str(soul.cta_label),
    SOUL_CTA_URL:         str(soul.cta_url),
    SOUL_SHARE_URL:       str(soul.share_url),
    // Gym news
    GYM_CLOSURE_DATES:   richText(gym.closure_dates),
    GYM1_HEADING:        str(gym1.heading),
    GYM1_COPY:           richText(gym1.copy),
    GYM1_IMAGE:          resolveImageSrc(gym1.image),
    GYM1_IMAGE_ALT:      str(gym1.image_alt),
    GYM1_IMAGE_CAPTION:  str(gym1.image_caption),
    GYM1_IMAGE_URL:      str(gym1.image_url),
    GYM1_CTA_LABEL:      str(gym1.cta_label),
    GYM1_CTA_URL:        str(gym1.cta_url),
    GYM2_HEADING:        str(gym2.heading),
    GYM2_COPY:           richText(gym2.copy),
    GYM2_IMAGE:          resolveImageSrc(gym2.image),
    GYM2_IMAGE_ALT:      str(gym2.image_alt),
    GYM2_IMAGE_CAPTION:  str(gym2.image_caption),
    GYM2_IMAGE_URL:      str(gym2.image_url),
    GYM2_CTA_LABEL:      str(gym2.cta_label),
    GYM2_CTA_URL:        str(gym2.cta_url),
    // Local news
    LOCAL_SUBTITLE:      str(local.subtitle),
    LOCAL_COPY:          richText(local.copy),
    LOCAL_IMAGE:         resolveImageSrc(local.image),
    LOCAL_IMAGE_ALT:     str(local.image_alt),
    LOCAL_IMAGE_CAPTION: str(local.image_caption),
    LOCAL_IMAGE_URL:     str(local.image_url),
    // Footer / runtime
    CURRENT_YEAR:    new Date().getFullYear().toString(),
    FIRST_NAME:      "there",
    UNSUBSCRIBE_URL: "#",
  };

  for (const [tag, value] of Object.entries(replacements)) {
    html = html.replace(new RegExp(`\\{\\{${tag}\\}\\}`, "g"), value ?? "");
  }

  const flags: Record<string, boolean> = {
    GYM_ENABLED:   Boolean(gym.enabled),
    GYM2_ENABLED:  Boolean(gym.story2_enabled) && Boolean(gym2.heading),
    LOCAL_ENABLED: Boolean(local.enabled),

    GYM1_IMAGE:         Boolean(gym1.image),
    GYM1_IMAGE_URL:     Boolean(gym1.image_url) && Boolean(gym1.image),
    GYM1_IMAGE_CAPTION: Boolean(gym1.image_caption) && Boolean(gym1.image),
    GYM1_CTA_LABEL:     Boolean(gym1.cta_label),
    GYM2_IMAGE:         Boolean(gym2.image),
    GYM2_IMAGE_URL:     Boolean(gym2.image_url) && Boolean(gym2.image),
    GYM2_IMAGE_CAPTION: Boolean(gym2.image_caption) && Boolean(gym2.image),
    GYM2_CTA_LABEL:     Boolean(gym2.cta_label),

    LOCAL_IMAGE:         Boolean(local.image),
    LOCAL_IMAGE_URL:     Boolean(local.image_url) && Boolean(local.image),
    LOCAL_IMAGE_CAPTION: Boolean(local.image_caption) && Boolean(local.image),

    BODY_CTA_LABEL:    Boolean(body.cta_label),
    THOUGHT_CTA_LABEL: Boolean(thought.cta_label),
    BRAIN_CTA_LABEL:   Boolean(brain.cta_label),
    SOUL_CTA_LABEL:    Boolean(soul.cta_label),

    BODY_SHARE_URL:    Boolean(body.share_url),
    THOUGHT_SHARE_URL: Boolean(thought.share_url),
    BRAIN_SHARE_URL:   Boolean(brain.share_url),
    SOUL_SHARE_URL:    Boolean(soul.share_url),

    ...imageFlagsForSection(body,    "BODY"),
    ...imageFlagsForSection(thought, "THOUGHT"),
    ...imageFlagsForSection(brain,   "BRAIN"),
    ...imageFlagsForSection(soul,    "SOUL"),
  };

  return processConditionals(html, flags);
}
