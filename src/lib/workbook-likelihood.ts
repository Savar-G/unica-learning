/**
 * Likelihood words (Savar's decision, docs/workbook-consistency.md: "Likelihood uses never / sometimes / always").
 * A workbook rates how likely something is only with the allow-listed words. A comparison that names no rating
 * ("Which colour is more likely?", answered with a colour) stays: "more", "less", "most", "least" or "equally"
 * before "likely" make it a comparison. Every other likelihood word (likely, unlikely, certain, uncertain,
 * impossible, possible, probable) is refused, in a template, an AI item, a choice, a panel or a title.
 */

/** The only words a likelihood rating may use, in this order on the page. */
export const LIKELIHOOD_CHOICES = ["never", "sometimes", "always"] as const;

/** A rating word outside the allow-list ("likely" alone, not "more likely"). */
const RATING = /\b(?:unlikely|uncertain|certain(?:ly)?|impossible|possible|possibly|probable|improbable|probably)\b|(?<!\b(?:more|less|most|least|equally) )\blikely\b/i;

/** The likelihood word a text prints outside the allow-list, or null. */
export function likelihoodWord(text: string): string | null {
  return RATING.exec(text)?.[0].toLowerCase() ?? null;
}

/** Whether a set of choices rates likelihood: then every choice must be on the allow-list. */
export function likelihoodChoicesProblem(choices: readonly string[]): string | null {
  const rating = choices.some((c) => /\blikely\b|\bcertain\b|\bimpossible\b|\bpossible\b/i.test(c) || LIKELIHOOD_CHOICES.includes(c.trim().toLowerCase() as never));
  if (!rating) return null;
  const off = choices.find((c) => !LIKELIHOOD_CHOICES.includes(c.trim().toLowerCase() as never));
  return off ? `a likelihood choice must be never, sometimes or always, not "${off}"` : null;
}
