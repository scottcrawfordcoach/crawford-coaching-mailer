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
  const [tagCategory, setTagCategory] = useState<TagCategory>("program");
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [contactStatus, setContactStatus] = useState("");
  const [groupCount, setGroupCount] = useState<number | null>(null);
  const [groupRecipients, setGroupRecipients] = useState<Contact[]>([]);
  const [loadingGroup, setLoadingGroup] = useState(false);

  // Email content
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  // Preview / send
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

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

  // ── Load tags when category changes (Group mode) ──────────────────────

  useEffect(() => {
    if (sendMode !== "group") return;
    setSelectedTags([]);
    setGroupCount(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/contacts/tags?category=${encodeURIComponent(tagCategory)}`,
        );
        if (res.ok) {
          const data = await res.json();
          setAvailableTags(data.tags ?? []);
        }
      } catch {
        setAvailableTags([]);
      }
    })();
  }, [tagCategory, sendMode]);

  // ── Resolve group recipients when tags/status change ──────────────────

  useEffect(() => {
    if (sendMode !== "group" || selectedTags.length === 0) {
      setGroupCount(null);
      setGroupRecipients([]);
      return;
    }

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

  // ── Send ──────────────────────────────────────────────────────────────

  async function handleSend() {
    const recipients =
      sendMode === "individual" ? selectedContacts : groupRecipients;
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

  const recipients =
    sendMode === "individual" ? selectedContacts : groupRecipients;
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
                  <label className="label">Tag category</label>
                  <select
                    className="field"
                    value={tagCategory}
                    onChange={(e) =>
                      setTagCategory(e.target.value as TagCategory)
                    }
                  >
                    {TAG_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">Tags</label>
                  <div className="flex flex-wrap gap-2">
                    {availableTags.map((tag) => {
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
                    {availableTags.length === 0 && (
                      <p className="text-mist text-xs">No tags found</p>
                    )}
                  </div>
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
                disabled={!canPreview || previewing}
                className="btn-ghost disabled:opacity-40"
              >
                {previewing ? "Rendering…" : "Preview"}
              </button>
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

        {/* ── RIGHT: Preview ─────────────────────────────────── */}
        <div className="flex-1 min-w-0" style={{ pointerEvents: isDragging ? "none" : undefined }}>
          <PreviewPanel html={previewHtml} loading={previewing} />
        </div>
      </div>
    </div>
  );
}
