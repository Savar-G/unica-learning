// What an AI provider said on a failure (D-283): OpenRouter's error message and `metadata.raw`, or what `claude -p`
// printed. It can repeat request text, which can be a child's words, so it is never in an error's message and never on
// the error object: a log line, a stored call note or an admin page that shows the message cannot show it. It is kept
// here, beside the error, and only code that names `providerWords` reads it (the admin route check, whose requests hold
// no child data). Judge a failure on the whole text with `classify` before it is cut to the stored limit.

/** The most kept per error. */
export const PROVIDER_WORDS_LIMIT = 2_000;

const wordsOf = new WeakMap<Error, string>();
const marksOf = new WeakMap<Error, ReadonlySet<string>>();

/** What the provider said on this error, cut to the limit; null when it said nothing. */
export const providerWords = (e: unknown): string | null => (e instanceof Error ? wordsOf.get(e) ?? null : null);

/** Whether `classify` found `mark` in the provider's whole text, before it was cut. */
export const providerMark = (e: unknown, mark: string): boolean => (e instanceof Error ? marksOf.get(e)?.has(mark) ?? false : false);

/**
 * Keeps `text` beside `error`. Each pattern of `classify` is tested against the whole text first, so a sign past the
 * stored limit still counts. Returns the error, for `throw keepProviderWords(new Error("..."), text)`.
 */
export function keepProviderWords<E extends Error>(error: E, text: string, classify: Readonly<Record<string, RegExp>> = {}): E {
  if (!text) return error;
  const marks = new Set(Object.entries(classify).filter(([, pattern]) => pattern.test(text)).map(([mark]) => mark));
  if (marks.size) marksOf.set(error, marks);
  wordsOf.set(error, text.slice(0, PROVIDER_WORDS_LIMIT));
  return error;
}

/** Gives `to` what `from` kept: for an error made again with the same message. */
export function carryProviderWords<E extends Error>(from: unknown, to: E): E {
  if (!(from instanceof Error)) return to;
  const words = wordsOf.get(from);
  if (words) wordsOf.set(to, words);
  const marks = marksOf.get(from);
  if (marks) marksOf.set(to, marks);
  return to;
}
