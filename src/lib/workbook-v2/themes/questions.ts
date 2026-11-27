// Reads one defined question: its slots, its formula, its unit and its approved phrasings. The formula is worked for every
// choice of numbers that the slots allow, so that no book can meet a step that a child cannot write.
import { isPrintable } from "../contract";
import { FieldReader, isId } from "../bank/fields";
import { isRecord } from "../shapes/shape";
import { isPlural, isRegionWord, isScenarioWord, isSingular, PLACEHOLDER } from "./fill";
import { choiceCount, eachChoice } from "./ranges";
import { readExpr, solve } from "./solver";
import type { DefinedQuestion, Phrasing, PhrasingToken, SlotRange } from "./types";

/** A defined question has at least this many approved phrasings, so that a child meets it in other words. */
export const MIN_PHRASINGS = 2;
/** The most choices of numbers that the check of a formula works through. A word problem has small numbers. */
export const MAX_CHOICES = 10_000;
const MAX_NUMBER = 9999;
const SLOT_NAME = /^[a-z][a-z0-9-]{0,31}$/;

function readSlot(r: FieldReader, at: string, raw: unknown): SlotRange | null {
  const fields = r.object(at, raw, ["min", "max"], ["multipleOf"]);
  if (!fields) return null;
  const multipleOf = Object.hasOwn(fields, "multipleOf") ? fields.multipleOf : 1;
  const isNumber = (n: unknown, least: number): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= least && n <= MAX_NUMBER;
  const { min, max } = fields;
  if (!isNumber(min, 0) || !isNumber(max, 0) || min > max) r.problem(at, `min and max must be whole numbers from 0 to ${MAX_NUMBER}, with min not more than max`);
  else if (!isNumber(multipleOf, 1)) r.problem(at, "multipleOf must be a whole number, 1 or more");
  else if (Math.floor(max / multipleOf) * multipleOf < min) r.problem(at, `no number from ${min} to ${max} is a multiple of ${multipleOf}`);
  else return { min, max, multipleOf };
  return null;
}

function readToken(r: FieldReader, at: string, raw: unknown): PhrasingToken | null {
  const kind = isRecord(raw) && Object.keys(raw).length === 1 ? (Object.hasOwn(raw, "word") ? "word" : Object.hasOwn(raw, "math") ? "math" : null) : null;
  const text = kind && isRecord(raw) ? raw[kind] : undefined;
  if (!kind || typeof text !== "string") r.problem(at, 'a token must be {"word": text} or {"math": text}');
  else if (text === "" || text.trim() !== text || text.includes("  ")) r.problem(at, `the token ${JSON.stringify(text)} must not be empty or have a space at its ends`);
  else if (kind === "word" && text.includes(" ")) r.problem(at, `the word "${text}" has a space: a word token is one word`);
  else if (!isPrintable(text)) r.problem(at, `the token "${text}" has a character that the fonts cannot print`);
  else return { kind, text };
  return null;
}

/** The placeholders of a token in order, and its text outside them. */
const partsOf = (text: string) => ({ names: [...text.matchAll(PLACEHOLDER)].map((m) => m[1]), outside: text.replace(PLACEHOLDER, "") });

/** What is wrong with the placeholders of a phrasing: each slot one time, only known names, and no digit of its own. */
function phrasingProblems(tokens: readonly PhrasingToken[], slots: Readonly<Record<string, SlotRange>>): string[] {
  const problems: string[] = [];
  const seen = new Map<string, number>();
  tokens.forEach(({ text }, i) => {
    const { names, outside } = partsOf(text);
    if (/\d/.test(outside)) problems.push(`the token "${text}" has a digit, and only a slot prints a number`);
    if (/[[\]]/.test(outside)) problems.push(`the token "${text}" has a bracket that is not a placeholder`);
    for (const name of names) {
      if (Object.hasOwn(slots, name)) seen.set(name, (seen.get(name) ?? 0) + 1);
      else if (!isScenarioWord(name) && !isRegionWord(name)) problems.push(`the placeholder [${name}] is not known`);
    }
    // A number and the word after it: "1 boxes" and "4 box" cannot print.
    const next = tokens[i + 1] ? partsOf(tokens[i + 1].text).names[0] : undefined;
    const slot = names.length === 1 && text === `[${names[0]}]` && Object.hasOwn(slots, names[0]) ? slots[names[0]] : null;
    if (slot && next !== undefined && tokens[i + 1].text.startsWith(`[${next}]`)) {
      if (isPlural(next) && slot.min <= 1 && slot.max >= 1 && slot.multipleOf === 1) problems.push(`the slot "${names[0]}" can be 1 and the word after it is plural, [${next}]`);
      if (isSingular(next) && (slot.min !== 1 || slot.max !== 1)) problems.push(`the slot "${names[0]}" can be more than 1 and the word after it is singular, [${next}]`);
    }
  });
  for (const name of Object.keys(slots)) {
    const count = seen.get(name) ?? 0;
    if (count !== 1) problems.push(`the slot "${name}" must be printed one time and it is printed ${count} times`);
  }
  return problems;
}

