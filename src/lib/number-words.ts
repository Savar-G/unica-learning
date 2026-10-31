// The numbers a text shows (#380, R380-4-1), for the workbook range check: digits ("64", "10 000", "1,000", "2.5",
// "3/4", "−3", "$2", "25¢") and English number words ("twelve", "twenty-one", "one hundred and five", "a dozen",
// "a thousand", "the twelfth", "one third", "half"). Pure: no imports, no clock, no randomness.
//
// How words are read:
// - Cardinals: zero to nineteen, the tens, "hundred", "thousand" and "million", with hyphens and "and" ("twenty-one",
//   "one hundred and five", "two thousand three hundred"); "a" before a scale word or "dozen" is one ("a hundred").
//   A bare scale word is that number ("hundred" is 100). "dozen" is 12, times the number before it.
// - Ordinals: "fourth" to "ninth", "tenth" to "nineteenth", the tens ("twentieth"), "hundredth", "thousandth" and
//   "millionth" read as their number (the twelfth bead shows 12). "first", "second" and "third" alone are ordinary
//   words ("first step", "one second", "third try"), as children's text uses them for order, not amount; they count
//   only as the end of a compound ordinal ("twenty-first", "one hundred and third"), and "third" after a number or "a"
//   is a fraction ("one third").
// - Fractions: an ordinal after a number or "a" ("one fifth", "a third", "two hundredth"), a plural ordinal ("thirds",
//   "tenths"), "half", "halves", "quarter" and "quarters" read as a fraction with that denominator. "quarter" and
//   "quarters" are also a coin (the check lets coins through only on money skills).
// - Plural place names ("ones", "tens", "hundreds", "thousands") and words joined to another word ("ten-frame",
//   "two-digit") are not numbers.
// - Fail closed: a run of number words that does not read as one number or as numbers side by side ("nineteen twenty",
//   "twenty twelve", "twenty hundred thousand hundred") is unclear, so the item is written again.

/** A number a text shows: its value and form, or a run of number words that does not read with confidence. */
export type ReadNumber =
  | { value: number; form: "whole" | "fraction" | "decimal"; money?: true; coin?: true }
  | { unclear: string };

/** A Canadian coin's value (1¢, 5¢, 10¢, 25¢, $1, $2). */
export const isCoin = (value: number, unit: string) => (unit === "¢" && [1, 5, 10, 25].includes(value)) || (unit === "$" && [1, 2].includes(value));

const table = (words: string, from = 0, by = 1) => Object.fromEntries(words.split(" ").map((w, i) => [w, from + i * by]));
const UNITS = table("zero one two three four five six seven eight nine");
const TEENS = table("ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen", 10);
const TENS = table("twenty thirty forty fifty sixty seventy eighty ninety", 20, 10);
const SCALES: Record<string, number> = { thousand: 1000, million: 1_000_000 };
const ORDINALS: Record<string, number> = {
  ...table("first second third fourth fifth sixth seventh eighth ninth", 1),
  ...table("tenth eleventh twelfth thirteenth fourteenth fifteenth sixteenth seventeenth eighteenth nineteenth", 10),
  ...table("twentieth thirtieth fortieth fiftieth sixtieth seventieth eightieth ninetieth", 20, 10),
  hundredth: 100, thousandth: 1000, millionth: 1_000_000,
};
/** Plural ordinals and half and quarter: fractions with this denominator. */
const FRACTION_WORDS: Record<string, number> = {
  half: 2, halves: 2, quarter: 4, quarters: 4,
  ...Object.fromEntries(Object.entries(ORDINALS).filter(([w]) => w !== "first" && w !== "second").map(([w, v]) => [`${w}s`, v])),
};
const WEAK_ORDINALS = new Set(["first", "second", "third"]);

type Kind = "unit" | "teen" | "tens" | "hundred" | "scale" | "dozen" | "ordinal" | "a" | "and";
function kindOf(w: string): Kind | null {
  if (w in UNITS) return "unit";
  if (w in TEENS) return "teen";
  if (w in TENS) return "tens";
  if (w === "hundred") return "hundred";
  if (w in SCALES) return "scale";
  if (w === "dozen") return "dozen";
  if (w in ORDINALS) return "ordinal";
  return null;
}
const isNumberWord = (w: string) => kindOf(w) !== null || w in FRACTION_WORDS;
const SMALL = new Set<Kind>(["unit", "teen", "tens", "ordinal"]);

interface Token { text: string; start: number; end: number }

