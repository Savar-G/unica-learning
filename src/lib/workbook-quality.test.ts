import { expect, it } from "vitest";
import { checkWholeBook, measuredPageUse, workbookQuality } from "./workbook-quality";
import { taskIdentity } from "./workbook-task-identity";
import { buildPlannedItem, planItem } from "./workbook-item-plan";
import type { GeneratedPage } from "./workbook-generator";
import { curriculumFor } from "./workbook-curriculum";
import { buildStepItem, stepTemplateItem } from "./workbook-step-items";

function page(number: number, day: number, count = 2): GeneratedPage {
  return { number, day, pageOfDay: 1, dayLabel: `Day ${day}`, type: "practice", qrToken: "token-000000000001", attempts: 0, fit: { status: "fits" }, questions: Array.from({ length: count }, (_, i) => {
    const p = planItem({ skill: "1.1-one-more-less-20", slot: `1.${i + 1}`, day, level: 4, ordinal: i + 21, range: { min: 1, max: 10, help: "none", pictures: false } })!;
    const b = buildPlannedItem(p, p.item, { id: `p${number}q${i}`, workbookId: "00000000-0000-4000-8000-0000000000a1", page: number, question: i + 1, level: 4, skills: [p.item.skill] });
    return { number: i + 1, slot: p.item.slot, part: "practice", place: "on-your-own", attempts: 1, check: b.check, package: b.package };
  }) };
}

it("checks actual progression, repeats, format variety and day time", () => {
  const early = page(3, 1), late = page(4, 8, 100);
  late.questions = Array.from({length: 100}, (_, i) => ({...early.questions[i % 2], number: i + 1}));
  const q = workbookQuality([early, late]);
  expect(new Set(q.issues.map(i => i.kind))).toEqual(new Set(["repeat", "progress", "variety", "time"]));
  expect(q.days[1].minutes).toBeGreaterThan(30);
  expect(q.ready).toBe(false);
});

it("does not call a rewrite more than once per page or accept a bad fit", async () => {
  const pages = [page(3, 1), page(4, 8, 100)];
  const calls: number[] = [];
  const result = await checkWholeBook(pages, async p => { calls.push(p.number); return { ...p, questions: [], fit: { status: "failed", problems: [{ question: null, reason: "does not fit" }] } }; });
  expect(new Set(calls).size).toBe(calls.length);
  expect(result.pages).toEqual(pages);
  expect(result.quality.ready).toBe(false);
});

it("counts dropped questions and fails at 5 percent", () => {
  const p = page(3, 1, 20);
  p.questions[0].check = { status: "failed", reason: "bad math" };
  p.leftOut = [{ slot: "1.21", part: "practice", text: "21 + 4 = ?", reason: "no room" }];
  const q = workbookQuality([p]);
  expect(q.failedRate).toBe(.05);
  expect(q.dropped).toBe(1);
  expect(q.ready).toBe(false);
});

it("measures the printed content and keeps an unknown measurement unknown", () => {
  const questions = page(3,1).questions.flatMap(q=>q.package ? [{number:q.number,package:q.package}]:[]);
  const pages = [0,1].map(i=>({ number:i+1, dayLabel:"Day 1", type:"practice" as const, qrToken:"token-000000000001", questions }));
  const m = (sheet:number,name:string,y:number,height:number) => ({sheet,name,y,height,x:0,width:688,clientWidth:688,clientHeight:height,scrollWidth:688,scrollHeight:height,visible:true,textPrinted:true,text:""});
  const q = measuredPageUse(pages,[m(0,"slot-content",100,800),m(0,"question-1",100,400),m(0,"question-2",520,300),m(1,"sheet",0,1000)]);
  expect(q).toEqual([{ page: 1, fraction: .875 }, { page: 2, fraction: null }]);
});

it("checks rejected wording in teaching panels as well as in question text",()=>{
  const p=page(3,1);
  p.content={kind:"day",id:"test",level:6,day:1,page:1,pages:8,topic:"Shapes",title:"Shapes",subtitle:"Answer the questions.",grownUp:null,
    blocks:[{slot:"worked-example",items:[],methods:[{label:"An example",lines:["Draw a triangle."]}]}]};
  expect(workbookQuality([p]).issues.some(i=>i.reason.includes("rejected workbook wording"))).toBe(true);
  p.content.blocks[0].methods![0].lines=["Look at the printed triangle."];
  expect(workbookQuality([p]).issues.some(i=>i.reason.includes("rejected workbook wording"))).toBe(false);
});

