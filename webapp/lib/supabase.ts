import { createClient } from "@supabase/supabase-js";

// Server-side only — never import this in client components.
export function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

// Returns the public base URL for the newsletters bucket
export function newsletterPublicUrl(slug: string, filename: string): string {
  const url = process.env.SUPABASE_URL ?? "";
  return `${url}/storage/v1/object/public/newsletters/${slug}/images/${filename}`;
}
