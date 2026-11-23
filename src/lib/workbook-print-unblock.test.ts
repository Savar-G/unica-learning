// #1248: a page prints when it has questions and renders. Whole-book content checks, room left on the page and a page
// below its practice floor are warnings; a failed question is left off its printed page. Overflow, a page that does not
// render, unmeasured boxes and a day page with no question still block. Fake AI, the key solver and fake fit checks:
// no browser, no network, no family data.
import { describe, expect, it } from "vitest";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { fakeWorkbookItems } from "@/lib/workbook-ai-fake";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { memoryDraftStore } from "@/lib/workbook-draft-memory";
import {
  generateWorkbook, prepareWorkbookCapacity, workbookCapacityPlan, type FitCheck, type FitResult, type GeneratedPage, type GeneratedWorkbook, type GenerateInput,
} from "@/lib/workbook-generator";
import { pageFitOf, pageWarnings, withoutFailedQuestions } from "@/lib/workbook-print-rules";
import { draftReviewProblems, type DraftRendering } from "@/lib/workbook-job";
import { planNextWorkbook } from "@/lib/workbook-placement";
import { reviewDays } from "@/lib/workbook-review-days";
import { firstCustomerProfile } from "@/lib/workbook-sample-profiles";
import { keySolver } from "@/lib/workbook-solve-check";
import { approvalProblems, approvedWorkbook, type DraftForApproval } from "@/lib/workbook-ship";

const BC = curriculumFor("bc")!;
const CHILD = "00000000-0000-4000-8000-000000000071", PARENT = "00000000-0000-4000-8000-000000000001";
const ROOM = { kind: "fullness" as const, question: null, reason: "The page leaves 180 px empty at the bottom; add a question, or spread the rows evenly." };
const OVERFLOW = { question: null, reason: "The content exceeds the page height." };

async function run(fits: FitCheck["fits"]) {
  const placed = planNextWorkbook({ curriculum: BC, grade: 4, profile: firstCustomerProfile(), workbooks: [], number: 1 });
  if (!placed.ok) throw new Error(placed.reason);
  const input: GenerateInput = { workbookId: "00000000-0000-4000-8000-0000000012a8", childId: CHILD, number: 1, profileBuild: null,
    plan: reviewDays(placed.plan, "1,6"), curriculum: BC, itemPolicy: "approved-v1", book: { child: "Ava" } };
  let token = 0;
  const result = await generateWorkbook(input, { ai: fakeAiClient({ answer: fakeWorkbookItems }), fit: { fits }, store: memoryDraftStore({ [CHILD]: PARENT }),
    qrToken: () => `unblock-token-${String(++token).padStart(8, "0")}`, solver: keySolver() });
  return result;
}

async function book(fits: FitCheck["fits"]): Promise<GeneratedWorkbook> {
  const result = await run(fits);
  if (result.status !== "stored") throw new Error(JSON.stringify(result));
  return result.draft;
}

/** The draft as approval reads it, with each page rendered and every question it prints boxed. */
function approval(draft: GeneratedWorkbook): DraftForApproval {
  const rendering: DraftRendering = { pdfPath: `${PARENT}/${draft.id}/workbook.pdf`, pages: draft.pages.map((p) => ({
    number: p.number, image: { path: `${PARENT}/${draft.id}/page-${p.number}.png`, width: 1275, height: 1650 },
    questions: p.questions.filter((q) => q.package).map((q) => ({ number: q.number, box: { x: 0, y: 100 * q.number, width: 500, height: 80 } })),
  })) };
  return { runId: "run", runDone: true, draftId: draft.id, revision: 1, oldFormat: false, draft, rendering, renderProblems: [] };
}

describe("pageFitOf", () => {
  const q = { number: 1, slot: "1.1", part: "practice", check: { status: "checked" }, attempts: 1, package: { id: "x" } } as unknown as GeneratedPage["questions"][number];
  it("keeps room left as a warning on a page with a question", () => {
    expect(pageFitOf({ ok: false, problems: [ROOM] }, [q])).toEqual({ status: "fits", warnings: [ROOM] });
  });
  it("still fails overflow, and room left on a page with no question", () => {
    expect(pageFitOf({ ok: false, problems: [ROOM, OVERFLOW] }, [q]).status).toBe("failed");
    expect(pageFitOf({ ok: false, problems: [ROOM] }, []).status).toBe("failed");
  });
});

