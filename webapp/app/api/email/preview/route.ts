import { NextRequest, NextResponse } from "next/server";
import { checkSession } from "@/lib/auth";
import { renderEmailPreview } from "@/lib/templates";

export async function POST(req: NextRequest) {
  if (!checkSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { firstName, body } = await req.json();
  const html = renderEmailPreview(firstName ?? "there", body ?? "");
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
