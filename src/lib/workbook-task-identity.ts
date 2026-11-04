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
    "Multiply", "Subtract", "Simplify", "Convert", "Describe", "Predict", "Continue", "Extend", "Build", "Record", "List", "Fix", "Most", "All",
    // ("Missing number: 10 000 - ? = 4913" is no one's story, the real U16 r13 Word problems.)
    "Missing", "Number", "Numbers", "Answer", "Ones", "Tens", "Hundreds", "Thousands", "Pattern", "Rule", "Next", "Last", "First"]);

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
  // (A story by its printed words, whoever wrote them: the planner and the book check read one type, the full U16 book's
  // Mixed set took three "then 17 more" stories as "add".)
  if (p.textSource === "ai" || contextFrame(p.text)) return `story:${p.operation?.kind ?? "explain"}`;
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
    // (From the printed text alone: who wrote it, the AI or code, never changes the task, Codex at 47c5fd78.)
    : f === "draw" || f === "colour-or-shade" ? "colour" : contextFrame(p.text) ? "story" : "drill";
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
  if (p.operation?.kind === "missing-addend" || /\?\s*[+\-−×÷]|[+\-−×÷]\s*\?/.test(p.text)) return "missing";
  if (p.operation) return "bare";
  return check?.kind ?? f ?? "other";
}

