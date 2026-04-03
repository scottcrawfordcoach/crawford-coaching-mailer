"use client";

interface Recipient {
  id: string;
  email: string;
  first_name: string | null;
  status: string;
}

interface Event {
  id: string;
  recipient_id: string | null;
  event_type: "open" | "click" | "unsubscribe";
  url: string | null;
  occurred_at: string;
}

interface Props {
  recipientCount: number;
  recipients: Recipient[];
  events: Event[];
}

function fmt(dt: string) {
  return new Date(dt).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AnalyticsPanel({ recipientCount, recipients, events }: Props) {
  const opens = events.filter((e) => e.event_type === "open");
  const clicks = events.filter((e) => e.event_type === "click");
  const unsubs = events.filter((e) => e.event_type === "unsubscribe");

  // Unique opener recipient ids
  const uniqueOpeners = new Set(opens.map((e) => e.recipient_id)).size;

  const openRate = recipientCount ? Math.round((uniqueOpeners / recipientCount) * 100) : 0;
  const clickRate = recipientCount ? Math.round((new Set(clicks.map((e) => e.recipient_id)).size / recipientCount) * 100) : 0;

  // Build recipient-event map
  const eventMap: Record<string, Set<string>> = {};
  for (const e of events) {
    if (!e.recipient_id) continue;
    if (!eventMap[e.recipient_id]) eventMap[e.recipient_id] = new Set();
    eventMap[e.recipient_id].add(e.event_type);
  }

  return (
    <div className="space-y-8">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Open Rate", value: `${openRate}%`, sub: `${uniqueOpeners} unique opens` },
          { label: "Click Rate", value: `${clickRate}%`, sub: `${clicks.length} total clicks` },
          { label: "Unsubscribes", value: String(unsubs.length), sub: "" },
        ].map(({ label, value, sub }) => (
          <div key={label} className="bg-slate border border-fog rounded px-5 py-4 text-center">
            <p className="text-xs font-sans tracking-widest uppercase text-mist mb-1">{label}</p>
            <p className="text-3xl font-serif text-white">{value}</p>
            {sub && <p className="text-xs text-fog mt-1 font-sans">{sub}</p>}
          </div>
        ))}
      </div>

      {/* Recent events */}
      {events.length > 0 && (
        <div>
          <p className="label mb-3">Recent Events</p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {events.slice(0, 40).map((e) => {
              const recipient = recipients.find((r) => r.id === e.recipient_id);
              return (
                <div key={e.id} className="flex items-baseline gap-3 text-xs font-sans">
                  <span className="text-fog whitespace-nowrap">{fmt(e.occurred_at)}</span>
                  <span className={`
                    chip
                    ${e.event_type === "open" ? "border-green-700 text-green-400" : ""}
                    ${e.event_type === "click" ? "border-brand-blue text-brand-blue" : ""}
                    ${e.event_type === "unsubscribe" ? "border-red-700 text-red-400" : ""}
                  `}>
                    {e.event_type}
                  </span>
                  <span className="text-mist truncate">{recipient?.email ?? "unknown"}</span>
                  {e.url && (
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-fog hover:text-brand-blue truncate max-w-xs"
                    >
                      {e.url}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recipient list */}
      <div>
        <p className="label mb-3">Recipients ({recipients.length})</p>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {recipients.map((r) => {
            const re = eventMap[r.id] ?? new Set();
            return (
              <div key={r.id} className="flex items-center gap-3 py-1 border-b border-fog/40 text-xs font-sans">
                <span className="text-pale">{r.first_name ? `${r.first_name} ` : ""}{r.email}</span>
                <div className="flex gap-1 ml-auto">
                  {re.has("open") && <span className="chip border-green-700 text-green-400">opened</span>}
                  {re.has("click") && <span className="chip border-brand-blue text-brand-blue">clicked</span>}
                  {re.has("unsubscribe") && <span className="chip border-red-700 text-red-400">unsub</span>}
                  {r.status === "bounced" && <span className="chip border-red-700 text-red-400">bounced</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
