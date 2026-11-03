import type { QuestionPackage } from "./question-package";
import { PEOPLE, THINGS } from "./workbook-wording";

/** A step template item's format ("missing", "true-false", ...), from its template id (#489); null for any other item. */
const templateFormat = (p: QuestionPackage): string | null =>
  p.ref.source === "workbook" ? /^[^#\s]+#\d+\.\d+:([a-z-]+)$/.exec(p.templateId ?? "")?.[1] ?? null : null;

/** Capitalised words that start a sentence, never a person ("True or false", "How many"). */
const STARTS: ReadonlySet<string> = new Set(["Will", "How", "What", "Which", "Is", "Are", "Does", "Do", "Can", "Did", "Then", "The", "A", "An", "Circle", "Colour", "Fill", "Write", "Add", "Start", "Count", "Never", "Sometimes", "Always", "It", "In", "Each", "Find", "Look", "Think",
    // Words that start a sentence and are never a person (#489: "True or false: ..." is no one's name).
    "True", "False", "Yes", "No", "Say", "Begin", "Choose", "Explain", "Use", "Order", "Compare", "Show", "Name", "Put", "Make", "Tell",
    "Match", "Round", "Estimate", "Solve", "Who", "Where", "When", "Why", "She", "He", "They", "There", "This", "That", "These", "Those",
    "If", "On", "At", "From", "After", "Before", "Between", "Around", "About", "Ten", "Twenty", "Half", "One", "Two", "Three", "Four", "Five",
    "Six", "Seven", "Eight", "Nine", "Skip", "Sort", "Shade", "Mark", "Measure", "Plot", "Work", "Check", "Copy", "Complete", "Give", "Divide",
    "Multiply", "Subtract", "Simplify", "Convert", "Describe", "Predict", "Continue", "Extend", "Build", "Record", "List", "Fix", "Most", "All"]);

/** Ignore incidental names, quantities and objects when comparing the task. */
export function storyFrame(text: string): string {
  // A printed blank ("Count on: 8, __, __.") is not a name.
  text = text.replace(/_{2,}/g, " blank ");
  const incidental = [...PEOPLE, ...THINGS, ...THINGS.map(x => x.replace(/s$/, "")), "dog", "dogs", "cat", "cats", "bird", "birds", "fish", "frogs", "ducks"];
  const starts = STARTS;
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
  const template = templateFormat(p);
  if (template) return `template:${template}`;
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


/**
 * What a question asks, as mathematical data (#482 review): the operation and its operands, or the item's checks and
 * picture, with the format family (a drill, a story with its frame, an error to spot, ...). Where the printed "?" or
 * "=" sits is not part of it, so "9 × 2 = ?" and "? = 9 × 2" are one task. Region ids are left out too.
 */
export function taskIdentity(p: QuestionPackage): string {
  // One printed task for every path (#482 reviews at 3134252 and db3b1a0): template, hand-built and existing-writer
  // questions alike are their format family (a drill, a story, an error to spot, two ways, a colouring, an explanation),
  // the numbers they print with their sequence terms in any order (where the "?" sits does not matter), their answers
  // and their picture. "11 × 5 = ?" from two fills, two templates or two builders is one task; so are two stories that
  // work the same numbers to the same answer, whatever box they print in (a story card or a row). A question that
  // prints no number is its words.
  const f = p.item?.format;
  const family = f === "spot-the-error" ? "error" : f === "two-ways" ? "two-ways" : f === "written-reason" ? "explain"
    : f === "draw" || f === "colour-or-shade" ? "colour" : contextFrame(p.text) || p.textSource === "ai" ? "story" : "drill";
  const numbers = printedTaskNumbers(p);
  // (Its words with the names taken out: "when Jon fills it" and "when Raj fills it" ask one thing.)
  // (And its places: "always sunny at the beach" and "at the rink" ask one thing, the real U4 sample.)
  const words = numbers.length ? null : contextFrame(p.text) ?? p.text.toLowerCase().replace(PLACE, " _ ").replace(/[^a-z0-9_]+/g, " ").trim();
  return JSON.stringify(["task", family, numbers, answersOf(p), p.item?.figure ?? null, words]);
}

/**
 * The context or format a printed question shows (Cedric's section 9: bare numbers, a short story, a ten-frame or
 * number line, a missing number, true or false): a question with a person or a thing is its context (its story frame);
 * else its picture, or the kind of drill it is.
 */
export function printedForm(p: QuestionPackage): string {
  const context = contextFrame(p.text);
  if (context && p.item?.format !== "written-reason") return `context:${context}`;
  const frame = storyFrame(p.text);
  // A step template item with no context: the format it prints (true or false, a choice, a count with boxes, a missing
  // number, a comparison, bare numbers), never its template (#482 review at 3134252).
  if (templateFormat(p)) return printedTemplateForm(p);
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

/** The numbers a question prints, the sequence's printed terms included, from least to greatest. */
function printedTaskNumbers(p: QuestionPackage): number[] {
  const terms = (p.item?.checks ?? []).flatMap((c) => (c.kind === "sequence" ? c.terms.flatMap((t) => ("region" in t ? [] : t.type === "number" ? [t.value] : [])) : []));
  return [...(p.text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number), ...terms].sort((a, b) => a - b);
}

/** A question's answers as printed in its key: each box's value and each circled choice, in order. */
function answersOf(p: QuestionPackage): string[] {
  return (p.item?.regions ?? []).flatMap((r) => (r.kind === "box" && r.answer ? [JSON.stringify(r.answer)] : r.kind === "choice" && r.answer ? [r.answer.toLowerCase()] : []));
}

/** The printed format of a step template item with no context. */
function printedTemplateForm(p: QuestionPackage): string {
  const item = p.item;
  const seq = item?.checks.find((c) => c.kind === "sequence");
  if (seq?.kind === "sequence") return `sequence:${seq.step.type === "number" && seq.step.value < 0 ? "back" : "on"}`;
  if (item?.format === "spot-the-error") return "spot";
  if (item?.format === "two-ways") return "two-ways";
  if (item?.format === "circle") {
    const choices = item.regions.flatMap((r) => (r.kind === "choice" ? r.choices.map((c) => c.toLowerCase()) : []));
    return choices.includes("true") || choices.includes("yes") ? "true-false" : "choice";
  }
  // A printed blank stands alone ("9 is 4 and ?", "? × ? = 36"); a question's own mark follows its last word.
  if (/(?:^|[\s(=])\?(?=[\s.,)]|$)/.test(p.text)) return "missing";
  if (/\b(?:bigger|biggest|larger|smaller|greater|less|fewer|more|most|least|order)\b/i.test(p.text)) return "compare";
  return "bare";
}

/**
 * A sentence frame (Cedric's section 9): a question in a sentence of 4 words or more about a person or a thing (its
 * context), with the names and numbers taken out. Null for a bare sum or a worded drill with no context ("Count on 1
 * from 13."), which the three-forms rule covers instead.
 */
export function sentenceFrameOf(p: QuestionPackage): string | null {
  const frame = contextFrame(p.text);
  return frame && (frame.match(/[a-z]+/g) ?? []).length >= 4 ? frame : null;
}

/** A place in a story ("at the zoo", "at school", "in the park"). */
const PLACE = /\b(?:at|in|to|on|near) (?:the |a )?(?:zoo|school|pool|beach|farm|library|park|camp|store|rink|fair|museum|market|gym|cafe|lake|garden|playground|field|arena|mall|shop|bakery|class|classroom|home|party|game|show|cabin|ferry|bus|train|track)\b/g;

const CONTEXT_WORDS = new Set([...THINGS, ...THINGS.map(x => x.replace(/s$/, "")), "dog", "dogs", "cat", "cats", "bird", "birds", "fish", "frogs", "ducks"]);

/**
 * A text's context frame (Cedric's section 9: "change the context, not only the name"): names and numbers taken out,
 * the things and places kept; null for a text about no person or thing (a drill).
 */
export function contextFrame(text: string): string | null {
  const blanked = text.replace(/_{2,}/g, " blank ");
  // A name: a capitalised word that is not a sentence's opening word ("A square", "True or false", "How many").
  let named = false;
  const framed = blanked.replace(/\b[A-Z][A-Za-z0-9]*\b/g, w => (STARTS.has(w) || w.length === 1 ? w : (named = true, "_")));
  const words = blanked.toLowerCase().match(/[a-z]+/g) ?? [];
  if (!named && !words.some(w => CONTEXT_WORDS.has(w))) return null;
  // A place is not a new context: "saw the number # on a sign at the zoo" and "... at school" are one frame (the U16
  // review). A person and a thing are.
  return framed
    .toLowerCase().replace(/-?\d+(?:\.\d+)?/g, "#").replace(/\b(?:he|she|him|her|his|hers|they|them|their)\b/g, "_")
    .replace(PLACE, "at _")
    .replace(/[^a-z#_ ]+/g, " ").replace(/\s+/g, " ").trim();
}
