# Crawford Coaching Newsletter Pipeline — Copilot Restructure Instructions

This document is a complete, ordered instruction set for restructuring the newsletter
pipeline. Work through each section in order. Do not skip ahead. At the end of each
section, confirm the work before moving to the next.

---

## Context

The newsletter system builds HTML email newsletters from content data and an HTML
template, then sends them via Gmail SMTP through a Supabase Edge Function.

### Current state
- `renderer.py` — exists, renders newsletters from `content.py` dicts
- `templates/newsletter.html` — old template, being replaced
- `content.py` — per-edition content as a Python dict (old format)

### Target state
- `renderer.py` — updated to handle JSON input (from the new content form),
  with an optional AI proofreading pass via the Anthropic API
- `templates/newsletter.html` — replaced with the new template (provided below)
- `content/` — new folder; each edition's JSON lives here
- `newsletter-form.html` — standalone browser form for filling content;
  exports JSON that feeds the renderer

---

## Project file structure (target)

```
project-root/
├── renderer.py                        — updated renderer (see Section 3)
├── newsletter-form.html               — content entry form (provided, copy as-is)
├── templates/
│   └── newsletter.html                — new template (provided, copy as-is)
├── content/
│   └── 15-becoming-a-snacker.json    — example edition content (see Section 2)
├── archives/
│   └── 15-becoming-a-snacker/
│       ├── rendered.html
│       └── images/                    — local image copies for preview
└── assets/                            — per-edition image source folder
    └── 15-becoming-a-snacker/
        ├── body-plate.png
        ├── jasmin-paris.jpg
        ├── rx-bar.png
        ├── peaceful-grass.png
        ├── timer.png
        └── ten.png
```

---

## Section 1 — Copy provided files into the project

The following files have been produced externally and should be copied into the
project exactly as provided. Do not modify their content.

| Source file | Destination |
|---|---|
| `newsletter.html` (new template) | `templates/newsletter.html` |
| `newsletter-form.html` | `newsletter-form.html` (project root) |

These files are provided as attachments to this instruction set. If they are not
present, stop and ask for them before continuing.

---

## Section 2 — Create the example edition JSON

Create the file `content/15-becoming-a-snacker.json` with the following content.
This is the content data for Issue 15, restructured from the old `content.py` format
into the new JSON schema. Every field name here corresponds directly to a
`{{PLACEHOLDER}}` in the new template.

