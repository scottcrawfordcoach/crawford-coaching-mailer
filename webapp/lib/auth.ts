import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const COOKIE_NAME = "cc-mail-session";

function normalizeSecret(value?: string): string {
  return (value ?? "").trim().replace(/^['\"]|['\"]$/g, "");
}

export function checkSession(): boolean {
  const cookieStore = cookies();
  const session = cookieStore.get(COOKIE_NAME);
  const expected = normalizeSecret(process.env.TOOL_PASSWORD);
  return !!session?.value && normalizeSecret(session.value) === expected;
}

export function setSessionCookie(res: NextResponse, password: string): void {
  res.cookies.set(COOKIE_NAME, normalizeSecret(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });
}