/** The numbers a question prints, the sequence's printed terms included, from least to greatest. */
function printedTaskNumbers(p: QuestionPackage): number[] {
  const terms = (p.item?.checks ?? []).flatMap((c) => (c.kind === "sequence" ? c.terms.flatMap((t) => ("region" in t ? [] : t.type === "number" ? [t.value] : [])) : []));
  const printed = (p.text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  // The choices a question prints are not its task (Codex at 24751f16: "6 is 1 and which number: 6 or 5?" asks "6 is 1
  // and ?"): each printed choice's number is taken out once, and the answer stays through the key.
  for (const r of p.item?.regions ?? []) if (r.kind === "choice") for (const c of r.choices) {
    const at = /^-?\d+(?:\.\d+)?$/.test(c.trim()) ? printed.lastIndexOf(Number(c.trim())) : -1;
    if (at >= 0) printed.splice(at, 1);
  }
  return [...printed, ...terms].sort((a, b) => a - b);
}

/** A question's answers as printed in its key: each box's value and each circled choice, in order. */
function answersOf(p: QuestionPackage): string[] {
  // (A number is one answer, written in a box or circled: "5".)
  return (p.item?.regions ?? []).flatMap((r) => (r.kind === "box" && r.answer ? [r.answer.type === "number" ? String(r.answer.value) : JSON.stringify(r.answer)] : r.kind === "choice" && r.answer ? [r.answer.trim().toLowerCase()] : []));
}

/** The largest number a question prints or answers ("10 000" read as one number). */
export function largestNumber(p: QuestionPackage): number {
  const printed = (p.text.match(/\d{1,3}(?:[ \u202f\u00a0,]\d{3})+|\d+/g) ?? []).map((x) => Number(x.replace(/\D/g, "")));
  const answers = (p.item?.regions ?? []).flatMap((r) => (r.kind === "box" && r.answer?.type === "number" ? [r.answer.value] : []));
  const top = p.answer?.value?.type === "number" ? [p.answer.value.value] : [];
  return Math.max(0, ...printed, ...answers, ...top);
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
/** A place-value word ("thousands", "ten thousands") is part of a question's numbers, not its frame (the U16 review: "saw
 * the number on a sign ... hundreds place" and "... thousands place" are one frame). */
const PLACE_VALUE = /\b(?:(?:ten|hundred) )?(?:ones|tens|hundreds|thousands|millions)\b|(?<=[#0-9] )(?:(?:ten|hundred) )?(?:one|ten|hundred|thousand|million)\b/g;

export function sentenceFrameOf(p: QuestionPackage): string | null {
  const frame = contextFrame(p.text)?.replace(PLACE_VALUE, "_place");
  return frame && (frame.match(/[a-z]+/g) ?? []).length >= 4 ? frame : null;
}

/**
 * A question's stem when no person or thing is in it (the U16 review: six "In N, which digit is in the thousands
 * place?" on one page): its words with numbers and places taken out, for a question of 4 words or more. Bare sums and
 * "Missing number: 6 × __ = 42" have none. A page prints a stem twice at most.
 */
export function stemOf(p: QuestionPackage): string | null {
  if (contextFrame(p.text)) return null;
  const stem = p.text.toLowerCase().replace(PLACE, " _ ").replace(PLACE_VALUE, "_place").replace(/\d+(?:[.,\u202f\u00a0 ]\d+)*/g, "#").replace(/[^a-z#_]+/g, " ").trim();
  return (stem.match(/[a-z]+/g) ?? []).length >= 4 ? stem : null;
}

/** A place in a story ("at the zoo", "at school", "in the park"). */
const PLACE = /\b(?:at|in|to|on|near) (?:the |a )?(?:zoo|school|pool|beach|farm|library|park|camp|store|rink|fair|museum|market|gym|cafe|lake|garden|playground|field|arena|mall|shop|bakery|class|classroom|home|party|game|show|cabin|ferry|bus|train|track)\b/g;

const CONTEXT_WORDS = new Set([...THINGS, ...THINGS.map(x => x.replace(/s$/, "")), "dog", "dogs", "cat", "cats", "bird", "birds", "fish", "frogs", "ducks",
  // (A school, shop or farm and what it counts is a story's context too: Cedric's v2 "A school orders 9 boxes of 490 pencils".)
  "school", "shop", "store", "farm", "class", "team", "club", "library", "bakery", "pencils", "people", "eggs", "seats"]);

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

/**
 * The kind of a number story (the U4 review: a stories page mixes them): compare ("wants 10. How many more?"),
 * take away ("eats 3"), part and whole ("the rest are blue"), equal groups ("each", "packs of") or join ("gets 2 more").
 * Null for a question that is no story.
 */
export function storyKind(text: string): "compare" | "take-away" | "part-whole" | "groups" | "join" | null {
  const t = text.toLowerCase();
  if (/\bwants?\b|\bneeds?\b|how many more\b|how many fewer\b|\bmore than\b|\bfewer than\b|\bdifference\b/.test(t)) return "compare";
  if (/\beats?\b|\bgives?\b.*\baway\b|\bleft\b|\btakes? out\b|\bloses?\b|\bspends?\b|\buses?\b/.test(t)) return "take-away";
  if (/\bthe rest\b|\bare not in\b|\bare in an? \w+\b/.test(t)) return "part-whole";
  if (/\beach\b|\bpacks? of\b|\bper\b|\bshares?\b|\bequally\b|\bboxes with\b|\bcarries\b/.test(t)) return "groups";
  if (/\bgets?\b|\bfinds?\b|\bmore\b|\bin all\b|\baltogether\b|\btogether\b|\bboth days\b|\bon monday\b/.test(t)) return "join";
  return null;
}


/**
 * A Challenge or Show what you know card's frame: its words with names, things, places, numbers and place-value units
 * taken out ("Write # _place, # _place, # _place and # _place as a number."; "_ counts # _ on monday ... on friday").
 * The book prints each once on those pages (the U16 r13 review: one frame on the Challenge of Days 1, 5 and 10). Null
 * for a question of fewer than 4 words, a bare sum.
 */
const CARD_WORDS: ReadonlySet<string> = new Set(["more", "less", "fewer", "of", "and", "or", "in", "on", "to", "is", "are", "make", "makes", "times", "each", "away", "left", "all", "as", "a", "the", "comes", "come", "than", "by", "with", "for", "from", "at", "then", "now", "this", "that", "it", "write", "what", "how", "which"]);
export function cardFrame(p: QuestionPackage): string | null {
  // (The thing a number counts is no new frame: "counts # tickets" and "counts # points" are one, the U16 r13 review.)
  const base = storyFrame(p.text.replace(PLACE, " _ ")).replace(PLACE_VALUE, "_place");
  // (Two words too: "# hockey cards" and "# beads" are one frame.)
  const counted = new Set([...base.matchAll(/# ([a-z]+)(?: ([a-z]+))?/g)].flatMap((m) => CARD_WORDS.has(m[1]) ? [] : m[2] && !CARD_WORDS.has(m[2]) ? [m[1], m[2]] : [m[1]]));
  const frame = (counted.size ? base.replace(new RegExp(`\\b(?:${[...counted].join("|")})\\b`, "g"), "_") : base).replace(/\s+/g, " ").trim();
  return (frame.match(/[a-z]+/g) ?? []).length >= 4 ? frame : null;
}

/** One printed use of a card frame: its day, whether on a Challenge, and its printed numbers. */
export interface CardFrameUse { day: number | null; challenge: boolean; numbers: string }

/** A card's printed numbers, least to greatest: a frame printed again needs fresh ones. */
export const cardNumbers = (p: QuestionPackage): string => (p.text.replace(/(\d)[\u00a0\u202f ](?=\d{3}\b)/g, "$1").match(/\d+(?:\.\d+)?/g) ?? []).map(Number).sort((a, b) => a - b).join(",");

/**
 * Why a card may not print its frame again, or null (Savar, 2026-11-03, relaxing the U16 r13 rule): a Challenge or Show
 * what you know frame twice a book at most, never on two Challenge days in a row (nor twice on one day), always with
 * fresh numbers.
 */
export function cardFrameProblem(uses: readonly CardFrameUse[], use: CardFrameUse): string | null {
  if (uses.length >= 2) return "its frame is already printed twice in the book";
  if (uses.some((u) => u.numbers === use.numbers)) return "its frame is printed again with the same numbers";
  if (use.day !== null && uses.some((u) => u.day !== null && Math.abs(u.day - use.day!) <= 1 && (u.challenge && use.challenge || u.day === use.day))) return "its frame is on the Challenge of the day before or after";
  return null;
}

