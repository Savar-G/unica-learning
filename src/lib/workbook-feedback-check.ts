// Permanent #479 guards shared by the renderer and the #480 writer.
import { checkQuestionPackage, packageItem, type ItemFormat, type QuestionPackage } from "@/lib/question-package";
import { dayDifficulty } from "@/lib/workbook-plan";
import { printedValues, skillRange } from "@/lib/workbook-book";
import { aiTextProblem } from "@/lib/number-words";
import type { Curriculum } from "@/lib/workbook-curriculum";

export function instructionProblem(text: string): string | null {
  if (!text.trim() || /[\r\n]/.test(text)) return "Every page needs a plain instruction on one line.";
  if (/(?:\b(?:watch|stretch you|in all|altogether|left over)\b|\bunit [ab]:)/i.test(text)) return "Use plain instructions without internal unit labels.";
  return null;
}

export function feedbackItemProblem(p: QuestionPackage): string | null {
  const text = p.text;
  if (p.level > 3 && /\btrac(?:e|ing)\b/i.test(text)) return "Tracing is only for Kindergarten.";
  if (p.item?.format === "draw" && !/\b(?:ten-frame|number line|shape|triangle|square|rectangle|circle|angle|array|graph|symmetry|polygon|net|coordinate)\b/i.test(text)) return "Drawing must be the math. Use colouring or a ten-frame for counting.";
  if (/\bdraw\b/i.test(text) && /\b(?:likely|unlikely|sure|always|sometimes|never|maybe)\b/i.test(text)) return "Likelihood is a circle-the-word question, never a drawing.";
  if (p.skill.skills.some(s => /likelihood/.test(s)) && p.item?.format !== "circle") return "Likelihood uses circle-the-word.";
  return null;
}

/** Each format has a known numeric representation in printedValues, including unscored instructions. */
const READABLE_FORMATS: Record<ItemFormat, true> = {
  "write-number": true, "write-words": true, boxes: true, "fill-table": true, "tick-one": true, circle: true,
  "tick-and-number": true, "two-ways": true, "spot-the-error": true, "show-work": true, "written-reason": true,
  "number-line": true, "colour-or-shade": true, match: true, draw: true, "hands-on": true,
};

// Fixed references named by these curriculum skills, not a general exemption for their compared quantities.
const BENCHMARKS: Readonly<Record<string, readonly number[]>> = {
  "K3-benchmarks-5-10": [0, 5, 10],
  "1.2-benchmarks-10-20": [0, 10, 20],
  "2.2-benchmarks-25-50-100": [0, 25, 50, 100],
};

/** The writer calls this before accepting any format. Unreadable data fails closed. */
export function scheduledItemProblem(p: QuestionPackage, curriculum: Curriculum, day: number, place: string): string | null {
  try {
    const feedback = feedbackItemProblem(p);
    if (feedback) return feedback;
    const d = dayDifficulty(p.level, day);
    if (p.item?.figure && (d.helpLevel === "none" || d.helpLevel === "new-ideas-only" && !["worked-example", "now-you", "try-first"].includes(place))) return "This day has no picture support in this place.";
    const item = packageItem(p);
    if (!Object.hasOwn(READABLE_FORMATS, item.format)) return "The daily number check cannot read this item format.";
    const checked = checkQuestionPackage(p);
    if (checked.status === "failed" || checked.status === "unsupported" && !(p.operation === null && item.parentChecked && !item.scorable && item.checks.length === 0))
      return `The daily number check cannot read this item: ${checked.reason}`;
    if (p.skill.skills.length === 0 || p.skill.skills.some(s => !curriculum.skill(s))) return "The daily number check needs a known curriculum skill.";
    const ranges = p.skill.skills.map(s => skillRange(curriculum, p.level, s));
    const context = { skill: p.skill.skills[0], money: ranges.every(r => r.money) };
    const text = aiTextProblem(p.text, context) ?? (p.easierExample ? aiTextProblem(p.easierExample.text, context) : null);
    if (text) return `The daily number check cannot read this item: ${text}`;
    const max = Math.min(d.numberRange.max, ...ranges.map(r => Math.max(5, Math.ceil(r.max * d.rangeFraction))));
    const allowed = p.skill.skills.map(s => BENCHMARKS[s] ?? []);
    const references = p.operation ? [] : item.checks.flatMap(c => c.kind === "relation"
      ? c.to.filter(n => allowed.every(values => values.includes(n))) : []);
    const numbers = printedValues(p, references);
    if (numbers.some(n => !Number.isFinite(n.value))) return "The daily number check cannot read a non-finite quantity.";
    const big = numbers.find(n => {
      // Only typed coin givens and clock components retain their taught fixed values, never computed money.
      if (n.given === "coin" && ranges.every(r => r.money)) return false;
      if ((n.form === "time" || n.form === "colon" && n.clock) && ranges.every(r => r.time)) return false;
      return Math.abs(n.value) > max;
    });
    return big ? `Day ${day} uses numbers up to ${max}.` : null;
  } catch {
    return "The daily number check cannot read this item.";

  }
}

/** Conservative planning estimate. The #480 whole-book gate applies the 30-minute limit. */
export function estimatedDayMinutes(questions: readonly QuestionPackage[], panels = 0): number {
  return Math.round((2 + panels * .5 + questions.reduce((n, q) => n + (["two-ways", "written-reason"].includes(q.item?.format ?? "") ? 1
    : ["show-work", "draw"].includes(q.item?.format ?? "") || ["solve", "evaluate"].includes(q.operation?.kind ?? "") ? .75 : .3), 0)) * 10) / 10;
}

export function dayTimeProblem(questions: readonly QuestionPackage[], panels = 0): string | null {
  const minutes=estimatedDayMinutes(questions,panels);
  return minutes > 30 ? `The day needs an estimated ${minutes} minutes; the limit is 30.` : null;
}
