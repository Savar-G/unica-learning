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
  // (A day fails at 35 minutes, Savar 2026-11-04: 160 questions are well past it.)
  const early = page(3, 1), late = page(4, 8, 160);
  late.questions = Array.from({length: 160}, (_, i) => ({...early.questions[i % 2], number: i + 1}));
  const q = workbookQuality([early, late]);
  expect(new Set(q.issues.map(i => i.kind))).toEqual(new Set(["repeat", "progress", "variety", "time"]));
  expect(q.days[1].minutes).toBeGreaterThan(35);
  expect(q.ready).toBe(false);
});

function timedPage(number: number, day: number, count: number, extra = false): GeneratedPage {
  const p = page(number, day, count);
  p.content = { kind: "day", id: `time-${number}`, level: 4, day, page: 1, pages: 2,
    topic: "Numbers", title: "Numbers", subtitle: "Write the answers.", grownUp: null, requiredTimeTarget: 20,
    blocks: [{ slot: "on-your-own", items: p.questions.map(q => q.number), ...(extra ? { extra: true } : {}) }] };
  return p;
}

it("keeps every under-one-hour day below 20 required minutes without dropping Extra questions", () => {
  const pages = Array.from({ length: 10 }, (_, i) => [timedPage(i * 2 + 3, i + 1, 40), timedPage(i * 2 + 4, i + 1, 40, true)]).flat();
  const before = structuredClone(pages);
  const quality = workbookQuality(pages);
  expect(quality.days).toHaveLength(10);
  expect(quality.days.every(d => d.requiredMinutes! <= 20 && d.minutes > 20 && d.minutes < 35)).toBe(true);
  expect(quality.issues.filter(i => i.kind === "time")).toEqual([]);
  expect(pages).toEqual(before);
});

it("rejects generated required work above the target and keeps the whole-day limit with Extra", async () => {
  const required = timedPage(3, 1, 64), extra = timedPage(4, 1, 10, true);
  const issues = () => workbookQuality([required, extra]).issues.filter(i => i.kind === "time");
  expect(issues()).toEqual(expect.arrayContaining([expect.objectContaining({ reason: expect.stringMatching(/Required work.*at or below 20/) })]));
  const reviewed = await checkWholeBook([required, extra], async () => null);
  expect(reviewed.quality.ready).toBe(false);
  expect(reviewed.quality.days[0].requiredMinutes).toBeGreaterThan(20);
  for (const p of [required, extra]) if (p.content?.kind === "day") p.content.requiredTimeTarget = 25;
  expect(issues()).toEqual([]);
  extra.questions = page(4, 1, 100).questions;
  if (extra.content?.kind === "day") extra.content.blocks[0].items = extra.questions.map(q => q.number);
  expect(issues()).toContainEqual(expect.objectContaining({ reason: expect.stringMatching(/keep it below 35/) }));
});

it("keeps the previous time results without the optional fields", () => {
  const p = timedPage(3, 1, 64);
  if (p.content?.kind !== "day") throw new Error("not a day");
  delete p.content.requiredTimeTarget;
  const plain = workbookQuality([p]);
  expect(plain.days[0]).not.toHaveProperty("requiredMinutes");
  expect(plain.issues.filter(i => i.kind === "time")).toEqual([]);
  const bare = { ...p, content: undefined };
  expect(workbookQuality([bare]).days).toEqual(plain.days);
});

it("keeps an exact 20-minute boundary despite floating-point noise", () => {
  const p = timedPage(3, 1, 14);
  p.questions = p.questions.map((q, i) => ({ ...q, package: { ...q.package!,
    text: Array(i === 13 ? 3 : 13).fill("word").join(" "),
    item: { ...q.package!.item!, format: "written-reason", regions: [] },
  } }));
  const quality = workbookQuality([p]);
  expect(quality.days[0].requiredMinutes).toBe(20);
  expect(quality.issues.filter(i => i.kind === "time")).toEqual([]);
});

