import { NextRequest, NextResponse } from "next/server";
import { checkSession } from "@/lib/auth";
import { renderNewsletterPreview, type NewsletterContent } from "@/lib/templates";

export async function POST(req: NextRequest) {
  if (!checkSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { vars } = await req.json();

  let html: string;
  try {
    html = renderNewsletterPreview(vars as Partial<NewsletterContent>);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Render error" },
      { status: 500 },
    );
  }

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
