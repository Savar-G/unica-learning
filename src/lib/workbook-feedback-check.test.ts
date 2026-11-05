import { describe, expect, it } from "vitest";
import { feedbackItemProblem, instructionProblem, scheduledItemProblem, estimatedDayMinutes, dayTimeProblem, generatedDayTime, requiredTimeProblem } from "@/lib/workbook-feedback-check";
import { dayHeader, bookPageContent } from "@/lib/workbook-book";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { sampleChild, samplePlanInput } from "@/lib/workbook-sample-profiles";
import { planWorkbook } from "@/lib/workbook-plan";
import { sampleBook } from "@/lib/workbook-sample-book";
import { fullnessProblem, pageFullness } from "@/lib/workbook-template";
import { operationResult, workedSteps, type QuestionPackage } from "@/lib/question-package";
import type { MeasuredElement } from "@/lib/workbook-render";
import type { Block } from "@/lib/workbook-page";

const BC = curriculumFor("bc")!;
const sample = sampleBook({ level: "U4", workbookId: "11111111-1111-4111-8111-111111111111", childId: "22222222-2222-4222-8222-222222222222", child: "Noah" }).draft;
const page = sample.pages[2];
const q = (over: Partial<QuestionPackage> = {}): QuestionPackage => {
  const operation: QuestionPackage["operation"] = over.operation ?? {kind:"add",operands:[3,5]};
  const easier = {kind:"add" as const,operands:[1,2] as [number,number]};
  return { ...page.questions[0].package, level:4, text:"3 + 5 = ?", operation,
    skill:{standard:"1.1",skills:["1.1-count-to-20"]}, item:undefined,
    answer:{value:operationResult(operation),accepted:[],unit:null},
    wrongAnswers:[{value:{type:"number",value:0},cause:"careless",description:"A different answer",step:null}],
    easierExample:{text:"1 + 2 = ?",operation:easier,answer:operationResult(easier),steps:workedSteps(easier)},
    steps:workedSteps(operation), ...over };
};

it("estimates required questions, teaching panels and page turns from whole Extra blocks", () => {
  if (page.content?.kind !== "day") throw new Error("not a day");
  const blocks: Block[] = [{ slot: "on-your-own", items: [1] }, { slot: "reminder", items: [], extra: true },
    { slot: "challenge", items: [2], extra: true }];
  const printed = { ...page, questions: [{ number: 1, package: q() }, { number: 2, package: q() }], content: {
    ...page.content, blocks,
  } };
  expect(generatedDayTime([printed])).toEqual({ minutes: 3.1, requiredMinutes: 2.3, hasExtra: true });
  // An unassigned question, or one also in a required block, cannot become optional.
  printed.content.blocks[2].items = [];
  expect(generatedDayTime([printed]).requiredMinutes).toBe(2.6);
  printed.content.blocks[2].items = [2];
  printed.content.blocks[0].items.push(2);
  expect(generatedDayTime([printed]).requiredMinutes).toBe(2.6);
  printed.questions[1].package = q({ text: "Explain ".repeat(200) });
  expect(generatedDayTime([printed]).requiredMinutes).toBeGreaterThan(2.6);
});

it("accepts exactly 20 or 25 required minutes and rejects an invalid target", () => {
  expect(requiredTimeProblem(20, 20)).toBeNull();
  expect(requiredTimeProblem(20.01, 20)).not.toBeNull();
  expect(requiredTimeProblem(25, 25)).toBeNull();
  expect(requiredTimeProblem(25.01, 25)).not.toBeNull();
  for (const target of [0, -1, NaN, Infinity]) expect(requiredTimeProblem(10, target)).not.toBeNull();
});

