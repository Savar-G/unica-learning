"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { browserClient } from "@/lib/supabase-browser";
import { historyLine, type HistoryPage } from "@/lib/scan-history";
import { pageList, type DayRow } from "@/lib/workbook-days";
import type { HistoryState } from "@/components/scan-history";
import "./workbook-days.css";

// The 10 days of one workbook (#1031): Week 1 and Week 2, one row per day. A row is a native <details>: tapping it shows the
// day's pages, each with its state in the Page history's own words and its "View page results" link. Native, so it works
// before any script and in the admin's static preview. The pages come from the same saved-results read the Page history used
// (/api/account/scans/history), loaded once for the book and refreshed while the page is visible.

const STATUS_WORDS = { scanned: "Scanned", to_scan: "To scan", next: "Next" } as const;
const REFRESH_MS = 15_000;
const MAX_REQUESTS = 6;

type Props = { parent: string; child: string; book: string; weeks: [DayRow[], DayRow[]]; openDay?: number | null; open: boolean };

/** The book's saved page results, all of them (25 a request, in printed order). The same checks the Page history made. */
function useBookPages(parent: string, child: string, book: string, open: boolean): { state: HistoryState; pages: HistoryPage[] } {
  const [loaded, setLoaded] = useState<{ state: HistoryState; pages: HistoryPage[] }>({ state: open ? "loading" : "unavailable", pages: [] });
  useEffect(() => {
    if (!open) return;
    let live = true, running = false;
    const controller = new AbortController();
    const close = () => { live = false; controller.abort(); setLoaded({ state: "unavailable", pages: [] }); };
    const auth = browserClient().auth.onAuthStateChange((_event, session) => { if (session?.user.id !== parent) close(); });
    const load = async () => {
      if (!live || running) return;
      running = true;
      try {
        const pages: HistoryPage[] = [];
        let after: string | null = null;
        for (let i = 0; i < MAX_REQUESTS; i++) {
          const query = new URLSearchParams({ child, status: "all", workbook: book }); if (after) query.set("after", after);
          const response = await fetch(`/api/account/scans/history?${query}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
          if (!live) return;
          if ([401, 403, 404].includes(response.status)) { close(); return; }
          if (!response.ok) throw new Error("unavailable");
          const data: { pages: HistoryPage[]; after: string | null } = await response.json();
          if (!live) return;
          if (data.pages.some(page => page.childId !== child || page.workbookId !== book)) { close(); return; }
          pages.push(...data.pages);
          after = data.after;
          if (!after) break;
        }
        setLoaded({ state: "ready", pages });
      } catch { if (live) setLoaded({ state: "failed", pages: [] }); }
      finally { running = false; }
    };
    void load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, REFRESH_MS);
    window.addEventListener("pagehide", close);
    return () => { live = false; controller.abort(); clearInterval(timer); auth.data.subscription.unsubscribe(); window.removeEventListener("pagehide", close); };
  }, [parent, child, book, open]);
  return loaded;
}

/** The day list with its own loader. `open` false: the family has no saved page results here (a closed gate). */
export function WorkbookDays(props: Props) {
  const { state, pages } = useBookPages(props.parent, props.child, props.book, props.open);
  return <WorkbookDaysView {...props} state={state} pages={pages} />;
}

/** Static samples render this same presentation without the loader. */
export function WorkbookDaysView({ book, weeks, openDay = null, state, pages }: { book: string; weeks: [DayRow[], DayRow[]]; openDay?: number | null; state: HistoryState; pages: HistoryPage[] }) {
  return <div id="page-history" className="wd">
    {weeks.map((rows, w) => rows.length > 0 && <section key={w} aria-labelledby={`wd-week-${w + 1}`}>
      <h3 className="wd-wk" id={`wd-week-${w + 1}`}>Week {w + 1}</h3>
      <div className="pa-card wd-card">
        {rows.map(row => <DayItem key={row.day} row={row} open={openDay === row.day} book={book} state={state} pages={pages} />)}
      </div>
    </section>)}
  </div>;
}

function DayItem({ row, open, book, state, pages }: { row: DayRow; open: boolean; book: string; state: HistoryState; pages: HistoryPage[] }) {
  const status = row.status ? STATUS_WORDS[row.status] : null;
  const circle = row.status === "scanned" ? "✓" : row.day;
  return <details className={`wd-row${row.status === "scanned" ? " is-ok" : ""}${row.today ? " is-now" : ""}`} id={`day-${row.day}`} open={open}>
    <summary>
      <span className="wd-c" aria-hidden="true">{circle}</span>
      <span className="wd-t"><b>Day {row.day} · {row.topic}</b><span>Pages {row.pages[0]}–{row.pages[1]}</span></span>
      {status && <span className={`wd-st is-${row.status}`}>{status}</span>}
      {row.today && <span className="pa-vh">Today</span>}
      <span className="wd-chev" aria-hidden="true">›</span>
    </summary>
    <DayPages row={row} book={book} state={state} pages={pages} />
  </details>;
}

function DayPages({ row, book, state, pages }: { row: DayRow; book: string; state: HistoryState; pages: HistoryPage[] }) {
  if (state === "unavailable") return <p className="wd-note" role="status">Page history is not available here.</p>;
  if (state === "failed") return <p className="wd-note" role="alert">We cannot load page history now. Refresh this page to try again.</p>;
  if (state === "loading") return <p className="wd-note" role="status">Loading page history...</p>;
  const byPage = new Map(pages.filter(p => p.workbookId === book).map(p => [p.pageNumber, p]));
  return <ul className="wd-pages" aria-label={`Day ${row.day} pages, ${pageList(row.requiredPages)}`}>
    {row.requiredPages.map(number => {
      const page = byPage.get(number);
      return <li key={number}>
        <span><b>Page {number}</b>{page ? <>: {historyLine(page)}{page.photo && !page.photoAvailable && <> · Photo no longer available</>}</> : <>: No photo yet</>}</span>
        {page?.photo && <Link className="wd-link" prefetch={false} href={`/account/scan/results/${page.photo}`}
          aria-label={`View page results for workbook ${page.book}, Day ${row.day}, page ${number}`}>View page results</Link>}
      </li>;
    })}
  </ul>;
}
