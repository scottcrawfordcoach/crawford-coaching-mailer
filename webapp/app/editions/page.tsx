import { redirect } from "next/navigation";
import Link from "next/link";
import { checkSession } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";
import Nav from "@/components/Nav";
import NewEditionModal from "@/components/NewEditionModal";

export default async function EditionsPage() {
  if (!checkSession()) {
    redirect("/login");
  }

  const supabase = getSupabaseClient();

  // Fetch edition folders from Supabase storage
  const { data: storageData } = await supabase.storage
    .from("newsletters")
    .list("", { limit: 100, sortBy: { column: "name", order: "desc" } });

  const folders = (storageData ?? [])
    .filter((item) => item.id === null)
    .map((item) => item.name);

  // Fetch the most recent sent newsletter campaign
  let campaign: {
    id: string;
    subject: string;
    from_name: string;
    from_email: string;
    recipient_count: number;
    sent_at: string;
    edition_slug: string | null;
  } | null = null;

  let opens = 0;
  let clicks = 0;
  let unsubs = 0;

  try {
    const { data: campaignData } = await supabase
      .from("sent_campaigns")
      .select("*")
      .eq("campaign_type", "newsletter")
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1)
      .single();

    campaign = campaignData ?? null;

    if (campaign) {
      const { data: events } = await supabase
        .from("campaign_events")
        .select("event_type, recipient_id")
        .eq("campaign_id", campaign.id);

      if (events) {
        const openSet = new Set<string>();
        const clickSet = new Set<string>();
        const unsubSet = new Set<string>();

        for (const ev of events) {
          if (!ev.recipient_id) continue;
          if (ev.event_type === "open") openSet.add(ev.recipient_id);
          else if (ev.event_type === "click") clickSet.add(ev.recipient_id);
          else if (ev.event_type === "unsubscribe") unsubSet.add(ev.recipient_id);
        }

        opens = openSet.size;
        clicks = clickSet.size;
        unsubs = unsubSet.size;
      }
    }
  } catch {
    // Gracefully handle missing tables or query errors
    campaign = null;
  }

  // Fetch all sent edition slugs
  const { data: sentRows } = await supabase
    .from("sent_campaigns")
    .select("edition_slug")
    .not("edition_slug", "is", null);

  const sentSlugs = new Set((sentRows ?? []).map((r) => r.edition_slug as string));

  // Format analytics values
  const openRate =
    campaign && campaign.recipient_count > 0
      ? ((opens / campaign.recipient_count) * 100).toFixed(1) + "%"
      : "—";

  const sentDateLabel =
    campaign?.sent_at
      ? new Date(campaign.sent_at).toLocaleDateString("en-CA", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "";

  return (
    <div className="min-h-screen bg-ink">
      <Nav />
      <main className="max-w-3xl mx-auto px-6 py-10">

        {/* Analytics card — only shown if campaign data exists */}
        {campaign && (
          <div className="bg-slate border border-fog rounded-sm px-6 py-5 mb-8">
            <p className="label" style={{ marginBottom: 0 }}>Most Recent Send</p>
            <p className="font-serif text-white text-xl mt-1">{campaign.subject}</p>
            <p className="text-mist text-xs font-sans mt-1">
              {sentDateLabel} · {campaign.recipient_count.toLocaleString()} recipients
            </p>
            <div className="flex gap-8 mt-4">
              <div>
                <p className="text-brand-blue text-2xl font-sans font-light">{openRate}</p>
                <p className="text-mist text-xs font-sans uppercase tracking-wider mt-0.5">Open Rate</p>
              </div>
              <div>
                <p className="text-brand-blue text-2xl font-sans font-light">{clicks}</p>
                <p className="text-mist text-xs font-sans uppercase tracking-wider mt-0.5">Clicks</p>
              </div>
              <div>
                <p className="text-brand-blue text-2xl font-sans font-light">{unsubs}</p>
                <p className="text-mist text-xs font-sans uppercase tracking-wider mt-0.5">Unsubscribes</p>
              </div>
            </div>
          </div>
        )}

        {/* Heading + New Edition button row */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-serif text-2xl text-white">Editions</h1>
          <NewEditionModal />
        </div>

        {/* Edition list */}
        <div className="space-y-2">
          {folders.length === 0 ? (
            <p className="text-mist text-sm font-sans">
              No editions yet. Create your first one above.
            </p>
          ) : (
            folders.map((slug) => (
              <Link
                key={slug}
                href={`/editions/${slug}`}
                className="flex items-center justify-between bg-slate border border-fog hover:border-brand-blue rounded-sm px-5 py-4 transition-colors group"
              >
                <p className="text-pale text-sm font-sans group-hover:text-white transition-colors">
                  {slug}
                </p>
                {sentSlugs.has(slug) ? (
                  <span
                    className="chip"
                    style={{ color: "#4fa3d8", borderColor: "rgba(79,163,216,0.3)" }}
                  >
                    Sent ✓
                  </span>
                ) : (
                  <span className="chip">Draft</span>
                )}
              </Link>
            ))
          )}
        </div>

      </main>
    </div>
  );
}
