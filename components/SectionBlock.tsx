"use client";

import { useState } from "react";
import ImageUpload from "./ImageUpload";

export interface SectionData {
  title: string;
  copy: string;
  image?: string | null;
  ctaLabel?: string;
  ctaUrl?: string;
}

interface Props {
  heading: string;
  value: SectionData;
  onChange: (data: SectionData) => void;
  showImage?: boolean;
  showCta?: boolean;
  defaultOpen?: boolean;
}

export default function SectionBlock({
  heading,
  value,
  onChange,
  showImage = true,
  showCta = true,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  const set = (partial: Partial<SectionData>) => onChange({ ...value, ...partial });

  return (
    <div className="border border-fog rounded">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="font-sans text-xs tracking-widest uppercase text-brand-blue">{heading}</span>
        <span className="text-mist text-lg leading-none">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-fog">
          <div>
            <label className="label">Title</label>
            <input
              className="field"
              value={value.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="Section title"
            />
          </div>

          <div>
            <label className="label">Body copy</label>
            <textarea
              className="field resize-none h-36"
              value={value.copy}
              onChange={(e) => set({ copy: e.target.value })}
              placeholder="Body copy (HTML is fine)"
            />
          </div>

          {showImage && (
            <div>
              <label className="label">Image (optional)</label>
              <div className="flex flex-col gap-1.5">
                {value.image && (
                  <div className="flex items-center gap-2">
                    <img
                      src={value.image}
                      alt="preview"
                      className="h-12 w-auto rounded border border-fog object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => set({ image: null })}
                      className="text-fog hover:text-mist text-xs font-sans"
                    >
                      Remove
                    </button>
                  </div>
                )}
                <ImageUpload label="Upload image" onUpload={(url) => set({ image: url })} />
                <span className="text-mist text-xs font-sans">Or paste URL:</span>
                <input
                  className="field text-sm"
                  value={value.image ?? ""}
                  onChange={(e) => set({ image: e.target.value || null })}
                  placeholder="https://…"
                />
              </div>
            </div>
          )}

          {showCta && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">CTA Label (optional)</label>
                <input
                  className="field"
                  value={value.ctaLabel ?? ""}
                  onChange={(e) => set({ ctaLabel: e.target.value })}
                  placeholder="Read more"
                />
              </div>
              <div>
                <label className="label">CTA URL</label>
                <input
                  className="field"
                  value={value.ctaUrl ?? ""}
                  onChange={(e) => set({ ctaUrl: e.target.value })}
                  placeholder="https://…"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
