import { expect, it } from "vitest";
import { curriculumFor } from "./workbook-curriculum";
import { firstCustomerProfile } from "./workbook-sample-profiles";
import { planNextWorkbook } from "./workbook-placement";
import { generateWorkbook, prepareWorkbookCapacity, workbookCapacityPlan, type FitCheck, type GenerateInput } from "./workbook-generator";
import { buildPlannedItem } from "./workbook-item-plan";
import { buildStepItem, stepAiItem, stepTemplateItem } from "./workbook-step-items";
import { storyKind, taskIdentity } from "./workbook-task-identity";
import { fakeAiClient } from "./ai-client-fake";
import { fakeWorkbookItems } from "./workbook-ai-fake";
import { keySolver } from "./workbook-solve-check";
import { workbookQuality } from "./workbook-quality";
import { generatedDayTime } from "./workbook-feedback-check";
import { reviewMasteryStep } from "./workbook-review-level";
import { interestEligible, interestShareProblems } from "./workbook-personal-items";

// A bounded counting seam isolates contract selection. Real seeded samples prove the physical fit separately.
const capacityFit: FitCheck = { fits: async page => page.questions.length <= (page.type === "warm-up" ? 12 : 10)
  ? { ok: true } : { ok: false, problems: [{ question: null, reason: "test page capacity" }] } };

it("recalculates whole Extra blocks after capacity fill without dropping the weekly-time work", async () => {
  const profile = firstCustomerProfile();
  profile.parent = { goal: "get_ahead", feeling: "okay", weeklyTime: "1_to_2h" };
  const input = customInput(["5.2", "5.7", "5.15", "5.19"]);
  const placed = planNextWorkbook({ curriculum: input.curriculum, grade: 8, profile, workbooks: [], number: 1,
    instructions: { version: 1, startLevel: "U19", teachMore: ["6.4", "6.13"], teachLess: [], addReview: ["5.2", "5.7", "5.15", "5.19"], difficulty: null } });
  if (!placed.ok) throw new Error(placed.reason);
  const plan = { ...placed.plan, days: placed.plan.days.filter(d => [1, 4, 5, 9].includes(d.day)) };
  const fit: FitCheck = { fits: async page => page.questions.length <= 14 ? { ok: true }
    : { ok: false, problems: [{ question: null, reason: "test page capacity" }] } };
  const prepared = await prepareWorkbookCapacity({ ...input, plan, schoolGrade: 8 }, fit);
  const frozen = structuredClone(prepared);
  let token = 0;
  const generated = await generateWorkbook({ ...input, plan: prepared, schoolGrade: 8 }, { fit,
    ai: fakeAiClient({ answer: fakeWorkbookItems }), solver: keySolver(), qrToken: () => `token-${String(++token).padStart(12, "0")}`,
    store: { save: async draft => ({ status: "saved", draftId: draft.id }), draft: async () => null } });
  if (generated.status !== "stored") throw new Error(generated.status);
  for (const day of plan.days) {
    const pages = generated.draft.pages.filter(p => p.day === day.day && !(p.content?.kind === "day" && p.content.extraPractice));
    const time = generatedDayTime(pages);
    expect(time.requiredMinutes, `Day ${day.day}`).toBeLessThanOrEqual(day.time!.target + 1e-9);
    const challenge = pages.flatMap(p => p.questions.filter(q => q.place === "challenge"));
    expect(challenge, `Day ${day.day}`).toHaveLength(3);
    for (const page of pages) if (page.content?.kind === "day") {
      expect(page.content.requiredTimeTarget).toBe(day.time!.target);
      for (const block of page.content.blocks.filter(b => b.extra)) expect(block.items.every(n => page.questions.some(q => q.number === n))).toBe(true);
    }
  }
  expect(generated.draft.quality?.issues.filter(i => i.kind === "time")).toEqual([]);
  expect(prepared).toEqual(frozen);
});

