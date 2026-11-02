// Permanent #479 guards shared by the renderer and the #480 writer.
import { operationResult, type QuestionPackage } from "@/lib/question-package";
import { dayDifficulty } from "@/lib/workbook-plan";
import { printedNumbers, skillRange } from "@/lib/workbook-book";
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

/** The writer calls this before accepting an item. Fixed benchmarks keep their taught value. */
export function scheduledItemProblem(p: QuestionPackage, curriculum: Curriculum, day: number, place: string): string | null {
  const feedback = feedbackItemProblem(p);
  if (feedback) return feedback;
  const d = dayDifficulty(p.level, day);
  if (p.item?.figure && (d.helpLevel === "none" || d.helpLevel === "new-ideas-only" && !["worked-example", "now-you", "try-first"].includes(place))) return "This day has no picture support in this place.";
  const scalar = p.operation && ["add", "subtract", "multiply", "divide", "missing-addend"].includes(p.operation.kind);
  if (scalar) {
    const ranges = p.skill.skills.map(s => skillRange(curriculum, p.level, s));
    const max = Math.min(...ranges.map(r => r.fractions || r.decimals || r.money || r.time ? r.max : Math.max(5, Math.ceil(r.max * d.rangeFraction))));
    const answer = operationResult(p.operation!);
    if ((answer.type === "number" && answer.value > max) || printedNumbers(p).some(n => n > max)) return `Day ${day} uses numbers up to ${max}.`;
  }
  return null;
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
