import { describe, expect, it } from "vitest";
import { chromiumPrintEngine, findChromium } from "./print-engine-chromium";
import { renderFitCheck } from "./workbook-fit";
import { workbookTemplate } from "./workbook-template";
import { fixedTemplateFonts } from "./workbook-template-fonts";
import { fakeAiClient } from "./ai-client-fake";
import { fakeWorkbookItems } from "./workbook-ai-fake";
import { curriculumFor } from "./workbook-curriculum";
import { generateWorkbook, reviseWorkbookPage, workbookCapacityPlan, prepareWorkbookCapacity, bookOutline, type GenerateDeps, type GenerateInput } from "./workbook-generator";
import { approvedQuestionTypes, approvedSkillIds, buildPlannedItem, itemNumber, planItem, skillItemProblem } from "./workbook-item-plan";
import { planWorkbook } from "./workbook-plan";
import { sampleChild, samplePlanInput } from "./workbook-sample-profiles";
import { buildQuestion, ITEMS_SCHEMA } from "./workbook-generator-items";
import { coinGiven } from "./question-package";
import { scheduledItemProblem } from "./workbook-feedback-check";
import { keySolver } from "./workbook-solve-check";
import { workbookQuality } from "./workbook-quality";
import { reasoningSteps, storyFrame } from "./workbook-task-identity";
import { workbookCoverTitle } from "./workbook-cover-titles";
import { bookPageContent, coverTitleLines, skillRange } from "./workbook-book";

const c = curriculumFor("bc")!;
function fixture() {
  const result = planWorkbook(samplePlanInput(c, sampleChild(c, "U4")!, "first"));
  if (!result.ok) throw new Error(result.reason);
  const input: GenerateInput = { workbookId: "00000000-0000-4000-8000-0000000000a1", childId: "00000000-0000-4000-8000-0000000000c1", number: 1, profileBuild: null, curriculum: c, plan: result.plan, book: {child:"Noah"}, itemPolicy:"approved-v1" };
  const ai = fakeAiClient({answer:fakeWorkbookItems});
  let tokens = 0;
  const deps: GenerateDeps = { ai, solver:keySolver(), fit:{ fits:async()=>({ok:true}) }, qrToken:()=>`token-${String(++tokens).padStart(12,"0")}`, store:{save:async d=>({status:"saved",draftId:d.id}),draft:async()=>null} };
  return {input, deps, ai};
}
async function make(o = fixture()) {
  const r = await generateWorkbook(o.input,o.deps);
  if (r.status !== "stored") throw new Error(JSON.stringify(r));
  return {...o, draft:r.draft};
}

// A failing assertion must show a checked but off-skill item, not a schema error.
describe("the approved skill audit", () => {
  it.each(approvedSkillIds())("builds and checks %s with its operand and representation rules", skill => {
    const level = skill.startsWith("K") ? 3 : (Number(skill[0]) - 1) * 3 + 4;
    const max = skillRange(c,level,skill).max;
    for (const ordinal of [4,11,31]) {
      const p = planItem({skill,slot:"1.1",level,day:10,ordinal,range:{min:1,max,pictures:false,help:"none"}});
      expect(p,skill).not.toBeNull();
      expect(skillItemProblem(p!)).toBeNull();
      const b = buildPlannedItem(p!,p!.item,{id:"q",workbookId:"00000000-0000-4000-8000-0000000000a1",page:3,question:1,level,skills:[skill]});
      expect(b.check.status,`${skill}: ${JSON.stringify(p!.item)} ${JSON.stringify(b.check)}`).not.toBe("failed");
    }
  });
  it("rejects a checked addition that is neither a double nor a near double", () => {
    for (const skill of ["1.3-doubles","2.3-near-doubles"]) {
      const p = planItem({skill,slot:"1.1",level:5,day:10,ordinal:4,range:{min:1,max:20,pictures:false,help:"none"}})!;
      p.item.operation!.operands = [5,2].map(itemNumber);
      expect(skillItemProblem(p)).toMatch(/equal addends|differ by 1/);
      expect(buildPlannedItem(p,p.item,{id:"q",workbookId:"00000000-0000-4000-8000-0000000000a1",page:3,question:1,level:5,skills:[skill]}).check.status).toBe("failed");
    }
  });
});

it("compares story frames without names, numbers or names containing digits", () => {
  expect(storyFrame("Will a cup hold water when Jon fills it?")).toBe(storyFrame("Will a cup hold water when Raj fills it?"));
  expect(storyFrame("Will Amy see a dog today?")).toBe(storyFrame("Will Ana see a dog today?"));
  expect(storyFrame("Mia has 3 shells. She gets 4 more.")).toBe(storyFrame("Child12 has 8 apples. He gets 2 more."));
  expect(storyFrame("Mia has 3 shells. She gets 4 more.")).toBe(storyFrame("12 has 8 apples. He gets 2 more."));
  expect(storyFrame("Will Amy see a dog today?")).toBe(storyFrame("Will 12 see a dog today?"));
});

