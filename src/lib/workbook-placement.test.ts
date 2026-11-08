import { describe, expect, it } from "vitest";
import { BC_SKILL_MAP, REPORTED_STRAND, strandCertainty, strandStatus, type Grade } from "@/lib/assessment";
import { childProfileFacts, type ChildLearnerProfile } from "@/lib/child-profile";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { placeChild, planNextWorkbook, type PlacementInput, type PersonalWorkbookPlan } from "@/lib/workbook-placement";
import { planLevel, planWorkbook } from "@/lib/workbook-plan";
import { firstCustomerProfile } from "@/lib/workbook-sample-profiles";
import { generateWorkbook } from "@/lib/workbook-generator";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { fakeWorkbookItems } from "@/lib/workbook-ai-fake";
import { keySolver } from "@/lib/workbook-solve-check";
import { memoryDraftStore } from "@/lib/workbook-draft-memory";

const BC=curriculumFor("bc")!;
const input=(profile: ChildLearnerProfile | null=firstCustomerProfile(),grade:Grade=4):PlacementInput=>({curriculum:BC,grade,profile,workbooks:[]});
function changed(weak: readonly [string,number,number][]=[],working:Grade=4,grade:Grade=4) {
  const original=firstCustomerProfile().assessment!.profile;
  original.level={working,certainty:"clear",confidence:"normal",atCeiling:false};original.test.grade=grade;
  original.standards=weak.map(([code,correct,total])=>{
    const s=BC_SKILL_MAP.standards.find(s=>s.code===code)!;
    return {code,text:s.text,grade:s.grade,strand:REPORTED_STRAND[s.strand],aboveGrade:s.grade>grade,correct,total,status:strandStatus(correct,total),certainty:strandCertainty(correct,total)};
  });
  original.strengths=original.standards.filter(s=>s.status==="secure");
  original.struggles=original.standards.filter(s=>!s.aboveGrade&&s.status!=="secure").map(s=>({...s,wrong:[],misconceptions:[]}));
  return childProfileFacts({grade,learning:null,events:[],assessment:{assessmentId:"",completedAt:null,buildId:null,profile:original}})!;
}
function planned(i:PlacementInput,number=1):PersonalWorkbookPlan {
  const result=planNextWorkbook({...i,number});if(!result.ok)throw new Error(result.reason);return result.plan;
}

