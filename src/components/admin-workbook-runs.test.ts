import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RunDetail } from "@/lib/admin-store";
import type { RunSolve } from "@/lib/workbook-job";
import { workedSteps, type QuestionPackage } from "@/lib/question-package";
import { solveReason, toSolve } from "@/lib/workbook-solve-check";
import { AdminWorkbookList, AdminWorkbookRun, ChildRunsTable } from "@/components/admin-workbook-runs";
import { buildQuestion } from "@/lib/workbook-generator-items";
import { memoryDraftStore } from "@/lib/workbook-draft-memory";
import { summarizeAiCalls } from "@/lib/workbook-ai";

// Navigation feedback is outside this server component's check and cost labels.
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }), usePathname: () => "/admin/workbooks", useSearchParams: () => new URLSearchParams() }));
// The frame reads the request (the test families switch, the sidebar counts); these tests check the page inside it.
vi.mock("@/components/admin-frame", () => ({ AdminFrame: ({ children }: { children: unknown }) => children }));

// FIXTURE_START: copied into a temporary local route for the browser check.
export function runDetail(state: "agreed" | "disagreed" | "failed" | "not-checked"): RunDetail {
  const at = "2026-11-01T20:00:00.000Z";
  const pkg: QuestionPackage = {
    id: "private-question-id", templateId: null,
    ref: { source: "workbook", workbookId: "draft", page: 1, question: 1 },
    skill: { standard: "3.4", skills: ["3.4-recall-addition-20"] }, level: 10, difficulty: 1,
    text: "Mia has 8 cups and finds 7 more. How many cups in all?",
    operation: { kind: "add", operands: [8, 7] },
    answer: { value: { type: "number", value: 15 }, accepted: [], unit: null },
    steps: workedSteps({ kind: "add", operands: [8, 7] }),
    item: { format: "write-number", scorable: true, parentChecked: false, error: null,
      regions: [{ id: "answer", kind: "box", label: null, answer: { type: "number", value: 15 } }],
      checks: [{ kind: "operation", region: "answer" }] },
    wrongAnswers: [{ value: { type: "number", value: 14 }, cause: "count", description: "Counts one too few.", step: null }],
    easierExample: null,
  };
  const verdict = state === "agreed" || state === "not-checked" ? { status: "agreed" as const }
    : { status: state, reason: state === "failed" ? "the solve check was late" : "the reader answered 16" };
  const question = {
    number: 1, slot: "1.7", part: "practice" as const, attempts: 1 as const, package: pkg,
    check: verdict.status === "agreed" ? { status: "checked" as const } : { status: "failed" as const, reason: solveReason(verdict) },
  };
  const request = toSolve(pkg);
  const solve: RunSolve = {
    questionId: pkg.id, model: "fake", verdict: verdict.status, ms: 0, usd: 0.12,
    log: { ...request, verdict, answers: JSON.stringify({ answers: [{ question: "question", box: "answer", answer: state === "disagreed" ? "16" : "15" }] }) },
  };
  return {
    run: { id: "run", createdAt: at, parentId: "parent", childId: "child", number: 1, status: "done", step: null,
      attempts: 1, maxAttempts: 2, donePages: 1, totalPages: 1, heartbeatAt: at, startedAt: at, finishedAt: at,
      error: null, errors: [], draftId: "draft", draftKey: "draft", resumes: 0, startedBy: { id: "admin", email: "admin@example.com" }, runner: "server" },
    child: null, oldFormat: null, images: {},
    draft: { workbook: { id: "draft", childId: "child", number: 1, levels: [10], profileBuild: null, model: "fake",
      pages: [{ number: 1, type: "practice", dayLabel: "Day 1", day: 1, pageOfDay: 1, qrToken: "private-qr", fit: { status: "fits" }, attempts: 1, questions: [question] }],
      counts: { pages: 1, questions: 1, checked: question.check.status === "checked" ? 1 : 0, failed: question.check.status === "failed" ? 1 : 0, notChecked: 0, failedPages: 0 } },
      rendering: null, problems: [], revision: 1 },
    audit: [{ id: 1, at, actor_email: null, action: "draft-stored", detail: { pages: 1, rendered: false, renderProblems: 1, ignored_private_key: "private-value" } }],
    solves: state === "not-checked" ? [] : [solve],
    aiCalls: summarizeAiCalls([]),
    approved: null, comments: [], editBatch: null, edits: [], versions: [], adminNames: {},
  };
}
// FIXTURE_END

