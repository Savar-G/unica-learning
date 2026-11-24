import { normalizeNotationText } from "@/lib/reference-kit/normalize";
import { ARITH_OPS, type ArithOp, type Expr } from "@/lib/reference-record";
import { isPlainObject, isSentinel } from "@/lib/reference-record/validate-parts";
import { pageRefOf } from "./identity";
import { holdsSentinel } from "./trusted";
import type { MethodKey } from "./types";

// The syntax of a summary sentence: a page is [51a], math is between backticks, and the rest is plain
// words with no number. Nothing is guessed: a text in another form is refused.

const TOKEN_RE = /\[([^[\]`]*)\]|`([^[\]`]*)`/g;
const PAGE_RE = /^([1-9]\d*)([a-z])$/;
const BEFORE_TOKEN_RE = /(?:^|[\s("\u201C])$/;
const AFTER_TOKEN_RE = /^(?:$|[\s.,;:!?)"\u201D])/;
const PLAIN_RE = /^[A-Za-z\s.,;:!?'"()/\u2018\u2019\u201C\u201D-]*$/;
const RANGE_RE = /^\s*(?:-|to|through|until|up to)\s*(?:pages?|sheets?)?\s*$/i;
const NUMBER_WORD_RE =
  /\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|(?:thir|four|fif|six|seven|eigh|nine)teen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b/i;
const PLACE_WORD = String.raw`\b(?:(?:work)?sheet|page|question)s?\s+(?:(?:number|no\.?)\s+)?`;
const PLACE_BEFORE_MATH_RE = new RegExp(`${PLACE_WORD}$`, "i");
const PLACE_NUMBER_RE = new RegExp(String.raw`${PLACE_WORD}(?:one|zero)\b`, "i");

export interface SentenceText {
  // In the order of the text. A page is its source_ref.
  pages: string[];
  math: string[];
  errors: string[];
}

export function readSentenceText(text: string, key: MethodKey): SentenceText {
  const out: SentenceText = { pages: [], math: [], errors: [] };
  const fail = (message: string): void => void (out.errors.includes(message) || out.errors.push(message));
  let before = "";
  let previous: "page" | "math" | null = null;
  let at = 0;
  for (const match of text.matchAll(TOKEN_RE)) {
    const [token, page, math] = match;
    before = text.slice(at, match.index);
    at = match.index + token.length;
    checkWords(before, fail);
    if (!BEFORE_TOKEN_RE.test(text.slice(0, match.index)) || !AFTER_TOKEN_RE.test(text.slice(at))) {
      fail(`put a space around ${token}`);
    }
    if (math === undefined) {
      const parsed = PAGE_RE.exec(page);
      if (!parsed) fail(`${token} is not a page token: write one page as [12a], with its side and no level`);
      else out.pages.push(pageRefOf(key, Number(parsed[1]), parsed[2]));
      if (previous === "page" && RANGE_RE.test(before)) fail("name each page with its own token, never a range");
    } else {
      out.math.push(math);
      if (/[-/]\s*$/.test(before)) fail(`write the sign or the line before ${token} inside the backticks`);
      if (PLACE_BEFORE_MATH_RE.test(before)) fail("no page, sheet or question may be followed by a number");
    }
    previous = math === undefined ? "page" : "math";
  }
  checkWords(text.slice(at), fail);
  return out;
}

function checkWords(words: string, fail: (message: string) => void): void {
  if (/[[\]`]/.test(words)) fail("a bracket or backtick that is not a whole token");
  else if (/\p{N}/u.test(words)) fail("no digits outside [12a] and `math`");
  else if (!PLAIN_RE.test(words)) fail("write plain English letters and . , ; : ! ? ' \" ( ) / - only, and math between backticks");
  if (NUMBER_WORD_RE.test(words)) fail(`leave out the number word "${NUMBER_WORD_RE.exec(words)?.[0]}"`);
  if (PLACE_NUMBER_RE.test(words)) fail("no page, sheet or question may be followed by a number");
}

// The sentence for a person: pages with their level, and math without its marks.
export function plainSentence(text: string, key: MethodKey): string {
  return text.replace(TOKEN_RE, (_token, page: string | undefined, math: string | undefined) =>
    page === undefined ? (math ?? "") : `${key.level}:${page}`,
  );
}

const OP_SIGNS: Record<ArithOp, string> = { add: "+", sub: "-", mul: "\u00D7", div: "\u00F7" };
// The fields of a record that hold text that the page prints. Not notes or descriptions by a reader,
// not question numbers, not the title, and not an answer that code or a reader gave.
const PRINTED_FIELDS = new Set(["instruction", "printed", "cue", "label", "text", "caption", "template", "shown_answer"]);

function expressionTexts(expr: Expr): string[] {
  if (holdsSentinel(expr)) return [];
  const list = (values: readonly unknown[], join: string): string => values.map((v) => v ?? "_").join(join);
  switch (expr.kind) {
    case "arith":
    case "missing": {
      const op = ARITH_OPS.find((o) => o === expr.op);
      const left = op ? list(expr.operands, ` ${OP_SIGNS[op]} `) : "";
      return op ? [expr.kind === "missing" ? `${left} = ${expr.result ?? "_"}` : left] : [];
    }
    case "chain":
      return [list(expr.terms, ", ")];
    case "word":
      return [expr.text, ...(typeof expr.expr === "object" && expr.expr ? expressionTexts(expr.expr) : [])];
    case "notation":
      return [expr.latex];
    case "linked":
      return expr.pair.flatMap(expressionTexts);
  }
}

// What a page prints, from the trusted view of its record (trusted.ts).
export function printedTexts(view: unknown): string[] {
  if (Array.isArray(view)) return view.flatMap(printedTexts);
  if (!isPlainObject(view)) return [];
  return Object.entries(view).flatMap(([field, value]): string[] => {
    if (field === "expr") return isPlainObject(value) ? expressionTexts(value as unknown as Expr) : [];
    if (typeof value !== "string") return printedTexts(value);
    const printed = PRINTED_FIELDS.has(field) || (field === "answer" && view.answer_source === "printed");
    return printed && !isSentinel(value) ? [value] : [];
  });
}

// True when the fragment is a whole printed text, or whole sides of its equals signs, after the kit's
// notation normaliser. A part of an expression is never enough: 12 is not in 23 - 12, and 3/4 is not 4/3.
export function isPrinted(math: string, texts: readonly string[]): boolean {
  const sides = `=${normalizeNotationText(math).replace(/=$/, "")}=`;
  return sides !== "==" && texts.some((text) => `=${normalizeNotationText(text)}=`.includes(sides));
}
