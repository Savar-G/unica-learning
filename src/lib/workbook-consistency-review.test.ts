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
import { storyFrame } from "./workbook-task-identity";
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
      if (p!.type === "places") expect(b.package?.text).toContain(String(p!.item.numbers[0].value));
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
  // #489: every Challenge comes from the hardest step reached that day, so Day 10's is above Day 1's.
  const challenges = draft.pages.flatMap(p=>p.questions.filter(q=>q.place==="challenge").map(q=>({q,day:p.day!})));
  expect(challenges.length).toBeGreaterThanOrEqual(20);
  // The book check's Challenge rules (#489): each page's first question on the hardest step reached that day, every
  // question harder than that day's practice of its step.
  const challengeIssues=workbookQuality(draft.pages).issues.filter(i=>i.kind==="challenge");
  expect(challengeIssues,JSON.stringify(challengeIssues)).toEqual([]);
  const firsts = challenges.filter(({q})=>q.number===1);
  expect(firsts.at(-1)!.q.itemPlan!.template!.rank).toBeGreaterThan(firsts[0].q.itemPlan!.template!.rank);
  expect(draft.quality!.dropped).toBe(0);
  expect(draft.quality!.issues, JSON.stringify(draft.quality!.issues)).toEqual([]);
  expect(draft.pages.flatMap(p=>p.leftOut ?? [])).toEqual([]);
});

it("measures the capacity before a writer call and protects Friday 5 when optional review does not fit", async () => {
  const o=fixture();
  o.input.plan={...o.input.plan,days:[o.input.plan.days[4],o.input.plan.days[9]].map(d=>({...d,pages:d.pages.filter(p=>p.parts.some(p=>p.kind==="friday-5"))}))};
  o.deps.fit={fits:async()=>({ok:false,problems:[{question:null,reason:"the template has fewer than the required nine places"}]})};
  await expect(generateWorkbook(o.input,o.deps)).resolves.toMatchObject({status:"refused"});
  expect(o.ai.requests).toHaveLength(0);

});

it("retains the saved policy and examples through generation and editing",async()=>{
  const o=fixture();o.input.plan={...o.input.plan,days:o.input.plan.days.slice(0,1)};
  const {draft}=await make(o);
  const storyPage=draft.pages.find(p=>p.questions.some(q=>q.itemPlan?.source==="story"))!;
  const q=storyPage.questions.find(q=>q.itemPlan?.source==="story")!;
  const before=o.ai.requests.length;
  const edited=await reviseWorkbookPage(o.input,o.deps,storyPage,{question:q.number,note:"Use plain words. Keep the numbers."});
  // (The writer edits no story text, Codex at cb78c56b, B1 final: an edit of a story asks it nothing and keeps code's
  // words, its numbers and its operation.)
  expect(o.ai.requests.length).toBe(before);
  expect(edited.questions.find(x=>x.number===q.number)!.package!.text).toBe(q.package!.text);
  expect(edited.questions.find(x=>x.number===q.number)!.package!.operation).toEqual(q.package!.operation);
  const numbers=(t:string)=>(t.match(/\d+/g) ?? []).join(",");
  const renumber=fakeAiClient({answer:r=>({items:fakeWorkbookItems(r).items.map(x=>({...x,text:(x as {text:string}).text.replace(/\d+/,n=>String(Number(n)+1))}))})});
  const kept=await reviseWorkbookPage(o.input,{...o.deps,ai:renumber},storyPage,{question:q.number,note:"Keep the numbers."});
  expect(numbers(kept.questions.find(x=>x.number===q.number)!.package!.text)).toBe(numbers(q.itemPlan!.item.text));
  expect(renumber.requests).toHaveLength(0);
  // A manual edit of a story's words is refused (Codex at 09a095cd: "Mia" to "Ben", "How many crayons" to "How many
  // boxes" saved with code's key).
  const text = q.itemPlan!.item.text;
  const who = /\b([A-Z][a-z]+)\b/.exec(text.replace(/^(?:A|An|The|How|What)\b/, ""))![1];
  const thing = /How many ([a-z]+)/.exec(text)?.[1];
  const swaps = [text.replace(new RegExp(`\\b${who}\\b`, "g"), who === "Ben" ? "Mia" : "Ben"), ...(thing ? [text.replace(`How many ${thing}`, "How many boxes")] : [])];
  for (const swapped of swaps) {
    expect(swapped).not.toBe(text);
    await expect(reviseWorkbookPage(o.input, o.deps, storyPage, { question: q.number, note: "Manual edit.", items: { [q.number]: { ...q.itemPlan!.item, text: swapped } } }))
      .rejects.toThrow("Stories print the generator's own wording. Change the numbers or regenerate the question instead.");
  }
  const drill=draft.pages.find(p=>p.questions.some(q=>q.itemPlan?.source==="code"))!;
  const code=drill.questions.find(q=>q.itemPlan?.source==="code")!;
  const forbidden=fakeAiClient({answer:()=>{throw new Error("a code drill reached AI");}});
  await reviseWorkbookPage(o.input,{...o.deps,ai:forbidden},drill,{question:code.number,note:"Keep the numbers."});
  expect(forbidden.requests).toEqual([]);
});

