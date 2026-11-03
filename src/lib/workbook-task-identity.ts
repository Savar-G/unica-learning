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
