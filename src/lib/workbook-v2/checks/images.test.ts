import fc from "fast-check";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { PageModel, RegionRole } from "../contract";
import { qrSquares } from "../layout/qr";
import { blankPage, drawPage, paint, paintInk, pagePng, pngFile, toPng, type Canvas } from "../testing/raster";
import { goodPages } from "../testing/sample";
import { checkImages } from "./images";
import { strayQrTexts } from "./find-qr";
import { readPageImage } from "./page-image";

const pages = goodPages();
const [front, back] = pages;
const part = (page: PageModel, role: RegionRole) => {
  const found = page.regions.find((r) => r.role === role);
  if (!found) throw new Error(`no ${role}`);
  return found;
};
const qr = part(front, "qr");
/** The problems of the front page when it has another image. */
const problemsWith = (image: Uint8Array) => checkImages([front], [image]);
/** The front page with a change in its image. */
const changed = (change: (canvas: Canvas) => unknown): Uint8Array => {
  const canvas = drawPage(front);
  change(canvas);
  return toPng(canvas);
};
/** A QR code with its white edge, drawn in a square box at any place of the page. */
const paintQr = (canvas: Canvas, text: string, x: number, y: number, side: number) => {
  const box = { x, y, w: side, h: side };
  const squares = qrSquares(box, text);
  if (typeof squares === "string") throw new Error(squares);
  paint(canvas, box, 255);
  for (const square of squares) paintInk(canvas, square);
};

it("the images of the example pages prove what is printed", () => {
  expect(checkImages(pages, pages.map(pagePng))).toEqual([]);
});