it("keeps different story kinds on a personalized U19 review page", async () => {
  const input = customInput(["5.2", "5.7", "5.15"], [7], 8);
  if (!input.plan.personal) throw new Error("missing personal plan");
  input.plan.personal.preferences.styles = ["stories", "pictures"];
  let token = 0;
  const generated = await generateWorkbook(input, { fit: capacityFit, ai: fakeAiClient({ answer: fakeWorkbookItems }),
    solver: keySolver(), qrToken: () => `token-${String(++token).padStart(12, "0")}`,
    store: { save: async draft => ({ status: "saved", draftId: draft.id }), draft: async () => null } });
  if (generated.status !== "stored") throw new Error(generated.status);
  const pages = generated.draft.pages.filter(p => p.type === "word-problems");
  expect(pages.length).toBeGreaterThan(0);
  for (const page of pages) {
    const kinds = page.questions.flatMap(q => q.package && ["word-problems", "solve-it-two-ways"].includes(q.place ?? "") ? [storyKind(q.package.text)] : []).filter(Boolean);
    expect(kinds.length, JSON.stringify(page.questions.map(q => [q.place, q.package?.text]))).toBeGreaterThanOrEqual(2);
    expect(new Set(kinds).size).toBeGreaterThanOrEqual(Math.min(3, kinds.length));
  }
});

it("keeps the interest share when capacity adds and replaces story questions", async () => {
  const profile = firstCustomerProfile();
  profile.preferences = { styles: ["stories", "pictures"], interests: ["nature", "games", "music", "cooking", "art"] };
  const input = customInput(["5.2", "5.7", "5.15", "5.19"]);
  const placed = planNextWorkbook({ curriculum: input.curriculum, grade: 8, profile, workbooks: [], number: 1,
    instructions: { version: 1, startLevel: "U19", teachMore: ["6.4", "6.13"], teachLess: [], addReview: ["5.2", "5.7", "5.15", "5.19"], difficulty: null } });
  if (!placed.ok) throw new Error(placed.reason);
  let token = 0;
  // Five days retain the original 11/24 interest-share failure; later contracts have their own ten-day check.
  const plan = { ...placed.plan, days: placed.plan.days.filter(d => [1, 2, 3, 4, 5].includes(d.day)) };
  const generated = await generateWorkbook({ ...input, plan }, { fit: capacityFit,
    ai: fakeAiClient({ answer: fakeWorkbookItems }), solver: keySolver(), qrToken: () => `token-${String(++token).padStart(12, "0")}`,
    store: { save: async draft => ({ status: "saved", draftId: draft.id }), draft: async () => null } });
  if (generated.status !== "stored") throw new Error(generated.status);
  const pages = generated.draft.pages;
  expect(pages.flatMap(p => p.questions.filter(q => q.package && interestEligible(input.curriculum, q.itemPlan))).length).toBeGreaterThanOrEqual(6);
  expect(interestShareProblems(input.curriculum, plan, pages)).toEqual([]);
});

function customInput(addReview: string[], days = [1, 5, 10], grade: 4 | 8 = 4): GenerateInput {
  const curriculum = curriculumFor("bc")!;
  const placed = planNextWorkbook({ curriculum, grade, profile: firstCustomerProfile(), workbooks: [], number: 1,
    instructions: { version: 1, startLevel: "U19", teachMore: ["6.4", "6.13"], teachLess: [],
      addReview, difficulty: null } });
  if (!placed.ok) throw new Error(placed.reason);
  const plan = workbookCapacityPlan(curriculum, placed.plan);
  const workbookId = "17fc5da1-2442-488a-a450-611a471e73e6";
  return { workbookId, childId: "00000000-0000-4000-8000-000000000001",
    number: 1, profileBuild: null, curriculum, itemPolicy: "approved-v1", book: { child: "Synthetic" },
    plan: { ...plan, days: plan.days.filter(d => days.includes(d.day)) } };
}

