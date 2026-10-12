"use client";

// PROTOTYPE ONLY (branch site/compare-prototype-2). Floating bar that cycles ?variant= keys.
// Never ships: callers render it only outside production (preview deploys count as non-production).
import { useEffect, useState } from "react";

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

/** ?variant= state: read once after hydration, written back with replaceState so a reload keeps it. */
export function useVariant(keys: string[], fallback: string, revealScope: string) {
  const [key, setKey] = useState(fallback);

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("variant");
    if (k && keys.includes(k)) setKey(k); // eslint-disable-line react-hooks/set-state-in-effect -- read the URL once after hydration
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // the page's reveal observer only sees the first render; show swapped-in content at once
    document.querySelectorAll(`${revealScope} .rise`).forEach((el) => el.classList.add("is-in"));
  }, [key, revealScope]);

  const change = (k: string) => {
    setKey(k);
    const url = new URL(window.location.href);
    url.searchParams.set("variant", k);
    window.history.replaceState(null, "", url);
  };
  return [key, change] as const;
}
