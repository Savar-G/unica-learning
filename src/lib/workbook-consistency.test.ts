import { expect, it } from "vitest";
import { fakeAiClient } from "./ai-client-fake";
import { fakeWorkbookItems } from "./workbook-ai-fake";
import { curriculumFor } from "./workbook-curriculum";
import { generateWorkbook } from "./workbook-generator";
import { planWorkbook } from "./workbook-plan";
import { firstCustomerProfile, sampleChild, samplePlanInput } from "./workbook-sample-profiles";
import { keySolver } from "./workbook-solve-check";
import type { GeneratedPage, StoredCall, GenerateDeps } from "./workbook-generator";
import { planNextWorkbook } from "./workbook-placement";

it("names both true/false and Spot the error's yes/no in a first-customer page instruction", async () => {
  const curriculum = curriculumFor("bc")!;
  const placed = planNextWorkbook({ curriculum, grade: 4, profile: firstCustomerProfile(), workbooks: [], number: 1 });
  if (!placed.ok) throw new Error(placed.reason);
  let tokens = 0;
  // Every day's lesson: which lesson holds both kinds depends on the tasks the book has left (#759 fills U16 lessons last).
  const result = await generateWorkbook({ workbookId: "00000000-0000-4000-8000-0000000000a1", childId: "00000000-0000-4000-8000-0000000000c1", number: 1, profileBuild: null,
    curriculum, plan: { ...placed.plan, days: placed.plan.days.map(d => ({ ...d, pages: d.pages.filter(p => p.type === "new-idea") })) }, book: { child: "Noah" }, itemPolicy: "approved-v1" },
  { ai: fakeAiClient({ answer: fakeWorkbookItems }), solver: keySolver(), fit: { fits: async p => p.questions.length <= 10 ? { ok: true } : { ok: false, problems: [{ question: null, reason: "Test page holds ten questions" }] } },
    store: { save: async d => ({ status: "saved", draftId: d.id }), draft: async () => null }, qrToken: () => `token-${String(++tokens).padStart(12, "0")}` });
  if (result.status !== "stored") throw new Error(result.status);
  const pages = result.draft.pages.filter(p => p.questions.some(q => q.place === "spot-the-error")
    && p.questions.some(q => q.package?.item?.regions.some(r => r.kind === "choice" && r.choices.includes("true"))));
  expect(pages.length).toBeGreaterThan(0);
  for (const p of pages) {
    expect(p.content?.kind === "day" && p.content.subtitle).toBe("Write the answer in the box. Circle your answers.");
  }
});

it("sends only story and explanation contracts to the writer, and supplies examples in every call", async () => {
  const c = curriculumFor("bc")!;
  const planned = planWorkbook(samplePlanInput(c, sampleChild(c, "U4")!, "first"));
  if (!planned.ok) throw new Error(planned.reason);
  let tokens = 0;
  const ai = fakeAiClient({ answer: fakeWorkbookItems });
  const result = await generateWorkbook({ workbookId: "00000000-0000-4000-8000-0000000000a1", childId: "00000000-0000-4000-8000-0000000000c1", number: 1, profileBuild: null,
    curriculum: c, plan: { ...planned.plan, days: planned.plan.days.slice(0, 2) }, book: { child: "Noah" }, itemPolicy: "approved-v1" },
  { ai, solver: keySolver(), fit: { fits: async () => ({ ok: true }) }, store: { save: async d => ({ status: "saved", draftId: d.id }), draft: async () => null }, qrToken: () => `token-${String(++tokens).padStart(12, "0")}` });
  expect(result.status).toBe("stored");
  // (The writer edits no story text, B1 final: it is asked for explanations only, and a U4 book may ask it nothing.)
  for (const request of ai.requests) {
    const asked = JSON.parse((request.content[0] as { text: string }).text);
    expect(asked.exampleBank.length).toBe(asked.slots.length);
    expect(asked.examples).toBeUndefined();
    for (const slot of asked.slots) expect(slot.contract.source).toBe("explain");
  }
  if (result.status === "stored") {
    const code = result.draft.pages.flatMap(p => p.questions).filter(q => q.package?.textSource === "code");
    expect(code.length).toBeGreaterThan(30);
    expect(result.draft.quality).toBeDefined();
    const failures = result.draft.pages.flatMap(p => p.questions.filter(q => q.check.status === "failed").map(q => ({ page: p.number, slot: q.slot, text: q.package?.text, check: q.check })));
    const questions = result.draft.pages.flatMap(p=>p.questions);
    expect(failures.length / questions.length, JSON.stringify(failures)).toBeLessThan(.05);
  }
});

