import { expect, it } from 'vitest';
import { createSession, step, fallbacks, valuesIn, PROPOSAL_SCHEMA, type SessionEvent, type Proposal } from '@/lib/maya';
import { FIXTURES } from '@/lib/maya-gate/fixtures';
const n=(value:number)=>({type:'number',value});

function rig(pkg=FIXTURES.A){
 let s=createSession({callId:'independent-r3',package:pkg});let at=1000;const trace:unknown[]=[];
 const send=(e:Record<string, unknown>)=>{at=(e.at as number|undefined)??at;const before={state:s.state,ladder:s.ladder,finalMisses:s.finalMisses,done:s.done,passed:s.passed,exampleShown:s.exampleShown};const r=step(s,{at,...e} as SessionEvent);s=r.session;trace.push({event:e,before,refusal:r.refusal,effects:r.effects});return r;};
 const child=(text:string,extra={})=>send({type:'child_turn',at:at+4000,text,...extra});
 const prop=(p:Record<string, unknown>,extra={})=>send({type:'proposal',proposal:{version:2,...p},...extra});
 const fb=(refused:unknown[]=[]): {act:string; text?:string; proposal?:Proposal; effects?:unknown[]; rejects?:unknown[]}=>{const rejects=[];for(const p of fallbacks(s,refused as Parameters<typeof fallbacks>[1])){const r=prop(p as unknown as Record<string, unknown>,{fallback:true});if(!r.refusal)return {act:p.act,text:r.effects.filter(e=>e.kind==='say').map(e=>e.text).join(' '),effects:r.effects,proposal:p};rejects.push(r.refusal);}return {act:'DEAD',rejects};};
 const show=(id:string)=>{expect(prop({act:'guide',step:id,level:3,parts:[{line:'step.show',slots:{step:id}}],reading:{help:'show'}}).refusal).toBeNull();};
 send({type:'start'});expect(fb().act).toBe('open');
 return {get s(){return s},trace,send,child,prop,fb,show};
}
function setup(stage:string){const r=rig();if(stage==='h3'||stage==='passed'||stage==='example'){r.child('Show me the ones.');r.show('ones');}
 if(stage==='passed'||stage==='example'){r.child('16.');r.fb();r.child('Show me the tens.');r.show('tens');r.child('6.');r.fb();expect(r.s.passed).toEqual(['ones','tens']);}
 if(stage==='done'){r.child('7 plus 9 is 16.');r.fb();r.child('2 plus 3 plus 1 is 6.');r.fb();expect(r.s.done).toEqual(['ones','tens']);}
 if(stage==='example'){r.child("I'm stuck.");for(let i=0;i<8&&r.s.expect==='maya'&&!r.s.outcome;i++)expect(r.fb().act).not.toBe('DEAD');expect(r.s.exampleShown).toBe(FIXTURES.A.easierExample!.steps.length);}
 return r;}
it('refuses the answer after a wrong shown column', () => {
 const r=setup('h3'); r.child('15.');
 const p={act:'give_answer',parts:[],reading:{answers:[{value:n(15),step:'ones',verdict:'wrong'}]}};
 expect(r.prop(p).refusal).not.toBeNull();
 const out=r.fb([p]); expect(out.act).toBe('close'); expect(out.text ?? '').not.toMatch(/\b66\b/); expect(r.s.assistance).not.toContain('answer_given');
});
it('does not count repeated operand lists as committed answers', () => {
 const r=setup('passed');
 for(let i=0;i<2;i++){r.child('27 39');const p={act:'give_answer',parts:[],reading:{answers:[{value:n(39),step:'result',verdict:'wrong'}]}};const direct=r.prop(p);expect(direct.refusal).not.toBeNull();const out=r.fb([p]);expect(out.text ?? '').not.toMatch(/\b66\b/);}
 expect(r.s.finalMisses).toBe(0);
});

