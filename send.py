from __future__ import annotations

import argparse
from pathlib import Path

from archiver import archive_general, archive_newsletter
from config import load_settings
from mailer import get_campaign_detail, get_campaigns, send_campaign
from recipients import resolve_recipients
from renderer import render_general, render_newsletter


def _read_body_args(body: str | None, body_file: str | None) -> str:
    if body:
        return body
    if body_file:
        file_path = Path(body_file).expanduser().resolve()
        if not file_path.exists():
            raise FileNotFoundError(f"Body file not found: {file_path}")
        return file_path.read_text(encoding="utf-8")
    raise ValueError("General template requires --body or --body-file")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Crawford Coaching Mailer CLI")
    parser.add_argument(
        "--action", choices=["send", "campaigns", "campaign-detail"], default="send"
    )
    parser.add_argument("--template", choices=["general", "newsletter"])
    parser.add_argument("--subject")
    parser.add_argument("--recipients")
    parser.add_argument("--dry-run", action="store_true")

    # General template inputs
    parser.add_argument("--body", help="General email body content (text or HTML)")
    parser.add_argument(
        "--body-file", help="Path to a file containing general email body"
    )

    # Newsletter inputs
    parser.add_argument(
        "--content", help="Path to newsletter content file (.json or .py)"
    )

    # Query options
    parser.add_argument(
        "--limit", type=int, default=25, help="Campaign list limit (default: 25)"
    )
    parser.add_argument(
        "--offset", type=int, default=0, help="Campaign list offset (default: 0)"
    )
    parser.add_argument(
        "--campaign-id", help="Campaign ID for --action campaign-detail"
    )

    return parser


def _print_campaigns(rows: list[dict]) -> None:
    if not rows:
        print("No campaigns found.")
        return

    for row in rows:
        print(
            " | ".join(
                [
                    f"id={row.get('id')}",
                    f"type={row.get('campaign_type')}",
                    f"status={row.get('status')}",
                    f"subject={row.get('subject')}",
                    f"sent={row.get('sent_at')}",
                    f"recipients={row.get('recipient_count')}",
                    f"opens={row.get('open_count', 0)}",
                    f"clicks={row.get('click_count', 0)}",
                    f"unsubs={row.get('unsubscribe_count', 0)}",
                ]
            )
        )


def _print_campaign_detail(data: dict) -> None:
    campaign = data.get("campaign") or {}
    recipients = data.get("recipients") or []
    events = data.get("events") or []

    print(f"Campaign: {campaign.get('id')}")
    print(f"Subject: {campaign.get('subject')}")
    print(f"Type: {campaign.get('campaign_type')}")
    print(f"Status: {campaign.get('status')}")
    print(f"Sent: {campaign.get('sent_at')}")
    print(f"Recipients: {len(recipients)}")
    print(f"Events: {len(events)}")

    event_counts = {"open": 0, "click": 0, "unsubscribe": 0}
    for event in events:
        event_type = event.get("event_type")
        if event_type in event_counts:
            event_counts[event_type] += 1

    print(
        "Event counts: "
        f"open={event_counts['open']} "
        f"click={event_counts['click']} "
        f"unsubscribe={event_counts['unsubscribe']}"
    )


def main() -> None:
    args = build_parser().parse_args()
    settings = load_settings()

    if args.action == "campaigns":
        result = get_campaigns(settings=settings, limit=args.limit, offset=args.offset)
        if result.get("error"):
            raise RuntimeError(f"Campaign query failed: {result['error']}")
        _print_campaigns(result.get("data") or [])
        return

    if args.action == "campaign-detail":
        if not args.campaign_id:
            raise ValueError("--campaign-id is required for --action campaign-detail")
        result = get_campaign_detail(settings=settings, campaign_id=args.campaign_id)
        if result.get("error"):
            raise RuntimeError(f"Campaign detail query failed: {result['error']}")
        _print_campaign_detail(result.get("data") or {})
        return

    if not args.template:
        raise ValueError("--template is required for send action")
    if not args.subject:
        raise ValueError("--subject is required for send action")
    if not args.recipients:
        raise ValueError("--recipients is required for send action")

    recipients = resolve_recipients(args.recipients, settings)
    if not recipients:
        raise RuntimeError("No recipients resolved. Aborting.")

    preview_name = recipients[0].first_name or "there"

    if args.template == "general":
        body = _read_body_args(args.body, args.body_file)
        rendered_html = render_general(body=body, first_name=preview_name)
        archive_path = archive_general(
            subject=args.subject, rendered_html=rendered_html
        )
        payload_data = None
    else:
        if not args.content:
            raise ValueError("Newsletter template requires --content <file.json>")
        rendered_html, payload_data = render_newsletter(
            Path(args.content), first_name=preview_name
        )
        archive_path = archive_newsletter(
            subject=args.subject,
            rendered_html=rendered_html,
            newsletter_payload=payload_data,
        )

    print(f"Archived rendered output: {archive_path}")

    if args.dry_run:
        print("Dry run complete. No emails were sent.")
        return

    result = send_campaign(
        settings=settings,
        campaign_type=args.template,
        subject=args.subject,
        html_body=rendered_html,
        recipients=recipients,
    )

    if result.get("error"):
        raise RuntimeError(f"Send failed: {result['error']}")

    data = result.get("data") or {}
    print("Send complete")
    print(f"Campaign ID: {data.get('campaign_id')}")
    print(f"Recipients sent: {data.get('recipient_count')}")

    errors = data.get("errors")
    if errors:
        print("Recipient errors:")
        for err in errors:
            print(f"- {err}")


if __name__ == "__main__":
    main()
