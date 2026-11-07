"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { browserClient } from "@/lib/supabase-browser";
import type { HistoryPage } from "@/lib/scan-history";
import "./scan-pages.css";

export interface HistoryListing { pages: HistoryPage[]; counts: Record<string, number>; after: string | null }
export type HistoryState = "loading" | "ready" | "failed" | "unavailable";
type Scope = { parent: string; child: string; books?: readonly string[] };
type HistoryPosition = { index: number; after: string | null };

/** Both entry points use one loader. A changed identity remounts before any saved results can render. */
export function ScanHistory(props: Scope) {
  const pathname = usePathname();
  return <HistorySession key={JSON.stringify([props.parent, props.child, props.books, pathname])} {...props} />;
}
function HistorySession(props: Scope) {
  const [status, setStatus] = useState("all"), [position, setPosition] = useState<HistoryPosition>({ index: 0, after: null });
  if (props.books?.length === 0) return <ScanHistoryView state="ready" listing={{ pages: [], counts: {}, after: null }} />;
  return <HistoryRequest key={JSON.stringify([status, position])} {...props} status={status} position={position}
    onStatus={value => { setStatus(value); setPosition({ index: 0, after: null }); }} onPosition={setPosition} />;
}
function HistoryRequest({ parent, child, books, status, position, onStatus, onPosition }: Scope & {
  status: string; position: HistoryPosition; onStatus: (status: string) => void; onPosition: (position: HistoryPosition) => void;
}) {
  const { index, after } = position;
  const [listing, setListing] = useState<HistoryListing | null>(null), [state, setState] = useState<HistoryState>("loading");
  useEffect(() => {
    let live = true, running = false;
    const controller = new AbortController();
    const close = () => { live = false; controller.abort(); setListing(null); setState("unavailable"); };
    const auth = browserClient().auth.onAuthStateChange((_event, session) => { if (session?.user.id !== parent) close(); });
    const query = new URLSearchParams({ child, status }); if (after) query.set("after", after);
    // Workbooks supplies its shipped books newest first. Finish one bounded book cursor before moving to the next.
    if (books) query.set("workbook", books[index]);
    const load = async () => {
      if (!live || running) return;
      running = true;
      try {
        const response = await fetch(`/api/account/scans/history?${query}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        if (!live) return;
        if ([401, 403, 404].includes(response.status)) { close(); return; }
        if (!response.ok) throw new Error("unavailable");
        const data: HistoryListing = await response.json();
        if (!live) return;
        if (data.pages.some(page => page.childId !== child || (books && page.workbookId !== books[index]))) { close(); return; }
        setListing(data); setState("ready");
      } catch { if (live) { setListing(null); setState("failed"); } }
      finally { running = false; }
    };
    void load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 5000);
    window.addEventListener("pagehide", close);
    return () => { live = false; controller.abort(); clearInterval(timer); auth.data.subscription.unsubscribe(); window.removeEventListener("pagehide", close); };
  }, [parent, child, books, status, index, after]);
  const next = !listing ? null : listing.after ? { index, after: listing.after }
    : books && index + 1 < books.length ? { index: index + 1, after: null } : null;
  return <ScanHistoryView listing={listing} state={state} status={status} workbookScoped={Boolean(books)}
    hasMore={Boolean(next)} hasPrevious={index > 0 || after !== null} onStatus={onStatus}
    onNext={() => { if (next) onPosition(next); }} onFirst={() => onPosition({ index: 0, after: null })} />;
}

/** Static Admin samples render this same presentation without mounting the loader or its effects. */
export function ScanHistoryView({ listing = null, state, status = "all", workbookScoped = false, hasMore = Boolean(listing?.after), hasPrevious = false, onStatus, onNext, onFirst }: {
  listing?: HistoryListing | null; state: HistoryState; status?: string; workbookScoped?: boolean; hasMore?: boolean; hasPrevious?: boolean;
  onStatus?: (status: string) => void; onNext?: () => void; onFirst?: () => void;
}) {
  const pages = [...(listing?.pages ?? [])].sort((a, b) => b.book - a.book || a.pageNumber - b.pageNumber);
  const groups = new Map<string, HistoryPage[]>();
  for (const page of pages) { const key = `${page.workbookId}:${page.day}`; groups.set(key, [...(groups.get(key) ?? []), page]); }
  return <section className="scan-history" aria-label="Saved page history">
    <h2>Page history</h2>
    <p>Saved results stay here after a photo expires. A later scan does not change an earlier workbook plan.</p>
    {state !== "unavailable" && <label>Show <select value={status} onChange={event => onStatus?.(event.target.value)}>
      <option value="all">All pages</option><option value="review">Answers to check</option><option value="failed">Pages that could not be checked</option>
    </select></label>}
    {state === "unavailable" ? <p role="status">Page history is not available here.</p>
      : state === "failed" ? <p role="alert">We cannot load page history now. Refresh this page to try again.</p>
        : state === "loading" || !listing ? <p role="status">Loading page history...</p> : <>
          {pages.length === 0 ? <p role="status">No saved page results{workbookScoped ? " in this workbook" : ""}{status === "all" ? "" : " for this filter"}.</p>
            : <p role="status">Showing {pages.length} printed {pages.length === 1 ? "page" : "pages"}. {listing.counts.review ?? 0} {(listing.counts.review ?? 0) === 1 ? "needs" : "need"} a parent check.</p>}
          {[...groups.values()].map(group => <section key={`${group[0].workbookId}:${group[0].day}`} className="scan-group">
            <h3>Workbook {group[0].book} · {group[0].day}</h3>
            <ul>{group.map(page => <li key={page.id}>
              <b>Page {page.pageNumber}</b>: {page.status === "never-scanned" ? "No saved results" : page.label}
              {page.status === "ready" && <> · {page.right} of {page.counts.scored} right</>}
              {page.blank > 0 && <> · {page.blank} blank</>}
              {page.counts.unscored > 0 && <> · {page.counts.unscored} not scored</>}
              {page.photo && !page.photoAvailable && <span> · Photo no longer available</span>}
              {page.photo && <Link className="scan-link" prefetch={false} href={`/account/scan/results/${page.photo}`}
                aria-label={`${page.status === "review" ? "Continue checking" : "View page results"} for workbook ${page.book}, ${page.day}, page ${page.pageNumber}`}>
                {page.status === "review" ? "Continue checking" : "View page results"}</Link>}
            </li>)}</ul>
          </section>)}
          {hasMore && <button className="btn ghost" type="button" onClick={onNext}>More pages</button>}
          {hasPrevious && <button className="scan-link" type="button" onClick={onFirst}>First pages</button>}
        </>}
  </section>;
}