function markup(detail: RunDetail) {
  return renderToStaticMarkup(createElement(AdminWorkbookRun, { email: "admin@example.com", detail, now: new Date("2026-11-01T20:00:00Z"), only: false, worker: null }));
}
const visible = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, "\"").replace(/\s+/g, " ");

// All four labels must agree in the actual component, through its public interface.
describe("admin workbook check labels (R379-1)", () => {
  it.each([
    ["agreed", "All questions agree", "Checking AI agreed"],
    ["disagreed", "1 question still disagrees", "Checking AI disagreed"],
    ["failed", "Checking AI couldn't check 1 question", "Checking AI couldn't check it"],
    ["not-checked", "Checking AI didn't run", "Checking AI didn't check it"],
  ] as const)("shows %s consistently in the facts, chip, table and question", (state, summary, row) => {
    const text = visible(markup(runDetail(state)));
    expect(text.split(summary)).toHaveLength(3);
    expect(text).toContain(row);
    if (state === "failed") {
      expect(text).toContain("The checking AI couldn't check these questions");
      expect(text).not.toMatch(/disagree|different answer/);
    }
    if (state === "not-checked") expect(text).not.toContain("All questions agree");
  });

  it.each(["text", "picture", "shown", "boxes"] as const)("does not use agreement on an earlier %s for the current question", (field) => {
    const d = runDetail("agreed");
    const printed = d.solves[0].log.questions[0];
    if (field === "boxes") printed.boxes[0].asks = "An earlier answer box.";
    else printed[field] = "An earlier question with another answer.";
    const text = visible(markup(d));
    expect(text).not.toContain("All questions agree");
    expect(text).not.toContain("Checking AI agreed");
    expect(text).toContain("Checking AI didn't check 1 question");
  });

  it("does not lose an unchecked question when another question agreed", () => {
    const d = runDetail("agreed");
    const page = d.draft!.workbook.pages[0];
    page.questions.push({ ...page.questions[0], number: 2, slot: "1.8", package: { ...page.questions[0].package!, id: "unchecked-question" } });
    const text = visible(markup(d));
    expect(text).not.toContain("All questions agree");
    expect(text).toContain("Checking AI didn't check 1 question");
  });

  it("includes a missing generated question in the saved draft's check summary", async () => {
    const d = runDetail("agreed");
    const w = d.draft!.workbook;
    const page = w.pages[0];
    const failed = buildQuestion(null, { id: "missing-question", workbookId: w.id, page: 1, question: 2, level: 10, skills: ["3.4-recall-addition-20"] });
    expect(failed.package).toBeNull();
    expect(failed.check.status).toBe("failed");
    page.questions.push({ ...page.questions[0], number: 2, slot: "1.8", package: failed.package, check: failed.check });
    w.counts.questions = 2;
    w.counts.failed = 1;
    w.id = "00000000-0000-4000-8000-0000000000a1";
    w.childId = "00000000-0000-4000-8000-0000000000c1";
    page.questions[0].package!.ref = { source: "workbook", workbookId: w.id, page: 1, question: 1 };
    page.qrToken = "token-000000000001";
    for (let number = 2; number <= 4; number++) w.pages.push({ ...page, number, qrToken: `token-${String(number).padStart(12, "0")}`, questions: [] });
    const store = memoryDraftStore({ [w.childId]: "00000000-0000-4000-8000-0000000000f1" });
    expect(await store.save(w)).toMatchObject({ status: "saved" });
    d.draft!.workbook = (await store.draft(w.id))!;
    const text = visible(markup(d));
    expect(text).not.toContain("All questions agree");
    expect(text.split("Checking AI didn't check 1 question")).toHaveLength(3);
    expect(text).toContain("The AI wrote nothing usable");
  });

  it.each(["failed", "disagreed"] as const)("keeps a current %s solve result when the math check passed", (state) => {
    const d = runDetail(state);
    d.draft!.workbook.pages[0].questions[0].check = { status: "checked" };
    const text = visible(markup(d));
    expect(text).toContain(state === "failed" ? "Checking AI couldn't check it" : "Checking AI disagreed");
    expect(text).toContain(state === "failed" ? "The checking AI couldn't check these questions" : "The checking AI got a different answer");
    expect(text).not.toContain("an earlier wording");
  });
});