describe("a generated book", () => {
  it("prints a page with a large empty bottom and keeps whole-book issues as warnings", { timeout: 120_000 }, async () => {
    const roomy = (page: Parameters<FitCheck["fits"]>[0]): FitResult => (page.type === "practice-2" && page.questions.length > 0 ? { ok: false, problems: [ROOM] } : { ok: true });
    const draft = await book(async (page) => roomy(page));
    const warned = draft.pages.filter((p) => p.fit.status === "fits" && p.fit.warnings?.length);
    expect(warned.length).toBeGreaterThan(0);
    expect(draft.pages.every((p) => p.fit.status !== "failed")).toBe(true);
    // Whole-book issues stay in the quality (not ready) and on the page's warnings, never in its fit. One issue is
    // added here so the check never passes on an empty list.
    const target = draft.pages.find((p) => p.questions.length > 0)!;
    const issue = { kind: "coverage" as const, page: target.number, reason: "required planned slot 2.1 (solve-it-two-ways) is missing or failed" };
    draft.quality = { ...draft.quality!, ready: false, issues: [...(draft.quality?.issues ?? []), issue] };
    expect(draft.quality.ready).toBe(false);
    expect(draft.quality.issues.length).toBeGreaterThan(0);
    for (const i of draft.quality.issues) expect(pageWarnings(draft.pages.find((p) => p.number === i.page)!, draft.quality)).toContain(`whole-book check: ${i.reason}`);
    expect(target.fit.status).not.toBe("failed");
    expect(draftReviewProblems(draft)).toEqual([]);
    expect(approvalProblems(approval(draft))).toEqual([]);
  });

  it("still refuses a book whose page overflows", { timeout: 120_000 }, async () => {
    const result = await run(async (page) => (page.type === "practice-2" && page.questions.length > 0 ? { ok: false, problems: [OVERFLOW] } : { ok: true }));
    expect(result).toMatchObject({ status: "refused", reason: expect.stringContaining("exceeds the page height") });
  });

  it("still fails a stored page that overflows, and approval refuses it", { timeout: 120_000 }, async () => {
    const draft = await book(async () => ({ ok: true }));
    const page = draft.pages.find((p) => p.questions.length > 0)!;
    page.fit = pageFitOf({ ok: false, problems: [ROOM, OVERFLOW] }, page.questions);
    expect(page.fit.status).toBe("failed");
    expect(draftReviewProblems(draft).some((p) => p.page === page.number && p.reason.includes("exceeds the page height"))).toBe(true);
    expect(approvalProblems(approval(draft))).toContain("1 page failed the fit check.");
  });
});

describe("whole-book issues stored by an older draft", () => {
  it("are warnings, not a failed fit", () => {
    const d = { number: 5, fit: { status: "failed", problems: [{ question: null, reason: "whole-book check: required planned slot 2.1 (solve-it-two-ways) is missing or failed" }, ROOM] },
      questions: [{ number: 1, check: { status: "checked" }, package: { id: "x" } }] } as unknown as GeneratedPage;
    const draft = { pages: [d] } as unknown as GeneratedWorkbook;
    expect(draftReviewProblems(draft)).toEqual([]);
    expect(pageWarnings(d, undefined)).toEqual(["whole-book check: required planned slot 2.1 (solve-it-two-ways) is missing or failed", `room: ${ROOM.reason}`]);
  });
});