it("keeps recalculated minutes on the plan row when that page prints alone", async () => {
  const summary: GeneratedPage = { ...page(2, 1, 0), type: "how-plan", day: null, content: {
    kind: "how-plan", id: "plan", level: 4, child: "Noah", workbook: 1, pagesADay: 8,
    minutes: { min: 30, max: 30 }, rows: [{ day: 1, topic: "Numbers", second: "Practice", pages: [3, 4] }],
  } };
  const result = await checkWholeBook([summary, timedPage(3, 1, 40), timedPage(4, 1, 40, true)], async () => null);
  const content = result.pages[0].content;
  if (content?.kind !== "how-plan") throw new Error("not the plan");
  expect(content.rows[0]).toMatchObject({ requiredMinutes: result.quality.days[0].requiredMinutes, extra: true });
  expect(summary.content).not.toHaveProperty("rows.0.requiredMinutes");
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

it("fails a step template page below its adopted count, with the U4 to U9 new idea floor of 2", () => {
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
  // The new-idea floor follows Cedric's band table: 2 at U4-U9, 3 at U10-U18, 2 at U19-U30 (new_idea 2-4 items, 6 pages
  // a day, one column; Savar, 2026-11-03). Not a bug: the confirmed "3 from U10" is the U10-U18 band.
  expect(floorIssue(18, ["now-you", "now-you"])).toBe("the page prints 2 practice questions; a new-idea page needs 3");
  expect(floorIssue(19, ["now-you", "now-you"])).toBeNull();
  expect(floorIssue(30, ["now-you"])).toBe("the page prints 1 practice question; a new-idea page needs 2");
});

it("counts a question stem with no person in it twice a page at most", () => {
  const p = page(3, 1, 3);
  p.questions = p.questions.map((q, i) => ({ ...q, package: { ...q.package!, text: `In ${41000 + i * 1111}, which digit is in the thousands place?` } }));
  expect(workbookQuality([p]).issues.some(i => i.reason.includes("a third time on the page"))).toBe(true);
  p.questions = p.questions.slice(0, 2);
  expect(workbookQuality([p]).issues.some(i => i.reason.includes("a third time on the page"))).toBe(false);
});

it("asks a step's only Challenge template once and keeps every card on the day's step (B3)", () => {
  const challenge = (rank: number, index: number, difficulty: string, kind = "story") => ({ skill: rank === 9 ? "5.1-place-value-million" : "4.4-add-within-10000", step: 1, index, rank, difficulty, kind, challengeTemplates: 1 });
  const p = page(10, 1, 3);
  p.type = "challenge";
  // The day's practice on its hardest step (rank 9), easy.
  const practice = page(4, 1, 1);
  practice.questions = practice.questions.map(q => ({ ...q, itemPlan: { template: challenge(9, 0, "easy", "box") } as unknown as typeof q.itemPlan }));
  const cards = (ts: ReturnType<typeof challenge>[]) => { p.questions = p.questions.map((q, i) => ({ ...q, place: "challenge" as typeof q.place, part: "challenge", itemPlan: { template: ts[i] } as unknown as typeof q.itemPlan })); return workbookQuality([practice, p]).issues.filter(i => i.kind === "challenge").map(i => i.reason); };
  expect(cards([challenge(9, 2, "medium"), challenge(9, 2, "medium"), challenge(9, 2, "medium")]).some(r => r.includes("only Challenge template again"))).toBe(true);
  // (An earlier step's "hard" card asks less than the day's practice, Codex at 24751f16, B3.)
  expect(cards([challenge(9, 2, "medium"), challenge(5, 4, "hard"), challenge(5, 3, "hard")]).some(r => r.includes("question 2 must use the hardest step"))).toBe(true);
  expect(cards([challenge(9, 2, "medium"), challenge(9, 4, "hard"), challenge(9, 3, "hard")])).toEqual([]);
  expect(cards([challenge(9, 2, "medium"), challenge(5, 1, "easy"), challenge(5, 3, "hard")]).some(r => r.includes("question 2 must use the hardest step"))).toBe(true);
});

it("fails a page that rates likelihood outside never, sometimes and always, and a panel line twice a day", () => {
  const p = page(3, 1, 2);
  p.content = { kind: "day", id: "test", level: 4, day: 1, page: 1, pages: 8, topic: "Chance", title: "Chance", subtitle: "Circle the answer.", grownUp: null, blocks: [] };
  p.questions[0] = { ...p.questions[0], package: { ...p.questions[0].package!, text: "Which is right? You eat breakfast on a school day. A) likely  B) unlikely" } };
  expect(workbookQuality([p]).issues.some(i => i.reason.includes('rates likelihood with "likely"'))).toBe(true);
  const panel = (n: number) => { const q = page(n, 1, 1); q.content = { kind: "day", id: "t", level: 4, day: 1, page: n, pages: 8, topic: "Count", title: "Count", subtitle: "Write it.", grownUp: null, blocks: [{ slot: "watch-one", items: [], lines: [`${n}, [${n + 1}]`], explain: "Watch out: Mia wrote 9, 10, 12. No: after 10 comes 11." }] }; return q; };
  expect(workbookQuality([panel(4), panel(5)]).issues.some(i => i.kind === "repeat" && i.reason.includes("Watch out: Mia wrote"))).toBe(true);
});

it("fails a stories page of one kind of story and a worked example with no method, and keeps a task by its printed text", () => {
  const stories = page(7, 1, 2);
  stories.type = "word-problems";
  stories.questions = stories.questions.map((q, i) => ({ ...q, place: "word-problems" as typeof q.place, package: { ...q.package!, text: `Kai has ${5 + i} blocks and wants 10. How many more?` } }));
  expect(workbookQuality([stories]).issues.some(i => i.reason.includes("one kind of story"))).toBe(true);
  stories.questions[1] = { ...stories.questions[1], package: { ...stories.questions[1].package!, text: "Ava has 6 shells. Ava gets 2 more. How many now?" } };
  expect(workbookQuality([stories]).issues.some(i => i.reason.includes("one kind of story"))).toBe(false);

  const panel = page(4, 1, 1);
  panel.content = { kind: "day", id: "t", level: 4, day: 1, page: 2, pages: 8, topic: "Count", title: "Count", subtitle: "Write it.", grownUp: null, blocks: [{ slot: "worked-example", items: [], methods: [{ label: "How it works", lines: ["7 is 4 and ?", "Answer: [3]"] }] }] };
  expect(workbookQuality([panel]).issues.some(i => i.reason.includes("without a method"))).toBe(true);
  panel.content.blocks[0].methods![0].lines = ["7 is 4 and ?", "Work it out: 7 − 4 = 3. Answer: [3]"];
  expect(workbookQuality([panel]).issues.some(i => i.reason.includes("without a method"))).toBe(false);

  const a = page(3, 1, 1), b = page(5, 1, 1);
  b.questions[0] = { ...b.questions[0], package: { ...a.questions[0].package!, textSource: "ai" } as typeof a.questions[0]["package"] };
  expect(taskIdentity(a.questions[0].package!)).toBe(taskIdentity(b.questions[0].package!));
});

it("fails a take-away story that keeps its things, a drill on a stories page and a card frame printed too often", () => {
  const p = page(7, 1, 2);
  p.type = "word-problems";
  const box = (q: GeneratedPage["questions"][number], text: string, value: number) => ({ ...q, place: "word-problems" as typeof q.place, package: { ...q.package!, text, answer: { value: { type: "number" as const, value }, accepted: [], unit: null } } });
  p.questions = [box(p.questions[0], "Max has 1010 buttons, puts 17 in a jar. How many buttons does he have now?", 993), box(p.questions[1], "Ava has 6 shells. Ava gets 2 more. How many now?", 8)];
  const reasons = () => workbookQuality([p]).issues.map(i => i.reason);
  expect(reasons().some(r => r.includes("take-away story"))).toBe(true);
  p.questions[0] = box(p.questions[0], "Max has 1010 buttons and gives 17 away. How many buttons does he have now?", 993);
  expect(reasons().some(r => r.includes("take-away story"))).toBe(false);
  p.questions[1] = box(p.questions[1], "Missing number: 10000 - ? = 4913", 5087);
  expect(reasons().some(r => r.includes("on the stories page is no story"))).toBe(true);

  // A card frame: twice a book, never on two Challenge days in a row, fresh numbers (Savar, 2026-11-03).
  const card = (n: number, day: number, a: number, b: number) => { const c = page(n, day, 1); c.type = "challenge"; c.questions = [{ ...c.questions[0], place: "challenge" as typeof c.questions[0]["place"], package: { ...c.questions[0].package!, text: `Kai counts ${a} tickets on Monday and ${b} points on Friday. How many is that now?` } }]; return c; };
  const frame = (pages: GeneratedPage[]) => workbookQuality(pages).issues.some(i => i.kind === "repeat" && i.reason.includes("frame"));
  expect(frame([card(10, 1, 4000, 3000), card(30, 4, 4100, 3100)])).toBe(false);
  expect(frame([card(10, 1, 4000, 3000), card(18, 2, 4100, 3100)])).toBe(true);
  expect(frame([card(10, 1, 4000, 3000), card(30, 4, 4000, 3000)])).toBe(true);
  expect(frame([card(10, 1, 4000, 3000), card(30, 4, 4100, 3100), card(50, 7, 4200, 3200)])).toBe(true);
});

it("keeps a task by its printed maths, not its distractors", () => {
  const a = page(3, 1, 1).questions[0].package!;
  const missing = { ...a, text: "6 is 1 and ?", item: { ...a.item!, format: "write-number" as const, regions: [{ id: "answer", kind: "box" as const, label: null, answer: { type: "number" as const, value: 5 } }], checks: [] } };
  const chosen = { ...a, text: "6 is 1 and which number: 6 or 5?", item: { ...a.item!, format: "write-number" as const, regions: [{ id: "answer", kind: "choice" as const, mark: "circle" as const, label: null, choices: ["6", "5"], answer: "5" }], checks: [] } };
  expect(taskIdentity(chosen as never)).toBe(taskIdentity(missing as never));
});

