from __future__ import annotations

import json
from dataclasses import asdict
from urllib import request

from config import Settings
from recipients import Recipient


class MailSenderError(RuntimeError):
    pass


def _mail_sender_request(*, settings: Settings, action: str, payload: dict) -> dict:
    request_body = {
        "action": action,
        "payload": payload,
    }

    req = request.Request(
        settings.mail_sender_url,
        method="POST",
        data=json.dumps(request_body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.mail_sender_bearer_token}",
        },
    )

    try:
        with request.urlopen(req) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except Exception as exc:  # noqa: BLE001
        raise MailSenderError(f"Mail sender request failed: {exc}") from exc


def send_campaign(
    *,
    settings: Settings,
    campaign_type: str,
    subject: str,
    html_body: str,
    recipients: list[Recipient],
) -> dict:
    return _mail_sender_request(
        settings=settings,
        action="send_campaign",
        payload={
            "campaign_type": campaign_type,
            "subject": subject,
            "html_body": html_body,
            "recipients": [asdict(r) for r in recipients],
        },
    )


def get_campaigns(*, settings: Settings, limit: int = 25, offset: int = 0) -> dict:
    return _mail_sender_request(
        settings=settings,
        action="get_campaigns",
        payload={
            "limit": limit,
            "offset": offset,
        },
    )


def get_campaign_detail(*, settings: Settings, campaign_id: str) -> dict:
    return _mail_sender_request(
        settings=settings,
        action="get_campaign_detail",
        payload={
            "campaign_id": campaign_id,
        },
    )
