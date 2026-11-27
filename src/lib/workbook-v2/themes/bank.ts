// Reads the word problems of a snapshot: the region packs, the scenarios and the defined questions, with every check that
// the content can have before a book: each reference, each range, each phrasing with every scenario and region pack it can
// meet, and the formula with every choice of numbers. Each problem names its place in plain words.
import { isPrintable } from "../contract";
import { FieldReader, isId, type Fields } from "../bank/fields";
import { isRecord } from "../shapes/shape";
import { fill } from "./fill";
import { readQuestion } from "./questions";
import { rangesOf, slotRange } from "./ranges";
import { DEFAULT_INTEREST, type Coin, type DefinedQuestion, type NumberRange, type RegionPack, type Scenario, type StoryBank, type WordForms } from "./types";

/** The fields of a snapshot that hold word problems. A snapshot with no story row may leave all of them out. */
export const STORY_FIELDS = ["defaultRegion", "regionPacks", "scenarios", "questions"] as const;
const ROUNDINGS = ["none", "nearest-5-cents"];
const MAX_WORDS = 40;
const MAX_CENTS = 10_000;
const MAX_SLOT_NUMBER = 9999;
/** Keys of region-pack units, coins and spellings, matching the placeholder grammar (`REGION_WORD`). */
const PACK_KEY = /^[a-z][a-z0-9-]*$/;

/** A text that a story prints: printable, one space between words, no digit (only slots print numbers) and no bracket. */
function storyTextProblem(value: unknown): string | null {
  if (typeof value !== "string" || value === "" || value.trim() !== value || value.includes("  ")) return "must be text with one space between words and none at its ends";
  if (!isPrintable(value)) return "has a character that the fonts cannot print";
  if (/\d/.test(value)) return "has a digit, and only a slot prints a number";
  if (/[½¼¾]/.test(value)) return "has a fraction, and only a math token of a phrasing prints a fraction";
  if (/[[\]]/.test(value)) return "has a bracket";
  return value.length > MAX_WORDS ? `has ${value.length} characters and the limit is ${MAX_WORDS}` : null;
}

function storyText(r: FieldReader, place: string, fields: Fields, name: string): string | null {
  const problem = storyTextProblem(fields[name]);
  if (problem) r.problem(place, `${name} ${problem}`);
  return problem ? null : (fields[name] as string);
}

function wordForms(r: FieldReader, place: string, raw: unknown): WordForms | null {
  const fields = r.object(place, raw, ["one", "many"]);
  if (!fields) return null;
  const [one, many] = [storyText(r, place, fields, "one"), storyText(r, place, fields, "many")];
  return one !== null && many !== null ? { one, many } : null;
}

/** An object of named entries, each read by `read`. The names start with a small letter and use small letters, digits and dashes. */
function named<T>(r: FieldReader, place: string, raw: unknown, read: (at: string, value: unknown) => T | null): Record<string, T> | null {
  if (!isRecord(raw)) {
    r.problem(place, "this must be an object");
    return null;
  }
  const out: Record<string, T> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!PACK_KEY.test(name)) r.problem(place, `the name "${name}" must start with a small letter and use only small letters, digits and dashes`);
    const one = read(`${place}, "${name}"`, value);
    if (one !== null) out[name] = one;
  }
  return Object.keys(out).length === Object.keys(raw).length ? out : null;
}

function readCoin(r: FieldReader, place: string, raw: unknown, index: number): Coin | null {
  const at = `${place}, coin ${index + 1}`;
  const fields = r.object(at, raw, ["id", "one", "many", "cents"]);
  if (!fields) return null;
  const id = typeof fields.id === "string" && PACK_KEY.test(fields.id) ? fields.id : null;
  if (id === null) r.problem(at, "id must start with a small letter and use only small letters, digits and dashes");
  const [one, many] = [storyText(r, at, fields, "one"), storyText(r, at, fields, "many")];
  const { cents } = fields;
  const goodCents = typeof cents === "number" && Number.isSafeInteger(cents) && cents >= 1 && cents <= MAX_CENTS;
  if (!goodCents) r.problem(at, `cents must be a whole number from 1 to ${MAX_CENTS}`);
  return id !== null && one !== null && many !== null && goodCents ? { id, one, many, cents } : null;
}

