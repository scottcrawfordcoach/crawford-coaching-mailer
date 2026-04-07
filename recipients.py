from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
from typing import Iterable

from config import Settings


@dataclass
class Recipient:
    email: str
    first_name: str | None = None
    contact_id: str | None = None


def _supabase(settings: Settings) -> Any:
    # The local `supabase/` edge-functions directory shadows the supabase Python
    # package. Temporarily remove the project root from sys.path so the real
    # installed package is found instead.
    import sys
    import pathlib

    _root = str(pathlib.Path(__file__).parent)
    _removed = _root in sys.path
    if _removed:
        sys.path.remove(_root)
    try:
        from supabase import create_client
    finally:
        if _removed:
            sys.path.insert(0, _root)

    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def _dedupe(recipients: Iterable[Recipient]) -> list[Recipient]:
    seen: set[str] = set()
    out: list[Recipient] = []
    for item in recipients:
        email = item.email.lower().strip()
        if not email or email in seen:
            continue
        seen.add(email)
        out.append(Recipient(email=email, first_name=item.first_name, contact_id=item.contact_id))
    return out


def _manual_emails(raw: str) -> list[Recipient]:
    emails = [e.strip() for e in raw.split(",")]
    return _dedupe(Recipient(email=e) for e in emails if e)


def _emails_from_file(path_str: str) -> list[Recipient]:
    path = Path(path_str).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(f"Recipients file not found: {path}")
    lines = [line.strip() for line in path.read_text(encoding="utf-8").splitlines()]
    return _dedupe(Recipient(email=e) for e in lines if e)


def _newsletter_contacts(settings: Settings) -> list[Recipient]:
    sb = _supabase(settings)
    resp = (
        sb.table("contacts")
        .select("id, email, first_name")
        .eq("newsletter_enabled", True)
        .eq("contact_status", "active")
        .not_.is_("email", "null")
        .execute()
    )
    rows = resp.data or []
    return _dedupe(
        Recipient(email=r["email"], first_name=r.get("first_name"), contact_id=r.get("id"))
        for r in rows
        if r.get("email")
    )


def _tag_contacts(settings: Settings, raw_tags: str) -> list[Recipient]:
    sb = _supabase(settings)
    tags = [t.strip().upper() for t in raw_tags.split(",") if t.strip()]
    if not tags:
        return []

    tag_resp = (
        sb.table("contact_tags")
        .select("contact_id, tag")
        .in_("tag", tags)
        .execute()
    )
    tag_rows = tag_resp.data or []

    contact_tags: dict[str, set[str]] = {}
    for row in tag_rows:
        cid = row.get("contact_id")
        tag = str(row.get("tag", "")).upper()
        if not cid or not tag:
            continue
        contact_tags.setdefault(cid, set()).add(tag)

    matching_ids = [cid for cid, seen in contact_tags.items() if all(tag in seen for tag in tags)]
    if not matching_ids:
        return []

    contacts_resp = (
        sb.table("contacts")
        .select("id, email, first_name")
        .in_("id", matching_ids)
        .eq("contact_status", "active")
        .not_.is_("email", "null")
        .execute()
    )
    rows = contacts_resp.data or []
    return _dedupe(
        Recipient(email=r["email"], first_name=r.get("first_name"), contact_id=r.get("id"))
        for r in rows
        if r.get("email")
    )


def _name_lookup(settings: Settings, query: str) -> list[Recipient]:
    sb = _supabase(settings)
    clean = query.strip()
    if not clean:
        return []

    # Broad ilike fallback against first and last name.
    first_resp = (
        sb.table("contacts")
        .select("id, email, first_name")
        .ilike("first_name", f"%{clean}%")
        .not_.is_("email", "null")
        .execute()
    )
    last_resp = (
        sb.table("contacts")
        .select("id, email, first_name")
        .ilike("last_name", f"%{clean}%")
        .not_.is_("email", "null")
        .execute()
    )

    rows = (first_resp.data or []) + (last_resp.data or [])
    return _dedupe(
        Recipient(email=r["email"], first_name=r.get("first_name"), contact_id=r.get("id"))
        for r in rows
        if r.get("email")
    )


def resolve_recipients(spec: str, settings: Settings) -> list[Recipient]:
    spec = spec.strip()
    if not spec:
        raise ValueError("--recipients cannot be empty")

    if spec.startswith("file:"):
        return _emails_from_file(spec.split(":", 1)[1])
    if spec == "newsletter":
        return _newsletter_contacts(settings)
    if spec.startswith("tag:"):
        return _tag_contacts(settings, spec.split(":", 1)[1])
    if spec.startswith("name:"):
        return _name_lookup(settings, spec.split(":", 1)[1])

    return _manual_emails(spec)
