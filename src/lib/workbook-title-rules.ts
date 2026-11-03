// Shared title rules for the offline writer and the printed page (D-201).
export const TITLE_WORDS_MAX = 4;
// A number written in groups ("100 000") is one word.
export const titleWords = (title: string) => title.replace(/(\d) (?=\d{3}\b)/g, "$1").split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));

/** The one-line width is checked by the print engine, with the template's font and size. */
export function titleProblem(title: string): string | null {
  const n = titleWords(title).length;
  if (n === 0) return "the page title is empty";
  if (n > TITLE_WORDS_MAX) return `the page title "${title}" has ${n} words; a title has at most ${TITLE_WORDS_MAX}`;
  if (/\b(?:in\s+all|altogether|totals?|left[\s-]+over)\b/i.test(title)) return `the page title "${title}" has a banned phrase`;
  if (title !== title.trim() || /[\r\n\t]| {2}/.test(title)) return "the page title must use single spaces on one line";
  if (!/^[A-Z0-9]/.test(title)) return "the page title must start with a capital letter or numeral";
  return null;
}