describe("the QR code of a page image", () => {
  const NONE = "Page 381: the image has no QR code that can be read in its box.";
  it.each<[string, Uint8Array, string]>([
    ["has no ink", changed((c) => paint(c, qr.rect, 255)), NONE],
    ["is covered", changed((c) => paint(c, { ...qr.rect, h: 30 })), NONE],
    ["is in another place only", changed((c) => { paint(c, qr.rect, 255); paintQr(c, front.qr, 300, 660, 57.6); }), NONE],
    ["is the QR code of another page", pagePng({ ...front, regions: front.regions.map((r) => (r.role === "qr" ? { ...r, ink: part({ ...back, regions: back.regions }, "qr").ink.map((i) => ({ ...i, rect: { ...i.rect, x: i.rect.x + 496.9 - 57.5 } })) } : r)) }), 'Page 381: the QR code reads "https://unicalearning.com/tutor/p/example-back-382" and must read "https://unicalearning.com/tutor/p/example-front-381".'],
    ["has another text", changed((c) => paintQr(c, "other", qr.rect.x, qr.rect.y, 57.6)), 'Page 381: the QR code reads "other" and must read "https://unicalearning.com/tutor/p/example-front-381".'],
    ["does not fill its box", changed((c) => { paint(c, qr.rect, 255); paintQr(c, front.qr, qr.rect.x + 1, qr.rect.y + 1, 50); }), "Page 381: the QR code does not fill its box."],
  ])("%s: the book stops", (_name, image, problem) => {
    expect(problemsWith(image)).toContain(problem);
  });

  it("of two pages that changed places stops the book at both", () => {
    const problems = checkImages(pages, [pagePng(back), pagePng(front)]);
    expect(problems).toContain(NONE);
    expect(problems).toContain("Page 382: the image has no QR code that can be read in its box.");
  });

  it.each<[string, string, number, number, number]>([
    ["its own text", front.qr, 110, 400, 57.6],
    ["the text of another page", back.qr, 300, 250, 57.6],
    ["a short text", "x", 440, 300, 40],
    ["large squares", front.qr, 200, 300, 200],
    ["a place beside the QR box", back.qr, qr.rect.x - 58, qr.rect.y, 57.6],
    ["a place in the spine zone", back.qr, 10, 600, 57.6],
  ])("may not come with a second QR code: %s", (_name, text, x, y, side) => {
    expect(problemsWith(changed((c) => paintQr(c, text, x, y, side)))).toContain(`Page 381: the image has a second QR code, which reads "${text}".`);
  });

  it("may not come with a second QR code of any text, size or place, in any quarter turn", () => {
    // A small page with nothing but its QR code, because the time of a check is that of the pixels.
    const at = { x: 205, y: 205 };
    const small: PageModel = { ...front, size: { w: 270, h: 270 }, regions: [{ ...qr, rect: { ...qr.rect, ...at }, ink: qr.ink.map((i) => ({ ...i, rect: { ...i.rect, x: i.rect.x - qr.rect.x + at.x, y: i.rect.y - qr.rect.y + at.y } })) }] };
    expect(checkImages([small], [pagePng(small)])).toEqual([]);
    const boxes = fc.record({ text: fc.stringMatching(/^[a-z0-9:/.-]{1,60}$/), x: fc.double({ min: 0, max: 1, noNaN: true }), y: fc.double({ min: 0, max: 1, noNaN: true }), side: fc.double({ min: 75, max: 190, noNaN: true }), turns: fc.nat(3) });
    fc.assert(fc.property(boxes, ({ text, x: across, y: down, side, turns }) => {
      const [x, y] = [across * (at.x - side), down * (270 - side)];
      const box = { x, y, w: side, h: side };
      const canvas = drawPage(small);
      const draw = (c: Canvas) => {
        paint(c, box, 255);
        const squares = qrSquares(box, text);
        if (typeof squares === "string") throw new Error(squares);
        for (const { rect } of squares) {
          let turned = rect;
          for (let t = 0; t < turns; t++) turned = { x: x + side - (turned.y - y) - turned.h, y: y + (turned.x - x), w: turned.h, h: turned.w };
          paint(c, turned);
        }
      };
      draw(canvas);
      expect(checkImages([small], [toPng(canvas)])).toContain(`Page 381: the image has a second QR code, which reads "${text}".`);
    }), { numRuns: 60 });
  });

  it("may not come with two more QR codes side by side", () => {
    const problems = problemsWith(changed((c) => { paintQr(c, "one", 120, 300, 50); paintQr(c, "two", 170, 300, 50); }));
    expect(problems.filter((p) => p.includes("second QR code"))).toHaveLength(2);
  });

  it("may stand on a page with marks that only look like a corner of a QR code", () => {
    const corner = (c: Canvas, x: number, y: number) => { paint(c, { x, y, w: 14, h: 14 }); paint(c, { x: x + 2, y: y + 2, w: 10, h: 10 }, 255); paint(c, { x: x + 4, y: y + 4, w: 6, h: 6 }); };
    expect(problemsWith(changed((c) => { corner(c, 300, 660); corner(c, 340, 660); corner(c, 300, 690); }))).toEqual([]);
  });

  it("reads stray QR codes when the pixel buffer starts at an unaligned byte offset", () => {
    const canvas = drawPage(front);
    paintQr(canvas, "stray-unaligned", 200, 300, 60);
    for (const offset of [1, 2, 3]) {
      const padded = new Uint8Array(canvas.grey.length + offset);
      padded.set(canvas.grey, offset);
      const view = padded.subarray(offset);
      expect(view.byteOffset % 4).toBe(offset);
      const qrBox = { left: Math.floor((qr.rect.x * 150) / 72), top: Math.floor((qr.rect.y * 150) / 72), right: Math.ceil(((qr.rect.x + qr.rect.w) * 150) / 72), bottom: Math.ceil(((qr.rect.y + qr.rect.h) * 150) / 72) };
      expect(strayQrTexts({ width: canvas.width, height: canvas.height, grey: view }, qrBox)).toEqual(["stray-unaligned"]);
      expect(strayQrTexts({ width: 10, height: 3, grey: new Uint8Array(30 + offset).fill(255).subarray(offset) }, { left: 0, top: 0, right: 0, bottom: 0 })).toEqual([]);
    }
    // A view that ends before the first aligned byte.
    expect(strayQrTexts({ width: 1, height: 1, grey: new Uint8Array(2).fill(255).subarray(1) }, { left: 0, top: 0, right: 0, bottom: 0 })).toEqual([]);
  });
});

