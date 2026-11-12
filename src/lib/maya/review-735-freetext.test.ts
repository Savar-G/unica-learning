// #735: free-text recognition gaps found in the #698 round-7 review; skipped by the Chief of Staff's stop rule.
import {it,expect} from 'vitest';
import {createSession,step,fallbacks,hardFeeling,phraseOffers} from '@/lib/maya';
import {FIXTURES} from '@/lib/maya-gate/fixtures';
import {createTextSession} from '@/lib/maya-text';
import {fakeMayaModel} from '@/lib/maya-model-fake';
import {workedSteps} from '@/lib/question-package';
const operation={kind:'add' as const,operands:[3,0] as [number,number]};
const easier={kind:'add' as const,operands:[0,0] as [number,number]};
const pkg={...FIXTURES.A,text:'3 + 0',operation,steps:workedSteps(operation),answer:{value:{type:'number' as const,value:3},accepted:[],unit:null},wrongAnswers:[{value:{type:'number' as const,value:4},cause:'O3',description:'Wrong sum',step:null}],easierExample:{text:'0 + 0',operation:easier,steps:workedSteps(easier),answer:{type:'number' as const,value:0}}};
it.skip.each(['Can you please help me?','Could you please help me?','Would you help me?','Maya, help me.','I need some help.','Help me with this.','I am stuck on this.'])('P2: progress for %s',async(form)=>{
 let at=1000;const s=createTextSession({callId:'735-help',package:pkg,confirmWorkbook:true,grade:2,clock:()=>at,model:fakeMayaModel({answer:()=>{throw new Error('offline')}})});
 await s.start();for(let i=0;i<8&&!s.ended;i++){at+=4000;await s.child(form);}
 expect(s.session.ladder.hint>0||s.session.exampleShown>0||!!s.ended).toBe(true);
});
it.skip.each(["I'm stuck?",'I need help?','Please help me!!'])('P3: recognize punctuation variant %s',async(form)=>{
 let at=1000;const s=createTextSession({callId:'735-punctuation',package:pkg,confirmWorkbook:true,grade:2,clock:()=>at,model:fakeMayaModel({answer:()=>{throw new Error('offline')}})});
 await s.start();for(let i=0;i<8&&!s.ended;i++){at+=4000;await s.child(form);}
 expect(s.session.ladder.hint>0||s.session.exampleShown>0||!!s.ended).toBe(true);
});
it.skip.each(['I feel low.','I felt bad today.',"I'm devastated.",'I feel downhearted.','My dog is gone forever.','I am not feeling even a little happy.','I feel good for nothing.'])('P2: recognize distress in %s',(text)=>{expect(hardFeeling(text)).toBe(true);});
it.skip('P3: recognize a repeated intensifier',()=>{expect(hardFeeling('I feel really really really bad.')).toBe(true);});
it.skip.each(['I am happy because I have no homework.','I am happy. It is not raining.',"I am happy because I didn't lose.",'I am not sad, I am happy!','I have never been this happy!','Nothing makes me happier than my dog.'])('P3: withhold cheer on actual happy news %s',(text)=>{
 let s=createSession({callId:'735-happy',package:FIXTURES.A,grade:2});s=step(s,{type:'start',at:1000}).session;
 for(const p of fallbacks(s)){const out=step(s,{type:'proposal',at:1000,proposal:p,fallback:true});s=out.session;if(!out.refusal)break;}
 s=step(s,{type:'child_turn',at:5000,text}).session;expect(phraseOffers(s,'happy')).toEqual([]);
});
