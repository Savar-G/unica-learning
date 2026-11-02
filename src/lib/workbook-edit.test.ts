import { beforeAll, describe, expect, it, vi } from "vitest";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { generateWorkbook, type GeneratedWorkbook, type GenerateInput } from "@/lib/workbook-generator";
import { planLevel, planWorkbook } from "@/lib/workbook-plan";
import { fakeWorkbookItems, workbookFakeAi } from "@/lib/workbook-ai-fake";
import { keySolver } from "@/lib/workbook-solve-check";
import { memoryDraftStore } from "@/lib/workbook-draft-memory";
import { memoryWorkbookReview } from "@/lib/workbook-edit-memory";
import { runWorkbookEdit, type EditJobDeps, type EditSnapshot } from "@/lib/workbook-edit";
import { workbookEditItem } from "@/lib/workbook-edit-item";
import { fakeAiClient } from "@/lib/ai-client-fake";

const ID="00000000-0000-4000-8000-0000000000a1", CHILD="00000000-0000-4000-8000-0000000000c1", PARENT="00000000-0000-4000-8000-0000000000f1";
const curriculum=curriculumFor("bc")!;
const planned=planWorkbook({ profile:{standards:[]}, grade:1, level:planLevel(curriculum,"U3")!, passed:{}, workbook:{number:1,inLevel:0}, reviews:[],missedReviews:[],misses:[],pausedWeeks:0,support:null,unassessedUnits:[] });
if(!planned.ok) throw new Error(planned.reason);
const input:GenerateInput={workbookId:ID,childId:CHILD,number:1,profileBuild:null,plan:planned.plan,curriculum,book:{child:"Test"}};
const fit={fits:async()=>({ok:true as const})}, drafts=memoryDraftStore({[CHILD]:PARENT});
const gen={ai:workbookFakeAi({NODE_ENV:"test",WORKBOOK_AI_FAKE:"on"})!,solver:keySolver(),fit,store:drafts,qrToken:()=>`token-${++serial}`.padEnd(22,"x")};
let serial=0, original:GeneratedWorkbook;
beforeAll(async()=>{ const result=await generateWorkbook(input,gen); if(result.status!=="stored") throw new Error(result.status); original=result.draft; });
function setup(status:"draft"|"approved"|"printed"|"shipped"="draft") {
  const snapshot:EditSnapshot={draft:structuredClone(original),rendering:{pdfPath:"old.pdf",pages:original.pages.map(p=>({number:p.number,image:{path:`old-${p.number}.png`,width:816,height:1056},questions:[]}))},problems:[],revision:1,input,parentId:PARENT};
  const review=memoryWorkbookReview(snapshot,{status});
  const renderPage=vi.fn<EditJobDeps["renderPage"]>(async(s,d,n)=>({page:{number:n,image:{path:`new-${n}.png`,width:816,height:1056},questions:[]},paths:[`new-${n}.png`]}));
  const assemble=vi.fn<EditJobDeps["assemble"]>(async()=>({pdfPath:"new.pdf",paths:["new.pdf"]}));
  const remove=vi.fn(async()=>{});
  const deps:EditJobDeps={store:review.store,runner:"mac",newId:()=>`lease-${++serial}`,generation:gen,renderPage,assemble,remove};
  const pages=original.pages.filter(p=>p.questions.some(q=>q.package?.operation));
  const comment=(page=pages[0].number,question:number|null=pages[0].questions.find(q=>q.package?.operation)!.number,item:unknown=null)=>review.save({draftId:ID,revision:review.snapshot().revision,page,question,x:.2,y:.2,note:"Use apples",item,actor:{id:"admin",email:"admin@example.com"},createdAt:"2026-11-01T20:00:00Z"});
  const send=()=>{ const r=review.send(review.snapshot().revision,deps.runner); if(r.status!=="queued") throw new Error(r.reason); return r.id; };
  return {review,deps,renderPage,assemble,remove,pages,comment,send};
}
describe("workbook comment batches",()=>{
  it("saves comments without touching content, files, checks or the revision",()=>{ const s=setup(); const before=s.review.snapshot();s.comment(); expect(s.review.snapshot()).toEqual(before);expect(s.renderPage).not.toHaveBeenCalled();expect(s.assemble).not.toHaveBeenCalled(); });
  it("groups question comments on a page into one AI request, renders only that page and assembles once",async()=>{
    const s=setup();const page=s.pages.find(p=>p.questions.filter(q=>q.package?.operation).length>=2)!;
    const qs=page.questions.filter(q=>q.package?.operation).slice(0,2);qs.forEach(q=>s.comment(page.number,q.number));
    const ai=gen.ai, call=vi.spyOn(ai,"json");call.mockClear();
    expect(await runWorkbookEdit(s.send(),s.deps)).toBe("done");
    expect(call).toHaveBeenCalledTimes(1);expect(s.renderPage.mock.calls.map(c=>c[2])).toEqual([page.number]);expect(s.assemble).toHaveBeenCalledTimes(1);
    const after=s.review.snapshot();expect(after.draft.pages.filter(p=>p.number!==page.number)).toEqual(original.pages.filter(p=>p.number!==page.number));
    expect(s.review.comments.every(c=>c.status==="done"&&c.before&&c.after)).toBe(true);call.mockRestore();
  });
  it("applies exact fields with no writer call and derives answers from numbers",async()=>{
    const s=setup();const q=s.pages[0].questions.find(q=>q.package?.operation)!;const item=workbookEditItem(q)!;
    item.text=q.package!.text; const ai=vi.spyOn(gen.ai,"json");ai.mockClear();s.comment(s.pages[0].number,q.number,{...item,answer:{value:999}});
    expect(await runWorkbookEdit(s.send(),s.deps)).toBe("done");expect(ai).not.toHaveBeenCalled();
    expect(s.review.snapshot().draft.pages.find(p=>p.number===s.pages[0].number)!.questions.find(x=>x.number===q.number)!.package!.answer).toEqual(q.package!.answer);ai.mockRestore();
  });
  it("lets a page comment cover the whole page and resets approval",async()=>{const s=setup("approved");s.comment(s.pages[0].number,null);expect(await runWorkbookEdit(s.send(),s.deps)).toBe("done");expect(s.review.status()).toBe("draft");expect(s.review.revisions).toHaveLength(2);});
  for(const status of ["printed","shipped"] as const) it(`refuses comments on ${status} workbooks`,()=>{const s=setup(status);expect(s.comment().status).toBe("refused");expect(s.review.send(1,"mac").status).toBe("refused");});
  it("two simultaneous sends accept one and refuse the other with reload",async()=>{const s=setup();s.comment();const results=await Promise.all([Promise.resolve().then(()=>s.review.send(1,"mac")),Promise.resolve().then(()=>s.review.send(1,"mac"))]);expect(results.map(r=>r.status).sort()).toEqual(["queued","refused"]);expect(results.find(r=>r.status==="refused")).toMatchObject({reason:expect.stringMatching(/Reload/)});});
  it("rejects a late render from a replaced lease",async()=>{const s=setup();s.comment();const id=s.send();const claim=await s.review.store.claim(id,"old","mac");expect(claim).toBeTruthy();s.review.batches.get(id)!.lease="new";expect((await s.review.store.finish(id,"old",{draft:original,rendering:s.review.snapshot().rendering!,problems:[]})).status).toBe("refused");expect(s.review.snapshot().revision).toBe(1);});
  it("keeps old content and failed comments when the AI fails",async()=>{const s=setup();s.comment();const before=s.review.snapshot();s.deps.generation={...gen,ai:fakeAiClient({answer:()=>{throw new Error("fake failure");}})};expect(await runWorkbookEdit(s.send(),s.deps)).toBe("failed");expect(s.review.snapshot()).toEqual(before);expect(s.review.comments[0].status).toBe("failed");expect(s.assemble).not.toHaveBeenCalled();});
  it("keeps a failed page pending while committing another page once",async()=>{const s=setup();s.comment(s.pages[0].number,null);s.comment(s.pages[1].number,null);s.renderPage.mockImplementation(async(snap,d,n)=>{if(n===s.pages[1].number)throw new Error("fake print failure");return {page:{number:n,image:{path:"new.png",width:816,height:1056},questions:[]},paths:["new.png"]};});expect(await runWorkbookEdit(s.send(),s.deps)).toBe("done");expect(s.review.comments.map(c=>c.status)).toEqual(["done","failed"]);expect(s.review.comments[1].revision).toBe(2);expect(s.assemble).toHaveBeenCalledTimes(1);});
  it("flags an unsent comment whose question was removed by a page replacement",async()=>{const s=setup();s.comment(s.pages[0].number,null);const id=s.send();s.comment();await s.review.store.claim(id,"lease","mac");const next=structuredClone(original);next.pages.find(p=>p.number===s.pages[0].number)!.questions=[];await s.review.store.finish(id,"lease",{draft:next,rendering:s.review.snapshot().rendering!,problems:[]});expect(s.review.comments[1].status).toBe("stale");});
  for(const runner of ["mac","server"] as const) it(`runs the ${runner} queue only in its selected place`,async()=>{const s=setup();s.deps.runner=runner;s.comment();const id=s.send();expect(await runWorkbookEdit(id,{...s.deps,runner:runner==="mac"?"server":"mac"})).toBe("not-claimed");expect(await runWorkbookEdit(id,s.deps)).toBe("done");});
  it("resumes after a page checkpoint without another AI request or render for that page",async()=>{
    const s=setup();s.comment(s.pages[0].number,null);s.comment(s.pages[1].number,null);
    s.deps.shouldYield=()=>s.renderPage.mock.calls.length>=1;s.deps.handOff=vi.fn(async()=>{});
    const id=s.send(),ai=vi.spyOn(gen.ai,"json");ai.mockClear();
    expect(await runWorkbookEdit(id,s.deps)).toBe("handed-on");expect(s.assemble).not.toHaveBeenCalled();
    s.deps.shouldYield=()=>false;expect(await runWorkbookEdit(id,s.deps)).toBe("done");
    expect(s.renderPage.mock.calls.map(c=>c[2])).toEqual([s.pages[0].number,s.pages[1].number]);expect(ai).toHaveBeenCalledTimes(2);expect(s.assemble).toHaveBeenCalledTimes(1);ai.mockRestore();
  });
  it("keeps files after a lost commit response that may follow a committed revision",async()=>{
    const s=setup();s.comment();const finish=s.review.store.finish;
    s.review.store.finish=async(...args)=>{await finish(...args);throw new Error("response lost");};
    expect(await runWorkbookEdit(s.send(),s.deps)).toBe("failed");expect(s.review.snapshot().revision).toBe(2);expect(s.remove).not.toHaveBeenCalled();
  });

  it("lets the AI select apples for a note while code still owns the math wording",async()=>{
    const s=setup();s.comment();s.deps.generation={...gen,ai:fakeAiClient({answer:r=>({items:fakeWorkbookItems(r).items.map(x=>({...x,name:"Mia",thing:"apples"}))})})};
    expect(await runWorkbookEdit(s.send(),s.deps)).toBe("done");
    const q=s.review.comments[0].after as {package:{text:string}};expect(q.package.text).toContain("apples");
  });

});
