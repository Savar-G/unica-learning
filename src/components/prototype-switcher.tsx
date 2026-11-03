"use client";

// PROTOTYPE ONLY (throwaway): floating bar that cycles ?variant= on the current route. Never renders in production.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

export function PrototypeSwitcher({ variants, names }: { variants: string[]; names: Record<string, string> }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const current = params.get("variant") ?? variants[0];
  const i = Math.max(0, variants.indexOf(current));

  const go = useCallback((step: number) => {
    const next = variants[(i + step + variants.length) % variants.length];
    const p = new URLSearchParams(params.toString());
    p.set("variant", next);
    router.replace(`${path}?${p.toString()}`, { scroll: false });
  }, [i, params, path, router, variants]);

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

  if (process.env.NODE_ENV === "production") return null;
  const btn: React.CSSProperties = { all: "unset", cursor: "pointer", padding: "6px 12px", fontSize: 18, lineHeight: 1 };
  return (
    <div style={{ position: "fixed", left: "50%", bottom: 20, transform: "translateX(-50%)", zIndex: 9999, display: "flex", alignItems: "center", gap: 4, padding: "6px 8px", borderRadius: 999, background: "#1d1d1f", color: "#fff", font: "500 13px/1 ui-monospace, monospace", boxShadow: "0 10px 30px rgba(0,0,0,.35)" }}>
      <button type="button" style={btn} onClick={() => go(-1)} aria-label="Previous variant">←</button>
      <span style={{ minWidth: 220, textAlign: "center" }}>{current} · {names[current] ?? ""} <span style={{ opacity: 0.5 }}>({i + 1}/{variants.length})</span></span>
      <button type="button" style={btn} onClick={() => go(1)} aria-label="Next variant">→</button>
    </div>
  );
}
