import { NextRequest, NextResponse } from "next/server";

/**
 * GET /share/[slug]/[section]
 *
 * Proxies social share page HTML from Supabase Storage and serves
 * it with the correct Content-Type so browsers render it properly.
 *
 * Example: /share/15-becoming-a-snacker/body
 *   → fetches newsletters/15-becoming-a-snacker/socials/body.html
 */

const VALID_SECTIONS = new Set(["body", "thought", "brain", "soul"]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; section: string }> },
) {
  const { slug, section } = await params;

  // Validate section to prevent path traversal
  if (!VALID_SECTIONS.has(section)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Validate slug: alphanumeric, hyphens, digits only
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    return new NextResponse("Server misconfigured", { status: 500 });
  }

  const storageUrl = `${supabaseUrl}/storage/v1/object/public/newsletters/${slug}/socials/${section}.html`;

  const res = await fetch(storageUrl);
  if (!res.ok) {
    return new NextResponse("Not found", { status: 404 });
  }

  const html = await res.text();

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
