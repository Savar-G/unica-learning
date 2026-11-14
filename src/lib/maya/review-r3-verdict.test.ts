import { createSession, step, fallbacks, type Proposal, type SessionEvent } from '@/lib/maya';
import { it, expect } from 'vitest';
import { FIXTURES } from '@/lib/maya-gate/fixtures';
const n=(value:number)=>({type:'number' as const,value});
function rig(pkg=FIXTURES.A){
 let s=createSession({callId:'review698',package:pkg}); let at=1000;
 const send=(e:Record<string, unknown>)=>{if(typeof e.at === "number") at=e.at;const r=step(s,{at,...e} as SessionEvent);s=r.session;return r;};
 const child=(text:string)=>send({type:'child_turn',at:at+=4000,text});
 const prop=(p:Proposal | Record<string, unknown>)=>send({type:'proposal',proposal:Object.assign({version:2},p)});
 const tick=(t:number)=>{at=t;return send({type:'tick'});};
 const fb=(refused:unknown[]=[])=>{const rejects:unknown[]=[];for(const p of fallbacks(s,refused)){const r=prop(p);if(!r.refusal)return {act:p.act,say:r.effects.filter(x=>x.kind==='say'),reading:p.reading, rejects};rejects.push(r.refusal)}return {act:'DEAD',rejects};};
 const show=(id:string)=>{const r=prop({act:'guide',step:id,level:3,parts:[{line:'step.show',slots:{step:id}}],reading:{help:'show'}});expect(r.refusal).toBeNull();};
 send({type:'start'});fb();
 return {get s(){return s},child,prop,fb,show,send,tick};
}
function setup(kind='h3'){
 const r=rig();
 if(kind==='done'){
 r.child('7 plus 9 is 16.');r.fb();r.child('2 plus 3 plus 1 is 6.');r.fb();expect(r.s.done).toEqual(['ones','tens']);
 }else if(kind!=='open'){
 r.child('Show me the ones.');r.show('ones');
 if(kind==='passed'){r.child('16.');r.fb();r.child('Show me the tens.');r.show('tens');r.child('6.');r.fb();expect(r.s.passed).toEqual(['ones','tens']);}
 }
 return r;
}

it('uncommitted wrong readings cannot unlock H3 through direct, kept or fallback paths',()=>{
 for (const [text,value] of [['I think 15.',15],['My friend said 15.',15],['How do I get 15',15],['Is it 15',15],['7 plus 9.',9]] as const) for(const mode of ['direct','kept','fallback']) {
  const r=setup('h3');r.child(text);const p={act:'give_answer',parts:[],reading:{answers:[{value:n(value),step:'ones',verdict:'wrong'}]}};
  if(mode==='direct') expect(r.prop(p).refusal,`${mode} ${text}`).not.toBeNull();
  else {const got=r.fb(mode==='kept'?[p]:[]);expect(got.act,`${mode} ${text}`).not.toBe('DEAD');expect(got.act,`${mode} ${text}`).not.toBe('give_answer');}
  expect(r.s.assistance,`${mode} ${text}`).not.toContain('answer_given');expect(r.s.ladder.failures,`${mode} ${text}`).toBe(0);expect(r.s.ladder.unlocked,`${mode} ${text}`).toBeLessThan(4);
 }
 for(const mode of ['direct','kept','fallback']){
  const r=setup('h3');r.send({type:'child_turn',at:50000,text:'15.',alternatives:['16.']});
  const p={act:'give_answer',parts:[],reading:{answers:[{value:n(15),step:'ones',verdict:'wrong'}]}};
  if(mode==='direct') expect(r.prop(p).refusal).not.toBeNull(); else {const got=r.fb(mode==='kept'?[p]:[]);expect(got.act,`${mode}: ${JSON.stringify(got.rejects)}`).not.toBe('DEAD');expect(got.act).not.toBe('give_answer');}
  expect(r.s.ladder.failures).toBe(0);expect(r.s.assistance).not.toContain('answer_given');
 }
});
it('copies of passed columns and alternatives never count as final misses',()=>{
 for(const text of ['16.','6.']) for(const mode of ['direct','kept','fallback']){
  const r=setup('passed');r.child(text);const p={act:'give_answer',parts:[],reading:{answers:[{value:n(Number(text.slice(0,-1))),step:'result',verdict:'wrong'}]}};
  if(mode==='direct') expect(r.prop({ ...p, act:'guide', step:'result', level:0, parts:[{line:'check.not_yet',slots:{step:'result'}},{line:'step.invite',slots:{step:'result'}}] }).refusal,`${mode} ${text}`).toBeNull();else r.fb(mode==='kept'?[p]:[]);expect(r.s.finalMisses,`${mode} ${text}`).toBe(0);
 }
 const r=setup('passed');r.send({type:'child_turn',at:50000,text:'65.',alternatives:['66.']});r.fb();expect(r.s.finalMisses).toBe(0);
});
