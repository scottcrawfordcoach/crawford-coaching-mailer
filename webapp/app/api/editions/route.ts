import { NextRequest, NextResponse } from "next/server";
import { checkSession } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

// GET /api/editions — list all edition folders from Supabase storage
export async function GET() {
  if (!checkSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseClient();

  // List top-level folders in the newsletters bucket
  const { data, error } = await supabase.storage
    .from("newsletters")
    .list("", { limit: 100, sortBy: { column: "name", order: "desc" } });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const folders = (data ?? [])
    .filter((item) => item.id === null) // folders have null id in Supabase storage list
    .map((item) => item.name);

  return NextResponse.json({ editions: folders });
}

// POST /api/editions — create a new edition folder with an empty content.json
export async function POST(req: NextRequest) {
  if (!checkSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await req.json();

  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  // Validate slug format: lowercase letters, numbers, hyphens only
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json(
      { error: "Slug must contain only lowercase letters, numbers, and hyphens" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseClient();

  // Create an empty content.json to establish the folder
  const emptyContent = JSON.stringify({ edition_label: "", subject: "" }, null, 2);
  const { error } = await supabase.storage
    .from("newsletters")
    .upload(`${slug}/content.json`, Buffer.from(emptyContent), {
      contentType: "application/json",
      upsert: false, // fail if already exists
    });

  if (error) {
    if (error.message.includes("already exists") || error.statusCode === "409") {
      return NextResponse.json({ error: "An edition with this slug already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ slug, created: true });
}