it.each<[string, string[]]>([
  ["the three applied reviews", ["5.2", "5.7", "5.15"]],
  ["all four requested reviews", ["5.2", "5.7", "5.15", "5.19"]],
])("keeps approved own-step questions in U19's extra angle practice with %s", async (_label, addReview) => {
  const input = customInput(addReview);
  const prepared = await prepareWorkbookCapacity(input, capacityFit);
  const practice = prepared.days.find(d => d.day === 5)!.pages.find(p => p.number === 4)!;
  const contracts = Object.values(practice.itemContracts!);
  expect(contracts).not.toContain(null);
  expect(contracts.filter(c => c?.template?.skill === "6.13-classify-angles" && c.template.step === 1).length).toBeGreaterThanOrEqual(3);
  const tasks = contracts.map((c, i) => {
    if (!c) throw new Error("Missing approved question");
    const built = buildPlannedItem(c, c.item, { id: `custom:${i}`, workbookId: input.workbookId, page: 12, question: i + 1, level: 19, skills: [c.item.skill] });
    expect(built.check.status).toBe("checked");
    expect(built.package).not.toBeNull();
    return taskIdentity(built.package!);
  });
  expect(new Set(tasks).size).toBe(tasks.length);
  const unprovenReviews = prepared.days.flatMap(d => d.pages.flatMap(p => Object.entries(p.itemContracts ?? {}).flatMap(([slot, c]) =>
    c && reviewMasteryStep(input.curriculum, prepared.level, c.item.skill) !== null && !c.template ? [`day ${d.day} page ${p.number} slot ${slot}: ${c.item.skill}`] : [])));
  expect(unprovenReviews).toEqual([]);
  for (const day of prepared.days) for (const page of day.pages) for (const [slot, c] of Object.entries(page.itemContracts ?? {})) {
    const part = page.parts[Number(slot.split(".")[0]) - 1];
    if (part.kind !== "challenge") continue;
    expect(part.step).not.toBeNull();
    expect(c?.template).toMatchObject({ skill: part.step!.skill, step: part.step!.step, difficulty: "hard" });
  }
});

it.each([[2, 1], [6, 2]])("keeps three distinct divisibility Challenge contracts on Day %i, step %i", async (day, step) => {
  const input = customInput(["5.2", "5.7", "5.15"], [day]);
  const prepared = await prepareWorkbookCapacity(input, capacityFit);
  const cards = prepared.days[0].pages.flatMap(page => Object.entries(page.itemContracts ?? {}).flatMap(([slot, c]) =>
    page.parts[Number(slot.split(".")[0]) - 1].kind === "challenge" ? [c] : []));
  expect(cards).toHaveLength(3);
  for (const c of cards) expect(c?.template).toMatchObject({ skill: "6.4-divisibility", step, difficulty: "hard" });
  expect(new Set(cards.map(c => c?.template?.index)).size).toBe(3);
});

it("fills all ten U19 days with approved contracts and distinct own-step Challenge questions", async () => {
  const input = customInput(["5.2", "5.7", "5.15"], Array.from({ length: 10 }, (_, i) => i + 1));
  // Page 6 also holds the five Friday checks, three Challenge cards and four unit checks.
  const prepared = await prepareWorkbookCapacity(input, { fits: async page => page.questions.length <= (page.content?.kind === "day" && page.content.page === 6 ? 14 : page.type === "warm-up" ? 12 : 10)
    ? { ok: true } : { ok: false, problems: [{ question: null, reason: "test page capacity" }] } });
  const missing = prepared.days.flatMap(day => day.pages.flatMap(page => Object.entries(page.itemContracts ?? {}).flatMap(([slot, c]) =>
    c === null && !page.existingSlots?.includes(slot) ? [`Day ${day.day} page ${page.number}, ${slot}: missing approved contract`] : [])));
  expect.soft(missing).toEqual([]);
  for (const day of prepared.days) {
    const cards = day.pages.flatMap(page => Object.entries(page.itemContracts ?? {}).flatMap(([slot, c]) => {
      const part = page.parts[Number(slot.split(".")[0]) - 1];
      if (part.kind !== "challenge") return [];
      expect.soft(c?.template, `Day ${day.day}, ${slot}`).toMatchObject({ skill: part.step!.skill, step: part.step!.step, difficulty: "hard" });
      return [c?.template];
    }));
    expect.soft(cards, `Day ${day.day}`).toHaveLength(3);
    expect.soft(new Set(cards.map(c => `${c?.skill}#${c?.step}.${c?.index}`)).size, `Day ${day.day}`).toBe(3);
  }
});

