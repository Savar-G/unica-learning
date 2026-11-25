import { NOT_STATED, UNCLEAR } from "@/lib/reference-record";

export function normalizeAnswerCompare(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\d{1,3}(?:,\d{3})+\b/g, (grouped) => grouped.replace(/,/g, ""))
    .replace(/(\d)\s*[rR]\s*(\d+)/g, "$1 R$2");
}

export function isConcreteAnswer(answer: unknown): answer is string {
  return (
    typeof answer === "string" &&
    answer !== UNCLEAR &&
    answer !== NOT_STATED &&
    answer.trim().length > 0
  );
}

export function plainMinus(text: string): string {
  return text.replace(/[‐-―−]/g, "-");
}

function withoutFirstEquals(text: string): string {
  return text.replace(/^\s*=/, "");
}

const PLAIN_NUMBER_RE = /^(?:-?\d+(?:\.\d+)?|\d+ R\d+)$/;

function canonicalNumber(text: string): string {
  const [whole, decimals = ""] = text.replace(/^(-?)0+(?=\d)/, "$1").split(".");
  const kept = decimals.replace(/0+$/, "");
  const out = kept ? `${whole}.${kept}` : whole;
  return out === "-0" ? "0" : out;
}

// The one number (or quotient with remainder) that a text holds, also after "=". Null when it holds
// anything else.
export function plainNumber(text: string): string | null {
  const norm = normalizeAnswerCompare(withoutFirstEquals(plainMinus(text)));
  return PLAIN_NUMBER_RE.test(norm) ? norm.split(" R").map(canonicalNumber).join(" R") : null;
}

// The one rule for equal answers. Equal forms of a number: thousands commas (1,000), any minus sign,
// leading zeros (05), zeros at the end of decimals (5.0), spaces and case at a remainder (3 r 2), and
// a first "=".
// Any other text must be equal after normalizeAnswerCompare.
export function sameValue(a: string, b: string): boolean {
  return (plainNumber(a) ?? normalizeAnswerCompare(a)) === (plainNumber(b) ?? normalizeAnswerCompare(b));
}

// What a worked step prints, when it is one of these forms: a number, "= number", "number = number"
// (every side is the answer), or a remainder with its letter ("R 2", "r2", "R = 2").
export function stepNumbers(text: string): { numbers: string[]; isRemainder: boolean } {
  const remainder = /^\s*[rR]\s*=?\s*(\d+)\s*$/.exec(text);
  if (remainder) return { numbers: [remainder[1]], isRemainder: true };
  const sides = withoutFirstEquals(text).split("=").map(plainNumber);
  const numbers = sides.filter((side): side is string => side !== null);
  return { numbers: numbers.length === sides.length ? numbers : [], isRemainder: false };
}

const LIST_TOKEN_RE = /-?\d+(?: R\d+)?/y;
const LIST_GAP_RE = /\s*(?:[,;→]|->)\s*|\s+and\s+|\s+/y;

function wholeNumberList(text: string): string[] | null {
  const out: string[] = [];
  let at = 0;
  while (at < text.length) {
    if (out.length > 0) {
      LIST_GAP_RE.lastIndex = at;
      if (!LIST_GAP_RE.test(text)) return null;
      at = LIST_GAP_RE.lastIndex;
    }
    LIST_TOKEN_RE.lastIndex = at;
    const token = LIST_TOKEN_RE.exec(text);
    if (!token) return null;
    out.push(token[0]);
    at = LIST_TOKEN_RE.lastIndex;
  }
  return out.length > 0 ? out : null;
}

// Every way to read a text as a list of whole numbers (also after "="): a comma can group digits or separate values.
export function wholeNumberLists(text: string): string[][] {
  const plain = withoutFirstEquals(plainMinus(text));
  const spaced = plain.trim().replace(/\s+/g, " ").replace(/(\d)\s*[rR]\s*(\d+)/g, "$1 R$2");
  return [normalizeAnswerCompare(plain), spaced]
    .map(wholeNumberList)
    .filter((list): list is string[] => list !== null);
}