/** The value of one run of number words (see the header), or unclear. */
function readRun(words: string[], text: string): ReadNumber[] {
  const out: ReadNumber[] = [];
  let total = 0;
  let current = 0;
  let last: Kind | "none" | "tens-unit" = "none";
  let scale = Infinity;
  const flush = () => {
    if (last !== "none") out.push({ value: total + current, form: "whole" });
    total = 0; current = 0; last = "none"; scale = Infinity;
  };
  const unclear = (): ReadNumber[] => [{ unclear: text }];
  for (const w of words) {
    const kind = w === "a" ? "a" : w === "and" ? "and" : kindOf(w);
    switch (kind) {
      case "a": current = 1; last = "a"; break;
      case "and": last = "and"; break;
      case "unit": {
        const v = UNITS[w];
        if (last === "none" || last === "hundred" || last === "scale" || last === "and") { current += v; last = "unit"; }
        else if (last === "tens") { current += v; last = "tens-unit"; }
        else if (last === "unit" || last === "teen" || last === "tens-unit" || last === "dozen") { flush(); current = v; last = "unit"; }
        else return unclear();
        break;
      }
      case "teen":
      case "tens": {
        const v = kind === "teen" ? TEENS[w] : TENS[w];
        if (last === "none" || last === "hundred" || last === "scale" || last === "and") { current += v; last = kind; }
        else if (last === "unit") { flush(); current = v; last = kind; }
        else return unclear();
        break;
      }
      case "hundred": {
        if (last === "none") current = 100;
        else if ((last === "a" || last === "unit" || last === "teen" || last === "tens" || last === "tens-unit") && current > 0 && current < 100) current *= 100;
        else return unclear();
        last = "hundred";
        break;
      }
      case "scale": {
        const s = SCALES[w];
        if (s >= scale || last === "and" || last === "dozen") return unclear();
        total += (last === "none" ? 1 : current) * s;
        current = 0; scale = s; last = "scale";
        break;
      }
      case "dozen": {
        if (last === "none") current = 12;
        else if (last === "a" || last === "unit" || last === "teen" || last === "tens" || last === "tens-unit") current *= 12;
        else return unclear();
        last = "dozen";
        break;
      }
      case "ordinal": {
        const v = ORDINALS[w];
        const scaleOrdinal = v >= 100;
        if (last === "none" || last === "hundred" || last === "scale" || last === "and" || (last === "tens" && v < 10)) {
          out.push({ value: total + current + v, form: "whole" });
          total = 0; current = 0; last = "none"; scale = Infinity;
        } else if (last === "a" || last === "unit" || last === "teen" || last === "tens-unit" || (last === "tens" && scaleOrdinal)) {
          // A fraction: the number before is its numerator ("one fifth", "a third", "two hundredth").
          out.push({ value: total + current, form: "fraction" }, { value: v, form: "fraction" });
          total = 0; current = 0; last = "none"; scale = Infinity;
        } else return unclear();
        break;
      }
      default:
        return unclear();
    }
  }
  if (last === "a" || last === "and") return unclear();
  flush();
  return out;
}

const UNIT_AFTER: Record<string, "¢" | "$"> = { cent: "¢", cents: "¢", dollar: "$", dollars: "$" };

