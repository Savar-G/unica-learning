import { pagePlan } from "@/lib/workbook-template";
import { expect, it } from "vitest";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { fakeWorkbookItems } from "@/lib/workbook-ai-fake";
import { bcStepProgressions } from "@/lib/workbook-curriculum";
import { generateWorkbook } from "@/lib/workbook-generator";
import { planWorkbook } from "@/lib/workbook-plan";
import { sampleChild, samplePlanInput } from "@/lib/workbook-sample-profiles";
import { keySolver } from "@/lib/workbook-solve-check";

it.each(["normal", "recover", "blocked"])("checks the U4 review floor before generation, scenario=%s", async scenario => {
  const curriculum = bcStepProgressions();
  const planned = planWorkbook(samplePlanInput(curriculum, sampleChild(curriculum, "U4")!, "first"));
  if (!planned.ok) throw new Error(planned.reason);
  const day = planned.plan.days[0];
  const review = day.pages.find(p => p.type === "remember-these")!;
  const part = review.parts.find(p => p.kind === "remember-these")!;
  let tokens = 0;
  let saves = 0;
  let roomAvailable = scenario === "normal";
  const result = await generateWorkbook({
    workbookId: "1c45456d-0e60-4581-ba41-accde66de3cf",
    childId: "00000000-0000-4000-8000-0000000000c1", number: 1, profileBuild: null,
    curriculum, plan: { ...planned.plan, days: [{ ...day, pages: [{ ...review, parts: [{ ...part, items: 8 }] }] }] },
    book: { child: "Noah" }, itemPolicy: "approved-v1",
  }, {
    ai: fakeAiClient({ answer: fakeWorkbookItems }), solver: keySolver(),
    // This control proves refill selection only. The full seeded CLI checks physical fit.
    fit: { fits: async page => {
      if (page.type !== "remember-these") return { ok: true };
      if (scenario === "blocked" && page.questions.length > 7) return { ok: false, problems: [{ question: null, reason: "Control: eight questions cannot fit" }] };
      if (page.questions.length <= 6) roomAvailable = true;
      return roomAvailable ? { ok: true } : { ok: false, problems: [{ question: null, reason: "Control: the initial questions exceed the room" }] };
    } },
    store: { save: async draft => { saves++; return { status: "saved", draftId: draft.id }; }, draft: async () => null },
    qrToken: () => `token-${String(++tokens).padStart(12, "0")}`,
  });
  if (scenario === "blocked") {
    expect(result.status).toBe("refused");
    if (result.status === "refused") expect(result.reason).toMatch(/capacity could not restore 8/);
    expect(saves).toBe(0);
    return;
  }
  expect(result.status, result.status === "refused" ? result.reason : "").toBe("stored");
  if (result.status !== "stored") return;
  const page = result.draft.pages.find(p => p.type === "remember-these")!;
  const questions = page.questions.filter(q => q.package && q.check.status !== "failed");
  expect(roomAvailable).toBe(true);
  expect(questions).toHaveLength(8);
  expect(result.draft.quality?.issues.filter(i => i.kind === "coverage")).toEqual([]);
});

it("a753ad71 restores p56 with a different refill task after the first replacement does not fit", async () => {
  const { taskIdentity } = await import("@/lib/workbook-task-identity");
  const curriculum = bcStepProgressions();
  const planned = planWorkbook(samplePlanInput(curriculum, sampleChild(curriculum, "U4")!, "first"));
  if (!planned.ok) throw new Error(planned.reason);
  let tokens = 0;
  let remaining: Set<string> | null = null;
  let rejected: string | null = null;
  const tried = new Set<string>();
  const rejectedPrints: string[] = [];
  const result = await generateWorkbook({
    workbookId: "a753ad71-8d11-4dcc-b35b-b8cf1f5d29c0",
    childId: "00000000-0000-4000-8000-0000000000c1", number: 1, profileBuild: null,
    curriculum, plan: planned.plan, book: { child: "Noah" }, itemPolicy: "approved-v1",
  }, {
    ai: fakeAiClient({ answer: fakeWorkbookItems }), solver: keySolver(),
    fit: { fits: async page => {
      if (page.number === 76 && page.questions.length >= 4) {
        const wide = page.questions.find(q => q.package.item?.regions.some(r => r.kind === "choice" && r.choices.length === 3));
        if (wide) return { ok: false, problems: [{ question: wide.number, reason: `question ${wide.number}'s text takes 7 lines on its card; a card has room for 3` }] };
      }
      if (page.number !== 56) return { ok: true };
      if (!remaining && page.questions.length <= 7) remaining = new Set(page.questions.map(q => taskIdentity(q.package)));
      if (!remaining) return { ok: false, problems: [{ question: null, reason: "Control: the initial page exceeds its room" }] };
      const added = page.questions.find(q => !remaining!.has(taskIdentity(q.package)));
      if (!added) return { ok: true };
      const key = taskIdentity(added.package);
      tried.add(key);
      rejected ??= key;
      const fits = !page.questions.some(q => taskIdentity(q.package) === rejected);
      // Track capacity retries here. The separate whole-book repair can probe the rejected task once more.
      if (!fits && page.questions.some(q => q.package.id.startsWith("budget:"))) rejectedPrints.push(JSON.stringify([page.questions.map(q => [taskIdentity(q.package), q.package.text, q.package.item]), page.content]));
      return fits ? { ok: true } : { ok: false, problems: [{ question: added.number, reason: "Control: this refill task does not fit" }] };
    } },
    store: { save: async draft => ({ status: "saved", draftId: draft.id }), draft: async () => null },
    qrToken: () => `token-${String(++tokens).padStart(12, "0")}`,
  });
  expect(result.status, result.status === "refused" ? result.reason : "").toBe("stored");
  if (result.status !== "stored") return;
  expect(tried.size).toBeGreaterThanOrEqual(2);
  const page = result.draft.pages.find(p => p.number === 56)!;
  const questions = page.questions.filter(q => q.package && q.check.status !== "failed");
  expect(questions).toHaveLength(8);
  const kept = new Set(questions.map(q => taskIdentity(q.package!)));
  expect(kept.size).toBe(8);
  // A complete row can require a replacement pair while a rejected refill stays excluded.
  expect([...remaining!].filter(key => !kept.has(key)).length).toBeLessThanOrEqual(2);
  expect(pagePlan({ ...page, questions: questions.flatMap(q => q.package ? [{ number: q.number, package: q.package }] : []) })?.incomplete).toEqual([]);
  expect(kept.has(rejected!)).toBe(false);
  expect(new Set(rejectedPrints).size).toBe(rejectedPrints.length);
  expect(result.draft.quality?.issues.filter(i => ["coverage", "repeat", "step"].includes(i.kind))).toEqual([]);
  expect(page.omissions?.filter(o => o.requested > o.placed && !o.time) ?? []).toEqual([]);
  const review = result.draft.pages.find(p => p.number === 76)!;
  expect(review.questions.length).toBeGreaterThanOrEqual(4);
  expect(review.omissions ?? []).toEqual([]);
}, 90_000);
