// The typesetter says where it put each region. It must equal the page model.
import type { PageModel, Position, Rect } from "../contract";
import { near } from "./rects";

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
