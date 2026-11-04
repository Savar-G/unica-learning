import { describe, expect, it } from "vitest";
import { dayDifficulty } from "@/lib/workbook-plan";

describe("the shared ten-day difficulty schedule", () => {
  it("raises U4 numbers and removes help in three stages", () => {
    expect(Array.from({length:10}, (_, i) => dayDifficulty(4, i+1).numberRange.max)).toEqual([8,9,10,12,13,14,15,17,19,20]);
    expect([1,3,4,7,8,10].map(day => dayDifficulty(4,day).helpLevel)).toEqual(["pictures","pictures","new-ideas-only","new-ideas-only","none","none"]);
    expect(dayDifficulty(4,10)).toMatchObject({difficulty:3,storyShare:.4,maxMinutes:30});
  });
  it("keeps every level bounded and increases its number range on every day", () => {
    for (let level=1;level<=30;level++) {
      const days=Array.from({length:10},(_,i)=>dayDifficulty(level,i+1));
      expect(days.every((d,i)=> i===0 || d.numberRange.max >= days[i-1].numberRange.max)).toBe(true);
      expect(days[7].numberRange.max).toBeGreaterThan(days[0].numberRange.max);
      expect(days.every(d=>d.maxMinutes===30)).toBe(true);
    }
  });
  it("refuses invalid inputs and returns independent values", () => {
    for (const [level,day] of [[0,1],[31,1],[1,0],[1,11],[4.5,1],[4,1.5],[NaN,1]]) expect(()=>dayDifficulty(level,day)).toThrow();
    const d=dayDifficulty(4,1);d.numberRange.max=999;
    expect(dayDifficulty(4,1).numberRange.max).toBe(8);
  });
});
