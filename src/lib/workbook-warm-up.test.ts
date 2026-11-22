import { describe, expect, it } from "vitest";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { fakeWorkbookItems } from "@/lib/workbook-ai-fake";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { memoryDraftStore } from "@/lib/workbook-draft-memory";
import { generateWorkbook } from "@/lib/workbook-generator";
import { planWorkbook } from "@/lib/workbook-plan";
import { workbookQuality } from "@/lib/workbook-quality";
import { bookPersona, firstCustomerProfile, sampleChild, samplePlanInput } from "@/lib/workbook-sample-profiles";
import { planNextWorkbook } from "@/lib/workbook-placement";
import { keySolver } from "@/lib/workbook-solve-check";
import { buildStepItem, needsColumnWork, stepRank, stepTemplateItem } from "@/lib/workbook-step-items";
import { commaNumbers } from "@/lib/workbook-template";
import {
  warmUpAllowedSteps,
  warmUpDayTargets,
  warmUpMaxChars,
  warmUpPrintableSteps,
  warmUpProgression,
  warmUpProgressionProblem,
  warmUpStepForSlot,
} from "@/lib/workbook-warm-up";

const BC = curriculumFor("bc")!;

function firstPlan(level: string) {
  const r = planWorkbook(samplePlanInput(BC, sampleChild(BC, level)!, "first"));
  if (!r.ok) throw new Error(r.reason);
  return r.plan;
}

