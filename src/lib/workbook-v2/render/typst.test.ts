import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isPrintable, type PageModel } from "../contract";
import { checkPositions, checkTexts } from "../checks/positions";
import { darkest, isGrey, qrText, readImage } from "../testing/images";
import { characterCodes } from "../testing/glyphs";
import { goodPages } from "../testing/sample";
import { skipTypstTests, testAssets, testFiles, typstMode } from "../testing/typst";
import { PINS } from "./pins";
import { openRenderer, projectAssets, type RenderAssets } from "./typst";

describe("the tests that need Typst", () => {
  it.each([
    [{ installed: true, ci: true }, "run"],
    [{ installed: true, ci: false }, "run"],
    [{ installed: false, ci: false }, "skip"],
    [{ installed: false, ci: true }, "fail"],
  ] as const)("%o: %s", (found, mode) => expect(typstMode(found)).toBe(mode));
});

describe("the drawing file", () => {
  it("holds no position, size or colour of its own", () => {
    const source = readFileSync(testFiles().template, "utf8").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    expect(source.match(/\d+(\.\d+)?\s*(pt|mm|cm|in|em|%|fr|deg)\b|\d+(\.\d+)?%/g)?.filter((length) => length !== "1pt" && length !== "0pt") ?? []).toEqual([]);
    expect(source).not.toMatch(/rgb\(|cmyk\(|luma\(|@preview|\bv\(|\bh\(|\bgrid\(|\btable\(/);
  });
});

describe("the fonts", () => {
  it("hold every character that a bank file may print", () => {
    const printable = Array.from({ length: 0x10000 }, (_, code) => code).filter((code) => isPrintable(String.fromCharCode(code)));
    expect(printable.length).toBeGreaterThan(95);
    for (const file of Object.keys(PINS.fonts)) {
      const codes = characterCodes(readFileSync(join(testFiles().fontsDir, file)));
      expect(printable.filter((code) => !codes.has(code)).map((code) => String.fromCharCode(code))).toEqual([]);
    }
  });
});

describe("a computer that Typst is not pinned for", () => {
  it("is refused", () => {
    expect(() => projectAssets("/repo", "/home", "sunos", "x64")).toThrow("The workbook engine has no pinned Typst for sunos x64.");
  });
});

describe.skipIf(skipTypstTests())("with the real Typst", () => {
  let folder = "";
  const assets = (): RenderAssets => testAssets();
  const inFolder = (name: string) => join(folder, name);
  beforeAll(() => { folder = mkdtempSync(join(tmpdir(), "workbook-v2-test-")); });
  afterAll(() => rmSync(folder, { recursive: true, force: true }));

  const template = (name: string, change: (source: string) => string): RenderAssets => {
    const file = inFolder(name);
    const source = readFileSync(assets().template, "utf8");
    const changed = change(source);
    expect(changed).not.toBe(source);
    writeFileSync(file, changed);
    return { ...assets(), template: file };
  };
  const renderWith = async (a: RenderAssets, pages: PageModel[] = goodPages(), pins = PINS) => (await openRenderer(a, pins)).render(pages);

  describe("the pages of the example sheet", () => {
    it("come out as one PDF and one image a page, with every rectangle where the model puts it", async () => {
      const pages = goodPages();
      const out = await renderWith(assets(), pages);
      expect(Buffer.from(out.pdf).subarray(0, 5).toString()).toBe("%PDF-");
      expect(out.images).toHaveLength(2);
      expect(out.positions).toHaveLength(pages[0].regions.length + pages[1].regions.length);
      expect(checkPositions(pages, out.positions)).toEqual([]);
      expect(checkTexts(pages, out.texts)).toEqual([]);
    });

    it("are black on white, at 150 pixels an inch, and each QR code reads as its own page's text", async () => {
      const pages = goodPages();
      const out = await renderWith(assets(), pages);
      const images = await Promise.all(out.images.map(readImage));
      expect(images.map((i) => [i.width, i.height])).toEqual([[1275, 1650], [1275, 1650]]);
      expect(images.map(isGrey)).toEqual([true, true]);
      expect(images.map(qrText)).toEqual(pages.map((p) => p.qr));
    });

    it("have ink on the lines of each answer area and scan mark, and none inside an answer area, a reach, a work area or the edges", async () => {
      const pages = goodPages();
      const out = await renderWith(assets(), pages);
      for (const [i, page] of pages.entries()) {
        const image = await readImage(out.images[i]);
        const spine = page.side === "front" ? { x: 0, y: 0, w: 89, h: 792 } : { x: 523, y: 0, w: 89, h: 792 };
        const outer = page.side === "front" ? { x: 577, y: 0, w: 35, h: 792 } : { x: 0, y: 0, w: 35, h: 792 };
        for (const edge of [spine, outer, { x: 0, y: 0, w: 612, h: 35 }, { x: 0, y: 757, w: 612, h: 35 }]) expect(darkest(image, edge)).toBe(255);
        for (const { role, rect } of page.regions) {
          if (role === "answer") {
            expect(darkest(image, { x: rect.x - 1, y: rect.y + 10, w: 2, h: 20 })).toBeLessThan(150);
            expect(darkest(image, { x: rect.x + 10, y: rect.y + rect.h - 1, w: 40, h: 2 })).toBeLessThan(150);
            expect(darkest(image, { x: rect.x + 2, y: rect.y + 2, w: rect.w - 4, h: rect.h - 4 })).toBe(255);
          }
          if (role === "reach") expect(darkest(image, { ...rect, w: 18 })).toBe(255);
          if (role === "work") expect(darkest(image, rect)).toBe(255);
          if (role === "scan-mark") expect(darkest(image, rect)).toBe(0);
        }
      }
    });
  });

  describe("stops when", () => {
    it.each<[string, () => Promise<unknown>, RegExp]>([
      ["the program is not there", () => renderWith({ ...assets(), program: inFolder("nothing") }), /Typst 0\.15\.1 is not at .*nothing.*npm run typst:install/],
      ["the program is another one", () => { writeFileSync(inFolder("other"), "#!/bin/sh\necho typst 0.14.2\n", { mode: 0o755 }); return renderWith({ ...assets(), program: inFolder("other") }); }, /is not the pinned Typst 0\.15\.1/],
      ["the program reports another version", () => renderWith(assets(), goodPages(), { ...PINS, version: "0.15.2" }), /Typst reported: [^]*expected Typst 0\.15\.2/],
      ["a font is not there", () => { cpSync(assets().fontsDir, inFolder("fewer"), { recursive: true }); rmSync(inFolder("fewer/Geist-SemiBold.ttf")); return renderWith({ ...assets(), fontsDir: inFolder("fewer") }); }, /The font Geist-SemiBold\.ttf is not in /],
      ["a font has other bytes", () => { cpSync(assets().fontsDir, inFolder("changed"), { recursive: true }); writeFileSync(inFolder("changed/Geist-Regular.ttf"), readFileSync(join(assets().fontsDir, "Geist-SemiBold.ttf"))); return renderWith({ ...assets(), fontsDir: inFolder("changed") }); }, /The font Geist-Regular\.ttf is not the pinned file/],
      ["there is a font that is not pinned", () => { cpSync(assets().fontsDir, inFolder("more"), { recursive: true }); cpSync(join(assets().fontsDir, "Geist-Regular.ttf"), inFolder("more/Extra.ttf")); return renderWith({ ...assets(), fontsDir: inFolder("more") }); }, /Extra\.ttf is not a pinned font/],
      ["the drawing asks for a font of the computer", () => renderWith(template("system.typ", (s) => s.replace('"Geist"', '"Helvetica"'))), /Typst reported: [^]*unknown font family/],
      ["the drawing asks for a font inside Typst", () => renderWith(template("embedded.typ", (s) => s.replace('"Geist"', '"Libertinus Serif"'))), /Typst reported: [^]*unknown font family/],
      ["Typst gives a warning", () => renderWith(template("warning.typ", (s) => `${s}\n#text(font: ("Geist", "Nowhere"))[]`)), /Typst reported: [^]*warning/],
      ["the drawing has an error", () => renderWith(template("error.typ", (s) => `${s}\n#nothing-here`)), /Typst reported: [^]*error/],
      ["ink has a colour that is not black", () => { const pages = goodPages(); const ink = pages[0].regions.find((r) => r.role === "answer")?.ink[0]; if (ink) ink.color = "red"; return renderWith(assets(), pages); }, /Typst reported: [^]*error/],
      ["the drawing makes a page more than the book", () => renderWith(template("more.typ", (s) => `${s}\n#pagebreak()\nmore`)), /Typst drew 3 pages and the book has 2/],
      ["there is no page", () => renderWith(assets(), []), /There is no page to draw/],
    ])("%s", async (_name, render, message) => {
      await expect(render()).rejects.toThrow(message);
    });
  });

  it.each<[string, (s: string) => string]>([
    ["moves a rectangle", (s) => s.replace("dx: points(rect.x - from.x)", "dx: points(rect.x - from.x + 1)")],
    ["makes a rectangle wider", (s) => s.replace("width: points(rect.w)", "width: points(rect.w + 1)")],
    ["skips a rectangle", (s) => s.replace("for region in sheet.regions", "for region in sheet.regions.slice(1)")],
  ])("a drawing file that %s does not match the model", async (_name, change) => {
    const pages = goodPages();
    const out = await renderWith(template("moved.typ", change), pages);
    expect(checkPositions(pages, out.positions)).not.toEqual([]);
  });

  it.each<[string, (s: string) => string]>([
    ["adds a digit", (s) => s.replace("ink.text),", 'ink.text + "1"),')],
    ["leaves text out", (s) => s.replace("ink.text),", "[]),")],
    ["prints text of its own", (s) => s.replace("report(region.id)", "report(region.id)\n      place(origin)[more]")],
    ["puts text in another place", (s) => s.replace("dy: points(rect.y - from.y)", "dy: points(rect.y - from.y + 1)")],
  ])("a drawing file that %s does not match the model", async (_name, change) => {
    const pages = goodPages();
    const out = await renderWith(template("text.typ", change), pages);
    expect(checkTexts(pages, out.texts)).not.toEqual([]);
  });

  it("writes nothing about the child or the time into the PDF", async () => {
    const text = Buffer.from((await renderWith(assets())).pdf).toString("latin1");
    expect(text).not.toMatch(/example-child|CreationDate|ModDate|20\d\d-\d\d-\d\dT/);
  });
});
