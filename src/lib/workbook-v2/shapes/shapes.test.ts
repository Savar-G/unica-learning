import { readdirSync } from "node:fs";
import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { buildBook } from "../build/build-book";
import { ANSWER_KINDS, FACE_KINDS, REGION_ROLES } from "../contract";
import divisionSnapshot from "../fixtures/snapshot-division.json";
import factsSnapshot from "../fixtures/snapshot-facts.json";
import placesSnapshot from "../fixtures/snapshot-place-value.json";
import rawSnapshot from "../fixtures/snapshot.json";
import { canonicalJson, pick, seedFrom } from "../hash";
import { fitProblem, TEMPLATES } from "../layout/templates";
import { openRenderer } from "../render/typst";
import { FINGERPRINTS_DIR, readShapeFingerprints } from "../testing/shape-fingerprints";
import { checkShapes, SAMPLE_SEED, SEEDS } from "../testing/shape-harness";
import { SHAPE_REGISTRATIONS } from "../testing/shape-registrations";
import { skipTypstTests, testAssets } from "../testing/typst";
import { SHAPES } from "./index";
import { placeValue, type PlaceValueLimits } from "./place-value";

describe("registered shapes", () => {
  const { problems, reports } = checkShapes(SHAPES, SHAPE_REGISTRATIONS, { fingerprints: readShapeFingerprints() });
  afterAll(() => console.info(`[shape-harness] ${reports.map((r) => `${r.shape} v${r.version}: ${Math.round(r.durationMs)} ms, ${r.evidence.seeds} seeds, ${r.evidence.spaces} of ${r.evidence.limits} limits, ${r.evidence.questions} questions`).join("; ")} (fast-check seed ${SAMPLE_SEED})`));

  it("are registered, each one time", () => expect(problems).toEqual([]));

  it("have one registration file and one fingerprint file each, with the name of the shape", () => {
    const regFiles = readdirSync("src/lib/workbook-v2/testing/registrations").sort();
    const fpFiles = readdirSync(FINGERPRINTS_DIR).sort();
    expect(regFiles).toEqual([...SHAPES.keys()].map((id) => `${id.replaceAll(".", "-")}.ts`).sort());
    expect(fpFiles).toEqual([...SHAPES.keys()].map((id) => `${id}.json`).sort());
    expect(SHAPE_REGISTRATIONS.map((r) => r.id).sort()).toEqual([...SHAPES.keys()].sort());
  });

  it.each([...SHAPES.keys()])("%s passes every check on at least 1,000 seeds", (id) => {
    const report = reports.find((r) => r.shape === id);
    expect(report?.failures.map((f) => f.message)).toEqual([]);
    expect(report?.evidence.seeds).toBeGreaterThanOrEqual(1000);
    expect(report?.evidence.spaces).toBeGreaterThanOrEqual(60);
    expect(SEEDS).toBe(1000);
  });

  // Product rule: a child writes every answer. A true or false, tick or circle question would need another face, kind or rectangle.
  it("ask for a written answer: no face, answer kind or rectangle is a choice to tick, circle or call true", () => {
    expect([FACE_KINDS, ANSWER_KINDS]).toEqual([["column", "equation", "sequence", "bracket", "fields"], ["whole-number", "digit"]]);
    expect(REGION_ROLES.filter((role) => !["heading", "instruction", "footer", "qr", "scan-mark", "slot", "label", "question"].includes(role))).toEqual(["answer", "reach", "work"]);
    for (const { id, cases } of SHAPE_REGISTRATIONS) {
      const shape = SHAPES.get(id);
      if (!shape) throw new Error("no shape");
      for (const { limits } of cases) {
        const { question, answer } = shape.worstCase(limits);
        const face = shape.face(question);
        expect(FACE_KINDS).toContain(face.kind);
        expect(answer.parts.every((part) => ANSWER_KINDS.includes(part.kind) && /^\d+$/.test(part.value))).toBe(true);
      }
    }
  });

  it("are checked with the limits of every row of the example books", () => {
    const rows = [...rawSnapshot.sheets, ...factsSnapshot.sheets, ...divisionSnapshot.sheets, ...placesSnapshot.sheets].flatMap((s) => [...s.front.rows, ...s.back.rows]);
    const registered = SHAPE_REGISTRATIONS.flatMap(({ id, cases }) => cases.map((c) => `${id} ${canonicalJson(c.limits)}`));
    for (const { shape, limits } of rows) expect(registered).toContain(`${shape} ${canonicalJson(limits)}`);
  });
});

