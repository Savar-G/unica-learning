import { expect, it } from 'vitest';
import * as current from '@/lib/maya';
import { SAMPLE_PACKAGES } from '@/lib/maya-samples';
const frac=(numerator:number,denominator:number)=>({type:'fraction' as const,numerator,denominator});
function run(api:typeof current,text:string){
 let s=api.createSession({callId:'fresh-fraction',package:SAMPLE_PACKAGES['add-fractions-3-4-1-8']});
 s=api.step(s,{type:'start',at:1000}).session;
 const o=api.step(s,{type:'proposal',at:1000,proposal:{version:2,act:'open',parts:[{line:'open.hello'},{line:'question.problem'}]}});
 expect(o.refusal).toBeNull();
 s=api.step(o.session,{type:'child_turn',at:5000,text}).session;
 return api.step(s,{type:'proposal',at:5000,proposal:{version:2,act:'guide',step:'combine',level:0,
 parts:[{line:'check.right_step',slots:{step:'common'}},{line:'step.invite',slots:{step:'combine'}}],
 reading:{answers:[{value:frac(6,8),step:'common',verdict:'right'}]}}});
}
for(const text of ['6/8','3/4 is 6/8.','Three quarters is six eighths.','3/4 = 6/8.']){
 it('preserves checked common-denominator work: '+text,()=>{
 const r=run(current,text);expect(r.refusal,JSON.stringify(r.refusal)).toBeNull();
 expect(r.session.done).toContain('common');
 });
}

it("never marks the child's correct equivalent fraction as wrong",()=>{
 function wrong(api:typeof current){
  let s=api.createSession({callId:'fresh-fraction-wrong',package:SAMPLE_PACKAGES['add-fractions-3-4-1-8']});
  s=api.step(s,{type:'start',at:1000}).session;
  s=api.step(s,{type:'proposal',at:1000,proposal:{version:2,act:'open',parts:[{line:'open.hello'},{line:'question.problem'}]}}).session;
  s=api.step(s,{type:'child_turn',at:5000,text:'Three quarters is six eighths.'}).session;
  return api.step(s,{type:'proposal',at:5000,proposal:{version:2,act:'guide',step:'common',level:0,
   parts:[{line:'check.not_yet',slots:{step:'common'}},{line:'step.invite',slots:{step:'common'}}],
   reading:{answers:[{value:frac(6,8),step:'common',verdict:'wrong'}]}}});
 }
 const r=wrong(current);expect(r.refusal,JSON.stringify(r.effects)).not.toBeNull();
});

for (const text of ["5/6 is 6/8.", "3/4 is 5/8, so 6/8."]) {
  it("does not accept an unchecked fraction beside the claimed step: " + text, () => {
    expect(run(current, text).refusal).not.toBeNull();
  });
}