describe("ink that the model has and the image does not", () => {
  const without = (role: RegionRole, index: number) => {
    const region = front.regions.filter((r) => r.role === role)[index];
    return changed((c) => region.ink.forEach((i) => { paint(c, { x: i.rect.x - 1, y: i.rect.y - 1, w: i.rect.w + 2, h: i.rect.h + 2 }, 255); }));
  };
  it.each<[string, Uint8Array, RegExp]>([
    ["the heading", without("heading", 0), /^Page 381: "heading" must print "3-20 · Multiplying 2 digits by 1 digit" and the image has no ink there\.$/m],
    ["the instruction", without("instruction", 0), /^Page 381: "instruction" must print "Multiply\. Start with the ones\." and the image has no ink there\.$/m],
    ["the footer", without("footer", 0), /"footer" must print "Level 3 · Page 381"/],
    ["the number of a question", without("label", 2), /"label-3" must print "3"/],
    ["one digit of a question", changed((c) => paint(c, part(front, "question").ink[3].rect, 255)), /"question-1" must print "\d" and the image has no ink there/],
    ["the sign of a question", changed((c) => paint(c, part(front, "question").ink[2].rect, 255)), /"question-1" must print "×"/],
    ["a line of a question", changed((c) => paint(c, { ...part(front, "question").ink[4].rect, h: 2 }, 255)), /^Page 381: the image has no ink for a part of "question-1"\.$/m],
    ["a scan mark", without("scan-mark", 1), /the image has no ink for a part of "mark-tr"/],
    ...part(front, "scan-mark").ink.map((ink, arm): [string, Uint8Array, RegExp] => [`arm ${arm + 1} of a scan mark, past the corner that the arms share`, changed((c) => paint(c, { ...ink.rect, x: ink.rect.w > 3 ? ink.rect.x + 2.5 : ink.rect.x, y: ink.rect.h > 3 ? ink.rect.y + 2.5 : ink.rect.y }, 255)), /the image has no ink for a part of "mark-tl"/]),
    ["half of a line of a question", changed((c) => { const { rect } = part(front, "question").ink[4]; paint(c, { x: rect.x, y: rect.y - 1, w: rect.w / 2, h: rect.h + 2 }, 255); }), /the image has no ink for a part of "question-1"/],
    ["a piece of one side of an answer area", changed((c) => { const { rect } = part(front, "answer"); paint(c, { x: rect.x + rect.w / 2, y: rect.y - 1, w: 6, h: 2 }, 255); }), /the image has no ink for a part of "answer-1"/],
    ["one side of an answer area", changed((c) => paint(c, { x: part(front, "answer").rect.x - 1, y: part(front, "answer").rect.y + 2, w: 2, h: 38 }, 255)), /the image has no ink for a part of "answer-1"/],
    ["one square of the QR code", changed((c) => paint(c, qr.ink[20].rect, 255)), /the image has no ink for a part of "qr"/],
    ["grey in place of black", changed((c) => { const { rect } = part(front, "heading"); for (let i = 0; i < c.grey.length; i++) if (i / c.width < ((rect.y + rect.h) * 150) / 72 && i / c.width > (rect.y * 150) / 72 && c.grey[i] === 0) c.grey[i] = 200; }), /"heading" must print/],
  ])("%s stops the book", (_name, image, problem) => {
    expect(problemsWith(image).join("\n")).toMatch(problem);
  });

  it("a text of spaces has no ink", () => {
    const spaces = { ...front, regions: front.regions.map((r) => (r.role === "label" ? { ...r, ink: r.ink.map((i) => (i.kind === "text" ? { ...i, text: " " } : i)) } : r)) };
    const canvas = drawPage(front);
    for (const r of front.regions.filter((x) => x.role === "label")) paint(canvas, r.rect, 255);
    expect(checkImages([spaces], [toPng(canvas)])).toContain('Page 381: "label-1" must print " " and the image has no ink there.');
  });
});

