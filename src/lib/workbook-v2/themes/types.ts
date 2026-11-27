// The content of word problems in a snapshot: defined questions, the scenarios that fill them, and the region packs. A
// person approves all of it at bank time; code only fills it in. Nothing here is AI text at book time.
import type { Expr } from "./solver";

/** A word in its two forms: one box, two boxes. */
export interface WordForms { one: string; many: string }

/** A range of whole numbers. */
export interface NumberRange { min: number; max: number }

/** The numbers that a slot can hold: from min to max, each a multiple of `multipleOf` (2 for a number that is halved). */
export interface SlotRange extends NumberRange { multipleOf: number }

/**
 * One approved set of words that fit together (B0): a place, a container, a thing, a verb and a unit, with the numbers
 * that make sense there for each slot. `interest` is "default" for the one theme of the launch.
 */
export interface Scenario {
  id: string;
  interest: string;
  kind: string;
  place: string;
  container: WordForms;
  thing: WordForms;
  verb: string;
  unit: WordForms;
  quantityLimits: Readonly<Record<string, NumberRange>>;
}

export interface Coin { id: string; one: string; many: string; cents: number }

/** What differs between countries: units, coins (and how cash is rounded) and spelling. */
export interface RegionPack {
  id: string;
  units: Readonly<Record<string, WordForms>>;
  coins: { rounding: string; list: readonly Coin[] };
  spelling: Readonly<Record<string, string>>;
}

/** A token as it is stored: a word or a piece of math, with placeholders in brackets. */
export interface PhrasingToken { kind: "word" | "math"; text: string }
export interface Phrasing { id: string; tokens: readonly PhrasingToken[] }

/**
 * A defined word problem. Its phrasings say the same question in other words, each with every slot one time. `regions`
 * is null for a question of every region; a question with regions is made only for those packs.
 */
export interface DefinedQuestion {
  id: string;
  scenarioKind: string;
  regions: readonly string[] | null;
  slots: Readonly<Record<string, SlotRange>>;
  /** The unit of the answer: "[unit]" of the scenario or "[unit.<name>]" of the region pack. It prints in its plural form. */
  unit: string;
  solver: Expr;
  difficulty: number;
  phrasings: readonly Phrasing[];
}

/** The word problems of a snapshot. A snapshot with no story row may have none. */
export interface StoryBank {
  defaultRegion: string;
  questions: ReadonlyMap<string, DefinedQuestion>;
  scenarios: readonly Scenario[];
  packs: ReadonlyMap<string, RegionPack>;
}

/** The theme and the region of one book. */
export interface StoryChoice { interest: string; region: string }

/** The interest of the launch: every word problem prints with it. */
export const DEFAULT_INTEREST = "default";