it("retains five Friday questions and gives every Challenge more reasoning than practice", async () => {
  const {draft} = await make();
  const failures = draft.pages.flatMap(p=>p.questions.filter(q=>q.check.status === "failed").map(q=>({page:p.number,slot:q.slot,skill:q.itemPlan?.item.skill,reason:q.check})));
  expect(failures,JSON.stringify(failures)).toEqual([]);
  for (const day of [5,10]) expect(draft.pages.filter(p=>p.day===day).flatMap(p=>p.questions).filter(q=>q.part==="friday-5").length).toBe(5);
  const challenges = draft.pages.flatMap(p=>p.questions.filter(q=>q.place==="challenge").map(q=>({q,day:p.day!})));
  expect(challenges).toHaveLength(10);
  for (const {q,day} of challenges) {
    const practice = draft.pages.filter(p=>p.day===day).flatMap(p=>p.questions).filter(q=>q.place!=="challenge" && q.package);
    expect(reasoningSteps(q.package!)).toBeGreaterThan(Math.max(...practice.map(q=>reasoningSteps(q.package!))));
    expect(q.package!.answer).toMatchObject({value:{type:"number",value:q.itemPlan!.dayRange.max}});
  }
  expect(reasoningSteps(challenges.at(-1)!.q.package!)).toBeGreaterThan(reasoningSteps(challenges[0].q.package!));
  expect(draft.quality!.dropped).toBe(0);
  expect(draft.quality!.issues, JSON.stringify(draft.quality!.issues)).toEqual([]);
  expect(draft.pages.flatMap(p=>p.leftOut ?? [])).toEqual([]);
});

it("measures the capacity before a writer call and protects Friday 5 when optional review does not fit", async () => {
  const o=fixture();
  o.input.plan={...o.input.plan,days:[o.input.plan.days[4],o.input.plan.days[9]].map(d=>({...d,pages:d.pages.filter(p=>p.parts.some(p=>p.kind==="friday-5"))}))};
  let measures=0;
  o.deps.fit={fits:async p=>{measures++;const friday=p.questions.filter(q=>p.content?.kind==="day" && p.content.blocks.find(b=>b.slot==="friday-5")?.items.includes(q.number));
    if (p.questions.length>6) { expect(o.ai.requests).toHaveLength(0); return {ok:false,problems:[{question:null,reason:"the combined blocks exceed the page capacity"}]}; }
    expect(friday).toHaveLength(5); return {ok:true}; }};
  const {draft}=await make(o);
  expect(measures).toBeGreaterThan(2);
  expect(draft.pages.flatMap(p=>p.questions).filter(q=>q.part==="friday-5")).toHaveLength(10);
  expect(draft.quality!.dropped).toBe(0);
  const missing=structuredClone(draft.pages);
  const friday=missing.find(p=>p.questions.some(q=>q.part==="friday-5"))!;
  friday.questions=friday.questions.filter(q=>q.part!=="friday-5");
  expect(workbookQuality(missing).issues.some(i=>i.kind==="coverage")).toBe(true);
  expect(workbookQuality(missing).ready).toBe(false);
});

it("retains the saved policy and examples through generation and editing",async()=>{
  const o=fixture();o.input.plan={...o.input.plan,days:o.input.plan.days.slice(0,1)};
  const {draft}=await make(o);
  const storyPage=draft.pages.find(p=>p.questions.some(q=>q.itemPlan?.source==="story"))!;
  const q=storyPage.questions.find(q=>q.itemPlan?.source==="story")!;
  const before=o.ai.requests.length;
  const edited=await reviseWorkbookPage(o.input,o.deps,storyPage,{question:q.number,note:"Use plain words. Keep the numbers."});
  expect(o.ai.requests.length).toBeGreaterThan(before);
  for (const request of o.ai.requests.slice(before)) {
    const r=JSON.parse((request.content[0] as {text:string}).text);
    expect(r.slots[0].contract.item.operation).toEqual(q.itemPlan!.item.operation);
    expect(r.exampleBank[0].items.length).toBeGreaterThan(1);
  }
  expect(edited.questions.find(x=>x.number===q.number)!.package!.operation).toEqual(q.package!.operation);
  for (const mutate of [(x:object)=>({...x,operation:null}),(x:object)=>({...x,format:"draw"})]) {
    const bad=fakeAiClient({answer:r=>({items:fakeWorkbookItems(r).items.map(x=>mutate(x))})});
    await expect(reviseWorkbookPage(o.input,{...o.deps,ai:bad},storyPage,{question:q.number,note:"Keep the numbers."})).rejects.toThrow(/changed|approved/);
  }
  const drill=draft.pages.find(p=>p.questions.some(q=>q.itemPlan?.source==="code"))!;
  const code=drill.questions.find(q=>q.itemPlan?.source==="code")!;
  const forbidden=fakeAiClient({answer:()=>{throw new Error("a code drill reached AI");}});
  await reviseWorkbookPage(o.input,{...o.deps,ai:forbidden},drill,{question:code.number,note:"Keep the numbers."});
  expect(forbidden.requests).toEqual([]);
});

