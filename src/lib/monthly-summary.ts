// The monthly summary PDF (#562, spec #544, D-248): one page per child per calendar month in family time, made on
// request through the print engine seam (src/lib/workbook-render.ts) and never stored. Its data is the parent view's
// `readMonthlySummary` (src/lib/parent-view.ts): the level, the area bars, the workbooks mailed and days scanned in the
// month, the number of Maya calls and the next book's range. A section with no data does not appear. It holds no
// transcripts, photos, guesses, percent right, counts of wrong answers or comparison with other children, and it names
// the child, never she or her. "Skills mastered that month" waits for the skill map (#578, #575).
// It does not fit on one page when its last mark lies past the page's bottom margin, or the PDF has more than one page:
// then it fails, so a summary is never cut off silently.
// Pure TypeScript: no Next.js, network, database or clock.
import { gradeLabel, type AreaLabel, type Level } from "@/lib/assessment";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { formatCalendarDate } from "@/lib/family-time";
import type { MonthlySummaryView } from "@/lib/parent-view";
import { unreliableAreasText } from "@/lib/report-view";
import { IMAGE_SCALE, PRINT_PAGE, type PrintEngine } from "@/lib/workbook-render";
import type { TemplateFonts } from "@/lib/workbook-template-fixed";

export type SummaryRender =
  | { status: "rendered"; pdf: Uint8Array; png: Uint8Array }
  | { status: "failed"; reason: string };

/** The page's lowest point for content: everything, the footer too, ends 24 px above the page's bottom edge. The footer
 * sits at the bottom (margin-top: auto) and the end mark after it, so the mark passes this line only when content does. */
export const SUMMARY_BOTTOM = PRINT_PAGE.height - 24;

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "October 2026". */
export const monthLabel = (month: string) => formatCalendarDate(`${month}-01`, { month: "long", year: "numeric" });
/** "October 14, 2026". */
const day = (d: string) => formatCalendarDate(d, { month: "long", day: "numeric", year: "numeric" });
/** "October 14". */
const shortDay = (d: string) => formatCalendarDate(d, { month: "long", day: "numeric" });

const LABELS: Record<AreaLabel, string> = { ahead: "Ahead", "at-grade": "At grade", "building-up": "Building up" };
const labelOf = (level: Level, grade: number): AreaLabel => (level > grade ? "ahead" : level === grade ? "at-grade" : "building-up");
const tick = (l: number) => (l === 0 ? "K" : String(l));

/** The PDF's file name: the child's name in plain letters, the month and "summary". */
export function summaryFileName(view: Pick<MonthlySummaryView, "firstName" | "month">): string {
  const name = view.firstName.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "child";
  return `${name}-${view.month}-summary.pdf`;
}

const fontFace = (family: string, weights: string, woff2: Uint8Array) =>
  `@font-face{font-family:"${family}";font-weight:${weights};src:url(data:font/woff2;base64,${Buffer.from(woff2).toString("base64")}) format("woff2")}`;

const CSS = `
.s{box-sizing:border-box;height:100%;padding:48px 64px ${PRINT_PAGE.height - SUMMARY_BOTTOM}px;display:flex;flex-direction:column;font-family:"Summary Sans",Helvetica,Arial,sans-serif;color:#0c0c0e;overflow-wrap:anywhere}
.s>*{flex-shrink:0}
.kicker{margin:0;font:400 12px/1.3 "Summary Mono",ui-monospace,Menlo,monospace;letter-spacing:.06em;text-transform:uppercase;color:#44444c}
h1{margin:10px 0 0;font-size:34px;line-height:1.15;font-weight:500;letter-spacing:-.02em}
h1.is-long{font-size:28px}h1.is-longest{font-size:23px}
.lead{margin:8px 0 0;font-size:15px;line-height:1.45;color:#44444c}
.card{margin-top:14px;padding:14px 22px;border:1px solid #e4e4e7;border-radius:14px}
.label{margin:0 0 8px;font:400 11px/1.3 "Summary Mono",ui-monospace,Menlo,monospace;letter-spacing:.06em;text-transform:uppercase;color:#44444c}
.value{margin:0;font-size:24px;line-height:1.2;font-weight:300;letter-spacing:-.02em}
.sub{margin:6px 0 0;font-size:14px;line-height:1.45;color:#44444c}
.chip{display:inline-block;overflow-wrap:normal;margin-left:6px;padding:1px 8px;border-radius:999px;border:1px solid #e4e4e7;background:#f8f8f9;font:400 11px/1.5 "Summary Mono",ui-monospace,Menlo,monospace;color:#44444c;white-space:nowrap}
.note{margin:8px 0 0;font:400 11px/1.4 "Summary Mono",ui-monospace,Menlo,monospace;color:#44444c}
.is-at-grade{--c:#2fb37a;--t:#1d7f55}.is-building-up{--c:#ff6a3d;--t:#b43d12}.is-ahead{--c:#5b8def;--t:#2f5fc4}
.word{color:var(--t);font-weight:500}
.bars{margin-top:10px}
.row{display:grid;grid-template-columns:220px 1fr;gap:16px;align-items:center;margin-top:10px}
.axis{display:grid;grid-template-columns:220px 1fr;gap:16px}
.ticks{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));font:400 11px/1 "Summary Mono",ui-monospace,Menlo,monospace;color:#8a8a93;text-align:center}
.ticks .is-grade{color:#0c0c0e;font-weight:600}
.area b{display:block;font-size:14px;line-height:1.3;font-weight:500}
.area span{display:block;font-size:12px;line-height:1.4;color:var(--t)}
.track{position:relative;height:12px;border-radius:999px;background:#f5f4f2}
.fill{position:absolute;left:0;top:0;bottom:0;width:calc((var(--level) + .5) / var(--n) * 100%);border-radius:999px;background:var(--c)}
.is-early .fill{background:color-mix(in srgb,var(--c) 35%,#fff);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 55%,#fff)}
.line{position:absolute;top:-6px;bottom:-6px;left:calc((var(--grade) + .5) / var(--n) * 100%);width:2px;margin-left:-1px;background:#0c0c0e;border-radius:1px}
dl{margin:0;display:grid;grid-template-columns:220px 1fr;row-gap:8px;column-gap:16px}
dt{font-size:14px;line-height:1.4;color:#44444c}
dd{margin:0;font-size:14px;line-height:1.4}
.foot{margin-top:auto;padding:14px 0 4px;border-top:1px solid #e4e4e7;display:flex;justify-content:space-between;gap:16px;font-size:11px;line-height:1.4;color:#8a8a93}
.end{height:1px}
`;

