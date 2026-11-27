// Fills a defined question: its numbers, the words of a scenario and those of a region pack go into the placeholders of one
// approved phrasing. Every printed word comes from approved text; code adds none. A placeholder that does not resolve, or a
// bracket that is left, stops the fill, so it never prints.
import { mathToken, wordToken, type FlowToken } from "../contract";
import { pick } from "../hash";
import type { DefinedQuestion, RegionPack, Scenario, WordForms } from "./types";

/** A placeholder: a name in brackets, with no bracket inside. */
export const PLACEHOLDER = /\[([^[\]]*)\]/g;

/** The words of a scenario that a phrasing can name: the singular, and the plural with an s. */
const SCENARIO_WORDS: Readonly<Record<string, (s: Scenario) => string>> = {
  place: (s) => s.place,
  container: (s) => s.container.one,
  containers: (s) => s.container.many,
  thing: (s) => s.thing.one,
  things: (s) => s.thing.many,
  verb: (s) => s.verb,
  unit: (s) => s.unit.one,
  units: (s) => s.unit.many,
};
/** The plural words: a slot before one of them must never be 1, and before a singular word it must always be 1. */
export const PLURAL_WORDS = ["containers", "things", "units"];
export const SINGULAR_WORDS = ["container", "thing", "unit"];
const REGION_WORD = /^(unit|units|coin|coins|spell)\.([a-z][a-z0-9-]*)$/;

export const isScenarioWord = (name: string): boolean => Object.hasOwn(SCENARIO_WORDS, name);
export const isRegionWord = (name: string): boolean => REGION_WORD.test(name);
/** Whether a placeholder names a word in its plural form, or in its singular form. */
export const isPlural = (name: string): boolean => PLURAL_WORDS.includes(name) || /^(units|coins)\./.test(name);
export const isSingular = (name: string): boolean => SINGULAR_WORDS.includes(name) || /^(unit|coin)\./.test(name);

const formOf = (forms: WordForms | undefined, many: boolean): string | undefined => (forms === undefined ? undefined : many ? forms.many : forms.one);

/** The text of a word of a region pack, or undefined when the pack has none. */
function regionWord(pack: RegionPack, name: string): string | undefined {
  const [, group, key] = REGION_WORD.exec(name) ?? [];
  if (group === "spell") return Object.hasOwn(pack.spelling, key) ? pack.spelling[key] : undefined;
  if (group === "coin" || group === "coins") return formOf(pack.coins.list.find((c) => c.id === key), group === "coins");
  return formOf(Object.hasOwn(pack.units, key) ? pack.units[key] : undefined, group === "units");
}

export type Filled = { ok: true; tokens: FlowToken[]; unit: string } | { ok: false; problem: string };

/** The text of one placeholder, or why it has none. */
function resolve(name: string, question: DefinedQuestion, params: Readonly<Record<string, number>>, scenario: Scenario, pack: RegionPack): string | { problem: string } {
  if (Object.hasOwn(question.slots, name)) {
    const value = Object.hasOwn(params, name) ? params[name] : undefined;
    return typeof value === "number" && Number.isSafeInteger(value) ? String(value) : { problem: `the slot "${name}" has no number` };
  }
  if (isScenarioWord(name)) return SCENARIO_WORDS[name](scenario);
  if (!isRegionWord(name)) return { problem: `the placeholder [${name}] is not known` };
  return regionWord(pack, name) ?? { problem: `the region pack "${pack.id}" has no [${name}]` };
}

/** The unit of the answer in its plural form: a word of the scenario or of the region pack. */
function answerUnit(question: DefinedQuestion, scenario: Scenario, pack: RegionPack): string | { problem: string } {
  const [, name] = /^\[(unit(?:\.[a-z][a-z0-9-]*)?)\]$/.exec(question.unit) ?? [];
  if (name === undefined) return { problem: `the unit ${JSON.stringify(question.unit)} must be [unit] or [unit.<name>]` };
  const plural = name.replace(/^unit/, "units");
  return name === "unit" ? scenario.unit.many : (regionWord(pack, plural) ?? { problem: `the region pack "${pack.id}" has no [${name}]` });
}

/**
 * The tokens of one phrasing of a question with these numbers, scenario and region pack, and the unit of its answer. A word
 * is split after its hyphens only; a word of a scenario with a space is two words. Math is one piece that never breaks.
 */
export function fill(question: DefinedQuestion, params: Readonly<Record<string, number>>, scenario: Scenario, pack: RegionPack, phrasingIndex: number): Filled {
  const stop = (problem: string): Filled => ({ ok: false, problem });
  if (scenario.kind !== question.scenarioKind) return stop(`the scenario "${scenario.id}" is of the kind "${scenario.kind}" and the question needs "${question.scenarioKind}"`);
  if (question.regions !== null && !question.regions.includes(pack.id)) return stop(`the question "${question.id}" is only for the region ${question.regions.join(", ")}, not ${pack.id}`);
  const phrasing = question.phrasings[phrasingIndex];
  if (!phrasing) return stop(`the question "${question.id}" has no phrasing ${phrasingIndex + 1}`);
  const tokens: FlowToken[] = [];
  for (const { kind, text } of phrasing.tokens) {
    let problem: string | null = null;
    const filled = text.replace(PLACEHOLDER, (_all, name: string) => {
      const value = resolve(name, question, params, scenario, pack);
      if (typeof value === "string") return value;
      problem ??= value.problem;
      return "";
    });
    if (problem !== null) return stop(`phrasing "${phrasing.id}": ${problem}`);
    if (/[[\]]/.test(filled)) return stop(`phrasing "${phrasing.id}": the token "${text}" still has a bracket`);
    if (kind === "math") tokens.push(mathToken(filled));
    else tokens.push(...filled.split(" ").map(wordToken));
  }
  const unit = answerUnit(question, scenario, pack);
  return typeof unit === "string" ? { ok: true, tokens, unit } : stop(unit.problem);
}

/** The phrasing for a seed: one that the child has not seen while there is one, else any. The seed alone decides which. */
export function choosePhrasing(question: Pick<DefinedQuestion, "phrasings">, seed: string, seen: readonly string[] = []): number {
  const all = question.phrasings.map((_, i) => i);
  const unseen = all.filter((i) => !seen.includes(question.phrasings[i].id));
  const pool = unseen.length > 0 ? unseen : all;
  return pool[pick(seed, pool.length)];
}
