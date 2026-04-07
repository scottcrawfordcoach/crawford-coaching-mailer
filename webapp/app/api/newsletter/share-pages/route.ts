import { NextRequest, NextResponse } from "next/server";
import { checkSession } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

// ── Section map (mirrors renderer.py SECTION_MAP) ───────────────────────────

const SECTION_MAP: Record<string, [string, string]> = {
  food_body:    ["Body",    "body"],
  food_thought: ["Thought", "thought"],
  food_brain:   ["Brain",   "brain"],
  food_soul:    ["Soul",    "soul"],
};

// ── HTML helpers ─────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

// ── Anthropic social post generation ─────────────────────────────────────────

async function generateSocialPost(
  sectionTitle: string,
  sectionSubtitle: string,
  sectionCopy: string,
  blogUrl: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const cleanCopy = stripHtml(sectionCopy);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content:
            "Write a social media post to share the following newsletter section. " +
            "The post should be suitable for LinkedIn, Facebook, Twitter/X, and Instagram. " +
            "Keep it under 200 words. Use a thoughtful, reflective tone that matches " +
            "a coaching and wellness brand. Do not use excessive emojis — one or two " +
            "at most is fine.\n\n" +
            "At the end of the post, include exactly 5 hashtags on their own line:\n" +
            "- #crawfordcoaching (always first, always included)\n" +
            "- Plus 4 hashtags relevant to the specific content of this section\n\n" +
            "After the hashtags, end with the blog link on its own line.\n\n" +
            "Do NOT include any preamble, explanation, or options. Return ONLY the " +
            "post text, ready to copy and paste.\n\n" +
            `Section: Food for the ${sectionTitle}\n` +
            `Subtitle: ${sectionSubtitle}\n` +
            `Content:\n${cleanCopy}\n\n` +
            `Blog link: ${blogUrl}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${body}`);
  }

  const data = await res.json();
  return (data.content?.[0]?.text ?? "").trim();
}

// ── Share page builder (mirrors renderer.py _build_share_page) ──────────────

function buildSharePage(
  sectionTitle: string,
  sectionSubtitle: string,
  postText: string,
  blogUrl: string,
  subscribeUrl: string,
  imageUrl: string,
  imageAlt: string,
): string {
  const imageBlock = imageUrl
    ? `<div class="section-image">` +
      `<img src="${esc(imageUrl)}" alt="${esc(imageAlt)}">` +
      `<a class="save-image" href="${esc(imageUrl)}" ` +
      `download="crawford-coaching-${esc(sectionTitle.toLowerCase())}.png">` +
      `Save image &darr;</a></div>`
    : "";

  let tweetText = postText;
  if (blogUrl && !tweetText.includes(blogUrl)) {
    tweetText = `${tweetText}\n\n${blogUrl}`;
  }

  const blogEncoded = encodeURIComponent(blogUrl);
  const tweetEncoded = encodeURIComponent(tweetText);
  const year = new Date().getFullYear();
  const sub = esc(subscribeUrl || "https://crawford-coaching.ca/subscribe");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Share: ${esc(sectionSubtitle)} — Crawford Coaching</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#0e0f10;color:#c8d4de;font-family:Georgia,'Times New Roman',serif;
  font-size:16px;line-height:1.8;min-height:100vh;display:flex;flex-direction:column;
  align-items:center;padding:3rem 1.5rem}
.card{background:#1c2330;max-width:560px;width:100%;border-radius:4px;padding:2.5rem;
  margin-bottom:2rem}
