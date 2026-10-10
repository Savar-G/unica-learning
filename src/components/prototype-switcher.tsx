"use client";

// PROTOTYPE ONLY (branch site/price-compare-prototype). Floating bar that cycles ?variant= keys.
// Never ships: callers render it only outside production (preview deploys count as non-production).
import { useEffect } from "react";

export const SHOW_PROTOTYPES = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";

export function PrototypeSwitcher({ variants, current, onChange }: { variants: { key: string; name: string }[]; current: string; onChange: (key: string) => void }) {
  const i = Math.max(0, variants.findIndex((v) => v.key === current));
  const go = (step: number) => onChange(variants[(i + step + variants.length) % variants.length].key);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const v = variants[i];
  return (
    <div className="proto-bar" role="toolbar" aria-label="Prototype variants">
      <button type="button" onClick={() => go(-1)} aria-label="Previous variant">←</button>
      <span>
        <b>{v.key}</b> {v.name} <i>{i + 1}/{variants.length}</i>
      </span>
      <button type="button" onClick={() => go(1)} aria-label="Next variant">→</button>
    </div>
  );
}
