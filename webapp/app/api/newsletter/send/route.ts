import { NextRequest, NextResponse } from "next/server";
import { checkSession } from "@/lib/auth";
import { renderNewsletterPreview, type NewsletterContent } from "@/lib/templates";

export async function POST(req: NextRequest) {
  if (!checkSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { subject, vars, recipients, edition_slug } = await req.json();

  if (!subject?.trim()) {
    return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  }

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return NextResponse.json(
      { error: "At least one recipient is required" },
      { status: 400 },
    );
  }

  // Render with {{FIRST_NAME}} and {{UNSUBSCRIBE_URL}} left as tokens —
  // the mail-sender edge function replaces them per recipient.
  const html = renderNewsletterPreview(vars as Partial<NewsletterContent>, { forSend: true });

  const mailSenderUrl =
    process.env.MAIL_SENDER_URL ||
    `${(process.env.SUPABASE_URL ?? "").replace(/\/$/, "")}/functions/v1/mail-sender`;

  const bearerToken = process.env.MAIL_SENDER_BEARER_TOKEN;
  if (!bearerToken) {
    return NextResponse.json(
      { error: "MAIL_SENDER_BEARER_TOKEN is not configured" },
      { status: 500 },
    );
  }

  const payload = {
    action: "send_campaign",
    payload: {
      campaign_type: "newsletter",
      subject: subject.trim(),
      html_body: html,
      edition_slug: edition_slug ?? null,
      recipients: recipients.map(
        (r: { email: string; first_name?: string; contact_id?: string }) => ({
          email: r.email,
          first_name: r.first_name ?? null,
          contact_id: r.contact_id ?? null,
        }),
      ),
    },
  };

  try {
    const res = await fetch(mailSenderUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error ?? "Mail sender returned an error" },
        { status: res.status },
      );
    }

    return NextResponse.json({
      campaign_id: data.data?.campaign_id ?? null,
      recipient_count: data.data?.recipient_count ?? recipients.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Network error" },
      { status: 500 },
    );
  }
}
