"""One-off: render a personal reply to Jasu Talvensaari using the general template."""

import re
from renderer import render_general

BODY = """\
Thanks for getting in touch.

I've been on vacation this past week, but I'm back this week.

I can tell you I'm an ICF ACC credentialed coach. I trained as a Life and Wellness Coach at Coach Academy here in Canada.
I am part of a network of coaches through that organisation, and have access to peer coaching, mentoring, supervision, and ongoing learning programs.

Other training I've taken includes Brene Brown's Dare To Lead Program, and a Specialisation in Transformation from the ISSA, with whom I'm also a Certified Personal Trainer, and I run small group fitness classes at my home gym.

I'll use your link to book a call later this week. I look forward to talking with you.

Best.

Scott"""

html = render_general(body=BODY, first_name="Jasu")

# Change greeting from "Hi" to "Hello"
html = html.replace("Hi Jasu,", "Hello Jasu,", 1)

# Remove unsubscribe / "You are receiving" lines but keep the copyright
html = re.sub(
    r'<p[^>]*?>\s*You are receiving this email because[\s\S]*?</p>\s*',
    '',
    html,
)
html = re.sub(
    r'<!-- Unsubscribe -->\s*<p[^>]*?>[\s\S]*?Unsubscribe[\s\S]*?</p>\s*',
    '',
    html,
)

# Update social icon filenames to match what's uploaded to Supabase
ASSET_BASE = "https://yxndmpwqvdatkujcukdv.supabase.co/storage/v1/object/public/mail-assets/"

# Update social icon URLs to use the -dark filenames matching Supabase uploads
html = html.replace(
    f"{ASSET_BASE}icon-facebook.png",
    f"{ASSET_BASE}icon-facebook-dark.png",
)
html = html.replace(
    f"{ASSET_BASE}icon-instagram.png",
    f"{ASSET_BASE}icon-instagram-dark.png",
)
html = html.replace(
    f"{ASSET_BASE}icon-linkedin.png",
    f"{ASSET_BASE}icon-linkedin-dark.png",
)

# Add a subtle website link in the footer — just above the copyright
html = html.replace(
    '&copy; 2026 Crawford Coaching. All rights reserved.',
    '<a href="https://crawford-coaching.ca" style="color:#7a8fa3;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.04em;">crawford-coaching.ca</a>'
    '<br style="line-height:12px;">'
    '&copy; 2026 Crawford Coaching. All rights reserved.',
)

out = "reply-jasu-myndup.html"
with open(out, "w", encoding="utf-8") as f:
    f.write(html)

print(f"Wrote {out}")
