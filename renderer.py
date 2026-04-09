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


# ── Supabase Storage upload ──────────────────────────────────────────────────

def _upload_to_supabase(bucket: str, path: str, content: str, content_type: str = "text/html") -> str:
    """
    Uploads content to Supabase Storage and returns the public URL.
    Overwrites if the file already exists.
    Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
    """
    import urllib.request
    import urllib.error

    base = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not key:
        raise EnvironmentError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for upload"
        )

    upload_url = f"{base}/storage/v1/object/{bucket}/{path}"
    data = content.encode("utf-8")

    req = urllib.request.Request(
        upload_url,
        data=data,
        method="PUT",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": content_type,
            "x-upsert": "true",
            "Cache-Control": "public, max-age=3600",
        },
    )

    try:
        urllib.request.urlopen(req)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase upload failed ({e.code}): {body}")

    return f"{base}/storage/v1/object/public/{bucket}/{path}"


# ── Social post generation ───────────────────────────────────────────────────

def _generate_social_post(
    section_title: str,
    section_subtitle: str,
    section_copy: str,
    blog_url: str,
) -> str:
    """
    Generates a social media post for a newsletter section using the Anthropic API.
    Returns a single post suitable for LinkedIn, Facebook, Twitter/X, and Instagram.
    Always includes #crawfordcoaching plus 4 context-specific hashtags.
    Requires ANTHROPIC_API_KEY in the environment.
    """
    import anthropic

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    # Strip HTML tags from the copy to give the model clean text
    clean_copy = re.sub(r"<[^>]+>", "", section_copy).strip()

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=512,
        messages=[
            {
                "role": "user",
                "content": (
                    "Write a social media post to share the following newsletter section. "
                    "The post should be suitable for LinkedIn, Facebook, Twitter/X, and Instagram. "
                    "Keep it under 200 words. Use a thoughtful, reflective tone that matches "
                    "a coaching and wellness brand. Do not use excessive emojis — one or two "
                    "at most is fine.\n\n"
                    "At the end of the post, include exactly 5 hashtags on their own line:\n"
                    "- #crawfordcoaching (always first, always included)\n"
                    "- Plus 4 hashtags relevant to the specific content of this section\n\n"
                    "After the hashtags, end with the blog link on its own line.\n\n"
                    "Do NOT include any preamble, explanation, or options. Return ONLY the "
                    "post text, ready to copy and paste.\n\n"
                    f"Section: Food for the {section_title}\n"
                    f"Subtitle: {section_subtitle}\n"
                    f"Content:\n{clean_copy}\n\n"
                    f"Blog link: {blog_url}"
                ),
            }
        ],
    )
    return message.content[0].text.strip()


# ── Sharing page builder ─────────────────────────────────────────────────────

_SHARE_PAGE_TEMPLATE = """\
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Share: {section_subtitle} — Crawford Coaching</title>
<style>
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
body{{background:#0e0f10;color:#c8d4de;font-family:Georgia,'Times New Roman',serif;
  font-size:16px;line-height:1.8;min-height:100vh;display:flex;flex-direction:column;
  align-items:center;padding:3rem 1.5rem}}
.card{{background:#1c2330;max-width:560px;width:100%;border-radius:4px;padding:2.5rem;
  margin-bottom:2rem}}
.label{{font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.2em;
  text-transform:uppercase;color:#2d86c4;margin-bottom:4px}}
h1{{font-size:22px;font-weight:700;color:#f5f3ef;margin-bottom:1.5rem;line-height:1.2}}
.section-image{{width:100%;margin-bottom:1.5rem;border-radius:3px;overflow:hidden}}
.section-image img{{display:block;width:100%;height:auto;
  border:1px solid rgba(45,134,196,0.2)}}
.save-image{{display:block;margin-top:8px;font-family:Arial,Helvetica,sans-serif;
  font-size:11px;color:#7a8fa3;text-decoration:none;text-align:center}}
.save-image:hover{{color:#c8d4de}}
.post-text{{background:#232f3e;border-radius:3px;padding:1.2rem 1.4rem;
  font-size:14px;line-height:1.75;color:#c8d4de;margin-bottom:1.5rem;
  white-space:pre-wrap;word-wrap:break-word}}
.btn{{display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:12px;
  letter-spacing:0.12em;text-transform:uppercase;color:#c8d4de;text-decoration:none;
  border:1px solid rgba(45,134,196,0.4);border-radius:2px;padding:10px 24px;
  cursor:pointer;background:transparent;transition:background 0.2s}}
.btn:hover{{background:rgba(45,134,196,0.15)}}
.btn-primary{{border-color:#2d86c4;color:#f5f3ef}}
.btn-primary:hover{{background:#2d86c4}}
.btn-instagram{{border-color:rgba(193,53,132,0.5);color:#c8d4de}}
.btn-instagram:hover{{background:rgba(193,53,132,0.15)}}
.actions{{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:1.5rem;align-items:center}}
.copied{{color:#2d86c4;font-family:Arial,Helvetica,sans-serif;font-size:12px;
  display:none}}
.divider{{height:1px;background:#2a3444;margin:1.5rem 0}}
.subscribe{{text-align:center}}
.subscribe p{{font-size:14px;color:#7a8fa3;margin-bottom:1rem}}
.subscribe a{{color:#2d86c4;text-decoration:underline}}
.footer{{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#3d4a58;
  text-align:center;margin-top:auto;padding-top:2rem}}
.footer a{{color:#3d4a58;text-decoration:underline}}
</style>
</head>
<body>
<div class="card">
  <p class="label">Food for the {section_title}</p>
  <h1>{section_subtitle}</h1>
  {image_block}
  <div class="post-text" id="post-text">{post_text}</div>
  <div class="actions">
    <button class="btn btn-primary" onclick="copyPost()">Copy post text</button>
    <span class="copied" id="copied-msg">Copied!</span>
  </div>
  <div class="actions">
    <a class="btn" href="https://www.linkedin.com/sharing/share-offsite/?url={blog_url_encoded}" target="_blank" rel="noopener">Share on LinkedIn</a>
    <a class="btn" href="https://www.facebook.com/sharer/sharer.php?u={blog_url_encoded}" target="_blank" rel="noopener">Share on Facebook</a>
    <a class="btn" href="https://twitter.com/intent/tweet?text={tweet_encoded}" target="_blank" rel="noopener">Share on X</a>
    <a class="btn btn-instagram" href="https://www.instagram.com/" target="_blank" rel="noopener">Open Instagram</a>
  </div>
  <div class="divider"></div>
  <div class="subscribe">
    <p>Enjoyed this? Get ideas like this delivered to your inbox.</p>
    <a href="{subscribe_url}" class="btn">Subscribe to the newsletter</a>
  </div>
</div>
<div class="footer">
  <p>&copy; {year} Crawford Coaching &middot;
    <a href="https://crawford-coaching.ca">crawford-coaching.ca</a></p>
</div>
<script>
function copyPost(){{
  var t=document.getElementById('post-text').innerText;
  navigator.clipboard.writeText(t).then(function(){{
    var m=document.getElementById('copied-msg');
    m.style.display='inline';
    setTimeout(function(){{m.style.display='none'}},2000);
  }});
}}
</script>
</body>
</html>"""


