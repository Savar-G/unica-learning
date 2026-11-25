// The checks of a drawing with the texts of one report, for tests that look at one check.
import { checkFit as fit } from "../checks/fit";
import { checkPdf as pdf } from "../checks/pdf";
import { checkPlaces as places } from "../checks/place-value";
import { placeTexts } from "../checks/texts";
import type { BookItem, DrawnText, PageModel } from "../contract";

export const checkTexts = (pages: readonly PageModel[], texts: readonly DrawnText[]): string[] => placeTexts(pages, texts).problems;
export const checkFit = (pages: readonly PageModel[], texts: readonly DrawnText[]): string[] => fit(placeTexts(pages, texts));
export const checkPlaces = (pages: readonly PageModel[], items: readonly BookItem[], texts: readonly DrawnText[]): string[] => places(pages, items, placeTexts(pages, texts));
export const checkPdf = (pages: readonly PageModel[], texts: readonly DrawnText[], file: Uint8Array): string[] => pdf(pages, placeTexts(pages, texts), file);
