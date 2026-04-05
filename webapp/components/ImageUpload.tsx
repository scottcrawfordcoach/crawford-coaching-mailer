"use client";

import { useRef, useState } from "react";
import type { DragEvent, ChangeEvent } from "react";

interface Props {
  slug: string;
  currentUrl: string;
  onUploaded: (url: string, filename: string) => void;
  label?: string;
}

export default function ImageUpload({ slug, currentUrl, onUploaded, label }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  async function uploadFile(file: File) {
    setUploading(true);
    setError("");

    const fd = new FormData();
    fd.append("file", file);
    fd.append("slug", slug);

    try {
      const res = await fetch("/api/assets", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
      } else {
        onUploaded(data.url, data.filename);
      }
    } catch {
      setError("Upload failed");
    }

    setUploading(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave() {
    setDragging(false);
  }

  function handleClick() {
    inputRef.current?.click();
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  }

  const filenameFromUrl = currentUrl
    ? (currentUrl.split("/").pop()?.split("?")[0] ?? "")
    : "";

  function renderZoneContent() {
    if (uploading) {
      return <span className="text-mist text-xs font-sans">Uploading…</span>;
    }
    if (error) {
      return <span className="text-red-400 text-xs font-sans">{error}</span>;
    }
    if (filenameFromUrl) {
      return (
        <span className="inline-block bg-slate-mid border border-fog text-pale text-xs font-sans rounded px-2 py-0.5 truncate max-w-full">
          {filenameFromUrl}
        </span>
      );
    }
    return (
      <span className="text-mist text-xs font-sans">
        {label ?? "Drop image here or click to browse"}
      </span>
    );
  }

  return (
    <div
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={[
        "border border-dashed rounded px-4 py-3 text-center cursor-pointer transition-colors",
        dragging
          ? "border-brand-blue bg-brand-blue/5"
          : "border-fog hover:border-brand-blue",
      ].join(" ")}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
      {renderZoneContent()}
    </div>
  );
}