def _build_share_page(
    section_title: str,
    section_subtitle: str,
    post_text: str,
    blog_url: str,
    subscribe_url: str,
    image_url: str = "",
    image_alt: str = "",
) -> str:
    """Builds a static HTML sharing page for a newsletter section."""
    from urllib.parse import quote

    # Build the image block (only if image_url is provided)
    if image_url:
        image_block = (
            '<div class="section-image">'
            f'<img src="{escape(image_url)}" alt="{escape(image_alt)}">'
            f'<a class="save-image" href="{escape(image_url)}" '
            f'download="crawford-coaching-{escape(section_title.lower())}.png">'
            'Save image &darr;</a>'
            '</div>'
        )
    else:
        image_block = ""

    # For Twitter/X, include the post text + blog URL in the tweet
    tweet_text = post_text
    if blog_url and blog_url not in tweet_text:
        tweet_text = f"{tweet_text}\n\n{blog_url}"

    return _SHARE_PAGE_TEMPLATE.format(
        section_title=escape(section_title),
        section_subtitle=escape(section_subtitle),
        post_text=escape(post_text),
        image_block=image_block,
        blog_url_encoded=quote(blog_url, safe=""),
        tweet_encoded=quote(tweet_text, safe=""),
        subscribe_url=escape(subscribe_url or "https://crawford-coaching.ca/subscribe"),
        year=datetime.now().year,
    )


# ── Social sharing orchestrator ──────────────────────────────────────────────

SECTION_MAP = {
    "food_body":    ("Body",    "body"),
    "food_thought": ("Thought", "thought"),
    "food_brain":   ("Brain",   "brain"),
    "food_soul":    ("Soul",    "soul"),
}


def _generate_share_pages(
    data: dict[str, Any],
    slug: str,
) -> dict[str, str]:
    """
    Generates social sharing pages for all four food sections.
    Uploads each page to Supabase Storage.
    Returns a dict mapping section keys to their public share page URLs.

    Example return:
        {"food_body": "https://...newsletters/15-.../socials/body.html", ...}
    """
    blog_url = _str(data.get("full_blog_url"))
    subscribe_url = _str(data.get("subscribe_url"))
    share_urls: dict[str, str] = {}

    for section_key, (title, filename) in SECTION_MAP.items():
        section = data.get(section_key) or {}
        copy = _str(section.get("copy"))
        subtitle = _str(section.get("subtitle"))

        if not copy:
            continue

        # Resolve the section image to a full URL for the sharing page
        image_url = _resolve_image(_str(section.get("image")))
        image_alt = _str(section.get("image_alt"))

        print(f"  Generating social post for {title}...")
        post_text = _generate_social_post(
            section_title=title,
            section_subtitle=subtitle,
            section_copy=copy,
            blog_url=blog_url,
        )

        page_html = _build_share_page(
            section_title=title,
            section_subtitle=subtitle,
            post_text=post_text,
            blog_url=blog_url,
            subscribe_url=subscribe_url,
            image_url=image_url,
            image_alt=image_alt,
        )

        # Also save the raw post text for future use
        supabase_path_html = f"{slug}/socials/{filename}.html"
        supabase_path_txt = f"{slug}/socials/{filename}.txt"

        _upload_to_supabase("newsletters", supabase_path_html, page_html, "text/html")
        _upload_to_supabase("newsletters", supabase_path_txt, post_text, "text/plain")

        # Use webapp proxy URL so the browser renders HTML properly
        # (Supabase Storage overrides Content-Type to text/plain)
        url = f"https://app.crawford-coaching.ca/share/{slug}/{filename}"

        share_urls[section_key] = url
        print(f"    → {url}")

    return share_urls


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

    # ── Social sharing pages (disabled — revisit when share links are stable)
    slug = content_path.stem

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

    # Upload rendered HTML to Supabase edition folder
    if os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
        try:
            rendered_url = _upload_to_supabase(
                "newsletters",
                f"{slug}/rendered.html",
                html,
                "text/html",
            )
            print(f"Uploaded: {rendered_url}")
        except Exception as e:
            print(f"Warning: Failed to upload rendered HTML to Supabase: {e}")
    else:
        print("Skipping Supabase upload (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)")


if __name__ == "__main__":
    main()
