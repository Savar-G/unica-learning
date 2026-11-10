// The Production page's stage model (D-313, D-315): for each child on the workbook journey, the one CURRENT book and
// its stage, and that child's earlier tries. Pure: no network, database or clock (pass `now`). The page and the
// sidebar's Production badge both use buildBooks, so the badge counts exactly what the page shows as "Needs you".
//
// Who is on the journey: every child with a stored workbook, a workbook run, a saved card (card_setups.card_saved_at)
// or a plan that started (child_plan_states: free month, paying, payment failed, paused or ending).
//
// The rules, in order (the first that holds is the child's stage):
// 1. making (Being made): the child has an active run (queued or running; the database keeps one per child). Its book
//    number is the run's. A running run with no signal for 6 minutes is still this stage, with a warning.
// 2. review (Ready to review): a finished run's draft for a book after the child's highest stored book, not yet stored
//    as a workbook (approval stores it with the draft's id). With two such drafts, the highest book number, then the
//    newest run, is the current one; the other is an earlier try. A draft in an old format is still this stage: its
//    run page says to prepare a new one.
// 3. The child's highest stored book (ties: the newest), by its status: draft (taken back for changes) is review;
//    approved, printed and shipped are their own stages; shipped with a delivery receipt is delivered.
// 4. none (No workbook yet): no stored book, no active run, no draft waiting. Book 1.
//
// Earlier tries: the child's other runs for the current book number or a later one: failed or stopped runs, and
// finished drafts that were replaced (not stored). Runs of earlier books are that book's history and are not listed.
//
// Numbers: test and team families never count in a stage count or a group count, nor in Done's 30-day cut and its
// "Show older" count. They show (tagged) only while the "Show test families" switch is on; while it is off, they are
// left out.
import type { DraftCounts } from "@/lib/admin-store";
import type { WorkbookSummary } from "@/lib/workbook-content";
import { STALE_SECONDS, type WorkbookRun } from "@/lib/workbook-job";
import { plainRunError, runProgress, type RunActivity } from "@/lib/workbook-run-progress";

export const STAGES = ["none", "making", "review", "approved", "printed", "shipped", "delivered"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_TEXT: Record<Stage, string> = {
  none: "No workbook yet", making: "Being made", review: "Ready to review", approved: "Approved", printed: "Printed", shipped: "Shipped", delivered: "Delivered",
};

/** The stages that wait for the team. */
export const NEEDS_YOU: readonly Stage[] = ["none", "review"];

export const isStage = (s: unknown): s is Stage => typeof s === "string" && (STAGES as readonly string[]).includes(s);

/** A plan that started: the child is a customer or was one a moment ago. */
export const STARTED_PLAN_KINDS = ["free_month", "paying", "payment_failed", "paused", "ending"] as const;

/** A run with what the list knows about its draft. The badge passes only the run. */
export interface ProductionRun {
  run: WorkbookRun;
  counts?: DraftCounts | null;
  notRendered?: number | null;
  oldFormat?: boolean;
  activity?: RunActivity;
}

export interface ProductionInput {
  runs: readonly ProductionRun[];
  workbooks: readonly WorkbookSummary[];
  /** Delivery receipts: the workbook and when it was delivered. */
  deliveries: readonly { workbookId: string; deliveredAt: string }[];
  /** Saved cards only (card_saved_at set). */
  cards: readonly { childId: string; parentId: string; savedAt: string }[];
  /** Plan states of any kind; only a started plan counts. */
  plans: readonly { childId: string; parentId: string; kind: string; updatedAt?: string | null }[];
  /** Names, when the page knows them. */
  children?: readonly { id: string; parentId: string; firstName: string }[];
  parents?: readonly { id: string; name: string }[];
  tests: { show: boolean; isTest: (parentId: string) => boolean };
}

export interface EarlierTry {
  runId: string;
  number: number;
  at: string;
  text: string;
}

export interface Book {
  childId: string;
  parentId: string;
  child: string;
  family: string | null;
  test: boolean;
  number: number;
  stage: Stage;
  /** When the book reached its stage (the time the groups sort by), or null when not known. */
  at: string | null;
  /** The current run: the active run (making), or the run whose draft waits (review). */
  run?: ProductionRun;
  /** The stored workbook, from approved on (and a stored book back in draft). */
  workbook?: WorkbookSummary;
  /** For a stored book back in draft: the run that made it, for its review page. */
  draftRunId?: string | null;
  deliveredAt?: string | null;
  cardSavedAt?: string | null;
  planStarted?: boolean;
  tries: EarlierTry[];
}

const active = (r: WorkbookRun) => r.status === "queued" || r.status === "running";
const newest = <T,>(xs: T[], at: (x: T) => string) => [...xs].sort((a, b) => at(b).localeCompare(at(a)))[0];
const earliest = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).sort()[0] ?? null;

