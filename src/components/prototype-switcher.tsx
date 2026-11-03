"use client";

// PROTOTYPE ONLY (site/compare-section-prototype). Floating bar that cycles ?variant= on the current route.
// Shows in dev and on Vercel previews; never in production. Delete with the prototype.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

const SHOW = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";

export function PrototypeSwitcher({ variants, current }: { variants: { key: string; name: string }[]; current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const i = Math.max(0, variants.findIndex((v) => v.key === current));

  const go = useCallback((step: number) => {
    const next = variants[(i + step + variants.length) % variants.length];
    const q = new URLSearchParams(params.toString());
    q.set("variant", next.key);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }, [i, params, pathname, router, variants]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable]"))) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (!SHOW) return null;
  const v = variants[i];
  return (
    <div style={bar} role="group" aria-label="Prototype variant">
      <button type="button" style={btn} onClick={() => go(-1)} aria-label="Previous variant">←</button>
      <span style={{ minWidth: 190, textAlign: "center" }}><b>{v.key}</b> ({v.name}) <span style={{ opacity: 0.55 }}>{i + 1}/{variants.length}</span></span>
      <button type="button" style={btn} onClick={() => go(1)} aria-label="Next variant">→</button>
    </div>
  );
}

const bar: React.CSSProperties = {
  position: "fixed", left: "50%", bottom: 96, transform: "translateX(-50%)", zIndex: 9999,
  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 999,
  background: "#111", color: "#fff", font: "500 13px/1 ui-monospace, monospace",
  boxShadow: "0 8px 30px rgba(0,0,0,.35), 0 0 0 2px #ff00aa",
};
const btn: React.CSSProperties = {
  appearance: "none", border: 0, borderRadius: 999, width: 30, height: 30, cursor: "pointer",
  background: "#333", color: "#fff", font: "600 15px/1 ui-monospace, monospace",
};