describe("warm-up step progression (src/lib/workbook-warm-up.ts)", () => {
  it.each(["U8", "U10", "U13", "U16", "U19", "U22"])("rises in step and rank from Day 1 to Day 6 to Day 10 at %s", (level) => {
    const plan = firstPlan(level);
    const fluency = plan.days[0].pages[0].parts.find((p) => p.kind === "warm-up")!.skills;
    const count = plan.level >= 10 ? 12 : 8;
    const scoreOf = (day: number) => {
      const targets = warmUpDayTargets(BC, plan, day, count, fluency);
      expect(targets).toHaveLength(count);
      const avgRank = targets.reduce((sum, t) => sum + (stepRank(BC, t.skill, t.step) ?? 0), 0) / targets.length;
      const avgOrder = targets.reduce((sum, t) => {
        if (t.source === "earlier-taught") return sum + 10 + t.step;
        const steps = warmUpPrintableSteps(BC, t.skill, plan.level);
        return sum + Math.max(0, steps.findIndex((s) => s.step === t.step));
      }, 0) / targets.length;
      return { targets, avgRank, avgOrder };
    };
    const d1 = scoreOf(1);
    const d6 = scoreOf(6);
    const d10 = scoreOf(10);
    // Day 1 uses only fluency skills (no taught book steps yet).
    expect(d1.targets.every((t) => t.source === "fluency")).toBe(true);
    // Progression rises measurably by Day 6 (Page 43) and again by Day 10.
    expect(d6.avgOrder).toBeGreaterThan(d1.avgOrder);
    expect(d10.avgOrder).toBeGreaterThan(d1.avgOrder);
    expect(d10.avgOrder).toBeGreaterThanOrEqual(d6.avgOrder);
  });

  it("never introduces a new skill or step in a warm-up before it is taught, and stays below today's main practice", () => {
    for (const level of ["U8", "U10", "U13", "U16", "U19"]) {
      const plan = firstPlan(level);
      const fluency = plan.days[0].pages[0].parts.find((p) => p.kind === "warm-up")!.skills;
      const fluencySet = new Set(fluency);
      const count = plan.level >= 10 ? 12 : 8;
      for (let day = 1; day <= 10; day++) {
        const targets = warmUpDayTargets(BC, plan, day, count, fluency);
        const todayMain = plan.newSteps.filter((s) => s.day === day);
        for (const t of targets) {
          if (fluencySet.has(t.skill)) continue;
          // Must have been taught on a strictly earlier day.
          const taught = plan.newSteps.find((s) => s.skill === t.skill && s.step === t.step && s.day < day);
          expect(taught, `${level} day ${day}: ${t.skill}#${t.step} must be taught before day ${day}`).toBeTruthy();
          // Must stay strictly below today's step if today continues the same skill, and never exceed medium difficulty.
          for (const m of todayMain) {
            if (m.skill === t.skill) expect(t.step).toBeLessThan(m.step);
          }
          expect(["easy", "medium"]).toContain(t.maxDifficulty);
        }
      }
    }
  });

  it("draws on eligible earlier taught steps on later days (U16 multiply-tens, U19 order-of-operations)", () => {
    const u16 = firstPlan("U16");
    const fl16 = u16.days[0].pages[0].parts.find((p) => p.kind === "warm-up")!.skills;
    const d6 = warmUpDayTargets(BC, u16, 6, 12, fl16);
    expect(d6.some((t) => t.source === "earlier-taught" && t.skill === "5.9-multiply-tens")).toBe(true);
    const allowed6 = warmUpAllowedSteps(BC, u16, 6, fl16);
    expect(allowed6).toContain("5.9-multiply-tens#1");
    expect(allowed6).not.toContain("5.9-distributive#2");

    const u19 = firstPlan("U19");
    const fl19 = u19.days[0].pages[0].parts.find((p) => p.kind === "warm-up")!.skills;
    const d6_19 = warmUpDayTargets(BC, u19, 6, 12, fl19);
    expect(d6_19.some((t) => t.source === "earlier-taught" && t.skill === "6.3-order-of-operations" && t.step === 1)).toBe(true);
  });

  it("keeps personal books' Days 1-5 on fluency skills only, then progresses through Days 6-10", () => {
    const placed = planNextWorkbook({ curriculum: BC, grade: 4, profile: firstCustomerProfile(), workbooks: [], number: 1 });
    if (!placed.ok) throw new Error(placed.reason);
    const plan = placed.plan;
    const fluency = plan.days[0].pages[0].parts.find((p) => p.kind === "warm-up")!.skills;
    for (let day = 1; day <= 5; day++) {
      expect(warmUpDayTargets(BC, plan, day, 12, fluency).every((t) => t.source === "fluency")).toBe(true);
    }
    const d6 = warmUpDayTargets(BC, plan, 6, 12, fluency);
    expect(d6.some((t) => t.source === "earlier-taught")).toBe(true);
    expect(d6.some((t) => t.skill === "5.8-extend-facts" && t.step === 2 || t.skill === "5.9-recall-facts" && t.step === 2)).toBe(true);
  });

  it("fills short single-box numeric warm-up items within .facts room and rises in number magnitude across days", () => {
    for (const [level, skill, step] of [
      [8, "2.3-facts-to-10", 3],
      [10, "3.4-recall-addition-20", 1],
      [10, "3.4-subtraction-facts-20", 4],
      [13, "4.8-multiplication-facts", 3],
      [16, "5.8-extend-facts", 2],
      [16, "5.9-recall-facts", 2],
      [19, "6.2-fact-strategies", 3],
      [22, "7.1-fact-strategies", 2],
    ] as const) {
      const room = warmUpMaxChars(level);
      for (const day of [1, 6, 10]) {
        const filled = stepTemplateItem({ curriculum: BC, skill, step, place: "warm-up", level, day, seed: 101 + day, attempt: 0, ordinal: 0, room });
        expect(filled, `U${level} ${skill}#${step} d${day}`).not.toBeNull();
        expect(filled!.ref.kind).toBe("box");
        expect(commaNumbers(filled!.text).length, filled!.text).toBeLessThanOrEqual(room);
        const built = buildStepItem(filled!.ref, filled!.text, { id: "wu", workbookId: "00000000-0000-4000-8000-0000000000a1", page: 3, question: 1, level, skills: [skill] }, "code");
        expect(built.check.status, filled!.text).toBe("checked");
        expect(built.package!.item!.format).toBe("write-number");
      }
    }
    // Same step rises in sampled magnitude from Day 1 to Day 10.
    const avgSize = (day: number) => {
      const sizes = Array.from({ length: 12 }, (_, k) => {
        const f = stepTemplateItem({ curriculum: BC, skill: "5.8-extend-facts", step: 1, place: "warm-up", level: 16, day, seed: 17 + k * 31, attempt: 0, ordinal: k, room: warmUpMaxChars(16) })!;
        return Math.max(...f.numbers, Number(f.ref.answer));
      });
      return sizes.reduce((a, b) => a + b, 0) / sizes.length;
    };
    expect(avgSize(10)).toBeGreaterThan(avgSize(1));
  });

  it("warmUpStepForSlot falls back across the day's targets on later attempts without jumping ahead", () => {
    const u19 = firstPlan("U19");
    const fl = u19.days[0].pages[0].parts.find((p) => p.kind === "warm-up")!.skills;
    const d1First = warmUpStepForSlot(BC, u19, 1, 12, 0, 0, fl);
    // 6.2-fact-strategies#3 has the easiest short warm-up template ({a} ÷ {d} = ?), before #1 and #2 (medium).
    expect(d1First).toMatchObject({ skill: "6.2-fact-strategies", step: 3, source: "fluency" });
    // Even on late retries on Day 1, never pulls a Day 2+ taught step.
    for (const attempt of [0, 32, 96, 200]) {
      const picked = warmUpStepForSlot(BC, u19, 1, 12, 0, attempt, fl)!;
      expect(fl).toContain(picked.skill);
    }
  });

  it("reports day-by-day warm-up progression and flags flat template warm-ups", () => {
    const mk = (day: number, step: number, diff: "easy" | "medium" | "hard", text: string, answer: string) => ({
      number: 3 + (day - 1) * 8, day, type: "warm-up" as const,
      questions: [{
        place: "warm-up" as const,
        package: { text, difficulty: diff === "easy" ? 1 : diff === "medium" ? 2 : 3 },
        itemPlan: { template: { skill: "5.8-extend-facts", step, difficulty: diff, rank: 160120 + step, answer } },
      }],
    });
    const flat = [mk(1, 1, "easy", "200 + 300 = ?", "500"), mk(10, 1, "easy", "200 + 300 = ?", "500")];
    expect(warmUpProgression(flat)).toHaveLength(2);
    expect(warmUpProgressionProblem(flat)).not.toBeNull();
    const rising = [mk(1, 1, "easy", "200 + 300 = ?", "500"), mk(10, 2, "medium", "5,000 − ? = 4,000", "1000")];
    const risingProg = warmUpProgression(rising);
    expect(risingProg[1].averageMagnitude).toBe(5000);
    expect(warmUpProgressionProblem(rising)).toBeNull();
    // Symmetric prompt-number magnitude: identical facts with vs without template metadata do not falsely pass.
    const sameFactNonTemplate = {
      number: 3, day: 1, type: "warm-up" as const,
      questions: [{ place: "warm-up" as const, package: { text: "3 × 4 = ?", difficulty: 1 }, itemPlan: null }],
    };
    const sameFactTemplated = mk(10, 1, "easy", "3 × 4 = ?", "12");
    expect(warmUpProgression([sameFactNonTemplate, sameFactTemplated]).map((d) => d.averageMagnitude)).toEqual([4, 4]);
    expect(warmUpProgressionProblem([sameFactNonTemplate, sameFactTemplated])).not.toBeNull();
  });

  it("excludes multi-digit regrouping column work and multi-day/held active steps from warm-ups", () => {
    expect(needsColumnWork("34,215 + 12,368 = ?")).toBe(true);
    expect(needsColumnWork("3,678 + 2,745 = ?")).toBe(true);
    expect(needsColumnWork("5,000 − 2,346 = ?")).toBe(true);
    expect(needsColumnWork("465 + 278 = ?")).toBe(true);
    expect(needsColumnWork("8 × 70 = ?")).toBe(false);
    expect(needsColumnWork("15,000 − ? = 10,000")).toBe(false);
    expect(needsColumnWork("432 + 125 = ?")).toBe(false);

    // Multi-day/held step: if Day 4 is still teaching 5.9-multiply-tens#1 (started on Day 2), Day 4's warm-up
    // must not pull 5.9-multiply-tens#1 as an earlier-taught item.
    const u16 = firstPlan("U16");
    const fl = u16.days[0].pages[0].parts.find((p) => p.kind === "warm-up")!.skills;
    const heldDay4 = {
      ...u16,
      days: u16.days.map((d) =>
        d.day === 4
          ? {
              ...d,
              pages: d.pages.map((p, idx) =>
                idx === 1
                  ? { ...p, parts: p.parts.map((part) => ({ ...part, step: { unit: "5.9", skill: "5.9-multiply-tens", step: 1 } })) }
                  : p,
              ),
            }
          : d,
      ),
    };
    expect(warmUpDayTargets(BC, heldDay4, 4, 12, fl).some((t) => t.skill === "5.9-multiply-tens" && t.step === 1)).toBe(false);

    // Cache immutability & negative ordinal safety.
    const cached = warmUpPrintableSteps(BC, "5.8-extend-facts", 16);
    cached.pop();
    expect(warmUpPrintableSteps(BC, "5.8-extend-facts", 16).length).toBeGreaterThan(cached.length);
    expect(warmUpStepForSlot(BC, u16, 1, 12, -1, 0, fl)).not.toBeNull();
  });

  it.each([
    { label: "U8", expectedCount: 8, makePlan: () => firstPlan("U8") },
    { label: "U10", expectedCount: 12, makePlan: () => firstPlan("U10") },
    { label: "U16", expectedCount: 12, makePlan: () => firstPlan("U16") },
    { label: "U19", expectedCount: 12, makePlan: () => firstPlan("U19") },
    {
      label: "on-level (U13 personal)",
      expectedCount: 12,
      makePlan: () => {
        const r = planNextWorkbook({ curriculum: BC, grade: 4, profile: bookPersona("on-level").profile, workbooks: [], number: 1 });
        if (!r.ok) throw new Error(r.reason);
        return r.plan;
      },
    },
    {
      label: "first-customer (U16 personal, stretched)",
      expectedCount: 12,
      makePlan: () => {
        const r = planNextWorkbook({ curriculum: BC, grade: 4, profile: firstCustomerProfile(), workbooks: [], number: 1 });
        if (!r.ok) throw new Error(r.reason);
        return r.plan;
      },
    },
  ])("generates a 10-day $label book with measurably rising warm-ups and preserved format rules", async ({ expectedCount, makePlan }) => {
    const plan = makePlan();
    // Keep each day's warm-up plus enough new-idea pages to satisfy the cover's 3-skill rule.
    const warmUpOnly = {
      ...plan,
      extraPractice: [],
      days: plan.days.map((d) => ({
        ...d,
        pages: d.pages.filter((p) => p.type === "warm-up" || (d.day <= 4 && p.type === "new-idea")),
      })),
    };
    const child = "00000000-0000-4000-8000-000000000071";
    const parent = "00000000-0000-4000-8000-000000000001";
    let token = 0;
    const result = await generateWorkbook(
      {
        workbookId: "00000000-0000-4000-8000-0000000000a1",
        childId: child,
        number: 1,
        profileBuild: null,
        plan: warmUpOnly,
        curriculum: BC,
        itemPolicy: "approved-v1",
        book: { child: "Ava" },
      },
      {
        ai: fakeAiClient({ answer: fakeWorkbookItems }),
        fit: { fits: async () => ({ ok: true as const }) },
        store: memoryDraftStore({ [child]: parent }),
        qrToken: () => `wu-token-${String(++token).padStart(8, "0")}`,
        solver: keySolver(),
      },
    );
    expect(result.status).toBe("stored");
    if (result.status !== "stored") return;
    const warmPages = result.draft.pages.filter((p) => p.type === "warm-up");
    expect(warmPages).toHaveLength(10);
    const fluency = new Set(plan.days[0].pages[0].parts.find((p) => p.kind === "warm-up")!.skills);
    const maxChars = warmUpMaxChars(plan.level);
    for (const p of warmPages) {
      expect(p.questions).toHaveLength(expectedCount);
      for (const q of p.questions) {
        expect(q.check.status).not.toBe("failed");
        expect(q.package!.item!.format).toBe("write-number");
        expect(commaNumbers(q.package!.text).length, q.package!.text).toBeLessThanOrEqual(maxChars);
        const t = q.itemPlan?.template;
        if (t && !fluency.has(t.skill)) {
          // Never introduces a new skill/step before it is taught in the book, and never prints multi-digit column work.
          expect(plan.newSteps.some((s) => s.skill === t.skill && s.step === t.step && s.day < p.day!)).toBe(true);
          expect(needsColumnWork(q.package!.text), q.package!.text).toBe(false);
        }
      }
    }
    const prog = warmUpProgression(warmPages);
    expect(prog).toHaveLength(10);
    expect(warmUpProgressionProblem(warmPages)).toBeNull();
    expect(workbookQuality(warmPages).issues.filter((i) => i.kind === "progress" || i.kind === "step" || i.kind === "range")).toEqual([]);
  });
});
