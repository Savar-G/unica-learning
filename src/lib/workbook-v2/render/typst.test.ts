import { chmodSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isPrintable, type Ink, type PageModel } from "../contract";
import { checkImages } from "../checks/images";
import { checkPositions, checkTexts } from "../checks/positions";
import { sha256 } from "../hash";
import { qrSquares } from "../layout/qr";
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
      expect(checkImages(pages, out.images)).toEqual([]);
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
      ["there is no font folder", () => renderWith({ ...assets(), fontsDir: inFolder("nothing") }), /The font Geist-Regular\.ttf is not in .*nothing/],
      ["there is no drawing file", () => renderWith({ ...assets(), template: inFolder("nothing.typ") }), /The drawing file .*nothing\.typ is not there/],
      ["the program may not run", () => { cpSync(assets().program, inFolder("still")); chmodSync(inFolder("still"), 0o644); return renderWith({ ...assets(), program: inFolder("still") }); }, /still may not run\. Run "npm run typst:install"/],
      ["the program changes after the check", async () => { cpSync(assets().program, inFolder("later")); const renderer = await openRenderer({ ...assets(), program: inFolder("later") }); writeFileSync(inFolder("later"), "#!/bin/sh\n", { mode: 0o755 }); return renderer.render(goodPages()); }, /later is not the pinned Typst/],
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

  describe("draws with the checked files only", () => {
    const same = async (a: RenderAssets, change: () => unknown = () => {}) => {
      const pages = goodPages();
      const [plain, other] = [await openRenderer(assets()), await openRenderer(a)];
      change();
      const [one, two] = [await plain.render(pages), await other.render(pages)];
      expect(other.identity).toEqual(plain.identity);
      expect(Buffer.compare(one.pdf, two.pdf)).toBe(0);
      expect(one.images.map((image, i) => Buffer.compare(image, two.images[i]))).toEqual([0, 0]);
    };
    /** A copy of the fonts and the drawing file that a test can change. */
    const copied = (name: string): RenderAssets => {
      mkdirSync(inFolder(name));
      cpSync(assets().fontsDir, inFolder(`${name}/fonts`), { recursive: true });
      cpSync(assets().template, inFolder(`${name}/page.typ`));
      return { ...assets(), fontsDir: inFolder(`${name}/fonts`), template: inFolder(`${name}/page.typ`) };
    };
    const bold = () => readFileSync(join(assets().fontsDir, "Geist-SemiBold.ttf"));
    const addFonts = (a: RenderAssets) => {
      mkdirSync(join(a.fontsDir, "nested"));
      writeFileSync(join(a.fontsDir, "nested", "Geist-Regular.ttf"), bold());
      writeFileSync(join(a.fontsDir, "Extra.ttf"), bold());
    };

    it("says what they are: the hash of the program of this computer, of the drawing file and of each font", async () => {
      const { identity } = await openRenderer(assets());
      expect(identity).toEqual({
        typst: "0.15.1",
        program: sha256(readFileSync(assets().program)),
        template: sha256(readFileSync(assets().template)),
        fonts: { "Geist-Regular.ttf": sha256(readFileSync(join(assets().fontsDir, "Geist-Regular.ttf"))), "Geist-SemiBold.ttf": sha256(bold()) },
      });
      expect((await openRenderer(template("identity.typ", (s) => `${s}\n`))).identity.template).not.toBe(identity.template);
    });

    it("whatever other fonts are in or under the font folder", async () => {
      const a = copied("extra");
      addFonts(a);
      await same(a);
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

    it("also when a path is relative", async () => {
      const here = (path: string) => relative(process.cwd(), path);
      await same({ ...assets(), program: here(assets().program), fontsDir: here(assets().fontsDir), template: here(assets().template) });
    });
  });

  describe("a drawing file that reports more than it prints does not pass the image check", () => {
    const problemsOf = async (name: string, change: (s: string) => string) => {
      const pages = goodPages();
      const out = await renderWith(template(name, change), pages);
      expect(checkPositions(pages, out.positions)).toEqual([]);
      expect(checkTexts(pages, out.texts)).toEqual([]);
      return checkImages(pages, out.images).join("\n");
    };
    it.each<[string, (s: string) => string, RegExp]>([
      ["hides the text", (s) => s.replace("  it\n}", "  hide(it)\n}"), /^Page 381: "heading" must print "3-20 · Multiplying 2 digits by 1 digit" and the image has no ink there\.$[^]*^Page 382: "question-8" must print/m],
      ["hides one text", (s) => s.replace("  it\n}", '  if it.text == "×" { hide(it) } else { it }\n}'), /^Page 381: "question-1" must print "×" and the image has no ink there\.$/m],
      ["prints white text", (s) => s.replace("fill: colors.at(ink.color), ink.text", "fill: white, ink.text"), /"label-1" must print "1"/],
      ["leaves out the QR squares", (s) => s.replace("for ink in region.ink", 'for ink in if region.role == "qr" { () } else { region.ink }'), /^Page 381: the image has no QR code that can be read in its box\.$[^]*^Page 382: the image has no QR code/m],
      ["leaves out all filled squares", (s) => s.replace("fill: colors.at(ink.color), stroke: none", "fill: none, stroke: none"), /the image has no ink for a part of "mark-tl"/],
      ["leaves out the outlines", (s) => s.replace("points(ink.width) + colors.at(ink.color)", "none"), /the image has no ink for a part of "answer-1"/],
      ["prints the QR code a second time", (s) => s.replace("      report(region.id)", '      report(region.id)\n      if region.role == "qr" { place(origin, dx: -points(region.rect.w) * 3, dy: -points(region.rect.h), block(width: points(region.rect.w), height: points(region.rect.h), for ink in region.ink { put(ink.rect, region.rect, drawers.at(ink.kind)(ink)) })) }'), /^Page 381: the image has a second QR code, which reads "https:\/\/unicalearning\.com\/tutor\/p\/example-front-381"\.$/m],
      ["prints the QR code of the first page on each page", (s) => s.replace("for ink in region.ink {", 'for ink in if region.role == "qr" { model.pages.first().regions.last().ink.map(ink => { ink.rect.x += region.rect.x - model.pages.first().regions.last().rect.x; ink }) } else { region.ink } {'), /^Page 382: the QR code reads "https:\/\/unicalearning\.com\/tutor\/p\/example-front-381" and must read "https:\/\/unicalearning\.com\/tutor\/p\/example-back-382"\.$/m],
    ])("%s", async (name, change, problem) => {
      expect(await problemsOf(`${name.replaceAll(" ", "-")}.typ`, change)).toMatch(problem);
    });
  });

  it("prints ink for every character that may be printed, in each weight", async () => {
    const [page] = goodPages();
    const characters = Array.from({ length: 0x10000 }, (_, code) => String.fromCharCode(code)).filter((c) => isPrintable(c) && c !== " ");
    const ink = [400, 600].flatMap((weight, w) => characters.map((c, i): Ink =>
      ({ kind: "text", rect: { x: 100 + (i % 12) * 30, y: 100 + (Math.floor(i / 12) + w * 10) * 28, w: 24, h: 24 }, color: "black", text: c, size: 14, weight, align: "center" })));
    const all = [{ ...page, regions: page.regions.map((r) => (r.role === "heading" ? { ...r, ink } : { ...r, ink: r.role === "qr" ? r.ink : [] })) }];
    const out = await renderWith(assets(), all);
    expect(checkTexts(all, out.texts)).toEqual([]);
    expect(checkImages(all, out.images)).toEqual([]);
  });

  it("a QR text of any length that has a code can be read back from its page image", async () => {
    const [front] = goodPages();
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
    expect(checkImages(pages, (await renderWith(assets(), pages)).images)).toEqual([]);
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

  it("puts each pinned font into the PDF, and no other", async () => {
    const text = Buffer.from((await renderWith(assets())).pdf).toString("latin1");
    expect([...new Set([...text.matchAll(/\/[A-Z]{6}\+([\w-]+)/g)].map((m) => `${m[1]}.ttf`))].sort()).toEqual(Object.keys(PINS.fonts).sort());
  });

  it("writes nothing about the child or the time into the PDF", async () => {
    const text = Buffer.from((await renderWith(assets())).pdf).toString("latin1");
    expect(text).not.toMatch(/example-child|CreationDate|ModDate|20\d\d-\d\d-\d\dT/);
  });
});
