"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { browserClient } from "@/lib/supabase-browser";
import type { HistoryPage } from "@/lib/scan-history";
interface Listing { pages: HistoryPage[]; counts: Record<string, number>; after: string | null }
/** History links reuse the S4/S5 review. Images and recognition are never requested here. */
export function ScanHistory({ parent, child }: { parent: string; child: string }) {
  const [listing, setListing] = useState<Listing | null>(null), [status, setStatus] = useState("all"), [after, setAfter] = useState<string | null>(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true; const controller = new AbortController();
    const close = () => { live = false; controller.abort(); setListing(null); };
    const auth = browserClient().auth.onAuthStateChange((_event, session) => { if (session?.user.id !== parent) close(); });
    const query = new URLSearchParams({ child, status }); if (after) query.set("after", after);
    let serial = 0;
    const load = () => { const request = ++serial; return fetch(`/api/account/scans/history?${query}`, { cache: "no-store", signal: controller.signal }).then(async (r) => {
      if (!r.ok) throw new Error("unavailable"); const data: Listing = await r.json(); if (live && request === serial) { setListing(data); setFailed(false); }
    }).catch(() => { if (live && request === serial) setFailed(true); }); };
    void load();
    const timer = setInterval(() => { if (live && document.visibilityState === "visible") void load(); }, 5000);
    window.addEventListener("pagehide", close);
    return () => { close(); clearInterval(timer); auth.data.subscription.unsubscribe(); window.removeEventListener("pagehide", close); };
  }, [parent, child, status, after]);
  const pages = [...(listing?.pages ?? [])].sort((a, b) => a.book - b.book || a.pageNumber - b.pageNumber);
  const groups = new Map<string, HistoryPage[]>();
  for (const p of pages) { const key = `${p.workbookId}:${p.day}`; groups.set(key, [...(groups.get(key) ?? []), p]); }
  return <section className="scan-history" aria-label="Saved page history">
    <h2>Page history</h2>
    <p>Saved results stay here after a photo expires. A later scan does not change an earlier workbook plan.</p>
    <label>Show <select value={status} onChange={(e) => { setStatus(e.target.value); setAfter(null); setListing(null); }}>
      <option value="all">All pages</option><option value="review">Answers to check</option><option value="failed">Pages that could not be checked</option>
    </select></label>
    {failed ? <p role="alert">We cannot load page history now. Refresh this page to try again.</p> : !listing ? <p role="status">Loading page history...</p> : <>
      <p role="status">Showing {pages.length} printed {pages.length === 1 ? "page" : "pages"}. {listing.counts.review ?? 0} need a parent check.</p>
      {[...groups.values()].map((group) => <section key={`${group[0].workbookId}:${group[0].day}`} className="scan-group">
        <h3>Workbook {group[0].book} · {group[0].day}</h3>
        <ul>{group.map((p) => <li key={p.id}>
          <b>Page {p.pageNumber}</b>: {p.label}
          {p.status === "ready" && <> · {p.right} of {p.counts.scored} right</>}
          {p.blank > 0 && <> · {p.blank} blank</>}
          {p.counts.unscored > 0 && <> · {p.counts.unscored} not scored</>}
          {p.photo && !p.photoAvailable && <span> · Photo no longer available</span>}
          {p.photo && <Link className="scan-link" href={`/account/scan/results/${p.photo}`}>{p.status === "review" ? "Continue checking" : "View page results"}</Link>}
        </li>)}</ul>
      </section>)}
      {listing.after && <button className="btn ghost" type="button" onClick={() => { setAfter(listing.after); setListing(null); }}>More pages</button>}
      {after && <button className="scan-link" type="button" onClick={() => { setAfter(null); setListing(null); }}>First pages</button>}
    </>}
  </section>;
}
