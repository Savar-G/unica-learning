import { execFileSync } from "node:child_process";
import { chmodSync, constants, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isPrintable, mathToken, wordToken, type Ink, type PageModel, type Rect, type Region } from "../contract";
import { checkImages } from "../checks/images";
import { checkPositions } from "../checks/positions";
import { DIGIT_KERNING } from "../build/row-texts";
import { sha256 } from "../hash";
import { qrSquares } from "../layout/qr";
import { checkFit, checkPdf, checkTexts } from "../testing/drawn-checks";
import { darkest, isGrey, qrText, readImage } from "../testing/images";
import { characterCodes } from "../testing/glyphs";
import { goodPages, smallPages } from "../testing/sample";
import { quickAssets, quickRenderer, skipTypstTests, testAssets, testFiles, typstMode } from "../testing/typst";
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
  it("are the pinned files and no other, with their licence", () => {
    expect(readdirSync(testFiles().fontsDir, { recursive: true }).map(String).sort()).toEqual([...Object.keys(PINS.fonts), "OFL.txt"].sort());
  });

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

describe.skipIf(skipTypstTests()).concurrent("with the real Typst", () => {
  let folder = "";
  const assets = (): RenderAssets => testAssets();
  const inFolder = (name: string) => join(folder, name);
  beforeAll(() => { folder = mkdtempSync(join(tmpdir(), "workbook-v2-test-")); });
  afterAll(() => rmSync(folder, { recursive: true, force: true }));

  const drawingWith = (a: RenderAssets) => quickRenderer(folder, { ...a, program: assets().program });
  /** Only what the drawing reports, for the tests that look at nothing else. */
  const reportDrawing = async (a: RenderAssets, pages: PageModel[]) => (await drawingWith(a)).report(pages);
  const renderDrawing = async (a: RenderAssets, pages: PageModel[] = smallPages()) => (await drawingWith(a)).render(pages);

  let templates = 0;
  const template = (name: string, change: (source: string) => string, from = assets()): RenderAssets => {
    const file = inFolder(`${templates++}-${name}`);
    const source = readFileSync(from.template, "utf8");
    const changed = change(source);
    expect(changed).not.toBe(source);
    writeFileSync(file, changed);
    return { ...from, template: file };
  };
  const renderWith = async (a: RenderAssets, pages: PageModel[] = smallPages(), pins = PINS) => (await openRenderer(a, pins)).render(pages);
  /** One renderer of the real program for the example, and one for the tests that do not look at the program. */
  let real: ReturnType<typeof openRenderer> | undefined;
  const realRenderer = () => real ??= openRenderer(assets());
  let usual: ReturnType<typeof openRenderer> | undefined;
  const usualRenderer = () => usual ??= quickRenderer(folder);
  const quick = () => quickAssets(folder);

  /** The example pages and their drawing, made one time for all the tests that only look at it. */
  let drawn: ReturnType<typeof renderWith> | undefined;
  let drawnImages: Promise<Awaited<ReturnType<typeof readImage>>[]> | undefined;
  const exampleImages = async () => { const { pages, out } = await example(); return { pages, images: await (drawnImages ??= Promise.all(out.images.map(readImage))) }; };
  const example = async () => ({ pages: goodPages(), out: await (drawn ??= realRenderer().then((renderer) => renderer.render(goodPages()))) });

  /** The same for small pages, for the tests that compare drawings. */
  let smallDrawn: ReturnType<typeof renderWith> | undefined;
  const smallExample = async () => ({ pages: smallPages(), out: await (smallDrawn ??= usualRenderer().then((renderer) => renderer.render(smallPages()))) });

  describe("the pages of the example sheet", () => {
    it("come out as one PDF and one image a page, with every rectangle where the model puts it", async () => {
      const { pages, out } = await example();
      expect(Buffer.from(out.pdf).subarray(0, 5).toString()).toBe("%PDF-");
      expect(out.images).toHaveLength(2);
      expect(out.positions).toHaveLength(pages[0].regions.length + pages[1].regions.length);
      expect(checkPositions(pages, out.positions)).toEqual([]);
      expect(checkTexts(pages, out.texts)).toEqual([]);
      expect(checkFit(pages, out.texts)).toEqual([]);
      expect(checkImages(pages, out.images)).toEqual([]);
      expect(checkPdf(pages, out.texts, out.pdf)).toEqual([]);
    });

    it("are black on white, at 150 pixels an inch, and each QR code reads as its own page's text", async () => {
      const { pages, images } = await exampleImages();
      expect(images.map((i) => [i.width, i.height])).toEqual([[1275, 1650], [1275, 1650]]);
      expect(images.map(isGrey)).toEqual([true, true]);
      expect(images.map(qrText)).toEqual(pages.map((p) => p.qr));
    });

    it("have ink on the lines of each answer area and scan mark, and none inside an answer area, a reach, a work area or the edges", async () => {
      const { pages, images } = await exampleImages();
      for (const [i, page] of pages.entries()) {
        const image = images[i];
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
    /** A renderer whose pinned program is a small file: the checks of a file do not look at what it does. */
    const renderAs = (name: string, mode: number) => {
      writeFileSync(inFolder(name), "#!/bin/sh\nexit 1\n", { mode });
      const pins = { ...PINS, targets: { ...PINS.targets, [assets().target]: { archiveSha256: "0".repeat(64), programSha256: sha256(readFileSync(inFolder(name))) } } };
      return openRenderer({ ...assets(), program: inFolder(name) }, pins);
    };
    it.each<[string, () => Promise<unknown>, RegExp]>([
      ["the program is not there", () => renderWith({ ...assets(), program: inFolder("nothing") }), /Typst 0\.15\.1 is not at .*nothing.*npm run typst:install/],
      ["the program is another one", () => { writeFileSync(inFolder("other"), "#!/bin/sh\necho typst 0.14.2\n", { mode: 0o755 }); return renderWith({ ...assets(), program: inFolder("other") }); }, /is not the pinned Typst 0\.15\.1/],
      ["the program reports another version", () => renderWith(assets(), smallPages(), { ...PINS, version: "0.15.2" }), /Typst reported: [^]*expected Typst 0\.15\.2/],
      ["a font is not there", () => { cpSync(assets().fontsDir, inFolder("fewer"), { recursive: true }); rmSync(inFolder("fewer/Geist-SemiBold.ttf")); return renderDrawing({ ...assets(), fontsDir: inFolder("fewer") }); }, /The font Geist-SemiBold\.ttf is not in /],
      ["a font has other bytes", () => { cpSync(assets().fontsDir, inFolder("changed"), { recursive: true }); writeFileSync(inFolder("changed/Geist-Regular.ttf"), readFileSync(join(assets().fontsDir, "Geist-SemiBold.ttf"))); return renderDrawing({ ...assets(), fontsDir: inFolder("changed") }); }, /The font Geist-Regular\.ttf is not the pinned file/],
      ["there is no font folder", () => renderDrawing({ ...assets(), fontsDir: inFolder("nothing") }), /The font Geist-Regular\.ttf is not in .*nothing/],
      ["there is no drawing file", () => renderDrawing({ ...assets(), template: inFolder("nothing.typ") }), /The drawing file .*nothing\.typ is not there/],
      ["the program may not run", async () => (await renderAs("still", 0o644)).render(smallPages()), /still may not run\. Run "npm run typst:install"/],
      ["the program changes after the check", async () => { const renderer = await renderAs("later", 0o755); writeFileSync(inFolder("later"), "#!/bin/sh\n", { mode: 0o755 }); return renderer.render(smallPages()); }, /later is not the pinned Typst/],
      ["the drawing asks for a font of the computer", () => renderDrawing(template("system.typ", (s) => s.replace('"Geist"', '"Helvetica"'))), /Typst reported: [^]*unknown font family/],
      ["the drawing asks for a font inside Typst", () => renderDrawing(template("embedded.typ", (s) => s.replace('"Geist"', '"Libertinus Serif"'))), /Typst reported: [^]*unknown font family/],
      ["Typst gives a warning", () => renderDrawing(template("warning.typ", (s) => `${s}\n#text(font: ("Geist", "Nowhere"))[]`)), /Typst reported: [^]*warning/],
      ["the drawing has an error", () => renderDrawing(template("error.typ", (s) => `${s}\n#nothing-here`)), /Typst reported: [^]*error/],
      ["ink has a colour that is not black", () => { const pages = smallPages(); const ink = pages[0].regions.find((r) => r.role === "answer")?.ink[0]; if (ink) ink.color = "red"; return renderDrawing(assets(), pages); }, /Typst reported: [^]*error/],
      ["the drawing makes a page more than the book", () => renderDrawing(template("more.typ", (s) => `${s}\n#pagebreak()\nmore`)), /Typst drew 3 pages and the book has 2/],
      ["there is no page", () => renderWith(assets(), []), /There is no page to draw/],
    ])("%s", async (_name, render, message) => {
      await expect(render()).rejects.toThrow(message);
    });
  });

  describe("draws with the checked files only", () => {
    const same = async (a: RenderAssets, change: () => unknown = () => {}) => {
      const [plain, other] = [await usualRenderer(), await openRenderer(a, quick().pins)];
      change();
      const { pages, out: one } = await smallExample();
      const two = await other.render(pages);
      expect(other.identity).toEqual(plain.identity);
      expect(Buffer.compare(one.pdf, two.pdf)).toBe(0);
      expect(one.images.map((image, i) => Buffer.compare(image, two.images[i]))).toEqual([0, 0]);
    };
    /** A copy of the fonts and the drawing file that a test can change. */
    const copied = (name: string): RenderAssets => {
      mkdirSync(inFolder(name));
      cpSync(assets().fontsDir, inFolder(`${name}/fonts`), { recursive: true });
      cpSync(assets().template, inFolder(`${name}/page.typ`));
      return { ...quick().assets, fontsDir: inFolder(`${name}/fonts`), template: inFolder(`${name}/page.typ`) };
    };
    const bold = () => readFileSync(join(assets().fontsDir, "Geist-SemiBold.ttf"));
    const addFonts = (a: RenderAssets) => {
      mkdirSync(join(a.fontsDir, "nested"));
      writeFileSync(join(a.fontsDir, "nested", "Geist-Regular.ttf"), bold());
      writeFileSync(join(a.fontsDir, "Extra.ttf"), bold());
    };

    it("says what they are: the hash of the program of this computer, of the drawing file and of each font", async () => {
      const { identity } = await realRenderer();
      expect(identity).toEqual({
        typst: "0.15.1",
        program: sha256(readFileSync(assets().program)),
        template: sha256(readFileSync(assets().template)),
        fonts: { "Geist-Regular.ttf": sha256(readFileSync(join(assets().fontsDir, "Geist-Regular.ttf"))), "Geist-SemiBold.ttf": sha256(bold()) },
      });
      expect((await drawingWith(template("identity.typ", (s) => `${s}\n`))).identity.template).not.toBe(identity.template);
    });

    it("whatever other fonts are in or under the font folder, also when each path is relative", async () => {
      const a = copied("extra");
      addFonts(a);
      const here = (path: string) => relative(process.cwd(), path);
      await same({ ...a, program: here(a.program), fontsDir: here(a.fontsDir), template: here(a.template) });
    });

    it("whatever changes in those files after the check", async () => {
      const a = copied("after");
      await same(a, () => {
        addFonts(a);
        writeFileSync(join(a.fontsDir, "Geist-Regular.ttf"), bold());
        rmSync(join(a.fontsDir, "Geist-SemiBold.ttf"));
        writeFileSync(a.template, "#panic()");
      });
    });
  });

  // Each drawing has two faults that do not touch each other, because a drawing costs three runs of Typst.
  describe("a drawing file that reports more than it prints does not pass the image check", () => {
    type Fault = [name: string, change: (s: string) => string, problem: RegExp];
    const drawnProblems = async (faults: readonly Fault[], pages: PageModel[] = smallPages()) => {
      let a = assets();
      for (const [name, change] of faults) a = template(`${name.replaceAll(" ", "-")}.typ`, change, a);
      const out = await renderDrawing(a, pages);
      expect(checkPositions(pages, out.positions)).toEqual([]);
      expect(checkTexts(pages, out.texts)).toEqual([]);
      // The PDF is drawn by the same file, and its own check stops it too.
      expect(checkPdf(pages, out.texts, out.pdf)).toHaveLength(pages.length);
      return checkImages(pages, out.images).join("\n");
    };
    const PAIRS: readonly { pages?: () => PageModel[]; faults: readonly [Fault, Fault] }[] = [
      {
        // Full example pages so ink checks on late questions of the back page (question-8) are exercised end to end.
        pages: goodPages,
        faults: [
          ["hides the text", (s) => s.replace("else { it }", "else { hide(it) }"), /^Page 381: "heading" must print "3-20 · Multiplying 2 digits by 1 digit" and the image has no ink there\.$[^]*^Page 382: "question-8" must print/m],
          ["prints the QR code of the first page on each page", (s) => s.replace("for ink in region.ink {", 'for ink in if region.role == "qr" { model.pages.first().regions.last().ink.map(ink => { ink.rect.x += region.rect.x - model.pages.first().regions.last().rect.x; ink }) } else { region.ink } {'), /^Page 382: the QR code reads "https:\/\/unicalearning\.com\/tutor\/p\/example-front-381" and must read "https:\/\/unicalearning\.com\/tutor\/p\/example-back-382"\.$/m],
        ],
      },
      {
        faults: [
          ["hides one text", (s) => s.replace("else { it }", 'else if it.text == "×" { hide(it) } else { it }'), /^Page 381: "question-1" must print "×" and the image has no ink there\.$/m],
          ["prints the QR code a second time", (s) => s.replace("      if reports { report(region.id) }", '      if reports { report(region.id) }\n      if region.role == "qr" { place(origin, dx: -points(region.rect.w) * 3, dy: -points(region.rect.h), block(width: points(region.rect.w), height: points(region.rect.h), for ink in region.ink { put(ink.rect, region.rect, drawers.at(ink.kind)(ink)) })) }'), /^Page 381: the image has a second QR code, which reads "https:\/\/unicalearning\.com\/tutor\/p\/example-front-381"\.$/m],
        ],
      },
      {
        faults: [
          ["prints white text", (s) => s.replace("fill: colors.at(ink.color), ink.text", "fill: white, ink.text"), /"label-1" must print "1"/],
          ["leaves out the QR squares", (s) => s.replace("for ink in region.ink", 'for ink in if region.role == "qr" { () } else { region.ink }'), /^Page 381: the image has no QR code that can be read in its box\.$[^]*^Page 382: the image has no QR code/m],
        ],
      },
      {
        faults: [
          ["leaves out all filled squares", (s) => s.replace("fill: colors.at(ink.color), stroke: none", "fill: none, stroke: none"), /the image has no ink for a part of "mark-tl"/],
          ["leaves out the outlines", (s) => s.replace("points(ink.width) + colors.at(ink.color)", "none"), /the image has no ink for a part of "answer-1"/],
        ],
      },
    ];
    for (const { pages, faults } of PAIRS) {
      let problems: Promise<string> | undefined;
      const all = () => problems ??= drawnProblems(faults, pages ? pages() : smallPages());
      it.each(faults)("%s", async (_name, _change, problem) => { expect(await all()).toMatch(problem); });
    }
  });

  it("prints ink for every character that may be printed, in each weight", async () => {
    const [page] = goodPages();
    const characters = Array.from({ length: 0x10000 }, (_, code) => String.fromCharCode(code)).filter((c) => isPrintable(c) && c !== " ");
    const ink = [400, 600].flatMap((weight, w) => characters.map((c, i): Ink =>
      ({ kind: "text", rect: { x: 100 + (i % 12) * 30, y: 100 + (Math.floor(i / 12) + w * 10) * 28, w: 24, h: 24 }, color: "black", text: c, size: 14, weight, align: "center" })));
    const all = [{ ...page, regions: page.regions.filter((r) => r.role === "heading" || r.role === "qr").map((r) => (r.role === "heading" ? { ...r, rect: { x: 90, y: 100, w: 486, h: 560 }, ink } : r)) }];
    const out = await (await usualRenderer()).render(all);
    expect(checkTexts(all, out.texts)).toEqual([]);
    expect(checkFit(all, out.texts)).toEqual([]);
    expect(checkImages(all, out.images)).toEqual([]);
    expect(checkPdf(all, out.texts, out.pdf)).toEqual([]);
  });

  it("draws any text that may be printed where it reports it, with no move of a letter but the kerning of its fonts", async () => {
    const [page] = goodPages();
    const printable = Array.from({ length: 0x3000 }, (_, code) => String.fromCharCode(code)).filter(isPrintable);
    const region = (inks: Ink[], role: Region["role"], i: number): Region => ({ id: `${page.id}/texts-${i}`, role, rect: { x: 0, y: 0, w: 1200, h: 1320 }, item: null, part: null, ink: inks });
    // Any text in any size, weight, place and role, such as one that ends in points or a dash, which some typesetters hang over the edge.
    const word = fc.array(fc.constantFrom(...printable, ".", ".", "-", "–", "“", "”", "’"), { minLength: 1, maxLength: 16 }).map((c) => c.join("").trim()).filter((text) => text !== "");
    const any = fc.record({ text: word, size: fc.constantFrom(10, 11, 12, 15, 16, 18, 20, 22, 24), weight: fc.constantFrom(400, 600), align: fc.constantFrom("left" as const, "center" as const, "right" as const), role: fc.constantFrom("heading" as const, "instruction" as const, "footer" as const, "label" as const, "question" as const) });
    const asked = [...["....", "a.", "one-", "“to”", "‘J’", "A–"].flatMap((text) => (["left", "center", "right"] as const).map((align) => ({ text, size: 18, weight: 600, align, role: "footer" as const }))), ...fc.sample(any, { numRuns: 120, seed: 137 })];
    const texts = asked.map(({ role, ...text }, i) => region([{ kind: "text", color: "black", rect: { x: (i % 3) * 400, y: Math.floor(i / 3) * 28 + 10, w: 390.3, h: 26 }, ...text }], role, i));
    // Every pair of characters, both ways round: "a" beside each later character.
    const pairs = [400, 600].map((weight) => region(printable.flatMap((a, i): Ink[] => (a === " " ? [] : [{ kind: "text", color: "black", size: 6, weight, align: "left", rect: { x: 10, y: 10 * i, w: 1100, h: 9 }, text: printable.slice(i).concat(" ").reduce((text, b) => `${text}${b}${a}`, a) }])), "heading", weight));
    const digits = [..."0123456789"];
    const numbers = [400, 600].map((weight) => region(digits.flatMap((a, i) => ["", ...digits].map((b, j): Ink => ({ kind: "text", color: "black", size: 10, weight, align: "left", rect: { x: 10 + 30 * j, y: 20 * i, w: 29, h: 19 }, text: a + b }))), "question", weight));
    const pages = [texts, ...pairs.map((r) => [r]), ...numbers.map((r) => [r])].map((regions, i): PageModel => ({ ...page, page: i + 1, size: i < 3 ? { w: 1200, h: 1320 } : { w: 360, h: 220 }, regions }));
    const out = await renderDrawing(assets(), pages);
    expect([checkTexts(pages, out.texts), checkFit(pages, out.texts), checkPdf(pages, out.texts, out.pdf)]).toEqual([[], [], []]);
    for (const sheet of [4, 5]) {
      const width = new Map(out.texts.filter((t) => t.sheet === sheet).map((t) => [t.text, t.natural.w]));
      const of = (text: string) => width.get(text) ?? Number.NaN;
      const widest = Math.max(...digits.flatMap((a) => digits.map((b) => of(a + b) - of(a) - of(b))));
      expect(widest / 10).toBeLessThanOrEqual(DIGIT_KERNING);
      expect(widest / 10).toBeGreaterThan(DIGIT_KERNING - 0.002);
    }
  });

  describe("the fit of text", () => {
    /** A page of invented texts and nothing else: a name and a list of inks for each rectangle. */
    const invented = (inks: Record<string, Ink>): PageModel[] => {
      const [page] = goodPages();
      return [{ ...page, regions: Object.entries(inks).map(([name, ink]): Region => ({ id: `${page.id}/${name}`, role: "question", rect: ink.rect, item: null, part: null, ink: [ink] })) }];
    };
    const draw = async (pages: PageModel[]) => reportDrawing(assets(), pages);
    const box = (row: number, w: number, h: number, x = 100): Rect => ({ x, y: 100 + row * 40, w, h });
    const line = (text: string, rect: Rect, align: "left" | "center" | "right", size = 18, weight = 400): Ink => ({ kind: "text", rect, color: "black", text, size, weight, align });

    it("on one line is measured, and what does not fit is named and is not made to fit", async () => {
      const pages = invented({
        "fits-left": line("100", box(0, 31, 28), "left"), "fits-center": line("100", box(0, 31, 28, 200), "center"), "fits-right": line("100", box(0, 31, 28, 300), "right"),
        "wide-left": line("100", box(1, 30, 28), "left"), "wide-center": line("100", box(1, 30, 28, 200), "center"), "wide-right": line("100", box(1, 30, 28, 300), "right"),
        "wide-words": line("Two words and more", box(2, 100, 28), "left", 15), "wide-hyphens": line("one-two-three-four", box(2, 80, 28, 300), "center", 15),
        "high": line("8", box(3, 30, 12), "center"), "deep": line("gypq", box(3, 100, 14, 200), "left"), "not-deep": line("8888", box(3, 100, 14, 320), "left"),
        "tall": line("2", box(5, 30, 13), "center"), "bold": line("100", box(4, 31, 28), "left", 18, 600),
      });
      const out = await draw(pages);
      expect(checkTexts(pages, out.texts)).toEqual([]);
      expect(checkFit(pages, out.texts)).toEqual([
        ...["left", "center", "right"].map((side) => `Page 381: the text "100" of "wide-${side}" is 30.78 points wide and its place is 30.`),
        'Page 381: the text "Two words and more" of "wide-words" is 141.85 points wide and its place is 100.',
        'Page 381: the text "one-two-three-four" of "wide-hyphens" is 134.16 points wide and its place is 80.',
        'Page 381: the text "8" of "high" is 13.36 points high and its place is 12.',
        'Page 381: the text "gypq" of "deep" is 18.61 points high and its place is 14.',
        'Page 381: the text "2" of "tall" is 13.36 points high and its place is 13.',
        'Page 381: the text "100" of "bold" is 32.2 points wide and its place is 31.',
      ]);
    });

    const flow = (tokens: Extract<Ink, { kind: "flow" }>["tokens"], rect: Rect): Ink => ({ kind: "flow", rect, color: "black", tokens, size: 12, weight: 400, leading: 5 });
    const words = (text: string) => text.split(" ").map(wordToken);

    it("in a flow wraps between tokens and after hyphens and nowhere else, and what does not fit is named", async () => {
      const STORY = [...words("Mia has twenty-one hand-woven mats. She sells"), mathToken("21 - 5 = 16"), ...words("mats and/or rugs, 4–6 each day.")];
      const pages = invented({
        "story": flow(STORY, { x: 100, y: 100, w: 100, h: 150 }),
        "low": flow(STORY, { x: 300, y: 100, w: 100, h: 100 }),
        "word": flow(words("an extraordinarily long word"), { x: 100, y: 300, w: 60, h: 120 }),
        "part": flow(words("a well-extraordinarily made mat"), { x: 200, y: 300, w: 60, h: 120 }),
        "math": flow([wordToken("so"), mathToken("10 + 20 + 30"), wordToken("is")], { x: 300, y: 300, w: 60, h: 120 }),
      });
      const out = await draw(pages);
      expect(checkTexts(pages, out.texts)).toEqual([]);
      const problems = checkFit(pages, out.texts);
      expect(problems.filter((p) => p.includes('"story"'))).toEqual([]);
      expect(problems.filter((p) => p.includes('"low"'))).toEqual(["each", "day."].map((token) => `Page 381: the token "${token}" of "low" is below its place.`));
      const told = problems.join("\n");
      expect(told).toMatch(/^Page 381: the token "extraordinarily" of "word" is 78\.38 points wide and its place is 60\.$/m);
      expect(told).toMatch(/^Page 381: the token "well-extraordinarily" of "part" is 78\.38 points wide in the part "extraordinarily" and its place is 60\.$/m);
      expect(told).toMatch(/^Page 381: the token "10 \+ 20 \+ 30" of "math" is \d+\.\d+ points wide and its place is 60\.$/m);
      const own = out.texts.slice(0, STORY.flatMap((t) => t.pieces).length);
      const lines = [...new Set(own.map((t) => t.start.y))].map((y) => own.filter((t) => t.start.y === y).map((t) => t.text).join("|"));
      expect(lines).toEqual(["Mia|has|twenty-", "one|hand-|woven", "mats.|She|sells", "21 - 5 = 16|mats", "and/or|rugs,|4–6", "each|day."]);
    });

    it("in a flow that fits passes the checks of the image and the PDF", async () => {
      const [page] = goodPages();
      const ink = flow([...words("Mia has twenty-one hand-woven mats."), mathToken("21 - 5 = 16")], { x: 100, y: 300, w: 110, h: 100 });
      const pages = [{ ...page, regions: [...page.regions.filter((r) => r.role === "qr"), { id: `${page.id}/question-1`, role: "question", rect: ink.rect, item: null, part: null, ink: [ink] } satisfies Region] }];
      const out = await renderDrawing(assets(), pages);
      expect([checkTexts(pages, out.texts), checkFit(pages, out.texts), checkImages(pages, out.images), checkPdf(pages, out.texts, out.pdf)]).toEqual([[], [], [], []]);
    });

    const TEXT = "text(size: points(ink.size), weight: ink.weight, fill: colors.at(ink.color), ink.text)";
    it.each<[string, (s: string) => string, RegExp]>([
      ["puts each text at the left", (s) => s.replace("sides.at(ink.align) + horizon", "left + horizon"), /"2" of "question-1" starts at/],
      ["puts each text at the top", (s) => s.replace("sides.at(ink.align) + horizon", "sides.at(ink.align) + top"), /of "heading" starts at/],
      ["draws smaller and lighter letters", (s) => s.replace("size: points(ink.size), weight: ink.weight", "size: points(ink.size) * 0.9, weight: 400"), /of "heading" has the size 13\.5 and the weight 400, and the model says 15 and 600/],
      ["makes each text narrower", (s) => s.replace(TEXT, `scale(x: 90%, ${TEXT})`), /"3-20 · .* was not drawn at its place/],
      ["leaves room between the letters", (s) => s.replace('lang: "en"', 'lang: "en", tracking: 0.1em'), /of "heading" is \d+\.?\d* points wide and its place is 300/],
    ])("a drawing file that %s stops", async (_name, change, problem) => {
      const pages = smallPages().slice(0, 1);
      const out = await reportDrawing(template("fit.typ", change), pages);
      expect([...checkTexts(pages, out.texts), ...checkFit(pages, out.texts)].join("\n")).toMatch(problem);
    });

    it.each<[string, (s: string) => string, RegExp, RegExp]>([
      ["moves what it prints, and not what it reports", (s) => s.replace("else { it }", "else { box(move(dx: 6 * 1pt, it)) }"), /^$/, /^Page 381: the PDF draws the text "3-20 · /],
      ["cuts what it prints", (s) => s.replace("height: points(rect.h), body)", "height: points(rect.h), clip: not reports, body)"), /^$/, /^The PDF has the drawing command "W/],
      ["prints a dark red in place of black", (s) => s.replace("(black: black)", '(black: rgb("#300000"))'), /the image has a colour that is not a grey/, /^The PDF has a colour that is not a grey\.$/],
      ["prints a dark grey in place of black", (s) => s.replace("(black: black)", '(black: luma(40))'), /the image has the grey 40, which the model does not use/, /in the grey 0\.1\d*, which the model does not use/],
      ["prints a square in each answer area", (s) => s.replace("if reports { report(region.id) }", 'if reports { report(region.id) }\n      if region.role == "answer" { place(center + horizon, rect(width: 1pt, height: 1pt, fill: luma(240))) }'), /the image has ink that the model does not have, at .* in "answer-1"/, /^Page 381: the PDF draws a fill .* and the model has an outline/],
    ])("a drawing file that %s stops", async (_name, change, imageProblem, pdfProblem) => {
      const pages = smallPages().slice(0, 1);
      const out = await renderDrawing(template("print.typ", change), pages);
      expect([checkTexts(pages, out.texts), checkFit(pages, out.texts)]).toEqual([[], []]);
      expect(checkPdf(pages, out.texts, out.pdf).join("\n")).toMatch(pdfProblem);
      if (imageProblem.source !== "^$") expect(checkImages(pages, out.images).join("\n")).toMatch(imageProblem);
    });
  });

  it("a QR text of any length that has a code can be read back from its page image", async () => {
    const [front] = smallPages();
    const box = front.regions.find((r) => r.role === "qr");
    if (!box) throw new Error("no QR code");
    const qrPage = (qr: string): PageModel[] => {
      const squares = qrSquares(box.rect, qr);
      return typeof squares === "string" ? [] : [{ ...front, qr, regions: [{ ...box, id: `qr-${qr.length}`, ink: squares }] }];
    };
    const texts = Array.from({ length: 100 }, (_, i) => `https://unicalearning.com/tutor/p/${"abcDEF0123456789-".repeat(6)}`.slice(0, i + 1));
    const longest = texts.filter((t) => qrPage(t).length > 0).at(-1) ?? "";
    expect(longest.length).toBeGreaterThan(60);
    const pages = [texts[0], texts[14], texts[40], longest].flatMap(qrPage);
    expect(pages).toHaveLength(4);
    expect(checkImages(pages, (await (await usualRenderer()).render(pages)).images)).toEqual([]);
  });

  it.each<[string, (s: string) => string]>([
    ["moves a rectangle", (s) => s.replace("dx: points(rect.x - from.x)", "dx: points(rect.x - from.x + 1)")],
    ["makes a rectangle wider", (s) => s.replace("width: points(rect.w)", "width: points(rect.w + 1)")],
    ["skips a rectangle", (s) => s.replace("for region in sheet.regions", "for region in sheet.regions.slice(1)")],
  ])("a drawing file that %s does not match the model", async (_name, change) => {
    const pages = smallPages().slice(0, 1);
    const out = await reportDrawing(template("moved.typ", change), pages);
    expect(checkPositions(pages, out.positions)).not.toEqual([]);
  });

  it.each<[string, (s: string) => string]>([
    ["adds a digit", (s) => s.replace("ink.text),", 'ink.text + "1"),')],
    ["leaves text out", (s) => s.replace("ink.text),", "[]),")],
    ["prints text of its own", (s) => s.replace("if reports { report(region.id) }", "if reports { report(region.id) }\n      place(origin)[more]")],
    ["puts text in another place", (s) => s.replace("dy: points(rect.y - from.y)", "dy: points(rect.y - from.y + 1)")],
  ])("a drawing file that %s does not match the model", async (_name, change) => {
    const pages = smallPages().slice(0, 1);
    const out = await reportDrawing(template("text.typ", change), pages);
    expect(checkTexts(pages, out.texts)).not.toEqual([]);
  });

  it("puts each pinned font into the PDF, and no other", async () => {
    const text = Buffer.from((await example()).out.pdf).toString("latin1");
    expect([...new Set([...text.matchAll(/\/[A-Z]{6}\+([\w-]+)/g)].map((m) => `${m[1]}.ttf`))].sort()).toEqual(Object.keys(PINS.fonts).sort());
  });

  it("writes nothing about the child or the time into the PDF", async () => {
    const text = Buffer.from((await example()).out.pdf).toString("latin1");
    expect(text).not.toMatch(/example-child|CreationDate|ModDate|20\d\d-\d\d-\d\dT/);
  });

  // One at a time: they change the environment and list the temp folder, which is of these tests alone.
  describe.sequential("environment isolation, read-only bundles and temp cleanup", () => {
    const usual = process.env.TMPDIR;
    beforeAll(() => {
      process.env.TMPDIR = inFolder("private-temp");
      mkdirSync(process.env.TMPDIR);
    });
    afterAll(() => {
      if (usual === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = usual;
    });
    const listTempWorkDirs = () => readdirSync(tmpdir()).filter((name) => name.startsWith("workbook-v2-"));

    it("does not leak process.env or TYPST_FONT_PATHS to Typst", async () => {
      const spyProgram = inFolder("env-spy.sh");
      writeFileSync(spyProgram, "#!/bin/sh\nenv >&2\nexit 1\n", { mode: 0o755 });
      const spyPins = { ...PINS, targets: { ...PINS.targets, [assets().target]: { archiveSha256: "0".repeat(64), programSha256: sha256(readFileSync(spyProgram)) } } };
      const extraFonts = inFolder("env-fonts");
      mkdirSync(extraFonts, { recursive: true });
      cpSync(join(assets().fontsDir, "Geist-Regular.ttf"), join(extraFonts, "Geist-Regular.ttf"));
      const prevSecret = process.env.UNICA_TEST_SECRET;
      const prevFontPaths = process.env.TYPST_FONT_PATHS;
      process.env.UNICA_TEST_SECRET = "must-not-reach-typst";
      process.env.TYPST_FONT_PATHS = extraFonts;
      try {
        let message = "";
        try {
          await renderWith({ ...assets(), program: spyProgram }, smallPages(), spyPins);
        } catch (error) {
          message = error instanceof Error ? error.message : String(error);
        }
        expect(message).toContain("NODE_ENV=production");
        expect(message).not.toContain("UNICA_TEST_SECRET");
        expect(message).not.toContain("must-not-reach-typst");
        expect(message).not.toContain("TYPST_FONT_PATHS");
        await expect(renderDrawing(template("env-font.typ", (s) => s.replace('"Geist"', '"Helvetica"')))).rejects.toThrow(/unknown font family/);
      } finally {
        if (prevSecret === undefined) delete process.env.UNICA_TEST_SECRET;
        else process.env.UNICA_TEST_SECRET = prevSecret;
        if (prevFontPaths === undefined) delete process.env.TYPST_FONT_PATHS;
        else process.env.TYPST_FONT_PATHS = prevFontPaths;
      }
    });

    it("works when the bundle folder is read-only, both with and without execute permission on the program", async () => {
      const bundle = inFolder("ro-bundle");
      const fontsDir = join(bundle, "fonts");
      const program = join(bundle, "typst");
      const tmpl = join(bundle, "page.typ");
      mkdirSync(fontsDir, { recursive: true });
      // A clone where the disk can make one: the program has 45 MB.
      cpSync(assets().program, program, { mode: constants.COPYFILE_FICLONE });
      cpSync(assets().template, tmpl);
      for (const file of Object.keys(PINS.fonts)) cpSync(join(assets().fontsDir, file), join(fontsDir, file));

      const { pages, out: baseline } = await smallExample();

      const lockReadOnly = (programMode: number) => {
        for (const file of Object.keys(PINS.fonts)) chmodSync(join(fontsDir, file), 0o444);
        chmodSync(fontsDir, 0o555);
        chmodSync(tmpl, 0o444);
        chmodSync(program, programMode);
        chmodSync(bundle, 0o555);
      };
      const unlock = () => {
        chmodSync(bundle, 0o755);
        chmodSync(fontsDir, 0o755);
        chmodSync(program, 0o755);
        chmodSync(tmpl, 0o644);
        for (const file of Object.keys(PINS.fonts)) chmodSync(join(fontsDir, file), 0o644);
      };

      try {
        // Case 1: read-only bundle where program keeps execute bit (0o555).
        lockReadOnly(0o555);
        const execOut = await renderWith({ program, target: assets().target, fontsDir, template: tmpl }, pages);
        expect(Buffer.compare(execOut.pdf, baseline.pdf)).toBe(0);
        expect(execOut.images.map((img, i) => Buffer.compare(img, baseline.images[i]))).toEqual([0, 0]);
        unlock();

        // Case 2: read-only bundle where program lost execute bit (0o444), staged in temp with copyIfNotExecutable.
        lockReadOnly(0o444);
        const before = new Set(listTempWorkDirs());
        const stagedOut = await renderWith({ program, target: assets().target, fontsDir, template: tmpl, copyIfNotExecutable: true }, pages);
        expect(Buffer.compare(stagedOut.pdf, baseline.pdf)).toBe(0);
        expect(stagedOut.images.map((img, i) => Buffer.compare(img, baseline.images[i]))).toEqual([0, 0]);
        expect(listTempWorkDirs().filter((name) => !before.has(name))).toEqual([]);

        // Tampered non-executable program is still refused by SHA-256 even when copyIfNotExecutable is true.
        unlock();
        writeFileSync(program, "not-the-pinned-binary");
        lockReadOnly(0o444);
        await expect(renderWith({ program, target: assets().target, fontsDir, template: tmpl, copyIfNotExecutable: true }, pages)).rejects.toThrow(/is not the pinned Typst/);
      } finally {
        unlock();
      }
    });

    /** A stand-in for Typst. `body` runs in the folder of one drawing. */
    const standIn = async (name: string, body: string, timeoutMs?: number) => {
      const program = inFolder(name);
      writeFileSync(program, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
      const pins = { ...PINS, targets: { ...PINS.targets, [assets().target]: { archiveSha256: "0".repeat(64), programSha256: sha256(readFileSync(program)) } } };
      return openRenderer({ ...assets(), program }, pins, { timeoutMs });
    };

    it("draws two different books at the same time, each in its own folder", async () => {
      const meet = inFolder("meet");
      mkdirSync(meet);
      // Each drawing writes its folder and its pages, then waits until it sees two folders. Alone it would wait for ever.
      const renderer = await standIn("meets.sh", `echo "$(pwd)" > "${meet}/$(basename "$(pwd)")"; cp pages.json "${meet}/$(basename "$(pwd)").json"; while [ "$(ls "${meet}" | grep -v json | wc -l)" -lt 2 ]; do sleep 0.02; done; echo met >&2; exit 1`, 10_000);
      const [front, back] = smallPages();
      const results = await Promise.allSettled([renderer.render([front]), renderer.render([back])]);
      expect(results.map((r) => (r.status === "rejected" ? String(r.reason) : "drawn"))).toEqual([expect.stringContaining("met"), expect.stringContaining("met")]);
      const pagesSeen = readdirSync(meet).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(meet, f), "utf8")).pages[0].page);
      expect(pagesSeen.sort()).toEqual([front.page, back.page]);
      expect(listTempWorkDirs()).toEqual([]);
    });

    it("draws the same bytes at the same time, also from a program that may not run", async () => {
      const noExec = inFolder("concurrent-noexec");
      cpSync(quick().assets.program, noExec);
      chmodSync(noExec, 0o444);
      const pages = smallPages();
      const [plain, copied] = await Promise.all([usualRenderer(), openRenderer({ ...assets(), program: noExec, copyIfNotExecutable: true }, quick().pins)]);
      const [one, two, three] = await Promise.all([plain.render(pages), copied.render(pages), copied.render(pages)]);
      for (const other of [two, three]) {
        expect(Buffer.compare(one.pdf, other.pdf)).toBe(0);
        expect(one.images.map((image, i) => Buffer.compare(image, other.images[i]))).toEqual([0, 0]);
      }
      expect(listTempWorkDirs()).toEqual([]);
    });

    it("removes its folder after a failure", async () => {
      await expect(renderDrawing(template("cleanup-err.typ", (s) => `${s}\n#unknown-fn()`))).rejects.toThrow(/Typst reported:/);
      expect(listTempWorkDirs()).toEqual([]);
    });

    it("kills a program that started and does not end, and removes its folder", async () => {
      // All three runs of a drawing must have started when the time is over. A busy computer gets more time for that.
      let ids: number[] = [];
      for (let limit = 400; ids.length < 3 && limit <= 25_600; limit *= 4) {
        const started = inFolder(`started-${limit}`);
        const renderer = await standIn(`slow-${limit}.sh`, `echo $$ >> "${started}"; exec sleep 60`, limit);
        const before = Date.now();
        await expect(renderer.render(smallPages())).rejects.toThrow(/Typst reported:/);
        expect(Date.now() - before).toBeLessThan(limit + 20_000);
        ids = existsSync(started) ? readFileSync(started, "utf8").trim().split("\n").map(Number) : [];
        for (const id of ids) expect(() => process.kill(id, 0)).toThrow(/ESRCH/);
        expect(listTempWorkDirs()).toEqual([]);
      }
      expect(ids).toHaveLength(3);
    }, 60_000);

    it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 60_001, 2_147_483_647, 2_147_483_648])("refuses a time limit of %s ms", async (timeoutMs) => {
      await expect(openRenderer(assets(), PINS, { timeoutMs })).rejects.toThrow("The time limit must be a whole number of milliseconds from 1 to 60000.");
    });

    it.each<[string, (place: string) => void]>([
      ["a named pipe", (place) => execFileSync("mkfifo", [place])],
      ["a folder", (place) => mkdirSync(place)],
      ["a link", (place) => symlinkSync(assets().program, place)],
    ])("does not wait for or follow %s in the place of the program", async (name, make) => {
      const place = inFolder(`odd-${name.replaceAll(" ", "-")}`);
      make(place);
      await expect(openRenderer({ ...assets(), program: place })).rejects.toThrow(/is not at/);
    });
  });
});