// #482 review at 2b73e8a, finding 1: a task is its mathematical data, so moving the printed "?" is still a repeat.
it("rejects the same arithmetic task in another printed form outside warm-up, and keeps warm-up facts", () => {
  const first = page(3, 1, 1), second = page(4, 1, 1);
  const pkg = first.questions[0].package!;
  expect(pkg.operation).not.toBeNull();
  const moved = /= \?$/.test(pkg.text) ? `? = ${pkg.text.replace(/ = \?$/, "")}` : `${pkg.text.replace(/^\? = /, "")} = ?`;
  expect(moved).not.toBe(pkg.text);
  second.questions[0] = { ...second.questions[0], package: { ...pkg, id: "moved", text: moved, ref: { source: "workbook", workbookId: "00000000-0000-4000-8000-0000000000a1", page: 4, question: 1 } } };
  expect(workbookQuality([first, second]).issues).toContainEqual(expect.objectContaining({ page: 4, kind: "repeat" }));
  const warm = (p: GeneratedPage) => ({ ...p, questions: p.questions.map(q => ({ ...q, place: "warm-up" as const })) });
  expect(workbookQuality([warm(first), warm(second)]).issues.filter(i => i.kind === "repeat")).toEqual([]);
});

// Finding 2: Cedric's section 9, at least three contexts or formats on a printed page, and no sentence frame twice.
it("requires three contexts or formats on a printed page and no repeated sentence frame", () => {
  const sequences = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => {
    const p = planItem({ skill: "1.1-count-to-20", slot: `1.${i + 1}`, day: 1, level: 4, ordinal: 3 * i, attempt: offset, range: { min: 1, max: 20, help: "none", pictures: false } })!;
    return buildPlannedItem(p, p.item, { id: `s${i}`, workbookId: "00000000-0000-4000-8000-0000000000a1", page: 5, question: i + 1, level: 4, skills: [p.item.skill] }).package!;
  });
  const onlySequences = sequences(10).filter(p => p.item?.checks[0]?.kind === "sequence");
  expect(onlySequences.length).toBeGreaterThanOrEqual(3);
  const p = page(5, 1, onlySequences.length);
  p.questions = p.questions.map((q, i) => ({ ...q, package: onlySequences[i] }));
  expect(workbookQuality([p]).issues).toContainEqual(expect.objectContaining({ page: 5, kind: "variety", reason: expect.stringMatching(/needs at least 3/) }));
  // A third form (a bare question of the number just after) makes the page pass the rule.
  const after = sequences(4, 2).find(x => /Count on 1|1 after|count 1 more/.test(x.text))!;
  const facts = page(5, 1, 3).questions.map(q => q.package!).find(x => !/after/.test(x.text))!;
  p.questions[0] = { ...p.questions[0], package: after };
  p.questions[1] = { ...p.questions[1], package: facts };
  expect(workbookQuality([p]).issues.filter(i => /needs at least 3/.test(i.reason))).toEqual([]);
  // The same sentence frame twice on one page: a story about a person, only the name and numbers changed.
  const twice = page(6, 1, 3);
  twice.questions[1] = { ...twice.questions[1], package: { ...after, id: "a1", text: "Mia has 3 shells. She gets 1 more. How many shells does Mia have now?", operation: { kind: "add", operands: [3, 1] } } };
  twice.questions[2] = { ...twice.questions[2], package: { ...after, id: "a2", text: "Ben has 7 shells. He gets 1 more. How many shells does Ben have now?", operation: { kind: "add", operands: [7, 1] } } };
  expect(workbookQuality([twice]).issues).toContainEqual(expect.objectContaining({ page: 6, reason: expect.stringMatching(/sentence frame .* a second time/) }));
});

