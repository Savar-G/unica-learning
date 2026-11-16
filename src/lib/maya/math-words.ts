// The math reader's operator and relation words (#1086, final check 13, 2026-11-15): ONE table. The claim reader
// (tutor-math.ts) parses Maya's sentences with it, and the review key (say-check.ts sentenceKey) reads the same words
// from it, so "minus", "take away" and "-" are one operator, and "is", "is equal to", "equals" and "=" one relation.
// Each entry is a regular expression source, in the reader's order of trial (longer phrases first where they share a
// start). No imports: both modules depend on it.

/** An operation the reader computes. */
export type MathOp = "+" | "-" | "*" | "/";

/** Operator phrases and the operation each says. */
export const OPERATOR_PHRASES: readonly { re: string; op: MathOp }[] = [
  { re: "plus", op: "+" }, { re: String.raw`\+`, op: "+" },
  { re: "minus", op: "-" }, { re: "take away", op: "-" }, { re: "-", op: "-" },
  { re: "times", op: "*" }, { re: "multiplied by", op: "*" }, { re: "groups? of", op: "*" }, { re: "×", op: "*" }, { re: String.raw`\*`, op: "*" }, { re: "x", op: "*" },
  { re: "divided by", op: "/" }, { re: "÷", op: "/" }, { re: "/", op: "/" },
];

/** Relation phrases: `negated` says "not", `now` says a change (a trade: "is now", "becomes"). */
export const RELATION_PHRASES: readonly { re: string; negated: boolean; now: boolean }[] = [
  { re: "is not equal to", negated: true, now: false }, { re: "isn't equal to", negated: true, now: false },
  { re: "is not", negated: true, now: false }, { re: "isn't", negated: true, now: false }, { re: "are not", negated: true, now: false }, { re: "aren't", negated: true, now: false },
  { re: "is the same as", negated: false, now: false }, { re: "is equal to", negated: false, now: false }, { re: "equals", negated: false, now: false },
  { re: "is now", negated: false, now: true }, { re: "are now", negated: false, now: true }, { re: "is still", negated: false, now: false },
  { re: "becomes", negated: false, now: true }, { re: "become", negated: false, now: true }, { re: "became", negated: false, now: true },
  { re: "turns into", negated: false, now: true }, { re: "turn into", negated: false, now: true }, { re: "turned into", negated: false, now: true },
  { re: "=", negated: false, now: false }, { re: "is", negated: false, now: false }, { re: "are", negated: false, now: false },
  { re: "makes", negated: false, now: false }, { re: "make", negated: false, now: false }, { re: "gives", negated: false, now: false },
];

/** The reader's operator pattern (a non-capturing group of every operator phrase). */
export const OPERATOR_PATTERN = `(?:${OPERATOR_PHRASES.map((x) => x.re).join("|")})`;
/** The reader's relation pattern (a non-capturing group of every relation phrase). */
export const RELATION_PATTERN = `(?:${RELATION_PHRASES.map((x) => x.re).join("|")})`;

/** The operation an operator phrase says, or null. */
export function operatorOf(said: string): MathOp | null {
  const w = said.toLowerCase().replace(/\s+/g, " ").trim();
  return OPERATOR_PHRASES.find((x) => new RegExp(`^(?:${x.re})$`, "i").test(w))?.op ?? null;
}

/** What a relation phrase says, or null. */
export function relationOf(said: string): { negated: boolean; now: boolean } | null {
  const w = said.toLowerCase().replace(/\s+/g, " ").trim();
  const found = RELATION_PHRASES.find((x) => new RegExp(`^(?:${x.re})$`, "i").test(w));
  return found ? { negated: found.negated, now: found.now } : null;
}
