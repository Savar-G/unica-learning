// The numbers that a slot of a question can hold with one scenario: the range of the question, inside the limits of the
// scenario, in steps of its multiple. Counted and picked with no list.
import type { DefinedQuestion, NumberRange, Scenario, SlotRange } from "./types";

/** The range of a slot inside the limits of a scenario, with its ends on multiples, or null when no number is left. */
export function slotRange(slot: SlotRange, limit: NumberRange | undefined): SlotRange | null {
  const { multipleOf } = slot;
  const min = Math.ceil(Math.max(slot.min, limit?.min ?? slot.min) / multipleOf) * multipleOf;
  const max = Math.floor(Math.min(slot.max, limit?.max ?? slot.max) / multipleOf) * multipleOf;
  return min <= max ? { min, max, multipleOf } : null;
}

export const rangeCount = ({ min, max, multipleOf }: SlotRange): number => (max - min) / multipleOf + 1;
export const rangeValue = ({ min, multipleOf }: SlotRange, index: number): number => min + index * multipleOf;

/** The ranges of all slots of a question with a scenario, or the name of the first slot that has no number left. */
export function rangesOf(question: DefinedQuestion, scenario: Scenario): { ranges: Record<string, SlotRange> } | { empty: string } {
  const ranges: Record<string, SlotRange> = {};
  for (const [name, slot] of Object.entries(question.slots)) {
    const range = slotRange(slot, Object.hasOwn(scenario.quantityLimits, name) ? scenario.quantityLimits[name] : undefined);
    if (!range) return { empty: name };
    ranges[name] = range;
  }
  return { ranges };
}

/** Every choice of numbers of some ranges, one after the other, while `visit` says to go on. */
export function eachChoice(ranges: Readonly<Record<string, SlotRange>>, visit: (values: Record<string, number>) => boolean): void {
  const names = Object.keys(ranges).sort();
  const values: Record<string, number> = {};
  const walk = (at: number): boolean => {
    if (at === names.length) return visit({ ...values });
    const range = ranges[names[at]];
    for (let i = 0; i < rangeCount(range); i++) {
      values[names[at]] = rangeValue(range, i);
      if (!walk(at + 1)) return false;
    }
    return true;
  };
  walk(0);
}

/** How many choices of numbers some ranges have. */
export const choiceCount = (ranges: Readonly<Record<string, SlotRange>>): number => Object.values(ranges).reduce((product, range) => product * rangeCount(range), 1);

/** The largest number of each slot: the most digits that a phrasing prints. */
export const widestValues = (ranges: Readonly<Record<string, SlotRange>>): Record<string, number> => Object.fromEntries(Object.entries(ranges).map(([name, { max }]) => [name, max]));
