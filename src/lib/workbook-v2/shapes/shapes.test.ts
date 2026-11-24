import { afterAll, describe, expect, it } from "vitest";
import { buildBook } from "../build/build-book";
import rawSnapshot from "../fixtures/snapshot.json";
import { canonicalJson } from "../hash";
import { digitPlaces, TEMPLATES } from "../layout/templates";
import { openRenderer } from "../render/typst";
import committedFingerprints from "../testing/shape-fingerprints.json";
import { checkShapes, SAMPLE_SEED, SEEDS } from "../testing/shape-harness";
import { SHAPE_REGISTRATIONS } from "../testing/shape-registrations";
import { skipTypstTests, testAssets } from "../testing/typst";
import { SHAPES } from "./index";

describe("registered shapes", () => {
  const { problems, reports } = checkShapes(SHAPES, SHAPE_REGISTRATIONS, { fingerprints: committedFingerprints });
  afterAll(() => console.info(`[shape-harness] ${reports.map((r) => `${r.shape} v${r.version}: ${Math.round(r.durationMs)} ms, ${r.evidence.seeds} seeds, ${r.evidence.limits} limits, ${r.evidence.questions} questions`).join("; ")} (fast-check seed ${SAMPLE_SEED})`));

  it("are registered, each one time", () => expect(problems).toEqual([]));

  it.each([...SHAPES.keys()])("%s passes every check on at least 1,000 seeds", (id) => {
    const report = reports.find((r) => r.shape === id);
    expect(report?.failures.map((f) => f.message)).toEqual([]);
    expect(report?.evidence.seeds).toBeGreaterThanOrEqual(1000);
    expect(SEEDS).toBe(1000);
  });

  it("are checked with the limits of every row of the example book", () => {
    const rows = rawSnapshot.sheets.flatMap((s) => [...s.front.rows, ...s.back.rows]);
    const registered = SHAPE_REGISTRATIONS.flatMap(({ id, cases }) => cases.map((c) => `${id} ${canonicalJson(c.limits)}`));
    for (const { shape, limits } of rows) expect(registered).toContain(`${shape} ${canonicalJson(limits)}`);
  });
});

describe.skipIf(skipTypstTests())("one book with a sheet for each shape, with the real Typst", () => {
  it("is built", async () => {
    const side = (name: string, shape: string, limits: unknown) => {
      const found = SHAPES.get(shape);
      if (!found) throw new Error("no shape");
      const worst = found.worstCase(limits);
      const face = found.face(worst.question);
      const template = [...TEMPLATES.values()].find((t) => t.faces.includes(face.kind) && t.digits >= digitPlaces(face, worst.answer.value));
      return { instruction: "Work it out.", template: template?.id, rows: [{ id: name, shape, limits, items: Math.min(template?.sides.front.places.length ?? 0, found.count(limits)) }] };
    };
    const sheets = SHAPE_REGISTRATIONS.map(({ id, cases }, i) => ({ id: `sheet-${i}`, firstPage: 2 * i + 1, front: side("front", id, cases[0].limits), back: side("back", id, cases[cases.length - 1].limits) }));
    const ids = sheets.map((sheet) => sheet.id);
    const snapshot = { format: 1, id: "all-shapes", level: { id: "level", name: "1" }, topics: [{ id: "topic", code: "1-1", title: "All shapes", sheets: ids }], sheets };
    const book = { bookId: "all-shapes", childId: "child", sheets: ids.map((sheetId) => ({ sheetId, attempt: 1, qr: { front: `${sheetId}-front`, back: `${sheetId}-back` } })) };
    const result = await buildBook({ snapshot, book }, await openRenderer(testAssets()));
    expect(result).toMatchObject({ status: "built" });
    if (result.status === "built") expect(new Set(result.items.map((item) => item.shape))).toEqual(new Set(SHAPES.keys()));
  });
});