it("keeps the distinct angle task beside its method when practice uses compact reminders", async () => {
  // Earlier examples must consume the description forms so Day 5 exercises a numeric angle example.
  const source = customInput(["5.2", "5.7", "5.15"], [1, 2, 3, 4, 5]);
  const input = { ...source, plan: { ...source.plan, days: source.plan.days.map(d => ({ ...d,
    pages: d.pages.map(p => d.day === 5 && p.type === "practice" ? { ...p, compactPanel: true } : p) })) } };
  const fit = capacityFit;
  const plan = await prepareWorkbookCapacity(input, fit);
  let token = 1;
  const generated = await generateWorkbook({ ...input, plan }, { fit, ai: fakeAiClient({ answer: fakeWorkbookItems }), solver: keySolver(),
    qrToken: () => `token-${String(++token).padStart(12, "0")}`,
    store: { save: async draft => ({ status: "saved", draftId: draft.id }), draft: async () => null } });
  expect(generated.status).toBe("stored");
  if (generated.status !== "stored") return;
  const pages = generated.draft.pages.filter(p => p.day === 5 && p.type === "practice");
  expect(pages.length).toBeGreaterThanOrEqual(2);
  let countExamples = 0;
  for (const page of pages) {
    const example = page.panelExamples?.find(e => e?.skill.skills.includes("6.13-classify-angles"));
    expect(example).toBeTruthy();
    const blocks = page.content?.kind === "day" ? page.content.blocks.filter(b => b.slot === "reminder") : [];
    const printed = blocks.flatMap(b => b.lines ?? []).join(" ");
    expect(printed).toContain(example!.text);
    if (example!.text.startsWith("Of ")) {
      countExamples++;
      expect(printed).toContain("Only acute angles");
      expect(printed).not.toContain("Work it out");
    }
  }
  expect(countExamples).toBeGreaterThan(0);
  expect(workbookQuality(pages).issues.filter(i => i.kind === "repeat" && i.reason.startsWith("the teaching panel repeats"))).toEqual([]);
});

