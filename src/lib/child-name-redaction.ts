// Pure child-name redaction shared by model inputs and parent notes.
/** Letters that do not lose their accent by decomposition, written as plain letters. */
const PLAIN_LETTERS: Record<string, string> = { ß: "ss", ẞ: "ss", æ: "ae", Æ: "ae", œ: "oe", Œ: "oe", ø: "o", Ø: "o", ł: "l", Ł: "l", đ: "d", Đ: "d", ð: "d", Ð: "d", þ: "th", Þ: "th", ı: "i" };

/** A word in lower case without accents: "Zoë", "ZOE" and "Zoe" all give "zoe". */
export function foldWord(s: string): string {
  return s
    .replace(/[ßẞæÆœŒøØłŁđĐðÐþÞı]/g, (c) => PLAIN_LETTERS[c] ?? c)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/**
 * Characters that show nothing: format characters (Unicode \p{Cf}: zero-width space and joiners, the soft hyphen, the
 * word joiner, direction marks) and variation selectors. Written between the letters of a name ("Le\u200Bah"), they
 * must not hide it.
 */
const INVISIBLE = /[\p{Cf}\u{FE00}-\u{FE0F}\u{E0100}-\u{E01EF}]/gu;

/**
 * The text in one plain form: no invisible characters, then Unicode NFC, then NFKC on each run of letters and marks, so
 * full-width "Ｚｏｅ", half-width "ｶﾞｸ", decomposed Hangul and separate accents all have the form of the plain name.
 * Punctuation, digits and spaces keep their form ("：" and "！" stay). The name and the text get the same form before
 * they are compared, and the note stores and sends this form, so no position must be mapped back (R403-2, round 3).
 */
function plainText(s: string): string {
  return s
    .replace(INVISIBLE, "")
    .normalize("NFC")
    .replace(/[\p{L}\p{M}]+/gu, (run) => run.normalize("NFKC").replace(INVISIBLE, ""));
}

/**
 * Scripts written without spaces between words (Chinese, Japanese, Thai and others), and Korean, where a particle is
 * written onto the name ("민수가"). A name in these scripts can sit anywhere inside a run of letters. The class uses the
 * scripts a character is written in (Script_Extensions), so the Japanese long-vowel mark "ー" and the voicing marks stay
 * in the name ("ジョージ" is one name, never "ジョ", review R403-6). Only letters and marks count; punctuation such as "・"
 * or "。" ends a name.
 */
const UNSPACED_SCRIPTS = "\\p{scx=Han}\\p{scx=Hiragana}\\p{scx=Katakana}\\p{scx=Hangul}\\p{scx=Thai}\\p{scx=Lao}\\p{scx=Khmer}\\p{scx=Myanmar}\\p{scx=Tibetan}";
const UNSPACED_LETTER = `(?:(?=[\\p{L}\\p{M}])[${UNSPACED_SCRIPTS}])`;
const IS_UNSPACED = new RegExp(UNSPACED_LETTER, "u");
/** A run of letters of the spaced scripts (Latin and others), with their accents: a word. */
const SPACED_RUN = `(?:(?!${UNSPACED_LETTER})[\\p{L}\\p{M}])+`;
const LETTER_RUN = new RegExp(SPACED_RUN, "gu");
/** A run of letters of one kind: an unspaced run, or a spaced word. */
const NAME_RUN = new RegExp(`${UNSPACED_LETTER}(?:${UNSPACED_LETTER}|\\p{M})*|${SPACED_RUN}`, "gu");
/** Two or more single letters, each with its accents, joined by spaces, dots, hyphens or underscores: a name spelled out. */
const SPELLED = new RegExp(`(?<![\\p{L}\\p{M}])${SPACED_RUN.replace("+", "")}(?:[\\s.\\-_]+(?:(?!${UNSPACED_LETTER})\\p{L}\\p{M}*))+(?![\\p{L}\\p{M}])`, "gu");
/** One character with its accents. */
const UNIT = /\P{M}\p{M}*|\p{M}+/gu;

/**
 * The text, in its plain form (see `plainText`), with every word that is the child's name replaced by `token`. The
 * name gets the same plain form first. For the spaced scripts a word is a run of letters (Unicode \p{L} with its
 * accents), compared without case or accents, so "Zoë", "ZOE" and "zoe" all match "Zoë", and "Élodie" matches "Elodie".
 * A name of several words ("Mary Ann") hides each word of it with two or more letters. A word matches when it is the
 * name, or the name with its last letter stretched two or more times ("Leahhh"); a plural "s" or one extra letter
 * makes ordinary words ("roses", "all") and does not match (R403-8). A possessive ("Zoë's", "Zoë’s") is the name
 * followed by an apostrophe, so it matches too. A name spelled letter by letter ("L e a h", "L-E-A-H") matches (R403-7). The name inside a longer word ("Ann" in "planning"
 * or "Annual") is another word and stays. A name in an unspaced script (see UNSPACED_SCRIPTS) is hidden as a whole
 * wherever it is, also inside a longer run ("我叫小明", "민수가"), without case, and only where it ends on a whole
 * character; a part of it never matches ("ジョギング" stays for "ジョージ"). A Latin name written next to such letters
 * ("我叫Zoe") is a word of its own (review R403-2, rounds 2 and 3). Given several names (the name now and the names
 * before a rename), every word of each is hidden, in one pass.
 */
export function hideName(text: string, childName: string | readonly string[], token: string): string {
  const plain = plainText(text);
  const all = (typeof childName === "string" ? [childName] : childName).flatMap((n) => nameParts(plainText(n)));
  const parts = all.filter((p, i) => all.findIndex((q) => q.folded === p.folded && q.unspaced === p.unspaced) === i);
  const spaced = parts.filter((p) => !p.unspaced).map((p) => p.folded);
  const unspaced = parts.filter((p) => p.unspaced).map((p) => p.folded);
  // A name spelled letter by letter ("L e a h", "L-E-A-H", "L.e.a.h") is the name too (review R403-7).
  const spelled = spaced.length === 0 ? plain : plain.replace(SPELLED, (run) => {
    const letters = foldWord(run.replace(/[^\p{L}\p{M}]/gu, ""));
    return spaced.includes(letters) ? token : run;
  });
  const words = spaced.length === 0 ? plain : spelled.replace(LETTER_RUN, (run) => {
    const word = foldWord(run);
    return spaced.some((p) => word === p || (word.startsWith(p) && isNameTail(word.slice(p.length), p))) ? token : run;
  });
  if (unspaced.length === 0) return words;
  // Longest first, so a longer name part wins over a shorter one at the same place.
  const names = [...unspaced].sort((a, b) => b.length - a.length).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return words.replace(new RegExp(`(?:${names.join("|")})(?!\\p{M})`, "giu"), token);
}

/** The parts of a name in plain form, folded: those with two or more letters, or every part when none has two. */
function nameParts(childName: string): { folded: string; unspaced: boolean }[] {
  const all = (childName.match(NAME_RUN) ?? []).map((run) => {
    const unspaced = IS_UNSPACED.test(run);
    return { folded: unspaced ? run.toLowerCase() : foldWord(run), unspaced, letters: (run.match(UNIT) ?? []).length };
  }).filter((p) => p.folded);
  const long = all.filter((p) => p.letters >= 2);
  const seen = new Set<string>();
  return (long.length ? long : all).filter((p) => !seen.has(p.folded) && seen.add(p.folded)).map(({ folded, unspaced }) => ({ folded, unspaced }));
}

/** "s", or the name's last letter again ("hh" after "leah"). */
function isNameTail(rest: string, part: string): boolean {
  // Only a stretched last letter, two or more times ("Leahhh"). A single extra letter or a plural "s" makes ordinary
  // words ("all" for Al, "roses" for Rose), so neither counts (review R403-8); a possessive ("Rose's") is still the
  // name, because the apostrophe ends the word.
  const last = [...part].at(-1);
  return last !== undefined && [...rest].length >= 2 && [...rest].every((c) => c === last);
}
