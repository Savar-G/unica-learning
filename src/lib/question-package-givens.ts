// Typed givens identify a printed reference. Wording never decides whether a number is a coin denomination.
import { readNumbers, type ReadNumber } from "@/lib/number-words";
import { isObject } from "@/lib/question-package-columns";
import type { AnswerRegion } from "@/lib/question-package";

export type CoinName = "penny" | "nickel" | "dime" | "quarter" | "loonie" | "toonie";
type GivenText = { kind: "text" } | { kind: "region-label"; region: string };
/** The zero-based number index counts numeric readings, not words. It cannot point to an operand or answer. */
export type CoinGivenSource = GivenText & { index: number };
export interface CoinGiven {
  kind: "coin";
  coin: CoinName;
  value: number;
  unit: "¢" | "$";
  source: CoinGivenSource;
}

const COINS: Readonly<Record<CoinName, readonly [number, "¢" | "$"]>> = {
  penny: [1, "¢"], nickel: [5, "¢"], dime: [10, "¢"], quarter: [25, "¢"], loonie: [1, "$"], toonie: [2, "$"],
};

/** Code and approved question types call this factory. AI output is never a source of givens. */
export function coinGiven(coin: CoinName, source: CoinGivenSource): CoinGiven {
  if (!Object.hasOwn(COINS, coin)) throw new Error("Unknown given coin.");
  const [value, unit] = COINS[coin];
  return { kind: "coin", coin, value, unit, source: { ...source } };
}

/** Validate the typed declaration and its exact printed occurrence. Missing or ambiguous references fail closed. */
export function givensProblem(givens: unknown, text: string, regions: readonly AnswerRegion[]): string | null {
  if (givens === undefined) return null;
  if (!Array.isArray(givens) || givens.length > 40) return "the item's givens must be a list of at most 40 coin references";
  const seen = new Set<string>();
  for (const given of givens) {
    if (!isObject(given) || given.kind !== "coin" || typeof given.coin !== "string" || !Object.hasOwn(COINS, given.coin))
      return "a given must name a known coin";
    const [value, unit] = COINS[given.coin as CoinName];
    if (given.value !== value || given.unit !== unit) return "a coin given must use the coin's actual value and unit";
    const source = given.source;
    if (!isObject(source) || !Number.isSafeInteger(source.index) || (source.index as number) < 0)
      return "a coin given needs a zero-based numeric occurrence";
    let words: string;
    let key: string;
    if (source.kind === "text") {
      words = text;
      key = `text:${source.index}`;
    } else if (source.kind === "region-label" && typeof source.region === "string") {
      const region = regions.find(r => r.id === source.region);
      if (!region?.label) return "a coin given names a missing region label";
      words = region.label;
      key = `region:${source.region}:${source.index}`;
    } else return "a coin given may refer only to question text or a region label, never an operand or answer";
    if (seen.has(key)) return "two coin givens name the same numeric occurrence";
    seen.add(key);
    const number = readNumbers(words)[source.index as number];
    if (!number || number.value !== value || number.currency !== unit)
      return "the printed coin given does not match its declared value and unit";
  }
  return null;
}

/** Mark only declared printed occurrences. All other numeric readings, including matching amounts, stay bounded. */
export function givenNumbers(text: string, givens: readonly CoinGiven[] | undefined, where: GivenText): ReadNumber[] {
  const numbers = readNumbers(text);
  for (const given of givens ?? []) {
    const source = given.source;
    if (source.kind !== where.kind || source.kind === "region-label" && (where.kind !== "region-label" || source.region !== where.region)) continue;
    const number = numbers[source.index];
    if (!number || number.value !== given.value || number.currency !== given.unit) throw new Error("Unreadable coin given.");
    numbers[source.index] = { ...number, given: "coin" };
  }
  return numbers;
}