describe("a page image that cannot be used", () => {
  const good = pagePng(front);
  const withByte = (at: number, value: number) => { const copy = Uint8Array.from(good); copy[at] = value; return copy; };
  it.each<[string, Uint8Array]>([
    ["no bytes", new Uint8Array()],
    ["text", new TextEncoder().encode("a page")],
    ["half of an image", good.subarray(0, good.length / 2)],
    ["an image with no end", good.subarray(0, good.length - 12)],
    ["an image with no pixels", Uint8Array.from([...good.subarray(0, 33), ...good.subarray(-12)])],
    ["pixels that do not unpack", withByte(45, good[45] ^ 255)],
    ["a filter that PNG does not have", toPng(drawPage(front), 5)],
    ["a colour type that PNG does not have", withByte(25, 9)],
    ["a width of 0", withByte(19, 0).map((b, i) => (i >= 16 && i < 20 ? 0 : b))],
    ["a width that does not match the pixels", withByte(19, good[19] + 1)],
  ])("%s", (_name, image) => {
    expect(problemsWith(image)).toEqual(["Page 381: the page image cannot be read."]);
  });

  it("another size", () => {
    expect(problemsWith(toPng(blankPage({ w: 612, h: 800 })))).toEqual(["Page 381: the page image is 1275 by 1667 pixels and must be 1275 by 1650."]);
  });

  it("another kind of image: more than 8 bits, a colour table, or lines out of order", async () => {
    const base = sharp(good);
    const images = await Promise.all([base.clone().toColourspace("rgb16").png().toBuffer(), base.clone().png({ palette: true }).toBuffer(), base.clone().png({ progressive: true }).toBuffer()]);
    for (const image of images) expect(readPageImage(image)).toBe("the page image cannot be read");
  });
});

describe("reading a page image", () => {
  // A second reader of PNG files says what the pixels are.
  const noise = Buffer.from(Array.from({ length: 64 * 48 * 4 }, (_, i) => (i * 2654435761) >>> 24));
  const source = () => sharp(noise, { raw: { width: 64, height: 48, channels: 4 } });
  it.each<[string, () => Promise<Buffer>]>([
    ["red, green and blue", () => source().removeAlpha().png({ adaptiveFiltering: true }).toBuffer()],
    ["grey", () => source().removeAlpha().greyscale().png({ adaptiveFiltering: true }).toBuffer()],
    ["one filter", () => source().removeAlpha().png({ adaptiveFiltering: false }).toBuffer()],
    ["red, green, blue and a see-through part", () => source().png({ adaptiveFiltering: true }).toBuffer()],
  ])("%s", async (_name, make) => {
    const png = await make();
    const image = readPageImage(png);
    if (typeof image === "string") throw new Error(image);
    const { data } = await sharp(png).flatten({ background: "white" }).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
    expect([image.width, image.height]).toEqual([64, 48]);
    for (let i = 0; i < 64 * 48; i++) {
      const [r, g, b] = [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
      expect(Math.abs(image.grey[i] - (r * 299 + g * 587 + b * 114) / 1000)).toBeLessThanOrEqual(2);
    }
  });

  /** The lines of a file with one filter for each line, as the PNG standard defines them: the difference from a guess. */
  const filtered = (bytes: Uint8Array, stride: number, parts: number, filterOf: (y: number) => number): Uint8Array => {
    const height = bytes.length / stride;
    const at = (x: number, y: number) => (x < 0 || y < 0 ? 0 : bytes[y * stride + x]);
    const guess = (filter: number, left: number, above: number, corner: number): number => {
      const near = [left, above, corner].map((n) => Math.abs(left + above - corner - n));
      return [0, left, above, Math.floor((left + above) / 2), [left, above, corner][near.indexOf(Math.min(...near))]][filter];
    };
    return Uint8Array.from(Array.from({ length: height }, (_, y) => [
      filterOf(y), ...Array.from({ length: stride }, (_x, x) => at(x, y) - guess(filterOf(y), at(x - parts, y), at(x, y - 1), at(x - parts, y - 1))),
    ]).flat());
  };
  it.each([1, 3, 4].flatMap((parts) => [0, 1, 2, 3, 4].map((filter): [number, number] => [parts, filter])))("%i parts a pixel, filter %i on the first line and on each second one", async (parts, filter) => {
    const [width, height] = [13, 10];
    const bytes = Uint8Array.from({ length: width * height * parts }, (_, i) => (parts === 4 && i % 4 === 3 ? 255 : (i * 2654435761) >>> 24));
    const png = pngFile(width, height, { 1: 0, 3: 2, 4: 6 }[parts] ?? 0, filtered(bytes, width * parts, parts, (y) => (y % 2 === 0 ? filter : 4 - filter)));
    const other = await sharp(png).removeAlpha().toColourspace("srgb").raw().toBuffer();
    const image = readPageImage(png);
    if (typeof image === "string") throw new Error(image);
    const wanted = Array.from({ length: width * height }, (_, i) => Math.floor((other[3 * i] * 299 + other[3 * i + 1] * 587 + other[3 * i + 2] * 114) / 1000));
    expect([...image.grey]).toEqual(wanted);
  });
});
