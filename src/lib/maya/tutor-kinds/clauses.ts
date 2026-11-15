// The clauses of one sentence, for the kinds' question exemption (pre-launch review B, F11): a question claims nothing,
// but "The answer is no, shall we circle it?" is a statement and then a question, and its statement is checked.

/** A clause ends at , ; : . ! ? or a dash; a comma inside a number ("1,340") does not end one. */
const ends = (s: string, i: number) => /[;:.!?\u2013\u2014]/.test(s[i]) || (s[i] === "," && !(/\d/.test(s[i - 1] ?? "") && /\d/.test(s[i + 1] ?? "")));

/** Words that open a question: "what", "is", "shall", ... (after "so", "and", "now" or "ok"). */
const OPENS = /^(?:(?:so|and|but|now|ok|okay|then)\s+)?(?:what|which|who|whose|how|why|where|when|is|are|was|were|do|does|did|can|could|shall|should|will|would|may|might|have|has)\b/i;

/** The clause around position `at` of `s`: its start, its end (the end mark's position) and whether it asks. */
export function clauseAt(s: string, at: number): { start: number; end: number; asks: boolean } {
  let start = at;
  while (start > 0 && !ends(s, start - 1)) start--;
  let end = at;
  while (end < s.length && !ends(s, end)) end++;
  return { start, end, asks: s[end] === "?" || OPENS.test(s.slice(start, end).trim()) };
}

/** `s` with every clause that asks blanked by spaces (positions kept): what is left is what it states. */
export function statements(s: string): string {
  const out = [...s];
  let i = 0;
  while (i < s.length) {
    const c = clauseAt(s, i);
    if (c.asks) for (let j = c.start; j < c.end; j++) out[j] = " ";
    i = c.end + 1;
  }
  return out.join("");
}
