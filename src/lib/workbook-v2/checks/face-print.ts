// What a question must print: each text and each line of its face, at its place and in its size. The places follow from the
// answer areas of the question and the print rules, never from a template, so a template that leaves a part out fails.
// The image check looks for all that the model prints, so a part of a face is on the paper too.
import { BRACKET_SIGN, PRINT_RULES, type BracketFace, type ColumnFace, type Face, type FaceToken, type Ink, type Rect, type Region } from "../contract";
import { bottom, near, right } from "./rects";

const { cell: CELL, line: LINE, textHeight: TEXT_HEIGHT, questionSize: SIZE, bracket: BRACKET } = PRINT_RULES;

/** The tokens of a face: of its line, of its sequence, or of what stands above its bracket. A stack has none. */
export const faceTokens = (face: Face): readonly FaceToken[] => (face.kind === "column" ? [] : face.kind === "bracket" ? face.above : face.tokens);

/** The text of a question with no spaces. */
export function faceText(face: Face): string {
  if (face.kind === "column") return face.top + face.sign + face.bottom;
  const texts = faceTokens(face).map((t) => ("text" in t ? t.text : "")).join("");
  return face.kind === "bracket" ? `${texts}${face.outside}${BRACKET_SIGN}${face.inside}` : texts;
}

/** The parts that the blanks of a face name. A stack has no blanks. */
export const faceBlanks = (face: Face): string[] | null => (face.kind === "column" ? null : faceTokens(face).flatMap((t) => ("blank" in t ? [t.blank] : [])));

/** One part of a face on the page. A line has no text. */
interface Print { text: string | null; rect: Rect }
export interface Area { answer: Rect; reach: Rect }

const middle = (r: Rect): number => r.y + r.h / 2;
const text = (value: string, x: number, y: number, w: number, h: number): Print => ({ text: value, rect: { x, y, w, h } });
const line = (x: number, y: number, w: number): Print => ({ text: null, rect: { x, y, w, h: LINE.height } });
/** A text of one line that stands in the line of an area. */
const beside = (value: string, x: number, w: number, area: Rect): Print => text(value, x, middle(area) - TEXT_HEIGHT / 2, w, TEXT_HEIGHT);

/** Ones under ones from the right end of the question, the sign left of the lower number, and the line below all of it. */
function columnPrint({ top, sign, bottom: low }: ColumnFace, question: Rect): Print[] {
  const row = (texts: readonly string[], y: number) => texts.map((t, i) => text(t, right(question) - (texts.length - i) * CELL.w, y, CELL.w, CELL.h));
  return [...row([...top], question.y), ...row([sign, ...low], question.y + CELL.h), line(question.x, question.y + 2 * CELL.h + LINE.gap, question.w)];
}

/** The number inside starts at the left end of its area, below its reach; the bar is over the sign and the whole area. */
function bracketPrint({ above, outside, inside }: BracketFace, areas: ReadonlyMap<string, Area>): Print[] {
  const row = above.map((t) => ("blank" in t ? areas.get(t.blank) : undefined));
  const [first] = row;
  if (!first) return [];
  const { answer, reach } = first;
  const bar = bottom(reach);
  const digits = bar + LINE.height + LINE.gap;
  const texts = above.flatMap((t, i): Print[] => {
    const [left, next] = [row[i - 1], row[i + 1]];
    return "text" in t && left && next ? [beside(t.text, right(left.reach), next.reach.x - right(left.reach), answer)] : [];
  });
  return [
    ...texts,
    text(outside, answer.x - BRACKET.sign - BRACKET.outside, digits, BRACKET.outside, CELL.h),
    text(BRACKET_SIGN, answer.x - BRACKET.sign, bar + LINE.height, BRACKET.sign, LINE.gap + CELL.h),
    ...[...inside].map((digit, i) => text(digit, answer.x + i * CELL.w, digits, CELL.w, CELL.h)),
    line(answer.x - BRACKET.sign, bar, BRACKET.sign + answer.w),
  ];
}