it("uses a complete code title for every level and prints U4's single learning sentence",()=>{
  for(let level=1;level<=30;level++) {
    const lines=coverTitleLines(workbookCoverTitle(level));
    expect(lines.join(" ").trim()).toBe(workbookCoverTitle(level));
    expect(lines.every(line=>line.length>0 && line.length<=19),`U${level}: ${lines.join(" / ")}`).toBe(true);
  }
  const {input}=fixture();
  const cover=bookPageContent({curriculum:c,plan:workbookCapacityPlan(c,input.plan),child:"Noah",workbook:1,type:"cover",number:1});
  expect(cover).toMatchObject({kind:"cover",levelTitle:"Numbers to 20"});
  expect(cover?.kind==="cover" && cover.bullets).toEqual([]);
  expect(cover?.kind==="cover" && cover.sentence).toBe("Noah will count, read and write numbers up to 20, and learn how numbers split into smaller parts.");
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
  const fit={fits:async(p:Parameters<GenerateDeps["fit"]["fits"]>[0])=>p.questions.length>9?{ok:false as const,problems:[{question:null,reason:"too many cards"}]}:{ok:true as const}};
  const plan=await prepareWorkbookCapacity(o.input,fit);
  expect(o.ai.requests).toEqual([]);
  const p=plan.days[0].pages[0];
  expect(p.capacityChecked).toBe(true);
  expect(Object.keys(p.itemContracts!)).toHaveLength(9);
  expect(p.capacity!.filter(s=>s.slot==="friday-5").reduce((n,s)=>n+s.items,0)).toBe(5);
  const ready={...o.input,plan};
  const hash=bookOutline(ready);
  const {draft}=await make({...o,input:ready});
  expect(draft.pages.find(p=>p.day!==null)!.questions).toHaveLength(9);
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

it("keeps uncovered U14 skills on the existing writer and preserves their policy in edits",async()=>{
  const o=fixture();
  const result=planWorkbook(samplePlanInput(c,sampleChild(c,"U14")!,"first"));
  if(!result.ok)throw new Error(result.reason);
  o.input.plan={...result.plan,days:result.plan.days.slice(0,1)};
  const {draft}=await make(o);
  const questions=draft.pages.flatMap(p=>p.questions);
  // #489: the level's skills come from their step templates; the warm-up's fluency facts keep the existing writer.
  expect(questions.some(q=>q.itemPlan?.template && q.package?.skill.skills.includes("4.5-multiply-1-digit"))).toBe(true);
  expect(questions.some(q=>q.existing && q.place==="warm-up")).toBe(true);
  expect(questions.filter(q=>q.check.status==="failed").map(q=>q.check)).toEqual([]);
  const requests=o.ai.requests.map(r=>JSON.parse((r.content[0] as {text:string}).text));
  expect(requests.some(r=>r.slots.some((s:{contract?:unknown;place?:string})=>!s.contract && s.place==="warm-up"))).toBe(true);
  const page=draft.pages.find(p=>p.questions.some(q=>q.existing && q.package && q.place!=="spot-the-error"))!;
  const q=page.questions.find(q=>q.existing && q.package && q.place!=="spot-the-error")!;
  const edited=await reviseWorkbookPage(o.input,o.deps,page,{question:q.number,note:"Keep the numbers."});
  expect(edited.questions.find(x=>x.number===q.number)!.package!.operation).toEqual(q.package!.operation);
});

it("keeps checked teaching panels when the whole-book pass repairs a saved question",async()=>{
  const o=fixture();o.input.plan={...o.input.plan,days:o.input.plan.days.slice(0,1)};
  const saved=new Map<number,import('./workbook-generator').GeneratedPage>();
  let loads=0;
  o.deps.pages={load:async()=>{
    loads++;
    const pages=structuredClone([...saved.values()]);
    if(loads>1) {
      const first=pages.find(p=>p.number===3)!;
      const teaching=pages.find(p=>p.number===4)!;
      teaching.questions[0].package=structuredClone(first.questions[0].package);
    }
    return pages;
  },save:async p=>{saved.set(p.number,structuredClone(p));}};
  const {draft}=await make(o);
  const before=saved.get(4)!;
  const after=draft.pages.find(p=>p.number===4)!;
  expect(after.questions[0].package).not.toEqual(before.questions[0].package && saved.get(3)!.questions[0].package);
  expect(after.content?.kind==="day" && after.content.blocks.filter(b=>b.slot==="worked-example"))
    .toEqual(before.content?.kind==="day" && before.content.blocks.filter(b=>b.slot==="worked-example"));
  expect(after.panelExamples).toEqual(before.panelExamples);
  const empty=structuredClone(after);
  if(empty.content?.kind!=="day") throw Error("missing day content");
  const panel=empty.content.blocks.find(b=>b.slot==="worked-example")!;
  Object.assign(panel,{methods:[],lines:[],figure:undefined});
  expect(workbookQuality([empty]).issues.some(i=>i.kind==="coverage" && i.reason.includes("panel"))).toBe(true);
});

it("rejects an exact code task on another practice page and confines the fluency exception to warm-up",async()=>{
  const o=fixture();o.input.plan={...o.input.plan,days:o.input.plan.days.slice(0,1)};
  const {draft}=await make(o);
  const first=draft.pages.find(p=>p.questions.some(q=>q.itemPlan?.template))!;
  const q=first.questions.find(q=>q.itemPlan?.template)!;
  for(const existing of [false,true]) {
    const a={...first,number:101,expected:undefined,questions:[{...q,existing}]};
    const b={...a,number:102};
    expect(workbookQuality([a,b]).issues.some(i=>i.kind==="repeat")).toBe(true);
    a.questions[0].place="warm-up";
    b.questions=[{...a.questions[0]}];
    expect(workbookQuality([a,b]).issues.some(i=>i.kind==="repeat")).toBe(false);
  }
});
