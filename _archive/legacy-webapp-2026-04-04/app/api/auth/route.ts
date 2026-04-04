import { NextRequest, NextResponse } from "next/server";
import { checkSession, setSessionCookie } from "@/lib/auth";

function normalizeSecret(value?: string): string {
  return (value ?? "").trim().replace(/^['\"]|['\"]$/g, "");
}

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const provided = normalizeSecret(password);
  const expected = normalizeSecret(process.env.TOOL_PASSWORD);

  if (!expected) {
    return NextResponse.json(
      { error: "TOOL_PASSWORD is not configured on this deployment" },
      { status: 500 }
    );
  }

  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, provided);
  return res;
}

export async function DELETE(req: NextRequest) {
  const { NextResponse: NR } = await import("next/server");
  const res = NR.json({ ok: true });
  res.cookies.set("cc-mail-session", "", { maxAge: 0, path: "/" });
  return res;
}
