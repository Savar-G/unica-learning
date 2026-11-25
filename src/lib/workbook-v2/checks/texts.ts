// Finds the report of each text of the model. The model has one text for each one-line ink, and one for each piece of a flow.
import type { DrawnText, FlowToken, Ink, PageModel, Region } from "../contract";
import { near } from "./rects";

export type TextInk = Extract<Ink, { kind: "text" }>;
export type FlowInk = Extract<Ink, { kind: "flow" }>;

interface Place { page: PageModel; region: Region }
export interface PlacedText extends Place { ink: TextInk; drawn: DrawnText }
export interface PlacedPiece { token: FlowToken; text: string; drawn: DrawnText }
export interface PlacedFlow extends Place { ink: FlowInk; pieces: PlacedPiece[] }

export interface PlacedTexts { texts: PlacedText[]; flows: PlacedFlow[]; problems: string[] }

export function placeTexts(pages: readonly PageModel[], drawn: readonly DrawnText[]): PlacedTexts {
  const found: PlacedTexts = { texts: [], flows: [], problems: [] };
  const onSheet = new Map<number, DrawnText[]>();
  for (const text of drawn) onSheet.set(text.sheet, [...(onSheet.get(text.sheet) ?? []), text]);
  pages.forEach((page, index) => {
    const left = onSheet.get(index + 1) ?? [];
    for (const region of page.regions) {
      for (const ink of region.ink) {
        if (ink.kind !== "text") continue;
        const at = left.findIndex((t) => near(t.x, ink.rect.x) && near(t.y, ink.rect.y));
        if (at < 0) {
          found.problems.push(`"${ink.text}" of "${region.id}" was not drawn at its place.`);
          continue;
        }
        const [one] = left.splice(at, 1);
        if (one.text === ink.text) found.texts.push({ page, region, ink, drawn: one });
        else found.problems.push(`"${region.id}" prints "${ink.text}" and the typesetter drew "${one.text}".`);
      }
    }
    // Only pieces of flows are left here, in the order of the page.
    for (const region of page.regions) {
      for (const ink of region.ink) {
        if (ink.kind !== "flow") continue;
        const wanted = ink.tokens.flatMap((token) => token.pieces.map((text) => ({ token, text })));
        const pieces = wanted.flatMap((piece) => (left[0]?.text === piece.text ? [{ ...piece, drawn: left.splice(0, 1)[0] }] : []));
        if (pieces.length < wanted.length) found.problems.push(`the flow text of "${region.id}" was not drawn as the model says it.`);
        else found.flows.push({ page, region, ink, pieces });
      }
    }
    onSheet.set(index + 1, left);
  });
  for (const texts of onSheet.values()) for (const text of texts) found.problems.push(`"${text.text}" on page ${text.sheet} of the file is not in the model.`);
  return found;
}
