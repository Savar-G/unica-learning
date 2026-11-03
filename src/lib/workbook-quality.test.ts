import { expect, it } from "vitest";
import { checkWholeBook, measuredPageUse, workbookQuality } from "./workbook-quality";
import { buildPlannedItem, planItem } from "./workbook-item-plan";
import type { GeneratedPage } from "./workbook-generator";

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
