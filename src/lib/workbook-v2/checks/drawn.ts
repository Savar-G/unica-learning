// Every check of a drawing, for a book and for the bank. A drawing that fails is never repaired: the list says what is wrong.
import type { BookItem, PageModel } from "../contract";
import type { Rendering } from "../renderer";
import { checkFit } from "./fit";
import { checkImages } from "./images";
import { checkPdf } from "./pdf";
import { checkPlaces } from "./place-value";
import { checkPositions } from "./positions";
import { checkRendering } from "./rendering";
import { placeTexts } from "./texts";

/** What is wrong with the drawing of some pages, in plain words. */
export function checkDrawing(pages: readonly PageModel[], items: readonly BookItem[], drawn: Rendering): string[] {
  const missing = checkRendering(pages, drawn);
  if (missing.length > 0) return missing;
  const placed = placeTexts(pages, drawn.texts);
  return [
    ...checkPositions(pages, drawn.positions),
    ...placed.problems,
    ...checkFit(placed),
    ...checkPlaces(pages, items, placed),
    ...checkImages(pages, drawn.images),
    ...checkPdf(pages, placed, drawn.pdf),
  ];
}
