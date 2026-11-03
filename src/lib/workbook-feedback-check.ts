// Permanent #479 guards shared by the renderer and the #480 writer.
import { checkQuestionPackage, packageItem, type ItemFormat, type QuestionPackage } from "@/lib/question-package";
import { dayDifficulty } from "@/lib/workbook-plan";
import { printedValues, skillRange } from "@/lib/workbook-book";
import { aiTextProblem } from "@/lib/number-words";
import type { Curriculum } from "@/lib/workbook-curriculum";
import { stepBounds, stepOf, stepTemplateOf } from "@/lib/workbook-step-items";

export function instructionProblem(text: string): string | null {
  if (!text.trim() || /[\r\n]/.test(text)) return "Every page needs a plain instruction on one line.";
  if (/(?:\b(?:watch|stretch you|in all|altogether|left over)\b|\bunit [ab]:)/i.test(text)) return "Use plain instructions without internal unit labels.";
  return null;
}

export function feedbackItemProblem(p: QuestionPackage): string | null {
  const text = p.text;
  if (p.level >= 4 && (/\bdraw(?:ing)?\b/i.test(text) || p.item?.format === "draw")) return "Drawing tasks are only for Kindergarten. Colour a printed figure instead.";
  if (p.level > 3 && /\btrac(?:e|ing)\b/i.test(text)) return "Tracing is only for Kindergarten.";
  if (p.item?.format === "draw" && !/\b(?:ten-frame|number line|shape|triangle|square|rectangle|circle|angle|array|graph|symmetry|polygon|net|coordinate)\b/i.test(text) && !/^Colour \d+ dots in the row\.$/.test(text)) return "Drawing must be the math. Use colouring or a ten-frame for counting.";
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
    const countingTask = p.operation === null && ["draw","colour-or-shade"].includes(p.item?.format ?? "") && p.skill.skills.every(s => /count-objects|how-many|count-scattered|subitize|ten-frame/.test(s)) && /^(?:Colour \d+ dots in the row\.|Colour in \d+ cells?(?: on the printed ten-frame)?\.)$/.test(p.text);
    if (p.item?.figure && !countingTask && (d.helpLevel === "none" || d.helpLevel === "new-ideas-only" && !["worked-example", "now-you", "try-first"].includes(place))) return "This day has no picture support in this place.";
    const item = packageItem(p);
    if (!Object.hasOwn(READABLE_FORMATS, item.format)) return "The daily number check cannot read this item format.";
    const checked = checkQuestionPackage(p);
    if (checked.status === "failed" || checked.status === "unsupported" && !(p.operation === null && item.parentChecked && !item.scorable && item.checks.length === 0))
      return `The daily number check cannot read this item: ${checked.reason}`;
    if (p.skill.skills.length === 0 || p.skill.skills.some(s => !curriculum.skill(s))) return "The daily number check needs a known curriculum skill.";
    // #489: a step template item's numbers come from its step's ranges, which replace the day's cap (the book moves
    // through the steps); the AI-text rules read only words the AI wrote.
    const template = stepTemplateOf(p);
    if (template) {
      const step = stepOf(curriculum, template.skill, template.step);
      if (!step) return "The daily number check needs the item's curriculum step.";
      const words = p.textSource === "ai" ? aiTextProblem(p.text, { skill: p.skill.skills[0], money: skillRange(curriculum, p.level, p.skill.skills[0]).money }) : null;
      if (words) return `The daily number check cannot read this item: ${words}`;
      const bounds = stepBounds(step);
      const out = bounds && printedValues(p, []).find(n => Number.isFinite(n.value) && (n.value < bounds.min || n.value > bounds.max));
      return out ? `The step's numbers are ${bounds!.min} to ${bounds!.max}, not ${out.value}.` : null;
    }
    const ranges = p.skill.skills.map(s => skillRange(curriculum, p.level, s));
    const context = { skill: p.skill.skills[0], money: ranges.every(r => r.money) };
    const text = aiTextProblem(p.text, context) ?? (p.easierExample ? aiTextProblem(p.easierExample.text, context) : null);
    if (text) return `The daily number check cannot read this item: ${text}`;
    // Fluency facts (warm-up, in your head) keep their skill's whole fixed range (#489).
    const max = place === "warm-up" || place === "in-your-head" ? Math.max(...ranges.map(r => r.max)) : Math.min(d.numberRange.max, ...ranges.map(r => Math.max(5, Math.ceil(r.max * d.rangeFraction))));
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