it("makes no writer, solver or attempt-ledger call for a page of code drills", async () => {
  const c = curriculumFor("bc")!;
  const planned = planWorkbook(samplePlanInput(c, sampleChild(c, "U4")!, "first"));
  if (!planned.ok) throw new Error(planned.reason);
  const day = planned.plan.days[0];
  const first = day.pages[0];
  const part = { ...first.parts[0], kind: "practice" as const, skills: ["1.1-count-to-20"], items: 4 };
  const ai = fakeAiClient({ answer: () => { throw new Error("a drill reached AI"); } });
  let reserves = 0, solves = 0, tokens = 0;
  const r = await generateWorkbook({ workbookId: "00000000-0000-4000-8000-0000000000a1", childId: "00000000-0000-4000-8000-0000000000c1", number: 1, profileBuild: null,
    curriculum: c, plan: { ...planned.plan, days: [{ ...day, pages: [{ ...first, parts: [part] }] }] }, itemPolicy: "approved-v1" }, {
    ai, solver: { model: "must-not-run", solve: async () => { solves++; throw new Error("a drill reached the solver"); } },
    fit: { fits: async () => ({ ok: true }) }, attempts: { max: 3, load: async () => new Map(), use: async () => { reserves++; return { refused: [] }; } },
    store: { save: async d => ({ status: "saved", draftId: d.id }), draft: async () => null }, qrToken: () => `token-${String(++tokens).padStart(12, "0")}`,
  });
  expect(r.status).toBe("stored");
  expect(ai.requests).toEqual([]);
  expect([reserves, solves]).toEqual([0, 0]);
});

it("replays approved calls after a page checkpoint fails, without repeating a writer request", async () => {
  const c = curriculumFor("bc")!;
  const planned = planWorkbook(samplePlanInput(c, sampleChild(c, "U4")!, "first"));
  if (!planned.ok) throw new Error(planned.reason);
  const input = { workbookId: "00000000-0000-4000-8000-0000000000a1", childId: "00000000-0000-4000-8000-0000000000c1", number: 1, profileBuild: null,
    curriculum: c, plan: { ...planned.plan, days: planned.plan.days.slice(0, 1) }, book: {child: "Noah"}, itemPolicy: "approved-v1" as const };
  const pages = new Map<number, GeneratedPage>(), calls = new Map<string, StoredCall>();
  const ai = fakeAiClient({ answer: fakeWorkbookItems });
  let tokens = 0, fail = true;
  const deps: GenerateDeps = { ai, solver: keySolver(), fit: { fits: async () => ({ok:true}) }, concurrency: 1,
    store: { save: async d => ({status:"saved",draftId:d.id}), draft: async()=>null }, qrToken: () => `token-${String(++tokens).padStart(12, "0")}`,
    pages: { load: async()=>[...pages.values()], save: async p=>{ if (fail && p.questions.length > 0) {fail=false; throw new Error("checkpoint failed");} if (!pages.has(p.number)) pages.set(p.number,p); } },
    calls: { load: async numbers => [...calls].flatMap(([key,call])=>{const [page,seq]=key.split(":").map(Number); return numbers.includes(page)?[{page,seq,call}]:[];}), save: async(page,seq,call)=>{ calls.set(`${page}:${seq}`,structuredClone(call)); }, solves:async()=>new Map(), saveSolve:async()=>{} },
  };
  await expect(generateWorkbook(input,deps)).rejects.toThrow("checkpoint failed");
  const before = ai.requests.map(r=>JSON.stringify(r));
  const r = await generateWorkbook(input,deps);
  expect(r.status).toBe("stored");
  const all = ai.requests.map(r=>JSON.stringify(r));
  for (const request of before) expect(all.filter(r=>r===request).length).toBe(before.filter(r=>r===request).length);
});
