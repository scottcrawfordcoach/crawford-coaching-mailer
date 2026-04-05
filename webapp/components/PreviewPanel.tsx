"use client";

interface Props {
  html: string;
  loading?: boolean;
}

export default function PreviewPanel({ html, loading }: Props) {
  return (
    <div className="relative w-full h-full">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink/70 z-10">
          <p className="text-mist text-sm font-sans">Rendering…</p>
        </div>
      )}
      <iframe
        title="Email preview"
        className="w-full h-full border-0 rounded"
        srcDoc={html || "<body style='background:#0e0f10'></body>"}
        sandbox="allow-same-origin"
      />
    </div>
  );
}
