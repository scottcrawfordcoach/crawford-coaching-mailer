"use client";

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import CampaignTable from "@/components/CampaignTable";

export default function ArchivePage() {
  const [campaigns, setCampaigns] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((d) => {
        if (d.data) setCampaigns(d.data);
        else setError(d.error ?? "Failed to load campaigns");
      })
      .catch(() => setError("Failed to load campaigns"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-screen">
      <Nav />
      <main className="flex-1 overflow-y-auto px-8 py-8">
        <h1 className="font-serif text-2xl text-white mb-6">Archive</h1>
        {loading && <p className="text-mist font-sans text-sm">Loading…</p>}
        {error && <p className="text-red-400 font-sans text-sm">{error}</p>}
        {!loading && !error && (
          <CampaignTable campaigns={campaigns as Parameters<typeof CampaignTable>[0]["campaigns"]} />
        )}
      </main>
    </div>
  );
}
