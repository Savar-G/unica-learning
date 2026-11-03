import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { fakeWorkbookItems } from "@/lib/workbook-ai-fake";
import { memoryDraftStore } from "@/lib/workbook-draft-memory";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { sampleChild, samplePlanInput } from "@/lib/workbook-sample-profiles";
import { planWorkbook } from "@/lib/workbook-plan";
import { generateWorkbook, type FitCheck } from "@/lib/workbook-generator";
import { renderableDraft, renderFitCheck } from "@/lib/workbook-fit";
import { chromiumPrintEngine, findChromium } from "@/lib/print-engine-chromium";
import { renderWorkbook } from "@/lib/workbook-render";
import { workbookTemplate } from "@/lib/workbook-template";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";
import { keySolver } from "@/lib/workbook-solve-check";
import { samProblem } from "@/lib/workbook-book";

const bc=curriculumFor("bc")!;
const chromium=await findChromium();
const parentId="11111111-1111-4111-8111-111111111111";
const childId="22222222-2222-4222-8222-222222222222";
const workbookId="33333333-3333-4333-8333-333333333333";
const num=(value:number)=>({type:"number",value});
const op=(a:number,b:number)=>({kind:"add",operands:[num(a),num(b)],expression:null,unit:null,denominator:null,values:[]});

async function generate(fit:FitCheck) {
  const planned=planWorkbook(samplePlanInput(bc,sampleChild(bc,"U14")!,"first"));
  if(!planned.ok) throw new Error(planned.reason);
  let token=0;
  const result=await generateWorkbook({workbookId,childId,number:1,profileBuild:null,curriculum:bc,
    plan:{...planned.plan,days:planned.plan.days.slice(0,1)},book:{child:"Noah"}}, {
    fit,store:memoryDraftStore({[childId]:parentId}),qrToken:()=>`error-card-${String(++token).padStart(12,"0")}`,solver:keySolver(),
    ai:fakeAiClient({answer:request=>{
      const body=JSON.parse((request.content[0] as {text:string}).text) as {page:number;slots:{slot:string;place:string;skills:string[]}[]};
      const raw=fakeWorkbookItems(request);
      return {items:raw.items.map(item=>{
        const slot=body.slots.find(s=>s.slot===item.slot);
        if(slot?.place!=="spot-the-error") return item;
        const a=body.page===4 ? 28 : 28+body.page*10;
        return {...item,skill:slot.skills[0],text:`${a} + 15 = ?`,format:"spot-the-error",operation:op(a,15),figure:null,
          wrongAnswers:[{value:num(a+5),cause:"forgot-carry",description:"Forgets the carry",step:"tens"}],
          easier:{text:"1 + 1 = ?",operation:op(1,1)},shownWrong:0};
      })};
    }}),
  });
  if(result.status!=="stored") throw new Error(result.status);
  return result.draft;
}

describe("the complete generated error card",()=>{
  it("removes optional drills first, even when the overflow names the required error",async()=>{
    const draft=await generate({fits:async page=>{
      if(page.type!=="practice-2" || page.questions.length<=2) return {ok:true};
      const error=page.content?.kind==="day" ? page.content.blocks.find(b=>b.slot==="spot-the-error")!.items[0] : null;
      return {ok:false,problems:[{question:error,reason:"The complete error card needs more room."}]};
    }});
    const page=draft.pages.find(p=>p.type==="practice-2")!;
    expect(page.fit.status).toBe("fits");
    expect(page.questions.map(q=>q.place)).toEqual(["solve-it-two-ways","spot-the-error"]);
    expect(page.leftOut).toHaveLength(4);
    expect(page.leftOut?.every(q=>q.part==="practice")).toBe(true);
    expect(page.content?.kind==="day" && page.content.blocks.find(b=>b.slot==="spot-the-error")?.items).toHaveLength(1);
  });
  it("keeps the error card and fails the page when no removal can make it fit",async()=>{
    const draft=await generate({fits:async page=>page.type!=="practice-2" ? {ok:true}
      : {ok:false,problems:[{question:page.questions.find(q=>q.package.item?.format==="spot-the-error")?.number ?? null,reason:"No room for the required teaching card."}]}});
    const page=draft.pages.find(p=>p.type==="practice-2")!;
    expect(page.fit.status).toBe("failed");
    expect(page.questions.some(q=>q.place==="spot-the-error")).toBe(true);
    expect(page.leftOut ?? []).toEqual([]);
  });

  it.skipIf(!chromium)("renders a checked three-line U14 error and prints its choice label once",async()=>{
    if(!chromium) throw new Error("Chromium is required for this layout check.");
    const engine=chromiumPrintEngine();
    const template=workbookTemplate(await fixedTemplateFonts());
    const realFit=renderFitCheck({engine,template,parentId});
    const draft=await generate({fits:(page,book)=>page.type==="practice-2" ? realFit.fits(page,book) : Promise.resolve({ok:true})});
    const page=draft.pages.find(p=>p.type==="practice-2")!;
    const error=page.questions.find(q=>q.place==="spot-the-error")!;
    expect(error.check).toEqual({status:"checked"});
    expect(samProblem(error.package!,14)).toBeNull();
    expect(page.questions).toHaveLength(6);
    expect(page.fit.status).toBe("fits");
    expect(page.leftOut ?? []).toEqual([]);
    expect(page.content?.kind==="day" && page.content.blocks.find(b=>b.slot==="spot-the-error")?.lines).toHaveLength(3);
    expect(error.package!.item?.regions.find(r=>r.kind==="choice")?.label).toBe("Is it right?");
    const renderable=renderableDraft(draft);
    const renderPage=renderable.pages.find(p=>p.number===page.number)!;
    const result=await renderWorkbook({draft:{...renderable,pages:[renderPage]},parentId,template,
      engine:{print:async job=>{
        const out=await engine.print(job);
        const text=out.measured.find(m=>m.name===`question-${error.number}`)!.text;
        expect(text.match(/Is it right\?/g)).toHaveLength(1);
        await mkdir("/tmp/ui-review/481-correction",{recursive:true});
        await writeFile("/tmp/ui-review/481-correction/u14-error.png",out.images[0].png);
        return out;
      }}});
    expect(result.status==="failed" ? result.problems : []).toEqual([]);
  },60_000);
});
