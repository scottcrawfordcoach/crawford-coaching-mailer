"use client";

import { useEffect, useRef } from "react";

interface Props {
  html: string;
  loading?: boolean;
}

export default function PreviewPanel({ html, loading }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html || "<body style='background:#0e0f10'></body>");
    doc.close();
  }, [html]);

  return (
    <div className="relative w-full h-full">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink/70 z-10">
          <p className="text-mist text-sm font-sans">Rendering…</p>
        </div>
      )}
      <iframe
        ref={iframeRef}
        title="Email preview"
        className="w-full h-full border-0 rounded"
        sandbox="allow-same-origin"
      />
    </div>
  );
}
