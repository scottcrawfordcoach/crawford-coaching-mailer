"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import RecipientSelector, { type Recipient } from "@/components/RecipientSelector";
import PreviewPanel from "@/components/PreviewPanel";
import Link from "next/link";

export default function ComposePage() {
  const router = useRouter();

  // Form state
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);

  // Preview state
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  // Send state
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendSuccess, setSendSuccess] = useState("");

  // ---------------------------------------------------------------------------
  // Preview
  // ---------------------------------------------------------------------------

  const handlePreview = useCallback(async () => {
    setPreviewLoading(true);
    const res = await fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "general", vars: { body } }),
    });
    const html = await res.text();
    setPreviewHtml(html);
    setPreviewLoading(false);
  }, [body]);

  // ---------------------------------------------------------------------------
  // Send
  // ---------------------------------------------------------------------------

  async function handleSend() {
    setSendError("");
    setSendSuccess("");

    if (!subject.trim()) { setSendError("Subject is required."); return; }
    if (!body.trim())    { setSendError("Body is required."); return; }
    if (recipients.length === 0) { setSendError("Add at least one recipient."); return; }

    const confirmed = window.confirm(
      `Send to ${recipients.length} recipient${recipients.length !== 1 ? "s" : ""}?`,
    );
    if (!confirmed) return;

    setSending(true);
    // Build final HTML with rendered template
    const previewRes = await fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "general", vars: { body } }),
    });
    const htmlBody = await previewRes.text();

    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_type: "general",
        subject,
        html_body: htmlBody,
        recipients,
      }),
    });

    setSending(false);
    const data = await res.json();
    if (data.data) {
      setSendSuccess(`Sent to ${data.data.recipient_count} recipient(s). Campaign ID: ${data.data.campaign_id}`);
      // Reset form
      setSubject("");
      setBody("");
      setRecipients([]);
      setPreviewHtml("");
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

      {/* Sub-nav: compose type switcher */}
      <div className="bg-slate border-b border-fog px-6 py-2 flex items-center gap-6">
        <span className="text-xs font-sans tracking-widest uppercase text-white border-b-2 border-brand-blue pb-1.5">
          General Email
        </span>
        <Link
          href="/compose/newsletter"
          className="text-xs font-sans tracking-widest uppercase text-mist hover:text-pale transition-colors pb-1.5"
        >
          Newsletter
        </Link>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT — inputs */}
        <div className="w-[480px] flex-shrink-0 overflow-y-auto border-r border-fog px-6 py-6 space-y-6">

          {/* Subject */}
          <div>
            <label className="label">Subject</label>
            <input
              className="field"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject line"
            />
          </div>

          {/* Recipients */}
          <div>
            <label className="label">Recipients</label>
            <RecipientSelector value={recipients} onChange={setRecipients} />
          </div>

          {/* Body */}
          <div>
            <label className="label">
              Message Body
              <span className="ml-2 font-sans text-fog text-xs normal-case tracking-normal">
                Use <code className="text-mist">{"{{FIRST_NAME}}"}</code> for personalisation
              </span>
            </label>
            <textarea
              className="field resize-none h-64 font-sans"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message here. HTML is supported."
            />
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-3 pt-2">
            <button className="btn-ghost" onClick={handlePreview}>
              Preview
            </button>
            <button
              className="btn-primary"
              onClick={handleSend}
              disabled={sending}
            >
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
                Click <span className="text-mist">Preview</span> to render the template
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