describe.skipIf(skipTypstTests())("one book with a sheet for each shape, with the real Typst", () => {
  // A page is drawn only when it is the first one of its shape or of its template: divisions and one paired place-value
  // sheet (places-2x3 front, places-2x2 back) cover every template of those shapes.
  it("is built, with the example books of divisions and of place value", async () => {
    const placeSheet = { id: "places-both", firstPage: 1, front: placesSnapshot.sheets[0].front, back: placesSnapshot.sheets[1].back };
    const examples = [...divisionSnapshot.sheets, placeSheet];
    const drawn = new Set(examples.flatMap((s) => [...s.front.rows, ...s.back.rows].map((row) => row.shape)));
    const side = (name: string, shape: string, limits: unknown) => {
      const found = SHAPES.get(shape);
      if (!found) throw new Error("no shape");
      const worst = found.worstCase(limits);
      const face = found.face(worst.question);
      const template = [...TEMPLATES.values()].find((t) => fitProblem(t, face, worst.answer) === null);
      return { instruction: "Work it out.", template: template?.id, rows: [{ id: name, shape, limits, items: Math.min(template?.sides.front.places.length ?? 0, found.count(limits)) }] };
    };
    const sides = SHAPE_REGISTRATIONS.filter(({ id }) => !drawn.has(id)).flatMap(({ id, cases }) => [cases[0], cases[cases.length - 1]].map(({ limits }, i) => side(`${id.replaceAll(".", "-")}-${i}`, id, limits)))
      .filter(({ template, rows: [{ shape }] }, i, all) => all.findIndex((s) => s.rows[0].shape === shape) === i || all.findIndex((s) => s.template === template) === i);
    const own = sides.flatMap((front, i) => (i % 2 === 0 ? [{ id: `sheet-${i}`, front, back: sides[i + 1] ?? { ...front, rows: front.rows.map((row) => ({ ...row, id: "again" })) } }] : []));
    const sheets = [...own, ...examples].map((sheet, i) => ({ ...sheet, firstPage: 2 * i + 1 }));
    const ids = sheets.map((sheet) => sheet.id);
    const snapshot = { format: 1, id: "all-shapes", level: { id: "level", name: "1" }, topics: [{ id: "topic", code: "1-1", title: "All shapes", sheets: ids }], sheets };
    const book = { bookId: "all-shapes", childId: "child", sheets: ids.map((sheetId) => ({ sheetId, attempt: 1, qr: { front: `${sheetId}-front`, back: `${sheetId}-back` } })) };
    const result = await buildBook({ snapshot, book }, await openRenderer(testAssets()));
    expect(result).toMatchObject({ status: "built" });
    if (result.status !== "built") return;
    expect(new Set(result.items.map((item) => item.shape))).toEqual(new Set(SHAPES.keys()));
    expect(result.notices.filter((notice) => examples.some(({ id }) => notice.includes(`"${id}"`)))).toEqual([]);
  });
});

