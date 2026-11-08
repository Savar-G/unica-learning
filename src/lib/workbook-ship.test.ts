import { describe, expect, it } from "vitest";
import type { GeneratedWorkbook } from "@/lib/workbook-generator";
import type { DraftRendering } from "@/lib/workbook-job";
import { sampleWorkbook } from "@/lib/workbook-sample";
import { approveDraft, markWorkbook, type DraftForApproval } from "@/lib/workbook-ship";
import { memoryShipStore } from "@/lib/workbook-ship-memory";
import { memoryWorkbookStore } from "@/lib/workbook-store-memory";

// Approve, print and ship (#314) through the module's interface with the in-memory stores: approval is refused while
// any check fails and stores nothing; the current revision is stored as an approved workbook; printed, then shipped,
// each with its time and actor in the audit log; the first shipped workbook says so; printed and shipped lock edits.

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const DRAFT = "55555555-5555-4555-8555-555555555555";
const SECOND = "66666666-6666-4666-8666-666666666666";
const RUN = "77777777-7777-4777-8777-777777777777";
const RUN2 = "88888888-8888-4888-8888-888888888888";
const ADMIN = { id: "99999999-9999-4999-8999-999999999999", email: "admin@example.com" };
const NOW = "2026-11-01T18:00:00.000Z";

/** A draft that passes every check, laid out and rendered, from the sample workbook. */
function sound(o: { draftId?: string; runId?: string; number?: number; prefix?: string } = {}): DraftForApproval {
  const id = o.draftId ?? DRAFT;
  const book = sampleWorkbook({ workbookId: id, childId: CHILD, parentId: PARENT, number: o.number ?? 1,
    qrTokens: [1, 2, 3].map((n) => `${o.prefix ?? "first"}-page-token-${n}`.padEnd(20, "x")) });
  const draft: GeneratedWorkbook = {
    id, childId: CHILD, number: book.number, levels: book.levels, profileBuild: null, model: "fake",
    pages: book.pages.map((p) => ({
      number: p.number, type: p.type as GeneratedWorkbook["pages"][number]["type"], dayLabel: p.dayLabel, day: null, pageOfDay: null,
      qrToken: p.qrToken, fit: { status: "fits" }, attempts: 1,
      content: { kind: "blank", id: `UL·W·P${p.number}`, level: 10 } as unknown as GeneratedWorkbook["pages"][number]["content"],
      questions: p.questions.map((q) => ({ number: q.number, slot: `1.${q.number}`, part: "practice", check: { status: "checked" }, attempts: 1, package: q.package })),
    })),
    counts: { pages: book.pages.length, questions: 0, checked: 0, notChecked: 0, failed: 0, failedPages: 0 },
  };
  const rendering: DraftRendering = {
    pdfPath: `${PARENT}/${id}/workbook.pdf`,
    pages: book.pages.map((p) => ({ number: p.number, image: p.image!, questions: p.questions.map((q) => ({ number: q.number, box: q.box })) })),
  };
  return { runId: o.runId ?? RUN, runDone: true, draftId: id, revision: 1, oldFormat: false, draft, rendering, renderProblems: [] };
}

function setup(...drafts: DraftForApproval[]) {
  const workbooks = memoryWorkbookStore({ children: [{ id: CHILD, parentId: PARENT }], now: () => new Date(NOW) });
  const ship = memoryShipStore({ workbooks, drafts: new Map(drafts.map((d) => [d.runId, d])), now: () => new Date(NOW) });
  return { workbooks, ship };
}

describe("approval", () => {
  it("stores the current revision as an approved workbook, with its pages, packages, images, boxes and PDF", async () => {
    const d = sound();
    const { workbooks, ship } = setup(d);
    expect(await approveDraft(ship, { runId: RUN, revision: 1, actor: ADMIN })).toEqual({ status: "approved", workbookId: DRAFT });
    const w = await workbooks.workbook(DRAFT);
    expect(w).toMatchObject({ status: "approved", approvedAt: NOW, number: 1, pdfPath: d.rendering!.pdfPath, childId: CHILD });
    expect(w!.pages.map((p) => p.qrToken)).toEqual(d.draft.pages.map((p) => p.qrToken));
    expect(w!.pages[1].questions[0].box).toEqual(d.rendering!.pages[1].questions[0].box);
    expect(w!.pages.flatMap((p) => p.questions).every((q) => q.content.status === "found")).toBe(true);
    expect(ship.audit).toEqual([{ at: NOW, workbookId: DRAFT, actor: ADMIN, action: "workbook-approved", detail: { revision: 1, number: 1, printedRevision: null } }]);
  });

  const failing: [string, (d: DraftForApproval) => void, RegExp][] = [
    ["a question failed its check", (d) => { d.draft.pages[1].questions[0].check = { status: "failed", reason: "the answer is wrong" }; }, /1 question failed its check/],
    ["a question has no package", (d) => { d.draft.pages[1].questions[0].package = null; }, /1 question failed/],
    ["a page failed the fit check", (d) => { d.draft.pages[1].fit = { status: "failed", problems: [{ question: 1, reason: "overflows" }] }; }, /1 page failed the fit check/],
    ["a page is not laid out with the real templates", (d) => { delete d.draft.pages[0].content; }, /not laid out with the real templates/],
    ["a page did not render", (d) => { d.rendering!.pages[1].proof = true; d.renderProblems = [{ page: 2, question: null, reason: "x" }]; }, /1 page is not in the PDF/],
    ["the draft has no PDF", (d) => { d.rendering = { pdfPath: null, pages: [] }; }, /no PDF/],
    ["a question has no measured box", (d) => { d.rendering!.pages[1].questions = []; }, /no place measured/],
    ["the run is not done", (d) => { d.runDone = false; }, /not done/],
    ["the draft is in an old format", (d) => { d.oldFormat = true; }, /old format/],
  ];
  for (const [name, change, reason] of failing) {
    it(`is refused while ${name}, and stores nothing`, async () => {
      const d = sound();
      change(d);
      const { workbooks, ship } = setup(d);
      const result = await approveDraft(ship, { runId: RUN, revision: 1, actor: ADMIN });
      expect(result.status).toBe("refused");
      expect(result.status === "refused" && result.reasons.join(" ")).toMatch(reason);
      expect(await workbooks.workbook(DRAFT)).toBeNull();
      expect(ship.audit).toEqual([]);
    });
  }

  it("takes only the current revision", async () => {
    const { workbooks, ship } = setup(sound());
    await ship.addRevision(RUN);
    const result = await approveDraft(ship, { runId: RUN, revision: 1, actor: ADMIN });
    expect(result.status === "refused" && result.reasons.join(" ")).toMatch(/not the current version \(2\)/);
    expect(await workbooks.workbook(DRAFT)).toBeNull();
    expect((await approveDraft(ship, { runId: RUN, revision: 2, actor: ADMIN })).status).toBe("approved");
  });

  it("is refused a second time, and for an unknown run", async () => {
    const { ship } = setup(sound());
    await approveDraft(ship, { runId: RUN, revision: 1, actor: ADMIN });
    const again = await approveDraft(ship, { runId: RUN, revision: 1, actor: ADMIN });
    expect(again).toEqual({ status: "refused", reasons: ["the workbook id is already used"] });
    expect(await approveDraft(ship, { runId: RUN2, revision: 1, actor: ADMIN })).toEqual({ status: "not-found" });
  });
});

