import type { QuestionPackage } from "./question-package";
import { PEOPLE, THINGS } from "./workbook-wording";

/** Ignore incidental names, quantities and objects when comparing the task. */
export function storyFrame(text: string): string {
  const incidental = [...PEOPLE, ...THINGS, ...THINGS.map(x => x.replace(/s$/, "")), "dog", "dogs", "cat", "cats", "bird", "birds", "fish", "frogs", "ducks"];
  const starts = new Set(["Will", "How", "What", "Which", "Is", "Are", "Does", "Do", "Can", "Did", "Then", "The", "A", "An", "Circle", "Colour", "Fill", "Write", "Add", "Start", "Count", "Never", "Sometimes", "Always", "It", "In", "Each", "Find", "Look", "Think"]);
  return text.replace(/\b[A-Z][a-z]*\d*[a-z]*\b/g, word => starts.has(word) ? word : "_").toLowerCase().replace(new RegExp(`\\b(?:${incidental.join("|")})\\b`, "g"), "_")
    .replace(/\b[a-z]+\d+[a-z\d]*\b/g, "_")
    .replace(/\b\d+(?= (?:has|needs|wants|finds|gets|puts|sees|shares|fills|packs|drops))\b/g, "_")
    .replace(/\bwill \d+(?= (?:see|hear|find|meet|get|have|ride)\b)/g, "will _")
    .replace(/\b[a-z]+(?= (?:has|needs|wants|finds|gets|puts|sees|shares|fills|packs|drops))\b/g, "_")
    .replace(/\b(?:he|she|him|her|his)\b/g, "_")
    .replace(/-?\d+(?:\.\d+)?/g, "#").replace(/[^a-z#_]+/g, " ").trim();
}

export function wordedTask(p: QuestionPackage): boolean {
  return p.item?.format === "circle" || p.textSource === "ai" && p.item?.format !== "written-reason";
}

/** Distinguish tasks by what the child does, rather than the answer region. */
export function taskType(p: QuestionPackage): string {
  const check = p.item?.checks[0];
  if (check?.kind === "sequence") return `sequence:${check.step.type === "number" && check.step.value < 0 ? "back" : "on"}`;
  if (["draw", "colour-or-shade"].includes(p.item?.format ?? "")) return p.item?.figure?.kind === "dots" ? "colour-row" : "fill-frame";
  if (p.item?.format === "circle") return "likelihood";
  if (p.item?.format === "written-reason") return "explain";
  if (p.textSource === "ai") return `story:${p.operation?.kind ?? "explain"}`;
  return `${p.operation?.kind ?? check?.kind ?? p.item?.format}`;
}

export function reasoningSteps(p: QuestionPackage): number {
  return p.operation?.kind === "evaluate" ? p.steps.filter(s => s.kind === "operate").length : p.operation ? 1 : 0;
}

const familyOf = (p: QuestionPackage): string => {
  const f = p.item?.format;
  if (f === "spot-the-error") return "error";
  if (f === "written-reason") return "explain";
  if (f === "draw" || f === "colour-or-shade") return "colour";
  if (f === "two-ways") return "two-ways";
  // A question in a sentence (a story, a context) is its frame and its math; a drill is its math alone.
  if (p.textSource === "ai" || f === "show-work" || sentenceFrameOf(p)) return `story:${storyFrame(p.text)}`;
  return "drill";
};

/**
 * What a question asks, as mathematical data (#482 review): the operation and its operands, or the item's checks and
 * picture, with the format family (a drill, a story with its frame, an error to spot, ...). Where the printed "?" or
 * "=" sits is not part of it, so "9 × 2 = ?" and "? = 9 × 2" are one task. Region ids are left out too.
 */
export function taskIdentity(p: QuestionPackage): string {
  const family = familyOf(p);
  if (p.operation) return JSON.stringify([family, p.operation]);
  const checks = (p.item?.checks ?? []).map((c) => {
    const { region: _region, regions: _regions, ...rest } = c as Record<string, unknown>;
    void _region; void _regions;
    return JSON.stringify(rest, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) && "region" in v && Object.keys(v).length === 1 ? "box" : v));
  });
  if (checks.length === 0) return JSON.stringify([family, p.item?.figure ?? null, p.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()]);
  return JSON.stringify([family, checks, p.item?.figure ?? null]);
}

/**
 * The context or format a printed question shows (Cedric's section 9: bare numbers, a short story, a ten-frame or
 * number line, a missing number, true or false): a question with a person or a thing is its context (its story frame);
 * else its picture, or the kind of drill it is.
 */
export function printedForm(p: QuestionPackage): string {
  const frame = storyFrame(p.text);
  if (/_/.test(frame) && p.item?.format !== "written-reason") return `context:${frame}`;
  if (p.item?.figure) return `picture:${p.item.figure.kind}`;
  const f = p.item?.format;
  if (f === "written-reason") return "explain";
  if (f === "spot-the-error" || (p.item?.checks ?? []).some((c) => c.kind === "yes-no")) return "true-false";
  if (f === "draw" || f === "colour-or-shade") return "colour";
  if (f === "circle") return `context:${frame}`;
  if (f === "two-ways") return "two-ways";
  const check = p.item?.checks[0];
  if (check?.kind === "sequence") return `sequence:${check.step.type === "number" && check.step.value < 0 ? "back" : "on"}`;
  if (p.operation?.kind === "missing-addend" || /\?\s*[+\-×÷]|[+\-×÷]\s*\?/.test(p.text)) return "missing";
  if (p.operation) return "bare";
  return check?.kind ?? f ?? "other";
}

/**
 * A sentence frame (Cedric's section 9): a question in a sentence of 4 words or more about a person or a thing (its
 * context), with the names and numbers taken out. Null for a bare sum or a worded drill with no context ("Count on 1
 * from 13."), which the three-forms rule covers instead.
 */
export function sentenceFrameOf(p: QuestionPackage): string | null {
  const frame = storyFrame(p.text);
  return (frame.match(/[a-z]+/g) ?? []).length >= 4 && /_/.test(frame) ? frame : null;
}
