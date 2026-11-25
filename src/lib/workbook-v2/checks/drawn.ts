// Every check of a drawing, for a book and for the bank. A drawing that fails is never repaired: the list says what is wrong.
import type { BookItem, PageModel } from "../contract";
import type { Rendering } from "../renderer";
import { checkFit } from "./fit";
import { checkImages } from "./images";
import { checkPdf } from "./pdf";
import { checkPlaces } from "./place-value";
import { checkPositions, checkTexts } from "./positions";
import { checkRendering } from "./rendering";

/** What is wrong with the drawing of some pages, in plain words. */
export function checkDrawing(pages: readonly PageModel[], items: readonly BookItem[], drawn: Rendering): string[] {
  const missing = checkRendering(pages, drawn);
  if (missing.length > 0) return missing;
  return [
    ...checkPositions(pages, drawn.positions),
    ...checkTexts(pages, drawn.texts),
    ...checkFit(pages, drawn.texts),
    ...checkPlaces(pages, items, drawn.texts),
    ...checkImages(pages, drawn.images),
    ...checkPdf(pages, drawn.texts, drawn.pdf),
  ];
}