it("fails a Challenge no harder than that day's practice of its step, by what the child does (#482 review at 3134252)", () => {
  const bc = curriculumFor("bc")!;
  const question = (n: number, place: string, part: string, at: Parameters<typeof stepTemplateItem>[0]["place"], seed: number, attempt = 0) => {
    const it = stepTemplateItem({ curriculum: bc, skill: "1.1-count-to-20", step: 1, place: at, level: 4, day: 1, seed, attempt, ordinal: 0 })!;
    const b = buildStepItem(it.ref, it.text, { id: `q${n}`, workbookId: "00000000-0000-4000-8000-0000000000a1", page: 3, question: n, level: 4, skills: [it.ref.skill] }, "code");
    return { number: n, slot: `1.${n}`, part, place, attempts: 1, check: b.check, package: b.package, itemPlan: { template: it.ref } } as unknown as GeneratedPage["questions"][number];
  };
  const day = (challenge: GeneratedPage["questions"][number]): GeneratedPage[] => [
    { ...page(3, 1, 0), questions: [question(1, "now-you", "practice", "now-you", 3), question(2, "on-your-own", "practice", "on-your-own", 11, 1)] },
    { ...page(4, 1, 0), type: "challenge", questions: [challenge] },
  ];
  const reasons = (pages: GeneratedPage[]) => workbookQuality(pages).issues.filter(i => i.kind === "challenge").map(i => i.reason);
  // The step's hard count (write the next four numbers) is harder than its practice.
  expect(reasons(day(question(1, "challenge", "challenge", "challenge", 9)))).toEqual([]);
  // A true or false (medium) asks less than practice's medium number question: a circled choice, no worked answer.
  const easy = question(1, "challenge", "challenge", "on-your-own", 11);
  expect(easy.itemPlan!.template!.kind).toBe("choice");
  expect(day(easy)[0].questions[1].itemPlan!.template!.difficulty).toBe(easy.itemPlan!.template!.difficulty);
  expect(reasons(day(easy)).join(" ")).toMatch(/no harder than that day's practice/);
});

it("reads one printed task on every path: a copy with no template id repeats it (#482 review at db3b1a0)", () => {
  const bc = curriculumFor("bc")!;
  const it = stepTemplateItem({ curriculum: bc, skill: "5.1-place-value-million", step: 1, place: "on-your-own", level: 16, day: 1, seed: 5, attempt: 0, ordinal: 0 })!;
  const b = buildStepItem(it.ref, it.text, { id: "q1", workbookId: "00000000-0000-4000-8000-0000000000a1", page: 3, question: 1, level: 16, skills: [it.ref.skill] }, "code");
  const copy = { ...b.package!, templateId: null };
  expect(taskIdentity(copy)).toBe(taskIdentity(b.package!));
});

it("counts a worked example's task in the repeat check, before and after its question (#482 review at db3b1a0)", () => {
  const first = page(3, 1, 1), second = page(4, 1, 1);
  const before = { ...first, panelExamples: [second.questions[0].package] };
  expect(workbookQuality([before, second]).issues.some(i => i.kind === "repeat" && /worked example/.test(i.reason))).toBe(true);
  const after = { ...second, panelExamples: [first.questions[0].package] };
  expect(workbookQuality([first, after]).issues.some(i => i.kind === "repeat" && /worked example/.test(i.reason))).toBe(true);
});

it("keeps a hand-built question inside its slot's step range (#482 review at db3b1a0: 100001 on a step to 99999)", () => {
  const p = page(3, 1, 1);
  const wide = { ...p, expected: [{ slot: p.questions[0].slot, part: "practice" as const, place: "on-your-own" as const, steps: ["1.1-one-more-less-20#1"], bounds: { min: 0, max: 1 } }] };
  expect(workbookQuality([wide]).issues.some(i => i.kind === "range")).toBe(true);
});

it("fails a step template page below its adopted count, with the provisional U4 to U9 new idea floor of 2", () => {
  const floorIssue = (level: number, places: string[]) => {
    const p = page(3, 1, places.length);
    p.type = "new-idea";
    p.questions = p.questions.map((q, i) => ({ ...q, place: places[i] as typeof q.place, itemPlan: { template: { skill: "1.1-one-more-less-20", step: 1, index: i } } as unknown as typeof q.itemPlan }));
    p.content = { kind: "day", id: "test", level, day: 1, page: 2, pages: 8, topic: "One more", title: "One more", subtitle: "Write the answer.", grownUp: null, consistentLayout: true, blocks: [] };
    return workbookQuality([p]).issues.find(i => i.reason.includes("practice question"))?.reason ?? null;
  };
  // Spot the error does not count: 2 practice questions beside it hold U4's floor, not U10's.
  expect(floorIssue(4, ["now-you", "now-you", "spot-the-error"])).toBeNull();
  expect(floorIssue(10, ["now-you", "now-you", "spot-the-error"])).toBe("the page prints 2 practice questions; a new-idea page needs 3");
  expect(floorIssue(4, ["now-you", "spot-the-error"])).toBe("the page prints 1 practice question; a new-idea page needs 2");
});
