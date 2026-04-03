import fs from "fs";
import path from "path";

// Load template files relative to project root
function loadTemplate(name: "general" | "newsletter"): string {
  const filePath = path.join(process.cwd(), "templates", `${name}.html`);
  return fs.readFileSync(filePath, "utf-8");
}

// ---------------------------------------------------------------------------
// Shared merge tags
// ---------------------------------------------------------------------------

export interface BaseRecipient {
  first_name?: string | null;
  email: string;
}

function applyBaseTags(html: string, recipient: BaseRecipient): string {
  const firstName = recipient.first_name ?? "there";
  const year = new Date().getFullYear().toString();
  return html
    .replace(/\{\{FIRST_NAME\}\}/g, escapeHtml(firstName))
    .replace(/\{\{CURRENT_YEAR\}\}/g, year);
}

// UNSUBSCRIBE_URL is injected per-recipient by mail-sender (it knows the recipient_id).
// Here we leave the placeholder so mail-sender can replace it.

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Conditional block processing: {{#if TAG}} ... {{/if TAG}}
// If the tag value is falsy, the entire block (including surrounding
// table row separators) is removed.
// ---------------------------------------------------------------------------

function processConditionals(
  html: string,
  vars: Record<string, string | boolean | null | undefined>,
): string {
  return html.replace(
    /\{\{#if ([A-Z_]+)\}\}([\s\S]*?)\{\{\/if \1\}\}/g,
    (_match, tag: string, inner: string) => {
      const val = vars[tag];
      return val ? inner : "";
    },
  );
}

// ---------------------------------------------------------------------------
// General email template
// ---------------------------------------------------------------------------

export interface GeneralTemplateVars {
  body: string;
}

export function renderGeneral(
  vars: GeneralTemplateVars,
  recipient: BaseRecipient,
): string {
  let html = loadTemplate("general");
  html = html.replace(/\{\{BODY\}\}/g, vars.body);
  html = applyBaseTags(html, recipient);
  return html;
}

// ---------------------------------------------------------------------------
// Newsletter template
// ---------------------------------------------------------------------------

export interface NewsletterSection {
  title: string;
  copy: string;           // raw HTML allowed
  image?: string | null;  // hosted URL or null
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}

export interface NewsletterTemplateVars {
  introTitle: string;
  introTagline: string;
  introBody: string;
  body: NewsletterSection;
  thought: NewsletterSection;
  brain: NewsletterSection;
  soul: NewsletterSection;
  gymEnabled?: boolean;
  gymContent?: string | null;
  gymCtaLabel?: string | null;
  gymCtaUrl?: string | null;
  localEnabled?: boolean;
  localContent?: string | null;
}

export function renderNewsletter(
  vars: NewsletterTemplateVars,
  recipient: BaseRecipient,
): string {
  let html = loadTemplate("newsletter");

  // Inject all named merge tags
  const replacements: Record<string, string> = {
    INTRO_TITLE:   vars.introTitle,
    INTRO_TAGLINE: vars.introTagline,
    INTRO_BODY:    vars.introBody,

    BODY_TITLE:   vars.body.title,
    BODY_COPY:    vars.body.copy,
    BODY_IMAGE:   vars.body.image ?? "",
    BODY_CTA_LABEL: vars.body.ctaLabel ?? "",
    BODY_CTA_URL:   vars.body.ctaUrl ?? "",

    THOUGHT_TITLE:     vars.thought.title,
    THOUGHT_COPY:      vars.thought.copy,
    THOUGHT_IMAGE:     vars.thought.image ?? "",
    THOUGHT_CTA_LABEL: vars.thought.ctaLabel ?? "",
    THOUGHT_CTA_URL:   vars.thought.ctaUrl ?? "",

    BRAIN_TITLE:     vars.brain.title,
    BRAIN_COPY:      vars.brain.copy,
    BRAIN_IMAGE:     vars.brain.image ?? "",
    BRAIN_CTA_LABEL: vars.brain.ctaLabel ?? "",
    BRAIN_CTA_URL:   vars.brain.ctaUrl ?? "",

    SOUL_TITLE:     vars.soul.title,
    SOUL_COPY:      vars.soul.copy,
    SOUL_IMAGE:     vars.soul.image ?? "",
    SOUL_CTA_LABEL: vars.soul.ctaLabel ?? "",
    SOUL_CTA_URL:   vars.soul.ctaUrl ?? "",

    GYM_CONTENT:   vars.gymContent ?? "",
    GYM_CTA_LABEL: vars.gymCtaLabel ?? "",
    GYM_CTA_URL:   vars.gymCtaUrl ?? "",

    LOCAL_CONTENT: vars.localContent ?? "",
  };

  for (const [tag, value] of Object.entries(replacements)) {
    html = html.replace(new RegExp(`\\{\\{${tag}\\}\\}`, "g"), value);
  }

  // Process conditional blocks
  const conditionalVars: Record<string, boolean> = {
    BODY_IMAGE:   !!vars.body.image,
    BODY_CTA_LABEL: !!vars.body.ctaLabel,
    THOUGHT_IMAGE: !!vars.thought.image,
    THOUGHT_CTA_LABEL: !!vars.thought.ctaLabel,
    BRAIN_IMAGE:   !!vars.brain.image,
    BRAIN_CTA_LABEL: !!vars.brain.ctaLabel,
    SOUL_IMAGE:    !!vars.soul.image,
    SOUL_CTA_LABEL: !!vars.soul.ctaLabel,
    GYM_ENABLED:   !!vars.gymEnabled,
    LOCAL_ENABLED: !!vars.localEnabled,
    GYM_CTA_LABEL: !!vars.gymCtaLabel,
  };

  html = processConditionals(html, conditionalVars);
  html = applyBaseTags(html, recipient);
  return html;
}

// ---------------------------------------------------------------------------
// Preview render (no recipient - uses placeholder values)
// ---------------------------------------------------------------------------

export function renderGeneralPreview(vars: GeneralTemplateVars): string {
  return renderGeneral(vars, { first_name: "{{FIRST_NAME}}", email: "" });
}

export function renderNewsletterPreview(vars: NewsletterTemplateVars): string {
  return renderNewsletter(vars, { first_name: "{{FIRST_NAME}}", email: "" });
}
