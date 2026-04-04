import { NextRequest, NextResponse } from "next/server";
import { checkSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!checkSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const dataHandlerUrl = process.env.DATA_HANDLER_URL;
  const dataHandlerToken = process.env.DATA_HANDLER_TOKEN;

  const response = await fetch(dataHandlerUrl!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${dataHandlerToken}`,
    },
    body: JSON.stringify({ action: "contact_lookup", payload: body }),
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.ok ? 200 : response.status });
}