/** Why a try stopped, in short plain words: never a hash, a fingerprint or a stack. */
export function plainTryReason(error: string | null | undefined): string {
  const text = (error ?? "").trim();
  if (!text) return "It stopped before it finished.";
  const changed = /changed since it started/i.test(text) ? /cannot go on: (.+?) changed since it started/i.exec(text)?.[1] ?? "" : null;
  if (changed !== null) {
    const what = /planned book/i.test(changed) ? "The book plan" : /curriculum/i.test(changed) ? "The curriculum" : /site'?s code/i.test(changed) ? "The site"
      : /solve check/i.test(changed) ? "The checking model" : /AI model/i.test(changed) ? "The AI model" : "Something the run was made from";
    return `${what} changed after this run started. Start a new run.`;
  }
  const rules: [RegExp, string][] = [
    [/^Stopped by hand/i, firstLine(text)],
    [/no stored plan/i, "This run has no saved plan, so it cannot go on. Start a new run."],
    [/stored plan is of another shape|call event policy/i, "The workbook rules changed after this run started. Start a new run."],
    [/no workbook curriculum/i, "There is no workbook curriculum for this child yet."],
    [/profile from the assessment/i, "The child's profile could not be built from the test."],
    [/plan could not be made/i, "The two-week plan could not be made."],
    [/AI is off|solve check is off/i, "The AI was not available."],
    [/child is not known/i, "The child was not found."],
    [/statement timeout|canceling statement/i, "The database took too long to save the draft."],
    [/draft was not stored/i, "The draft could not be saved."],
  ];
  const hit = rules.find(([rule]) => rule.test(text));
  return sentence(scrub(hit ? hit[1] : plainRunError(text)));
}

const firstLine = (s: string) => s.split("\n")[0].trim();
/** Leaves out anything that looks like a hash or an id: long runs of hex, and brackets that hold them. */
const scrub = (s: string) => s.replace(/\s*\([^)]*\b[0-9a-f]{8,}\b[^)]*\)/gi, "").replace(/\b[0-9a-f]{12,}\b/gi, "").replace(/\s{2,}/g, " ").trim();
const sentence = (s: string) => {
  const t = s.replace(/[.:\s]+$/, "");
  return t ? `${t.charAt(0).toUpperCase()}${t.slice(1)}.` : "It stopped before it finished.";
};

/** What an earlier try says, in plain words. */
function tryText(r: ProductionRun, stored: Set<string>, now: Date): string {
  const run = r.run;
  if (run.status === "done") return run.draftId && stored.has(run.draftId) ? "This draft was stored." : "An earlier draft. A newer draft replaced it.";
  if (run.stoppedBy) return `Stopped by ${run.stoppedBy}.`;
  if (run.status === "stale" || (active(run) && now.getTime() - Date.parse(run.heartbeatAt ?? run.createdAt) > STALE_SECONDS * 1000)) {
    return run.error ? plainTryReason(run.error) : `It stopped: no signal from the job for ${STALE_SECONDS / 60} minutes.`;
  }
  return plainTryReason(run.error);
}