function levelCard(v: MonthlySummaryView): string {
  if (!v.level) return "";
  const word = labelOf(v.level.working, v.schoolGrade);
  return `<section class="card is-${word}"><p class="label">Level</p>`
    + `<p class="value">Working at ${gradeLabel(v.level.working)} <span class="chip">${LABELS[word]}</span>${v.level.earlySign ? `<span class="chip">Early sign</span>` : ""}</p>`
    + `<p class="sub">In ${gradeLabel(v.schoolGrade)} at school. From the test on ${day(v.level.testedOn)}.</p>`
    + (v.level.earlySign ? `<p class="note">Early sign: the test had too few answers to be sure of this level.</p>` : "")
    + `</section>`;
}

function areasCard(v: MonthlySummaryView): string {
  // D-258 (#579): a test the report calls unreliable has no bars, only the sentence the Overview shows.
  if (v.level?.unreliable) return `<section class="card"><p class="label">Level by area</p><p class="sub">${escape(unreliableAreasText(v.firstName))}</p></section>`;
  if (!v.level || v.areas.length === 0) return "";
  const n = Math.max(8, v.schoolGrade, v.level.working, ...v.areas.map((a) => a.level)) + 1;
  const ticks = Array.from({ length: n }, (_, l) => `<span${l === v.schoolGrade ? ` class="is-grade"` : ""}>${tick(l)}</span>`).join("");
  const rows = v.areas.map((a) => `<div class="row is-${a.label}${a.earlySign ? " is-early" : ""}">`
    + `<div class="area"><b>${escape(a.name)}</b><span>${LABELS[a.label]}${a.earlySign ? " · Early sign" : ""}</span></div>`
    + `<div class="track"><span class="fill" style="--level:${a.level}"></span><span class="line"></span></div></div>`).join("");
  return `<section class="card"><p class="label">Level by area</p>`
    + `<p class="sub">From the same test. The line marks the school grade, ${gradeLabel(v.schoolGrade)}.</p>`
    + `<div class="bars" style="--n:${n};--grade:${v.schoolGrade}"><div class="axis"><span></span><div class="ticks">${ticks}</div></div>${rows}</div>`
    + (v.areas.some((a) => a.earlySign) ? `<p class="note">Early sign: too few answers in this area to be sure. The workbooks check it.</p>` : "")
    + `</section>`;
}

function monthCard(v: MonthlySummaryView): string {
  const rows: [string, string][] = [];
  if (v.mailed.length > 0) rows.push([v.mailed.length === 1 ? "Workbook mailed" : "Workbooks mailed", v.mailed.map((w) => `Workbook ${w.number}, on ${shortDay(w.shippedOn)}`).join("<br>")]);
  if (v.daysScanned > 0) rows.push(["Days of work scanned", String(v.daysScanned)]);
  if (v.mayaCalls > 0) rows.push(["Calls with Maya", String(v.mayaCalls)]);
  if (rows.length === 0) return "";
  return `<section class="card"><p class="label">${escape(monthLabel(v.month))}</p><dl>${rows.map(([k, val]) => `<dt>${k}</dt><dd>${val}</dd>`).join("")}</dl></section>`;
}