function readPack(r: FieldReader, raw: unknown, index: number): RegionPack | null {
  const place = isRecord(raw) && typeof raw.id === "string" ? `Region pack "${raw.id}"` : `Region pack ${index + 1}`;
  const fields = r.object(place, raw, ["id", "units", "coins", "spelling"]);
  if (!fields) return null;
  const id = typeof fields.id === "string" && /^[A-Z]{2}$/.test(fields.id) ? fields.id : null;
  if (id === null) r.problem(place, "id must be two capital letters, such as CA");
  const units = named(r, `${place}, units`, fields.units, (at, value) => wordForms(r, at, value));
  const spelling = named(r, `${place}, spelling`, fields.spelling, (at, value) => {
    const problem = storyTextProblem(value);
    if (problem) r.problem(at, problem);
    return problem ? null : (value as string);
  });
  const coinFields = r.object(`${place}, coins`, fields.coins, ["rounding", "list"]);
  const rounding = coinFields?.rounding;
  if (coinFields && (typeof rounding !== "string" || !ROUNDINGS.includes(rounding))) r.problem(`${place}, coins`, `rounding must be ${ROUNDINGS.map((w) => `"${w}"`).join(" or ")}`);
  const list = coinFields ? r.list(`${place}, coins`, coinFields, "list").map((coin, i) => readCoin(r, `${place}, coins`, coin, i)) : [];
  const coins = list.filter((c) => c !== null);
  r.unique("coin id", coins.map((c) => c.id), place);
  const good = id !== null && units && spelling && typeof rounding === "string" && ROUNDINGS.includes(rounding) && coins.length === list.length && list.length > 0;
  return good ? { id, units, spelling, coins: { rounding, list: coins } } : null;
}

function readLimit(r: FieldReader, at: string, raw: unknown): NumberRange | null {
  const fields = r.object(at, raw, ["min", "max"]);
  if (!fields) return null;
  const { min, max } = fields;
  const isNumber = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= MAX_SLOT_NUMBER;
  if (!isNumber(min) || !isNumber(max) || min > max) r.problem(at, `min and max must be whole numbers from 0 to ${MAX_SLOT_NUMBER}, with min not more than max`);
  return isNumber(min) && isNumber(max) && min <= max ? { min, max } : null;
}

function readScenario(r: FieldReader, raw: unknown, index: number): Scenario | null {
  const place = isRecord(raw) && isId(raw.id) ? `Scenario "${raw.id}"` : `Scenario ${index + 1}`;
  const fields = r.object(place, raw, ["id", "interest", "kind", "place", "container", "thing", "verb", "unit", "quantityLimits"]);
  if (!fields) return null;
  const id = r.id(place, fields);
  const [interest, kind] = (["interest", "kind"] as const).map((name) => {
    if (isId(fields[name])) return fields[name] as string;
    r.problem(place, `${name} must use only small letters, digits and dashes`);
    return null;
  });
  const [where, verb] = [storyText(r, place, fields, "place"), storyText(r, place, fields, "verb")];
  const [container, thing, unit] = (["container", "thing", "unit"] as const).map((name) => wordForms(r, `${place}, ${name}`, fields[name]));
  const quantityLimits = named(r, `${place}, quantityLimits`, fields.quantityLimits, (at, value) => readLimit(r, at, value));
  if (id === null || interest === null || kind === null || where === null || verb === null || !container || !thing || !unit || !quantityLimits) return null;
  return { id, interest, kind, place: where, container, thing, verb, unit, quantityLimits };
}

