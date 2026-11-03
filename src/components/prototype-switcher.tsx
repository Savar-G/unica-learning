"use client";

// PROTOTYPE (throwaway). Floating bar that cycles ?variant= on the current route. Arrow keys also cycle, except when
// a text field has focus. The server page renders it only outside Vercel production.
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useCallback, type CSSProperties } from "react";

export function PrototypeSwitcher({ variants, current }: { variants: { key: string; name: string }[]; current: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const i = Math.max(0, variants.findIndex((v) => v.key === current));
  const go = useCallback((d: number) => {
    const next = variants[(i + d + variants.length) % variants.length];
    const q = new URLSearchParams(params.toString());
    q.set("variant", next.key);
    router.replace(`${path}?${q}`, { scroll: false });
  }, [i, variants, params, path, router]);

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

  const btn: CSSProperties = { all: "unset", cursor: "pointer", padding: "6px 12px", fontSize: 18, lineHeight: 1 };
  return (
    <div role="toolbar" aria-label="Prototype variants" style={{
      position: "fixed", left: "50%", bottom: 18, transform: "translateX(-50%)", zIndex: 9999, display: "flex", alignItems: "center",
      gap: 4, padding: "6px 8px", borderRadius: 999, background: "#111", color: "#fff", boxShadow: "0 8px 30px rgba(0,0,0,.35)",
      font: "500 13px/1 ui-monospace, monospace", whiteSpace: "nowrap",
    }}>
      <button type="button" style={btn} onClick={() => go(-1)} aria-label="Previous variant">←</button>
      <span style={{ minWidth: 0, maxWidth: "62vw", overflow: "hidden", textOverflow: "ellipsis", textAlign: "center" }}>{variants[i].key} · {variants[i].name} <span style={{ opacity: 0.5 }}>({i + 1}/{variants.length})</span></span>
      <button type="button" style={btn} onClick={() => go(1)} aria-label="Next variant">→</button>
    </div>
  );
}