function nextCard(v: MonthlySummaryView): string {
  if (!v.next) return "";
  return `<section class="card"><p class="label">What comes next</p>`
    + `<p class="value">Next workbook: ${shortDay(v.next.earliest)} to ${day(v.next.latest)}</p>`
    + `<p class="sub">An estimate. We email you when it is on its way.</p></section>`;
}

/** A long name gets a smaller heading, so the longest a child may have (60 characters) leaves room for the rest. */
const nameSize = (name: string) => (name.length > 40 ? ` class="is-longest"` : name.length > 20 ? ` class="is-long"` : "");

/** The whole document: one Letter sheet, as the renderer frames a page. */
export function summaryDocument(v: MonthlySummaryView, fonts?: TemplateFonts): string {
  const name = escape(v.firstName);
  const month = escape(monthLabel(v.month));
  const sections = [levelCard(v), areasCard(v), monthCard(v), nextCard(v)].join("");
  const body = `<div class="s"><p class="kicker">Unica Learning · Monthly summary</p>`
    + `<h1${nameSize(v.firstName)}>${name}, ${month}</h1>`
    + `<p class="lead">Made on ${day(v.madeOn)}.</p>`
    + (sections || `<p class="lead">There is nothing to show for ${month} yet.</p>`)
    + `<div class="foot"><span>Unica Learning · unicalearning.com</span><span>Questions? ${SUPPORT_EMAIL}</span></div>`
    + `<div class="end" data-measure="summary-end"></div></div>`;
  const faces = fonts ? fontFace("Summary Sans", "300 700", fonts.sans) + fontFace("Summary Mono", "400 500", fonts.mono) : "";
  const frame = `@page{size:8.5in 11in;margin:0}html,body{margin:0;padding:0;background:#fff}`
    + `[data-sheet]{position:relative;box-sizing:border-box;background:#fff;width:${PRINT_PAGE.width}px;height:${PRINT_PAGE.height}px;overflow:hidden;break-after:page}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${name}, ${month}</title><style>${faces}${frame}</style><style>${CSS}</style></head>`
    + `<body><section data-sheet="0" data-measure="sheet">${body}</section></body></html>`;
}

/** Prints the summary: the PDF and the page image, or why it failed. An engine error throws. */
export async function renderMonthlySummary(o: { view: MonthlySummaryView; engine: PrintEngine; fonts?: TemplateFonts }): Promise<SummaryRender> {
  const out = await o.engine.print({ html: summaryDocument(o.view, o.fonts), sheets: 1, page: PRINT_PAGE, scale: IMAGE_SCALE });
  const end = out.measured.find((m) => m.sheet === 0 && m.name === "summary-end");
  if (!end || !end.visible) return { status: "failed", reason: "the summary's end mark is missing" };
  if (end.y + end.height > SUMMARY_BOTTOM) return { status: "failed", reason: "the summary does not fit on one page" };
  if (out.pdfPages !== 1 || out.images.length !== 1) return { status: "failed", reason: `the PDF has ${out.pdfPages} pages` };
  return { status: "rendered", pdf: out.pdf, png: out.images[0].png };
}

/** A parent may make this many summaries in SUMMARY_WINDOW_MS, counted across every function instance. */
export const SUMMARY_TRIES = 5;
export const SUMMARY_WINDOW_MS = 10 * 60_000;

/**
 * The count of a parent's summary tries that every function instance shares (public.monthly_summary_renders, through
 * src/lib/monthly-summary-store.ts). `claim` counts one try and answers whether it is within the limit; one that is not
 * is not counted. A count that cannot be made throws, so no render goes uncounted.
 */
export interface SummaryQuota {
  claim(parent: string, now: number): Promise<boolean>;
}

/** The shared count in memory, for tests: one object stands for the database that every instance asks. */
export function memorySummaryQuota({ perParent = SUMMARY_TRIES, windowMs = SUMMARY_WINDOW_MS } = {}): SummaryQuota {
  const tries = new Map<string, number[]>();
  return {
    async claim(parent, now) {
      const mine = (tries.get(parent) ?? []).filter((t) => now - t < windowMs);
      if (mine.length >= perParent) return false;
      tries.set(parent, [...mine, now]);
      return true;
    },
  };
}

/** One function instance's render slots: Chromium is heavy, so it runs at most `concurrent` summaries at once. */
export interface RenderSlots {
  /** Takes a slot until `release`; false when every slot is in use. */
  take(): boolean;
  release(): void;
}

export function renderSlots(concurrent = 2): RenderSlots {
  let running = 0;
  return {
    take() {
      if (running >= concurrent) return false;
      running++;
      return true;
    },
    release() {
      running = Math.max(0, running - 1);
    },
  };
}
