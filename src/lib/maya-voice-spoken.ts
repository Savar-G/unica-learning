// Maya's text as the voice provider must read it (docs/maya-voice.md "Math symbols are spoken as words"). A voice
// provider can drop a math sign: Cartesia read "52 − 28" as "52 28". Only the text sent to the provider changes; the
// board, the saved transcript and the chat keep Maya's own text.
//
// The text is changed word by word: each whitespace-separated word of the text (as `speechWords` in board-speech.ts
// splits it) has one spoken replacement, read with its two neighbours. So `spokenWords(text)[n]` is what the provider
// says for word n, and a board cue at word n can be found again in the provider's word times. Digits stay digits where
// a voice reads them well; only signs and forms that need words become words.
//
// Rules worth knowing:
// - A sign between two numbers ("52 − 28", "52−28", "3 x 4", "12 / 4") becomes its word. A dash between words
//   ("wait - no", "twenty-seven") stays. A number range written with a dash ("5-10") is read as "5 minus 10".
// - "3/4" with no spaces is a fraction ("three quarters"); "12 / 4" with spaces is a division.
// - "h:mm" with two minute digits is a time ("3:30" is "three thirty"); "2:3" (one digit after the colon) is a ratio
//   ("2 to 3"). So "2:30" is always a time, also when it was meant as a ratio.
// - A date ("2026-11-12", "11/12/2026") and a phone-like "604-555-1234" are left alone.
// Pure TypeScript: no imports, no clock. It never throws and it is idempotent: spokenMath(spokenMath(t)) equals
// spokenMath(t).

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** A whole number below 100 in words ("forty five"); larger numbers stay as digits, which a voice reads well. */
function words(digits: string): string {
  const n = Number(digits.replace(/,/g, ""));
  if (!Number.isInteger(n) || n < 0 || n >= 100 || !/^\d[\d,]*$/.test(digits)) return digits;
  if (n < 20) return ONES[n];
  return n % 10 ? `${TENS[Math.floor(n / 10)]} ${ONES[n % 10]}` : TENS[Math.floor(n / 10)];
}

const DENOMINATORS = ["", "", "half", "third", "quarter", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];

/** "3/4" is "three quarters", "1/2" "one half"; a denominator above 12 (or below 2) is "7 over 20". */
function fraction(numerator: string, denominator: string): string {
  const d = Number(denominator);
  if (!/^\d+$/.test(numerator) || !/^\d+$/.test(denominator) || d < 2 || d >= DENOMINATORS.length) return `${numerator} over ${denominator}`;
  const one = Number(numerator) === 1;
  const name = DENOMINATORS[d];
  return `${words(numerator)} ${one ? name : name === "half" ? "halves" : `${name}s`}`;
}

const VULGAR: Record<string, [string, string]> = {
  "½": ["1", "2"], "⅓": ["1", "3"], "⅔": ["2", "3"], "¼": ["1", "4"], "¾": ["3", "4"], "⅕": ["1", "5"], "⅖": ["2", "5"],
  "⅗": ["3", "5"], "⅘": ["4", "5"], "⅙": ["1", "6"], "⅚": ["5", "6"], "⅐": ["1", "7"], "⅛": ["1", "8"], "⅜": ["3", "8"],
  "⅝": ["5", "8"], "⅞": ["7", "8"], "⅑": ["1", "9"], "⅒": ["1", "10"],
};
const VULGAR_CLASS = Object.keys(VULGAR).join("");

const UNITS: Record<string, [string, string]> = {
  mm: ["millimetre", "millimetres"], cm: ["centimetre", "centimetres"], dm: ["decimetre", "decimetres"], m: ["metre", "metres"],
  km: ["kilometre", "kilometres"], mg: ["milligram", "milligrams"], g: ["gram", "grams"], kg: ["kilogram", "kilograms"],
  mL: ["millilitre", "millilitres"], ml: ["millilitre", "millilitres"], L: ["litre", "litres"],
};
const UNIT_PATTERN = "mm|cm|dm|km|mg|kg|mL|ml|m|g|L";
const LENGTHS = new Set(["mm", "cm", "dm", "m", "km"]);

/** "cm" after 1 is "centimetre", else "centimetres"; "cm²" is "square centimetres", "cm³" "cubic centimetres". */
function unit(name: string, power: string | undefined, single: boolean): string {
  const [one, many] = UNITS[name];
  const said = single ? one : many;
  if (power && LENGTHS.has(name)) return `${power === "²" ? "square" : "cubic"} ${said}`;
  if (power) return `${said} ${power === "²" ? "squared" : "cubed"}`;
  return said;
}

