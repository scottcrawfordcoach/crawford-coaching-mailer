import { NextRequest, NextResponse } from "next/server";
import { checkSession } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

// GET /api/editions/[slug] — load content.json for an edition
export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } },
) {
  if (!checkSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage
    .from("newsletters")
    .download(`${params.slug}/content.json`);

  if (error) {
    if (error.message.includes("not found") || error.statusCode === "404") {
      return NextResponse.json({ content: null });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const text = await data.text();
  try {
    const content = JSON.parse(text);
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json({ error: "Invalid content.json" }, { status: 500 });
  }
}

// PUT /api/editions/[slug] — save content.json for an edition
export async function PUT(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  if (!checkSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const content = await req.json();
  const supabase = getSupabaseClient();

  const json = JSON.stringify(content, null, 2);
  const { error } = await supabase.storage
    .from("newsletters")
    .upload(`${params.slug}/content.json`, Buffer.from(json), {
      contentType: "application/json",
      upsert: true,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ saved: true });
}
