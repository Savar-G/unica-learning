// The printer gets the PDF, and the page images come from another run of the typesetter. So the PDF is read back too: each
// page must draw the inks of the model, at their places and in their order, and nothing else.
import type { DrawnText, Ink, PageModel, Rect } from "../contract";
import { readPdf, type PdfInk, type PdfPage } from "./pdf-file";
import { near } from "./rects";
import type { PlacedTexts } from "./texts";

/** The weight of each font file of the engine. */
const WEIGHTS: Readonly<Record<string, number>> = { "Geist-Regular": 400, "Geist-SemiBold": 600 };
const BLACK = 0;
const PAPER_WHITE = 1;
/**
 * How far the width of a text in the PDF may be from the width that Typst measures. Typst writes the width of each letter
 * (in thousandths of the size) and each move as a float of 32 bits, to the nearest. Below 1024 such a float is at most
 * 0.000061 thousandths off, so each letter is off by at most twice that, in thousandths of the size. The sums of floats of
 * 64 bits add a little more, for each text.
 */
const WIDTH_ROOM = { perLetter: 2 * 2 ** -14 / 1000, fixed: 1e-6 };

const show = (n: number) => Math.round(n * 100) / 100;
const at = ({ x, y, w, h }: Rect) => `at (${show(x)}, ${show(y)}, ${show(w)} by ${show(h)})`;
const same = (a: Rect, b: Rect) => near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h);

/** What a page must draw: the shapes of the model, and the texts where the typesetter reports them. */
type Wanted = { kind: "fill"; rect: Rect } | { kind: "outline"; rect: Rect; width: number } | { kind: "text"; drawn: DrawnText };
type Shown = { kind: "fill"; rect: Rect } | { kind: "outline"; rect: Rect; width: number } | { kind: "text"; x: number; y: number; text: string; size: number; weight: number };

const shownText = ({ start, text, size, weight }: DrawnText): Shown => ({ kind: "text", x: start.x, y: start.y, text, size, weight });
const shownWanted = (wanted: Wanted): Shown => (wanted.kind === "text" ? shownText(wanted.drawn) : wanted);
const shownInk = (ink: PdfInk): Shown => (ink.kind === "text" ? { ...ink, weight: WEIGHTS[ink.font] ?? Number.NaN } : ink);

function name(ink: Shown | undefined): string {
  if (!ink) return "nothing";
  if (ink.kind === "fill") return `a fill ${at(ink.rect)}`;
  if (ink.kind === "outline") return `an outline of ${show(ink.width)} ${at(ink.rect)}`;
  return `the text "${ink.text}" at (${show(ink.x)}, ${show(ink.y)}) with ${show(ink.size)} points and weight ${ink.weight}`;
}

function matches(a: Shown, b: Shown): boolean {
  if (a.kind === "fill") return b.kind === "fill" && same(a.rect, b.rect);
  if (a.kind === "outline") return b.kind === "outline" && same(a.rect, b.rect) && near(a.width, b.width);
  return b.kind === "text" && a.text === b.text && near(a.x, b.x) && near(a.y, b.y) && near(a.size, b.size) && a.weight === b.weight;
}

function pageProblem(page: PageModel, wanted: readonly Wanted[], pdf: PdfPage): string | null {
  if (!near(pdf.size.w, page.size.w) || !near(pdf.size.h, page.size.h)) return `the page of the PDF is ${show(pdf.size.w)} by ${show(pdf.size.h)} points and must be ${page.size.w} by ${page.size.h}`;
  const [paper, ...inks] = pdf.ink;
  if (paper?.kind !== "fill" || paper.grey !== PAPER_WHITE || !same(paper.rect, { x: 0, y: 0, ...page.size })) return "the paper of the PDF is not white";
  for (let i = 0; i < Math.max(inks.length, wanted.length); i++) {
    const [ink, model] = [inks[i], wanted[i]];
    const [drawn, asked] = [ink && shownInk(ink), model && shownWanted(model)];
    if (!drawn || !asked || !matches(drawn, asked)) return `the PDF draws ${name(drawn)} and the model has ${name(asked)}`;
    if (ink.grey !== BLACK) return `the PDF draws ${ink.kind === "text" ? `the text "${ink.text}"` : name(drawn)} in the grey ${ink.grey}, which the model does not use`;
    if (ink.kind === "text" && model.kind === "text" && !(Math.abs(ink.w - model.drawn.natural.w) <= ink.glyphs * ink.size * WIDTH_ROOM.perLetter + WIDTH_ROOM.fixed)) return `the PDF draws the text "${ink.text}" ${show(ink.w)} points wide and it wants ${show(model.drawn.natural.w)}`;
  }
  return null;
}

/** What each page must draw. A text that was not reported is a problem of `checkTexts`, and here it is not drawn. */
function wantedInk(pages: readonly PageModel[], { texts, flows }: PlacedTexts): Wanted[][] {
  const reported = new Map<Ink, readonly DrawnText[]>();
  for (const { ink, drawn: one } of texts) reported.set(ink, [one]);
  for (const { ink, pieces } of flows) reported.set(ink, pieces.map((p) => p.drawn));
  return pages.map((page) => page.regions.flatMap((r) => r.ink).flatMap((ink): Wanted[] => (ink.kind === "fill" || ink.kind === "outline" ? [ink] : (reported.get(ink) ?? []).map((one) => ({ kind: "text", drawn: one })))));
}

/** Where the PDF is not what the model says, in plain words. `placed` is what the typesetter reports of its texts. */
export function checkPdf(pages: readonly PageModel[], placed: PlacedTexts, pdf: Uint8Array): string[] {
  const read = readPdf(pdf);
  if (typeof read === "string") return [`The PDF ${read}.`];
  if (read.length !== pages.length) return [`The PDF has ${read.length} pages and the book has ${pages.length}.`];
  const wanted = wantedInk(pages, placed);
  return pages.flatMap((page, i) => {
    const problem = pageProblem(page, wanted[i], read[i]);
    return problem ? [`Page ${page.page}: ${problem}.`] : [];
  });
}