/**
 * The tokens stand side by side, an area with its reach. Every second one is a sign and the others are numbers: the signs
 * have one width, and so do the numbers.
 */
function equationPrint(tokens: readonly FaceToken[], areas: ReadonlyMap<string, Area>, ink: readonly Ink[]): Print[] {
  const printed = ink.filter((i) => i.kind === "text");
  const isText = tokens.map((t) => "text" in t);
  const widths = [0, 1].map((odd) => Math.max(...tokens.flatMap((_, i) => (isText[i] && i % 2 === odd ? [printed[isText.slice(0, i).filter(Boolean).length]?.rect.w ?? 0] : [0]))));
  const areaOf = (t: FaceToken) => ("blank" in t ? areas.get(t.blank) : undefined);
  const widthOf = (t: FaceToken, i: number) => areaOf(t)?.reach.w ?? widths[i % 2];
  const at = tokens.findIndex((t) => areaOf(t) !== undefined);
  const anchor = at < 0 ? undefined : areaOf(tokens[at]);
  if (!anchor) return [];
  const start = anchor.reach.x - tokens.slice(0, at).reduce((sum, t, i) => sum + widthOf(t, i), 0);
  return tokens.flatMap((t, i): Print[] => ("text" in t ? [beside(t.text, start + tokens.slice(0, i).reduce((sum, other, j) => sum + widthOf(other, j), 0), widths[i % 2], anchor.answer)] : []));
}

/** The terms go down the page in the places of areas. A sequence below another one has a line at its top. */
function sequencePrint(tokens: readonly FaceToken[], areas: ReadonlyMap<string, Area>, question: Rect, isBelow: boolean): Print[] {
  const at = tokens.findIndex((t) => "blank" in t && areas.has(t.blank));
  const token = tokens.at(at);
  const anchor = at >= 0 && token && "blank" in token ? areas.get(token.blank) : undefined;
  if (!anchor) return [];
  const { answer, reach } = anchor;
  const terms = tokens.flatMap((t, i): Print[] => ("text" in t ? [beside(t.text, answer.x, answer.w, { ...answer, y: answer.y + (i - at) * reach.h })] : []));
  return isBelow ? [...terms, line(reach.x, question.y, reach.w)] : terms;
}

function facePrint(face: Face, question: Region, areas: ReadonlyMap<string, Area>, isBelow: boolean): Print[] {
  if (face.kind === "column") return columnPrint(face, question.rect);
  if (face.kind === "bracket") return bracketPrint(face, areas);
  return face.kind === "equation" ? equationPrint(face.tokens, areas, question.ink) : sequencePrint(face.tokens, areas, question.rect, isBelow);
}

const isPrint = ({ text: wanted, rect }: Print, ink: Ink): boolean => {
  const isKind = wanted === null ? ink.kind === "fill" : ink.kind === "text" && ink.text === wanted && ink.size >= SIZE.min && ink.size <= SIZE.max;
  return isKind && near(ink.rect.x, rect.x) && near(ink.rect.y, rect.y) && near(ink.rect.w, rect.w) && near(ink.rect.h, rect.h);
};
const round = (n: number) => Math.round(n * 100) / 100;

/** What a question does not print of its face, and what it prints more. `areas` are its answer areas by their parts. */
export function printProblems(face: Face, question: Region, areas: ReadonlyMap<string, Area>, isBelow: boolean): string[] {
  const left = [...question.ink];
  const missing = facePrint(face, question, areas, isBelow).flatMap((wanted) => {
    const found = left.findIndex((ink) => isPrint(wanted, ink));
    if (found >= 0) left.splice(found, 1);
    const { x, y, w, h } = wanted.rect;
    return found >= 0 ? [] : [`must print ${wanted.text === null ? "a line" : `"${wanted.text}"`} at (${[x, y].map(round).join(", ")}, ${round(w)} by ${round(h)})`];
  });
  return [...missing, ...left.map((ink) => `prints ${ink.kind === "text" ? `"${ink.text}"` : "a line"} that its face does not have there`)];
}
