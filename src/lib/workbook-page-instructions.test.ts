import { describe, expect, it } from "vitest";
import { Window } from "happy-dom";
import { answerInstruction, workbookPageInstruction, workQuestionNumbers } from "@/lib/workbook-page-instructions";
import { circleProblem } from "@/lib/workbook-layout-check";
import { sampleBook } from "@/lib/workbook-sample-book";
import { workbookTemplate } from "@/lib/workbook-template";
import type { DraftPage, DraftQuestion } from "@/lib/workbook-render";
import type { DayContent } from "@/lib/workbook-page";
import type { ItemFormat, AnswerRegion } from "@/lib/question-package";

const sample = () => sampleBook({level:"U16",workbookId:"55555555-5555-4555-8555-000000000002",childId:"22222222-2222-4222-8222-222222222222",child:"Mila",number:1}).draft;
function question(number: number, text: string, regions: AnswerRegion[], format: ItemFormat = "write-number"): DraftQuestion {
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
  expect(workbookPageInstruction(p)).toBe("Write in boxes. Circle one choice. Show your work for questions 7 and 8.");
 });
 it("does not require work for a warm-up or an error correction solely because its text has arithmetic",()=>{
  const p=page([question(1,"500 + 245 = ?",[box]),question(2,"700 - 245 = ?",[box])]);
  p.content.blocks=[{slot:"warm-up",items:[1]},{slot:"spot-the-error",items:[2]}];
  expect(workQuestionNumbers(p)).toEqual([]);
  expect(workbookPageInstruction(p)).toBe("Write in boxes. Beat your own count from last time.");
 });
 it("retains the warm-up count task in every day's printed instruction without changing stored text",()=>{
  for(let day=1;day<=10;day++) {
   const p=page([question(1,"500 + 245 = ?",[box])]);
   p.content.day=day;
   p.content.blocks=[{slot:"warm-up",items:[1]}];
   p.content.subtitle="Facts you know. Beat your own count from last time.";
   const before=structuredClone(p),root=new Window().document.createElement("div");
   root.innerHTML=workbookTemplate().page(p,{qr:"",qrUrl:""},sample())!;
   expect(root.querySelector('[data-measure="slot-subtitle"]')?.textContent).toBe("Write in boxes. Beat your own count from last time.");
   expect(p).toEqual(before);
  }
 });
 it("still requires space for a money comparison when it uses a circled answer",()=>{
  const p=page([question(7,"True or false: 2 bills and 3 quarters make 40 dollars.",[circle],"circle")]);
  expect(workQuestionNumbers(p)).toEqual([7]);
  expect(workbookPageInstruction(p)).toBe("Circle one choice. Show your work for question 7.");
 });
 it("compresses three consecutive numbers while preserving gaps and the last number",()=>{
  const p=page([1,2,3,5,7,8,9].map(n=>question(n,"245 + 126 = ?",[box])));
  expect(workbookPageInstruction(p)).toBe("Write in boxes. Show your work for questions 1-3, 5 and 7-9.");
 });
 it.each([4,10,15,17,19])("keeps U%s outside this first-delivery correction",level=>{
  const p=page([question(1,"245 + 126 = ?",[box])]);p.content.level=level;
  expect(workbookPageInstruction(p)).toBeNull();
 });
 it("prints the numbered instruction without changing stored questions, schedule fields or QR tokens",()=>{
  const p=page([question(1,"Which digit is in the tens place?",[box]),question(7,"245 + 126 = ?",[box])]);
  const book=sample(),before=structuredClone(p),root=new Window().document.createElement("div");
  root.innerHTML=workbookTemplate().page(p,{qr:"",qrUrl:""},book)!;
  expect(root.querySelector('[data-measure="slot-subtitle"]')?.textContent).toBe("Write in boxes. Show your work for question 7.");
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
