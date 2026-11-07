import type { GeneratedWorkbook } from "@/lib/workbook-generator";
import type { QuestionPackage } from "@/lib/question-package";

// Read-only interpretation of saved how-plan content at 99995ca2 (#679).
// Keep this version fixed. A future print format needs a separate interpreter.
// These estimates are the howPlanPage/generatedDayTime rules at that source pin.
function printed(q: QuestionPackage): QuestionPackage {
  return q.operationSource === "maya" ? { ...q, operation: null } : q;
}

function dayTime(pages: GeneratedWorkbook["pages"]): { requiredMinutes: number; hasExtra: boolean } {
  const hasExtra = pages.some(p => p.content?.kind === "day" && p.content.blocks.some(b => b.extra));
  let panels = 0, turns = 0;
  const questions: QuestionPackage[] = [];
  let reading = 0;
  for (const page of pages) {
    const blocks = page.content?.kind === "day" ? page.content.blocks : [];
    const kept = page.questions.filter(q => {
      const owners = blocks.filter(b => b.items.includes(q.number));
      return !hasExtra || !owners.length || owners.some(b => !b.extra);
    });
    for (const q of kept) {
      if (!q.package) { reading += .5; continue; }
      const p = printed(q.package), f = p.item?.format;
      questions.push(p);
      reading += p.text.trim().split(/\s+/).length / 80
        + (f === "written-reason" || f === "two-ways" ? 1.25 : f === "show-work" || f === "draw" ? .8 : .25)
        + Math.max(0, (p.item?.regions.filter(r => r.kind === "box").length ?? 1) - 1) * .08;
    }
    panels += blocks.filter(b => ["worked-example", "watch-one", "reminder"].includes(b.slot) && (!hasExtra || !b.extra)).length;
    if (!hasExtra || kept.length || blocks.some(b => !b.extra)) turns++;
  }
  const estimate = Math.round((2 + panels * .5 + questions.reduce((n, q) => n
    + (["two-ways", "written-reason"].includes(q.item?.format ?? "") ? 1
      : ["show-work", "draw"].includes(q.item?.format ?? "") || ["solve", "evaluate"].includes(q.operation?.kind ?? "") ? .75 : .3), 0)) * 10) / 10;
  return { requiredMinutes: Math.max(reading + turns * .35, estimate), hasExtra };
}

export interface SavedScheduleRow {
  day: number;
  topic: string;
  second: string;
  pages: [number, number];
  /** Null means the printed table has no per-day required-time value. */
  requiredMinutes: number | null;
  extra: boolean;
}

export function savedScheduleV1(draft: GeneratedWorkbook): { rows: SavedScheduleRow[]; dailyTime: string } | null {
  const plans = draft.pages.filter(p => p.content?.kind === "how-plan");
  const c = plans[0]?.content;
  if (plans.length !== 1 || plans[0].number !== 2 || c?.kind !== "how-plan" || c.workbook !== draft.number || !c.rows.length) return null;
  const seen = new Set<number>();
  const rows: SavedScheduleRow[] = c.rows.map(r => {
    if (!Number.isInteger(r.day) || r.day < 1 || seen.has(r.day) || !r.topic || typeof r.second !== "string"
      || r.pages.length !== 2 || !r.pages.every(Number.isInteger) || r.pages[0] < 3 || r.pages[1] < r.pages[0]) throw new Error("Invalid saved plan row");
    seen.add(r.day);
    const pages = draft.pages.filter(p => p.content?.kind === "day" && !p.content.extraPractice && p.content.day === r.day);
    const calculated = pages.some(p => p.content?.kind === "day" && (p.content.requiredTimeTarget !== undefined || p.content.blocks.some(b => b.extra)));
    const t = calculated ? dayTime(pages) : r.requiredMinutes === undefined ? null : { requiredMinutes: r.requiredMinutes, hasExtra: !!r.extra };
    if (t && (!Number.isFinite(t.requiredMinutes) || t.requiredMinutes <= 0)) throw new Error("Invalid saved time");
    return { day: r.day, topic: r.topic, second: r.second, pages: [...r.pages], requiredMinutes: t ? Math.ceil(t.requiredMinutes - 1e-9) : null, extra: !!t?.hasExtra };
  });
  if (!Number.isFinite(c.minutes.min) || !Number.isFinite(c.minutes.max) || c.minutes.min <= 0 || c.minutes.max < c.minutes.min) return null;
  const timed = rows.filter(r => r.requiredMinutes !== null);
  const extra = timed.some(r => r.extra);
  const dailyTime = timed.length ? `about ${Math.max(...timed.map(r => r.requiredMinutes!))} minutes${extra ? ", plus Extra if there's time" : ""}`
    : `${c.minutes.min === c.minutes.max ? `about ${c.minutes.max}` : `${c.minutes.min} to ${c.minutes.max}`} minutes`;
  return { rows, dailyTime };
}
