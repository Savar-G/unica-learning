// Layer 1 of the fit checks: the typesetter measures every text with all the room it wants, and says where it drew it. The
// text must be as large as the model says, fit its place and stand there. Nothing is ever clipped, made smaller or wrapped.
import { tokenText, type DrawnText } from "../contract";
import { regionName } from "./page-rules";
import { bottom, EPSILON, near, right } from "./rects";
import type { PlacedFlow, PlacedPiece, PlacedText, PlacedTexts } from "./texts";

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

/** What is wrong with a text in its place, or null. */
export function textProblem({ ink, drawn }: PlacedText): string | null {
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

/** Where a piece must stand: at the corner of the flow, after the piece before it on its line, or on the next line. */
function stepProblem({ ink: { rect, leading } }: PlacedFlow, before: PlacedPiece | null, { token, drawn }: PlacedPiece): string | null {
  const { start, flow } = drawn;
  if (!flow) return "is not flow text";
  if (!before) return near(start.x, rect.x) && near(start.y, rect.y + flow.rise) ? null : "does not start at the corner of its place";
  const last = before.drawn;
  if (near(start.y, last.start.y)) {
    const [gap, wanted] = [start.x - last.end.x, before.token === token ? 0 : flow.space];
    return near(gap, wanted) ? null : `is ${show(gap)} points after the piece before it and must be ${show(wanted)}`;
  }
  const [pitch, wanted] = [start.y - last.start.y, (last.flow?.fall ?? Number.NaN) + leading + flow.rise];
  if (!near(pitch, wanted)) return `is on a line ${show(pitch)} points below the one before it and must be ${show(wanted)}`;
  return near(start.x, rect.x) ? null : "starts a line that is not at the left";
}

/** What is wrong with the pieces of a flow, each with its token. `named` is false for a flow that is measured away from its page. */
export function flowProblems(placed: PlacedFlow, named = true): string[] {
  const { ink, pieces } = placed;
  const { rect } = ink;
  return pieces.flatMap((piece, i) => {
    const { token, text, drawn } = piece;
    const { start, end, natural: { w, above, below } } = drawn;
    const problems = [
      atMost(w, rect.w) ? null : `is ${show(w)} points wide${token.pieces.length > 1 ? ` in the part "${text}"` : ""} and its place is ${show(rect.w)}`,
      lineProblem(drawn, ink),
      atMost(rect.y, start.y - above) ? null : "is above its place",
      atMost(start.y + below, bottom(rect)) ? null : "is below its place",
      atMost(rect.x, start.x) && atMost(end.x, right(rect)) ? null : "is not inside its place",
      stepProblem(placed, pieces[i - 1] ?? null, piece),
    ];
    const where = named ? ` of ${regionName(placed.region)}` : "";
    return problems.flatMap((problem) => (problem === null ? [] : [`the token "${tokenText(token)}"${where} ${problem}`]));
  });
}

/** The texts that do not fit their places or do not stand there, in plain words. A text that was not drawn is a problem of `checkTexts`. */
export function checkFit({ texts, flows }: PlacedTexts): string[] {
  return [
    ...texts.flatMap((placed) => {
      const problem = textProblem(placed);
      return problem ? [`Page ${placed.page.page}: the text "${placed.ink.text}" of ${regionName(placed.region)} ${problem}.`] : [];
    }),
    ...flows.flatMap((flow) => flowProblems(flow).map((problem) => `Page ${flow.page.page}: ${problem}.`)),
  ];
}