describe("admin workbook cost and plain labels", () => {
  it("marks the cost as incomplete when any saved cost is unknown (R379-2)", () => {
    const d = runDetail("agreed");
    d.solves.push({ ...d.solves[0], usd: null });
    const text = visible(markup(d));
    expect(text).toContain("API cost: at least USD 0.12 (some unknown)");
    expect(text).not.toContain("API cost USD 0.12");
  });

  it("keeps region, slot, skill and audit identifiers in tooltips", () => {
    const d = runDetail("disagreed");
    const region = d.draft!.workbook.pages[0].questions[0].package!.item!.regions[0];
    region.id = "answer-7";
    d.solves[0].log.key[0].box = "answer-7";
    d.solves[0].log.questions[0].boxes[0].id = "answer-7";
    const html = markup(d);
    const text = visible(html);
    expect(text).toContain("Answer box");
    expect(text).toContain("Scripted checker");
    expect(text).not.toMatch(/answer-7|1\.7|3\.4-recall|ignored_private_key|private-value|0\.0 s/);
    expect(html).toContain('title="Region answer-7"');
    expect(html).toContain('title="Slot 1.7"');
    expect(text).toContain("1 problem drawing the pages");
  });
});

describe("admin workbook questions left out for room (#380)", () => {
  it("lists each question a page left out to fit, with its text, and marks the page to check", () => {
    const d = runDetail("agreed");
    const page = d.draft!.workbook.pages[0];
    page.leftOut = [{ slot: "1.8", part: "practice", text: "Gus has 6 plums. He finds 2 more. How many plums does Gus have now?", reason: "the content does not fit the page" }];
    page.omissions = [{ part: 0, kind: "practice", requested: 2, placed: 1, reason: "1 question left out: the page had no room for its text" }];
    const html = markup(d);
    const text = visible(html);
    expect(text).toContain('Left out to make room: Practice, "Gus has 6 plums. He finds 2 more. How many plums does Gus have now?"');
    expect(html).toContain('title="Slot 1.8: the content does not fit the page"');
    expect(text).not.toContain("Left out to make room: Practice, a question");
    expect(visible(markup(runDetail("agreed")))).not.toContain("Left out to make room");
  });
});