it("repairs a stories page whose different sentence frames still repeat a story kind", async () => {
  const source = customInput(["5.2", "5.7", "5.15", "5.19"], [10], 8);
  const input = { ...source, workbookId: "f84bd24a-7751-4f81-a739-5c7ff266ef23" };
  const plan = await prepareWorkbookCapacity(input, capacityFit);
  let token = 0;
  const deps = { fit: capacityFit, ai: fakeAiClient({ answer: fakeWorkbookItems }), solver: keySolver(),
    qrToken: () => `token-${String(++token).padStart(12, "0")}`,
    store: { save: async (draft: { id: string }) => ({ status: "saved" as const, draftId: draft.id }), draft: async () => null } };
  const generated = await generateWorkbook({ ...input, plan }, deps);
  if (generated.status !== "stored") throw new Error(generated.status);
  const pages = structuredClone(generated.draft.pages.filter(p => p.content?.kind === "day"));
  const page = pages.find(p => p.type === "word-problems")!;
  const target = page.questions.find(q => q.package && storyKind(q.package.text) !== "groups")!;
  expect(target).toBeTruthy();
  // A checked, distinct equal-groups story simulates a kept pre-review page. The other two stories remain intact.
  let replacement = false;
  for (let attempt = 0; attempt < 40 && !replacement; attempt++) {
    const fill = stepTemplateItem({ curriculum: input.curriculum, skill: "4.5-multiply-1-digit", step: 4,
      place: "word-problems", level: 19, day: 10, seed: 83, attempt, ordinal: 0 });
    if (!fill) continue;
    const built = buildStepItem(fill.ref, fill.text, { id: target.package!.id, workbookId: input.workbookId,
      page: page.number, question: target.number, level: 19, skills: [fill.ref.skill] }, "code");
    if (!built.package || built.check.status !== "checked" || storyKind(built.package.text) !== "groups"
      || page.questions.some(q => q.package && taskIdentity(q.package) === taskIdentity(built.package!))) continue;
    Object.assign(target, built, { itemPlan: { ...target.itemPlan!, type: "template", source: "story",
      template: fill.ref, item: stepAiItem(target.slot, fill.ref, fill.text), numbers: fill.numbers } });
    replacement = true;
  }
  expect(replacement).toBe(true);
  expect(workbookQuality([page]).issues.some(i => i.reason.startsWith("the stories page"))).toBe(true);
  let tooTall: string | null = null;
  const fit: FitCheck = { fits: async (candidate, book) => {
    if (candidate.type === "word-problems") {
      const kinds = candidate.questions.map(q => storyKind(q.package.text)).filter(Boolean);
      if (new Set(kinds).size === 3) {
        const text = candidate.questions.map(q => q.package.text).join("\n");
        tooTall ??= text;
        if (text === tooTall) return { ok: false, problems: [{ question: null, reason: "the first replacement runs 10 px past the content area" }] };
      }
    }
    return capacityFit.fits(candidate, book);
  } };
  const resumed = await generateWorkbook({ ...input, plan }, { ...deps, fit, pages: { load: async () => pages, save: async () => {} } });
  if (resumed.status !== "stored") throw new Error(resumed.status);
  expect(tooTall).not.toBeNull();
  expect(resumed.draft.quality?.issues.filter(i => i.reason.startsWith("the stories page"))).toEqual([]);
});

// Option A (Luis, 2026-11-17): a practice page that cannot hold its floor beside Solve it two ways and Spot the error
// gives its Spot the error to the day's other practice page on the same step. The seam stands in for the measured
// page: the full U19 practice page holds only five questions when both number blocks are on it.
it("moves Spot the error to the day's other practice page when the practice page cannot hold its floor", async () => {
  const input = customInput(["5.2", "5.7", "5.15"], [2]);
  const blocks = (page: Parameters<FitCheck["fits"]>[0]) => page.content?.kind === "day" ? page.content.blocks.map(b => b.slot) : [];
  const tight: FitCheck = { fits: async page => {
    const both = blocks(page).includes("spot-the-error") && blocks(page).includes("solve-it-two-ways");
    return page.questions.length <= (both ? 5 : page.type === "warm-up" ? 12 : 10) ? { ok: true }
      : { ok: false, problems: [{ question: null, reason: "test page capacity" }] };
  } };
  const day = (plan: GenerateInput["plan"]) => plan.days.find(d => d.day === 2)!.pages;
  const kinds = (plan: GenerateInput["plan"]) => day(plan).map(p => p.parts.map(x => x.kind));
  const before = kinds(input.plan);
  expect(before[2]).toEqual(["practice", "solve-it-two-ways", "spot-the-error"]);
  expect(before[4]).toEqual(["practice"]);

  const prepared = await prepareWorkbookCapacity(input, tight);
  const after = kinds(prepared);
  expect(after[2]).toEqual(["practice", "solve-it-two-ways"]);
  expect(after[4]).toEqual(["practice", "spot-the-error"]);
  // The rest of the day is the planned layout, and the day still has both of its Spot the error items.
  expect(after.filter((_, i) => i !== 2 && i !== 4)).toEqual(before.filter((_, i) => i !== 2 && i !== 4));
  expect(after.flat().filter(k => k === "spot-the-error")).toHaveLength(2);
  const moved = day(prepared)[4].parts.find(p => p.kind === "spot-the-error")!;
  expect(moved.step).toEqual(day(input.plan)[2].parts.find(p => p.kind === "spot-the-error")!.step);
  // The page keeps its floor of practice questions.
  const practice = day(prepared)[2];
  expect(Object.values(practice.itemContracts!).filter(Boolean).length).toBeGreaterThanOrEqual(5);

  // The written book prints it there, from the same plan.
  let token = 0;
  const generated = await generateWorkbook({ ...input, plan: prepared }, { fit: tight,
    ai: fakeAiClient({ answer: fakeWorkbookItems }), solver: keySolver(), qrToken: () => `token-${String(++token).padStart(12, "0")}`,
    store: { save: async draft => ({ status: "saved", draftId: draft.id }), draft: async () => null } });
  if (generated.status !== "stored") throw new Error(generated.status);
  const printed = (n: number) => { const c = generated.draft.pages.find(p => p.day === 2 && p.pageOfDay === n)?.content; return c?.kind === "day" ? c.blocks.map(b => b.slot) : []; };
  expect(printed(3)).toContain("solve-it-two-ways");
  expect(printed(3)).not.toContain("spot-the-error");
  expect(printed(5)).toContain("spot-the-error");

  // A page that fits keeps Savar's layout (#308): no move.
  expect(kinds(await prepareWorkbookCapacity(input, capacityFit))).toEqual(before);
});

