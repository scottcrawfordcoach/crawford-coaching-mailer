import { NextResponse } from "next/server";
import { checkSession } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

export async function GET() {
  if (!checkSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("contacts")
    .select("id, email, first_name, last_name")
    .eq("newsletter_enabled", true)
    .eq("contact_status", "active")
    .not("email", "is", null)
    .order("first_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const contacts = data ?? [];
  return NextResponse.json({ contacts, count: contacts.length });
}
