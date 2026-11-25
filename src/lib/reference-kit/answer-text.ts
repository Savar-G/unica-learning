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

const PLAIN_NUMBER_RE = /^(?:-?\d+(?:\.\d+)?|\d+ R\d+)$/;

// The one number (or quotient with remainder) that a text holds, also after a first "=". Null when
// the text holds anything else.
export function plainNumber(text: string): string | null {
  const norm = normalizeAnswerCompare(plainMinus(text).replace(/^\s*=/, ""));
  return PLAIN_NUMBER_RE.test(norm) ? norm : null;
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

// Every way to read a text as a list of whole numbers: a comma can group digits or separate values.
export function wholeNumberLists(text: string): string[][] {
  const plain = plainMinus(text);
  const spaced = plain.trim().replace(/\s+/g, " ").replace(/(\d)\s*[rR]\s*(\d+)/g, "$1 R$2");
  return [normalizeAnswerCompare(plain), spaced]
    .map(wholeNumberList)
    .filter((list): list is string[] => list !== null);
}
