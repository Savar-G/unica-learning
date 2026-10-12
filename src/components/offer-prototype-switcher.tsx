"use client";

// PROTOTYPE - throwaway. Floating bar that cycles ?variant= on the home page. Hidden in production builds.
import { useCallback, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { OFFER_VARIANTS, type OfferVariant } from "./offer-prototype";


export function PrototypeSwitcher({ current }: { current: OfferVariant }) {
  const path = usePathname();
  const params = useSearchParams();
  const keys = Object.keys(OFFER_VARIANTS) as OfferVariant[];
  const go = useCallback((step: number) => {
    const next = keys[(keys.indexOf(current) + step + keys.length) % keys.length];
    const qs = new URLSearchParams(params.toString());
    qs.set("variant", next);
    // Full reload, not router.replace: the page's scroll script (Motion/Knot) moves DOM nodes outside React,
    // so an in-place swap throws "removeChild: not a child" and blanks the section. Keep the scroll position.
    sessionStorage.setItem("op-scroll", String(window.scrollY));
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full reload is the point (see above)
    window.location.assign(`${path}?${qs.toString()}`);
  }, [current, keys, params, path]);

  useEffect(() => {
    const y = sessionStorage.getItem("op-scroll");
    if (y === null) return;
    sessionStorage.removeItem("op-scroll");
    window.scrollTo({ top: Number(y), behavior: "instant" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (process.env.NODE_ENV === "production") return null;
  return (
    <div className="op-switch" role="toolbar" aria-label="Prototype variants">
      <button type="button" onClick={() => go(-1)} aria-label="Previous variant">←</button>
      <span>{current} - {OFFER_VARIANTS[current]}</span>
      <button type="button" onClick={() => go(1)} aria-label="Next variant">→</button>
    </div>
  );
}
