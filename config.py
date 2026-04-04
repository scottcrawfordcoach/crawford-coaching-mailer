from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file(ROOT_DIR / ".env")


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_service_role_key: str
    mail_sender_url: str
    mail_sender_bearer_token: str
    from_name: str = "Scott Crawford Coaching"


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def load_settings() -> Settings:
    supabase_url = _required("SUPABASE_URL")

    # MAIL_SENDER_URL is optional; default to your Supabase Edge Function endpoint.
    mail_sender_url = os.getenv("MAIL_SENDER_URL", "").strip()
    if not mail_sender_url:
        mail_sender_url = f"{supabase_url.rstrip('/')}/functions/v1/mail-sender"

    return Settings(
        supabase_url=supabase_url,
        supabase_service_role_key=_required("SUPABASE_SERVICE_ROLE_KEY"),
        mail_sender_url=mail_sender_url,
        mail_sender_bearer_token=_required("MAIL_SENDER_BEARER_TOKEN"),
        from_name=os.getenv("FROM_NAME", "Scott Crawford Coaching").strip()
        or "Scott Crawford Coaching",
    )