describe("admin workbook run progress", () => {
  const now = new Date("2026-11-01T20:00:00Z");
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString();
  const running = (o: Partial<RunDetail["run"]> = {}): RunDetail["run"] => ({ ...runDetail("agreed").run, status: "running", step: "write", donePages: 20, totalPages: 80, createdAt: ago(900), startedAt: ago(800), heartbeatAt: ago(5), finishedAt: null, draftId: null, runner: "mac", ...o });
  const activity = { pageTimes: Array.from({ length: 20 }, (_, i) => ago(12 + (19 - i) * 10)), lastWorkAt: ago(12) };
  const onRunPage = (run: RunDetail["run"], worker: Parameters<typeof AdminWorkbookRun>[0]["worker"] = null) =>
    visible(renderToStaticMarkup(createElement(AdminWorkbookRun, { email: "admin@example.com", detail: { ...runDetail("agreed"), run, draft: null, activity }, now, only: false, worker })));
  const onChildPage = (run: RunDetail["run"], worker?: Parameters<typeof AdminWorkbookRun>[0]["worker"]) =>
    visible(renderToStaticMarkup(createElement(ChildRunsTable, { runs: [{ run, counts: null, notRendered: null, oldFormat: false, activity }], now, worker })));

  it("shows the same pages, working line and time left on the run page and the child page", () => {
    for (const text of [onRunPage(running()), onChildPage(running())]) {
      expect(text).toContain("Writing and checking pages · 20 of 80 day pages");
      expect(text).toContain("Working. Last saved work 12 seconds ago.");
      expect(text).toContain("About 12 minutes left.");
    }
  });

  it("says a queued run waits for the workbook computer, and whether it is online", () => {
    const queued = running({ status: "queued", step: null, donePages: null, totalPages: null, heartbeatAt: null });
    const seen = { id: "w", seenAt: ago(5), startedAt: ago(100), build: null, runId: null, primaryAi: "subscription" as const };
    expect(onChildPage(queued, { ...seen, online: true })).toContain("Waiting for the workbook computer. It is online.");
    expect(onChildPage(queued, { ...seen, online: false })).toContain("Waiting for the workbook computer. It is offline, last seen");
    expect(onChildPage(queued)).toContain("Waiting for the workbook computer.");
    expect(onRunPage(queued)).toContain("The workbook computer has never run.");
  });

  it.each([null, "another-run"])("makes no start-time promise with worker run %s on any page", (runId) => {
    const run = running({ status: "queued", step: null, donePages: null, totalPages: null, heartbeatAt: null });
    const worker = { id: "w", seenAt: ago(5), startedAt: ago(100), build: null, runId, primaryAi: "subscription" as const, online: true };
    const list = visible(renderToStaticMarkup(createElement(AdminWorkbookList, { email: "admin@example.com", runs: [{ run, counts: null, notRendered: null, oldFormat: false }], now, worker, more: false, workbooks: [], childNames: new Map(), filter: "all" })));
    for (const text of [onRunPage(run, worker), onChildPage(run, worker), list]) {
      expect(text).not.toMatch(/starts in a few seconds|starts this run in a few seconds/);
      expect(text).toContain(runId ? "It is making another workbook" : "workbook computer. It is online");
      expect(text).toContain("Stop this run");
    }
  });

  it("shows the Stop button only while the run can be stopped, also when it has gone quiet", () => {
    const queued = running({ status: "queued", step: null, donePages: null, totalPages: null, heartbeatAt: null });
    for (const run of [running(), queued, running({ heartbeatAt: ago(1000) })]) {
      expect(onChildPage(run)).toContain("Stop this run");
      expect(onRunPage(run)).toContain("Stop this run");
    }
    for (const run of [running({ status: "done" }), running({ status: "failed", error: "x" }), running({ status: "stale" }), running({ status: "stale", stoppedBy: "admin@example.com" })]) {
      expect(onChildPage(run)).not.toContain("Stop this run");
      expect(onRunPage(run)).not.toContain("Stop this run");
    }
  });

  it("shows active run status without calling a quiet run stopped", () => {
    const quiet = running({ heartbeatAt: ago(400) });
    const queued = running({ status: "queued", heartbeatAt: null });
    for (const text of [onChildPage(quiet), onRunPage(quiet)]) {
      expect(text).toContain("No progress for 6 minutes");
      expect(text).not.toContain("This run stopped");
      expect(text).toContain("Stop this run");
    }
    for (const text of [onChildPage(queued), onRunPage(queued)]) expect(text).toContain("Waiting for the workbook computer");
    for (const text of [onChildPage(running({ status: "stale" })), onRunPage(running({ status: "stale" }))]) expect(text).toContain("Stopped");
  });

  it("shows who stopped a run and when, and it does not read as a failure", () => {
    const stopped = running({ status: "stale", stoppedBy: "savar@example.com", finishedAt: ago(60) });
    for (const text of [onChildPage(stopped), onRunPage(stopped)]) {
      expect(text).toMatch(/Stopped by savar@example\.com at .+ \(Pacific\)\./);
      expect(text).not.toMatch(/stopped without finishing|This run failed|no signal from the job/);
    }
    expect(onRunPage(stopped)).toContain("Prepare next workbook");
    const html = renderToStaticMarkup(createElement(AdminWorkbookRun, { email: "a", detail: { ...runDetail("agreed"), run: stopped, draft: null }, now, only: false, worker: null }));
    expect(html).not.toContain('role="alert"');
    expect(html).toContain("adm-chip is-muted");
  });

  it("names the stop rule from the code when a run stopped with no error", () => {
    const stale = running({ status: "stale", heartbeatAt: ago(400) });
    expect(onChildPage(stale)).toContain("no signal from the job for 6 minutes");
    expect(onRunPage(stale)).toContain("no signal from the job for 6 minutes");
  });
});
