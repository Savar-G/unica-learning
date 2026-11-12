import { describe, expect, it } from "vitest";
import {
  DONE_SHORT, buildBooks, checkLines, groupBooks, makingView, needsYouCount, plainTryReason, shortWhen, stageCounts,
  type ProductionInput, type ProductionRun,
} from "@/lib/admin-production";
import type { WorkbookSummary } from "@/lib/workbook-content";
import type { WorkbookRun } from "@/lib/workbook-job";

const now = new Date("2026-11-10T20:00:00.000Z"); // Nov 10, 12:00 pm Pacific
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
const days = (n: number) => ago(n * 24 * 60);

let serial = 0;
const id = () => `00000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`;

function run(o: Partial<WorkbookRun> & { childId: string; parentId: string }): ProductionRun {
  return {
    run: {
      id: id(), createdAt: ago(600), number: 1, status: "done", step: null, attempts: 1, maxAttempts: 2, donePages: null, totalPages: null,
      heartbeatAt: ago(500), startedAt: ago(590), finishedAt: ago(500), error: null, errors: [], draftId: null, draftKey: "k", resumes: 0,
      startedBy: { id: null, email: "admin@example.com" }, runner: "mac", stoppedBy: null, ...o,
    },
  };
}

function book(o: Partial<WorkbookSummary> & { childId: string; parentId: string }): WorkbookSummary {
  return { id: id(), number: 1, levels: [4], status: "approved", pdfPath: null, profileBuild: null, createdAt: days(3), approvedAt: days(3), printedAt: null, shippedAt: null, ...o };
}

const family = () => ({ parentId: id(), childId: id() });
const input = (o: Partial<ProductionInput>): ProductionInput => ({
  runs: [], workbooks: [], deliveries: [], cards: [], plans: [], tests: { show: false, isTest: () => false }, ...o,
});
const only = (o: Partial<ProductionInput>) => {
  const books = buildBooks(input(o), now);
  expect(books).toHaveLength(1);
  return books[0];
};

