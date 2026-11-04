import { describe, expect, it } from "vitest";
import { bookSignals, type BookSignalsInput, type FamilyResult, type SignalId } from "@/lib/workbook-signals";
import { bookPersona, firstCustomerProfile } from "@/lib/workbook-sample-profiles";
import { childProfileFacts, type ChildLearnerProfile } from "@/lib/child-profile";

const input = (): BookSignalsInput => ({ grade: 4, profile: firstCustomerProfile() });
const base = (p: ChildLearnerProfile) => p.assessment!.profile;
const signal = (i: BookSignalsInput, id: SignalId) => bookSignals(i).trace.find(s => s.id === id)!;

describe("book signals through the public profile interface", () => {
  it("has exactly one ordered trace row per signal and explicit fallbacks", () => {
    const s = bookSignals({ grade: 4, profile: null });
    expect(s.trace.map(t => t.id)).toEqual(Array.from({length:22},(_,i)=>`S${i+1}`));
    expect(s.trace.filter(t => t.status !== "missing").map(t => t.id)).toEqual(["S1","S16"]);
    expect(s.hasAssessment).toBe(false);
    expect(s.adjustments).toEqual({trustedAboveGrade:false,stretchShift:0,hardChallenge:false,picturesThrough:3,shortStories:false,storyShare:null,requiredMinutes:null,extraChallenge:false});
    expect(s.facts.every(f => f.state === "not-measured" && f.source === "none")).toBe(true);
  });
  it("keeps the first customer's anonymous shape and old-family fallback", () => {
    const i = input(), s = bookSignals(i);
    expect(s.working).toEqual({working:5,certainty:"clear",confidence:"normal",atCeiling:true});
    expect(s.weak).toEqual([]);
    expect(s.standards.find(s => s.code === "5.13")).toMatchObject({aboveGrade:true,status:"needs-attention"});
    expect(s.adjustments.trustedAboveGrade).toBe(true);
    expect(s.adjustments.stretchShift).toBe(2);
    expect(s.facts.filter(f => f.state === "known").map(f => f.family)).toEqual(["add20","sub20","mul2510"]);
    expect(s.facts.filter(f => f.state === "known").every(f => f.source === "section")).toBe(true);
    expect(s.preferences).toEqual({styles:[],interests:[]});
    expect(s.mistakes).toEqual([]);
    expect(s.soft.reviewOrder).toEqual(["4.14","4.5"]);
    expect(s.soft.dropped.map(d => d.standard)).toEqual(["5.13","6.12","6.8"]);
    expect(signal(i,"S17").status).toBe("missing");
    expect(signal(i,"S18").status).toBe("missing");
    expect(signal(i,"S5").reliability).toBe("early-sign");
  });
  it("accepts an older profile with grade and standards only", () => {
    const legacy=firstCustomerProfile();
    for(const key of ["assessment","events","preferences","parent","ai"]) Reflect.deleteProperty(legacy,key);
    const s=bookSignals({grade:4,profile:legacy});
    expect(s.hasAssessment).toBe(false);
    expect(s.standards).toHaveLength(30);
    expect(s.events).toBeNull();
    expect(s.trace.find(t=>t.id==="S8")?.status).toBe("missing");
  });
  it("uses per-family results without promoting an unmeasured family from the section score", () => {
    const i=input();
    const quick: FamilyResult={answered:4,correct:4,skipped:0,medianMs:1000,accuracy:"secure",speed:"quick"};
    Object.assign(base(i.profile!).facts!, { byFamily: {add20:quick,sub20:{...quick,speed:"needs-practice",medianMs:4500}} });
    const s=bookSignals(i);
    expect(s.facts.find(f=>f.family==="add20")).toMatchObject({state:"known",source:"family"});
    expect(s.facts.find(f=>f.family==="sub20")).toMatchObject({state:"needs-practice",source:"family"});
    expect(s.facts.find(f=>f.family==="mul2510")).toMatchObject({state:"not-measured",source:"none"});
  });
  it.each(["ahead","catch-up","on-level","rushed"] as const)("builds a fresh full %s persona", persona => {
    const one=bookPersona(persona),two=bookPersona(persona);
    expect(one).toEqual(two);
    expect(one.profile).not.toBe(two.profile);
    expect(one.initials).toMatch(/^[A-Z]\.[A-Z]\.$/);
    expect(bookSignals({grade:4,profile:one.profile}).trace).toHaveLength(22);
  });
  it("exposes the catch-up controls and a coded mistake only", () => {
    const p=bookPersona("catch-up").profile,s=bookSignals({grade:4,profile:p});
    expect(s.clearlyWeak.map(w=>w.code)).toEqual(["3.3","4.4"]);
    expect(s.mistakes.find(m=>m.standard==="4.4")?.misconceptions).toEqual(["forgot-carry"]);
    expect(s.adjustments).toMatchObject({picturesThrough:5,shortStories:true,storyShare:0.2,requiredMinutes:20,extraChallenge:true});
    expect(s.preferences).toEqual({styles:["pictures"],interests:["animals"]});
  });
  it("exposes on-level early weakness and parent preferences without making that weakness clear",()=>{
    const s=bookSignals({grade:4,profile:bookPersona("on-level").profile});
    expect(s.earlyWeak.map(s=>s.code)).toEqual(["4.3"]);
    expect(s.clearlyWeak).toEqual([]);
    expect(s.adjustments.stretchShift).toBe(2);
    expect(s.preferences).toEqual({styles:["stories"],interests:["sports","space"]});
    expect(s.facts.find(f=>f.family==="mul234510")?.state).toBe("needs-practice");
  });
  it.each(["early-sign","low","help","unreliable","rush"])("blocks a trusted above-grade start for %s", reason=>{
    const i=input(),a=base(i.profile!);
    if(reason==="early-sign") a.level.certainty="early-sign";
    if(reason==="low") a.level.confidence="low";
    if(reason==="help") a.behaviour.help.likely=true;
    if(reason==="unreliable") a.behaviour.unreliable=true;
    if(reason==="rush") a.behaviour.rushRuns=1;
    expect(bookSignals(i).adjustments.trustedAboveGrade).toBe(false);
    if(["unreliable","rush"].includes(reason)) expect(bookSignals(i).adjustments.stretchShift).toBe(0);
  });
  it.each([null,"under_1h","1_to_2h","2_to_3h","over_3h"] as const)("applies the required estimate for %s and the late-drop reduction",time=>{
    const i=input();i.profile!.parent.weeklyTime=time;
    const target=time==="under_1h"?20:time==="1_to_2h"?25:null;
    expect(bookSignals(i).adjustments.requiredMinutes).toBe(target);
    base(i.profile!).behaviour.thirds.drop=true;
    expect(bookSignals(i).adjustments.requiredMinutes).toBe((target??35)-5);
  });
  it("caps stretch for avoids, uses the read-aloud threshold, and does not use pace alone",()=>{
    const i=input();i.profile!.parent.feeling="avoids";
    const a=base(i.profile!);a.behaviour.medianMs=900000;
    expect(bookSignals(i).adjustments.stretchShift).toBe(1);
    expect(signal(i,"S11").status).toBe("not-used");
    for(const n of [0,2,3,6]) {
      a.behaviour.readAloud={recorded:42,questions:n,uses:n*2};
      expect(bookSignals(i).adjustments.shortStories).toBe(n>=3);
    }
  });
  it("retains current child event counts, code mistakes and stuck steps without evidence IDs",()=>{
    const i=input(),p=i.profile!,s=p.standards.find(s=>s.code==="4.4")!;
    p.events.counted=2;s.events.wrong=1;s.events.rightWithHelp=1;s.events.hints=2;s.events.mistakes=["O3"];s.events.stuckSteps=["carry"];s.evidence.events=["private-event"];
    expect(bookSignals(i).mistakes).toContainEqual({standard:"4.4",misconceptions:["O3"],stuckSteps:["carry"],wrong:1,withHelp:1,blank:0,hints:2});
    expect(JSON.stringify(bookSignals(i))).not.toContain("private-event");
    expect(signal(i,"S8").status).toBe("used");
  });
  it("reads unknowns and report code separately from unused report prose, time and device",()=>{
    const i=input(),a=base(i.profile!);
    a.unknowns.untested=[a.standards[0]];a.unknowns.checkNext=[{...a.standards[1],reason:"confirm-struggle"}];
    i.report={howWeHelp:"ahead",minutes:55};i.device={deviceClass:"desktop",input:"mouse",screenWidth:1440,screenHeight:900,browser:"chrome"};
    expect(bookSignals(i).unknowns).toMatchObject({untested:["4.1"],checkNext:["4.2"]});
    expect(signal(i,"S21").status).toBe("used");expect(signal(i,"S22").status).toBe("not-used");
    expect(bookSignals(i).report).toEqual({...i.report,device:i.device});
  });
  it("uses soft codes only for ties among eligible facts, never their percentages or prose",()=>{
    const i=input(),before=bookSignals(i),a=base(i.profile!);
    a.ai={workbookPlan:{model:"fake",value:{review:{percent:100,standards:["4.5","4.14","5.13"]},practise:{percent:0,standards:["5.13"]},stretch:{percent:0,standards:["6.12"]}}}};
    const after=bookSignals(i);
    expect({...after,soft:before.soft,trace:before.trace}).toEqual(before);
    expect(after.soft.reviewOrder).toEqual(["4.5","4.14"]);
    expect(bookSignals({...i,allowedStandards:["4.14"]}).soft.reviewOrder).toEqual(["4.14"]);
    expect(bookSignals({...i,allowedStandards:["4.14"]}).soft.dropped).toContainEqual({standard:"4.5",reason:"not in this level"});
    i.profile!.ai={model:"fake",findings:[{standard:"4.5",hypothesis:"private hypothesis",events:["private-event"]}]};
    expect(signal(i,"S20").status).toBe("not-used");
  });
  it("never reads answer changes, parent notes, answer text or AI and report prose",()=>{
    const i=input(),p=i.profile!,a=base(p);
    const forbidden={get(){throw new Error("private field read");},enumerable:true};
    for(const key of ["answer_changes","note","name"]) Object.defineProperty(p,key,forbidden);
    Object.defineProperty(p.parent,"note",forbidden);
    Object.defineProperty(a.behaviour.whiteboard,"note",forbidden);
    Object.defineProperty(a,"answer_changes",forbidden);
    a.struggles=[{...a.standards[0],status:"needs-attention",wrong:[{questionId:"",templateId:"",prompt:"",response:"",rightAnswer:"",misconception:"O3"}],misconceptions:["O3"]}];
    for(const key of ["response","prompt","rightAnswer"]) Object.defineProperty(a.struggles[0].wrong[0],key,forbidden);
    i.report={howWeHelp:"ahead"};Object.defineProperty(i.report,"summary",forbidden);
    expect(()=>bookSignals(i)).not.toThrow();
    expect(signal(i,"S16").status).toBe("not-used");
  });
  it("does not change its input, round-trips through JSON, and rejects an unsupported assessment schema",()=>{
    const i=input(),copy=JSON.stringify(i),s=bookSignals(i);
    expect(JSON.stringify(i)).toBe(copy);
    expect(bookSignals(JSON.parse(copy))).toEqual(s);
    Object.assign(base(i.profile!),{schemaVersion:99});
    expect(bookSignals(i).hasAssessment).toBe(false);
  });
  it("builds the fixture with the public child profile builder and no personal identifiers",()=>{
    const p=firstCustomerProfile();
    expect(childProfileFacts({grade:4,learning:null,events:[],assessment:p.assessment})).toEqual(p);
    expect(p.standards).toHaveLength(30);
    expect(p.assessment!.assessmentId).toBe("");
    expect(p.standards.every(s=>s.evidence.assessmentId==="" && !s.evidence.events.length)).toBe(true);
    expect(JSON.stringify(p)).not.toMatch(/71ce22a1|response|rightAnswer|questionId|prompt/);
  });
  it("keeps every pair of personas different in at least three signal features",()=>{
    const features = (["ahead","catch-up","on-level","rushed"] as const).map(persona => {
      const s=bookSignals({grade:4,profile:bookPersona(persona).profile});
      return [s.working,s.weak.map(w=>w.code),s.preferences.styles,s.preferences.interests,s.facts,s.adjustments.trustedAboveGrade,s.adjustments.stretchShift,s.adjustments.shortStories,s.adjustments.requiredMinutes];
    });
    for(let i=0;i<features.length;i++) for(let j=i+1;j<features.length;j++) {
      expect(features[i].filter((f,k)=>JSON.stringify(f)!==JSON.stringify(features[j][k])).length,`personas ${i}, ${j}`).toBeGreaterThanOrEqual(3);
    }
  });
});
