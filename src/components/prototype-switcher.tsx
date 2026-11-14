"use client";

// PROTOTYPE (throwaway, branch site/maya-side-prototype): floating bar that cycles ?variant= on the current page.
// Development only: renders nothing in a production build.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type ProtoVariant = { key: string; name: string };

export function PrototypeSwitcher({ variants, current, onChange, param = "variant", bottom = 20, label = "" }: { variants: ProtoVariant[]; current: string; onChange: (key: string) => void; param?: string; bottom?: number; label?: string }) {
  const i = Math.max(0, variants.findIndex((v) => v.key === current));
  const go = (d: number) => {
    const next = variants[(i + d + variants.length) % variants.length].key;
    const url = new URL(window.location.href);
    url.searchParams.set(param, next);
    window.history.replaceState(null, "", url);
    onChange(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (param !== "variant" ? !e.shiftKey : e.shiftKey) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const [host, setHost] = useState<HTMLElement | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- prototype: mount the bar on body after hydration
  useEffect(() => setHost(document.body), []);
  if (process.env.NODE_ENV === "production" || !host) return null;
  const v = variants[i];
  return createPortal(
    <div style={{ position: "fixed", left: "50%", bottom, transform: "translateX(-50%)", zIndex: 9999, display: "flex", alignItems: "center", gap: 6, padding: 6, borderRadius: 999, background: "#111", color: "#fff", font: "500 14px/1 system-ui, sans-serif", boxShadow: "0 10px 30px rgba(0,0,0,.35)" }}>
      <button type="button" onClick={() => go(-1)} aria-label="Previous variant" style={btn}>←</button>
      <span style={{ padding: "0 10px", whiteSpace: "nowrap" }}>{label}{v.key} ({v.name}) · {i + 1}/{variants.length}</span>
      <button type="button" onClick={() => go(1)} aria-label="Next variant" style={btn}>→</button>
    </div>,
    host,
  );
}

const btn: React.CSSProperties = { all: "unset", cursor: "pointer", width: 34, height: 34, borderRadius: 999, background: "#333", textAlign: "center", lineHeight: "34px" };