/** "$3.25" is "3 dollars and 25 cents", "$1" "1 dollar", "$0.50" "50 cents". */
function money(dollars: string, cents: string | undefined): string {
  const whole = dollars.replace(/,/g, "");
  const c = cents === undefined ? 0 : Number(cents.padEnd(2, "0"));
  const dollarText = `${dollars} ${whole === "1" ? "dollar" : "dollars"}`;
  const centText = `${c} ${c === 1 ? "cent" : "cents"}`;
  if (c === 0) return dollarText;
  if (Number(whole) === 0) return centText;
  return `${dollarText} and ${centText}`;
}

/** "3:30" is "three thirty", "3:05" "three oh five", "3:00" "three o'clock" (just "three" before a.m. or p.m.). */
function time(hour: string, minute: string, meridiem: boolean): string {
  const h = words(String(Number(hour)));
  const m = Number(minute);
  if (m === 0) return meridiem ? h : `${h} o'clock`;
  return m < 10 ? `${h} oh ${ONES[m]}` : `${h} ${words(String(m))}`;
}

const SUPERSCRIPT: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
const power = (p: string) => (p === "2" ? " squared" : p === "3" ? " cubed" : ` to the power of ${p}`);

/** A word with its punctuation around it split off: "(28," is ["(", "28", ","]. */
function parts(word: string): [string, string, string] {
  const m = /^([("'[“‘]*)([\s\S]*?)([)"'\]”’.,;:!?]*)$/.exec(word);
  return m ? [m[1], m[2], m[3]] : ["", word, ""];
}

/** A neighbour that ends a math operand on its right: a number, a fraction, a blank, a unit after a number, "?". */
function leftOperand(word: string | undefined): boolean {
  if (word === undefined) return false;
  const core = word.replace(/[)\]]+$/, "");
  if (/^(\?|□|_{2,})$/.test(core)) return true;
  if (new RegExp(`^(${UNIT_PATTERN})[²³]?$`).test(core)) return true;
  return new RegExp(`[\\d${VULGAR_CLASS}²³⁰¹⁴⁵⁶⁷⁸⁹%¢°_]$`).test(core);
}

/** A neighbour that starts a math operand on its left. */
function rightOperand(word: string | undefined): boolean {
  if (word === undefined) return false;
  const core = word.replace(/^[([]+/, "");
  if (/^(\?|□)[.,;:!?)]*$/.test(core)) return true;
  return new RegExp(`^([$]?\\d|[−–-][$]?\\d|\\.\\d|[${VULGAR_CLASS}]|_{2,}|√)`).test(core);
}

/** A neighbour that is a plain number (for units, a.m. and p.m.). */
const numberBefore = (word: string | undefined) => word !== undefined && new RegExp(`[\\d${VULGAR_CLASS}]$`).test(word.replace(/[)\]]+$/, ""));

const STANDALONE: Record<string, string> = {
  "+": "plus", "×": "times", "÷": "divided by", "=": "equals", "<": "less than", ">": "greater than", "≤": "less than or equal to",
  "≥": "greater than or equal to", "≠": "is not equal to", "≈": "is about", "√": "the square root of",
};
const BETWEEN: Record<string, string> = { "−": "minus", "–": "minus", "-": "minus", "*": "times", x: "times", X: "times", "/": "divided by", R: "remainder", r: "remainder", ":": "to" };

const SIGNS = new Set([...Object.keys(STANDALONE), ...Object.keys(BETWEEN)].filter(k => !/^[a-zA-Z:]$/.test(k)));
/** A fraction that starts the second word of a mixed number ("2 1/2", "2 ½"). */
const MIXED_NEXT = new RegExp(`^(\\d+)/(\\d+)(?![\\d/]|[.,]\\d)|^[${VULGAR_CLASS}]`);
const MATH = new RegExp(`[\\d$¢%²³⁰¹⁴⁵⁶⁷⁸⁹=+×÷<>≤≥≠≈√_□−–*^°${VULGAR_CLASS}]`);

