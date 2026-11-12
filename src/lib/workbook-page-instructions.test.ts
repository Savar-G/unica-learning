import { describe, expect, it } from "vitest";
import { Window } from "happy-dom";
import { answerInstruction, printedInstruction, WARM_UP_INSTRUCTION, workbookPageInstruction, workbookWorkLine, workLine, workQuestionNumbers } from "@/lib/workbook-page-instructions";
import { circleProblem } from "@/lib/workbook-layout-check";
import { sampleBook } from "@/lib/workbook-sample-book";
import { workbookTemplate } from "@/lib/workbook-template";
import type { DraftPage, DraftQuestion } from "@/lib/workbook-render";
import type { DayContent } from "@/lib/workbook-page";
import type { ItemFormat, AnswerRegion } from "@/lib/question-package";

const sample = () => sampleBook({level:"U16",workbookId:"55555555-5555-4555-8555-000000000002",childId:"22222222-2222-4222-8222-222222222222",child:"Mila",number:1}).draft;
function question(number: number, text: string, regions: AnswerRegion[], format: ItemFormat = "write-number"): DraftQuestion & { place: "on-your-own" } {
 const source = sample().pages.flatMap(p=>p.questions)[0];
 return {...source,number,place:"on-your-own",package:{...source.package,text,operation:null,
  item:{format,scorable:true,parentChecked:false,error:null,checks:[],regions}}};
}
const box: AnswerRegion = {id:"answer",kind:"box",label:null,answer:{type:"number",value:5}};
const circle: AnswerRegion = {id:"answer",kind:"choice",mark:"circle",label:null,choices:["true","false"],answer:"true"};
function page(questions: DraftQuestion[]): DraftPage & { content: DayContent } {
 const p=sample().pages.find(p=>p.content?.kind==="day")!;
 if(p.content?.kind!=="day")throw new Error("missing day");
 return {...p,questions,content:{...p.content,level:16,consistentLayout:true,subtitle:"Circle your answers. Show your work in the white space under a question.",blocks:[{slot:"on-your-own" as const,items:questions.map(q=>q.number)}]}};
}

