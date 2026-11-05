import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { QuestionPackage } from "@/lib/question-package";
import type { Box } from "@/lib/workbook-print-contract";
import {
  ANSWER_CASES,
  ANSWER_GAP,
  answerCrop,
  inkScanPage,
  truthProblems,
  FONT_CHARS,
  PHOTO_EFFECTS,
  PHOTO_SIZE,
  SYNTHETIC_NOTE,
  makeScanPhoto,
  pageQuestions,
  planPhotoSet,
  writableBox,
  writablePage,
  type PageQuestion,
  type PhotoPage,
  type PhotoTruth,
  type RawImage,
} from "@/lib/scan-photo-set";

// A plain page image at the renderer's size (1275 x 1650): white, with an L-shaped scan mark at each corner and a
// printed square for each answer box, as the real template prints them.
const W = 1275, H = 1650;

function blankPage(boxes: Box[]): RawImage {
  const data = new Uint8Array(W * H * 4).fill(255);
  const fill = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) data.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 3);
  };
  for (const [x, y, dx, dy] of [[34, 34, 1, 1], [W - 34, 34, -1, 1], [W - 34, H - 34, -1, -1], [34, H - 34, 1, -1]]) {
    fill(dx > 0 ? x : x - 28, dy > 0 ? y : y - 5, 28, 5);
    fill(dx > 0 ? x : x - 5, dy > 0 ? y : y - 28, 5, 28);
  }
  for (const b of boxes) {
    fill(b.x, b.y, b.width, 2); fill(b.x, b.y + b.height - 2, b.width, 2);
    fill(b.x, b.y, 2, b.height); fill(b.x + b.width - 2, b.y, 2, b.height);
  }
  return { width: W, height: H, channels: 4, data };
}

const answers = [7, 42, 135, 60, 9, 18, 304, 25, 81, 12, 99, 3];
const boxes: Box[] = answers.map((_, i) => ({ x: 120 + (i % 3) * 360, y: 220 + Math.floor(i / 3) * 330, width: 150 + (i % 2) * 120, height: 90 }));
const work: Box = { x: 120, y: 1450, width: 900, height: 140 };

function page(): PhotoPage {
  return {
    level: "U4", workbookId: "test-book", page: 5, label: "1C", day: 1, pageOfDay: 3, imageSha256: "0".repeat(64),
    image: blankPage(boxes),
    marks: { tl: { x: 34, y: 34 }, tr: { x: W - 34, y: 34 }, br: { x: W - 34, y: H - 34 }, bl: { x: 34, y: H - 34 } },
    questions: [
      ...answers.map((a, i) => ({ number: i + 1, packageId: `pkg-${i + 1}`, format: "write-number", regions: [{ id: "answer", kind: "box", box: boxes[i], answer: a }] })),
      { number: 13, packageId: "pkg-13", format: "show-work", regions: [{ id: "work", kind: "work", box: work, answer: null }, { id: "answer", kind: "box", box: { x: 1100, y: 1480, width: 100, height: 80 }, answer: 4 }] },
      { number: 14, packageId: "pkg-14", format: "circle", regions: [{ id: "choice", kind: "choice", box: { x: 600, y: 1400, width: 200, height: 40 }, answer: null }] },
    ],
  };
}

const hash = (img: RawImage) => createHash("sha256").update(img.data).digest("hex");
const hashJson = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

/** The pixels that ink changed: the inked page against the page as printed. */
function changed(before: RawImage, after: RawImage): boolean[] {
  const out = new Array<boolean>(W * H).fill(false);
  for (let i = 0; i < W * H; i++) {
    for (let c = 0; c < 3; c++) if (before.data[i * before.channels + c] !== after.data[i * after.channels + c]) out[i] = true;
  }
  return out;
}

const inBox = (b: Box, x: number, y: number, pad = 1) => x >= b.x - pad && x <= b.x + b.width + pad && y >= b.y - pad && y <= b.y + b.height + pad;
const inkIn = (mask: boolean[], b: Box) => {
  let n = 0;
  for (let y = Math.max(0, Math.floor(b.y)); y < Math.min(H, Math.ceil(b.y + b.height)); y++) {
    for (let x = Math.max(0, Math.floor(b.x)); x < Math.min(W, Math.ceil(b.x + b.width)); x++) if (mask[y * W + x]) n++;
  }
  return n;
};