describe("the stage of each child's current book", () => {
  it("is No workbook yet for a saved card with no book, run or draft", () => {
    const f = family();
    const b = only({ cards: [{ ...f, savedAt: days(1) }], children: [{ id: f.childId, parentId: f.parentId, firstName: "Ethan" }], parents: [{ id: f.parentId, name: "Mei Lin" }] });
    expect(b).toMatchObject({ stage: "none", number: 1, child: "Ethan", family: "Mei Lin", cardSavedAt: days(1), at: days(1), tries: [] });
  });

  it("counts a started plan, and not a plan that never started or ended", () => {
    const a = family(), b = family(), c = family();
    const books = buildBooks(input({ plans: [{ ...a, kind: "free_month" }, { ...b, kind: "not_started" }, { ...c, kind: "ended" }] }), now);
    expect(books.map((x) => [x.childId, x.stage, x.planStarted])).toEqual([[a.childId, "none", true]]);
  });

  it("keeps a child whose only runs failed at No workbook yet, with the failed runs as plain earlier tries", () => {
    const f = family();
    const b = only({ runs: [
      run({ ...f, status: "failed", createdAt: ago(300), error: "The run cannot go on: the planned book (its pages, layouts or rooms) changed since it started (12fb23683921140e6f6cee107bbf then, 09da41e850d0b112c1c4e7f2e0c1 now). Start a new run." }),
      run({ ...f, status: "failed", createdAt: ago(200), error: "workbook run draft save: canceling statement due to statement timeout" }),
    ] });
    expect(b.stage).toBe("none");
    expect(b.tries.map((t) => t.text)).toEqual(["The database took too long to save the draft.", "The book plan changed after this run started. Start a new run."]);
    expect(JSON.stringify(b)).not.toMatch(/12fb2368|09da41e8/);
  });

  it("is Being made while a run is queued or running, with other runs for the book as earlier tries", () => {
    const f = family();
    const making = run({ ...f, status: "running", step: "write", donePages: 10, totalPages: 40, heartbeatAt: ago(1), startedAt: ago(30), finishedAt: null });
    const failed = run({ ...f, status: "failed", createdAt: ago(100), error: "Timed out after 30000 ms while waiting for the WS endpoint URL to appear in stdout!" });
    const b = only({ runs: [failed, making], cards: [{ ...f, savedAt: days(2) }] });
    expect(b).toMatchObject({ stage: "making", number: 1, at: ago(30) });
    expect(b.run?.run.id).toBe(making.run.id);
    expect(b.tries).toEqual([{ runId: failed.run.id, number: 1, at: ago(100), text: "The program that prints the pages did not start." }]);
  });

  it("is Being made for book 2 over a delivered book 1", () => {
    const f = family();
    const one = book({ ...f, status: "shipped", shippedAt: days(10) });
    const b = only({ workbooks: [one], deliveries: [{ workbookId: one.id, deliveredAt: days(5) }], runs: [run({ ...f, number: 2, status: "queued", finishedAt: null })] });
    expect(b).toMatchObject({ stage: "making", number: 2 });
  });

  it("is Ready to review for a finished draft not yet stored, and picks the newest of two drafts for the same book", () => {
    const f = family();
    const older = run({ ...f, createdAt: ago(900), finishedAt: ago(800), draftId: id() });
    const newer = run({ ...f, createdAt: ago(400), finishedAt: ago(300), draftId: id() });
    const b = only({ runs: [older, newer] });
    expect(b).toMatchObject({ stage: "review", number: 1, at: ago(300) });
    expect(b.run?.run.id).toBe(newer.run.id);
    expect(b.tries).toEqual([{ runId: older.run.id, number: 1, at: ago(900), text: "An earlier draft. A newer draft replaced it." }]);
  });

  it("does not review an old draft of a book that is already stored: it is an earlier try of that book", () => {
    const f = family();
    const stored = book({ ...f, status: "approved", approvedAt: days(1) });
    const approvedFrom = run({ ...f, draftId: stored.id, createdAt: days(2) });
    const replaced = run({ ...f, draftId: id(), createdAt: days(3) });
    const b = only({ workbooks: [stored], runs: [approvedFrom, replaced] });
    expect(b).toMatchObject({ stage: "approved", number: 1, at: days(1) });
    expect(b.tries.map((t) => t.runId)).toEqual([replaced.run.id]);
  });

  it.each([
    ["approved", null, "approved"],
    ["printed", null, "printed"],
    ["shipped", null, "shipped"],
    ["shipped", "receipt", "delivered"],
    ["draft", null, "review"],
  ] as const)("reads a stored %s book (%s) as %s", (status, receipt, stage) => {
    const f = family();
    const w = book({ ...f, status, printedAt: days(2), shippedAt: days(1) });
    const from = run({ ...f, draftId: w.id });
    const b = only({ workbooks: [w], runs: [from], deliveries: receipt ? [{ workbookId: w.id, deliveredAt: ago(60) }] : [] });
    expect(b.stage).toBe(stage);
    expect(b.workbook?.id).toBe(w.id);
    if (stage === "review") expect(b.draftRunId).toBe(from.run.id);
    if (stage === "delivered") expect(b.at).toBe(ago(60));
  });

  it("reads the highest stored book as the current one", () => {
    const f = family();
    const b = only({ workbooks: [book({ ...f, number: 1, status: "shipped" }), book({ ...f, number: 2, status: "printed" })] });
    expect(b).toMatchObject({ stage: "printed", number: 2 });
  });

  it("says who stopped a run and that a quiet run stopped", () => {
    const f = family();
    const b = only({ runs: [
      run({ ...f, status: "stale", createdAt: ago(50), stoppedBy: "cedric@example.com" }),
      run({ ...f, status: "stale", createdAt: ago(40) }),
      run({ ...f, status: "failed", createdAt: ago(30), error: "Stopped by hand: the demo video needed only the first pages" }),
    ] });
    expect(b.tries.map((t) => t.text)).toEqual([
      "Stopped by hand: the demo video needed only the first pages.",
      "It stopped: no signal from the job for 6 minutes.",
      "Stopped by cedric@example.com.",
    ]);
  });
});

describe("test families", () => {
  const real = family(), test = family();
  const data = { cards: [{ ...real, savedAt: days(1) }, { ...test, savedAt: days(1) }] };

  it("are left out while the switch is off", () => {
    const books = buildBooks(input({ ...data, tests: { show: false, isTest: (p) => p === test.parentId } }), now);
    expect(books.map((b) => b.childId)).toEqual([real.childId]);
  });

  it("show tagged while it is on, and stay out of every number", () => {
    const books = buildBooks(input({ ...data, tests: { show: true, isTest: (p) => p === test.parentId } }), now);
    expect(books.map((b) => [b.childId, b.test])).toEqual([[real.childId, false], [test.childId, true]]);
    expect(stageCounts(books).find((s) => s.stage === "none")).toMatchObject({ count: 1, needsYou: true });
    expect(needsYouCount(books)).toBe(1);
    const you = groupBooks(books, now)[0];
    expect(you.count).toBe(1);
    expect(you.books.map((b) => b.test)).toEqual([false, true]);
  });
});