// Luis, 2026-11-17: a Challenge of circled answers that leaves its page too empty asks "How do you know?" (a work box)
// under each circled answer; a Challenge page that fits is unchanged. The seam stands in for the measured page: three circled
// answers alone leave gaps over the fullness limit (the custom U19 Book 1's Day 5, 6.13 step 1).
it("adds a How do you know? box to circled Challenge answers only when the Challenge page is too empty", async () => {
  const input = customInput(["5.2", "5.7", "5.15"], [5]);
  const lines = (page: Parameters<FitCheck["fits"]>[0]) => page.questions.filter(q => q.package?.item?.regions.some(r => r.kind === "work" && r.label === "How do you know?")).length;
  const circled = (page: Parameters<FitCheck["fits"]>[0]) => page.questions.filter(q => q.package?.item?.regions.some(r => r.kind === "choice")).length;
  const empty: FitCheck = { fits: async page => page.type !== "challenge" || circled(page) === 0 || lines(page) > 0 ? capacityFit.fits(page, null as never)
    : { ok: false, problems: [{ question: null, reason: "The page has a 227 px unoccupied gap; allow 12 px plus at most 48 px extra.", kind: "fullness" }] } };
  const challenge = (plan: GenerateInput["plan"]) => plan.days.find(d => d.day === 5)!.pages.find(p => p.type === "challenge")!;

  const fits = await prepareWorkbookCapacity(input, capacityFit);
  expect(challenge(fits).explainChoices).toBeUndefined();
  const tight = await prepareWorkbookCapacity(input, empty);
  expect(challenge(tight).explainChoices).toBe(true);
  // The planned questions and Savar's empty review part stay as they were: only writing lines are added.
  expect(challenge(tight).itemContracts).toEqual(challenge(fits).itemContracts);
  expect(challenge(tight).capacity).toEqual(challenge(fits).capacity);

  const write = async (plan: GenerateInput["plan"], fit: FitCheck) => {
    let token = 0;
    const generated = await generateWorkbook({ ...input, plan }, { fit, ai: fakeAiClient({ answer: fakeWorkbookItems }), solver: keySolver(),
      qrToken: () => `token-${String(++token).padStart(12, "0")}`, store: { save: async draft => ({ status: "saved", draftId: draft.id }), draft: async () => null } });
    if (generated.status !== "stored") throw new Error(generated.status);
    return generated.draft.pages.find(p => p.day === 5 && p.type === "challenge")!.questions.map(q => q.package?.item?.regions.map(r => r.kind) ?? []);
  };
  const plain = await write(fits, capacityFit);
  expect(plain.flat()).not.toContain("work");
  const explained = await write(tight, empty);
  for (const [i, kinds] of explained.entries()) {
    if (plain[i].every(k => k === "choice")) expect(kinds).toEqual([...plain[i], "work"]);
    else expect(kinds).toEqual(plain[i]);
  }
  expect(explained.flat()).toContain("work");
});