/** Every ink box the truth names: written answers (with their cross-out lines) and decoys. */
const inkBoxes = (t: PhotoTruth) => [...t.questions.flatMap((q) => q.written.map((w) => w.inkBox)), ...t.decoys.map((d) => d.inkBox)];

describe("scan photo set", () => {
  it("gives the same bytes and truth for the same seed, and a different photo for another seed", () => {
    const a = makeScanPhoto(page(), { seed: "s1", id: "U4-p05", effect: "shadow" });
    const b = makeScanPhoto(page(), { seed: "s1", id: "U4-p05", effect: "shadow" });
    const c = makeScanPhoto(page(), { seed: "s2", id: "U4-p05", effect: "shadow" });
    expect(hash(a.photo)).toBe(hash(b.photo));
    expect(hash(a.inked)).toBe(hash(b.inked));
    expect(hashJson(a.truth)).toBe(hashJson(b.truth));
    expect(hash(c.photo)).not.toBe(hash(a.photo));
    expect(a.photo.width).toBe(PHOTO_SIZE.width);
    expect(a.photo.height).toBe(PHOTO_SIZE.height);
  });

  it("draws ink exactly where the truth says, and none in a blank box", () => {
    for (const seed of ["s1", "s2", "s3", "s4"]) {
      const p = page();
      const result = makeScanPhoto(p, { seed, id: "U4-p05", effect: "plain" });
      const truth = result.truth;
      const mask = changed(p.image, result.inked);
      const named = inkBoxes(truth);
      // No ink the truth does not name.
      let unnamed = 0, inked = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (!mask[y * W + x]) continue;
          inked++;
          if (!named.some((b) => inBox(b, x, y))) unnamed++;
        }
      }
      expect(inked).toBeGreaterThan(0);
      expect(unnamed).toBe(0);
      for (const q of truth.questions) {
        const box = q.regions.find((r) => r.id === q.answerRegion)?.box;
        if (q.case === "blank") {
          expect(q.written).toEqual([]);
          expect(q.finalText).toBeNull();
          expect(inkIn(mask, box!)).toBe(0);
        }
        for (const w of q.written) {
          // Each character the truth names left ink in its own box, and the glyphs spell the text.
          expect(w.glyphs.map((g) => g.char).join("")).toBe(w.text);
          // Each digit's ink starts clear of the one before it, so the text can be read in order.
          for (let i = 1; i < w.glyphs.length; i++) {
            const before = w.glyphs[i - 1].box;
            expect(w.glyphs[i].box.x).toBeGreaterThanOrEqual(before.x + before.width - 0.02);
          }
          for (const g of w.glyphs) expect(inkIn(mask, g.box)).toBeGreaterThan(20);
          if (w.placement === "in-box") {
            const centre = { x: w.inkBox.x + w.inkBox.width / 2, y: w.inkBox.y + w.inkBox.height / 2 };
            expect(inBox(box!, centre.x, centre.y, 0)).toBe(true);
          }
        }
      }
    }
  });

  it("gives each written answer the expected mark its final text earns", () => {
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      const { truth } = makeScanPhoto(page(), { seed, id: "U4-p05", effect: "plain" });
      for (const q of truth.questions) {
        if (q.scope === "not-drawn") {
          expect(q.expectedMark).toBe("not-marked");
          expect(q.written).toEqual([]);
          continue;
        }
        const final = [...q.written].reverse().find((w) => !w.crossedOut)?.text ?? null;
        expect(q.finalText).toBe(final);
        expect(q.expectedMark).toBe(final === null ? "blank" : final === q.answer ? "right" : "wrong");
        if (q.case?.startsWith("crossed-out")) {
          expect(q.written.map((w) => w.crossedOut)).toEqual([true, false]);
          expect(q.written[0].text).not.toBe(q.written[1].text);
        }
        for (const w of q.written) expect([...w.text].every((ch) => FONT_CHARS.includes(ch))).toBe(true);
      }
      // A question in another format stays as printed.
      expect(truth.questions.find((q) => q.number === 14)?.scope).toBe("not-drawn");
      // A decoy is never the answer of the box it sits beside.
      for (const d of truth.decoys) expect(d.region).toBe("work");
    }
  });

  it("maps the page's scan marks and regions into the photo where the photo shows them", () => {
    const p = page();
    const { photo, truth } = makeScanPhoto(p, { seed: "geo", id: "U4-p05", effect: "plain" });
    expect(truth.expectedPhoto).toBe("mark");
    // Each mark's outer corner in the photo sits at the dark L: dark ink just inside it.
    for (const m of Object.values(truth.photo.marks)) {
      expect(m.visible).toBe(true);
      let dark = 0;
      for (let dy = -10; dy <= 10; dy++) {
        for (let dx = -10; dx <= 10; dx++) {
          const x = Math.round(m.x) + dx, y = Math.round(m.y) + dy;
          const i = (y * photo.width + x) * 3;
          if (photo.data[i] < 110 && photo.data[i + 1] < 110) dark++;
        }
      }
      expect(dark).toBeGreaterThan(8);
    }
    for (const q of truth.questions) for (const r of q.regions) expect(r.visible).toBe("full");
  });

  it("keeps a correction off every other question's regions", () => {
    let beside = 0;
    for (const seed of ["k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8"]) {
      const p = page();
      const { truth } = makeScanPhoto(p, { seed, id: "U4-p05", effect: "plain" });
      for (const q of truth.questions) {
        for (const w of q.written.filter((x) => x.placement !== "in-box")) {
          beside++;
          const others = p.questions.flatMap((o) => o.regions.filter((r) => r.box && !(o.number === q.number && r.id === q.answerRegion)).map((r) => r.box!));
          for (const b of others) {
            const overlap = w.inkBox.x < b.x + b.width && b.x < w.inkBox.x + w.inkBox.width && w.inkBox.y < b.y + b.height && b.y < w.inkBox.y + w.inkBox.height;
            expect(overlap).toBe(false);
          }
        }
      }
    }
    expect(beside).toBeGreaterThan(0);
  });

  it("keeps the whole page in frame unless the photo is cut off", () => {
    for (const effect of ["rotation", "perspective", "plain", "shadow"] as const) {
      for (const seed of ["f1", "f2", "f3"]) {
        const { truth } = makeScanPhoto(page(), { seed, id: "U4-p05", effect });
        expect(truth.expectedPhoto).toBe("mark");
        expect(truth.photo.pageCorners.every((c) => c.x >= 0 && c.y >= 0 && c.x <= PHOTO_SIZE.width && c.y <= PHOTO_SIZE.height)).toBe(true);
      }
    }
  });

  it("marks a cut-off photo and its lost boxes, and a wrong-page photo as sent for another page", () => {
    let cut = 0;
    for (const seed of ["c1", "c2", "c3", "c4", "c5"]) {
      const { truth } = makeScanPhoto(page(), { seed, id: "U4-p05", effect: "cut-off" });
      expect(truth.expectedPhoto).toBe("cut-off");
      const lost = truth.questions.filter((q) => q.scope === "write" && q.regions.some((r) => r.id === q.answerRegion && r.visible !== "full"));
      for (const q of lost) expect(q.expectedMark).toBe("not-visible");
      cut += lost.length;
    }
    expect(cut).toBeGreaterThan(0);
    const wrong = makeScanPhoto(page(), { seed: "w", id: "U4-p05", effect: "wrong-page", submittedAs: { page: 9, label: "1G" } });
    expect(wrong.truth.expectedPhoto).toBe("wrong-page");
    expect(wrong.truth.submittedAs).toEqual({ page: 9, label: "1G" });
    expect(wrong.truth.source.page).toBe(5);
    expect(() => makeScanPhoto(page(), { seed: "w", id: "x", effect: "wrong-page" })).toThrow();
  });

  it("says in every truth file that the handwriting is synthetic", () => {
    const { truth } = makeScanPhoto(page(), { seed: "n", id: "U4-p05", effect: "blur" });
    expect(truth.synthetic).toBe(true);
    expect(truth.note).toBe(SYNTHETIC_NOTE);
    expect(truth.note).toMatch(/does not prove accuracy on real child handwriting/);
  });

  it("plans every effect for each level and covers every answer case across a set", () => {
    const pages = ["U4", "U16"].flatMap((level) => Array.from({ length: 20 }, (_, i) => ({ level, page: i + 3, label: `p${i}` })));
    const plan = planPhotoSet(pages, "537");
    expect(plan).toEqual(planPhotoSet(pages, "537"));
    expect(plan).toHaveLength(40);
    for (const level of ["U4", "U16"]) {
      const mine = plan.filter((p) => p.level === level);
      expect(new Set(mine.map((p) => p.effect))).toEqual(new Set(PHOTO_EFFECTS));
      for (const p of mine.filter((x) => x.effect === "wrong-page")) {
        expect(p.submittedAs?.page).not.toBe(p.page);
        expect(mine.some((x) => x.page === p.submittedAs?.page)).toBe(true);
      }
    }
    const cases = new Set(plan.slice(0, 8).flatMap((p) => makeScanPhoto(page(), { seed: "537", id: p.id, effect: "plain" }).truth.questions.map((q) => q.case)));
    for (const c of ANSWER_CASES) expect(cases.has(c)).toBe(true);
  });

  it("reads a page's questions from their packages and printed regions", () => {
    const pkg = (id: string, value: unknown, item?: unknown) => ({ id, answer: { value }, item }) as unknown as QuestionPackage;
    const qs = pageQuestions([
      { number: 1, package: pkg("a", { type: "number", value: 12 }) },
      { number: 2, package: pkg("b", { type: "fraction", numerator: 1, denominator: 2 }) },
      { number: 3, package: pkg("c", { type: "number", value: 5 }) },
    ], new Map([
      [1, [{ id: "answer", kind: "box", box: boxes[0] }]],
      [2, [{ id: "answer", kind: "box", box: boxes[1] }]],
      [3, [{ id: "answer", kind: "box", box: null }]],
    ]));
    expect(qs.map((q) => writableBox(q)?.answer ?? null)).toEqual([12, null, null]);
    expect(writablePage(qs, 1)).toBe(true);
    expect(writablePage(qs, 2)).toBe(false);
  });

  it("finds overlapping answers, a wrong final text and a mark the text does not earn", () => {
    const { truth } = makeScanPhoto(page(), { seed: "v", id: "U4-p05", effect: "plain" });
    expect(truthProblems(truth)).toEqual([]);
    const q = truth.questions.find((x) => x.case === "crossed-out-right" || x.case === "crossed-out-wrong") ?? truth.questions.find((x) => x.written.length)!;
    const broken = structuredClone(truth);
    const bq = broken.questions.find((x) => x.number === q.number)!;
    bq.written = [{ ...bq.written[0], crossedOut: true }, { ...bq.written[0], text: bq.answer!, crossedOut: false, glyphs: [...bq.answer!].map((char) => ({ char, box: bq.written[0].inkBox })) }];
    bq.finalText = bq.answer;
    bq.expectedMark = "right";
    expect(truthProblems(broken).join("\n")).toMatch(/less than 6 px apart/);
    bq.expectedMark = "wrong";
    expect(truthProblems(broken).join("\n")).toMatch(/earns right/);
  });
});