it.each(["A", "B", "C"] as const)("does not release the %s answer on model, retained and fallback paths", (id) => {
 const pkg = FIXTURES[id];
 const answer = pkg.answer!.value;
 expect(answer.type).toBe("number");
 for (const turn of ["Help.", "I'm stuck.", "Is it 15?", "Maybe 15.", "You said 15.", "15.", "27 39"]) {
  for (const mode of ["model", "kept", "fallback"] as const) {
   const r = rig(pkg); r.child(turn);
   const proposal = { act: "give_answer", parts: [], reading: { answers: [{ value: n(15), step: "result", verdict: "wrong" }] } };
   const rejected = r.prop(proposal); expect(rejected.refusal).not.toBeNull();
   const out = r.fb(mode === "fallback" ? [] : [proposal]);
   expect(out.act).not.toBe("give_answer");
   expect(out.act).not.toBe("DEAD");
   const text = out.text ?? "";
   expect(valuesIn(text).some((v) => v.type === "number" && answer.type === "number" && v.value === answer.value)).toBe(false);
  }
 }
});
it('closes after two committed final misses without the answer', () => {
 const r=setup('done');
 for(const value of [56,65]) {
  r.child(`${value}.`);
  const p={act:'give_answer',parts:[],reading:{answers:[{value:n(value),step:'result',verdict:'wrong'}]}};
  expect(r.prop(p).refusal).not.toBeNull();
  const out=r.fb([p]);
  expect(out.act).toBe(value===65 ? 'close' : 'guide');
  expect(out.text ?? '').not.toMatch(/\b66\b/);
 }
 expect(r.s.finalMisses).toBe(2);
 expect(r.s.outcome?.reason).toBe('child_stopped');
 expect(r.s.assistance).not.toContain('answer_given');
});

it("does not expose give_answer to the model schema", () => {
 expect(PROPOSAL_SCHEMA.properties.act.enum).not.toContain("give_answer");
});
it.each(["A", "B", "C"] as const)("keeps the %s answer private in the closing minute", (id) => {
 const pkg=FIXTURES[id]; const answer=pkg.answer!.value; const r=rig(pkg);
 r.send({type:"tick",at:542000}); r.child("I'm stuck.");
 const p={act:"give_answer",parts:[],reading:{answers:[{value:n(15),step:"result",verdict:"wrong"}]}};
 expect(r.prop(p).refusal).not.toBeNull();
 const out=r.fb([p]); expect(out.act).not.toBe("DEAD");
 expect(valuesIn(out.text ?? "").some(v => v.type === "number" && answer.type === "number" && v.value === answer.value)).toBe(false);
});

it('uses only close.stuck when the expression contains the answer', async () => {
 const { workedSteps, checkQuestionPackage } = await import('@/lib/question-package');
 const operation={kind:'add' as const, operands:[3,0] as [number,number]};
 const easier={kind:'add' as const, operands:[1,0] as [number,number]};
 const pkg={...FIXTURES.A,text:'3 + 0 = ?',operation,steps:workedSteps(operation),wrongAnswers:[{value:n(4) as {type:'number';value:number},cause:'O3',description:'Wrong sum',step:null}],answer:{value:n(3) as {type:'number';value:number},accepted:[],unit:null},easierExample:{text:'1 + 0 = ?',operation:easier,answer:n(1) as {type:'number';value:number},steps:workedSteps(easier)}};
 expect(checkQuestionPackage(pkg), JSON.stringify(checkQuestionPackage(pkg))).toMatchObject({ok:true});
 const r=rig(pkg); r.send({type:'tick',at:542000}); r.child("I'm stuck.");
 const out=r.fb(); expect(out.act).toBe('close');
 expect(out.proposal?.parts.map((p)=>('line' in p ? p.line : undefined))).toEqual(['close.stuck']);
 expect(out.text ?? '').not.toMatch(/\b3\b/);
});
it('uses both approved close lines when the expression does not contain the answer', () => {
 const r=setup('done');
 for(const value of [56,65]) {
  r.child(`${value}.`);
  const p={act:'give_answer',parts:[],reading:{answers:[{value:n(value),step:'result',verdict:'wrong'}]}};
  r.prop(p); const out=r.fb([p]);
  if(value===65) expect(out.proposal?.parts.map((part)=>('line' in part ? part.line : undefined))).toEqual(['close.stuck','close.together']);
 }
});
it('requires both honest close lines in the closing minute after work', () => {
 const r=setup('done');
 r.send({type:'tick',at:542000}); r.child("I'm stuck.");
 const alone={act:'close',parts:[{line:'close.stuck'}]};
 expect(r.prop(alone).refusal).not.toBeNull();
 expect(r.prop({act:'close',parts:[{line:'close.stuck'},{line:'close.together'}]}).refusal).toBeNull();
});
