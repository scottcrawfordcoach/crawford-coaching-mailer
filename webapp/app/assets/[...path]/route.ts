import { NextRequest, NextResponse } from "next/server";

/**
 * GET /assets/[...path]
 *
 * Proxies files from Supabase Storage through app.crawford-coaching.ca so
 * that all URLs in outgoing emails are on a trusted sending domain rather
 * than the raw supabase.co project subdomain (which some mail servers flag
 * as poor reputation).
 *
 * Path structure:
 *   /assets/{bucket}/{...storagePath}
 *
 * Examples:
 *   /assets/mail-assets/cc-email-header.png
 *     → supabase/storage/v1/object/public/mail-assets/cc-email-header.png
 *   /assets/newsletters/15-becoming-a-snacker/images/body-plate.png
 *     → supabase/storage/v1/object/public/newsletters/15-becoming-a-snacker/images/body-plate.png
 */

const CONTENT_TYPES: Record<string, string> = {
  png:  "image/png",
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  gif:  "image/gif",
  webp: "image/webp",
  svg:  "image/svg+xml",
  ico:  "image/x-icon",
  mp3:  "audio/mpeg",
  mp4:  "video/mp4",
  m4a:  "audio/mp4",
  ogg:  "audio/ogg",
  wav:  "audio/wav",
};

// Segment must be alphanumeric, hyphens, underscores, dots only — no traversal
const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;

  // Must have at least bucket + filename
  if (!path || path.length < 2) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Reject any path traversal or unsafe segments
  if (path.some((segment) => !SAFE_SEGMENT.test(segment))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    return new NextResponse("Server misconfigured", { status: 500 });
  }

  const storagePath = path.join("/");
  const storageUrl = `${supabaseUrl}/storage/v1/object/public/${storagePath}`;

  let res: Response;
  try {
    res = await fetch(storageUrl);
  } catch {
    return new NextResponse("Upstream error", { status: 502 });
  }

  if (!res.ok) {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = (path[path.length - 1].split(".").pop() ?? "").toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

  const buffer = await res.arrayBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      // Cache aggressively — these assets are static
      "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
