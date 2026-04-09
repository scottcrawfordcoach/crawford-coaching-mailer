/**
 * share-page/index.ts
 * -------------------
 * Crawford Coaching — Social Share Page Proxy
 *
 * Fetches newsletter share page HTML from Supabase Storage and serves
 * it with the correct Content-Type so browsers render it properly.
 * (Supabase Storage serves .html files as text/plain by default.)
 *
 * Public GET — no auth required (share links are public).
 *
 * Query params:
 *   slug    — edition slug, e.g. "15-becoming-a-snacker"
 *   section — one of: body, thought, brain, soul
 *
 * Example:
 *   GET /share-page?slug=15-becoming-a-snacker&section=body
 *
 * Deploy:
 *   supabase functions deploy share-page --no-verify-jwt
 */

const VALID_SECTIONS = new Set(["body", "thought", "brain", "soul"]);
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  }

  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") ?? "";
  const section = url.searchParams.get("section") ?? "";

  if (!SLUG_RE.test(slug) || !VALID_SECTIONS.has(section)) {
    return new Response("Not found", { status: 404 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const storageUrl = `${supabaseUrl}/storage/v1/object/public/newsletters/${slug}/socials/${section}.html`;

  const storageRes = await fetch(storageUrl);
  if (!storageRes.ok) {
    return new Response("Not found", { status: 404 });
  }

  const html = await storageRes.text();

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
