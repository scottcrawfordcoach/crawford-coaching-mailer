import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const COOKIE_NAME = "cc-mail-session";

export function checkSession(): boolean {
  const cookieStore = cookies();
  const session = cookieStore.get(COOKIE_NAME);
  return !!session?.value && session.value === process.env.TOOL_PASSWORD;
}

export function setSessionCookie(res: NextResponse, password: string): void {
  res.cookies.set(COOKIE_NAME, password, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 7, // 7 days
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