describe("placement P0 to P9",()=>{
  it("P0 continues the newest workbook and counts books in that level",()=>{
    const p=placeChild({...input(),workbooks:[{number:3,levels:[14]},{number:1,levels:[13]},{number:2,levels:[14]}]});
    expect(p).toMatchObject({level:{id:"U14"},inLevel:2,first:false,trace:{rule:"P0"}});
  });
  it("P1 preserves the old placement when the assessment level is absent",()=>{
    const p=changed([["2.4",0,2],["3.3",0,2]],3,3);p.assessment=null;
    expect(placeChild(input(p,3))).toMatchObject({level:{id:"U9"},trace:{rule:"P1"}});
    expect(placeChild(input(null))).toMatchObject({level:{id:"U13"},trace:{rule:"P1"}});
  });
  it.each(["early-sign","low","help","unreliable","rush"])("P2 blocks above-grade placement for %s",reason=>{
    const p=firstCustomerProfile(),a=p.assessment!.profile;
    if(reason==="early-sign")a.level.certainty="early-sign";
    if(reason==="low")a.level.confidence="low";
    if(reason==="help")a.behaviour.help.likely=true;
    if(reason==="unreliable")a.behaviour.unreliable=true;
    if(reason==="rush")a.behaviour.rushRuns=1;
    expect(placeChild(input(p))).toMatchObject({level:{id:"U13"},trace:{rule:"P2"}});
  });
  it("P2 has priority over clearly weak standards",()=>{
    const p=changed([["2.4",0,2],["3.3",0,2]],5);p.assessment!.profile.behaviour.help.likely=true;
    expect(placeChild(input(p)).trace.rule).toBe("P2");
  });
  it("P3 starts at the lowest of two clearly weak standards",()=>{
    const p=placeChild(input(changed([["4.4",0,2],["3.3",0,2]],4)));
    expect(p.level.id).toBe(BC.unit("3.3")!.level);expect(p.trace.rule).toBe("P3");
  });
  it("P3 moves down for one clear gap at least two grades below home",()=>{
    const p=placeChild(input(changed([["2.4",0,2]],4)));
    expect(p).toMatchObject({level:{id:"U9"},support:null,trace:{rule:"P3"}});
  });
  it("P4 keeps home for one lower clear gap and reserves its support slot",()=>{
    const i=input(changed([["3.3",0,2]],4)),p=placeChild(i),plan=planned(i);
    expect(p).toMatchObject({level:{id:"U13"},support:"3.3",trace:{rule:"P4"}});
    expect(plan.units.support).toBe("3.3");
    for(const day of plan.days.filter(d=>d.day<10)) {
      const support=day.pages.flatMap(p=>p.parts).filter(p=>p.kind==="remember-these"&&p.reviews===undefined);
      expect(support,`day ${day.day}`).toHaveLength(1);
      expect(support[0].skills.every(s=>BC.skill(s)!.unit==="3.3")).toBe(true);
      expect(support[0].reviewSteps?.every(s=>BC.skill(s.skill)!.unit==="3.3")).toBe(true);
    }
  });
  it("P4 retains support in book two, tests on Day 6, and removes it in book three",()=>{
    const i=input(changed([["3.3",0,2]],4));
    const second=planned({...i,workbooks:[{number:1,levels:[13]}]},2);
    const mini=second.days.flatMap(d=>d.pages.flatMap(p=>p.parts.filter(p=>p.kind==="mini-test").map(p=>({day:d.day,p}))));
    expect(mini).toHaveLength(1);expect(mini[0].day).toBe(6);
    expect(mini[0].p.skills.every(s=>BC.skill(s)!.unit==="3.3")).toBe(true);
    expect(second.personal?.start.rule).toBe("P0");
    const third=planned({...i,workbooks:[{number:1,levels:[13]},{number:2,levels:[13]}]},3);
    expect(third.units.support).toBeNull();
    expect(third.days.flatMap(d=>d.pages.flatMap(p=>p.parts)).some(p=>p.kind==="mini-test")).toBe(false);
  });
  it("P4 applies the parent's catch-up request to two early gaps, after clear-fact rules",()=>{
    const p=changed([["2.4",1,2],["3.3",1,2]],4);p.parent.goal="catch_up";
    expect(placeChild(input(p))).toMatchObject({level:{id:"U13"},support:"2.4",trace:{rule:"P4"}});
    p.parent.goal=null;expect(placeChild(input(p))).toMatchObject({level:{id:"U13"},support:null,trace:{rule:"P5"}});
  });
  it("P5 uses the working level for an on-level and a behind child",()=>{
    expect(placeChild(input(changed([],4)))).toMatchObject({level:{id:"U13"},trace:{rule:"P5"}});
    expect(placeChild(input(changed([],3)))).toMatchObject({level:{id:"U10"},trace:{rule:"P5"}});
  });
  it("P5a teaches early-secure start units but skips clear-secure ones",()=>{
    const early=planned(input(changed([["5.1",2,2]],5)));
    const clear=planned(input(changed([["5.1",4,4]],5)));
    expect(early.newSteps.some(s=>s.unit==="5.1"&&s.step===1)).toBe(true);
    expect(clear.newSteps.some(s=>s.unit==="5.1")).toBe(false);
  });
  it("P5b checks untested start units and P7 keeps the ceiling customer at U16",()=>{
    const i=input(),place=placeChild(i),plan=planned(i);
    expect(place.level.id).toBe("U16");expect(place.trace.rules).toContain("P7");
    expect([...new Set(plan.newSteps.map(s=>s.unit))]).toEqual(["5.1","5.9","5.10"]);
    expect(plan.checks.filter(c=>["5.8","5.9"].includes(c.unit))).toEqual([{unit:"5.8",kind:"unit-check",day:1},{unit:"5.9",kind:"unit-check",day:2}]);
    expect(plan.personal?.start.rules).toEqual(expect.arrayContaining(["P5","P5a","P5b","P7","P8"]));
    expect(plan.days.flatMap(d=>d.pages.flatMap(p=>p.parts)).flatMap(p=>p.skills).every(s=>BC.skill(s)!.unit!=="5.13")).toBe(true);
  });
  it("P6 keeps early weak standards below home from lowering the start",()=>{
    const i=input(changed([["2.4",1,2],["3.3",1,2]],4));
    expect(placeChild(i)).toMatchObject({level:{id:"U13"},support:null,trace:{rule:"P5"}});
    expect(planned(i).personal?.start.rules).toContain("P6");
  });
  it("P8 never uses an above-school-grade error as a weakness, even if a stale flag says otherwise",()=>{
    const p=changed([["5.13",0,2]],5);p.standards[0].aboveGrade=false;p.notYetSecure=["5.13"];
    const place=placeChild(input(p));expect(place).toMatchObject({level:{id:"U16"},support:null,trace:{rule:"P5"}});
    expect(planned(input(p)).personal?.weak).toEqual([]);
  });
  it.each([0,9] as const)("P9 keeps grade %i within the existing bounds",grade=>{
    const expected=grade===0?"U1":"U27";
    expect(placeChild(input(null,grade)).level.id).toBe(expected);
    expect(placeChild(input(changed([],grade,grade),grade)).level.id).toBe(expected);
    expect(placeChild({...input(null,grade),workbooks:[{number:1,levels:[30]}]}).level.id).toBe("U27");
  });
  it("AI suggestions cannot move placement or alter the plan's units and counts",()=>{
    const p=firstCustomerProfile(),before=planned(input(p));delete p.assessment!.profile.ai;
    const after=planned(input(p));
    expect({...after,personal:undefined}).toEqual({...before,personal:undefined});
  });
  it("with no new signals, the whole plan stays identical to the previous public planner",()=>{
    const p=changed([["4.1",2,2],["3.3",1,2]],4);p.assessment=null;
    for(const i of [input(null),input(p)]) {
      const place=placeChild(i),level=planLevel(BC,place.level.id)!;
      const old=planWorkbook({profile:{standards:i.profile?.standards??[]},grade:i.grade,level,passed:{},workbook:{number:1,inLevel:0},reviews:[],missedReviews:[],misses:[],pausedWeeks:0,support:null,unassessedUnits:place.level.units.filter(u=>!i.profile?.standards.some(s=>s.code===u))});
      expect(old.ok).toBe(true);if(old.ok)expect(planned(i)).toEqual(old.plan);
    }
  });
  it("fills lower-level P4 support and mini-test pages through the public generator",async()=>{
    const p=changed([["3.3",0,2]],4),i=input(p);
    const plan=planned({...i,workbooks:[{number:1,levels:[13]}]},2);
    // Selected support pages test generation, not physical print acceptance. The fit seam is deliberately fake.
    const selected={...plan,days:plan.days.filter(d=>[1,6].includes(d.day)).map(d=>({...d,pages:d.pages.filter(page=>page.parts.some(part=>part.kind==="mini-test"||(part.kind==="remember-these"&&part.reviews===undefined)))}))};
    const child="00000000-0000-4000-8000-000000000004",parent="00000000-0000-4000-8000-000000000001";
    let token=0;
    const result=await generateWorkbook({workbookId:"00000000-0000-4000-8000-000000000042",childId:child,number:2,profileBuild:null,plan:selected,curriculum:BC,itemPolicy:"approved-v1",book:{child:"C.D."}},{ai:fakeAiClient({answer:fakeWorkbookItems}),fit:{fits:async page=>page.questions.length<=10?{ok:true}:{ok:false,problems:[{question:null,reason:"test page holds at most ten questions"}]}},store:memoryDraftStore({[child]:parent}),qrToken:()=>`support-token-${String(++token).padStart(8,"0")}`,solver:keySolver()});
    if(result.status!=="stored")throw new Error(JSON.stringify(result));
    const pages=result.draft.pages.filter(p=>p.day!==null);
    expect(pages).toHaveLength(2);
    for(const page of pages) {
      expect(page.questions.length).toBeGreaterThan(0);
      expect(page.questions.every(q=>q.package?.skill.standard==="3.3")).toBe(true);
      expect(page.questions.every(q=>q.check.status==="checked")).toBe(true);
    }
  },60000);
});
