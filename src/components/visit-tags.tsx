"use client";

// Mount once, in the root layout. On every page: keeps the first tagged page's UTM tags and click IDs for the browser
// tab and counts an ad visit once per tab (keepVisit, src/lib/visit-source.ts; no cookie, no consent needed), counts
// /start opening as an ad test step (markAdStep, src/lib/ad-visit-steps.ts), and keeps the ad tags in line with the
// page and the cookie choice (src/lib/ad-tags.ts: after consent only, never on a child's page). Renders nothing.
import { isParentPreviewPath } from "@/lib/parent-preview-path";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { browserReferralStorage, captureReferral } from "@/lib/referral-draft";
import { getAdTags } from "@/lib/ad-tags";
import { markAdStep } from "@/lib/ad-visit-steps";
import { trackHit, type SiteHitPost } from "@/lib/site-hits";
import { keepVisit, type AdVisitPost } from "@/lib/visit-source";

function send(visit: AdVisitPost) {
  // keepalive: the visitor may leave the page at once; the count must still arrive.
  fetch("/api/visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(visit), keepalive: true }).catch(() => {});
}

function sendHit(hit: SiteHitPost) {
  fetch("/api/hit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(hit), keepalive: true }).catch(() => {});
}

const newId = () => (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : null);

export function VisitTags() {
  const pathname = usePathname();

  useEffect(() => {
    if (isParentPreviewPath(pathname)) return;
    getAdTags()?.begin();
  }, [pathname]);

  useEffect(() => {
    if (isParentPreviewPath(pathname)) return;
    let store: Storage | null = null;
    try { store = window.sessionStorage; } catch { /* storage off */ }
    if (store) keepVisit({ search: window.location.search, store, newId, send });
    // The ad test's first step (src/lib/ad-visit-steps.ts): sent only from a tab with an ad visit ID, once per tab.
    if (pathname === "/start") {
      captureReferral(window.location.search, browserReferralStorage());
      markAdStep("start_open");
    }
    getAdTags()?.page();
  }, [pathname]);

  // The traffic counter (src/lib/site-hits.ts): one count per page view of a public page, no cookie, no consent.
  useEffect(() => {
    if (isParentPreviewPath(pathname)) return;
    let store: Storage | null = null;
    try { store = window.sessionStorage; } catch { /* storage off: nothing is counted */ }
    if (!store) return;
    trackHit({ pathname, search: window.location.search, referrer: document.referrer, ownHost: window.location.hostname, store, newId, send: sendHit });
  }, [pathname]);

  return null;
}