```json
{
  "edition_label": "April 2026 \u00b7 Issue 15",
  "subject": "April Edition 1 2026 Newsletter | Becoming a Snacker",
  "intro_title": "Becoming a Snacker",
  "intro_tagline": "Consistency is not built by never drifting. It is built by returning.",
  "intro_body": "<p>You might notice a new look to the newsletter this time. I\u2019ve built a whole new website and mailing system. There are some interactive features which you might find enjoyable, useful or enlightening. I\u2019m still building it all out, so please explore it and let me know how you get on. <a href=\"https://crawford-coaching.ca\">Visit the new Crawford Coaching site</a>.</p><p>This month, I have a confession to make, and it starts with something I recommended to you.</p><p>For the past year or so, I have been eating RX Bars. Simple ingredients, no added sugar, solid protein content. The kind of thing you can eat without the usual inner negotiation that comes with reaching for a packaged food. I liked them enough to mention them in my writing. I still think they are a good product.</p><p>Here is the problem. I have turned myself into a snacker.</p><p>It happened the way most habit shifts happen; gradually, reasonably, without much notice. I was training more, working with multiple groups, and the extra caloric demand was real. An RX Bar between morning sessions made perfect nutritional sense. My body needed the fuel. The food was appropriate, and the timing was logical.</p><p>What I did not account for was the door it opened.</p><p>A morning that was previously just coffee became a morning with a snack. That snack, repeated often enough, became a pattern. The pattern began to generalise, and I started reaching for something between meals not because my body needed fuel, but because there was a gap in the day and my hands wanted something to do. Boredom. Stress. The restless energy of a busy afternoon. Suddenly, snacking was on the table as a response to all of them.</p><p>The RX Bar did not cause this, but it was the vehicle. What happened underneath was a habit formation process that I know well enough to teach, and apparently not well enough to notice while it was happening to me.</p><p>I was somewhat insulated from this for years by my existing eating habits. I trusted my patterns. I ate meals, not snacks, and I rarely felt the pull toward grazing. That trust, it turns out, was not a permanent character trait. It was a reflection of a particular routine. Once the routine shifted, so did everything downstream.</p><p>This experience crystallised something I have been thinking about for a while. We love to label foods as healthy or unhealthy, clean or dirty, good or bad. These labels feel useful, but they are almost always incomplete.</p><p>An RX Bar is not \u201chealthy\u201d or \u201cunhealthy.\u201d It is a food. Whether it supports your wellbeing depends entirely on context. Who is eating it? When? Why? What outcome are they trying to achieve? Without answers to those questions, the label is meaningless.</p><p>The same principle applies everywhere. A slice of birthday cake shared with friends carries genuine social and emotional value that a calorie count cannot capture. Even the most \u201cunhealthy\u201d foods can have benefits that outweigh a tiny deviation from protocol. The reverse is equally true: the \u201chealthiest\u201d food on the shelf, eaten when it is not needed, is just extra calories.</p><p>Calling a food healthy gives us permission to eat it without thinking. Calling a food unhealthy gives us permission to fear it without thinking. Neither response involves the question that actually matters.</p><p>The rest of this issue explores what that question might be, and a few ways to start asking it.</p><p>Scott</p>",
  "full_blog_url": "https://crawford-coaching.ca/writing/15-becoming-a-snacker",
  "blogcast_url": "https://crawford-coaching.ca/writing/15-becoming-a-snacker",
  "subscribe_url": "https://crawford-coaching.ca/subscribe",
  "food_body": {
    "subtitle": "Eat Around, Not On Top",
    "copy": "<p>\u201cEat more protein\u201d has become one of the most common pieces of nutritional advice, and for good reason. Protein is essential for muscle repair, satiety, metabolic health, and preservation of lean mass as we age. The advice is not wrong.</p><p>The execution, however, often is.</p><p>For someone trying to lose weight, \u201ceat more protein\u201d can quietly become \u201ceat more food.\u201d More shakes on top of existing meals. More snacks justified by their protein content. More total calories in a situation where the goal requires fewer.</p><p>A better paradigm is not \u201ceat more protein\u201d but \u201cbuild your meals around protein.\u201d Make it a focus, not an extra. Structure the plate so protein is the foundation, and other elements fill in around it. The total intake might not change much. The composition changes significantly.</p><p>Try this as an experiment over the next week. Before adding anything to a meal, ask whether the protein is already there as the anchor. If it is not, rearrange rather than add.</p>",
    "image": "assets/15-becoming-a-snacker/body-plate.png",
    "image_alt": "A balanced plate built around protein",
    "image_caption": "A protein-anchored plate",
    "image_url": "",
    "image_layout": "portrait",
    "cta_label": "Ask Assistant",
    "cta_url": "https://crawford-coaching.ca/assistant",
    "share_url": ""
  },
  "food_thought": {
    "subtitle": "When Good Habits Grow Legs",
    "copy": "<p>In <em>Good Habits, Bad Habits</em>, Wendy Wood explains that much of our behaviour runs on autopilot, shaped by context and repetition rather than conscious choice. Once a behaviour becomes associated with a cue, it begins to fire automatically.</p><p>This is usually discussed as a tool for building positive habits. It is less often discussed as a warning.</p><p>A food introduced for perfectly sound reasons can become the seed of a pattern that no longer serves its original purpose. The cue shifts from hunger to boredom, from nutritional need to emotional habit. The behaviour looks the same from the outside. The function has changed entirely.</p><p>The reflection this week is simple. Think about one food habit you consider \u201cgood.\u201d Ask yourself: is it still serving the purpose it was originally introduced for? Or has it quietly become something else?</p><p>No judgement required. This is information, not a scorecard.</p>",
    "image": "assets/15-becoming-a-snacker/rx-bar.png",
    "image_alt": "Hand reaching for an RX Bar beside a coffee",
    "image_caption": "Click to book a chat",
    "image_url": "https://calendar.app.google/DuKcPqs3KgNRrwjM7",
    "image_layout": "portrait",
    "cta_label": "Book a Chat",
    "cta_url": "https://calendar.app.google/DuKcPqs3KgNRrwjM7",
    "share_url": ""
  },
  "food_brain": {
    "subtitle": "One Question To Replace A Label",
    "copy": "<p>Instead of asking \u201cIs this food healthy?\u201d try asking: \u201cHow is this food supporting the outcome I am trying to achieve?\u201d</p><p>That question does something the binary cannot. It forces context. It requires you to know what you are working toward and to evaluate the food against that specific aim in that specific moment.</p><p>There is a photograph from the 2024 Barkley Marathons that illustrates this perfectly. Jasmin Paris, the first woman to ever finish the race, is sitting in a camp chair after sixty hours of running through unmarked Tennessee mountains. Legs scratched raw. Face resting in one hand. Scattered around her feet: juice boxes, Coca-Cola, oat bars, a camping stove, snack wrappers. Every item on that ground was the right choice.</p><p>Coca-Cola, consumed during a sixty-hour effort with over 60,000 feet of elevation gain, is liquid energy in the most rapidly absorbable form available. The same bottle on a Tuesday afternoon serves a completely different purpose. The food did not change. The context did.</p><p>The question works just as well at the kitchen counter as it does at the base camp of an ultramarathon. It simply asks you to think before you label.</p>",
    "image": "assets/15-becoming-a-snacker/jasmin-paris.jpg",
    "image_alt": "Jasmin Paris after finishing the 2024 Barkley Marathons",
    "image_caption": "Photo: Jacob Zocherman",
    "image_url": "",
    "image_layout": "portrait",
    "cta_label": "Ask Me a Question",
    "cta_url": "https://crawford-coaching.ca/contact",
    "share_url": ""
  },
  "food_soul": {
    "subtitle": "Permission To Think In Context",
    "copy": "<p>We would benefit from retiring the language of healthy and unhealthy as fixed labels attached to individual foods. It is reductive. It makes us feel informed while actually making us less capable of thinking clearly.</p><p>A more honest vocabulary would acknowledge that food exists in relationship to a person, a moment, a purpose, and a set of circumstances. The same meal can be nourishing or excessive, supportive or irrelevant, depending on who is eating it and why.</p><p>This does not mean anything goes. It does not mean nutritional quality is irrelevant. It means that quality alone is not enough. Direction matters. Timing matters. Honest self-awareness matters more than any label on a package.</p><p>The question is not whether the food is good. The question is whether it is serving you well, right here, right now, in the life you are actually living.</p><p>That is a question worth sitting with. It does not shout. It just asks you to pay attention.</p>",
    "image": "assets/15-becoming-a-snacker/peaceful-grass.png",
    "image_alt": "A forest path diverging in warm light",
    "image_caption": "Book a discovery call",
    "image_url": "https://calendar.app.google/R66fNg5m7w3aKPKd6",
    "image_layout": "portrait",
    "cta_label": "Coaching Discovery Call",
    "cta_url": "https://calendar.app.google/R66fNg5m7w3aKPKd6",
    "share_url": ""
  },
  "gym_news": {
    "enabled": true,
    "closure_dates": "May 18th \u2014 Full closure. Additional dates available from <a href=\"https://crawford-coaching.ca/assistant\">my assistant</a> or check <a href=\"https://calendar.google.com/calendar/u/0?cid=Y2IzMzFlODQzY2E4ZTI0M2NiNGMzN2VmZDNiMjdkYWE5OWY0OWM0NTY2MTEzYjAxODBiMGFlZmE3MDZmZDNkMEBncm91cC5jYWxlbmRhci5nb29nbGUuY29t\">my calendar</a>.",
    "story1": {
      "heading": "New Interval Timer",
      "copy": "<p>The interval timer I built for use in my gym is now available for you to use in the gym on your phone, or at home whenever. It is highly configurable, has quick preset options, and now includes a workout builder \u2014 just choose from a few options to tell it what time and equipment you have, and it will build you a quick EMOM workout. No decision fatigue.</p>",
      "image": "assets/15-becoming-a-snacker/timer.png",
      "image_alt": "Synergize Interval Timer showing an EMOM workout",
      "image_caption": "Try it now",
      "image_url": "https://crawford-coaching.ca/timer",
      "cta_label": "Try the Timer",
      "cta_url": "https://crawford-coaching.ca/timer"
    },
    "story2_enabled": false,
    "story2": {
      "heading": "",
      "copy": "",
      "image": "",
      "image_alt": "",
      "image_caption": "",
      "image_url": "",
      "cta_label": "",
      "cta_url": ""
    }
  },
  "local_news": {
    "enabled": true,
    "subtitle": "Upcoming Performance",
    "copy": "<p>Turn it up! Voices Rock is celebrating 10 years of making epic choral music. Join Voices Rock Medicine (Kingston) and special guests The Gertrudes for a high-energy concert featuring some of their favourite arrangements from the past decade. With rock classics by The Beatles, Pat Benatar, The Mamas &amp; The Papas, and more, this celebration promises big harmonies, great vibes, and unforgettable music you won\u2019t want to miss. There may be some Synergize Group Fitness members in the ensemble!</p><p><a href=\"https://www.kingstongrand.ca/events/ten\">Get your tickets here</a></p>",
    "image": "assets/15-becoming-a-snacker/ten.png",
    "image_alt": "Voices Rock TEN concert graphic",
    "image_caption": "Get your tickets",
    "image_url": "https://www.kingstongrand.ca/events/ten"
  }
}
```

