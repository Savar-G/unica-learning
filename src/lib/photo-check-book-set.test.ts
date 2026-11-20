import { beforeAll, describe, expect, it } from "vitest";
import { bookSet, photoKind, type BookSetBook, type BookSetPage } from "@/lib/photo-check-book-set";
import { blankPage, drawBoxOutline, drawMark, drawPrintedContent, drawQr, pagePng, photoJpeg, photographed, uprightCorners } from "@/lib/scan-synthetic";
import { SCAN_MARKS, type Box, type Point } from "@/lib/workbook-print-contract";
import { pageUrl } from "@/lib/workbook-render";

// The real-book set of #856 through its public function: each photo goes through the upload's reading and the crop job
// on synthetic pages. Each test names what would disprove it.

const W = 1275, H = 1650, WORKBOOK = "00000000-0000-4000-8000-0000000000b1", REVISION = "b".repeat(28);
const POINTS: Record<(typeof SCAN_MARKS)[number], Point> = { tl: { x: 34.375, y: 34.375 }, tr: { x: 1240.625, y: 34.375 }, br: { x: 1240.625, y: 1615.625 }, bl: { x: 34.375, y: 1615.625 } };
const BOXES: Box[] = Array.from({ length: 4 }, (_, i) => ({ x: 160 + (i % 2) * 520, y: 760 + Math.floor(i / 2) * 320, width: 300, height: 260 }));
const TOKEN = "book-set-page-token-03", OTHER = "book-set-page-token-04", UNKNOWN = "book-set-page-token-99";

function printed(token: string) {
  const r = blankPage(W, H);
  for (const m of SCAN_MARKS) drawMark(r, m, POINTS[m]);
  drawPrintedContent(r);
  drawQr(r, { x: 90, y: 1500, width: 100, height: 100 }, pageUrl(token));
  for (const b of BOXES) drawBoxOutline(r, b);
  return r;
}

const contract = (page: number) => ({
  version: 1, workbookId: WORKBOOK, page, label: `D1-P${page}`, day: 1, pageOfDay: page,
  coordinates: { units: "image-px", origin: "top-left", x: "right", y: "down", orientation: "portrait", image: { width: W, height: H }, cssPage: { width: 816, height: 1056 }, scale: { x: W / 816, y: H / 1056 } },
  marks: { anchor: "outer-corner", order: [...SCAN_MARKS], points: POINTS },
  // A page image made again from the PDF is not the stored bytes: the set takes the fingerprint from the image it is given.
  fingerprints: { content: "c".repeat(28), image: "0".repeat(64) },
});

let book: BookSetBook, photoOf: (token: string) => Promise<Uint8Array>;

beforeAll(async () => {
  const page = async (number: number, token: string, withContract: boolean, pageType: string): Promise<BookSetPage> => ({
    number, pageType, qrToken: token, image: { width: W, height: H }, printContract: withContract ? contract(number) : null,
    questions: BOXES.map((b, i) => ({ number: i + 1, package: null, regions: [{ id: "answer", kind: "box", box: b }] })), printed: await pagePng(printed(token)),
  });
  book = { workbookId: WORKBOOK, printedRevision: REVISION, pages: [await page(3, TOKEN, true, "practice"), await page(4, OTHER, false, "practice")] };
  photoOf = async (token: string) => {
    const size = { width: 1500, height: 1900 };
    return new Uint8Array(await photoJpeg(photographed(printed(token), size, uprightCorners(size, { width: W, height: H }, 70), { shade: 0.15 })));
  };
});

describe("the real-book set", () => {
  it("makes a photo of a page of the book ready, with the crop job's straightened page and the photo's label", async () => {
    // Disproved if the page is refused, its straightened page is missing, or the label or page number is lost. Page 4 is
    // the same kind: its sheet check compares page 3 with page 4's print, and must still find page 3.
    const [r] = await bookSet(book, [{ id: "photo-01", kind: "shadow", bytes: await photoOf(TOKEN) }]);
    expect(r).toMatchObject({ id: "photo-01", photo: "photo-01", kind: "shadow", page: 3, status: "ready", reason: null });
    expect(r.straight?.length).toBeGreaterThan(1000);
  }, 60_000);

  it("refuses a book whose page image is not the page it is filed under", async () => {
    // Disproved if a swapped page image is taken, since the set takes the image's fingerprint from the image itself.
    const swapped = { ...book, pages: [{ ...book.pages[0], printed: book.pages[1].printed }, book.pages[1]] };
    await expect(bookSet(swapped, [])).rejects.toThrow("page 3: its printed image shows another page's code");
  }, 60_000);

  it("refuses a photo the upload cannot read, a code that is not this book's, and a page with no print contract, as the app would", async () => {
    // Disproved if any of them gets a straightened page: the photo check never runs on a page the app does not make ready.
    const blank = new Uint8Array(await photoJpeg(blankPage(800, 1000)));
    const results = await bookSet(book, [
      { id: "photo-01", kind: "clear", bytes: blank },
      { id: "photo-02", kind: "clear", bytes: await photoOf(UNKNOWN) },
      { id: "photo-03", kind: "clear", bytes: await photoOf(OTHER) },
    ]);
    expect(results.map((r) => [r.id, r.status, r.reason, r.page])).toEqual([
      ["photo-01", "refused", "qr", null],
      ["photo-02", "refused", "page", null],
      ["photo-03", "refused", "no-contract", 4],
    ]);
    expect(results.every((r) => r.straight === null)).toBe(true);
  }, 60_000);

  it("reads only the five labels", () => {
    // Disproved if a typo becomes a kind, or a label with stray case or spaces is refused.
    expect(["clear", " Shadow ", "GLARE", "blurry", "faint"].map(photoKind)).toEqual(["clear", "shadow", "glare", "blurry", "faint"]);
    expect(() => photoKind("shadows")).toThrow("unknown label");
    expect(() => photoKind("")).toThrow("unknown label");
  });
});