// ---------- The whole seed-537 set ----------

// Where each answer region printed on the 40 pages of the seed-537 set, with each write-number key and its package's
// known mistakes (scan-photo-set.fixture.json; made from the fake books, no images and no child data). The printed text
// is not in it, so each page is checked twice: on clear paper, and with every place outside the answer boxes printed,
// which leaves no clear paper beside a box and forces every correction into its box (the worst case).
interface FixturePage {
  id: string; level: string; page: number; label: string | null; effect: string;
  marks: PhotoPage["marks"];
  questions: { number: number; format: string; regions: { id: string; kind: string; box: Box | null; answer: number | null }[] }[];
  mistakes: Record<string, number[]>;
}
const fixture = JSON.parse(readFileSync(new URL("./scan-photo-set.fixture.json", import.meta.url), "utf8")) as { seed: string; pages: FixturePage[] };

function fixturePage(f: FixturePage, crowded: boolean): PhotoPage {
  const questions: PageQuestion[] = f.questions.map((q) => ({ number: q.number, packageId: `${f.id}-q${q.number}`, format: q.format, regions: q.regions }));
  const boxes = questions.flatMap((q) => q.regions.flatMap((r) => (r.box ? [r.box] : [])));
  const data = new Uint8Array(W * H * 3).fill(255);
  if (crowded) {
    // Printed grey everywhere but inside the answer regions.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) if (!boxes.some((b) => x > b.x + 2 && x < b.x + b.width - 2 && y > b.y + 2 && y < b.y + b.height - 2)) data.fill(120, (y * W + x) * 3, (y * W + x) * 3 + 3);
    }
  }
  return {
    level: f.level, workbookId: "fixture", page: f.page, label: f.label, day: null, pageOfDay: null, imageSha256: "0".repeat(64),
    image: { width: W, height: H, channels: 3, data }, marks: f.marks, questions,
  };
}