/** Every number a text shows (see the header). */
export function readNumbers(text: string): ReadNumber[] {
  // Tokens: digit numbers, words and single signs. A hyphenated word whose parts are all number words ("twenty-one",
  // "one-half") becomes one token per part; any other hyphenated word ("ten-frame") stays one plain word.
  const tokens: Token[] = [];
  const re = /\$?\d{1,3}(?:[ ,  ]\d{3})+(?!\d)¢?|\$?\d+(?:\.\d+)?(?:\/\d+)?¢?|[A-Za-z]+(?:-[A-Za-z]+)*|\S/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const ps = m[0].split("-");
    if (ps.length > 1 && /^[A-Za-z]/.test(m[0]) && ps.every((w) => isNumberWord(w.toLowerCase()))) {
      let at = m.index;
      for (const w of ps) { tokens.push({ text: w, start: at, end: at + w.length }); at += w.length + 1; }
    } else tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  const out: ReadNumber[] = [];
  const joined = (a: Token, b: Token | undefined) => b !== undefined && /^[\s-]+$/.test(text.slice(a.end, b.start));
  const word = (t: Token | undefined) => (t && /^[A-Za-z]/.test(t.text) ? t.text.toLowerCase() : null);
  const numberWord = (t: Token | undefined) => { const w = word(t); return w !== null && isNumberWord(w) ? w : null; };
  const unitAfter = (a: Token, b: Token | undefined) => (joined(a, b) ? UNIT_AFTER[word(b) ?? ""] : undefined);
  const withUnit = (r: ReadNumber, unit: "¢" | "$" | undefined): ReadNumber =>
    "unclear" in r || !unit ? r : { ...r, money: true, ...(isCoin(r.value, unit) ? { coin: true as const } : {}) };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^\$?\d/.test(t.text)) {
      // Digits: a minus sign right before takes away after a number, a bracket or a one-letter unknown ("9 − 3",
      // "3n − 2"), else it is a negative sign ("−3", "is −3"). A scale word after multiplies ("3 thousand").
      const prev = tokens[i - 1];
      const prior = prev ? text.slice(0, prev.start).trimEnd() : "";
      const negative = prev !== undefined && /^[−-]$/.test(prev.text) && prev.end === t.start && !/(\d|\)|(^|[^A-Za-z])[A-Za-z])$/.test(prior);
      const sign = negative ? -1 : 1;
      const body = t.text.replace(/^\$|¢$/g, "");
      if (body.includes("/")) {
        const [a, b] = body.split("/").map(Number);
        out.push({ value: sign * a, form: "fraction" }, { value: b, form: "fraction" });
        continue;
      }
      let value = Number(body.replace(/[ ,  ]/g, ""));
      const scaleWord = joined(t, tokens[i + 1]) ? word(tokens[i + 1]) : null;
      if (scaleWord && (scaleWord in SCALES || scaleWord === "hundred" || scaleWord === "dozen")) {
        value *= scaleWord === "hundred" ? 100 : scaleWord === "dozen" ? 12 : SCALES[scaleWord];
        i++;
      }
      const unit = t.text.startsWith("$") ? "$" : t.text.endsWith("¢") ? "¢" : unitAfter(tokens[i], tokens[i + 1]);
      out.push(withUnit({ value: sign * value, form: Number.isInteger(value) ? "whole" : "decimal" }, unit));
      continue;
    }
    // A run of number words (see the header): "a" only first and before a scale word, "dozen" or an ordinal other
    // than "first" and "second"; "and" only between a scale word and a smaller number; "first", "second" and "third"
    // only ending a compound, and "third" after a number or "a" (a fraction). A fraction word ends the run.
    const run: string[] = [];
    let j = i;
    for (; j < tokens.length; j++) {
      const tk = tokens[j];
      if (j > i && !joined(tokens[j - 1], tk)) break;
      const w = word(tk);
      if (w === "a" || w === "and") {
        const next = joined(tk, tokens[j + 1]) ? numberWord(tokens[j + 1]) : null;
        const nk = next ? kindOf(next) : null;
        const ok = w === "a"
          ? run.length === 0 && (nk === "hundred" || nk === "scale" || nk === "dozen" || (nk === "ordinal" && next !== "first" && next !== "second"))
          : run.length > 0 && ["hundred", "thousand", "million"].includes(run[run.length - 1]) && nk !== null && SMALL.has(nk);
        if (!ok) break;
        run.push(w);
        continue;
      }
      const nw = numberWord(tk);
      if (nw === null || kindOf(nw) === null) break;
      if (WEAK_ORDINALS.has(nw)) {
        const last = run[run.length - 1];
        const before = last === undefined ? null : last === "a" || last === "and" ? last : kindOf(last);
        const compound = before === "tens" || before === "hundred" || before === "scale" || before === "and";
        const fraction = nw === "third" && (before === "unit" || before === "teen" || before === "a");
        if (!compound && !fraction) break;
      }
      run.push(nw);
    }
    if (run.length > 0) {
      const read = readRun(run, text.slice(t.start, tokens[j - 1].end));
      const unit = unitAfter(tokens[j - 1], tokens[j]);
      out.push(...read.map((r, k) => (k === read.length - 1 ? withUnit(r, unit) : r)));
      i = j - 1;
      continue;
    }
    // A fraction word on its own ("half", "thirds", "quarters"; a quarter is also a coin).
    const fw = word(t);
    if (fw !== null && fw in FRACTION_WORDS) out.push({ value: FRACTION_WORDS[fw], form: "fraction", ...(fw.startsWith("quarter") ? { coin: true as const } : {}) });
  }
  return out;
}
