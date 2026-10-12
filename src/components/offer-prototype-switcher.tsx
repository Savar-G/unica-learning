"use client";

// PROTOTYPE - throwaway. Floating bar that cycles ?variant= on the home page. Hidden in production builds.
import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { OFFER_VARIANTS, type OfferVariant } from "./offer-prototype";


export function PrototypeSwitcher({ current }: { current: OfferVariant }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const keys = Object.keys(OFFER_VARIANTS) as OfferVariant[];
  const go = useCallback((step: number) => {
    const next = keys[(keys.indexOf(current) + step + keys.length) % keys.length];
    const qs = new URLSearchParams(params.toString());
    qs.set("variant", next);
    router.replace(`${path}?${qs.toString()}${window.location.hash}`, { scroll: false });
  }, [current, keys, params, path, router]);

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
