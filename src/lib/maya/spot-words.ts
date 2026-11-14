// The words a child answers "Is it right?" with on a spot-the-error question (spot-error.ts), as claim.ts's reader reads
// them. The page asks "Is it right?" and the child ticks Yes or No, so a child says "right" and "wrong" as often as "yes"
// and "no". This rewrites only those judgement words, from an allow-list, into the claim words yes and no; claim.ts then
// reads the turn with its own allow-list (committed forms, bare words only after Maya's own question, hedges and questions
// unclear). Pure string work, no imports, so claim.ts can use it without a cycle.

const FILLER = "(?:(?:um+|uh+|oh|okay|ok|so|well),?\\s+)*";

/**
 * A spot-the-error turn in claim words: "It's not right." is "it's no", "so it's right" is "so it's yes", "The answer
 * given is wrong." is "it is no". "the right answer is 4980" names the fix, not a judgement, and keeps no claim word.
 * "No, it's wrong, ..." says one word twice and reads as "it's no, ...".
 */
export function spotWordsAsClaim(text: string): string {
  let t = text.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
  // The fix named with "right" or "correct" ("the right answer is 4980", "the correct number"): no judgement in it.
  t = t.replace(/\b(?:the |a )?(?:right|correct|real) (?:answer|number|one)\b/g, "the fix");
  t = t.replace(/\bthe answer (?:given|on the page|on my page) is\b/g, "it is");
  t = t.replace(/\b(?:is not|isn't|not)\s+(?:right|correct)\b/g, "wrong");
  t = t.replace(/\b(?:right|correct)\b/g, "yes").replace(/\b(?:wrong|incorrect)\b/g, "no");
  // A number with its conclusion: "it's 4980, so it's no" and "the answer is 4980, so it's no" read as "4980, so it's no"
  // (the reader's ", so it's no" form; its committed "it's ..." form would want the word first).
  t = t.replace(new RegExp(`^${FILLER}(?:it's|it is|that's|that is|the answer is|the fix is|i got)\\s+(\\d[\\d,]*(?:\\.\\d+)?)(,?\\s+so\\s+)`), "$1$2");
  // One word said twice: "no, it's no, it should be 4980" reads as "it's no, it should be 4980".
  t = t.replace(new RegExp(`^${FILLER}(yes|no)[,.!]?\\s+((?:it's|it is|that's|that is)\\s+\\1)\\b`), "$2");
  return t;
}