describe("the groups", () => {
  it("put drafts to review before children with no workbook, the longest waiting first", () => {
    const a = family(), b = family(), c = family();
    const books = buildBooks(input({
      cards: [{ ...a, savedAt: days(1) }, { ...b, savedAt: days(3) }],
      runs: [run({ ...c, draftId: id(), finishedAt: ago(10) })],
    }), now);
    expect(groupBooks(books, now)[0].books.map((x) => x.childId)).toEqual([c.childId, b.childId, a.childId]);
  });

  it("show only one stage with ?stage=", () => {
    const a = family(), b = family();
    const books = buildBooks(input({ cards: [{ ...a, savedAt: days(1) }], runs: [run({ ...b, draftId: id() })] }), now);
    const groups = groupBooks(books, now, { stage: "none" });
    expect(groups.flatMap((g) => g.books.map((x) => x.stage))).toEqual(["none"]);
    expect(groups[0].count).toBe(2);
  });

  it("cut Done to the last 30 days when it is long, newest first, and say how many are older", () => {
    const workbooks: WorkbookSummary[] = [];
    const deliveries: { workbookId: string; deliveredAt: string }[] = [];
    for (let i = 0; i < DONE_SHORT + 2; i++) {
      const w = book({ ...family(), status: "shipped" });
      workbooks.push(w);
      deliveries.push({ workbookId: w.id, deliveredAt: days(i < 3 ? 40 + i : i) });
    }
    const books = buildBooks(input({ workbooks, deliveries }), now);
    const done = groupBooks(books, now).at(-1)!;
    expect(done.older).toBe(3);
    expect(done.books).toHaveLength(DONE_SHORT - 1);
    expect(done.books.map((b) => b.at)).toEqual([...done.books.map((b) => b.at)].sort().reverse());
    expect(groupBooks(books, now, { showOlder: true }).at(-1)!.books).toHaveLength(DONE_SHORT + 2);
  });

  it("keep a short Done list whole", () => {
    const w = book({ ...family(), status: "shipped" });
    const books = buildBooks(input({ workbooks: [w], deliveries: [{ workbookId: w.id, deliveredAt: days(90) }] }), now);
    expect(groupBooks(books, now).at(-1)).toMatchObject({ older: 0, count: 1 });
  });
});

describe("plain words", () => {
  it.each([
    ["The run cannot go on: the curriculum changed since it started (abc then, def now). Start a new run.", "The curriculum changed after this run started. Start a new run."],
    ["The run cannot go on: the site's code changed since it started (aaaaaaaaaaaaaaaa then, none now). Start a new run.", "The site changed after this run started. Start a new run."],
    ["The run's stored plan is of another shape. Start a new run.", "The workbook rules changed after this run started. Start a new run."],
    ["Protocol error: Target closed", "The program that prints the pages stopped."],
    ["", "It stopped before it finished."],
    ["Something odd 0123456789abcdef0123 happened:", "Something odd happened."],
  ])("says %j as %j", (error, text) => expect(plainTryReason(error)).toBe(text));

  it("lists a draft's checks, with the math check last", () => {
    expect(checkLines({ pages: 40, questions: 582, failed: 0, notChecked: 0, failedPages: 2 }, 0)).toEqual([
      { tone: "warn", text: "2 pages do not fit" },
      { tone: "ok", text: "Math check passed for all 582 questions" },
    ]);
    expect(checkLines({ pages: 40, questions: 100, failed: 1, notChecked: 62, failedPages: 0 }, 1).map((l) => l.text)).toEqual([
      "1 question needs fixing", "1 page is missing from the PDF", "62 to check by hand", "Math check passed for 37 of 100 questions",
    ]);
    expect(checkLines(null, null)).toEqual([]);
    expect(checkLines(null, null, true)[0].tone).toBe("warn");
  });

  it("shows dates in Pacific time, as today, yesterday or a date", () => {
    expect(shortWhen("2026-11-10T19:02:00.000Z", now)).toBe("Today, 11:02 am");
    expect(shortWhen("2026-11-10T00:10:00.000Z", now)).toBe("Yesterday, 4:10 pm");
    expect(shortWhen("2026-11-05T23:00:00.000Z", now)).toBe("Nov 5, 3:00 pm");
    expect(shortWhen("2025-12-30T20:00:00.000Z", now)).toBe("Dec 30, 2025");
    expect(shortWhen(null, now)).toBe("");
  });
});

describe("a book being made", () => {
  const base = run({ parentId: id(), childId: id(), status: "running", step: "write", donePages: 26, totalPages: 40, heartbeatAt: ago(0.2), startedAt: ago(20), finishedAt: null }).run;

  it("shows how far it is, and a time left only from the run's own pace", () => {
    const v = makingView(base, { pageTimes: [], lastWorkAt: ago(0.5) }, now);
    expect(v).toMatchObject({ waiting: false, percent: 65, timeLeft: null, warn: null });
    expect(v.line).toBe("Writing and checking pages · page 26 of 40");
    const pages = Array.from({ length: 10 }, (_, i) => ago(10 - i));
    expect(makingView(base, { pageTimes: pages, lastWorkAt: pages.at(-1)! }, now).timeLeft).toMatch(/^About \d+ minutes? left\.$/);
  });

  it("warns when it has gone quiet, and waits when it is queued", () => {
    expect(makingView({ ...base, heartbeatAt: ago(10) }, undefined, now).warn).toBe("No progress for 6 minutes. Open the run to take it up again.");
    expect(makingView({ ...base, status: "queued", step: null, donePages: null, totalPages: null }, undefined, now)).toMatchObject({ waiting: true, percent: null });
  });
});
