"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import RecipientSelector, { type Recipient } from "@/components/RecipientSelector";
import PreviewPanel from "@/components/PreviewPanel";
import SectionBlock, { type SectionData } from "@/components/SectionBlock";

const EMPTY_SECTION: SectionData = { title: "", copy: "", image: null, ctaLabel: "", ctaUrl: "" };

export default function NewsletterComposePage() {
  const [subject, setSubject] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);

  // Intro
  const [introTitle, setIntroTitle] = useState("");
  const [introTagline, setIntroTagline] = useState("");
  const [introBody, setIntroBody] = useState("");

  // Sections
  const [body, setBody] = useState<SectionData>({ ...EMPTY_SECTION });
  const [thought, setThought] = useState<SectionData>({ ...EMPTY_SECTION });
  const [brain, setBrain] = useState<SectionData>({ ...EMPTY_SECTION });
  const [soul, setSoul] = useState<SectionData>({ ...EMPTY_SECTION });

  // Optional sections
  const [gymEnabled, setGymEnabled] = useState(false);
  const [gymContent, setGymContent] = useState("");
  const [gymCtaLabel, setGymCtaLabel] = useState("");
  const [gymCtaUrl, setGymCtaUrl] = useState("");

  const [localEnabled, setLocalEnabled] = useState(false);
  const [localContent, setLocalContent] = useState("");

  // Preview / send
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendSuccess, setSendSuccess] = useState("");

  // ---------------------------------------------------------------------------
  // Build vars object for template API
  // ---------------------------------------------------------------------------

  function buildVars() {
    return {
      introTitle,
      introTagline,
      introBody,
      body,
      thought,
      brain,
      soul,
      gymEnabled,
      gymContent: gymEnabled ? gymContent : null,
      gymCtaLabel: gymEnabled ? gymCtaLabel : null,
      gymCtaUrl: gymEnabled ? gymCtaUrl : null,
      localEnabled,
      localContent: localEnabled ? localContent : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Preview
  // ---------------------------------------------------------------------------

  const handlePreview = useCallback(async () => {
    setPreviewLoading(true);
    const res = await fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "newsletter", vars: buildVars() }),
    });
    setPreviewHtml(await res.text());
    setPreviewLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introTitle, introTagline, introBody, body, thought, brain, soul, gymEnabled, gymContent, gymCtaLabel, gymCtaUrl, localEnabled, localContent]);

  // ---------------------------------------------------------------------------
  // Send
  // ---------------------------------------------------------------------------

  async function handleSend() {
    setSendError("");
    setSendSuccess("");

    if (!subject.trim()) { setSendError("Subject is required."); return; }
    if (!introTitle.trim()) { setSendError("Intro title is required."); return; }
    if (recipients.length === 0) { setSendError("Add at least one recipient."); return; }

    const confirmed = window.confirm(
      `Send to ${recipients.length} recipient${recipients.length !== 1 ? "s" : ""}?`,
    );
    if (!confirmed) return;

    setSending(true);
    const previewRes = await fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "newsletter", vars: buildVars() }),
    });
    const htmlBody = await previewRes.text();

    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_type: "newsletter",
        subject,
        html_body: htmlBody,
        recipients,
      }),
    });

    setSending(false);
    const data = await res.json();
    if (data.data) {
      setSendSuccess(`Sent to ${data.data.recipient_count} recipient(s). Campaign ID: ${data.data.campaign_id}`);
    } else {
      setSendError(data.error ?? "Send failed.");
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-screen">
      <Nav />

      {/* Sub-nav */}
      <div className="bg-slate border-b border-fog px-6 py-2 flex items-center gap-6">
        <Link
          href="/compose"
          className="text-xs font-sans tracking-widest uppercase text-mist hover:text-pale transition-colors pb-1.5"
        >
          General Email
        </Link>
        <span className="text-xs font-sans tracking-widest uppercase text-white border-b-2 border-brand-blue pb-1.5">
          Newsletter
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* LEFT — inputs */}
        <div className="w-[520px] flex-shrink-0 overflow-y-auto border-r border-fog px-6 py-6 space-y-5">

          {/* Subject */}
          <div>
            <label className="label">Subject</label>
            <input className="field" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Newsletter subject line" />
          </div>

          {/* Recipients */}
          <div>
            <label className="label">Recipients</label>
            <RecipientSelector value={recipients} onChange={setRecipients} />
          </div>

          {/* Intro */}
          <div className="space-y-3 border border-fog rounded px-4 py-4">
            <p className="font-sans text-xs tracking-widest uppercase text-brand-blue">Intro</p>

            <div>
              <label className="label">Issue Title</label>
              <input className="field" value={introTitle} onChange={(e) => setIntroTitle(e.target.value)} placeholder="A Failed Tactic Is Not a Failed Strategy" />
            </div>
            <div>
              <label className="label">Tagline / Quote</label>
              <input className="field" value={introTagline} onChange={(e) => setIntroTagline(e.target.value)} placeholder="Opening quote or subheadline" />
            </div>
            <div>
              <label className="label">Intro Body Copy</label>
              <textarea className="field resize-none h-32" value={introBody} onChange={(e) => setIntroBody(e.target.value)} placeholder="Hi {{FIRST_NAME}}, …" />
            </div>
          </div>

          {/* Four food sections */}
          <SectionBlock heading="Food for the Body" value={body} onChange={setBody} defaultOpen />
          <SectionBlock heading="Food for Thought" value={thought} onChange={setThought} />
          <SectionBlock heading="Food for the Brain" value={brain} onChange={setBrain} />
          <SectionBlock heading="Food for the Soul" value={soul} onChange={setSoul} />

          {/* Gym News */}
          <div className="border border-fog rounded">
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer"
              onClick={() => setGymEnabled((v) => !v)}
            >
              <input
                type="checkbox"
                checked={gymEnabled}
                onChange={() => setGymEnabled((v) => !v)}
                className="accent-brand-blue cursor-pointer"
              />
              <span className="font-sans text-xs tracking-widest uppercase text-brand-blue">Gym News (optional)</span>
            </div>
            {gymEnabled && (
              <div className="px-4 pb-4 space-y-3 border-t border-fog">
                <div>
                  <label className="label">Content</label>
                  <textarea className="field resize-none h-24" value={gymContent} onChange={(e) => setGymContent(e.target.value)} placeholder="Gym news content" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">CTA Label</label>
                    <input className="field" value={gymCtaLabel} onChange={(e) => setGymCtaLabel(e.target.value)} placeholder="Learn more" />
                  </div>
                  <div>
                    <label className="label">CTA URL</label>
                    <input className="field" value={gymCtaUrl} onChange={(e) => setGymCtaUrl(e.target.value)} placeholder="https://…" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Local News */}
          <div className="border border-fog rounded">
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer"
              onClick={() => setLocalEnabled((v) => !v)}
            >
              <input
                type="checkbox"
                checked={localEnabled}
                onChange={() => setLocalEnabled((v) => !v)}
                className="accent-brand-blue cursor-pointer"
              />
              <span className="font-sans text-xs tracking-widest uppercase text-brand-blue">Local News (optional)</span>
            </div>
            {localEnabled && (
              <div className="px-4 pb-4 space-y-3 border-t border-fog">
                <div>
                  <label className="label">Content</label>
                  <textarea className="field resize-none h-24" value={localContent} onChange={(e) => setLocalContent(e.target.value)} placeholder="Local news content" />
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button className="btn-ghost" onClick={handlePreview}>Preview</button>
            <button className="btn-primary" onClick={handleSend} disabled={sending}>
              {sending ? "Sending…" : `Send to ${recipients.length || "…"}`}
            </button>
          </div>

          {sendError && <p className="text-red-400 text-sm font-sans">{sendError}</p>}
          {sendSuccess && <p className="text-green-400 text-sm font-sans">{sendSuccess}</p>}
        </div>

        {/* RIGHT — preview */}
        <div className="flex-1 bg-ink overflow-hidden p-4">
          {previewHtml ? (
            <PreviewPanel html={previewHtml} loading={previewLoading} />
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-fog text-sm font-sans">
                Click <span className="text-mist">Preview</span> to render the newsletter
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