/** One current book per child on the journey. Test families are left out unless the switch is on. */
export function buildBooks(input: ProductionInput, now: Date): Book[] {
  const keep = (parentId: string) => input.tests.show || !input.tests.isTest(parentId);
  const runs = input.runs.filter((r) => keep(r.run.parentId));
  const books = input.workbooks.filter((w) => keep(w.parentId));
  const cards = input.cards.filter((c) => keep(c.parentId));
  const plans = input.plans.filter((p) => keep(p.parentId) && (STARTED_PLAN_KINDS as readonly string[]).includes(p.kind));
  const stored = new Set(books.map((w) => w.id));
  const delivered = new Map(input.deliveries.map((d) => [d.workbookId, d.deliveredAt]));
  const childName = new Map((input.children ?? []).map((c) => [c.id, c]));
  const parentName = new Map((input.parents ?? []).map((p) => [p.id, p.name]));

  const parentOf = new Map<string, string>();
  for (const r of runs) parentOf.set(r.run.childId, r.run.parentId);
  for (const w of books) parentOf.set(w.childId, w.parentId);
  for (const c of cards) if (!parentOf.has(c.childId)) parentOf.set(c.childId, c.parentId);
  for (const p of plans) if (!parentOf.has(p.childId)) parentOf.set(p.childId, p.parentId);

  const out: Book[] = [];
  for (const [childId, parentId] of parentOf) {
    const mine = runs.filter((r) => r.run.childId === childId);
    const myBooks = books.filter((w) => w.childId === childId);
    const top = [...myBooks].sort((a, b) => b.number - a.number || b.createdAt.localeCompare(a.createdAt))[0];
    const topNumber = top?.number ?? 0;
    const card = earliest(cards.filter((c) => c.childId === childId).map((c) => c.savedAt));
    const planStarted = plans.some((p) => p.childId === childId);
    const base = {
      childId, parentId, child: childName.get(childId)?.firstName ?? "Unknown child", family: parentName.get(parentId) ?? null,
      test: input.tests.isTest(parentId), cardSavedAt: card, planStarted,
    };

    let book: Omit<Book, "tries">;
    const making = newest(mine.filter((r) => active(r.run)), (r) => r.run.createdAt);
    const waiting = mine.filter((r) => r.run.status === "done" && r.run.number > topNumber && !(r.run.draftId && stored.has(r.run.draftId)));
    const draft = [...waiting].sort((a, b) => b.run.number - a.run.number || b.run.createdAt.localeCompare(a.run.createdAt))[0];
    if (making) book = { ...base, number: making.run.number, stage: "making", at: making.run.startedAt ?? making.run.createdAt, run: making };
    else if (draft) book = { ...base, number: draft.run.number, stage: "review", at: draft.run.finishedAt ?? draft.run.createdAt, run: draft };
    else if (top) {
      const at = delivered.get(top.id) ?? null;
      const stage: Stage = top.status === "draft" ? "review" : top.status === "shipped" && at ? "delivered" : top.status;
      const time = { review: top.createdAt, approved: top.approvedAt, printed: top.printedAt, shipped: top.shippedAt, delivered: at } as Record<Stage, string | null>;
      book = {
        ...base, number: top.number, stage, at: time[stage] ?? top.createdAt, workbook: top, deliveredAt: at,
        draftRunId: stage === "review" ? newest(mine.filter((r) => r.run.draftId === top.id), (r) => r.run.createdAt)?.run.id ?? null : undefined,
      };
    } else {
      const last = newest(mine, (r) => r.run.createdAt);
      book = { ...base, number: 1, stage: "none", at: card ?? last?.run.createdAt ?? null };
    }

    const current = book.run?.run.id;
    const fromBook = book.workbook?.id;
    const tries = mine
      .filter((r) => r.run.id !== current && r.run.number >= book.number && !active(r.run) && !(fromBook && r.run.draftId === fromBook))
      .sort((a, b) => b.run.createdAt.localeCompare(a.run.createdAt))
      .map((r): EarlierTry => ({ runId: r.run.id, number: r.run.number, at: r.run.createdAt, text: tryText(r, stored, now) }));
    out.push({ ...book, tries });
  }
  return out;
}

/** The stage tracker: each stage's count of real families' books, its first faces, and whether it needs the team. */
export function stageCounts(books: readonly Book[]): { stage: Stage; count: number; faces: Book[]; needsYou: boolean }[] {
  return STAGES.map((stage) => {
    const here = books.filter((b) => b.stage === stage && !b.test);
    return { stage, count: here.length, faces: here.slice(0, 4), needsYou: NEEDS_YOU.includes(stage) && here.length > 0 };
  });
}

/** How many real books wait for the team: the sidebar badge. */
export const needsYouCount = (books: readonly Book[]) => books.filter((b) => !b.test && NEEDS_YOU.includes(b.stage)).length;

export const GROUPS = [
  { key: "you", title: "Needs you", hint: "Review a draft or start a first workbook.", stages: ["review", "none"] },
  { key: "making", title: "In progress", hint: "The AI is writing these now.", stages: ["making"] },
  { key: "out", title: "Out the door", hint: "Approved, printed or on the way.", stages: ["approved", "printed", "shipped"] },
  { key: "done", title: "Done", hint: "At the family's home.", stages: ["delivered"] },
] as const satisfies readonly { key: string; title: string; hint: string; stages: readonly Stage[] }[];

/** Done shows the last 30 days when it holds more than this many books. */
export const DONE_SHORT = 12;
export const DONE_DAYS = 30;

export interface Group {
  key: (typeof GROUPS)[number]["key"];
  title: string;
  hint: string;
  /** Real families' books in the group (test families never count). */
  count: number;
  books: Book[];
  /** Done only: real families' books older than 30 days that are not shown (test books never count). */
  older: number;
  /** Done only: test families' books older than 30 days that are not shown (the switch is on). */
  olderTests: number;
}

/**
 * The page's groups, in order. Needs you: drafts to review first, then children with no workbook, the longest
 * waiting first. The other groups: the newest first. Test families after the real ones. `stage`: show only this
 * stage. `showOlder`: Done shows every delivered book.
 */
