from __future__ import annotations

import argparse
import importlib
import re
from collections import defaultdict
from pathlib import Path
from pprint import pformat
from typing import Any


BLOCKS = {
    "SUBJECT",
    "TITLE",
    "OPENING_QUOTE",
    "INTRO",
    "INTRO_ACTIONS",
    "FOOD_BODY",
    "FOOD_BRAIN",
    "FOOD_THOUGHT",
    "FOOD_SOUL",
    "GYM_NEWS",
    "LOCAL_NEWS",
}

META_KEYS = {"subtitle", "image", "cta_label", "cta_url"}


def markdown_links_to_html(text: str) -> str:
    # Convert markdown links in body text to inline HTML links.
    pattern = re.compile(r"\[([^\]]+)\]\((https?://[^)]+)\)")
    return pattern.sub(r'<a href="\2">\1</a>', text)


def rich_paragraphs(text: str) -> str:
    text = text.strip()
    if not text:
        return ""
    if "<p" in text:
        return text

    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    rendered: list[str] = []
    for para in paragraphs:
        para = markdown_links_to_html(para)
        para = para.replace("\n", "<br>")
        rendered.append(f"<p>{para}</p>")
    return "\n".join(rendered)


def parse_docx(path: Path) -> dict[str, list[str]]:
    docx_module = importlib.import_module("docx")
    doc = docx_module.Document(path)
    blocks: dict[str, list[str]] = defaultdict(list)
    current: str | None = None

    for paragraph in doc.paragraphs:
        raw = paragraph.text.rstrip()
        text = raw.strip()

        if not text:
            if current and blocks[current]:
                blocks[current].append("")
            continue

        candidate = text.upper().strip()
        if candidate in BLOCKS:
            current = candidate
            continue

        if current:
            blocks[current].append(text)

    return blocks


def key_value_lines(lines: list[str]) -> tuple[dict[str, str], list[str]]:
    values: dict[str, str] = {}
    remaining: list[str] = []

    for line in lines:
        if ":" in line:
            key, value = line.split(":", 1)
            norm_key = key.strip().lower()
            if norm_key in META_KEYS or norm_key in {"share_url", "subscribe_url", "full_blog_url", "item"}:
                values[norm_key] = value.strip()
                continue
        remaining.append(line)

    return values, remaining


def build_section(lines: list[str]) -> dict[str, Any]:
    kv, remaining = key_value_lines(lines)

    subtitle = kv.get("subtitle")
    body_lines = [line for line in remaining]

    if not subtitle:
        non_empty = [line for line in body_lines if line.strip()]
        if non_empty:
            subtitle = non_empty[0]
            body_lines = non_empty[1:]

    body_text = "\n".join(body_lines).strip()
    return {
        "subtitle": subtitle or "",
        "body": rich_paragraphs(body_text),
        "image": kv.get("image") or None,
        "cta_label": kv.get("cta_label") or None,
        "cta_url": kv.get("cta_url") or None,
    }


def build_intro_actions(lines: list[str]) -> dict[str, str]:
    values, _ = key_value_lines(lines)
    return {
        "share_url": values.get("share_url", ""),
        "subscribe_url": values.get("subscribe_url", ""),
        "full_blog_url": values.get("full_blog_url", ""),
    }


def build_gym_news(lines: list[str]) -> dict[str, Any] | None:
    values, _remaining = key_value_lines(lines)
    items: list[dict[str, str]] = []

    for line in lines:
        if not line.lower().startswith("item:"):
            continue
        payload = line.split(":", 1)[1].strip()
        if "::" in payload:
            heading, body = payload.split("::", 1)
        else:
            heading, body = payload, ""
        items.append(
            {
                "heading": heading.strip(),
                "body": markdown_links_to_html(body.strip()),
            }
        )

    if not items and not (values.get("cta_label") or values.get("cta_url")):
        return None

    return {
        "items": items,
        "cta_label": values.get("cta_label") or None,
        "cta_url": values.get("cta_url") or None,
    }


def build_local_news(lines: list[str]) -> dict[str, str] | None:
    values, remaining = key_value_lines(lines)

    subtitle = values.get("subtitle")
    if not subtitle:
        non_empty = [line for line in remaining if line.strip()]
        subtitle = non_empty[0] if non_empty else ""
        body_lines = non_empty[1:] if len(non_empty) > 1 else []
    else:
        body_lines = [line for line in remaining if line.strip()]

    body = markdown_links_to_html("\n".join(body_lines).strip())

    if not subtitle and not body:
        return None

    return {
        "subtitle": subtitle,
        "body": body,
    }


def first_line(blocks: dict[str, list[str]], key: str, default: str = "") -> str:
    lines = [line for line in blocks.get(key, []) if line.strip()]
    return lines[0].strip() if lines else default


def build_newsletter(blocks: dict[str, list[str]]) -> dict[str, Any]:
    intro_body = rich_paragraphs("\n".join(blocks.get("INTRO", [])))

    newsletter: dict[str, Any] = {
        "subject": first_line(blocks, "SUBJECT", "Newsletter Issue"),
        "title": first_line(blocks, "TITLE", "Newsletter Title"),
        "opening_quote": first_line(blocks, "OPENING_QUOTE", ""),
        "intro": {
            "body": intro_body,
        },
        "intro_actions": build_intro_actions(blocks.get("INTRO_ACTIONS", [])),
        "food_body": build_section(blocks.get("FOOD_BODY", [])),
        "food_brain": build_section(blocks.get("FOOD_BRAIN", [])),
        "food_thought": build_section(blocks.get("FOOD_THOUGHT", [])),
        "food_soul": build_section(blocks.get("FOOD_SOUL", [])),
    }

    gym_news = build_gym_news(blocks.get("GYM_NEWS", []))
    if gym_news:
        newsletter["gym_news"] = gym_news

    local_news = build_local_news(blocks.get("LOCAL_NEWS", []))
    if local_news:
        newsletter["local_news"] = local_news

    return newsletter


def write_output(newsletter: dict[str, Any], output_path: Path) -> None:
    rendered = "newsletter = " + pformat(newsletter, width=100, sort_dicts=False) + "\n"
    output_path.write_text(rendered, encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Extract newsletter content from a DOCX draft into newsletter_content.py"
    )
    parser.add_argument(
        "--edition-dir",
        required=True,
        help="Path to edition folder, e.g. newsletters/2026-04-failed-tactic",
    )
    parser.add_argument(
        "--input",
        default="draft.docx",
        help="DOCX filename inside edition dir (default: draft.docx)",
    )
    parser.add_argument(
        "--output",
        default="newsletter_content.py",
        help="Output Python filename inside edition dir (default: newsletter_content.py)",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()

    edition_dir = Path(args.edition_dir).expanduser().resolve()
    input_path = edition_dir / args.input
    output_path = edition_dir / args.output

    if not input_path.exists():
        raise FileNotFoundError(f"Draft DOCX not found: {input_path}")

    blocks = parse_docx(input_path)
    newsletter = build_newsletter(blocks)
    write_output(newsletter, output_path)

    print(f"Generated: {output_path}")


if __name__ == "__main__":
    main()
