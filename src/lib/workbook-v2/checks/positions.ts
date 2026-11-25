// The typesetter says where it put each region and which text it drew. Both must equal the page model.
import type { DrawnText, PageModel, Position, Rect } from "../contract";
import { near } from "./rects";
import { placeTexts } from "./texts";

const show = (r: Rect) => `(${r.x}, ${r.y}, ${r.w} by ${r.h})`;
const same = (a: Rect, b: Rect) => near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h);

export function checkPositions(pages: readonly PageModel[], positions: readonly Position[]): string[] {
  const problems: string[] = [];
  const reported = new Map<string, Position>();
  for (const position of positions) {
    if (reported.has(position.id)) problems.push(`"${position.id}" was drawn twice.`);
    reported.set(position.id, position);
  }
  pages.forEach((page, index) => {
    for (const region of page.regions) {
      const position = reported.get(region.id);
      reported.delete(region.id);
      if (!position) problems.push(`"${region.id}" was not drawn.`);
      else if (position.sheet !== index + 1) problems.push(`"${region.id}" is on page ${position.sheet} of the file and the model puts it on page ${index + 1}.`);
      else if (!same(position.rect, region.rect)) problems.push(`"${region.id}" is at ${show(position.rect)} and the model puts it at ${show(region.rect)}.`);
    }
  });
  for (const id of reported.keys()) problems.push(`"${id}" is not in the model.`);
  return problems;
}

/** Every text of the model is drawn once at its place, and nothing else is drawn. */
export const checkTexts = (pages: readonly PageModel[], texts: readonly DrawnText[]): string[] => placeTexts(pages, texts).problems;
