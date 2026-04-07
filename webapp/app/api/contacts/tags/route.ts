import { NextRequest, NextResponse } from "next/server";
import { checkSession } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!checkSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const category = req.nextUrl.searchParams.get("category")?.trim() ?? "";
  const valid = ["day", "slot", "program", "status"];
  if (!valid.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("contact_tags")
    .select("tag")
    .eq("category", category)
    .order("tag");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Deduplicate
  const tags = [...new Set((data ?? []).map((r) => r.tag as string))];

  return NextResponse.json({ tags });
}