---

## Section 3 — Rewrite renderer.py

Replace the existing `renderer.py` entirely with the following. Read every comment
before writing — they explain why each decision was made.

```python
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
    pattern = re.compile(r"\{\{#if ([A-Z_]+)\}\}([\s\S]*?)\{\{/if \1\}\}")

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
        f'<p style="margin:0 0 16px 0;">{escape(p).replace(chr(10), "<br>")}</p>'
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
        "blogcast_url": intro_actions.get("blogcast_url", intro_actions.get("full_blog_url", "")),
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
            "image_alt": food_thought.get("image_alt", food_thought.get("subtitle", "")),
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
        "EDITION_LABEL":    _str(intro.get("edition_label")),
        "INTRO_TITLE":      _str(intro.get("intro_title")),
        "INTRO_TAGLINE":    _str(intro.get("intro_tagline")),
        "INTRO_BODY":       _rich_text(intro.get("intro_body")),
        "FULL_BLOG_URL":    _str(intro.get("full_blog_url")),
        "BLOGCAST_URL":     _str(intro.get("blogcast_url")),
        "SUBSCRIBE_URL":    _str(intro.get("subscribe_url")),

        # Food for the Body
        "BODY_SUBTITLE":        _maybe_proofread(_str(body.get("subtitle")), proofread),
        "BODY_COPY":            _rich_text(body.get("copy")),
        "BODY_IMAGE":           _str(body.get("image")),
        "BODY_IMAGE_ALT":       _str(body.get("image_alt")),
        "BODY_IMAGE_CAPTION":   _str(body.get("image_caption")),
        "BODY_IMAGE_URL":       _str(body.get("image_url")),
        "BODY_CTA_LABEL":       _str(body.get("cta_label")),
        "BODY_CTA_URL":         _str(body.get("cta_url")),
        "BODY_SHARE_URL":       _str(body.get("share_url")),

        # Food for Thought
        "THOUGHT_SUBTITLE":     _maybe_proofread(_str(thought.get("subtitle")), proofread),
        "THOUGHT_COPY":         _rich_text(thought.get("copy")),
        "THOUGHT_IMAGE":        _str(thought.get("image")),
        "THOUGHT_IMAGE_ALT":    _str(thought.get("image_alt")),
        "THOUGHT_IMAGE_CAPTION":_str(thought.get("image_caption")),
        "THOUGHT_IMAGE_URL":    _str(thought.get("image_url")),
        "THOUGHT_CTA_LABEL":    _str(thought.get("cta_label")),
        "THOUGHT_CTA_URL":      _str(thought.get("cta_url")),
        "THOUGHT_SHARE_URL":    _str(thought.get("share_url")),

        # Food for the Brain
        "BRAIN_SUBTITLE":       _maybe_proofread(_str(brain.get("subtitle")), proofread),
        "BRAIN_COPY":           _rich_text(brain.get("copy")),
        "BRAIN_IMAGE":          _str(brain.get("image")),
        "BRAIN_IMAGE_ALT":      _str(brain.get("image_alt")),
        "BRAIN_IMAGE_CAPTION":  _str(brain.get("image_caption")),
        "BRAIN_IMAGE_URL":      _str(brain.get("image_url")),
        "BRAIN_CTA_LABEL":      _str(brain.get("cta_label")),
        "BRAIN_CTA_URL":        _str(brain.get("cta_url")),
        "BRAIN_SHARE_URL":      _str(brain.get("share_url")),

        # Food for the Soul
        "SOUL_SUBTITLE":        _maybe_proofread(_str(soul.get("subtitle")), proofread),
        "SOUL_COPY":            _rich_text(soul.get("copy")),
        "SOUL_IMAGE":           _str(soul.get("image")),
        "SOUL_IMAGE_ALT":       _str(soul.get("image_alt")),
        "SOUL_IMAGE_CAPTION":   _str(soul.get("image_caption")),
        "SOUL_IMAGE_URL":       _str(soul.get("image_url")),
        "SOUL_CTA_LABEL":       _str(soul.get("cta_label")),
        "SOUL_CTA_URL":         _str(soul.get("cta_url")),
        "SOUL_SHARE_URL":       _str(soul.get("share_url")),

        # Gym news
        "GYM_CLOSURE_DATES":    _rich_text(gym.get("closure_dates")),
        "GYM1_HEADING":         _str(gym1.get("heading")),
        "GYM1_COPY":            _rich_text(gym1.get("copy")),
        "GYM1_IMAGE":           _str(gym1.get("image")),
        "GYM1_IMAGE_ALT":       _str(gym1.get("image_alt")),
        "GYM1_IMAGE_CAPTION":   _str(gym1.get("image_caption")),
        "GYM1_IMAGE_URL":       _str(gym1.get("image_url")),
        "GYM1_CTA_LABEL":       _str(gym1.get("cta_label")),
        "GYM1_CTA_URL":         _str(gym1.get("cta_url")),
        "GYM2_HEADING":         _str(gym2.get("heading")),
        "GYM2_COPY":            _rich_text(gym2.get("copy")),
        "GYM2_IMAGE":           _str(gym2.get("image")),
        "GYM2_IMAGE_ALT":       _str(gym2.get("image_alt")),
        "GYM2_IMAGE_CAPTION":   _str(gym2.get("image_caption")),
        "GYM2_IMAGE_URL":       _str(gym2.get("image_url")),
        "GYM2_CTA_LABEL":       _str(gym2.get("cta_label")),
        "GYM2_CTA_URL":         _str(gym2.get("cta_url")),

        # Local news
        "LOCAL_SUBTITLE":       _str(local.get("subtitle")),
        "LOCAL_COPY":           _rich_text(local.get("copy")),
        "LOCAL_IMAGE":          _str(local.get("image")),
        "LOCAL_IMAGE_ALT":      _str(local.get("image_alt")),
        "LOCAL_IMAGE_CAPTION":  _str(local.get("image_caption")),
        "LOCAL_IMAGE_URL":      _str(local.get("image_url")),

        # Footer
        "CURRENT_YEAR":         str(datetime.now().year),
        "UNSUBSCRIBE_URL":      "{{UNSUBSCRIBE_URL}}",
        # ↑ Leave this unreplaced — the Supabase Edge Function injects it per recipient at send time
    }

    # Apply all simple replacements
    for tag, value in replacements.items():
        html = html.replace(f"{{{{{tag}}}}}", value)

    # ── Conditionals ──────────────────────────────────────────────────────────
    flags: dict[str, bool] = {
        "GYM_ENABLED":      bool(gym.get("enabled")),
        "GYM2_ENABLED":     bool(gym.get("story2_enabled")) and bool(gym2.get("heading")),
        "LOCAL_ENABLED":    bool((local.get("enabled"))),

        "GYM1_IMAGE":           bool(gym1.get("image")),
        "GYM1_IMAGE_URL":       bool(gym1.get("image_url")) and bool(gym1.get("image")),
        "GYM1_IMAGE_CAPTION":   bool(gym1.get("image_caption")) and bool(gym1.get("image")),
        "GYM1_CTA_LABEL":       bool(gym1.get("cta_label")),
        "GYM2_IMAGE":           bool(gym2.get("image")),
        "GYM2_IMAGE_URL":       bool(gym2.get("image_url")) and bool(gym2.get("image")),
        "GYM2_IMAGE_CAPTION":   bool(gym2.get("image_caption")) and bool(gym2.get("image")),
        "GYM2_CTA_LABEL":       bool(gym2.get("cta_label")),

        "LOCAL_IMAGE":          bool(local.get("image")),
        "LOCAL_IMAGE_URL":      bool(local.get("image_url")) and bool(local.get("image")),
        "LOCAL_IMAGE_CAPTION":  bool(local.get("image_caption")) and bool(local.get("image")),

        "BODY_SHARE_URL":       bool(body.get("share_url")),
        "THOUGHT_SHARE_URL":    bool(thought.get("share_url")),
        "BRAIN_SHARE_URL":      bool(brain.get("share_url")),
        "SOUL_SHARE_URL":       bool(soul.get("share_url")),
    }

    # Add image flags for all four food sections
    for section_data, prefix in [
        (body,    "BODY"),
        (thought, "THOUGHT"),
        (brain,   "BRAIN"),
        (soul,    "SOUL"),
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
    parser = argparse.ArgumentParser(description="Crawford Coaching newsletter renderer")
    parser.add_argument("content", nargs="?", help="Path to content JSON or Python file")
    parser.add_argument("--name", default="there", help="Recipient first name (default: there)")
    parser.add_argument("--proofread", action="store_true", help="Run AI proofreading pass via Anthropic API")
    parser.add_argument("--general", metavar="BODY", help="Render a general (non-newsletter) email with this body text")
    args = parser.parse_args()

    if args.general:
        html = render_general(args.general, first_name=args.name)
        print(html)
        return

    if not args.content:
        parser.error("Provide a content file path, or use --general for a general email")

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
```

