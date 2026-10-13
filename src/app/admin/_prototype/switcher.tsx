"use client";

// PROTOTYPE ONLY. Floating bar that cycles ?variant= keys with the arrows or the ← → keys. Rendered only where the
// prototype shows (local dev and preview deploys), never in production.
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function PrototypeSwitcher({ variants, current }: { variants: { key: string; name: string }[]; current: string }) {
  const router = useRouter();
  const i = Math.max(0, variants.findIndex((v) => v.key === current));
  const go = (step: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set("variant", variants[(i + step + variants.length) % variants.length].key);
    url.searchParams.delete("family");
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const v = variants[i];
  return (
    <div className="pa-proto-bar" role="toolbar" aria-label="Prototype variants">
      <button type="button" onClick={() => go(-1)} aria-label="Previous variant">←</button>
      <span><b>{v.key}</b> {v.name} <i>{i + 1}/{variants.length}</i></span>
      <button type="button" onClick={() => go(1)} aria-label="Next variant">→</button>
    </div>
  );
}