describe("place.value", () => {
  const r = (min: number, max: number) => ({ min, max });
  const WIDE: PlaceValueLimits = { digits: r(2, 4), number: r(10, 9999), zeros: r(0, 3), zeroInOnes: "allowed", zeroInTens: "allowed", zeroInHundreds: "allowed" };
  const ALL = Array.from({ length: 9990 }, (_, i) => {
    const n = 10 + i;
    const text = String(n);
    const len = text.length;
    const zeros = (text[len - 1] === "0" ? 1 : 0) + (len > 2 && text[len - 2] === "0" ? 1 : 0) + (len > 3 && text[len - 3] === "0" ? 1 : 0);
    return { n, len, zeros, z0: text[len - 1] === "0", z1: len > 2 && text[len - 2] === "0", z2: len > 3 && text[len - 3] === "0" };
  });

  function inside(l: PlaceValueLimits): number[] {
    const word = (value: string, has: boolean) => value === "allowed" || (value === "only") === has;
    const out: number[] = [];
    for (const item of ALL) {
      if (item.len >= l.digits.min && item.len <= l.digits.max && item.n >= l.number.min && item.n <= l.number.max
        && item.zeros >= l.zeros.min && item.zeros <= l.zeros.max
        && word(l.zeroInOnes, item.z0) && word(l.zeroInTens, item.z1) && word(l.zeroInHundreds, item.z2)) out.push(item.n);
    }
    return out;
  }

  const range = (min: number, max: number) => fc.tuple(fc.integer({ min, max }), fc.integer({ min, max })).map(([a, b]) => r(Math.min(a, b), Math.max(a, b)));
  const word = fc.constantFrom("never", "allowed", "only") as fc.Arbitrary<PlaceValueLimits["zeroInOnes"]>;
  const limits: fc.Arbitrary<PlaceValueLimits> = fc.record({
    digits: fc.oneof(fc.constant(r(2, 4)), range(2, 4)), number: fc.oneof(fc.constant(r(10, 9999)), range(10, 9999)), zeros: fc.oneof(fc.constant(r(0, 3)), range(0, 3)),
    zeroInOnes: word, zeroInTens: word, zeroInHundreds: word,
  });

  it("counts each number of the limits, and the seed alone picks its place in the rising list", () => {
    let full = 0;
    fc.assert(fc.property(limits, fc.nat(), (l, n) => {
      const numbers = inside(l);
      expect(placeValue.count(l)).toBe(numbers.length);
      if (numbers.length === 0) return;
      full++;
      const seed = seedFrom("place", n);
      expect(placeValue.generate(l, seed).question).toEqual({ number: numbers[pick(seed, numbers.length)] });
    }), { numRuns: 150, seed: 237 });
    expect(full).toBeGreaterThan(40);
    expect(placeValue.count(WIDE)).toBe(9990);
  });

  it.each<[string, PlaceValueLimits, string]>([
    ["a zero in the tens of 2 digits", { ...WIDE, digits: r(2, 2), zeroInTens: "only" }, "a wider digits or zeroInTens has some"],
    ["a zero in the hundreds of 3 digits", { ...WIDE, digits: r(2, 3), zeroInHundreds: "only" }, "a wider digits or zeroInHundreds has some"],
    ["three zeros in a number of 3 digits", { ...WIDE, number: r(100, 999), zeros: r(3, 3) }, "a wider number or zeros has some"],
    ["no zero in a number that ends in one", { ...WIDE, zeros: r(0, 0), zeroInOnes: "only" }, "a wider zeros or zeroInOnes has some"],
    ["numbers of 4 digits and 2 digits", { ...WIDE, digits: r(4, 4), number: r(10, 99) }, "a wider digits or number has some"],
  ])("names the narrow limits when no number meets them: %s", (_name, l, named) => {
    expect(placeValue.readLimits(l)).toEqual({ ok: false, problem: `no question meets these limits (${named})` });
  });

  it("reads limits that some number meets", () => expect(placeValue.readLimits({ ...WIDE, zeroInHundreds: "only" })).toEqual({ ok: true, limits: { ...WIDE, zeroInHundreds: "only" } }));

  it("states the zero instruction on every fixture side that can print a zero digit", () => {
    for (const sheet of placesSnapshot.sheets) {
      for (const side of [sheet.front, sheet.back]) {
        const canZero = side.rows.some((row) => {
          const read = placeValue.readLimits(row.limits);
          return read.ok && inside(read.limits).some((n) => String(n).includes("0"));
        });
        if (canZero) expect(side.instruction).toContain("A zero is 0.");
      }
    }
  });
});