export function groupBooks(books: readonly Book[], now: Date, o: { stage?: Stage | null; showOlder?: boolean } = {}): Group[] {
  const time = (b: Book) => b.at ?? "";
  return GROUPS.map((g) => {
    const stages: readonly Stage[] = g.stages;
    const all = books.filter((b) => stages.includes(b.stage));
    const order = (a: Book, b: Book) => Number(a.test) - Number(b.test) || stages.indexOf(a.stage) - stages.indexOf(b.stage)
      || (g.key === "you" ? time(a).localeCompare(time(b)) : time(b).localeCompare(time(a))) || a.child.localeCompare(b.child);
    let shown = all.filter((b) => !o.stage || b.stage === o.stage).sort(order);
    let older = 0;
    let olderTests = 0;
    // Only real books decide whether Done is cut, and only they are counted: showing test families never hides a
    // real book that shows with the switch off.
    const real = all.filter((b) => !b.test).length;
    if (g.key === "done" && !o.showOlder && real > DONE_SHORT) {
      const since = now.getTime() - DONE_DAYS * 86_400_000;
      const hidden = shown.filter((b) => !(b.at && Date.parse(b.at) >= since));
      older = hidden.filter((b) => !b.test).length;
      olderTests = hidden.length - older;
      shown = shown.filter((b) => !hidden.includes(b));
    }
    return { key: g.key, title: g.title, hint: g.hint, count: real, books: shown, older, olderTests };
  });
}

/** A draft's check results as plain lines: what needs the team (warn) and what passed (ok). */
export function checkLines(counts: DraftCounts | null | undefined, notRendered: number | null | undefined, oldFormat = false): { tone: "ok" | "warn"; text: string }[] {
  if (oldFormat) return [{ tone: "warn", text: "Made in an old format. Prepare a new draft to review it." }];
  if (!counts) return [];
  const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const out: { tone: "ok" | "warn"; text: string }[] = [];
  if (counts.failed > 0) out.push({ tone: "warn", text: `${pl(counts.failed, "question needs", "questions need")} fixing` });
  if (counts.failedPages > 0) out.push({ tone: "warn", text: `${pl(counts.failedPages, "page does", "pages do")} not fit` });
  if (notRendered) out.push({ tone: "warn", text: `${pl(notRendered, "page is", "pages are")} missing from the PDF` });
  if (counts.notChecked > 0) out.push({ tone: "warn", text: `${counts.notChecked} to check by hand` });
  const checked = counts.questions - counts.failed - counts.notChecked;
  out.push({ tone: "ok", text: checked === counts.questions ? `Math check passed for all ${counts.questions} questions` : `Math check passed for ${checked} of ${counts.questions} questions` });
  return out;
}

/** A book being made: how far, since when, and the time left only when the run's own pace gives one. */
export function makingView(run: WorkbookRun, activity: RunActivity | undefined, now: Date): {
  waiting: boolean; percent: number | null; line: string; timeLeft: string | null; warn: string | null;
} {
  if (run.status === "queued") {
    const quiet = now.getTime() - Date.parse(run.createdAt) > STALE_SECONDS * 1000 && run.runner !== "mac";
    return { waiting: true, percent: null, line: "Waiting to start.", timeLeft: null, warn: quiet ? `No progress for ${STALE_SECONDS / 60} minutes.` : null };
  }
  const v = runProgress(run, activity, now);
  const percent = v.pages ? Math.min(100, Math.floor((v.pages.done / v.pages.total) * 100)) : null;
  const stale = now.getTime() - Date.parse(run.heartbeatAt ?? run.createdAt) > STALE_SECONDS * 1000;
  return {
    waiting: false, percent,
    line: [v.step, v.pages && `page ${v.pages.done} of ${v.pages.total}`, v.tries].filter(Boolean).join(" · "),
    timeLeft: /^About /.test(v.timeLeft) ? v.timeLeft : null,
    warn: stale ? `No progress for ${STALE_SECONDS / 60} minutes. Open the run to take it up again.` : v.signal.warn ? "No new work saved for a while. Open the run to see why." : null,
  };
}

const ZONE = "America/Vancouver";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** "Today, 4:10 pm", "Yesterday, 4:10 pm", "Nov 5, 4:10 pm" or "Nov 5, 2025", Pacific time; "" for none. */
export function shortWhen(iso: string | null | undefined, now: Date): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit" }).format(d).replace(" AM", " am").replace(" PM", " pm");
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (dayKey(d) === dayKey(now)) return `Today, ${time}`;
  if (dayKey(d) === dayKey(yesterday)) return `Yesterday, ${time}`;
  const sameYear = dayKey(d).slice(0, 4) === dayKey(now).slice(0, 4);
  const date = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(d);
  return sameYear ? `${date}, ${time}` : date;
}

/** A soft colour for a family's avatar, the same on every visit. Test families are grey. */
const FACES = ["#ffd9b8", "#c9dbff", "#c8f0dc", "#ffe9a8", "#f3d1ff", "#d6f5ff", "#ffd2c4", "#e4ddff"];
export function faceColor(parentId: string, test: boolean): string {
  if (test) return "#eeeeee";
  let h = 0;
  for (const c of parentId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FACES[h % FACES.length];
}
