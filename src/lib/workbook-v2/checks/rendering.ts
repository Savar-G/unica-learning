// What a typesetter must give for a book, before its content is checked. A renderer is code from outside the pure engine,
// so a part that it does not give must be a problem of the book and not a hole in it.
import type { PageModel } from "../contract";
import { isRecord } from "../shapes/shape";
import type { Rendering, Report } from "../renderer";

const PDF = [..."%PDF-"].map((c) => c.charCodeAt(0));

const isBytes = (value: unknown): value is Uint8Array => value instanceof Uint8Array && value.length > 0;
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const hasSheet = (list: unknown, sheet: number) => listOf(list).some((entry) => typeof entry === "object" && entry !== null && "sheet" in entry && entry.sheet === sheet);

/** Whether a report of a text has every part. A part that is no number passes here, and no check that compares it passes. */
function isText(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const numbers = (of: unknown, names: readonly string[]) => isRecord(of) && names.every((n) => typeof of[n] === "number");
  return typeof value.text === "string" && numbers(value, ["sheet", "x", "y", "size", "weight"]) && numbers(value.start, ["x", "y"]) && numbers(value.end, ["x", "y"]) && numbers(value.natural, ["w", "capitals", "above", "below"])
    && (value.flow === null || numbers(value.flow, ["space", "rise", "fall"]));
}

const told = (problems: readonly string[]): string[] => problems.map((what) => `The typesetter ${what}.`);

/** What the images of some pages must be, before they are read. */
export function checkImageFiles(pages: readonly PageModel[], given: unknown): string[] {
  const images = listOf(given);
  const count = images.length === pages.length ? [] : [`must give one image for each of the ${pages.length} pages, and it gave ${images.length}`];
  return told([...count, ...pages.flatMap((page, i) => (isBytes(images[i]) ? [] : [`gave no image of page ${page.page}`]))]);
}

export function checkReport(pages: readonly PageModel[], { positions, texts }: Report): string[] {
  const form = listOf(texts).some((text) => !isText(text)) ? ["gave a text with no size or place"] : [];
  return told([...form, ...pages.flatMap((page, i) => [
    ...(hasSheet(positions, i + 1) ? [] : [`gave no positions of page ${page.page}`]),
    ...(hasSheet(texts, i + 1) ? [] : [`gave no texts of page ${page.page}`]),
  ])]);
}

export function checkRendering(pages: readonly PageModel[], drawn: Rendering): string[] {
  return renderingProblems(pages, drawn).map((p) => p.problem);
}

/** The same problems, each with the page that it names, or null for a problem of the whole drawing. */
export function renderingProblems(pages: readonly PageModel[], drawn: Rendering): { page: PageModel | null; problem: string }[] {
  const whole = (problem: string) => ({ page: null, problem });
  const images = listOf(drawn.images);
  const { positions, texts } = drawn;
  return [
    ...(isBytes(drawn.pdf) && PDF.every((byte, i) => drawn.pdf[i] === byte) ? [] : told(["gave no PDF"]).map(whole)),
    ...(images.length === pages.length ? [] : told([`must give one image for each of the ${pages.length} pages, and it gave ${images.length}`]).map(whole)),
    ...pages.flatMap((page, i) => (isBytes(images[i]) ? [] : told([`gave no image of page ${page.page}`]).map((problem) => ({ page, problem })))),
    ...(listOf(texts).some((text) => !isText(text)) ? told(["gave a text with no size or place"]).map(whole) : []),
    ...pages.flatMap((page, i) => told([
      ...(hasSheet(positions, i + 1) ? [] : [`gave no positions of page ${page.page}`]),
      ...(hasSheet(texts, i + 1) ? [] : [`gave no texts of page ${page.page}`]),
    ]).map((problem) => ({ page, problem }))),
  ];
}
