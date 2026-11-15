// The parent-facing name of a BC standard (#990): the one name Home's Mastered, Learning and Needs help lists and the Home's
// plain sentences all use, so a list and a sentence about the same skill say the same words. It is the curriculum's own text
// with two things taken out: a parenthetical aside ("addition and subtraction to 20 (understanding of operation and
// process)" reads "addition and subtraction to 20") and the "financial literacy - " prefix of a money skill. Pure.

/**
 * A name longer than this many characters is too long to sit inside a sentence: the sentence then says a count ("1 new
 * skill") or leaves the skill out, and the lists still show the whole name.
 */
export const SKILL_NAME_FIT = 45;

/** The curriculum text without its asides and its "financial literacy - " prefix, in its own lower case. */
export function plainSkillName(text: string): string {
  return text
    .replace(/\s*\([^()]*\)/g, "")
    .replace(/^\s*financial literacy\s+[-–—]\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,;.])/g, "$1")
    .trim();
}

/** The name starting with a capital letter, as a list row shows it. */
export const capitalName = (name: string): string => `${name.slice(0, 1).toUpperCase()}${name.slice(1)}`;

/** True when the name is short enough to be said inside a sentence. */
export const fitsInSentence = (name: string): boolean => name.length > 0 && name.length <= SKILL_NAME_FIT;
