"use client";

// Mount once, in the root layout. On every page: keeps the first tagged page's UTM tags and click IDs for the browser
// tab and counts an ad visit once per tab (keepVisit, src/lib/visit-source.ts; no cookie, no consent needed), and keeps
// the ad tags in line with the page and the cookie choice (src/lib/ad-tags.ts: after consent only, never on a child's
// page). Renders nothing.
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { getAdTags } from "@/lib/ad-tags";
import { keepVisit, type AdVisitPost } from "@/lib/visit-source";

function send(visit: AdVisitPost) {
  // keepalive: the visitor may leave the page at once; the count must still arrive.
  fetch("/api/visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(visit), keepalive: true }).catch(() => {});
}

const newId = () => (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : null);

export function VisitTags() {
  const pathname = usePathname();

  useEffect(() => {
    getAdTags()?.begin();
  }, []);

  useEffect(() => {
    let store: Storage | null = null;
    try { store = window.sessionStorage; } catch { /* storage off */ }
    if (store) keepVisit({ search: window.location.search, store, newId, send });
    getAdTags()?.page();
  }, [pathname]);

  return null;
}
