"use client";

import { useState, useRef } from "react";

interface Props {
  label?: string;
  onUpload: (url: string) => void;
}

export default function ImageUpload({ label, onUpload }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", file.name);

    try {
      const res = await fetch("/api/assets", { method: "POST", body: formData });
      const json = await res.json();
      if (json.url) {
        onUpload(json.url);
      } else {
        setError(json.error ?? "Upload failed");
      }
    } catch {
      setError("Upload failed");
    }
    setLoading(false);
    // Reset input so same file can be re-uploaded
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="inline-flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        id="img-upload"
        onChange={handleChange}
      />
      <label
        htmlFor="img-upload"
        className="btn-ghost text-xs cursor-pointer"
      >
        {loading ? "Uploading…" : (label ?? "Upload Image")}
      </label>
      {error && <p className="text-red-400 text-xs font-sans">{error}</p>}
    </div>
  );
}