describe("a failed question", () => {
  const pkg = (n: number) => ({ id: `q${n}`, text: `Question ${n}`, ref: { question: n } }) as unknown as NonNullable<GeneratedPage["questions"][number]["package"]>;
  const page: GeneratedPage = {
    number: 4, type: "practice", dayLabel: "Day 1", day: 1, pageOfDay: 2, qrToken: "failed-question-token", fit: { status: "fits" }, attempts: 1,
    questions: [1, 2, 3].map((n) => ({ number: n, slot: `1.${n}`, part: "practice", attempts: 1, package: pkg(n),
      check: n === 2 ? { status: "failed", reason: "the answer is wrong" } : { status: "checked" } })),
    content: { kind: "day", blocks: [{ slot: "worked-example", items: [], lines: ["2 + 2 = [4]"] },
      { slot: "on-your-own", items: [1, 2, 3], hints: ["a", "b", "c"], reviewFrom: 2, missing: [{ number: 9, reason: "x" }] }] } as unknown as GeneratedPage["content"],
  };

  it("is left off the printed page; the others are numbered again and listed for the admin", () => {
    const next = withoutFailedQuestions(page)!;
    expect(next.questions.map((q) => [q.number, q.package!.id, (q.package!.ref as { question?: number }).question])).toEqual([[1, "q1", 1], [2, "q3", 2]]);
    const blocks = next.content?.kind === "day" ? next.content.blocks : [];
    expect(blocks[0]).toMatchObject({ slot: "worked-example", lines: ["2 + 2 = [4]"] });
    expect(blocks[1]).toEqual({ slot: "on-your-own", items: [1, 2], hints: ["a", "c"], reviewFrom: 2 });
    expect(next.leftOut).toEqual([{ slot: "1.2", part: "practice", text: "Question 2", reason: "failed its check: the answer is wrong" }]);
  });

  it("renumbers an explanation to the question it names, and leaves it off with that question", () => {
    const explain = (n: number, about: number) => ({ number: n, slot: `2.${n}`, part: "practice", attempts: 1, check: { status: "checked" },
      package: { id: `e${n}`, text: `How did you work out question ${about}?`, ref: { question: n } },
      itemPlan: { item: { text: `How did you work out question ${about}?` }, numbers: [about] } }) as unknown as GeneratedPage["questions"][number];
    const withExplain = { ...page, questions: [...page.questions, explain(4, 3)],
      content: { kind: "day", blocks: [{ slot: "on-your-own", items: [1, 2, 3, 4] }] } } as unknown as GeneratedPage;
    const next = withoutFailedQuestions(withExplain)!;
    const e = next.questions.find((q) => q.package!.id === "e4")!;
    expect(e.number).toBe(3);
    expect(e.package!.text).toBe("How did you work out question 2?");
    expect((e as unknown as { itemPlan: { item: { text: string }; numbers: number[] } }).itemPlan).toMatchObject({ item: { text: "How did you work out question 2?" }, numbers: [2] });
    // An explanation of the failed question goes with it.
    const gone = withoutFailedQuestions({ ...withExplain, questions: [...page.questions, explain(4, 2)] } as GeneratedPage)!;
    expect(gone.questions.map((q) => q.package!.id)).toEqual(["q1", "q3"]);
    expect(gone.leftOut?.map((l) => l.slot)).toEqual(["1.2", "2.4"]);
  });

  it("keeps a page whose questions all failed as it is, so approval refuses it", () => {
    expect(withoutFailedQuestions({ ...page, questions: page.questions.map((q) => ({ ...q, check: { status: "failed", reason: "no" } })) })).toBeNull();
  });

  it("is not in the approved workbook, so scan marking never expects it", () => {
    const printed = withoutFailedQuestions(page)!;
    const draft = { id: "00000000-0000-4000-8000-0000000012a9", childId: CHILD, number: 1, levels: [10], profileBuild: null, model: "fake", pages: [printed],
      counts: { pages: 1, questions: 2, checked: 2, notChecked: 0, failed: 0, failedPages: 0 } } as GeneratedWorkbook;
    const d = approval(draft);
    expect(approvalProblems(d)).toEqual([]);
    expect(approvedWorkbook(d).pages[0].questions.map((q) => [q.number, q.package.id])).toEqual([[1, "q1"], [2, "q3"]]);
    // A question still on its page with a failed check, or without a box, is never stored as printed.
    const stale = approval({ ...draft, pages: [page] });
    expect(approvalProblems(stale)).toContain("1 question failed its check and is still on the page.");
    stale.rendering!.pages[0].questions = stale.rendering!.pages[0].questions.filter((q) => q.number !== 3);
    expect(approvedWorkbook(stale).pages[0].questions.map((q) => q.number)).toEqual([1]);
  });

  it("a day page with no question to print blocks approval", () => {
    const draft = { id: "00000000-0000-4000-8000-0000000012aa", childId: CHILD, number: 1, levels: [10], profileBuild: null, model: "fake",
      pages: [{ ...page, questions: [] }], counts: { pages: 1, questions: 0, checked: 0, notChecked: 0, failed: 0, failedPages: 0 } } as GeneratedWorkbook;
    expect(approvalProblems(approval(draft))).toContain("1 day page has no question to print.");
  });
});

describe("the capacity plan", () => {
  it("keeps a page below its practice floor that fits, with a warning", { timeout: 120_000 }, async () => {
    const placed = planNextWorkbook({ curriculum: BC, grade: 3, profile: null, number: 2, workbooks: [{ number: 1, levels: [10] }] });
    if (!placed.ok) throw new Error(placed.reason);
    const plan = workbookCapacityPlan(BC, placed.plan);
    const input: GenerateInput = { workbookId: "00000000-0000-4000-8000-0000000012ab", childId: CHILD, number: 2, profileBuild: null, curriculum: BC,
      itemPolicy: "approved-v1", book: { child: "Alex" }, plan: { ...plan, days: plan.days.filter((d) => d.day === 1 || d.day === 5) } };
    // A practice page holds only four questions: more overflow. Its floor is higher.
    const prepared = await prepareWorkbookCapacity(input, { fits: async (page) => (page.type === "practice" && page.questions.length > 4 ? { ok: false, problems: [OVERFLOW] } : { ok: true }) });
    const practice = prepared.days[0].pages.filter((p) => p.type === "practice");
    expect(practice.length).toBeGreaterThan(0);
    expect(practice.some((p) => (p.capacityOmissions ?? []).some((o) => o.reason.includes("planned practice questions")))).toBe(true);
  });
});
