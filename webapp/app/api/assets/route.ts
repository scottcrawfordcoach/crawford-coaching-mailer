import { NextRequest, NextResponse } from "next/server";
import { checkSession } from "@/lib/auth";
import { getSupabaseClient, newsletterPublicUrl } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  if (!checkSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const slug = formData.get("slug") as string | null;

  if (!file || !slug) {
    return NextResponse.json({ error: "file and slug are required" }, { status: 400 });
  }

  // Sanitize filename — lowercase, spaces to hyphens, keep alphanumeric/.-
  const safeName = file.name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "");

  const storagePath = `${slug}/images/${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const supabase = getSupabaseClient();
  const { error } = await supabase.storage
    .from("newsletters")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const url = newsletterPublicUrl(slug, safeName);
  return NextResponse.json({ url, filename: safeName });
}
