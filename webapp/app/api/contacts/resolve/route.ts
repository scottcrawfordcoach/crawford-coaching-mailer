import { NextRequest, NextResponse } from "next/server";
import { checkSession } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!checkSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tags = req.nextUrl.searchParams.getAll("tags").filter(Boolean);
  const status = req.nextUrl.searchParams.get("status")?.trim() ?? "";

  if (tags.length === 0) {
    return NextResponse.json({ contacts: [] });
  }

  const supabase = getSupabaseClient();

  // Step 1: Find contact IDs matching ALL selected tags (intersection)
  const { data: tagRows, error: tagErr } = await supabase
    .from("contact_tags")
    .select("contact_id, tag")
    .in("tag", tags);

  if (tagErr) {
    return NextResponse.json({ error: tagErr.message }, { status: 500 });
  }

  // Group by contact_id, keep only those matching ALL tags
  const contactTagCounts = new Map<string, number>();
  for (const row of tagRows ?? []) {
    const id = row.contact_id as string;
    contactTagCounts.set(id, (contactTagCounts.get(id) ?? 0) + 1);
  }

  const matchingIds = [...contactTagCounts.entries()]
    .filter(([, count]) => count >= tags.length)
    .map(([id]) => id);

  if (matchingIds.length === 0) {
    return NextResponse.json({ contacts: [] });
  }

  // Step 2: Get contact details with optional status filter
  let query = supabase
    .from("contacts")
    .select("id, email, first_name, last_name, contact_status")
    .in("id", matchingIds)
    .not("email", "is", null);

  if (status) {
    query = query.eq("contact_status", status);
  }

  const { data: contacts, error: contactErr } = await query.order("first_name");

  if (contactErr) {
    return NextResponse.json({ error: contactErr.message }, { status: 500 });
  }

  return NextResponse.json({ contacts: contacts ?? [] });
}
