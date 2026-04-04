"use client";

import Link from "next/link";

interface Campaign {
  id: string;
  campaign_type: string;
  subject: string;
  recipient_count: number;
  status: string;
  sent_at: string | null;
  open_count: number;
  click_count: number;
  unsubscribe_count: number;
}

interface Props {
  campaigns: Campaign[];
}

function openRate(c: Campaign): string {
  if (!c.recipient_count) return "—";
  return `${Math.round((c.open_count / c.recipient_count) * 100)}%`;
}

function fmt(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function CampaignTable({ campaigns }: Props) {
  if (campaigns.length === 0) {
    return <p className="text-mist text-sm font-sans">No campaigns sent yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm font-sans">
        <thead>
          <tr className="border-b border-fog text-left">
            <th className="pb-2 pr-4 text-xs text-mist font-normal tracking-widest uppercase">Date</th>
            <th className="pb-2 pr-4 text-xs text-mist font-normal tracking-widest uppercase">Subject</th>
            <th className="pb-2 pr-4 text-xs text-mist font-normal tracking-widest uppercase">Type</th>
            <th className="pb-2 pr-4 text-xs text-mist font-normal tracking-widest uppercase text-right">Recipients</th>
            <th className="pb-2 pr-4 text-xs text-mist font-normal tracking-widest uppercase text-right">Opens</th>
            <th className="pb-2 pr-4 text-xs text-mist font-normal tracking-widest uppercase text-right">Clicks</th>
            <th className="pb-2 text-xs text-mist font-normal tracking-widest uppercase text-right">Unsubs</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.id} className="border-b border-fog/50 hover:bg-slate transition-colors">
              <td className="py-3 pr-4 text-mist whitespace-nowrap">{fmt(c.sent_at)}</td>
              <td className="py-3 pr-4">
                <Link
                  href={`/archive/${c.id}`}
                  className="text-pale hover:text-brand-blue transition-colors"
                >
                  {c.subject}
                </Link>
              </td>
              <td className="py-3 pr-4">
                <span className={`chip ${c.campaign_type === "newsletter" ? "border-brand-blue text-brand-blue" : ""}`}>
                  {c.campaign_type}
                </span>
              </td>
              <td className="py-3 pr-4 text-right text-pale">{c.recipient_count}</td>
              <td className="py-3 pr-4 text-right text-pale">
                {c.open_count} <span className="text-mist text-xs">({openRate(c)})</span>
              </td>
              <td className="py-3 pr-4 text-right text-pale">{c.click_count}</td>
              <td className="py-3 text-right text-pale">{c.unsubscribe_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
