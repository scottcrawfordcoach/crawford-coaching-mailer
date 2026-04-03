import { NextRequest, NextResponse } from "next/server";
import { checkSession, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  if (!password || password !== process.env.TOOL_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, password);
  return res;
}

export async function DELETE(req: NextRequest) {
  const { NextResponse: NR } = await import("next/server");
  const res = NR.json({ ok: true });
  res.cookies.set("cc-mail-session", "", { maxAge: 0, path: "/" });
  return res;
}
