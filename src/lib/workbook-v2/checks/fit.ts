// Layer 1 of the fit checks: the typesetter measures every text with all the room it wants, and says where it drew it. The
// text must be as large as the model says, fit its place and stand there. Nothing is ever clipped, made smaller or wrapped.
import type { DrawnText } from "../contract";
import { regionName } from "./page-rules";
import { bottom, EPSILON, near, right } from "./rects";
import { placeTexts, type PlacedFlow, type PlacedText } from "./texts";

/** The least space between two tokens on a line, as a part of the size of the text. */
const LEAST_SPACE = 0.15;

const show = (n: number) => Math.round(n * 100) / 100;
/** False for a value that is no number, so that it never passes. */
const atMost = (a: number, b: number): boolean => a <= b + EPSILON;

/** What is wrong with a text whatever its place is. */
function lineProblem({ start, end, natural, size, weight }: DrawnText, ink: { size: number; weight: number }): string | null {
  if (!near(size, ink.size) || weight !== ink.weight) return `has the size ${show(size)} and the weight ${weight}, and the model says ${ink.size} and ${ink.weight}`;
  if (!near(start.y, end.y)) return "is not on one line";
  if (!near(end.x - start.x, natural.w)) return `is drawn ${show(end.x - start.x)} points wide and wants ${show(natural.w)}`;
  return null;
}

function textProblem({ ink, drawn }: PlacedText): string | null {
  const { rect, align } = ink;
  const { natural: { w, capitals, above, below }, start } = drawn;
  if (!atMost(w, rect.w)) return `is ${show(w)} points wide and its place is ${show(rect.w)}`;
  // The capitals stand in the middle of the height, so the part that goes further from the middle decides.
  const high = 2 * Math.max(above - capitals / 2, capitals / 2 + below);
  if (!atMost(high, rect.h)) return `is ${show(high)} points high and its place is ${show(rect.h)}`;
  const problem = lineProblem(drawn, ink);
  if (problem) return problem;
  const [x, y] = [rect.x + { left: 0, center: (rect.w - w) / 2, right: rect.w - w }[align], rect.y + (rect.h + capitals) / 2];
  return near(start.x, x) && near(start.y, y) ? null : `starts at (${show(start.x)}, ${show(start.y)}) and the model puts it at (${show(x)}, ${show(y)})`;
}

type Tell = (token: string, problem: string) => void;

function checkFlow({ ink, pieces }: PlacedFlow, tell: Tell): void {
  const { rect } = ink;
  let last: { token: object; drawn: DrawnText } | null = null;
  for (const { token, text, drawn } of pieces) {
    const { start, end, natural: { w, above, below } } = drawn;
    const problem = (what: string) => tell(token.pieces.join(""), what);
    const before = last;
    last = { token, drawn };
    if (!atMost(w, rect.w)) problem(`is ${show(w)} points wide${token.pieces.length > 1 ? ` in the part "${text}"` : ""} and its place is ${show(rect.w)}`);
    const line = lineProblem(drawn, ink);
    if (line) problem(line);
    if (!atMost(rect.y, start.y - above)) problem("is above its place");
    if (!atMost(start.y + below, bottom(rect))) problem("is below its place");
    if (!atMost(rect.x, start.x) || !atMost(end.x, right(rect))) problem("is not inside its place");
    if (!before) continue;
    const gap = start.x - before.drawn.end.x;
    const sameLine = near(start.y, before.drawn.start.y);
    if (sameLine ? !atMost(0, gap) : !atMost(before.drawn.start.y + before.drawn.natural.below, start.y - above)) problem("does not come after the one before it");
    else if (!sameLine && !near(start.x, rect.x)) problem("starts a line that is not at the left");
    else if (sameLine && before.token === token && !near(gap, 0)) problem("has a gap inside it");
    else if (sameLine && before.token !== token && !atMost(LEAST_SPACE * ink.size, gap)) problem("has no space before it");
  }
}

/** The texts that do not fit their places or do not stand there, in plain words. A text that was not drawn is a problem of `checkTexts`. */
export function checkFit(pages: Parameters<typeof placeTexts>[0], drawn: readonly DrawnText[]): string[] {
  const { texts, flows } = placeTexts(pages, drawn);
  const problems = texts.flatMap((placed) => {
    const problem = textProblem(placed);
    return problem ? [`Page ${placed.page.page}: the text "${placed.ink.text}" of ${regionName(placed.region)} ${problem}.`] : [];
  });
  for (const flow of flows) checkFlow(flow, (token, problem) => problems.push(`Page ${flow.page.page}: the token "${token}" of ${regionName(flow.region)} ${problem}.`));
  return problems;
}