describe("printed and shipped", () => {
  it("moves approved -> printed -> shipped with dates and the actor in the audit log", async () => {
    const { workbooks, ship } = setup(sound());
    await approveDraft(ship, { runId: RUN, revision: 1, actor: ADMIN });
    expect(await markWorkbook(ship, { workbookId: DRAFT, to: "printed", actor: ADMIN })).toEqual({ status: "marked", to: "printed", at: NOW, firstShipped: false });
    expect(await workbooks.workbook(DRAFT)).toMatchObject({ status: "printed", printedAt: NOW });
    expect(await markWorkbook(ship, { workbookId: DRAFT, to: "shipped", actor: ADMIN })).toEqual({ status: "marked", to: "shipped", at: NOW, firstShipped: true });
    expect(await workbooks.workbook(DRAFT)).toMatchObject({ status: "shipped", shippedAt: NOW });
    expect(ship.audit.map((a) => [a.action, a.actor.email, a.at])).toEqual([
      ["workbook-approved", ADMIN.email, NOW], ["workbook-printed", ADMIN.email, NOW], ["workbook-shipped", ADMIN.email, NOW],
    ]);
    expect(ship.audit[2].detail).toEqual({ number: 1, firstShipped: true });
  });

  it("refuses to skip or repeat a step", async () => {
    const { ship } = setup(sound());
    await approveDraft(ship, { runId: RUN, revision: 1, actor: ADMIN });
    expect(await markWorkbook(ship, { workbookId: DRAFT, to: "shipped", actor: ADMIN })).toEqual({ status: "refused", reason: "the workbook is approved, not printed" });
    await markWorkbook(ship, { workbookId: DRAFT, to: "printed", actor: ADMIN });
    expect(await markWorkbook(ship, { workbookId: DRAFT, to: "printed", actor: ADMIN })).toEqual({ status: "refused", reason: "the workbook is printed, not approved" });
    expect(await markWorkbook(ship, { workbookId: SECOND, to: "printed", actor: ADMIN })).toEqual({ status: "not-found" });
  });

  it("says firstShipped only for the child's first shipped workbook", async () => {
    const { ship } = setup(sound(), sound({ draftId: SECOND, runId: RUN2, number: 2, prefix: "second" }));
    for (const [run, id] of [[RUN, DRAFT], [RUN2, SECOND]]) {
      await approveDraft(ship, { runId: run, revision: 1, actor: ADMIN });
      await markWorkbook(ship, { workbookId: id, to: "printed", actor: ADMIN });
    }
    expect(await markWorkbook(ship, { workbookId: DRAFT, to: "shipped", actor: ADMIN })).toMatchObject({ firstShipped: true });
    expect(await markWorkbook(ship, { workbookId: SECOND, to: "shipped", actor: ADMIN })).toMatchObject({ firstShipped: false });
  });

  it("locks edits once printed, not before", async () => {
    const { ship } = setup(sound());
    await approveDraft(ship, { runId: RUN, revision: 1, actor: ADMIN });
    expect(await ship.addRevision(RUN)).toEqual({ status: "added", revision: 2 });
    const { ship: printed } = setup(sound());
    await approveDraft(printed, { runId: RUN, revision: 1, actor: ADMIN });
    await markWorkbook(printed, { workbookId: DRAFT, to: "printed", actor: ADMIN });
    expect(await printed.addRevision(RUN)).toEqual({ status: "refused", reason: `workbook ${DRAFT} is printed: it cannot change` });
    await markWorkbook(printed, { workbookId: DRAFT, to: "shipped", actor: ADMIN });
    expect((await printed.addRevision(RUN)).status).toBe("refused");
  });
});
