"use client";

// PROTOTYPE (throwaway): floating bar that cycles the hero variants on `/` through `?variant=`. Never ships to
// production: page.tsx only mounts it when VERCEL_ENV is not "production".
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

export type VariantInfo = { key: string; label: string };

export function PrototypeSwitcher({ variants, current }: { variants: VariantInfo[]; current: string }) {
  const router = useRouter();
  const i = Math.max(0, variants.findIndex((v) => v.key === current));
  const go = useCallback(
    (step: number) => {
      const next = variants[(i + step + variants.length) % variants.length];
      router.replace(`/?variant=${next.key}`, { scroll: false });
    },
    [i, router, variants],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  return (
    <div className="hp-switch" role="toolbar" aria-label="Prototype hero variants">
      <button type="button" onClick={() => go(-1)} aria-label="Previous variant">←</button>
      <span>
        <b>{variants[i].key.toUpperCase()}</b> {variants[i].label}
        <small>{i + 1}/{variants.length}</small>
      </span>
      <button type="button" onClick={() => go(1)} aria-label="Next variant">→</button>
    </div>
  );
}
