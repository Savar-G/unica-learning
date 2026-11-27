// What the bank check draws of a row of word problems: every phrasing of every question of the row, with every scenario and
// region pack that it can meet, with its widest numbers. And for the measure of the text alone, the same text with every
// digit 0 to 9 in each place of its numbers, as the widest digits can be other ones than those of the largest number.
import { canonicalJson } from "../hash";
import type { SnapshotRow } from "../bank/snapshot";
import type { FlowToken } from "../contract";
import { storyItem, type BoundQuestion, type StoryLimits, type StoryQuestion } from "../shapes/story";
import type { Item } from "../shapes/shape";
import { rangesOf, widestValues } from "../themes/ranges";
import type { StoryBank } from "../themes/types";
import { DIGIT_KERNING } from "./row-texts";

/** One combination of a question with a phrasing, a scenario and a region pack, as a problem names it. */
export interface StoryCombo { label: string; item: Item<StoryQuestion> }

const DIGITS = [..."0123456789"];

/**
 * Each combination that prints something of its own. Two that print the same text, unit and answer (a question with no
 * word of a region, in two regions) are drawn one time, under the name of the first.
 */
export function storyCombos({ limits }: SnapshotRow, bank: StoryBank): StoryCombo[] {
  const combos = new Map<string, StoryCombo>();
  for (const id of (limits as StoryLimits).ids) {
    const question = bank.questions.get(id);
    if (!question) continue;
    const packs = [...bank.packs.values()].filter((p) => question.regions === null || question.regions.includes(p.id));
    for (const scenario of bank.scenarios.filter((s) => s.kind === question.scenarioKind)) {
      const found = rangesOf(question, scenario);
      if (!("ranges" in found)) continue;
      for (const pack of packs) {
        const bound: BoundQuestion = { question, scenario, pack, ranges: found.ranges };
        question.phrasings.forEach((phrasing, i) => {
          const item = storyItem(bound, i, widestValues(found.ranges));
          const key = canonicalJson([item.question.tokens, item.question.unit, item.answer]);
          if (!combos.has(key)) combos.set(key, { label: `question "${id}", phrasing "${phrasing.id}", scenario "${scenario.id}", region "${pack.id}"`, item });
        });
      }
    }
  }
  return [...combos.values()];
}

/**
 * The text of a story with each digit in every place of its numbers, and how much narrower its place must be for what
 * the digits of its numbers can add (`DIGIT_KERNING`). Only slots print digits, so each number is one of them.
 */
export function eachDigit(tokens: readonly FlowToken[], size: number): { tokens: FlowToken[]; room: number }[] {
  const numbers = tokens.flatMap((t) => t.pieces.join("").match(/\d+/g) ?? []);
  const room = numbers.reduce((sum, n) => sum + DIGIT_KERNING * size * (n.length - 1), 0);
  return DIGITS.map((d) => ({ tokens: tokens.map((t) => ({ ...t, pieces: t.pieces.map((p) => p.replace(/\d/g, d)) })), room }));
}