describe("truthful printed U16 instructions",()=>{
 it("names boxed, circled and ticked responses without calling every answer circled",()=>{
  const qs=[question(1,"Read the digit.",[box]),question(2,"True or false?",[circle],"circle"),question(3,"Is it right?",[{...circle,mark:"tick"}],"circle")];
  expect(answerInstruction(qs)).toBe("Write in boxes. Circle or tick one choice.");
  const p=page(qs);
  expect(circleProblem(p.content,qs)).toMatch(/does not match/);
  expect(circleProblem({...p.content,subtitle:workbookPageInstruction(p)!},qs)).toBeNull();
 });
 it("requires written work only for the numbered calculation and method questions",()=>{
  const p=page([question(1,"Which digit is in the tens place?",[box]),question(2,"True or false?",[circle],"circle"),question(7,"245 + 126 = ?",[box]),question(8,"Use two methods.",[{id:"method",kind:"work",label:"Method 1"},box],"two-ways")]);
  expect(workQuestionNumbers(p)).toEqual([7,8]);
  // The work is asked on its own line, never in the instruction too (Savar, 2026-11-09).
  expect(workbookPageInstruction(p)).toBe("Write in boxes. Circle one choice.");
  expect(workbookWorkLine(p)).toBe("Show your work under questions 7 and 8.");
 });
 it("does not require work for a warm-up or an error correction solely because its text has arithmetic",()=>{
  const p=page([question(1,"500 + 245 = ?",[box]),question(2,"700 - 245 = ?",[box])]);
  p.content.blocks=[{slot:"warm-up",items:[1]},{slot:"spot-the-error",items:[2]}];
  expect(workQuestionNumbers(p)).toEqual([]);
  expect(workbookWorkLine(p)).toBeNull();
  expect(workbookPageInstruction(p)).toBe("A warm-up on things you learned before. Answer every question in its box.");
 });
 it("prints the warm-up instruction with no timing or counting words on every day, without changing stored text",()=>{
  for(let day=1;day<=10;day++) {
   const p=page([question(1,"500 + 245 = ?",[box])]);
   p.content.day=day;
   p.content.blocks=[{slot:"warm-up",items:[1]}];
   p.content.subtitle="Facts you know. Beat your own count from last time.";
   const before=structuredClone(p),root=new Window().document.createElement("div");
   root.innerHTML=workbookTemplate().page(p,{qr:"",qrUrl:""},sample())!;
   expect(root.querySelector('[data-measure="slot-subtitle"]')?.textContent).toBe("A warm-up on things you learned before. Answer every question in its box.");
   expect(root.textContent).not.toMatch(/Beat your own|Do as many|no timer/);
   expect(p).toEqual(before);
  }
 });
 it("still requires space for a money comparison when it uses a circled answer",()=>{
  const p=page([question(7,"True or false: 2 bills and 3 quarters make 40 dollars.",[circle],"circle")]);
  expect(workQuestionNumbers(p)).toEqual([7]);
  expect(workbookPageInstruction(p)).toBe("Circle one choice.");
  expect(workbookWorkLine(p)).toBe("Show your work under question 7.");
 });
 it("names the real question numbers in plain words, a run of four or more as a range",()=>{
  const p=page([1,2,3,5,7,8,9].map(n=>question(n,"245 + 126 = ?",[box])));
  expect(workbookPageInstruction(p)).toBe("Write in boxes.");
  expect(workbookWorkLine(p)).toBe("Show your work under questions 1, 2, 3, 5, 7, 8 and 9.");
  expect(workLine([1,2,3,4,5,6,8,9])).toBe("Show your work under questions 1 to 6, 8 and 9.");
  expect(workLine([4])).toBe("Show your work under question 4.");
  expect(workLine([])).toBeNull();
 });
 it("prints the work line at every level and takes the old work sentence out of a stored instruction",()=>{
  for(const level of [4,10,15,19]) {
   const p=page([question(1,"Which digit is in the tens place?",[box]),question(7,"245 + 126 = ?",[box])]);p.content.level=level;
   expect(printedInstruction(p)).toBe("Circle your answers.");
   const root=new Window().document.createElement("div");
   root.innerHTML=workbookTemplate().page(p,{qr:"",qrUrl:""},sample())!;
   expect(root.querySelector('[data-measure="slot-subtitle"]')?.textContent).toBe("Circle your answers.");
   expect(root.querySelector('[data-measure="slot-work-line"]')?.textContent).toBe("Show your work under question 7.");
   expect(root.querySelector(".sw b")).not.toBeNull();
  }
  // Only work alone: the page says where to write.
  const p=page([question(7,"245 + 126 = ?",[box])]);p.content.level=12;p.content.subtitle="Show your work in the white space under a question.";
  expect(printedInstruction(p)).toBe("Write in boxes.");
 });
 it("gives a stored warm-up at any level the warm-up instruction in place of its timing words",()=>{
  for(const [level,stored] of [[8,"Facts to 20. Take your time: there is no timer."],[13,"Facts you know. Take your time: there is no timer."],[17,"Facts you know. Beat your own count from last time."]] as const) {
   const p=page([question(1,"5 + 4 = ?",[box])]);p.content.level=level;p.content.subtitle=stored;
   p.content.blocks=[{slot:"warm-up",items:[1],note:"Do as many as you can."}];
   expect(printedInstruction(p)).toBe(WARM_UP_INSTRUCTION);
   const root=new Window().document.createElement("div");
   root.innerHTML=workbookTemplate().page(p,{qr:"",qrUrl:""},sample())!;
   expect(root.querySelector('[data-measure="slot-subtitle"]')?.textContent).toBe(WARM_UP_INSTRUCTION);
   expect(root.textContent).not.toMatch(/Beat your own|Do as many|no timer|Facts to 20|Facts you know/);
   expect(root.querySelector('[data-measure="slot-work-line"]')).toBeNull();
  }
 });
 // (The review of 42bd5a6d: at U8 and U9 the warm-up sentence and "Circle yes or no." ran to 733 px of 688.)
 it("joins the warm-up sentences only on a warm-up page; a stored instruction elsewhere prints as written", () => {
  const qs=[question(1,"5 + 4 = ?",[box])];
  const p=page(qs);p.content.level=15;p.content.consistentLayout=false;p.content.subtitle="Do every question. Write in boxes.";
  p.content.blocks=[{slot:"on-your-own",items:[1]}];
  expect(printedInstruction(p)).toBe("Do every question. Write in boxes.");
  // (A stored warm-up says "Write in boxes." with the retired counting words; the warm-up sentence is added at print.)
  p.content.blocks=[{slot:"warm-up",items:[1]}];p.content.subtitle="Write in boxes. Do as many as you can.";
  expect(printedInstruction(p)).toBe("A warm-up on things you learned before. Answer every question in its box.");
 });
 it.each([8,9,16])("names no choice on a U%s warm-up page: each choice question prints its own cue",level=>{
  const said={...circle,choices:["yes","no"],answer:"yes"};
  const qs=[question(1,"5 + 4 = ?",[box]),question(2,"Is 7 + 6 = 13?",[said],"circle"),question(3,"Is it right?",[{...said,mark:"tick"},{...box,id:"fix"}],"spot-the-error"),question(4,"Is 9 + 9 = 19? Circle yes or no.",[said],"circle")];
  for(const stored of [`${WARM_UP_INSTRUCTION} Circle yes or no.`,"Circle yes or no.",`${WARM_UP_INSTRUCTION} Circle your answers.`]) {
   const p=page(qs);p.content.level=level;p.content.subtitle=stored;
   p.content.blocks=[{slot:"warm-up",items:[1]},{slot:"fix-it",items:[2,3,4]}];
   const expected=level===16?"A warm-up on things you learned before. Answer every question in its box.":WARM_UP_INSTRUCTION;
   expect(printedInstruction(p)).toBe(expected);
   expect(circleProblem({...p.content,subtitle:expected},qs)).toBeNull();
   const root=new Window().document.createElement("div");
   root.innerHTML=workbookTemplate().page(p,{qr:"",qrUrl:""},sample())!;
   expect(root.querySelector('[data-measure="slot-subtitle"]')?.textContent).toBe(expected);
   const card=(n:number)=>root.querySelector(`[data-measure="question-${n}"]`)?.textContent ?? "";
   expect(card(2)).toContain("Circle one");
   expect(card(3)).toContain("Tick one");
   // (Its own text says it already.)
   expect(card(4)).not.toContain("Circle one");
  }
  // Another page keeps its choice words and prints no extra cue.
  const other=page([question(2,"Is 7 + 6 = 13?",[said],"circle")]);other.content.level=level;other.content.subtitle="Circle yes or no.";
  const root=new Window().document.createElement("div");
  root.innerHTML=workbookTemplate().page(other,{qr:"",qrUrl:""},sample())!;
  expect(root.querySelector('[data-measure^="cue-"]')).toBeNull();
  expect(circleProblem({...other.content,subtitle:"Write in boxes."},other.questions)).not.toBeNull();
 });
 it.each([4,10,15,17,19])("keeps U%s outside this first-delivery correction",level=>{
  const p=page([question(1,"245 + 126 = ?",[box])]);p.content.level=level;
  expect(workbookPageInstruction(p)).toBeNull();
 });
 it("prints the numbered instruction without changing stored questions, schedule fields or QR tokens",()=>{
  const p=page([question(1,"Which digit is in the tens place?",[box]),question(7,"245 + 126 = ?",[box])]);
  const book=sample(),before=structuredClone(p),root=new Window().document.createElement("div");
  root.innerHTML=workbookTemplate().page(p,{qr:"",qrUrl:""},book)!;
  expect(root.querySelector('[data-measure="slot-subtitle"]')?.textContent).toBe("Write in boxes.");
  expect(root.querySelector('[data-measure="slot-work-line"]')?.textContent).toBe("Show your work under question 7.");
  expect(p).toEqual(before);
 });
 it("rejects an actually printed header that disagrees with the question-specific instruction",()=>{
  const p=page([question(1,"Which digit is in the tens place?",[box]),question(7,"245 + 126 = ?",[box])]);
  const book=sample(), template=workbookTemplate(), expected=workbookPageInstruction(p)!;
  const measure={sheet:0,name:"slot-subtitle",text:expected,visible:true,textPrinted:true,x:64,y:137,width:688,height:21,clientWidth:688,clientHeight:21,scrollWidth:688,scrollHeight:21};
  const mismatch=(text:string)=>template.fit!(p,new Map([[measure.name,{...measure,text}]]),book).filter(x=>x.reason.includes("printed instruction does not match"));
  expect(mismatch(expected)).toEqual([]);
  expect(mismatch("Circle your answers. Show your work in the white space under a question.")).toHaveLength(1);
  expect(mismatch("Write in boxes. Show your work for questions 1 and 7.")).toHaveLength(1);
 });

});
