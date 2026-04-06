"""
Crawford Coaching — Newsletter Renderer
=======================================
Reads a JSON content file (exported from newsletter-form.html) and an HTML template,
processes all {{PLACEHOLDERS}} and {{#if FLAG}}...{{/if FLAG}} conditionals, optionally
proofreads text fields via the Anthropic API, and writes the rendered HTML to the
archives folder.

Usage
-----
  # Standard render
  python renderer.py content/15-becoming-a-snacker.json

  # With AI proofreading pass (requires ANTHROPIC_API_KEY in environment)
  python renderer.py content/15-becoming-a-snacker.json --proofread

  # Render with a specific recipient name (overrides "there")
  python renderer.py content/15-becoming-a-snacker.json --name "Sarah"

  # Render general (non-newsletter) template
  python renderer.py --general "Email body text here" --name "Sarah"

Output
------
  archives/<edition-slug>/rendered.html
  archives/<edition-slug>/images/   (local image copies for preview)
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import shutil
from datetime import datetime
from html import escape
from pathlib import Path
from typing import Any

# Load .env automatically if python-dotenv is available (silent if not installed)
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

ROOT_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = ROOT_DIR / "templates"
ARCHIVES_DIR = ROOT_DIR / "archives"
CONTENT_DIR = ROOT_DIR / "content"


# ── Template loading ──────────────────────────────────────────────────────────


def _load_template(name: str) -> str:
    file_map = {
        "general": "general.html",
        "newsletter": "newsletter.html",
    }
    filename = file_map[name]
    return (TEMPLATES_DIR / filename).read_text(encoding="utf-8")


# ── Conditional processing ────────────────────────────────────────────────────


def _process_conditionals(html: str, flags: dict[str, bool]) -> str:
    """
    Processes {{#if FLAG}}...{{/if FLAG}} blocks.
    Also handles {{#if FLAG}}...{{/if FLAG}}{{else}}...{{/else FLAG}} is NOT
    supported — the template uses the simpler positive-only pattern.
    Runs in a loop until stable to handle nested conditionals.
    """
    pattern = re.compile(r"\{\{#if\s+([A-Z0-9_]+)\s*\}\}([\s\S]*?)\{\{/if\s+\1\s*\}\}")

    def repl(match: re.Match[str]) -> str:
        tag = match.group(1)
        inner = match.group(2)
        return inner if flags.get(tag, False) else ""

    while "{{#if" in html:
        new_html = pattern.sub(repl, html)
        if new_html == html:
            break
        html = new_html
    return html


# ── Text helpers ──────────────────────────────────────────────────────────────


def _linkify_escaped_text(escaped_text: str) -> str:
    """
    Converts markdown-style links and plain URLs to <a> tags.
    Input must already be HTML-escaped.
    """
    token_prefix = "__CC_LINK_"
    links: list[str] = []

    def stash(html: str) -> str:
        token = f"{token_prefix}{len(links)}__"
        links.append(html)
        return token

    def markdown_repl(match: re.Match[str]) -> str:
        label = match.group(1)
        url = match.group(2)
        return stash(
            f'<a href="{url}" style="color:#2d86c4;text-decoration:underline;">{label}</a>'
        )

    result = re.sub(
        r"\[([^\]]+)\]\((https?://[^\s)]+)\)",
        markdown_repl,
        escaped_text,
    )

    def url_repl(match: re.Match[str]) -> str:
        raw_url = match.group(0)
        url = raw_url
        trailing = ""
        trailing_match = re.search(r"[.,!?;:]+$", url)
        if trailing_match:
            trailing = trailing_match.group(0)
            url = url[: -len(trailing)]

        return (
            f"{stash(f'<a href=\"{url}\" style=\"color:#2d86c4;text-decoration:underline;\">{url}</a>')}"
            f"{trailing}"
        )

    result = re.sub(r"https?://[^\s<]+", url_repl, result)

    for idx, html in enumerate(links):
        result = result.replace(f"{token_prefix}{idx}__", html)

    return result


def _rich_text(value: Any) -> str:
    """
    Passes HTML through unchanged. Converts plain text to escaped HTML,
    turning double newlines into paragraph breaks.
    """
    text = str(value or "").strip()
    if not text:
        return ""
    if "<" in text:
        return text
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    return "\n".join(
        f'<p style="margin:0 0 16px 0;">{_linkify_escaped_text(escape(p)).replace(chr(10), "<br>")}</p>'
        for p in paragraphs
    )


def _str(value: Any) -> str:
    return str(value or "").strip()


# ── Anthropic proofreading ────────────────────────────────────────────────────


def _proofread(text: str) -> str:
    """
    Sends plain text to the Anthropic API for spelling and grammar correction.
    Returns the corrected text. Preserves voice and meaning — does not rewrite.
    Requires ANTHROPIC_API_KEY in the environment.
    Only called when --proofread flag is set. Skips HTML content (corrects
    plain text fields only to avoid breaking markup).
    """
    import anthropic

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": (
                    "Correct any spelling or grammar errors in the following text. "
                    "Do not change the meaning, tone, voice, or structure. "
                    "Return only the corrected text with no explanation or commentary.\n\n"
                    f"{text}"
                ),
            }
        ],
    )
    return message.content[0].text.strip()


def _maybe_proofread(value: str, proofread: bool) -> str:
    """
    Only proofreads plain text fields (not HTML). Skips empty values.
    """
    if not proofread or not value or "<" in value:
        return value
    return _proofread(value)


# ── Image helpers ─────────────────────────────────────────────────────────────


def _resolve_image(path_or_url: str) -> str:
    """
    Mirrors webapp's resolveImageSrc(). Converts a relative asset path such as
    'assets/15-becoming-a-snacker/body-plate.png' to a full Supabase public URL.
    Absolute URLs (starting with 'http') are returned unchanged.
    """
    val = (path_or_url or "").strip()
    if not val or val.startswith("http"):
        return val
    parts = val.replace("\\", "/").split("/")
    parts = [p for p in parts if p]
    filename = parts[-1] if parts else ""
    slug = parts[-2] if len(parts) >= 2 else ""
    base = os.getenv("SUPABASE_URL", "").rstrip("/")
    return f"{base}/storage/v1/object/public/newsletters/{slug}/images/{filename}"


def _image_flags(section: dict, prefix: str) -> dict[str, bool]:
    """
    Returns the conditional flags for a food section's image.
    prefix is e.g. "BODY", "THOUGHT", "BRAIN", "SOUL".
    """
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


def _gym_image_flags(story: dict, prefix: str) -> dict[str, bool]:
    """Returns image flags for a gym story. prefix is e.g. "GYM1", "GYM2"."""
    has_image = bool(story.get("image"))
    has_url = bool(story.get("image_url"))
    return {
        f"{prefix}_IMAGE": has_image,
        f"{prefix}_IMAGE_URL": has_url and has_image,
        f"{prefix}_IMAGE_CAPTION": bool(story.get("image_caption")) and has_image,
        f"{prefix}_IMAGE_CAPTION_PLAIN": bool(story.get("image_caption")) and not has_url and has_image,
    }


# ── Content loading ───────────────────────────────────────────────────────────


def _load_json_content(path: Path) -> dict[str, Any]:
    """Loads a JSON content file exported from the newsletter form."""
    return json.loads(path.read_text(encoding="utf-8"))


def _load_python_content(path: Path) -> dict[str, Any]:
    """
    Legacy loader — imports a content.py file and returns its `newsletter` dict.
    Kept for backward compatibility with older editions.
    """
    spec = importlib.util.spec_from_file_location("newsletter_content", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not import newsletter content from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if not hasattr(module, "newsletter") or not isinstance(module.newsletter, dict):
        raise ValueError("content.py must define a dict named 'newsletter'")

    # Map old content.py structure to new JSON schema
    d = module.newsletter
    intro_actions = d.get("intro_actions") or {}
    food_body = d.get("food_body") or {}
    food_thought = d.get("food_thought") or {}
    food_brain = d.get("food_brain") or {}
    food_soul = d.get("food_soul") or {}
    gym = d.get("gym_news") or {}
    local = d.get("local_news") or {}

    gym_items = gym.get("items") or []
    story1 = gym_items[0] if len(gym_items) > 0 else {}
    story2 = gym_items[1] if len(gym_items) > 1 else {}

    return {
        "edition_label": "",
        "subject": d.get("subject", ""),
        "intro_title": d.get("title", ""),
        "intro_tagline": d.get("opening_quote", ""),
        "intro_body": (d.get("intro") or {}).get("body", ""),
        "full_blog_url": intro_actions.get("full_blog_url", ""),
        "blogcast_url": intro_actions.get(
            "blogcast_url", intro_actions.get("full_blog_url", "")
        ),
        "subscribe_url": intro_actions.get("subscribe_url", ""),
        "food_body": {
            "subtitle": food_body.get("subtitle", ""),
            "copy": food_body.get("body", ""),
            "image": food_body.get("image", ""),
            "image_alt": food_body.get("image_alt", food_body.get("subtitle", "")),
            "image_caption": "",
            "image_url": "",
            "image_layout": "portrait",
            "cta_label": food_body.get("cta_label", ""),
            "cta_url": food_body.get("cta_url", ""),
            "share_url": "",
        },
        "food_thought": {
            "subtitle": food_thought.get("subtitle", ""),
            "copy": food_thought.get("body", ""),
            "image": food_thought.get("image", ""),
            "image_alt": food_thought.get(
                "image_alt", food_thought.get("subtitle", "")
            ),
            "image_caption": "",
            "image_url": "",
            "image_layout": "portrait",
            "cta_label": food_thought.get("cta_label", ""),
            "cta_url": food_thought.get("cta_url", ""),
            "share_url": "",
        },
        "food_brain": {
            "subtitle": food_brain.get("subtitle", ""),
            "copy": food_brain.get("body", ""),
            "image": food_brain.get("image", ""),
            "image_alt": food_brain.get("image_alt", food_brain.get("subtitle", "")),
            "image_caption": food_brain.get("image_credit", ""),
            "image_url": "",
            "image_layout": "portrait",
            "cta_label": food_brain.get("cta_label", ""),
            "cta_url": food_brain.get("cta_url", ""),
            "share_url": "",
        },
        "food_soul": {
            "subtitle": food_soul.get("subtitle", ""),
            "copy": food_soul.get("body", ""),
            "image": food_soul.get("image", ""),
            "image_alt": food_soul.get("image_alt", food_soul.get("subtitle", "")),
            "image_caption": "",
            "image_url": "",
            "image_layout": "portrait",
            "cta_label": food_soul.get("cta_label", ""),
            "cta_url": food_soul.get("cta_url", ""),
            "share_url": "",
        },
        "gym_news": {
            "enabled": bool(gym),
            "closure_dates": "",
            "story1": {
                "heading": story1.get("heading", ""),
                "copy": story1.get("body", ""),
                "image": story1.get("image", ""),
                "image_alt": story1.get("image_alt", ""),
                "image_caption": "",
                "image_url": "",
                "cta_label": gym.get("cta_label", ""),
                "cta_url": gym.get("cta_url", ""),
            },
            "story2_enabled": bool(story2),
            "story2": {
                "heading": story2.get("heading", ""),
                "copy": story2.get("body", ""),
                "image": story2.get("image", ""),
                "image_alt": story2.get("image_alt", ""),
                "image_caption": "",
                "image_url": "",
                "cta_label": "",
                "cta_url": "",
            },
        },
        "local_news": {
            "enabled": bool(local),
            "subtitle": local.get("subtitle", ""),
            "copy": local.get("body", ""),
            "image": local.get("image", ""),
            "image_alt": local.get("image_alt", ""),
            "image_caption": "",
            "image_url": "",
        },
    }


def load_content(path: Path) -> dict[str, Any]:
    """Loads JSON or legacy Python content file, returns normalised dict."""
    if path.suffix == ".json":
        return _load_json_content(path)
    elif path.suffix == ".py":
        return _load_python_content(path)
    else:
        raise ValueError(f"Unsupported content file type: {path.suffix}")


# ── Archive helper ────────────────────────────────────────────────────────────


def _archive(slug: str, html: str, data: dict) -> Path:
    """
    Saves rendered HTML and copies local images to the archive folder.
    Returns the path to the rendered file.
    """
    archive_dir = ARCHIVES_DIR / slug
    images_dir = archive_dir / "images"
    archive_dir.mkdir(parents=True, exist_ok=True)
    images_dir.mkdir(exist_ok=True)

    # Write rendered HTML
    out_path = archive_dir / "rendered.html"
    out_path.write_text(html, encoding="utf-8")

    # Copy local image files into archive/images/ for self-contained preview
    sections = ["food_body", "food_thought", "food_brain", "food_soul"]
    for section_key in sections:
        section = data.get(section_key) or {}
        img = section.get("image", "")
        if img and not img.startswith("http"):
            src = ROOT_DIR / img
            if src.exists():
                shutil.copy2(src, images_dir / src.name)

    gym = data.get("gym_news") or {}
    for story_key in ["story1", "story2"]:
        story = gym.get(story_key) or {}
        img = story.get("image", "")
        if img and not img.startswith("http"):
            src = ROOT_DIR / img
            if src.exists():
                shutil.copy2(src, images_dir / src.name)

    local = data.get("local_news") or {}
    img = local.get("image", "")
    if img and not img.startswith("http"):
        src = ROOT_DIR / img
        if src.exists():
            shutil.copy2(src, images_dir / src.name)

    return out_path


# ── Main render function ──────────────────────────────────────────────────────


def render_newsletter(
    content_path: Path,
    first_name: str = "there",
    proofread: bool = False,
) -> tuple[str, dict[str, Any]]:
    """
    Renders the newsletter template with content from the given JSON or Python file.
    Returns (rendered_html, content_data).
    """
    data = load_content(content_path)
    html = _load_template("newsletter")

    intro = data
    body = data.get("food_body") or {}
    thought = data.get("food_thought") or {}
    brain = data.get("food_brain") or {}
    soul = data.get("food_soul") or {}
    gym = data.get("gym_news") or {}
    local = data.get("local_news") or {}
    gym1 = gym.get("story1") or {}
    gym2 = gym.get("story2") or {}

    # ── Replacements ──────────────────────────────────────────────────────────
    replacements: dict[str, str] = {
        # Global
        "EDITION_LABEL": _str(intro.get("edition_label")),
        "INTRO_TITLE": _str(intro.get("intro_title")),
        "INTRO_TAGLINE": _str(intro.get("intro_tagline")),
        "INTRO_BODY": _rich_text(intro.get("intro_body")),
        "FULL_BLOG_URL": _str(intro.get("full_blog_url")),
        "BLOGCAST_URL": _str(intro.get("blogcast_url")),
        "SUBSCRIBE_URL": _str(intro.get("subscribe_url")),
        # Food for the Body
        "BODY_SUBTITLE": _maybe_proofread(_str(body.get("subtitle")), proofread),
        "BODY_COPY": _rich_text(body.get("copy")),
        "BODY_IMAGE": _resolve_image(_str(body.get("image"))),
        "BODY_IMAGE_ALT": _str(body.get("image_alt")),
        "BODY_IMAGE_CAPTION": _str(body.get("image_caption")),
        "BODY_IMAGE_URL": _str(body.get("image_url")),
        "BODY_CTA_LABEL": _str(body.get("cta_label")),
        "BODY_CTA_URL": _str(body.get("cta_url")),
        "BODY_SHARE_URL": _str(body.get("share_url")),
        # Food for Thought
        "THOUGHT_SUBTITLE": _maybe_proofread(_str(thought.get("subtitle")), proofread),
        "THOUGHT_COPY": _rich_text(thought.get("copy")),
        "THOUGHT_IMAGE": _resolve_image(_str(thought.get("image"))),
        "THOUGHT_IMAGE_ALT": _str(thought.get("image_alt")),
        "THOUGHT_IMAGE_CAPTION": _str(thought.get("image_caption")),
        "THOUGHT_IMAGE_URL": _str(thought.get("image_url")),
        "THOUGHT_CTA_LABEL": _str(thought.get("cta_label")),
        "THOUGHT_CTA_URL": _str(thought.get("cta_url")),
        "THOUGHT_SHARE_URL": _str(thought.get("share_url")),
        # Food for the Brain
        "BRAIN_SUBTITLE": _maybe_proofread(_str(brain.get("subtitle")), proofread),
        "BRAIN_COPY": _rich_text(brain.get("copy")),
        "BRAIN_IMAGE": _resolve_image(_str(brain.get("image"))),
        "BRAIN_IMAGE_ALT": _str(brain.get("image_alt")),
        "BRAIN_IMAGE_CAPTION": _str(brain.get("image_caption")),
        "BRAIN_IMAGE_URL": _str(brain.get("image_url")),
        "BRAIN_CTA_LABEL": _str(brain.get("cta_label")),
        "BRAIN_CTA_URL": _str(brain.get("cta_url")),
        "BRAIN_SHARE_URL": _str(brain.get("share_url")),
        # Food for the Soul
        "SOUL_SUBTITLE": _maybe_proofread(_str(soul.get("subtitle")), proofread),
        "SOUL_COPY": _rich_text(soul.get("copy")),
        "SOUL_IMAGE": _resolve_image(_str(soul.get("image"))),
        "SOUL_IMAGE_ALT": _str(soul.get("image_alt")),
        "SOUL_IMAGE_CAPTION": _str(soul.get("image_caption")),
        "SOUL_IMAGE_URL": _str(soul.get("image_url")),
        "SOUL_CTA_LABEL": _str(soul.get("cta_label")),
        "SOUL_CTA_URL": _str(soul.get("cta_url")),
        "SOUL_SHARE_URL": _str(soul.get("share_url")),
        # Gym news
        "GYM_CLOSURE_DATES": _rich_text(gym.get("closure_dates")),
        "GYM1_HEADING": _str(gym1.get("heading")),
        "GYM1_COPY": _rich_text(gym1.get("copy")),
        "GYM1_IMAGE": _resolve_image(_str(gym1.get("image"))),
        "GYM1_IMAGE_ALT": _str(gym1.get("image_alt")),
        "GYM1_IMAGE_CAPTION": _str(gym1.get("image_caption")),
        "GYM1_IMAGE_URL": _str(gym1.get("image_url")),
        "GYM1_CTA_LABEL": _str(gym1.get("cta_label")),
        "GYM1_CTA_URL": _str(gym1.get("cta_url")),
        "GYM2_HEADING": _str(gym2.get("heading")),
        "GYM2_COPY": _rich_text(gym2.get("copy")),
        "GYM2_IMAGE": _resolve_image(_str(gym2.get("image"))),
        "GYM2_IMAGE_ALT": _str(gym2.get("image_alt")),
        "GYM2_IMAGE_CAPTION": _str(gym2.get("image_caption")),
        "GYM2_IMAGE_URL": _str(gym2.get("image_url")),
        "GYM2_CTA_LABEL": _str(gym2.get("cta_label")),
        "GYM2_CTA_URL": _str(gym2.get("cta_url")),
        # Local news
        "LOCAL_SUBTITLE": _str(local.get("subtitle")),
        "LOCAL_COPY": _rich_text(local.get("copy")),
        "LOCAL_IMAGE": _resolve_image(_str(local.get("image"))),
        "LOCAL_IMAGE_ALT": _str(local.get("image_alt")),
        "LOCAL_IMAGE_CAPTION": _str(local.get("image_caption")),
        "LOCAL_IMAGE_URL": _str(local.get("image_url")),
        "LOCAL_CTA_LABEL": _str(local.get("cta_label")),
        "LOCAL_CTA_URL": _str(local.get("cta_url")),
        # Gym calendar
        "GYM_CALENDAR_URL": _str(gym.get("calendar_url")),
        # Footer
        "CURRENT_YEAR": str(datetime.now().year),
        "UNSUBSCRIBE_URL": "{{UNSUBSCRIBE_URL}}",
        # ↑ Leave this unreplaced — the Supabase Edge Function injects it per recipient at send time
    }

    # Apply all simple replacements
    for tag, value in replacements.items():
        html = html.replace(f"{{{{{tag}}}}}", value)

    # ── Conditionals ──────────────────────────────────────────────────────────
    flags: dict[str, bool] = {
        "GYM_ENABLED": bool(gym.get("enabled")),
        "GYM2_ENABLED": bool(gym.get("story2_enabled")) and bool(gym2.get("heading")),
        "LOCAL_ENABLED": bool((local.get("enabled"))),
        "GYM1_IMAGE": bool(gym1.get("image")),
        "GYM1_IMAGE_URL": bool(gym1.get("image_url")) and bool(gym1.get("image")),
        "GYM1_IMAGE_CAPTION": bool(gym1.get("image_caption"))
        and bool(gym1.get("image")),
        "GYM1_CTA_LABEL": bool(gym1.get("cta_label")),
        "GYM_CALENDAR_URL": bool(gym.get("calendar_url")),
        "GYM2_IMAGE": bool(gym2.get("image")),
        "GYM2_IMAGE_URL": bool(gym2.get("image_url")) and bool(gym2.get("image")),
        "GYM2_IMAGE_CAPTION": bool(gym2.get("image_caption"))
        and bool(gym2.get("image")),
        "GYM2_CTA_LABEL": bool(gym2.get("cta_label")),
        "LOCAL_IMAGE": bool(local.get("image")),
        "LOCAL_IMAGE_URL": bool(local.get("image_url")) and bool(local.get("image")),
        "LOCAL_IMAGE_CAPTION": bool(local.get("image_caption"))
        and bool(local.get("image")),
        "LOCAL_CTA_LABEL": bool(local.get("cta_label")),
        "GYM1_IMAGE_CAPTION_PLAIN": bool(gym1.get("image_caption")) and not bool(gym1.get("image_url")) and bool(gym1.get("image")),
        "GYM2_IMAGE_CAPTION_PLAIN": bool(gym2.get("image_caption")) and not bool(gym2.get("image_url")) and bool(gym2.get("image")),
        "LOCAL_IMAGE_CAPTION_PLAIN": bool(local.get("image_caption")) and not bool(local.get("image_url")) and bool(local.get("image")),
        "BODY_CTA_LABEL": bool(body.get("cta_label")),
        "THOUGHT_CTA_LABEL": bool(thought.get("cta_label")),
        "BRAIN_CTA_LABEL": bool(brain.get("cta_label")),
        "SOUL_CTA_LABEL": bool(soul.get("cta_label")),
        "BODY_SHARE_URL": bool(body.get("share_url")),
        "THOUGHT_SHARE_URL": bool(thought.get("share_url")),
        "BRAIN_SHARE_URL": bool(brain.get("share_url")),
        "SOUL_SHARE_URL": bool(soul.get("share_url")),
    }

    # Add image flags for all four food sections
    for section_data, prefix in [
        (body, "BODY"),
        (thought, "THOUGHT"),
        (brain, "BRAIN"),
        (soul, "SOUL"),
    ]:
        flags.update(_image_flags(section_data, prefix))

    html = _process_conditionals(html, flags)

    # FIRST_NAME replaced after conditionals so it doesn't interfere with flag processing
    html = html.replace("{{FIRST_NAME}}", escape(first_name or "there"))

    return html, data


# ── General template renderer (unchanged from original) ──────────────────────


def render_general(body: str, first_name: str = "there") -> str:
    html = _load_template("general")
    body_content = body.strip()
    if "<" not in body_content:
        paragraphs = [p.strip() for p in body_content.split("\n\n") if p.strip()]
        body_content = "\n".join(
            f'<p style="margin:0 0 18px 0;">{escape(p).replace(chr(10), "<br>")}</p>'
            for p in paragraphs
        )
    return (
        html.replace("{{BODY}}", body_content)
        .replace("{{FIRST_NAME}}", escape(first_name or "there"))
        .replace("{{CURRENT_YEAR}}", str(datetime.now().year))
    )


# ── CLI entry point ───────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Crawford Coaching newsletter renderer"
    )
    parser.add_argument(
        "content", nargs="?", help="Path to content JSON or Python file"
    )
    parser.add_argument(
        "--name", default="there", help="Recipient first name (default: there)"
    )
    parser.add_argument(
        "--proofread",
        action="store_true",
        help="Run AI proofreading pass via Anthropic API",
    )
    parser.add_argument(
        "--general",
        metavar="BODY",
        help="Render a general (non-newsletter) email with this body text",
    )
    args = parser.parse_args()

    if args.general:
        html = render_general(args.general, first_name=args.name)
        print(html)
        return

    if not args.content:
        parser.error(
            "Provide a content file path, or use --general for a general email"
        )

    content_path = Path(args.content).expanduser().resolve()
    if not content_path.exists():
        raise FileNotFoundError(f"Content file not found: {content_path}")

    if args.proofread and "ANTHROPIC_API_KEY" not in os.environ:
        raise EnvironmentError(
            "ANTHROPIC_API_KEY environment variable is required for --proofread"
        )

    html, data = render_newsletter(
        content_path,
        first_name=args.name,
        proofread=args.proofread,
    )

    # Derive archive slug from content filename
    slug = content_path.stem
    out_path = _archive(slug, html, data)
    print(f"Rendered: {out_path}")
    print(f"Preview:  file://{out_path.resolve()}")


if __name__ == "__main__":
    main()