const mistakesOf = (f: FixturePage) => new Map(Object.entries(f.mistakes).map(([n, m]) => [Number(n), m]));

describe("scan photo set: every page of the seed-537 set", () => {
  it("has the 40 pages of the set", () => {
    expect(fixture.pages).toHaveLength(40);
    expect(new Set(fixture.pages.map((p) => p.level))).toEqual(new Set(["U4", "U16"]));
  });

  for (const crowded of [false, true]) {
    it(`writes every answer of every page so it can be read exactly (${crowded ? "no clear paper beside the boxes" : "clear paper"})`, () => {
      const problems: string[] = [];
      let crossed = 0;
      for (const f of fixture.pages) {
        const p = fixturePage(f, crowded);
        for (const seed of [fixture.seed, "1", "2", "3"]) {
          const { questions } = inkScanPage(p, { seed, id: f.id, mistakes: mistakesOf(f) });
          problems.push(...truthProblems({ id: `${seed}:${f.id}`, questions }));
          crossed += questions.filter((q) => q.written.some((w) => w.crossedOut)).length;
        }
      }
      expect(problems).toEqual([]);
      // (Crossed-out answers are still in the set: separation is met, not avoided.)
      expect(crossed).toBeGreaterThan(40);
    });
  }

  // Only the pages where a correction sits outside its box need a photo here: the crop's other inputs are covered above.
  const beside = fixture.pages.filter((f) => inkScanPage(fixturePage(f, false), { seed: fixture.seed, id: f.id, mistakes: mistakesOf(f) })
    .questions.some((q) => q.written.some((w) => w.placement !== "in-box")));

  it("has pages with a correction beside its box", () => expect(beside.length).toBeGreaterThan(3));

  it.each(beside.map((f) => [f.id, f] as const))("crops %s around all of each answer's ink", (_, f) => {
    const { truth } = makeScanPhoto(fixturePage(f, false), { seed: fixture.seed, id: f.id, effect: "plain", mistakes: mistakesOf(f) });
    for (const q of truth.questions.filter((x) => x.written.length)) {
      const crop = answerCrop(q)!;
      const quads = [...q.regions.filter((r) => r.id === q.answerRegion).map((r) => r.photoQuad!), ...q.written.map((w) => w.photoQuad!)];
      for (const point of quads.flat()) {
        expect(point.x).toBeGreaterThanOrEqual(crop.x);
        expect(point.y).toBeGreaterThanOrEqual(crop.y);
        expect(point.x).toBeLessThanOrEqual(crop.x + crop.width);
        expect(point.y).toBeLessThanOrEqual(crop.y + crop.height);
      }
    }
  });

  it("keeps two pieces of text at least the answer gap apart", () => expect(ANSWER_GAP).toBeGreaterThanOrEqual(6));
});