function readPhrasing(r: FieldReader, place: string, raw: unknown, index: number, slots: Readonly<Record<string, SlotRange>>): Phrasing | null {
  const at = isRecord(raw) && isId(raw.id) ? `${place}, phrasing "${raw.id}"` : `${place}, phrasing ${index + 1}`;
  const fields = r.object(at, raw, ["id", "tokens"]);
  if (!fields) return null;
  const id = r.id(at, fields);
  const list = r.list(at, fields, "tokens").map((token, i) => readToken(r, `${at}, token ${i + 1}`, token));
  const tokens = list.filter((t) => t !== null);
  if (tokens.length !== list.length || id === null) return null;
  const problems = phrasingProblems(tokens, slots);
  for (const problem of problems) r.problem(at, problem);
  return problems.length === 0 && tokens.length > 0 ? { id, tokens } : null;
}

/** Works the formula for every choice of numbers: each step a whole number of 0 or more, and an answer that is not 1. */
function solverProblem(question: Omit<DefinedQuestion, "phrasings">): string | null {
  const count = choiceCount(question.slots);
  if (count > MAX_CHOICES) return `the slots allow ${count} choices of numbers and the most is ${MAX_CHOICES}`;
  let problem: string | null = null;
  eachChoice(question.slots, (values) => {
    const solved = solve(question.solver, values);
    const shown = Object.entries(values).map(([name, value]) => `${name} ${value}`).join(", ");
    if (!solved.ok) problem = `with ${shown}: ${solved.problem}`;
    // The unit beside the answer area is plural, so the answer must never be 1.
    else if (solved.value === 1) problem = `with ${shown} the answer is 1, and the unit beside the answer area is plural`;
    return problem === null;
  });
  return problem;
}

export function readQuestion(r: FieldReader, raw: unknown, index: number): DefinedQuestion | null {
  const place = isRecord(raw) && isId(raw.id) ? `Question "${raw.id}"` : `Question ${index + 1}`;
  const fields = r.object(place, raw, ["id", "scenarioKind", "slots", "unit", "solver", "difficulty", "phrasings"], ["regions"]);
  if (!fields) return null;
  const before = r.problems.length;
  const id = r.id(place, fields);
  if (!isId(fields.scenarioKind)) r.problem(place, "scenarioKind must use only small letters, digits and dashes");
  const regions = Object.hasOwn(fields, "regions") ? fields.regions : null;
  if (regions !== null && (!Array.isArray(regions) || regions.length === 0 || regions.some((g) => typeof g !== "string") || new Set(regions).size !== regions.length)) r.problem(place, "regions must be a list of different region pack ids");
  const slotFields = isRecord(fields.slots) ? fields.slots : null;
  if (!slotFields || Object.keys(slotFields).length === 0) r.problem(place, "slots must be an object with 1 slot or more");
  const slots: Record<string, SlotRange> = {};
  for (const [name, value] of Object.entries(slotFields ?? {})) {
    if (!SLOT_NAME.test(name) || isScenarioWord(name)) r.problem(place, `the slot name "${name}" must start with a small letter, use small letters, digits and dashes, and not be a word of a scenario`);
    const slot = readSlot(r, `${place}, slot "${name}"`, value);
    if (slot) slots[name] = slot;
  }
  const { unit, difficulty } = fields;
  if (typeof unit !== "string" || !/^\[unit(\.[a-z][a-z0-9-]*)?\]$/.test(unit)) r.problem(place, 'unit must be "[unit]" of the scenario or "[unit.<name>]" of the region pack');
  if (typeof difficulty !== "number" || !Number.isSafeInteger(difficulty) || difficulty < 1) r.problem(place, "difficulty must be a whole number, 1 or more");
  const solver = readExpr(fields.solver, Object.keys(slots));
  if (!solver.ok) r.problem(`${place}, solver`, solver.problem);
  const list = r.list(place, fields, "phrasings");
  if (list.length > 0 && list.length < MIN_PHRASINGS) r.problem(place, `a question needs at least ${MIN_PHRASINGS} phrasings, and it has ${list.length}`);
  const phrasings = list.map((p, i) => readPhrasing(r, place, p, i, slots)).filter((p) => p !== null);
  r.unique("phrasing id", phrasings.map((p) => p.id), place);
  if (r.problems.length > before || id === null || !solver.ok || typeof unit !== "string" || typeof difficulty !== "number") return null;
  const question: DefinedQuestion = { id, scenarioKind: fields.scenarioKind as string, regions: regions as string[] | null, slots, unit, solver: solver.expr, difficulty, phrasings };
  const problem = solverProblem(question);
  if (problem) r.problem(`${place}, solver`, problem);
  return problem ? null : question;
}
