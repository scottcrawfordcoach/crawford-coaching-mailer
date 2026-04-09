import { NextRequest, NextResponse } from "next/server";
import { checkSession } from "@/lib/auth";

export interface LinkResult {
  url: string;
  status: number | null;
  ok: boolean;
  error?: string;
}

// Extract unique http/https hrefs from an HTML string
function extractLinks(html: string): string[] {
  const full = new Set<string>();
  const re = /href="(https?:\/\/[^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    full.add(m[1]);
  }
  return Array.from(full);
}

async function checkUrl(url: string): Promise<LinkResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Crawford-Coaching-LinkChecker/1.0" },
    });
    // Some servers (Amazon, LinkedIn) block HEAD but allow GET — retry with GET
    if (res.status === 405) {
      const getRes = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        redirect: "follow",
        headers: { "User-Agent": "Crawford-Coaching-LinkChecker/1.0" },
      });
      return { url, status: getRes.status, ok: getRes.ok };
    }
    return { url, status: res.status, ok: res.ok };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    const aborted = msg.includes("abort") || msg.includes("signal");
    return { url, status: null, ok: false, error: aborted ? "Timed out" : msg };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: NextRequest) {
  if (!checkSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { html } = await req.json();
  if (typeof html !== "string") {
    return NextResponse.json({ error: "html required" }, { status: 400 });
  }

  const urls = extractLinks(html);
  if (urls.length === 0) {
    return NextResponse.json({ results: [] });
  }

  // Check up to 40 links concurrently (cap to avoid exhausting edge function limits)
  const capped = urls.slice(0, 40);
  const results = await Promise.all(capped.map(checkUrl));

  return NextResponse.json({ results });
}