/** The checks that join the parts: each question has its scenarios and packs, and each phrasing fills with all of them. */
function crossCheck(r: FieldReader, bank: StoryBank): void {
  const { scenarios, packs, questions } = bank;
  r.unique("pair of interest and kind of a scenario", scenarios.map((s) => `${s.interest}, ${s.kind}`));
  const used = new Map<string, Set<string>>();
  for (const question of questions.values()) {
    const place = `Question "${question.id}"`;
    for (const region of question.regions ?? []) if (!packs.has(region)) r.problem(place, `there is no region pack "${region}"`);
    const compatible = scenarios.filter((s) => s.kind === question.scenarioKind);
    if (!compatible.some((s) => s.interest === DEFAULT_INTEREST)) r.problem(place, `no scenario of the kind "${question.scenarioKind}" has the interest "${DEFAULT_INTEREST}"`);
    const names = used.get(question.scenarioKind) ?? new Set<string>();
    used.set(question.scenarioKind, names);
    for (const name of Object.keys(question.slots)) names.add(name);
    const regions = [...packs.values()].filter((p) => question.regions === null || question.regions.includes(p.id));
    for (const scenario of compatible) {
      for (const name of Object.keys(question.slots)) {
        if (!Object.hasOwn(scenario.quantityLimits, name)) r.problem(place, `the scenario "${scenario.id}" sets no limit for the slot "${name}"`);
        else if (!slotRange(question.slots[name], scenario.quantityLimits[name])) r.problem(place, `the slot "${name}" and the limits of the scenario "${scenario.id}" have no number in common`);
      }
      const found = rangesOf(question, scenario);
      if ("empty" in found) continue;
      const values = Object.fromEntries(Object.entries(found.ranges).map(([name, { max }]) => [name, max]));
      for (const pack of regions) {
        question.phrasings.forEach((phrasing, i) => {
          const filled = fill(question, values, scenario, pack, i);
          if (!filled.ok) r.problem(`${place}, scenario "${scenario.id}", region "${pack.id}"`, filled.problem);
          else if (!filled.tokens.every((t) => t.pieces.every(isPrintable))) r.problem(`${place}, phrasing "${phrasing.id}"`, "a token has a character that the fonts cannot print");
        });
      }
    }
  }
  for (const scenario of scenarios) {
    const names = used.get(scenario.kind) ?? new Set();
    for (const name of Object.keys(scenario.quantityLimits)) if (!names.has(name)) r.problem(`Scenario "${scenario.id}"`, `no question of the kind "${scenario.kind}" has the slot "${name}"`);
  }
}

/**
 * The word problems of a snapshot, null when it has none, or undefined when they have a problem. They come all four
 * together: the region packs, the default region, the scenarios and the questions.
 */
export function readStoryBank(r: FieldReader, fields: Fields): StoryBank | null | undefined {
  const present = STORY_FIELDS.filter((name) => Object.hasOwn(fields, name));
  if (present.length === 0) return null;
  for (const name of STORY_FIELDS) if (!present.includes(name)) r.problem("The snapshot", `${name} is missing: word problems need ${STORY_FIELDS.join(", ")}`);
  if (present.length < STORY_FIELDS.length) return undefined;
  const before = r.problems.length;
  const packList = r.list("The snapshot", fields, "regionPacks").map((p, i) => readPack(r, p, i)).filter((p) => p !== null);
  const scenarios = r.list("The snapshot", fields, "scenarios").map((s, i) => readScenario(r, s, i)).filter((s) => s !== null);
  const questionList = r.list("The snapshot", fields, "questions").map((q, i) => readQuestion(r, q, i)).filter((q): q is DefinedQuestion => q !== null);
  r.unique("region pack id", packList.map((p) => p.id));
  r.unique("scenario id", scenarios.map((s) => s.id));
  r.unique("question id", questionList.map((q) => q.id));
  const packs = new Map(packList.map((p) => [p.id, p]));
  const { defaultRegion } = fields;
  if (typeof defaultRegion !== "string" || !packs.has(defaultRegion)) r.problem("The snapshot", `defaultRegion must be the id of a region pack, and it is ${JSON.stringify(defaultRegion)}`);
  if (r.problems.length > before || typeof defaultRegion !== "string") return undefined;
  const bank: StoryBank = { defaultRegion, packs, scenarios, questions: new Map(questionList.map((q) => [q.id, q])) };
  crossCheck(r, bank);
  return r.problems.length > before ? undefined : bank;
}