describe("Savar's workbook feedback as permanent checks", () => {
  it("refuses missing instructions, internal unit labels and the rejected wording", () => {
    for (const text of ["", "Watch one. Finish two.", "Two to stretch you.", "Unit B: use never.", "Do it.\nTry it."]) expect(instructionProblem(text)).not.toBeNull();
    expect(instructionProblem("Read how it works, then try it.")).toBeNull();
  });
  it("keeps instructions and adult guidance correct on every planned page", () => {
    for (const level of BC.levels.map(l=>l.id)) {
      const plan = planWorkbook(samplePlanInput(BC,sampleChild(BC,level)!,"first"));
      if (!plan.ok) throw new Error(plan.reason);
      expect(plan.plan.timeTarget.max).toBeLessThanOrEqual(30);
      expect(plan.plan.timeTarget.min).toBeLessThanOrEqual(plan.plan.timeTarget.max);
      for (const day of plan.plan.days) for (const page of day.pages) {
        const h=dayHeader(BC,page,plan.plan.level);
        expect(instructionProblem(h.subtitle)).toBeNull();
        if (plan.plan.level>3) expect(h.grownUp).toBeNull();
        if (page.type==="challenge") expect(h).toMatchObject({title:"Challenge",subtitle:"Test yourself."});
      }
      const cover=bookPageContent({curriculum:BC,plan:plan.plan,child:"Noah",workbook:1,type:"cover",number:1});
      expect(cover.kind==="cover" && cover.bullets).toHaveLength(0);
      expect(cover.kind==="cover" && cover.sentence).toMatch(/^Noah will .+\.$/);
    }
  });
  it("rejects abstract drawings and tracing after Kindergarten", () => {
    const draw={format:"draw",scorable:false,parentChecked:true,error:null,regions:[],checks:[]} as const;
    for(const text of ["Draw an always.","Draw likely wind.","Draw a sure win.","Draw 7 eggs.","Draw a triangle.","Trace 7."])
      expect(feedbackItemProblem(q({text,item:structuredClone(draw) as unknown as QuestionPackage["item"]}))).not.toBeNull();
    expect(feedbackItemProblem(q({text:"Draw 7 as a ten-frame.",item:structuredClone(draw) as unknown as QuestionPackage["item"]}))).not.toBeNull();
    const colour={...structuredClone(draw),format:"colour-or-shade",figure:{kind:"ten-frame",counters:[0]}} as unknown as QuestionPackage["item"];
    expect(feedbackItemProblem(q({text:"Colour in 7 cells.",item:colour}))).toBeNull();
    expect(feedbackItemProblem(q({text:"Trace 7.",level:2}))).toBeNull();
    expect(feedbackItemProblem(q({skill:{standard:"1.10",skills:["1.10-likelihood-words"]}}))).toMatch(/circle/);
  });
  it("rejects larger early numbers and late picture support", () => {
    expect(scheduledItemProblem(q(),BC,1,"practice")).toBeNull();
    expect(scheduledItemProblem(q({text:"7 + 8 = ?",operation:{kind:"add",operands:[7,8]}}),BC,1,"practice")).toMatch(/up to 8/);
    const item={format:"write-number",scorable:true,parentChecked:false,error:null,regions:[],checks:[],figure:{kind:"dots",groups:[3,5],takenAway:0}} as const;
    expect(scheduledItemProblem(q({item:structuredClone(item) as unknown as QuestionPackage["item"]}),BC,8,"practice")).toMatch(/no picture/);
  });
  it("fails closed if page fullness cannot be measured or falls below 85 percent", () => {
    const measured = new Map<string,MeasuredElement>();
    expect(pageFullness(page,measured)).toBeNull();
    expect(fullnessProblem(page,measured)).not.toBeNull();
    const m={visible:true,clientHeight:700,y:200,height:700} as MeasuredElement;
    measured.set("slot-content",m);
    for(const question of page.questions) measured.set(`question-${question.number}`,{...m,height:500});
    // (A day page never leaves its bottom empty, Savar 2026-11-04.)
    expect(fullnessProblem(page,measured)).toMatch(/occupy|empty at the bottom/);
    for(const question of page.questions) measured.set(`question-${question.number}`,{...m,height:660});
    expect(fullnessProblem(page,measured)).toBeNull();
  });
  it("includes worked-example reading time and refuses a day estimate of 35 minutes or more", () => {
    expect(estimatedDayMinutes(Array.from({length:50},()=>q()),4)).toBe(19);
    expect(estimatedDayMinutes(Array.from({length:100},()=>q()),4)).toBeGreaterThan(30);
    expect(dayTimeProblem(Array.from({length:200},()=>q()),4)).toMatch(/under 35/);
  });
});

it("excludes a 164 px empty gap from occupied space and rejects it even at the item maximum",()=>{
  const p={...page,content:page.content?.kind==="day"?{...page.content,blocks:[],fillingComplete:true}:page.content,questions:page.questions.slice(0,2)};
  const m=(name:string,y:number,height:number)=>({name,visible:true,y,height,clientHeight:height} as MeasuredElement);
  const measured=new Map([["slot-content",m("slot-content",0,700)],["question-1",m("question-1",0,268)],["question-2",m("question-2",432,268)]]);
  expect(pageFullness(p,measured)).toBeCloseTo(536/700);
  expect(fullnessProblem(p,measured)).toMatch(/164 px unoccupied gap/);
});
