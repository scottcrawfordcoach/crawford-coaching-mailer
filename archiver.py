from __future__ import annotations

import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parent
ARCHIVE_DIR = ROOT_DIR / "archive"


def _slugify(subject: str) -> str:
    slug = subject.strip().lower()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"\s+", "-", slug)
    return slug or "untitled"


def archive_general(subject: str, rendered_html: str) -> Path:
    day = datetime.now().strftime("%Y-%m-%d")
    out_dir = ARCHIVE_DIR / "sent"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{day}_{_slugify(subject)}.html"
    out_path.write_text(rendered_html, encoding="utf-8")
    return out_path


def archive_newsletter(
    subject: str, rendered_html: str, newsletter_payload: dict[str, Any]
) -> Path:
    day = datetime.now().strftime("%Y-%m-%d")
    out_dir = ARCHIVE_DIR / "newsletters" / f"{day}_{_slugify(subject)}"
    out_dir.mkdir(parents=True, exist_ok=True)

    rendered_path = out_dir / "rendered.html"
    rendered_path.write_text(rendered_html, encoding="utf-8")

    content_path = out_dir / "content.py"
    content_path.write_text(
        f"newsletter = {repr(newsletter_payload)}\n", encoding="utf-8"
    )

    # Copy local images into the archive directory and rewrite paths
    def _replace_local_src(match: re.Match[str]) -> str:
        src = match.group(1)
        if src.startswith("http://") or src.startswith("https://"):
            return match.group(0)
        src_path = ROOT_DIR / src
        if src_path.exists():
            shutil.copy2(src_path, out_dir / src_path.name)
            return f'src="{src_path.name}"'
        else:
            print(f"Warning: image not found, skipping: {src_path}")
            return match.group(0)

    updated_html = re.sub(r'src="([^"]+)"', _replace_local_src, rendered_html)
    rendered_path.write_text(updated_html, encoding="utf-8")

    return out_dir