/** The spoken form of one word, read with its neighbours. */
function spokenWord(word: string, prev: string | undefined, next: string | undefined): string {
  if (Object.hasOwn(STANDALONE, word)) return STANDALONE[word];
  if (Object.hasOwn(BETWEEN, word)) return leftOperand(prev) && rightOperand(next) ? BETWEEN[word] : word;
  // The unknown of an equation: "52 − 28 = ?" is "52 minus 28 equals what?" (the question mark stays for the voice),
  // and "? + 5 = 8" is "what plus 5 equals 8".
  if (/^\?[.!?]*$/.test(word) && prev !== undefined && /=$/.test(prev)) return `what${word}`;
  if (word === "?" && next !== undefined && SIGNS.has(next)) return "what";
  if (/^(_{2,}|□)$/.test(word)) return "blank";

  const [lead, core, trail] = parts(word);
  // A unit after a number: "5 cm" is "5 centimetres", "1 m" "1 metre", "4 cm²" "4 square centimetres".
  const unitWord = new RegExp(`^(${UNIT_PATTERN})([²³])?$`).exec(core);
  if (unitWord && !lead && numberBefore(prev)) return `${unit(unitWord[1], unitWord[2], /^1$/.test(prev!.replace(/[)\]]+$/, "")))}${trail}`;
  // "a.m." and "p.m." after a time or a number, in the form a voice reads: "3 pm" is "3 p.m.".
  const meridiem = /^([ap])\.?m\.?([,;:!?]*)$/i.exec(word);
  if (meridiem && numberBefore(prev)) return `${meridiem[1].toLowerCase()}.m.${meridiem[2]}`;

  // A date stays as written.
  if (/\d{4}-\d{1,2}-\d{1,2}/.test(word) || /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(word)) return word;
  if (!MATH.test(word)) return word;
  // Mixed numbers across two words: "2 1/2" is "two and one half". This word is the "2"; the next is the fraction.
  if (/^\d+$/.test(word) && next !== undefined && MIXED_NEXT.test(next)) return words(word);

  let s = word;
  if (prev !== undefined && /^\d+$/.test(prev)) {
    s = s.replace(MIXED_NEXT, (all: string, n?: string, d?: string) => `and ${n !== undefined ? fraction(n, d!) : fraction(...VULGAR[all])} `);
  }
  // Signs first, so a sign before money or a fraction is read: "-$5" is "negative 5 dollars".
  // A negative number: a minus sign with no number before it. "52 −28" is still "52 minus 28".
  s = s.replace(/(^|[([=<>≤≥≠≈+×÷*/:])[−–-](?=[$.]?\d)/g, (_all: string, before: string, at: number) =>
    at === 0 && !before && leftOperand(prev) ? "minus " : `${before}negative `);
  if (!/^\(?\d+-\d+-\d+[).,;:!?]*$/.test(word)) s = s.replace(/(?<=[\d)_%²³°])\s*[−–-]\s*(?=[\d(_$])/g, " minus ");
  s = s.replace(/\$(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?!\d|[.,]\d)/g, (_all: string, d: string, c?: string) => ` ${money(d, c)} `);
  s = s.replace(/(?<![\d.])(\d+)¢/g, (_all: string, c: string) => ` ${c} ${c === "1" ? "cent" : "cents"} `);
  const meridiemNext = next !== undefined && /^[ap]\.?m\.?[,;:!?]*$/i.test(next);
  s = s.replace(/(?<![\d:.])(\d{1,2}):(\d{2})(\s*[ap]\.?m\.?(?![a-z]))?(?![\d:]|[.,]\d)/gi, (all: string, h: string, m: string, mer?: string) =>
    Number(h) > 23 || Number(m) > 59 ? all : ` ${time(h, m, !!mer || meridiemNext)}${mer ? ` ${mer.trim()[0].toLowerCase()}.m.` : ""} `);
  // A ratio: one digit after the colon ("2:3"); two digits are a time (above).
  s = s.replace(/(?<![\d:.])(\d+):(\d)(?![\d:])/g, "$1 to $2");
  s = s.replace(/(?<![A-Za-z\d])(mm|cm|dm|km|m)([²³])/g, (_all: string, u: string, p: string) => ` ${unit(u, p, false)} `);
  // A letter with a power is a variable: "x²" is "x squared". Units with a power were read above.
  s = s.replace(/(?<![A-Za-z])([A-Za-z])²/g, "$1 squared").replace(/(?<![A-Za-z])([A-Za-z])³/g, "$1 cubed");
  s = s.replace(/(\d)([²³⁰¹⁴⁵⁶⁷⁸⁹]+)(?![A-Za-z])/g, (_all: string, d: string, sup: string) => `${d}${power([...sup].map(c => SUPERSCRIPT[c]).join(""))}`);
  s = s.replace(/(\d)\^(\d+)/g, (_all: string, d: string, p: string) => `${d}${power(p)}`);
  s = s.replace(/(\d)\s*%/g, "$1 percent");
  s = s.replace(/(\d)\s*°\s*([CF](?![A-Za-z]))?/g, (_all: string, d: string, scale?: string) =>
    `${d} degrees${scale === "C" ? " Celsius" : scale === "F" ? " Fahrenheit" : ""} `);
  s = s.replace(new RegExp(`(\\d+)?([${VULGAR_CLASS}])`, "g"), (_all: string, whole: string | undefined, v: string) =>
    ` ${whole ? `${words(whole)} and ` : ""}${fraction(...VULGAR[v])} `);
  s = s.replace(/(?<![\d./,])(\d+)\/(\d+)(?![\d/]|[.,]\d)/g, (_all: string, n: string, d: string) => ` ${fraction(n, d)} `);
  // A unit right after its number: "5cm" is "5 centimetres".
  s = s.replace(new RegExp(`(?<![\\d.,])(\\d[\\d,]*(?:\\.\\d+)?)(${UNIT_PATTERN})([²³])?(?![A-Za-z])`, "g"), (_all: string, n: string, u: string, p?: string) =>
    ` ${n} ${unit(u, p, n === "1")} `);
  s = s.replace(/(\d)\s*([ap])\.?m\.?(?![a-z])/gi, (_all: string, d: string, a: string) => `${d} ${a.toLowerCase()}.m. `);
  s = s.replace(/=\s*\?/g, " equals what?");
  s = s.replace(/(?<=[\d)_%])\s*\+\s*|\s*\+\s*(?=[\d($_.])/g, " plus ").replace(/\s*×\s*/g, " times ").replace(/\s*÷\s*/g, " divided by ");
  s = s.replace(/(?<=[\d)])\s*\*\s*(?=[\d(])/g, " times ").replace(/(?<=\d)\s*[xX]\s*(?=\d)/g, " times ");
  s = s.replace(/(?<=\d)\s*R\s*(?=\d)/g, " remainder ");
  s = s.replace(/\s*≤\s*/g, " less than or equal to ").replace(/\s*≥\s*/g, " greater than or equal to ")
    .replace(/\s*≠\s*/g, " is not equal to ").replace(/\s*≈\s*/g, " is about ");
  s = s.replace(/(?<=[\d)])\s*<\s*(?=[\d(])/g, " less than ").replace(/(?<=[\d)])\s*>\s*(?=[\d(])/g, " greater than ");
  s = s.replace(/\s*=\s*/g, " equals ");
  s = s.replace(/√\s*/g, " the square root of ");
  s = s.replace(/_{2,}|□/g, " blank ");
  // No space inside brackets or before punctuation: "( negative 5 )" is "(negative 5)", "5 dollars ." is "5 dollars.".
  const out = s.replace(/\s+/g, " ").replace(/\s+([.,;:!?)\]”’])/g, "$1").replace(/([(\[“‘])\s+/g, "$1").trim();
  return out || word;
}

/** The spoken form of each whitespace-separated word of `text`, in order: one entry per word, never empty. */
export function spokenWords(text: string): string[] {
  try {
    const list = text.match(/\S+/g) ?? [];
    return list.map((word, i) => {
      try { return spokenWord(word, list[i - 1], list[i + 1]); } catch { return word; }
    });
  } catch {
    return text.match(/\S+/g) ?? [];
  }
}

/** `text` with math notation as spoken words, its spaces kept. Only the text sent to the voice provider uses it. */
export function spokenMath(text: string): string {
  try {
    const said = spokenWords(text);
    let n = 0;
    return text.replace(/\S+/g, (word) => said[n++] ?? word);
  } catch {
    return text;
  }
}

/**
 * Turns streamed text into spoken text a sentence at a time, so a sign is never read apart from its numbers across a
 * chunk break. `push` returns the spoken text of each sentence the buffer finished; `end` returns the rest.
 */
export function spokenStream() {
  let held = "";
  return {
    push(chunk: string): string {
      held += chunk;
      // A sentence ends at ".", "!" or "?" (with closing quotes or brackets) before a space, the same break as speechSentences.
      // A "?" standing alone ("? − 28 = 24") is a number to find, not the end of a sentence: the next sign needs it.
      const breaks = [...held.matchAll(/[.!?]["')\]”’]*\s+/g)].filter(b => !(held[b.index] === "?" && (b.index === 0 || /[\s=]/.test(held[b.index - 1]))));
      const last = breaks.at(-1);
      if (!last || last.index === undefined) return "";
      const cut = last.index + last[0].length;
      const ready = held.slice(0, cut);
      held = held.slice(cut);
      return spokenMath(ready);
    },
    end(): string {
      const rest = held;
      held = "";
      return spokenMath(rest);
    },
  };
}