it("uses a complete code title for every level and prints U4's learning list",()=>{
  for(let level=1;level<=30;level++) {
    const lines=coverTitleLines(workbookCoverTitle(level));
    expect(lines.join(" ").trim()).toBe(workbookCoverTitle(level));
    expect(lines.every(line=>line.length>0 && line.length<=19),`U${level}: ${lines.join(" / ")}`).toBe(true);
  }
  const {input}=fixture();
  const cover=bookPageContent({curriculum:c,plan:workbookCapacityPlan(c,input.plan),child:"Noah",workbook:1,type:"cover",number:1});
  expect(cover).toMatchObject({kind:"cover",levelTitle:"Counting and adding to 20"});
  expect(cover?.kind==="cover" && cover.bullets?.length).toBeGreaterThan(0);
});

const chromium = await findChromium();
it.skipIf(!chromium)("retains both Friday sets through the real template fit check", async()=>{
  const o=fixture();
  o.input.plan={...o.input.plan,days:[o.input.plan.days[4],o.input.plan.days[9]].map(d=>({...d,pages:d.pages.filter(p=>p.parts.some(p=>p.kind==="friday-5"))}))};
  o.deps.fit=renderFitCheck({template:workbookTemplate(await fixedTemplateFonts()),engine:chromiumPrintEngine(),parentId:"11111111-1111-4111-8111-111111111111"});
  const {draft}=await make(o);
  for (const day of [5,10]) {
    const page=draft.pages.find(p=>p.day===day)!;
    expect(page.fit).toEqual({status:"fits"});
    expect(page.questions.filter(q=>q.part==="friday-5")).toHaveLength(5);
    expect(page.omissions ?? []).toEqual([]);
    expect(page.leftOut ?? []).toEqual([]);
  }
},120_000);

it("rejects changed-name duplicates and page and book type excesses through the book check",async()=>{
  const o=fixture();o.input.plan={...o.input.plan,days:o.input.plan.days.slice(0,1)};
  const {draft}=await make(o);
  const source=draft.pages.find(p=>p.questions.some(q=>q.package?.item?.format==="circle"))!;
  const q=source.questions.find(q=>q.package?.item?.format==="circle")!;
  const first={...source,number:101,expected:undefined,questions:[{...q,package:{...q.package!,text:"Will a cup hold water when Jon fills it?"}}]};
  const second={...first,number:102,questions:[{...q,check:{status:"failed" as const,reason:"another failure"},package:{...q.package!,text:"Will a cup hold water when Raj fills it?"}}]};
  expect(workbookQuality([first,second]).issues.some(i=>i.kind==="repeat")).toBe(true);
  const excess={...first,questions:Array.from({length:12},(_,i)=>({...q,number:i+1,package:{...q.package!,text:`Will Jon see a dog today? ${i}`}}))};
  const issues=workbookQuality([excess]).issues;
  expect(issues.some(i=>i.kind==="variety" && i.reason.includes("page limit"))).toBe(true);
  expect(issues.some(i=>i.kind==="variety" && i.reason.includes("half of the book"))).toBe(true);
});

it("saves the measured capacity and contracts before a writer call and reuses that exact plan",async()=>{
  const o=fixture();o.input.plan={...o.input.plan,days:[o.input.plan.days[4]].map(d=>({...d,pages:d.pages.filter(p=>p.parts.some(p=>p.kind==="friday-5"))}))};
  const fit={fits:async(p:Parameters<GenerateDeps["fit"]["fits"]>[0])=>p.questions.length>6?{ok:false as const,problems:[{question:null,reason:"too many cards"}]}:{ok:true as const}};
  const plan=await prepareWorkbookCapacity(o.input,fit);
  expect(o.ai.requests).toEqual([]);
  const p=plan.days[0].pages[0];
  expect(p.capacityChecked).toBe(true);
  expect(Object.keys(p.itemContracts!)).toHaveLength(6);
  expect(p.capacity!.filter(s=>s.slot==="friday-5").reduce((n,s)=>n+s.items,0)).toBe(5);
  const ready={...o.input,plan};
  const hash=bookOutline(ready);
  const {draft}=await make({...o,input:ready});
  expect(draft.pages.find(p=>p.day!==null)!.questions).toHaveLength(6);
  expect(bookOutline(ready)).toBe(hash);
});

