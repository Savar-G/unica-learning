"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { browserClient } from "@/lib/supabase-browser";

/** Authenticated bytes only. No URLs or image bytes are stored in persistent browser storage. */
export function ScanPrivateImages({ photo, numbers, cropsOnly = false }: { photo: string; numbers: number[]; cropsOnly?: boolean }) {
  const [images, setImages] = useState<Record<string, string>>({});
  const key = numbers.join(",");
  useEffect(() => {
    let live = true;
    const controller = new AbortController(), urls: string[] = [];
    const clear = () => { live = false; controller.abort(); for (const url of urls) URL.revokeObjectURL(url); setImages({}); };
    let viewer: string | null | undefined;
    const auth = browserClient().auth.onAuthStateChange((event, session) => {
      const current = session?.user.id ?? null;
      if (viewer === undefined) viewer = current;
      if (event === "SIGNED_OUT" || current === null || current !== viewer) clear();
    });
    window.addEventListener("pagehide", clear);
    const parts = [...(cropsOnly ? [] : ["straight"]), ...key.split(",").filter(Boolean).map((n) => `crop-${n}`)];
    void Promise.all(parts.map(async (part) => {
      try {
        const r = await fetch(`/api/account/scans/${photo}/preview/${part}`, { cache: "no-store", signal: controller.signal });
        if (!r.ok) return;
        const bytes = await r.blob(); if (!live) return;
        const url = URL.createObjectURL(bytes); urls.push(url); setImages((current) => ({ ...current, [part]: url }));
      } catch { /* An ended session or photo clears the private view. */ }
    }));
    return () => { clear(); auth.data.subscription.unsubscribe(); window.removeEventListener("pagehide", clear); };
  }, [photo, key, cropsOnly]);
  return <div className="scan-preview-layout">{Object.entries(images).map(([part, url]) => <figure key={part}>
    <Image unoptimized src={url} width={part === "straight" ? 600 : 160} height={part === "straight" ? 800 : 120} alt={part === "straight" ? "Whole straightened page" : `Answer ${part.slice(5)}`} style={{ maxWidth: "100%", height: "auto" }} />
    <figcaption>{part === "straight" ? "Whole page" : `Question ${part.slice(5)}`}</figcaption>
  </figure>)}</div>;
}
