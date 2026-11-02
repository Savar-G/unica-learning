import { expect, it } from "vitest";
import { reviewDays } from "@/lib/workbook-review-days";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { sampleChild, samplePlanInput } from "@/lib/workbook-sample-profiles";
import { planWorkbook } from "@/lib/workbook-plan";
it("selects 40 review pages while the real plan keeps all 10 days", () => {
  const bc=curriculumFor("bc")!;
  const result=planWorkbook(samplePlanInput(bc,sampleChild(bc,"U4")!,"first"));
  if(!result.ok) throw new Error(result.reason);
  const selected=reviewDays(result.plan,"1,3,5,8,10");
  expect(selected.days.map(d=>d.day)).toEqual([1,3,5,8,10]);
  expect(selected.days.flatMap(d=>d.pages)).toHaveLength(40);
  expect(result.plan.days).toHaveLength(10);
  expect(reviewDays(result.plan)).toBe(result.plan);
  for(const bad of ["", "0", "11", "1,1", "a", "1.5"]) expect(()=>reviewDays(result.plan,bad)).toThrow();
});
