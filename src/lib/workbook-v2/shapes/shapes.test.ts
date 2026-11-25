import { readdirSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { buildBook } from "../build/build-book";
import { ANSWER_KINDS, FACE_KINDS, REGION_ROLES } from "../contract";
import divisionSnapshot from "../fixtures/snapshot-division.json";
import factsSnapshot from "../fixtures/snapshot-facts.json";
import rawSnapshot from "../fixtures/snapshot.json";
import { canonicalJson } from "../hash";
import { fitProblem, TEMPLATES } from "../layout/templates";
import { openRenderer } from "../render/typst";
import { FINGERPRINTS_DIR, readShapeFingerprints } from "../testing/shape-fingerprints";
import { checkShapes, SAMPLE_SEED, SEEDS } from "../testing/shape-harness";
import { SHAPE_REGISTRATIONS } from "../testing/shape-registrations";
import { skipTypstTests, testAssets } from "../testing/typst";
import { SHAPES } from "./index";

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
    expect([FACE_KINDS, ANSWER_KINDS]).toEqual([["column", "equation", "sequence", "bracket"], ["whole-number"]]);
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
    const rows = [...rawSnapshot.sheets, ...factsSnapshot.sheets, ...divisionSnapshot.sheets].flatMap((s) => [...s.front.rows, ...s.back.rows]);
    const registered = SHAPE_REGISTRATIONS.flatMap(({ id, cases }) => cases.map((c) => `${id} ${canonicalJson(c.limits)}`));
    for (const { shape, limits } of rows) expect(registered).toContain(`${shape} ${canonicalJson(limits)}`);
  });
});

describe.skipIf(skipTypstTests())("one book with a sheet for each shape, with the real Typst", () => {
  // The example book of divisions has a sheet for each shape and form of them, so that nothing is drawn two times.
  it("is built, with the example book of divisions", async () => {
    const drawn = new Set(divisionSnapshot.sheets.flatMap((s) => [...s.front.rows, ...s.back.rows].map((row) => row.shape)));
    const side = (name: string, shape: string, limits: unknown) => {
      const found = SHAPES.get(shape);
      if (!found) throw new Error("no shape");
      const worst = found.worstCase(limits);
      const face = found.face(worst.question);
      const template = [...TEMPLATES.values()].find((t) => fitProblem(t, face, worst.answer) === null);
      return { instruction: "Work it out.", template: template?.id, rows: [{ id: name, shape, limits, items: Math.min(template?.sides.front.places.length ?? 0, found.count(limits)) }] };
    };
    const own = SHAPE_REGISTRATIONS.filter(({ id }) => !drawn.has(id)).map(({ id, cases }, i) => ({ id: `sheet-${i}`, front: side("front", id, cases[0].limits), back: side("back", id, cases[cases.length - 1].limits) }));
    const sheets = [...own, ...divisionSnapshot.sheets].map((sheet, i) => ({ ...sheet, firstPage: 2 * i + 1 }));
    const ids = sheets.map((sheet) => sheet.id);
    const snapshot = { format: 1, id: "all-shapes", level: { id: "level", name: "1" }, topics: [{ id: "topic", code: "1-1", title: "All shapes", sheets: ids }], sheets };
    const book = { bookId: "all-shapes", childId: "child", sheets: ids.map((sheetId) => ({ sheetId, attempt: 1, qr: { front: `${sheetId}-front`, back: `${sheetId}-back` } })) };
    const result = await buildBook({ snapshot, book }, await openRenderer(testAssets()));
    expect(result).toMatchObject({ status: "built" });
    if (result.status !== "built") return;
    expect(new Set(result.items.map((item) => item.shape))).toEqual(new Set(SHAPES.keys()));
    expect(result.notices.filter((notice) => divisionSnapshot.sheets.some(({ id }) => notice.includes(`"${id}"`)))).toEqual([]);
  });
});
