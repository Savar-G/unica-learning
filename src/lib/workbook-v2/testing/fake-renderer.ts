// A typesetter that draws exactly the model, or with a change, for tests that need no Typst.
import type { PageModel } from "../contract";
import type { Renderer, Rendering } from "../renderer";
import { pagesPdf } from "./fake-pdf";
import { reportedPositions, reportedTexts } from "./fake-typesetter";
import { pagePng } from "./raster";

/** The image of a page, made one time for all the tests that print the same page. */
const images = new Map<string, Uint8Array>();
function imageOf(page: PageModel): Uint8Array {
  const key = JSON.stringify(page);
  const image = images.get(key) ?? pagePng(page);
  images.set(key, image);
  return Uint8Array.from(image);
}

const drawings = {
  pdf: (pages: readonly PageModel[]) => pagesPdf(pages),
  images: (pages: readonly PageModel[]) => pages.map(imageOf),
  report: (pages: readonly PageModel[]) => ({ positions: reportedPositions(pages), texts: reportedTexts(pages) }),
};

/** A change of each kind of drawing. It may change what it gets, and it may throw. */
export interface Changes {
  render?(out: Rendering, pages: readonly PageModel[]): unknown;
  images?(out: Uint8Array[], pages: readonly PageModel[]): unknown;
  report?(out: Pick<Rendering, "positions" | "texts">, pages: readonly PageModel[]): unknown;
}

export interface FakeRenderer extends Renderer { drawn: Record<"render" | "images" | "report", PageModel[][]> }

export function fakeRenderer(changes: Changes = {}): FakeRenderer {
  const drawn: FakeRenderer["drawn"] = { render: [], images: [], report: [] };
  const draw = async <T>(kind: keyof Changes, pages: readonly PageModel[], out: T, change: ((out: T, pages: readonly PageModel[]) => unknown) | undefined): Promise<T> => {
    drawn[kind].push([...pages]);
    await change?.(out, pages);
    return out;
  };
  return {
    drawn,
    identity: { typst: "0.0.0", program: "p", template: "t", fonts: { "A.ttf": "a", "B.ttf": "b" } },
    render: (pages) => draw("render", pages, { pdf: drawings.pdf(pages), images: drawings.images(pages), ...drawings.report(pages) }, changes.render),
    images: (pages) => draw("images", pages, drawings.images(pages), changes.images),
    report: (pages) => draw("report", pages, drawings.report(pages), changes.report),
  };
}
