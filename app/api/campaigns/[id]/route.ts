import { NextRequest, NextResponse } from "next/server";
import { checkSession } from "@/lib/auth";

const MAIL_SENDER_URL = process.env.MAIL_SENDER_URL;
const MAIL_SENDER_TOKEN = process.env.MAIL_SENDER_TOKEN;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!checkSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = await fetch(MAIL_SENDER_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MAIL_SENDER_TOKEN}`,
    },
    body: JSON.stringify({
      action: "get_campaign_detail",
      payload: { campaign_id: params.id },
    }),
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.ok ? 200 : response.status });
}
