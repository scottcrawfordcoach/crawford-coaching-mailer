"use client";

import { useState, useEffect, useRef } from "react";
import Nav from "@/components/Nav";
import PreviewPanel from "@/components/PreviewPanel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Contact {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  contact_status: string;
}

type SendMode = "individual" | "group";

const TAG_CATEGORIES = ["day", "slot", "program", "status"] as const;
type TagCategory = (typeof TAG_CATEGORIES)[number];

const CONTACT_STATUSES = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "previous_client", label: "Previous clients" },
  { value: "lead", label: "Leads" },
  { value: "inactive", label: "Inactive" },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EmailPage() {
  // Form state
  const [sendMode, setSendMode] = useState<SendMode>("individual");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);

  // Group mode state
  const [tagsByCategory, setTagsByCategory] = useState<Record<string, string[]>>({});
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [contactStatus, setContactStatus] = useState("");
  const [groupCount, setGroupCount] = useState<number | null>(null);
  const [groupRecipients, setGroupRecipients] = useState<Contact[]>([]);
  const [loadingGroup, setLoadingGroup] = useState(false);
  // Manual overrides
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [addedContacts, setAddedContacts] = useState<Contact[]>([]);
  const [addSearchQuery, setAddSearchQuery] = useState("");
  const [addSearchResults, setAddSearchResults] = useState<Contact[]>([]);
  const [addSearching, setAddSearching] = useState(false);
  const addSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Email content
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  // Preview / send
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<"preview" | "links" | "recipients">("preview");
  const [linkResults, setLinkResults] = useState<{ url: string; status: number | null; ok: boolean; error?: string }[]>([]);
  const [checkingLinks, setCheckingLinks] = useState(false);

  // Layout
  const [leftWidth, setLeftWidth] = useState(520);
  const [isDragging, setIsDragging] = useState(false);

  // Search debounce timer
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Contact search (Individual mode) ──────────────────────────────────

  useEffect(() => {
    if (sendMode !== "individual" || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/contacts/search?q=${encodeURIComponent(searchQuery)}`,
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.contacts ?? []);
        }
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [searchQuery, sendMode]);

  function addContact(contact: Contact) {
    if (!selectedContacts.find((c) => c.id === contact.id)) {
      setSelectedContacts((prev) => [...prev, contact]);
    }
    setSearchQuery("");
    setSearchResults([]);
  }

  function removeContact(id: string) {
    setSelectedContacts((prev) => prev.filter((c) => c.id !== id));
  }

  // ── Load all tag categories when entering group mode ────────────────

  useEffect(() => {
    if (sendMode !== "group") return;
    setSelectedTags([]);
    setGroupCount(null);
    setTagsByCategory({});

    (async () => {
      try {
        const results = await Promise.all(
          TAG_CATEGORIES.map(async (cat) => {
            const res = await fetch(`/api/contacts/tags?category=${cat}`);
            const data = res.ok ? await res.json() : {};
            return [cat, (data.tags ?? []) as string[]] as const;
          }),
        );
        setTagsByCategory(Object.fromEntries(results));
      } catch {
        setTagsByCategory({});
      }
    })();
  }, [sendMode]);

  // ── Resolve group recipients when tags/status change ──────────────────

  useEffect(() => {
    if (sendMode !== "group" || selectedTags.length === 0) {
      setGroupCount(null);
      setGroupRecipients([]);
      setRemovedIds(new Set());
      setAddedContacts([]);
      return;
    }
    // Reset overrides when filter changes
    setRemovedIds(new Set());
    setAddedContacts([]);

    setLoadingGroup(true);
    const params = new URLSearchParams();
    selectedTags.forEach((t) => params.append("tags", t));
    if (contactStatus) params.set("status", contactStatus);

    (async () => {
      try {
        const res = await fetch(`/api/contacts/resolve?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setGroupRecipients(data.contacts ?? []);
          setGroupCount(data.contacts?.length ?? 0);
        }
      } catch {
        setGroupCount(null);
        setGroupRecipients([]);
      } finally {
        setLoadingGroup(false);
      }
    })();
  }, [selectedTags, contactStatus, sendMode]);

  // ── Preview ───────────────────────────────────────────────────────────

  async function handlePreview() {
    setPreviewing(true);
    setRightPanel("preview");
    try {
      const firstName =
        sendMode === "individual"
          ? selectedContacts[0]?.first_name ?? "there"
          : "there";

      const res = await fetch("/api/email/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, body: message }),
      });
      if (res.ok) {
        setPreviewHtml(await res.text());
      }
    } finally {
      setPreviewing(false);
    }
  }

  async function handleCheckLinks() {
    setCheckingLinks(true);
    setRightPanel("links");
    setLinkResults([]);
    try {
      const firstName =
        sendMode === "individual"
          ? selectedContacts[0]?.first_name ?? "there"
          : "there";

      const previewRes = await fetch("/api/email/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, body: message }),
      });
      if (!previewRes.ok) return;
      const html = await previewRes.text();
      setPreviewHtml(html);

      const res = await fetch("/api/check-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html }),
      });
      if (res.ok) {
        const data = await res.json();
        setLinkResults(data.results ?? []);
      }
    } finally {
      setCheckingLinks(false);
    }
  }

  // ── Send ──────────────────────────────────────────────────────────────

  async function handleSend() {
    if (recipients.length === 0 || !subject.trim() || !message.trim()) return;

    const ok = window.confirm(
      `Send this email to ${recipients.length} recipient${recipients.length > 1 ? "s" : ""}?`,
    );
    if (!ok) return;

    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          body: message.trim(),
          recipients: recipients.map((c) => ({
            email: c.email,
            first_name: c.first_name,
            contact_id: c.id,
          })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSendResult(
          `Sent to ${data.recipient_count} recipient${data.recipient_count > 1 ? "s" : ""}. Campaign ID: ${data.campaign_id}`,
        );
      } else {
        setSendResult(`Error: ${data.error ?? "Send failed"}`);
      }
    } catch (err) {
      setSendResult(`Error: ${err instanceof Error ? err.message : "Network error"}`);
    } finally {
      setSending(false);
    }
  }

  // ── Drag to resize ────────────────────────────────────────────────────

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftWidth;
    setIsDragging(true);
    function onMouseMove(ev: MouseEvent) {
      setLeftWidth(Math.min(Math.max(startWidth + ev.clientX - startX, 280), 800));
    }
    function onMouseUp() {
      setIsDragging(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  // ── Validation ────────────────────────────────────────────────────────

  const effectiveGroupRecipients: Contact[] = [
    ...groupRecipients.filter((c) => !removedIds.has(c.id)),
    ...addedContacts.filter((c) => !groupRecipients.some((r) => r.id === c.id) || removedIds.has(c.id)),
  ];

  const recipients =
    sendMode === "individual" ? selectedContacts : effectiveGroupRecipients;
  const canPreview = message.trim().length > 0;
  const canSend =
    recipients.length > 0 && subject.trim().length > 0 && message.trim().length > 0;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-ink flex flex-col">
      <Nav />

      <div
        className="flex flex-1 overflow-hidden"
        style={{ cursor: isDragging ? "col-resize" : undefined, userSelect: isDragging ? "none" : undefined }}
      >
        {/* ── LEFT: Form ─────────────────────────────────────────── */}
        <div
          className="flex-shrink-0 overflow-y-auto"
          style={{ width: leftWidth }}
        >
          <div className="px-6 py-6 space-y-6">
            <h1 className="font-serif text-2xl text-white">Send Email</h1>

            {/* ── Send mode toggle ─────────────────────────────── */}
            <div>
              <p className="label">Send to</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setSendMode("individual")}
                  className={
                    sendMode === "individual" ? "btn-primary" : "btn-ghost"
                  }
                  style={{ fontSize: 11 }}
                >
                  Individual
                </button>
                <button
                  onClick={() => setSendMode("group")}
                  className={
                    sendMode === "group" ? "btn-primary" : "btn-ghost"
                  }
                  style={{ fontSize: 11 }}
                >
                  Group
                </button>
              </div>
            </div>

            {/* ── Individual: contact search ───────────────────── */}
            {sendMode === "individual" && (
              <div>
                <label className="label">Search contacts</label>
                <input
                  className="field"
                  type="text"
                  placeholder="Name or email…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searching && (
                  <p className="text-mist text-xs mt-1">Searching…</p>
                )}
                {searchResults.length > 0 && (
                  <div className="mt-1 bg-slate-mid border border-fog rounded max-h-40 overflow-y-auto">
                    {searchResults.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => addContact(c)}
                        className="w-full text-left px-3 py-2 text-sm text-pale hover:bg-slate transition-colors"
                      >
                        {c.first_name} {c.last_name}{" "}
                        <span className="text-mist">({c.email})</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Selected contacts */}
                {selectedContacts.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {selectedContacts.map((c) => (
                      <span key={c.id} className="chip">
                        {c.first_name || c.email}
                        <button
                          onClick={() => removeContact(c.id)}
                          className="text-mist hover:text-white ml-1"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Group: tag selection ─────────────────────────── */}
            {sendMode === "group" && (
              <div className="space-y-4">
                <div>
                  <label className="label">Tags</label>
                  {Object.keys(tagsByCategory).length === 0 ? (
                    <p className="text-mist text-xs">Loading tags…</p>
                  ) : (
                    <div className="space-y-3">
                      {TAG_CATEGORIES.map((cat) => {
                        const tags = tagsByCategory[cat] ?? [];
                        if (tags.length === 0) return null;
                        return (
                          <div key={cat}>
                            <p className="text-xs text-mist uppercase tracking-wider mb-1.5">
                              {cat.charAt(0).toUpperCase() + cat.slice(1)}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {tags.map((tag) => {
                                const selected = selectedTags.includes(tag);
                                return (
                                  <button
                                    key={tag}
                                    onClick={() =>
                                      setSelectedTags((prev) =>
                                        selected
                                          ? prev.filter((t) => t !== tag)
                                          : [...prev, tag],
                                      )
                                    }
                                    className={`chip cursor-pointer transition-colors ${
                                      selected
                                        ? "border-brand-blue text-white bg-brand-blue/20"
                                        : "hover:border-brand-blue"
                                    }`}
                                  >
                                    {tag}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <label className="label">Contact status</label>
                  <select
                    className="field"
                    value={contactStatus}
                    onChange={(e) => setContactStatus(e.target.value)}
                  >
                    {CONTACT_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                {loadingGroup && (
                  <p className="text-mist text-xs">Resolving recipients…</p>
                )}
                {groupCount !== null && !loadingGroup && (
                  <p className="text-brand-blue text-sm font-sans">
                    {groupCount} recipient{groupCount !== 1 ? "s" : ""} matched
                  </p>
                )}
              </div>
            )}

            {/* ── Subject ─────────────────────────────────────── */}
            <div>
              <label className="label">Subject</label>
              <input
                className="field"
                type="text"
                placeholder="Email subject line"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            {/* ── Message ─────────────────────────────────────── */}
            <div>
              <label className="label">Message</label>
              <textarea
                className="field"
                rows={10}
                placeholder="Write your message here. Double newlines become paragraph breaks."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            {/* ── Actions ─────────────────────────────────────── */}
            <div className="flex gap-3 pb-6">
              <button
                onClick={handlePreview}
                disabled={!canPreview || previewing || checkingLinks}
                className="btn-ghost disabled:opacity-40"
              >
                {previewing ? "Rendering…" : "Preview"}
              </button>
              <button
                onClick={handleCheckLinks}
                disabled={!canPreview || checkingLinks || previewing}
                className="btn-ghost disabled:opacity-40"
              >
                {checkingLinks ? "Checking…" : "Test Links"}
              </button>
              {sendMode === "group" && (
                <button
                  onClick={() => setRightPanel("recipients")}
                  disabled={recipients.length === 0}
                  className="btn-ghost disabled:opacity-40"
                >
                  Show Recipients
                </button>
              )}
              <button
                onClick={handleSend}
                disabled={!canSend || sending}
                className="btn-primary disabled:opacity-40"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>

            {sendResult && (
              <div
                className={`text-sm font-sans px-4 py-3 rounded ${
                  sendResult.startsWith("Error")
                    ? "bg-red-900/30 text-red-300 border border-red-500/40"
                    : "bg-green-900/30 text-green-300 border border-green-500/40"
                }`}
              >
                {sendResult}
              </div>
            )}
          </div>
        </div>

        {/* ── Drag handle ────────────────────────────────────── */}
        <div
          onMouseDown={onMouseDown}
          className="w-1.5 cursor-col-resize bg-fog/30 hover:bg-brand-blue/40 transition-colors flex-shrink-0"
        />

        {/* ── RIGHT: Preview, link results, or recipients ────── */}
        <div className="flex-1 min-w-0" style={{ pointerEvents: isDragging ? "none" : undefined }}>
          {rightPanel === "recipients" ? (
            <div className="w-full h-full flex flex-col font-sans text-sm">
              {/* Add contact search */}
              <div className="p-4 border-b border-fog flex-shrink-0">
                <p className="text-xs text-mist uppercase tracking-wider mb-2">Add contact</p>
                <input
                  className="field text-sm"
                  type="text"
                  placeholder="Search by name or email…"
                  value={addSearchQuery}
                  onChange={(e) => {
                    const q = e.target.value;
                    setAddSearchQuery(q);
                    setAddSearchResults([]);
                    if (addSearchTimer.current) clearTimeout(addSearchTimer.current);
                    if (q.length < 2) return;
                    addSearchTimer.current = setTimeout(async () => {
                      setAddSearching(true);
                      try {
                        const res = await fetch(`/api/contacts/search?q=${encodeURIComponent(q)}`);
                        if (res.ok) {
                          const data = await res.json();
                          setAddSearchResults(data.contacts ?? []);
                        }
                      } finally {
                        setAddSearching(false);
                      }
                    }, 300);
                  }}
                />
                {addSearching && <p className="text-mist text-xs mt-1">Searching…</p>}
                {addSearchResults.length > 0 && (
                  <div className="mt-1 bg-slate-mid border border-fog rounded max-h-32 overflow-y-auto">
                    {addSearchResults.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setAddedContacts((prev) =>
                            prev.find((p) => p.id === c.id) ? prev : [...prev, c],
                          );
                          setRemovedIds((prev) => {
                            const next = new Set(prev);
                            next.delete(c.id);
                            return next;
                          });
                          setAddSearchQuery("");
                          setAddSearchResults([]);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-pale hover:bg-slate transition-colors"
                      >
                        {c.first_name} {c.last_name}{" "}
                        <span className="text-mist">({c.email})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Recipient list */}
              <div className="flex-1 overflow-y-auto p-4">
                <p className="text-xs text-mist uppercase tracking-wider mb-3">
                  {recipients.length} recipient{recipients.length !== 1 ? "s" : ""}
                </p>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-left text-xs text-mist border-b border-fog">
                      <th className="py-2 pr-2 w-5"></th>
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2">Email</th>
                      <th className="py-2 pl-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipients.map((c) => (
                      <tr key={c.id} className="border-b border-fog/30 group">
                        <td className="py-2 pr-2">
                          <button
                            onClick={() => {
                              setRemovedIds((prev) => new Set([...prev, c.id]));
                              setAddedContacts((prev) => prev.filter((a) => a.id !== c.id));
                            }}
                            className="text-mist hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity leading-none"
                            title="Remove"
                          >
                            ×
                          </button>
                        </td>
                        <td className="py-2 pr-4 text-pale whitespace-nowrap">
                          {c.first_name} {c.last_name}
                        </td>
                        <td className="py-2 text-mist break-all">{c.email}</td>
                        <td className="py-2 pl-4 text-mist whitespace-nowrap">{c.contact_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : rightPanel === "links" ? (
            <div className="w-full h-full overflow-y-auto font-sans text-sm p-4">
              {checkingLinks ? (
                <p className="text-mist">Rendering and checking links…</p>
              ) : linkResults.length === 0 ? (
                <p className="text-mist">No links found.</p>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-left text-xs text-mist border-b border-fog">
                      <th className="py-2 pr-4 w-16">Status</th>
                      <th className="py-2">URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linkResults.map((r, i) => (
                      <tr key={i} className="border-b border-fog/30">
                        <td className="py-2 pr-4">
                          <span className={`font-mono font-bold ${r.ok ? "text-green-400" : "text-red-400"}`}>
                            {r.status ?? (r.error === "Timed out" ? "⏱" : "✗")}
                          </span>
                        </td>
                        <td className="py-2 break-all">
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`hover:underline ${r.ok ? "text-pale" : "text-red-300"}`}
                          >
                            {r.url}
                          </a>
                          {r.error && (
                            <span className="ml-2 text-xs text-mist">({r.error})</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <PreviewPanel html={previewHtml} loading={previewing} />
          )}
        </div>
      </div>
    </div>
  );
}