.label{font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.2em;
  text-transform:uppercase;color:#2d86c4;margin-bottom:4px}
h1{font-size:22px;font-weight:700;color:#f5f3ef;margin-bottom:1.5rem;line-height:1.2}
.section-image{width:100%;margin-bottom:1.5rem;border-radius:3px;overflow:hidden}
.section-image img{display:block;width:100%;height:auto;
  border:1px solid rgba(45,134,196,0.2)}
.save-image{display:block;margin-top:8px;font-family:Arial,Helvetica,sans-serif;
  font-size:11px;color:#7a8fa3;text-decoration:none;text-align:center}
.save-image:hover{color:#c8d4de}
.post-text{background:#232f3e;border-radius:3px;padding:1.2rem 1.4rem;
  font-size:14px;line-height:1.75;color:#c8d4de;margin-bottom:1.5rem;
  white-space:pre-wrap;word-wrap:break-word}
.btn{display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:12px;
  letter-spacing:0.12em;text-transform:uppercase;color:#c8d4de;text-decoration:none;
  border:1px solid rgba(45,134,196,0.4);border-radius:2px;padding:10px 24px;
  cursor:pointer;background:transparent;transition:background 0.2s}
.btn:hover{background:rgba(45,134,196,0.15)}
.btn-primary{border-color:#2d86c4;color:#f5f3ef}
.btn-primary:hover{background:#2d86c4}
.btn-instagram{border-color:rgba(193,53,132,0.5);color:#c8d4de}
.btn-instagram:hover{background:rgba(193,53,132,0.15)}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:1.5rem;align-items:center}
.copied{color:#2d86c4;font-family:Arial,Helvetica,sans-serif;font-size:12px;
  display:none}
.divider{height:1px;background:#2a3444;margin:1.5rem 0}
.subscribe{text-align:center}
.subscribe p{font-size:14px;color:#7a8fa3;margin-bottom:1rem}
.subscribe a{color:#2d86c4;text-decoration:underline}
.footer{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#3d4a58;
  text-align:center;margin-top:auto;padding-top:2rem}
.footer a{color:#3d4a58;text-decoration:underline}
</style>
</head>
<body>
<div class="card">
  <p class="label">Food for the ${esc(sectionTitle)}</p>
  <h1>${esc(sectionSubtitle)}</h1>
  ${imageBlock}
  <div class="post-text" id="post-text">${esc(postText)}</div>
  <div class="actions">
    <button class="btn btn-primary" onclick="copyPost()">Copy post text</button>
    <span class="copied" id="copied-msg">Copied!</span>
  </div>
  <div class="actions">
    <a class="btn" href="https://www.linkedin.com/sharing/share-offsite/?url=${blogEncoded}" target="_blank" rel="noopener">Share on LinkedIn</a>
    <a class="btn" href="https://www.facebook.com/sharer/sharer.php?u=${blogEncoded}" target="_blank" rel="noopener">Share on Facebook</a>
    <a class="btn" href="https://twitter.com/intent/tweet?text=${tweetEncoded}" target="_blank" rel="noopener">Share on X</a>
    <a class="btn btn-instagram" href="https://www.instagram.com/" target="_blank" rel="noopener">Open Instagram</a>
  </div>
  <div class="divider"></div>
  <div class="subscribe">
    <p>Enjoyed this? Get ideas like this delivered to your inbox.</p>
    <a href="${sub}" class="btn">Subscribe to the newsletter</a>
  </div>
</div>
<div class="footer">
  <p>&copy; ${year} Crawford Coaching &middot;
    <a href="https://crawford-coaching.ca">crawford-coaching.ca</a></p>
</div>
<script>
function copyPost(){
  var t=document.getElementById('post-text').innerText;
  navigator.clipboard.writeText(t).then(function(){
    var m=document.getElementById('copied-msg');
    m.style.display='inline';
    setTimeout(function(){m.style.display='none'},2000);
  });
}
</script>
</body>
</html>`;
}

// ── Upload to Supabase Storage ──────────────────────────────────────────────

async function uploadToSupabase(
  bucket: string,
  filePath: string,
  content: string,
  contentType: string,
): Promise<string> {
  const supabase = getSupabaseClient();
  const buffer = Buffer.from(content, "utf-8");

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, buffer, {
      contentType,
      upsert: true,
      cacheControl: "public, max-age=3600",
    });

  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  const base = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${bucket}/${filePath}`;
}

// ── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!checkSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server" },
      { status: 500 },
    );
  }

  const { slug, content } = await req.json();

  if (!slug || !content) {
    return NextResponse.json(
      { error: "slug and content are required" },
      { status: 400 },
    );
  }

  const blogUrl: string = content.full_blog_url ?? "";
  const subscribeUrl: string = content.subscribe_url ?? "";
  const shareUrls: Record<string, string> = {};

  for (const [sectionKey, [title, filename]] of Object.entries(SECTION_MAP)) {
    const section = content[sectionKey];
    if (!section?.copy) continue;

    const subtitle: string = section.subtitle ?? "";
    const copy: string = section.copy ?? "";
    const imageUrl: string = section.image ?? "";
    const imageAlt: string = section.image_alt ?? "";

    const postText = await generateSocialPost(title, subtitle, copy, blogUrl);

    const pageHtml = buildSharePage(
      title,
      subtitle,
      postText,
      blogUrl,
      subscribeUrl,
      imageUrl,
      imageAlt,
    );

    // Upload HTML share page and raw text
    const htmlPath = `${slug}/socials/${filename}.html`;
    const txtPath = `${slug}/socials/${filename}.txt`;

    const url = await uploadToSupabase("newsletters", htmlPath, pageHtml, "text/html");
    await uploadToSupabase("newsletters", txtPath, postText, "text/plain");

    shareUrls[sectionKey] = url;
  }

  return NextResponse.json({ share_urls: shareUrls });
}