it("rejects incorrect fixed benchmarks and decimal representations",()=>{
  for(const skill of ["K3-benchmarks-5-10","1.2-benchmarks-10-20","2.2-benchmarks-25-50-100"]) {
    const p=planItem({skill,slot:"1.1",level:7,day:10,ordinal:4,range:{min:1,max:100,pictures:false,help:"none"}})!;
    p.item.relation!.to=[3,7];expect(skillItemProblem(p)).toMatch(/benchmarks/);
  }
  for(const skill of ["4.2-decimal-place-value","5.2-decimal-place-value"]) {
    const p=planItem({skill,slot:"1.1",level:16,day:10,ordinal:4,range:{min:1,max:100,pictures:false,help:"none"}})!;
    p.item.numbers=[itemNumber(27)];expect(skillItemProblem(p)).toMatch(/decimal/);
  }
});

it("refuses representations that have no approved builder",()=>{
  for(const skill of ["K2-five-frame","2.1-decompose-tens-ones","4.3-benchmarks","6.1-place-value","6.5-compare-order","9.1-compare-order"]) expect(approvedQuestionTypes(skill)).toEqual([]);
});

it("rejects a later Challenge with only an early label change",async()=>{
  const {draft}=await make();
  const early=draft.pages.find(p=>p.day===1 && p.questions.some(q=>q.place==="challenge"))!.questions.find(q=>q.place==="challenge")!;
  const late=draft.pages.find(p=>p.day===10 && p.questions.some(q=>q.place==="challenge"))!;
  const old=late.questions.find(q=>q.place==="challenge")!;
  late.questions=late.questions.map(q=>q===old?{...early,number:old.number,slot:old.slot,package:{...early.package!,difficulty:3}}:q);
  expect(workbookQuality(draft.pages).issues.some(i=>i.page===late.number && i.kind==="challenge")).toBe(true);
});

it("keeps trusted coin givens out of AI parsing and cannot widen a code declaration",()=>{
  expect(JSON.stringify(ITEMS_SCHEMA)).not.toContain('"givens"');
  expect(approvedQuestionTypes("1.11-coin-values")).toEqual([]);
  const given=coinGiven("dime",{kind:"text",index:0});
  const extra=coinGiven("dime",{kind:"text",index:1});
  const raw={slot:"1.1",skill:"1.11-coin-values",difficulty:1,text:"A dime (10¢) is shown. Mia has 10¢. Explain.",format:"written-reason",operation:null,wrongAnswers:[],easier:null,shownWrong:null,figure:null,givens:[given,extra],item:{givens:[given,extra]}};
  const place={id:"coins",workbookId:"00000000-0000-4000-8000-0000000000a1",page:3,question:1,level:6,skills:["1.11-coin-values"]};
  const untrusted=buildQuestion(raw,place);
  expect(untrusted.package?.item?.givens).toBeUndefined();
  const trusted=buildQuestion(raw,{...place,givens:[given]});
  expect(trusted.package?.item?.givens).toEqual([given]);
  expect(scheduledItemProblem(trusted.package!,c,1,"practice")).toMatch(/up to 8/);
  const plan=planItem({skill:"1.1-one-more-less-20",slot:"1.1",level:4,day:1,ordinal:4,range:{min:1,max:8,pictures:false,help:"none"}})!;
  const injected=buildPlannedItem(plan,{...plan.item,givens:[given,extra],item:{givens:[given,extra]}},{...place,level:4,skills:[plan.item.skill]});
  expect(injected.check.status).toBe("checked");
  expect(injected.package?.item?.givens).toBeUndefined();
});

it("refuses an impossible practice page before writing instead of removing its last drill",async()=>{
  const o=fixture();
  const day=o.input.plan.days[0];
  o.input.plan={...o.input.plan,days:[{...day,pages:day.pages.filter(p=>p.parts.some(p=>p.kind==="practice" && p.faded))}]};
  o.deps.fit={fits:async p=>p.questions.length?{ok:false,problems:[{question:null,reason:"no drill can fit"}]}:{ok:true}};
  const result=await generateWorkbook(o.input,o.deps);
  expect(result.status).toBe("refused");
  expect(o.ai.requests).toEqual([]);
  const {draft}=await make();
  const page=draft.pages.find(p=>p.day!==null)!;
  page.questions=[];page.expected=[];
  expect(workbookQuality(draft.pages).issues.some(i=>i.page===page.number && i.kind==="coverage")).toBe(true);
});
