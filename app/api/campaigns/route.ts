import { NextRequest, NextResponse } from "next/server";
import { checkSession } from "@/lib/auth";

const MAIL_SENDER_URL = process.env.MAIL_SENDER_URL;
const MAIL_SENDER_TOKEN = process.env.MAIL_SENDER_TOKEN;

// GET /api/campaigns — list sent campaigns
export async function GET(req: NextRequest) {
  if (!checkSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const response = await fetch(MAIL_SENDER_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MAIL_SENDER_TOKEN}`,
    },
    body: JSON.stringify({ action: "get_campaigns", payload: { limit, offset } }),
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.ok ? 200 : response.status });
}

// POST /api/campaigns — send a campaign
export async function POST(req: NextRequest) {
  if (!checkSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const response = await fetch(MAIL_SENDER_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MAIL_SENDER_TOKEN}`,
    },
    body: JSON.stringify({ action: "send_campaign", payload: body }),
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.ok ? 200 : 500 });
}
