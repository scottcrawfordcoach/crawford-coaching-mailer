"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Nav from "@/components/Nav";
import PreviewPanel from "@/components/PreviewPanel";
import ImageUpload from "@/components/ImageUpload";
import type {
  FoodSection,
  GymSection,
  GymStory,
  LocalSection,
  NewsletterContent,
} from "@/lib/templates";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Contact {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

// ---------------------------------------------------------------------------
// Empty defaults
// ---------------------------------------------------------------------------

const EMPTY_FOOD: FoodSection = {
  subtitle: "",
  copy: "",
  image: "",
  image_alt: "",
  image_caption: "",
  image_url: "",
  image_layout: "portrait",
  cta_label: "",
  cta_url: "",
  share_url: "",
};

const EMPTY_STORY: GymStory = {
  heading: "",
  copy: "",
  image: "",
  image_alt: "",
  image_caption: "",
  image_url: "",
  cta_label: "",
  cta_url: "",
};

const EMPTY_CONTENT: NewsletterContent = {
  edition_label: "",
  subject: "",
  intro_title: "",
  intro_tagline: "",
  intro_body: "",
  full_blog_url: "",
  blogcast_url: "",
  subscribe_url: "https://crawford-coaching.ca/subscribe",
  food_body: { ...EMPTY_FOOD },
  food_thought: { ...EMPTY_FOOD },
  food_brain: { ...EMPTY_FOOD },
  food_soul: { ...EMPTY_FOOD },
  gym_news: {
    enabled: false,
    closure_dates: "",
    calendar_url: "",
    story1: { ...EMPTY_STORY },
    story2_enabled: false,
    story2: { ...EMPTY_STORY },
  },
  local_news: {
    enabled: false,
    subtitle: "",
    copy: "",
    image: "",
    image_alt: "",
    image_caption: "",
    image_url: "",
    cta_label: "",
    cta_url: "",
  },
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function EditionPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [form, setForm] = useState<NewsletterContent>(EMPTY_CONTENT);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewKey, setPreviewKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [rightPanel, setRightPanel] = useState<"preview" | "links">("preview");
  const [linkResults, setLinkResults] = useState<{ url: string; status: number | null; ok: boolean; error?: string }[]>([]);
  const [checkingLinks, setCheckingLinks] = useState(false);
  const [leftWidth, setLeftWidth] = useState(520);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef<number>(0);
  const dragStartWidth = useRef<number>(520);

  // Send panel state
  const [sendMode, setSendMode] = useState<"individual" | "all">("all");
  const [nSearchQuery, setNSearchQuery] = useState("");
  const [nSearchResults, setNSearchResults] = useState<Contact[]>([]);
  const [nSelectedContacts, setNSelectedContacts] = useState<Contact[]>([]);
  const [nSearching, setNSearching] = useState(false);
  const [nSubscribers, setNSubscribers] = useState<Contact[]>([]);
  const [nSubscribersLoaded, setNSubscribersLoaded] = useState(false);
  const [nSending, setNSending] = useState(false);
  const [nSendResult, setNSendResult] = useState<string | null>(null);
  const nSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartX.current = e.clientX;
    dragStartWidth.current = leftWidth;
    setIsDragging(true);

    function onMouseMove(ev: MouseEvent) {
      const newWidth = Math.min(800, Math.max(280, dragStartWidth.current + ev.clientX - dragStartX.current));
      setLeftWidth(newWidth);
    }
    function onMouseUp() {
      setIsDragging(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [leftWidth]);

  // -------------------------------------------------------------------------
  // State updaters
  // -------------------------------------------------------------------------

  function set<K extends keyof NewsletterContent>(key: K, value: NewsletterContent[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setFood(
    section: "food_body" | "food_thought" | "food_brain" | "food_soul",
    key: keyof FoodSection,
    value: string,
  ) {
    setForm((f) => ({ ...f, [section]: { ...f[section], [key]: value } }));
  }

  function setGym<K extends keyof GymSection>(key: K, value: GymSection[K]) {
    setForm((f) => ({ ...f, gym_news: { ...f.gym_news, [key]: value } }));
  }

  function setGymStory(story: "story1" | "story2", key: keyof GymStory, value: string) {
    setForm((f) => ({
      ...f,
      gym_news: {
        ...f.gym_news,
        [story]: { ...f.gym_news[story], [key]: value },
      },
    }));
  }

  function setLocal<K extends keyof LocalSection>(key: K, value: LocalSection[K]) {
    setForm((f) => ({ ...f, local_news: { ...f.local_news, [key]: value } }));
  }

  // -------------------------------------------------------------------------
  // Load on mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    fetch(`/api/editions/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.content) {
          setForm({
            ...EMPTY_CONTENT,
            ...data.content,
            food_body: { ...EMPTY_FOOD, ...data.content.food_body },
            food_thought: { ...EMPTY_FOOD, ...data.content.food_thought },
            food_brain: { ...EMPTY_FOOD, ...data.content.food_brain },
            food_soul: { ...EMPTY_FOOD, ...data.content.food_soul },
            gym_news: {
              ...EMPTY_CONTENT.gym_news,
              ...data.content.gym_news,
              story1: { ...EMPTY_STORY, ...data.content.gym_news?.story1 },
              story2: { ...EMPTY_STORY, ...data.content.gym_news?.story2 },
            },
            local_news: { ...EMPTY_CONTENT.local_news, ...data.content.local_news },
          });
        }
      })
      .catch(() => {});
  }, [slug]);

  // -------------------------------------------------------------------------
  // Action handlers
  // -------------------------------------------------------------------------

  async function handleSave() {
    setSaving(true);
    setSaveMsg("");
    await fetch(`/api/editions/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setSaveMsg("Saved ✓");
    setTimeout(() => setSaveMsg(""), 3000);
  }

  async function handlePreview() {
    setPreviewing(true);
    const res = await fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vars: form }),
    });
    const html = await res.text();
    setPreviewHtml(html || "");
    setPreviewing(false);
    setPreviewKey((k) => k + 1);
    setRightPanel("preview");
  }

  async function handleCheckLinks() {
    setCheckingLinks(true);
    setRightPanel("links");
    setLinkResults([]);
    try {
      // Render first so we check the actual HTML that would be sent
      const previewRes = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vars: form }),
      });
      const html = await previewRes.text();
      setPreviewHtml(html || "");
      setPreviewKey((k) => k + 1);

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

  function handleExportJson() {
    navigator.clipboard.writeText(JSON.stringify(form, null, 2));
  }

  // ── Send panel — contact search (debounced) ──────────────────────────────

  useEffect(() => {
    if (sendMode !== "individual" || nSearchQuery.length < 2) {
      setNSearchResults([]);
      return;
    }
    if (nSearchTimer.current) clearTimeout(nSearchTimer.current);
    nSearchTimer.current = setTimeout(async () => {
      setNSearching(true);
      try {
        const res = await fetch(`/api/contacts/search?q=${encodeURIComponent(nSearchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setNSearchResults(data.contacts ?? []);
        }
      } finally {
        setNSearching(false);
      }
    }, 300);
  }, [nSearchQuery, sendMode]);

  // ── Send panel — load subscriber list ────────────────────────────────────

  useEffect(() => {
    if (sendMode !== "all" || nSubscribersLoaded) return;
    (async () => {
      try {
        const res = await fetch("/api/newsletter/subscribers");
        if (res.ok) {
          const data = await res.json();
          setNSubscribers(data.contacts ?? []);
          setNSubscribersLoaded(true);
        }
      } catch { /* ignore */ }
    })();
  }, [sendMode, nSubscribersLoaded]);

  // ── Send panel — send handler ─────────────────────────────────────────────

  async function handleNewsletterSend() {
    const recipients = sendMode === "individual" ? nSelectedContacts : nSubscribers;
    if (recipients.length === 0 || !form.subject?.trim()) return;

    const confirmed = window.confirm(
      `Send "${form.subject}" to ${recipients.length} recipient${recipients.length !== 1 ? "s" : ""}?`,
    );
    if (!confirmed) return;

    setNSending(true);
    setNSendResult(null);

    // ── Generate share pages if any are missing ──────────────────────────
    let varsToSend = form;
    const sections = ["food_body", "food_thought", "food_brain", "food_soul"] as const;
    const needsSharePages = sections.some(
      (k) => { const s = form[k]; return s && s.copy && !s.share_url; },
    );

    if (needsSharePages) {
      try {
        setNSendResult("Generating share pages…");
        const spRes = await fetch("/api/newsletter/share-pages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, content: form }),
        });
        const spData = await spRes.json();
        if (spRes.ok && spData.share_urls) {
          // Merge share URLs into form data for the send
          const merged = { ...form };
          for (const sectionKey of sections) {
            const url = (spData.share_urls as Record<string, string>)[sectionKey];
            if (url && merged[sectionKey]) {
              merged[sectionKey] = { ...merged[sectionKey], share_url: url };
            }
          }
          varsToSend = merged;
        }
        // If share page generation fails, proceed without share links
      } catch {
        // Non-fatal — send without share links
      }
    }

    // ── Send the newsletter ─────────────────────────────────────────────
    setNSendResult(null);
    try {
      const res = await fetch("/api/newsletter/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: form.subject.trim(),
          vars: varsToSend,
          edition_slug: slug,
          recipients: recipients.map((c) => ({
            email: c.email,
            first_name: c.first_name,
            contact_id: c.id,
          })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setNSendResult(
          `Sent to ${data.recipient_count} recipient${data.recipient_count !== 1 ? "s" : ""}. Campaign ID: ${data.campaign_id}`,
        );
      } else {
        setNSendResult(`Error: ${data.error ?? "Send failed"}`);
      }
    } catch (err) {
      setNSendResult(`Error: ${err instanceof Error ? err.message : "Network error"}`);
    } finally {
      setNSending(false);
    }
  }

  // -------------------------------------------------------------------------
  // Reusable image cluster (shared between food and gym/local)
  // -------------------------------------------------------------------------

  function renderImageCluster(
    values: { image: string; image_alt: string; image_caption: string; image_url: string },
    onChange: (key: string, value: string) => void,
    showLayoutSelect = false,
    layoutValue = "portrait",
  ) {
    return (
      <div className="bg-black/20 border border-dashed border-fog rounded p-4 space-y-3">
        <p className="text-xs font-sans font-medium tracking-widest uppercase text-mist">Image</p>

        <div>
          <label className="label">Image Source URL</label>
          <input
            className="field"
            value={values.image}
            onChange={(e) => onChange("image", e.target.value)}
          />
          <div className="mt-2">
            <ImageUpload
              slug={slug}
              currentUrl={values.image}
              onUploaded={(url, _filename) => {
                onChange("image", url);
                onChange("image_url", url);
              }}
            />
          </div>
        </div>

        <div>
          <label className="label">Alt Text</label>
          <input
            className="field"
            value={values.image_alt}
            onChange={(e) => onChange("image_alt", e.target.value)}
          />
        </div>

        <div>
          <label className="label">Caption</label>
          <input
            className="field"
            value={values.image_caption}
            onChange={(e) => onChange("image_caption", e.target.value)}
          />
        </div>

        <div>
          <label className="label">Image URL</label>
          <input
            type="url"
            className="field"
            value={values.image_url}
            onChange={(e) => onChange("image_url", e.target.value)}
          />
        </div>

        {showLayoutSelect && (
          <div>
            <label className="label">Layout</label>
            <select
              className="field"
              value={layoutValue}
              onChange={(e) => onChange("image_layout", e.target.value)}
            >
              <option value="portrait">Portrait — floats beside text</option>
              <option value="landscape">Landscape — full width above</option>
            </select>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Food section renderer
  // -------------------------------------------------------------------------

  function renderFoodSection(
    key: "food_body" | "food_thought" | "food_brain" | "food_soul",
    title: string,
    tag: string,
  ) {
    const section = form[key];
    return (
      <div className="bg-slate border border-fog rounded-sm p-5">
        <div className="border-b border-fog pb-3 mb-4">
          <p className="text-xs font-sans tracking-widest uppercase text-brand-blue">{tag}</p>
          <p className="font-serif text-white text-lg">{title}</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Subtitle</label>
            <input
              className="field"
              value={section.subtitle}
              onChange={(e) => setFood(key, "subtitle", e.target.value)}
            />
          </div>

          <div>
            <label className="label">Body Copy</label>
            <textarea
              className="field min-h-[140px]"
              value={section.copy}
              onChange={(e) => setFood(key, "copy", e.target.value)}
            />
          </div>

          <hr className="border-fog" />

          {renderImageCluster(
            {
              image: section.image,
              image_alt: section.image_alt,
              image_caption: section.image_caption,
              image_url: section.image_url,
            },
            (field, value) => setFood(key, field as keyof FoodSection, value),
            true,
            section.image_layout,
          )}

          <hr className="border-fog" />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Button Label</label>
              <input
                className="field"
                value={section.cta_label}
                onChange={(e) => setFood(key, "cta_label", e.target.value)}
              />
            </div>
            <div>
              <label className="label">Button URL</label>
              <input
                type="url"
                className="field"
                value={section.cta_url}
                onChange={(e) => setFood(key, "cta_url", e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Gym story sub-section renderer
  // -------------------------------------------------------------------------

  function renderGymStory(story: "story1" | "story2", label: string) {
    const s = form.gym_news[story];
    return (
      <div className="border-l-2 border-brand-blue/30 pl-4 mt-4 space-y-3">
        <p className="text-mist text-xs font-sans font-medium tracking-widest uppercase">
          {label}
        </p>

        <div>
          <label className="label">Heading</label>
          <input
            className="field"
            value={s.heading}
            onChange={(e) => setGymStory(story, "heading", e.target.value)}
          />
        </div>

        <div>
          <label className="label">Copy</label>
          <textarea
            className="field min-h-[100px]"
            value={s.copy}
            onChange={(e) => setGymStory(story, "copy", e.target.value)}
          />
        </div>

        {renderImageCluster(
          {
            image: s.image,
            image_alt: s.image_alt,
            image_caption: s.image_caption,
            image_url: s.image_url,
          },
          (field, value) => setGymStory(story, field as keyof GymStory, value),
          false,
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Button Label</label>
            <input
              className="field"
              value={s.cta_label}
              onChange={(e) => setGymStory(story, "cta_label", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Button URL</label>
            <input
              type="url"
              className="field"
              value={s.cta_url}
              onChange={(e) => setGymStory(story, "cta_url", e.target.value)}
            />
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className={`h-screen flex flex-col bg-ink overflow-hidden${isDragging ? " select-none" : ""}`}>
      <Nav />

      <div className="flex flex-1 overflow-hidden">
        {/* ---------------------------------------------------------------- */}
        {/* LEFT: scrollable form column                                      */}
        {/* ---------------------------------------------------------------- */}
        <div style={{ width: leftWidth, flexShrink: 0 }} className="overflow-y-auto border-fog flex flex-col">
          <div className="flex-1 px-6 py-6 space-y-6">

            {/* ============================================================ */}
            {/* SEND PANEL                                                    */}
            {/* ============================================================ */}
            <div className="bg-slate border border-brand-blue/40 rounded-sm p-5">
              <div className="border-b border-fog pb-3 mb-4">
                <p className="text-xs font-sans tracking-widest uppercase text-brand-blue">
                  Send
                </p>
                <p className="font-serif text-white text-lg">Send Newsletter</p>
              </div>

              <div className="space-y-4">
                {/* Mode toggle */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setSendMode("individual")}
                    className={sendMode === "individual" ? "btn-primary" : "btn-ghost"}
                    style={{ fontSize: 11 }}
                  >
                    Individual
                  </button>
                  <button
                    onClick={() => setSendMode("all")}
                    className={sendMode === "all" ? "btn-primary" : "btn-ghost"}
                    style={{ fontSize: 11 }}
                  >
                    All Subscribers
                  </button>
                </div>

                {/* Individual mode */}
                {sendMode === "individual" && (
                  <div className="space-y-3">
                    <div className="relative">
                      <input
                        className="field pr-8"
                        placeholder="Search by name or email…"
                        value={nSearchQuery}
                        onChange={(e) => setNSearchQuery(e.target.value)}
                      />
                      {nSearching && (
                        <span className="absolute right-2 top-2 text-mist text-xs">…</span>
                      )}
                      {nSearchResults.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-slate border border-fog rounded shadow-lg max-h-48 overflow-y-auto">
                          {nSearchResults.map((c) => (
                            <button
                              key={c.id}
                              className="w-full text-left px-3 py-2 text-sm font-sans text-pale hover:bg-fog/20"
                              onClick={() => {
                                if (!nSelectedContacts.find((x) => x.id === c.id)) {
                                  setNSelectedContacts((prev) => [...prev, c]);
                                }
                                setNSearchQuery("");
                                setNSearchResults([]);
                              }}
                            >
                              {c.first_name} {c.last_name}{" "}
                              <span className="text-mist text-xs">{c.email}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {nSelectedContacts.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {nSelectedContacts.map((c) => (
                          <span
                            key={c.id}
                            className="flex items-center gap-1 bg-brand-blue/20 border border-brand-blue/40 text-pale text-xs font-sans px-2 py-1 rounded"
                          >
                            {c.first_name} {c.last_name}
                            <button
                              onClick={() =>
                                setNSelectedContacts((prev) => prev.filter((x) => x.id !== c.id))
                              }
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

                {/* All subscribers mode */}
                {sendMode === "all" && (
                  <p className="text-sm font-sans text-pale">
                    {nSubscribersLoaded
                      ? `${nSubscribers.length} active newsletter subscriber${nSubscribers.length !== 1 ? "s" : ""}`
                      : "Loading subscribers…"}
                  </p>
                )}

                {/* Subject preview */}
                <p className="text-xs font-sans text-mist">
                  Subject:{" "}
                  <span className="text-pale">
                    {form.subject?.trim() || <em className="text-fog">not set — fill in Edition Details</em>}
                  </span>
                </p>

                {/* Send button */}
                {(() => {
                  const recipients = sendMode === "individual" ? nSelectedContacts : nSubscribers;
                  const canSend = recipients.length > 0 && !!form.subject?.trim() && !nSending;
                  return (
                    <button
                      onClick={handleNewsletterSend}
                      disabled={!canSend}
                      className="btn-primary disabled:opacity-40"
                    >
                      {nSending
                        ? "Sending…"
                        : `Send to ${
                            sendMode === "all"
                              ? nSubscribersLoaded
                                ? `${nSubscribers.length} subscriber${nSubscribers.length !== 1 ? "s" : ""}`
                                : "subscribers"
                              : `${nSelectedContacts.length} contact${nSelectedContacts.length !== 1 ? "s" : ""}`
                          }`}
                    </button>
                  );
                })()}

                {/* Result */}
                {nSendResult && (
                  <div
                    className={`text-sm font-sans px-4 py-3 rounded ${
                      nSendResult.startsWith("Error")
                        ? "bg-red-900/30 text-red-300 border border-red-500/40"
                        : "bg-green-900/30 text-green-300 border border-green-500/40"
                    }`}
                  >
                    {nSendResult}
                  </div>
                )}
              </div>
            </div>

            {/* ============================================================ */}
            {/* SECTION 1: Edition Details                                    */}
            {/* ============================================================ */}
            <div className="bg-slate border border-fog rounded-sm p-5">
              <div className="border-b border-fog pb-3 mb-4">
                <p className="text-xs font-sans tracking-widest uppercase text-brand-blue">
                  Always Required
                </p>
                <p className="font-serif text-white text-lg">Edition Details</p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Edition Label</label>
                    <input
                      className="field"
                      placeholder="April 2026 · Issue 15"
                      value={form.edition_label}
                      onChange={(e) => set("edition_label", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Subject Line</label>
                    <input
                      className="field"
                      placeholder="April Edition 1 2026 | Becoming a Snacker"
                      value={form.subject}
                      onChange={(e) => set("subject", e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Issue Title</label>
                  <input
                    className="field"
                    placeholder="Becoming a Snacker"
                    value={form.intro_title}
                    onChange={(e) => set("intro_title", e.target.value)}
                  />
                </div>

                <div>
                  <label className="label">Opening Quote</label>
                  <input
                    className="field"
                    placeholder="Consistency is not built by never drifting..."
                    value={form.intro_tagline}
                    onChange={(e) => set("intro_tagline", e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* ============================================================ */}
            {/* SECTION 2: Introduction                                       */}
            {/* ============================================================ */}
            <div className="bg-slate border border-fog rounded-sm p-5">
              <div className="border-b border-fog pb-3 mb-4">
                <p className="text-xs font-sans tracking-widest uppercase text-brand-blue">
                  Always Required
                </p>
                <p className="font-serif text-white text-lg">Introduction</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="label">Body Text</label>
                  <textarea
                    className="field min-h-[200px]"
                    value={form.intro_body}
                    onChange={(e) => set("intro_body", e.target.value)}
                  />
                </div>

                <div>
                  <label className="label">Full Blog Article URL</label>
                  <input
                    type="url"
                    className="field"
                    value={form.full_blog_url}
                    onChange={(e) => set("full_blog_url", e.target.value)}
                  />
                </div>

                <div>
                  <label className="label">AI Discussion URL</label>
                  <input
                    type="url"
                    className="field"
                    value={form.blogcast_url}
                    onChange={(e) => set("blogcast_url", e.target.value)}
                  />
                </div>

                <div>
                  <label className="label">Subscribe URL</label>
                  <input
                    type="url"
                    className="field"
                    value={form.subscribe_url}
                    onChange={(e) => set("subscribe_url", e.target.value)}
                  />
                  <p className="text-mist text-xs font-sans mt-1">(usually unchanged)</p>
                </div>
              </div>
            </div>

            {/* ============================================================ */}
            {/* SECTIONS 3–6: Food sections                                   */}
            {/* ============================================================ */}
            {renderFoodSection("food_body", "Food for the Body", "Always Required")}
            {renderFoodSection("food_thought", "Food for Thought", "Always Required")}
            {renderFoodSection("food_brain", "Food for the Brain", "Always Required")}
            {renderFoodSection("food_soul", "Food for the Soul", "Always Required")}

            {/* ============================================================ */}
            {/* SECTION 7: Gym News                                           */}
            {/* ============================================================ */}
            <div className="bg-slate border border-fog rounded-sm p-5">
              <div className="border-b border-fog pb-3 mb-4">
                <p className="text-xs font-sans tracking-widest uppercase text-brand-blue">
                  Optional
                </p>
                <p className="font-serif text-white text-lg">Gym News</p>
              </div>

              <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-fog bg-slate-mid accent-brand-blue"
                    checked={form.gym_news.enabled}
                    onChange={(e) => setGym("enabled", e.target.checked)}
                  />
                  <span className="text-pale text-sm font-sans">
                    Include Gym News in this edition
                  </span>
                </label>

                {form.gym_news.enabled && (
                  <div className="space-y-4">
                    <div>
                      <label className="label">Upcoming Closure Dates</label>
                      <textarea
                        className="field min-h-[80px]"
                        value={form.gym_news.closure_dates}
                        onChange={(e) => setGym("closure_dates", e.target.value)}
                      />
                      <p className="text-mist text-xs font-sans mt-1">
                        List dates and details
                      </p>
                    </div>

                    {renderGymStory("story1", "Main Story 1")}

                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-fog bg-slate-mid accent-brand-blue"
                        checked={form.gym_news.story2_enabled}
                        onChange={(e) => setGym("story2_enabled", e.target.checked)}
                      />
                      <span className="text-pale text-sm font-sans">
                        Add a second gym story
                      </span>
                    </label>

                    {form.gym_news.story2_enabled && renderGymStory("story2", "Story 2")}
                  </div>
                )}
              </div>
            </div>

            {/* ============================================================ */}
            {/* SECTION 8: Local News                                         */}
            {/* ============================================================ */}
            <div className="bg-slate border border-fog rounded-sm p-5">
              <div className="border-b border-fog pb-3 mb-4">
                <p className="text-xs font-sans tracking-widest uppercase text-brand-blue">
                  Optional
                </p>
                <p className="font-serif text-white text-lg">Local News</p>
              </div>

              <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-fog bg-slate-mid accent-brand-blue"
                    checked={form.local_news.enabled}
                    onChange={(e) => setLocal("enabled", e.target.checked)}
                  />
                  <span className="text-pale text-sm font-sans">
                    Include Local News in this edition
                  </span>
                </label>

                {form.local_news.enabled && (
                  <div className="space-y-4">
                    <div>
                      <label className="label">Subtitle</label>
                      <input
                        className="field"
                        value={form.local_news.subtitle}
                        onChange={(e) => setLocal("subtitle", e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="label">Copy</label>
                      <textarea
                        className="field min-h-[120px]"
                        value={form.local_news.copy}
                        onChange={(e) => setLocal("copy", e.target.value)}
                      />
                    </div>

                    <hr className="border-fog" />

                    {renderImageCluster(
                      {
                        image: form.local_news.image,
                        image_alt: form.local_news.image_alt,
                        image_caption: form.local_news.image_caption,
                        image_url: form.local_news.image_url,
                      },
                      (field, value) =>
                        setLocal(field as keyof LocalSection, value as LocalSection[keyof LocalSection]),
                      false,
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Sticky action bar */}
          <div className="sticky bottom-0 bg-slate border-t border-fog px-6 py-3 flex gap-3 items-center">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={handlePreview}
              disabled={previewing || checkingLinks}
              className="btn-ghost disabled:opacity-50"
            >
              {previewing ? "Rendering…" : "Preview"}
            </button>
            <button
              onClick={handleCheckLinks}
              disabled={checkingLinks || previewing}
              className="btn-ghost disabled:opacity-50"
            >
              {checkingLinks ? "Checking…" : "Test Links"}
            </button>
            <button onClick={handleExportJson} className="btn-ghost">
              Export JSON
            </button>
            {saveMsg && (
              <p className="text-brand-blue text-xs font-sans">{saveMsg}</p>
            )}
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* DRAG HANDLE                                                       */}
        {/* ---------------------------------------------------------------- */}
        <div
          onMouseDown={handleDragStart}
          className="w-1.5 flex-shrink-0 bg-fog/30 hover:bg-brand-blue/60 active:bg-brand-blue cursor-col-resize transition-colors"
          title="Drag to resize"
        />

        {/* ---------------------------------------------------------------- */}
        {/* RIGHT: preview panel or link results                             */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex-1 overflow-hidden p-4" style={{ pointerEvents: isDragging ? "none" : undefined }}>
          {rightPanel === "links" ? (
            <div className="w-full h-full overflow-y-auto font-sans text-sm">
              {checkingLinks ? (
                <p className="text-mist p-4">Rendering and checking links…</p>
              ) : linkResults.length === 0 ? (
                <p className="text-mist p-4">No links found.</p>
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
                          {r.error && !r.ok && (
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
            <PreviewPanel key={previewKey} html={previewHtml} loading={previewing} />
          )}
        </div>
      </div>
    </div>
  );
}
