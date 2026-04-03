"use client";

import { useState, useCallback, useRef } from "react";

export interface Recipient {
  email: string;
  first_name?: string | null;
  contact_id?: string | null;
}

interface Props {
  value: Recipient[];
  onChange: (recipients: Recipient[]) => void;
}

// Known tag categories from data-handler
const TAG_CATEGORIES: Record<string, string[]> = {
  program: ["Synergize Fitness", "Crawford Coaching", "WHOLE"],
  status: [
    "ACTIVE",
    "PREVIOUS CLIENT",
    "PREVIOUS CLIENT - RECENT",
    "INVOICE_CLIENT",
    "BILLING_AUTO_MATCHED",
    "HAS INQUIRED",
    "ADMIN",
    "EXCLUDE",
  ],
  day: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
  slot: [
    "M/W/F 9",
    "M/W/F 6:15",
    "M/W/F 7:30",
    "M/W 4:30",
    "M/W 6:30",
    "TU/TH 6:15",
    "TU/TH 7:30",
    "TU/TH 9",
  ],
};

type Tab = "manual" | "lookup" | "tags";

export default function RecipientSelector({ value, onChange }: Props) {
  const [tab, setTab] = useState<Tab>("manual");
  const [manualText, setManualText] = useState("");

  // Name lookup state
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResult, setLookupResult] = useState<Recipient | null | "none">(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tag select state
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagMatches, setTagMatches] = useState<Recipient[]>([]);
  const [tagLoading, setTagLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // Recipient management helpers
  // ---------------------------------------------------------------------------

  function addRecipients(toAdd: Recipient[]) {
    const existing = new Set(value.map((r) => r.email.toLowerCase()));
    const fresh = toAdd.filter((r) => !existing.has(r.email.toLowerCase()));
    onChange([...value, ...fresh]);
  }

  function removeRecipient(email: string) {
    onChange(value.filter((r) => r.email.toLowerCase() !== email.toLowerCase()));
  }

  // ---------------------------------------------------------------------------
  // Manual tab
  // ---------------------------------------------------------------------------

  function handleManualAdd() {
    const emails = manualText
      .split(/[\n,]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    addRecipients(emails.map((e) => ({ email: e })));
    setManualText("");
  }

  // ---------------------------------------------------------------------------
  // Name lookup tab
  // ---------------------------------------------------------------------------

  const runLookup = useCallback(async (query: string) => {
    if (query.length < 2) { setLookupResult(null); return; }
    setLookupLoading(true);
    try {
      // Try email lookup first, then contact_id
      const payload = query.includes("@")
        ? { email: query }
        : { contact_id: query };

      const res = await fetch("/api/contacts/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.data) {
        setLookupResult({
          email: json.data.email,
          first_name: json.data.first_name,
          contact_id: json.data.id,
        });
      } else {
        setLookupResult("none");
      }
    } catch {
      setLookupResult("none");
    }
    setLookupLoading(false);
  }, []);

  function handleLookupChange(q: string) {
    setLookupQuery(q);
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    lookupTimer.current = setTimeout(() => runLookup(q), 300);
  }

  // ---------------------------------------------------------------------------
  // Tag select tab
  // ---------------------------------------------------------------------------

  async function handleTagToggle(tag: string) {
    const next = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];
    setSelectedTags(next);

    if (next.length === 0) { setTagMatches([]); return; }
    setTagLoading(true);
    try {
      const payload: Record<string, unknown> = { limit: 500 };
      if (next.length > 0) payload.tags = next;
      const res = await fetch("/api/contacts/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      setTagMatches(
        (json.data ?? []).map((c: { id: string; email: string; first_name: string | null }) => ({
          email: c.email,
          first_name: c.first_name,
          contact_id: c.id,
        })),
      );
    } catch {
      setTagMatches([]);
    }
    setTagLoading(false);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-xs font-sans tracking-widest uppercase border-b-2 transition-colors ${
      tab === t
        ? "border-brand-blue text-brand-blue"
        : "border-transparent text-mist hover:text-pale"
    }`;

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex border-b border-fog">
        <button className={tabCls("manual")} onClick={() => setTab("manual")}>Manual</button>
        <button className={tabCls("lookup")} onClick={() => setTab("lookup")}>Name Lookup</button>
        <button className={tabCls("tags")} onClick={() => setTab("tags")}>Tag Select</button>
      </div>

      {/* Manual */}
      {tab === "manual" && (
        <div className="space-y-2">
          <textarea
            className="field text-sm resize-none h-20"
            placeholder="one@email.com, two@email.com"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
          />
          <button className="btn-ghost text-xs" onClick={handleManualAdd}>
            Add
          </button>
        </div>
      )}

      {/* Name Lookup */}
      {tab === "lookup" && (
        <div className="space-y-2">
          <input
            className="field"
            placeholder="email or contact ID (CT0001)"
            value={lookupQuery}
            onChange={(e) => handleLookupChange(e.target.value)}
          />
          {lookupLoading && <p className="text-mist text-xs">Searching…</p>}
          {lookupResult === "none" && (
            <p className="text-mist text-xs">No contact found.</p>
          )}
          {lookupResult && lookupResult !== "none" && (
            <div className="flex items-center justify-between bg-slate-mid border border-fog rounded px-3 py-2">
              <span className="text-sm text-pale">
                {lookupResult.first_name
                  ? `${lookupResult.first_name} — ${lookupResult.email}`
                  : lookupResult.email}
              </span>
              <button
                className="text-brand-blue text-xs font-sans tracking-widest uppercase hover:text-brand-blue-light"
                onClick={() => {
                  addRecipients([lookupResult as Recipient]);
                  setLookupQuery("");
                  setLookupResult(null);
                }}
              >
                Add
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tag Select */}
      {tab === "tags" && (
        <div className="space-y-3">
          {Object.entries(TAG_CATEGORIES).map(([category, tags]) => (
            <div key={category}>
              <p className="text-fog text-xs uppercase tracking-widest font-sans mb-1.5">{category}</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => {
                  const active = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => handleTagToggle(tag)}
                      className={`chip transition-colors cursor-pointer ${
                        active ? "border-brand-blue text-brand-blue" : "hover:border-mist"
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {tagLoading && <p className="text-mist text-xs">Loading…</p>}
          {tagMatches.length > 0 && (
            <div className="flex items-center gap-4">
              <p className="text-mist text-sm">
                {tagMatches.length} contact{tagMatches.length !== 1 ? "s" : ""} match
              </p>
              <button
                className="btn-ghost text-xs"
                onClick={() => {
                  addRecipients(tagMatches);
                  setSelectedTags([]);
                  setTagMatches([]);
                }}
              >
                Add All
              </button>
            </div>
          )}
        </div>
      )}

      {/* Selected recipient chips */}
      {value.length > 0 && (
        <div className="pt-2 border-t border-fog space-y-1.5">
          <p className="text-xs text-mist font-sans">
            {value.length} recipient{value.length !== 1 ? "s" : ""}
          </p>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {value.map((r) => (
              <span key={r.email} className="chip">
                {r.first_name ? `${r.first_name} ` : ""}{r.email}
                <button
                  onClick={() => removeRecipient(r.email)}
                  className="text-fog hover:text-pale leading-none"
                  aria-label="Remove"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
