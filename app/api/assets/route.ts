import { NextRequest, NextResponse } from "next/server";
import { checkSession } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  if (!checkSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const name = formData.get("name") as string | null;

  if (!file || !name) {
    return NextResponse.json({ error: "file and name are required" }, { status: 400 });
  }

  // Sanitize filename
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_");

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const supabase = getSupabaseClient();
  const { error } = await supabase.storage
    .from("mail-assets")
    .upload(safeName, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const url = `${process.env.SUPABASE_URL}/storage/v1/object/public/mail-assets/${safeName}`;
  return NextResponse.json({ url });
}