---

## Section 4 — Environment setup

Ensure the following are in place before running the renderer.

### 4a. Python dependencies

The renderer uses only the standard library plus the `anthropic` package
(only needed when `--proofread` is used). Install it with:

```bash
pip install anthropic
```

### 4b. Environment variable

The `--proofread` flag requires an Anthropic API key. Add it to your shell
environment or a `.env` file (use `python-dotenv` to load it if preferred):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### 4c. .gitignore additions

Add the following to `.gitignore` if not already present:

```
.env
archives/
content/*.json
```

Archives are local build artefacts and should not be committed. Content JSON
files may contain draft text — exclude them unless you want version history.

---

## Section 5 — Test the render

Once Sections 1–4 are complete, run a test render:

```bash
# Standard render of Issue 15
python renderer.py content/15-becoming-a-snacker.json

# With proofreading (requires ANTHROPIC_API_KEY)
python renderer.py content/15-becoming-a-snacker.json --proofread

# Open the output
open archives/15-becoming-a-snacker/rendered.html
```

Expected output:
```
Rendered: /path/to/project/archives/15-becoming-a-snacker/rendered.html
Preview:  file:///path/to/project/archives/15-becoming-a-snacker/rendered.html
```

The rendered file should open in a browser and look identical to the approved
design. Images will appear if the `assets/15-becoming-a-snacker/` folder contains
the image files.

