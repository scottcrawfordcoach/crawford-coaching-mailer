"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import AnalyticsPanel from "@/components/AnalyticsPanel";
import PreviewPanel from "@/components/PreviewPanel";

interface CampaignDetail {
  campaign: {
    id: string;
    subject: string;
    campaign_type: string;
    from_email: string;
    recipient_count: number;
    status: string;
    sent_at: string | null;
    html_body: string;
  };
  recipients: Array<{
    id: string;
    email: string;
    first_name: string | null;
    status: string;
  }>;
  events: Array<{
    id: string;
    recipient_id: string | null;
    event_type: "open" | "click" | "unsubscribe";
    url: string | null;
    occurred_at: string;
  }>;
}

function fmt(dt: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showHtml, setShowHtml] = useState(false);

  useEffect(() => {
    fetch(`/api/campaigns/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.data) setDetail(d.data);
        else setError(d.error ?? "Not found");
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  function handleDownload() {
    if (!detail) return;
    const blob = new Blob([detail.campaign.html_body], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug = detail.campaign.subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
    a.download = `${detail.campaign.sent_at?.slice(0, 10) ?? "email"}_${slug}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-screen">
      <Nav />
      <main className="flex-1 overflow-y-auto px-8 py-8 max-w-5xl mx-auto w-full">
        <button
          onClick={() => router.push("/archive")}
          className="text-mist hover:text-pale text-xs font-sans tracking-widest uppercase mb-6 block"
        >
          ← Back to Archive
        </button>

        {loading && <p className="text-mist font-sans text-sm">Loading…</p>}
        {error && <p className="text-red-400 font-sans text-sm">{error}</p>}

        {!loading && detail && (
          <div className="space-y-8">
            {/* Header */}
            <div className="border-b border-fog pb-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="font-serif text-2xl text-white mb-1">{detail.campaign.subject}</h1>
                  <p className="text-mist text-sm font-sans">
                    <span className="chip mr-2">{detail.campaign.campaign_type}</span>
                    Sent {fmt(detail.campaign.sent_at)} · {detail.campaign.recipient_count} recipients
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    className="btn-ghost"
                    onClick={() => setShowHtml((v) => !v)}
                  >
                    {showHtml ? "Hide HTML" : "View HTML"}
                  </button>
                  <button className="btn-ghost" onClick={handleDownload}>
                    Download
                  </button>
                </div>
              </div>
            </div>

            {/* HTML preview */}
            {showHtml && (
              <div className="h-[520px] border border-fog rounded overflow-hidden">
                <PreviewPanel html={detail.campaign.html_body} />
              </div>
            )}

            {/* Analytics */}
            <AnalyticsPanel
              recipientCount={detail.campaign.recipient_count}
              recipients={detail.recipients}
              events={detail.events}
            />
          </div>
        )}
      </main>
    </div>
  );
}
