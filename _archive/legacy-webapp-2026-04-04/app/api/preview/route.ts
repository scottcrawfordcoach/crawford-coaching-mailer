import { NextRequest, NextResponse } from "next/server";
import { checkSession } from "@/lib/auth";
import {
  renderGeneralPreview,
  renderNewsletterPreview,
  type GeneralTemplateVars,
  type NewsletterTemplateVars,
} from "@/lib/templates";

export async function POST(req: NextRequest) {
  if (!checkSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type, vars } = await req.json();

  let html: string;
  try {
    if (type === "general") {
      html = renderGeneralPreview(vars as GeneralTemplateVars);
    } else if (type === "newsletter") {
      html = renderNewsletterPreview(vars as NewsletterTemplateVars);
    } else {
      return NextResponse.json({ error: "Unknown template type" }, { status: 400 });
    }
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
