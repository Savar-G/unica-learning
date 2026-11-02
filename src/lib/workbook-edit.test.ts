import { beforeAll, describe, expect, it, vi } from "vitest";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { generateWorkbook, type GeneratedWorkbook, type GenerateInput } from "@/lib/workbook-generator";
import { planLevel, planWorkbook } from "@/lib/workbook-plan";
import { fakeWorkbookItems, workbookFakeAi } from "@/lib/workbook-ai-fake";
import { isCodeWorded } from "@/lib/workbook-generator-items";
import { keySolver, toSolve } from "@/lib/workbook-solve-check";
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
function setup(status:"draft"|"approved"|"printed"|"shipped"="draft", now?: () => number) {
  const snapshot:EditSnapshot={draft:structuredClone(original),rendering:{pdfPath:"old.pdf",pages:original.pages.map(p=>({number:p.number,image:{path:`old-${p.number}.png`,width:816,height:1056},questions:[]}))},problems:[],revision:1,input,parentId:PARENT};
  const review=memoryWorkbookReview(snapshot,{status, now});
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
    const edited = s.review.snapshot().draft.pages.find(p=>p.number===s.pages[0].number)!.questions.find(x=>x.number===q.number)!.package!;
    expect(edited.answer).toEqual(q.package!.answer); expect(edited.textSource).toBe("human"); expect(isCodeWorded(edited)).toBe(false); expect(toSolve(edited).questions.length).toBeGreaterThan(0); ai.mockRestore();
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

  it("R428-1 refuses manual wording whose answer differs from the code key", async () => {
    const s = setup();
    const q = s.pages[0].questions.find(q => q.package?.operation)!;
    const item = workbookEditItem(q)!;
    item.text = "Mia has 8 apples. She gives 2 apples to Ben. How many apples does Mia have now?";
    item.operation = { ...item.operation!, kind: "add", operands: item.operation!.operands.map((v, i) => ({ ...v, value: i ? 2 : 8 })) };
    s.comment(s.pages[0].number, q.number, item);
    const solve = vi.fn(async () => ({ answers: [{ question: "question", box: "answer", answer: "6" }], problem: null }));
    s.deps.generation = { ...gen, solver: { model: gen.solver.model, solve } };
    expect(await runWorkbookEdit(s.send(), s.deps)).toBe("failed");
    expect(solve).toHaveBeenCalledTimes(1);
    expect(s.review.comments[0]).toMatchObject({ status: "failed", error: expect.stringMatching(/solve check/) });
    expect(s.renderPage).not.toHaveBeenCalled();
    expect(s.review.snapshot().revision).toBe(1);
  });
  it("R428-3 sends the current wording and data and keeps numbers for an apples-only note", async () => {
    const s = setup(); s.comment();
    const q = s.pages[0].questions.find(q => q.package?.operation)!;
    const ai = fakeAiClient({ answer: r => {
      const request = JSON.parse((r.content[0] as {text:string}).text);
      expect(request.currentQuestions).toContainEqual({ number: q.number, text: q.package!.text, data: workbookEditItem(q) });
      expect(request.note).toContain("Keep the numbers; use apples instead");
      return fakeWorkbookItems(r);
    }});
    s.review.comments[0].note = "Keep the numbers; use apples instead";
    s.deps.generation = { ...gen, ai };
    expect(await runWorkbookEdit(s.send(), s.deps)).toBe("done");
    const after = s.review.snapshot().draft.pages.find(p => p.number === s.pages[0].number)!.questions.find(x => x.number === q.number)!;
    expect(after.package!.operation).toEqual(q.package!.operation);
  });
  for (const runner of ["mac", "server"] as const) {
    it(`R428-2/R428-7 resumes ${runner} after a lost page checkpoint without another writer request`, async () => {
      const s = setup(); s.deps.runner = runner; s.comment();
      const id = s.send(), checkpoint = s.review.store.checkpoint;
      const ai = vi.spyOn(gen.ai, "json"); ai.mockClear();
      s.review.store.checkpoint = async (...args) => {
        if (args[2].image) throw new Error("transient checkpoint error");
        return checkpoint(...args);
      };
      expect(await runWorkbookEdit(id, s.deps)).toBe("failed");
      s.review.store.checkpoint = checkpoint;
      expect(await runWorkbookEdit(id, s.deps)).toBe("done");
      expect(ai).toHaveBeenCalledTimes(1);
      expect(s.review.snapshot().revision).toBe(2);
      ai.mockRestore();
    });
    it(`R428-2 expires a ${runner} lease and rejects its late writes`, async () => {
      const s = setup(); s.deps.runner = runner; s.comment(); const id = s.send();
      let now = 0;
      // The store's clock is supplied at its public construction boundary.
      const review = memoryWorkbookReview(s.review.snapshot(), { now: () => now });
      review.save(s.review.comments[0]);
      const sent = review.send(1, runner); if (sent.status !== "queued") throw new Error(sent.reason);
      expect(await review.store.claim(sent.id, "old", runner)).toBeTruthy();
      expect(await review.store.claim(sent.id, "early", runner)).toBeNull();
      now = 6 * 60_000 + 1;
      expect(review.send(1, runner)).toEqual({ status: "queued", id: sent.id });
      expect(await review.store.claim(sent.id, "new", runner)).toBeTruthy();
      expect(await review.store.checkpoint(sent.id, "old", {number: 3, error: "late"})).toBe(false);
      expect((await review.store.finish(sent.id, "old", {error: "late"})).status).toBe("refused");
      expect(id).toBeTruthy();
    });
  }
  for (const runner of ["mac", "server"] as const) {
    it(`R428-7 ${runner} retries a writer response save without repeating the call`, async () => {
      const s = setup(); s.deps.runner = runner; s.comment(); const id = s.send();
      const complete = s.review.store.completeCall;
      let fail = true;
      s.review.store.completeCall = async (...args) => {
        if (fail) { fail = false; throw new Error("response save before commit"); }
        return complete(...args);
      };
      const json = vi.fn(gen.ai.json);
      s.deps.generation = { ...gen, ai: { model: gen.ai.model, json } };
      await runWorkbookEdit(id, s.deps);
      s.review.store.completeCall = complete;
      if (s.review.snapshot().revision === 1) await runWorkbookEdit(id, s.deps);
      expect(json).toHaveBeenCalledTimes(1);
      expect(s.review.snapshot().revision).toBe(2);
    });
    it(`R428-10 ${runner} reuses a solve after the image checkpoint fails`, async () => {
      const s = setup(); s.deps.runner = runner;
      const q = s.pages[0].questions.find(q => q.package?.operation)!;
      s.comment(s.pages[0].number, q.number, workbookEditItem(q)); const id = s.send();
      const checkpoint = s.review.store.checkpoint;
      s.review.store.checkpoint = async (...args) => {
        if (args[2].image) throw new Error("page checkpoint before commit");
        return checkpoint(...args);
      };
      const solve = vi.fn(gen.solver.solve), json = vi.fn(gen.ai.json);
      s.deps.generation = { ...gen, ai: { model: gen.ai.model, json }, solver: { model: gen.solver.model, solve } };
      expect(await runWorkbookEdit(id, s.deps)).toBe("failed");
      s.review.store.checkpoint = checkpoint;
      expect(await runWorkbookEdit(id, s.deps)).toBe("done");
      expect(solve).toHaveBeenCalledTimes(1);
      expect(json).not.toHaveBeenCalled();
      expect(s.review.snapshot().revision).toBe(2);
    });
  }
  for (const runner of ["mac", "server"] as const) {
    for (const kind of ["write", "solve"] as const) {
      function counted(now?: () => number) {
        const s = setup("draft", now); s.deps.runner = runner;
        const q = s.pages[0].questions.find(q => q.package?.operation)!;
        s.comment(s.pages[0].number, q.number, kind === "solve" ? workbookEditItem(q) : null);
        const json = vi.fn(gen.ai.json), solve = vi.fn(gen.solver.solve);
        s.deps.generation = { ...gen, ai: { model: gen.ai.model, json }, solver: { model: gen.solver.model, solve } };
        return { ...s, calls: kind === "write" ? json : solve };
      }
      it(`${runner} ${kind}: eight result-save failures cannot spend more than five dispatches`, async () => {
        const s = counted(), id = s.send(), complete = s.review.store.completeCall;
        const reserve = vi.spyOn(s.review.store, "reserveCall");
        s.review.store.completeCall = async () => { throw new Error("result not committed"); };
        for (let n = 0; n < 8; n++) expect(await runWorkbookEdit(id, s.deps)).toBe(n < 6 ? "failed" : "not-claimed");
        expect(s.calls).toHaveBeenCalledTimes(5);
        expect(reserve.mock.results.filter(r => r.type === "return")).toHaveLength(6);
        expect(s.review.comments[0]).toMatchObject({status: "pending", error: expect.stringContaining("limit of 5")});
        expect(s.review.snapshot().revision).toBe(1);
        expect(s.review.snapshot().draft).toEqual(original);
        s.review.store.completeCall = complete;
      });
      it(`${runner} ${kind}: a lost dispatch response spends an attempt without sending a call`, async () => {
        const s = counted(), id = s.send(), reserve = s.review.store.reserveCall;
        let lost = true;
        s.review.store.reserveCall = async (...args) => {
          const row = await reserve(...args);
          if (lost) { lost = false; throw new Error("crash after dispatch commit"); }
          return row;
        };
        expect(await runWorkbookEdit(id, s.deps)).toBe("failed");
        expect(s.calls).not.toHaveBeenCalled();
        const rows: number[] = [];
        s.review.store.reserveCall = async (...args) => {
          const row = await reserve(...args); if (row.status === "dispatch") rows.push(row.attempt); return row;
        };
        expect(await runWorkbookEdit(id, s.deps)).toBe("done");
        expect(rows).toContain(2);
        expect(s.calls).toHaveBeenCalledTimes(1);
      });
      it(`${runner} ${kind}: recovery reuses a result committed before the process stopped`, async () => {
        const s = counted(), id = s.send(), complete = s.review.store.completeCall;
        s.review.store.completeCall = async (...args) => {
          await complete(...args); throw new Error("crash after result commit");
        };
        expect(await runWorkbookEdit(id, s.deps)).toBe("failed");
        s.review.store.completeCall = complete;
        expect(await runWorkbookEdit(id, s.deps)).toBe("done");
        expect(s.calls).toHaveBeenCalledTimes(1);
        expect(s.review.snapshot().revision).toBe(2);
      });
      it(`${runner} ${kind}: a crash during the call spends an attempt and rejects the late holder`, async () => {
        let now = 0;
        const s = counted(() => now), id = s.send();
        let called!: () => void, unblock!: () => void;
        const started = new Promise<void>(resolve => { called = resolve; });
        const blocked = new Promise<void>(resolve => { unblock = resolve; });
        let calls = 0;
        const before = async () => {
          calls++;
          if (calls === 1) { called(); await blocked; }
        };
        if (kind === "write") s.deps.generation.ai = { model: gen.ai.model, json: async (r, signal) => { await before(); return gen.ai.json(r, signal); } };
        else s.deps.generation.solver = { model: gen.solver.model, solve: async (r, signal) => { await before(); return gen.solver.solve(r, signal); } };
        const old = runWorkbookEdit(id, s.deps);
        await started;
        now = 6 * 60_000 + 1;
        expect(await runWorkbookEdit(id, s.deps)).toBe("done");
        unblock();
        expect(await old).toBe("failed");
        expect(calls).toBe(2);
        expect(s.review.snapshot().revision).toBe(2);
        expect(s.review.revisions).toHaveLength(2);
      });
      it(`${runner} ${kind}: no call starts when dispatch storage fails before commit`, async () => {
        const s = counted(), id = s.send();
        s.review.store.reserveCall = async () => { throw new Error("dispatch not committed"); };
        expect(await runWorkbookEdit(id, s.deps)).toBe("failed");
        expect(s.calls).not.toHaveBeenCalled();
      });
    }
  }
  it("R428-4 returns one saved comment for a repeated client request key", () => {
    const s = setup(); s.comment();
    const fields = s.review.comments[0];
    const one = s.review.save({ ...fields, requestKey: "stable-request" });
    const two = s.review.save({ ...fields, requestKey: "stable-request" });
    expect(one).toEqual(two);
    expect(s.review.comments).toHaveLength(2);
  });
  it("R428-5 refuses a resume on different code or models and returns comments to pending", async () => {
    for (const field of ["build", "model", "solveModel"] as const) {
      const s = setup(); s.comment(); const id = s.send();
      s.deps.shouldYield = () => true; s.deps.handOff = vi.fn(async () => {});
      expect(await runWorkbookEdit(id, s.deps)).toBe("handed-on");
      s.deps.shouldYield = () => false;
      if (field === "build") s.deps.build = "other-build";
      else if (field === "model") s.deps.generation = { ...gen, ai: { ...gen.ai, model: "other-model" } };
      else s.deps.generation = { ...gen, solver: { ...gen.solver, model: "other-solver" } };
      expect(await runWorkbookEdit(id, s.deps)).toBe("failed");
      expect(s.review.comments[0].status).toBe("pending");
      expect(s.renderPage).not.toHaveBeenCalled();
    }
  });

  it("R428-3 refuses a writer that changes a sequence's numbers for a wording-only comment", async () => {
    const s = setup();
    const page = s.pages.find(p => p.questions.some(q => q.package?.item?.checks.some(c => c.kind === "sequence")))!;
    const q = page.questions.find(q => q.package?.item?.checks.some(c => c.kind === "sequence"))!;
    s.comment(page.number, q.number);
    s.deps.generation = { ...gen, ai: fakeAiClient({ answer: r => ({items: fakeWorkbookItems(r).items.map(item => ({ ...item,
      sequence: item.sequence ? { ...item.sequence, start: { ...item.sequence.start, value: Number(item.sequence.start.value) + 1 } } : item.sequence,
    }))}) }) };
    expect(await runWorkbookEdit(s.send(), s.deps)).toBe("failed");
    expect(s.review.snapshot().revision).toBe(1);
  });

  it("R428-5 refuses legacy partial results without a stored build and model frame", async () => {
    const s = setup(); s.comment(); const id = s.send();
    await s.review.store.claim(id, "legacy", "mac");
    await s.review.store.checkpoint(id, "legacy", {number: 3, responses: [{items: []}]});
    await s.review.store.release(id, "legacy");
    expect(await runWorkbookEdit(id, s.deps)).toBe("failed");
    expect(s.review.comments[0].status).toBe("pending");
    expect(s.renderPage).not.toHaveBeenCalled();
  });

});
