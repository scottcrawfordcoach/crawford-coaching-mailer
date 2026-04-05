"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function makeSlug(num: string, title: string): string {
  const n = num.trim();
  const t = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!n && !t) return "";
  if (!n) return t;
  if (!t) return n;
  return `${n}-${t}`;
}

export default function NewEditionModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    const slug = makeSlug(number, title);
    if (!slug) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/editions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    setLoading(false);
    if (res.ok) {
      router.push(`/editions/${slug}`);
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error || "Failed to create edition.");
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary">
        + New Edition
      </button>
    );
  }

  return (
    <div className="bg-slate border border-fog rounded-sm p-5 w-80">
      <div className="flex items-center justify-between mb-4">
        <p className="label" style={{ marginBottom: 0 }}>
          New Edition
        </p>
        <button
          onClick={() => setOpen(false)}
          className="text-fog hover:text-mist text-lg leading-none"
        >
          ×
        </button>
      </div>

      {/* Edition number field */}
      <div className="mb-3">
        <label className="label" htmlFor="new-num">
          Edition Number
        </label>
        <input
          id="new-num"
          type="text"
          className="field"
          placeholder="16"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
        />
      </div>

      {/* Article title field */}
      <div className="mb-3">
        <label className="label" htmlFor="new-title">
          Article Title
        </label>
        <input
          id="new-title"
          type="text"
          className="field"
          placeholder="The Power of Habits"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {/* Slug preview */}
      {makeSlug(number, title) && (
        <p className="text-mist text-xs font-sans mb-4 break-all">
          slug:{" "}
          <span className="text-pale">{makeSlug(number, title)}</span>
        </p>
      )}

      {error && (
        <p className="text-red-400 text-xs font-sans mb-3">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleCreate}
          disabled={loading || !makeSlug(number, title)}
          className="btn-primary flex-1 disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create"}
        </button>
        <button onClick={() => setOpen(false)} className="btn-ghost">
          Cancel
        </button>
      </div>
    </div>
  );
}
