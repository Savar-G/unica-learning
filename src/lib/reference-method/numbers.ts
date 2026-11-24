// How a summary sentence's numbers are read. The limits are listed in docs/reference-methods.md.

const ONES = ["two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TEENS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const WORD_VALUES = new Map<string, number>([
  ["one", 1],
  ...ONES.map((word, i): [string, number] => [word, i + 2]),
  ...TEENS.map((word, i): [string, number] => [word, i + 10]),
  ...TENS.map((word, i): [string, number] => [word, (i + 2) * 10]),
  ["hundred", 100],
  ["thousand", 1000],
]);
const COMPOUND_RE = new RegExp(`\\b(${TENS.join("|")})[ -](one|${ONES.join("|")})\\b`, "gi");
// "one" alone is a pronoun too often to be read as a number.
const WORD_RE = new RegExp(`\\b(${[...WORD_VALUES.keys()].filter((w) => w !== "one").join("|")})\\b`, "gi");
const SHEET_ONE_RE = /\b((?:work)?(?:sheets?|pages?)\s+)one\b/gi;

function valueOfWord(word: string): number {
  return WORD_VALUES.get(word.toLowerCase()) ?? 0;
}

// Number words become digits, so "sheet twelve" and "sheet 12" are one text.
export function digitsForWords(text: string): string {
  return text
    .replace(SHEET_ONE_RE, (_all, lead: string) => `${lead}1`)
    .replace(COMPOUND_RE, (_all, tens: string, ones: string) => String(valueOfWord(tens) + valueOfWord(ones)))
    .replace(WORD_RE, (word) => String(valueOfWord(word)));
}

const NUMBER_RE = /\d{1,3}(?:,\d{3})+(?!\d)(?:\.\d+)?|\d+(?:\.\d+)?/g;

function canonicalNumber(token: string): string {
  const [whole, fraction = ""] = token.replace(/,/g, "").split(".");
  const kept = fraction.replace(/0+$/, "");
  return (whole.replace(/^0+(?=\d)/, "") || "0") + (kept ? `.${kept}` : "");
}

// Each number of a text in one spelling: no separators, no leading zeros, no zeros at the end of a
// decimal. A sign is not part of a number, and "3/4" is the two numbers 3 and 4.
export function numbersIn(text: string): string[] {
  return (digitsForWords(text).match(NUMBER_RE) ?? []).map(canonicalNumber);
}

// A digit or number sign that is not 0 to 9 (a raised 2, a half sign, a digit of another script).
export function hasOtherDigits(text: string): boolean {
  return /(?![0-9])\p{N}/u.test(text);
}

export interface PageMention {
  sheet: number;
  side?: string;
}

const MAX_MENTIONED_RANGE = 500;
const KEYWORD_RE =
  /\b(between\s+)?(?:(?:work)?(?:sheets?|pages?)|pp?\.)(?:\s+(?:numbers?|nos?\.?|#))?\s*#?\s*(?=\d)/gi;
const PAGE_RE = /(\d+)(?:([a-z])(?![a-z0-9])|\s*\(([a-z])\)|,?\s+side\s+([a-z])(?![a-z0-9]))?/iy;
const AGAIN = String.raw`(?:(?:work)?(?:sheets?|pages?)\s*)?(?=\d)`;
const RANGE_RE = new RegExp(String.raw`\s*(?:-|\u2013|\u2014|up to|to|through|until)\s*${AGAIN}`, "iy");
const AND_RE = new RegExp(String.raw`\s*and\s*${AGAIN}`, "iy");
const LIST_RE = new RegExp(String.raw`\s*(?:,\s*(?:and|or)?|and|or|&|/)\s*${AGAIN}`, "iy");
const FULL_REF_RE = /\b[A-Za-z0-9]+:[A-Za-z0-9]+:(\d+)([a-z])\b/g;

function matchAt(re: RegExp, text: string, at: number): RegExpExecArray | null {
  re.lastIndex = at;
  return re.exec(text);
}

function rangeOf(from: PageMention, to: PageMention): PageMention[] {
  const low = Math.min(from.sheet, to.sheet);
  const high = Math.max(from.sheet, to.sheet);
  if (!Number.isSafeInteger(high) || high - low > MAX_MENTIONED_RANGE) return [from, to];
  const side = from.side === to.side ? from.side : undefined;
  const out: PageMention[] = [];
  for (let sheet = low; sheet <= high; sheet += 1) out.push(side ? { sheet, side } : { sheet });
  return [...out, ...(side || (!from.side && !to.side) ? [] : [from, to])];
}

// The sheets and pages that a text names ("sheet 12", "pages 11a to 13a", "12b"), and the text without
// them. A bare "12b" counts for the given sides only.
export function readPageMentions(
  rawText: string,
  sides: ReadonlySet<string>,
  isTerm: (token: string) => boolean = () => false,
): { mentions: PageMention[]; rest: string } {
  const mentions: PageMention[] = [];
  let text = digitsForWords(rawText).replace(FULL_REF_RE, (_all, sheet: string, side: string) => {
    mentions.push({ sheet: Number(sheet), side });
    return " ";
  });

  let rest = "";
  let at = 0;
  KEYWORD_RE.lastIndex = 0;
  for (let key = KEYWORD_RE.exec(text); key !== null; key = KEYWORD_RE.exec(text)) {
    rest += `${text.slice(at, key.index)} `;
    at = KEYWORD_RE.lastIndex;
    let previous: PageMention | null = null;
    let asRange = false;
    for (;;) {
      const page: RegExpExecArray | null = matchAt(PAGE_RE, text, at);
      if (!page) break;
      const side = (page[2] ?? page[3] ?? page[4])?.toLowerCase();
      const mention: PageMention = side ? { sheet: Number(page[1]), side } : { sheet: Number(page[1]) };
      mentions.push(...(previous && asRange ? rangeOf(previous, mention) : [mention]));
      previous = mention;
      at = PAGE_RE.lastIndex;
      const range = matchAt(RANGE_RE, text, at) ?? (key[1] ? matchAt(AND_RE, text, at) : null);
      const next: RegExpExecArray | null = range ?? matchAt(LIST_RE, text, at);
      if (!next) break;
      asRange = range !== null;
      at += next[0].length;
    }
    KEYWORD_RE.lastIndex = at;
  }
  text = rest + text.slice(at);

  text = text.replace(/\b(\d+)([a-z])\b/gi, (token: string, sheet: string, side: string) => {
    if (!sides.has(side.toLowerCase()) || isTerm(token)) return token;
    mentions.push({ sheet: Number(sheet), side: side.toLowerCase() });
    return " ";
  });
  // "Sheets 11 to 13" also gives its first page as a mention of its own.
  const unique = new Map(mentions.map((m) => [`${m.sheet}${m.side ?? ""}`, m]));
  return { mentions: [...unique.values()], rest: text };
}