---

## Section 6 — Workflow going forward

For each new newsletter edition:

1. Open `newsletter-form.html` in a browser
2. Fill in all fields
3. Click **Export as JSON** — this copies the JSON to your clipboard
4. Create a new file: `content/NN-edition-slug.json` and paste
5. Add images to `assets/NN-edition-slug/`
6. Run: `python renderer.py content/NN-edition-slug.json`
7. Open `archives/NN-edition-slug/rendered.html` to review
8. When ready to send, upload images to Supabase storage and replace
   local image paths in the JSON with their public Supabase URLs
9. Re-render: `python renderer.py content/NN-edition-slug.json`
10. Send via the existing Gmail SMTP / Supabase Edge Function pipeline

---

## Section 7 — Supabase bucket structure (for reference)

The target bucket layout for edition assets:

```
newsletters/
└── 15-becoming-a-snacker/
    ├── rendered.html
    ├── content.json
    ├── images/
    │   ├── body-plate.png
    │   ├── jasmin-paris.jpg
    │   ├── rx-bar.png
    │   ├── peaceful-grass.png
    │   ├── timer.png
    │   └── ten.png
    └── blogcast/
        └── 15-becoming-a-snacker.m4a

mail-assets/                    ← fixed assets, never change
    ├── cc-email-header.png
    ├── cc-logo-dark.png
    ├── icon-facebook-dark.png
    ├── icon-instagram-dark.png
    ├── icon-linkedin-dark.png
    ├── badge-icf-acc.png
    ├── badge-dare-to-lead.png
    └── badge-issa.png
```

Image URLs in the JSON before sending take the form:
```
https://yxndmpwqvdatkujcukdv.supabase.co/storage/v1/object/public/newsletters/15-becoming-a-snacker/images/body-plate.png
```

---

*End of instructions. All sections must be completed in order before testing.*
