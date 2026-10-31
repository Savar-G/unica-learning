import { describe, expect, it } from "vitest";
import { addChildInk, applyBatch, boardPages, boardPaths, boardView, childInk, boardTargets, createScene, sameTarget, type ApplyResult, type BoardPath, type Scene, type Target } from "@/lib/board";

// Maya's board core (#315, spec #297): the model sends semantic commands, the core lays them out on a grid, computes
// carries and borrows itself, and returns ordered stroke paths for any renderer. These tests use only the public API.

let tx = 0;
/** Applies one batch and fails the test with the refusal when the core refuses it. */
function ok(scene: Scene, ...commands: unknown[]): Scene {
  const r = applyBatch(scene, { transactionId: `t${++tx}`, commands });
  if (!r.ok) throw new Error(`refused: ${r.refusal.code}: ${r.refusal.reason}`);
  return r.scene;
}

const cell = (objectId: string, rowId: string, column: string): Target => ({ objectId, part: "cell", rowId, column } as Target);

/** What the core says is in a target, from its semantic summary. */
function info(scene: Scene, target: Target) {
  const found = boardTargets(scene).find((t) => sameTarget(t.target, target));
  if (!found) throw new Error(`no target ${JSON.stringify(target)}`);
  return found;
}

const xs = (paths: BoardPath[]) => paths.flatMap((p) => p.pts.map(([x]) => x));
const top = (paths: BoardPath[]) => Math.min(...paths.flatMap((p) => p.pts.map(([, y]) => y)));
const pathsFor = (scene: Scene, target: Target) => boardPaths(scene).filter((p) => p.target !== null && sameTarget(p.target, target));

/** The x band a highlight covers: its centre line plus half its width each side. */
function band(highlight: BoardPath) {
  const x = highlight.pts[0][0];
  return { left: x - highlight.width / 2, right: x + highlight.width / 2 };
}
/** True when every stroke of the paths lies inside the band. */
const inside = (paths: BoardPath[], b: { left: number; right: number }) => paths.length > 0 && xs(paths).every((x) => x >= b.left && x <= b.right);

describe("column addition: 27 + 39 = 66", () => {
  const start = () =>
    ok(createScene(), {
      op: "columns",
      id: "sum1",
      operation: "add",
      operands: [
        { id: "top", value: "27" },
        { id: "bottom", value: "39" },
      ],
      place: { region: "main" },
    });

  it("lines the digits up by place, with an empty answer row", () => {
    const scene = start();
    expect(info(scene, cell("sum1", "top", "ones")).value).toBe("7");
    expect(info(scene, cell("sum1", "top", "tens")).value).toBe("2");
    expect(info(scene, cell("sum1", "bottom", "ones")).value).toBe("9");
    expect(info(scene, cell("sum1", "answer", "ones"))).toMatchObject({ writable: true, value: null });
    // A yellow highlight on the ones column covers the 7 and the 9, and not the 2 or the 3.
    const lit = ok(scene, { op: "mark", id: "onesGlow", target: { objectId: "sum1", part: "column", column: "ones" }, style: "highlight", ink: "yellow" });
    const glow = boardPaths(lit).find((p) => p.objectId === "onesGlow")!;
    expect(glow).toMatchObject({ kind: "highlight", layer: "behind", ink: "yellow" });
    expect(inside(pathsFor(scene, cell("sum1", "top", "ones")), band(glow))).toBe(true);
    expect(inside(pathsFor(scene, cell("sum1", "bottom", "ones")), band(glow))).toBe(true);
    expect(inside(pathsFor(scene, cell("sum1", "top", "tens")), band(glow))).toBe(false);
    expect(inside(pathsFor(scene, cell("sum1", "bottom", "tens")), band(glow))).toBe(false);
    // The operator and the rule are drawn; the answer is not.
    const kinds = boardPaths(scene).map((p) => p.glyph ?? p.kind);
    expect(kinds).toContain("+");
    expect(kinds).toContain("rule");
    expect(pathsFor(scene, cell("sum1", "answer", "ones"))).toEqual([]);
  });

  it("computes the carry itself and writes it above the tens", () => {
    let scene = start();
    scene = ok(scene, { op: "put", target: cell("sum1", "answer", "ones"), value: "6", ink: "green" });
    scene = ok(scene, { op: "regroup", id: "carry1", objectId: "sum1", rowId: "answer", kind: "carry", from: "ones", to: "tens" });
    scene = ok(scene, { op: "put", target: cell("sum1", "answer", "tens"), value: "6", ink: "green" });
    expect(info(scene, { objectId: "carry1", part: "whole" }).value).toBe("1");
    expect(info(scene, cell("sum1", "answer", "tens")).value).toBe("6");
    expect(info(scene, { objectId: "sum1", part: "row", rowId: "answer" }).value).toBe("66");

    const carry = pathsFor(scene, { objectId: "carry1", part: "whole" });
    const carryDigit = carry.filter((p) => p.glyph === "1");
    const tens = ok(scene, { op: "mark", id: "tensGlow", target: { objectId: "sum1", part: "column", column: "tens" }, style: "highlight" });
    const tensBand = band(boardPaths(tens).find((p) => p.objectId === "tensGlow")!);
    expect(inside(carryDigit, tensBand)).toBe(true);
    expect(inside(pathsFor(scene, cell("sum1", "answer", "tens")), tensBand)).toBe(true);
    expect(top(carryDigit)).toBeLessThan(top(pathsFor(scene, cell("sum1", "top", "tens"))));
    expect(carry.some((p) => p.kind === "arrow" && p.ink === "red")).toBe(true);
  });

  it("draws in command order, with timing for the renderer", () => {
    let scene = start();
    const r: ApplyResult = applyBatch(scene, {
      transactionId: "answer-ones",
      commands: [
        { op: "put", target: cell("sum1", "answer", "ones"), value: "6", ink: "green" },
        { op: "regroup", id: "carry1", objectId: "sum1", rowId: "answer", kind: "carry", from: "ones", to: "tens" },
      ],
    });
    if (!r.ok) throw new Error(r.refusal.reason);
    scene = r.scene;
    expect(r.drawn[0]).toMatchObject({ glyph: "6", ink: "green" });
    expect(r.drawn.at(-1)?.target).toEqual({ objectId: "carry1", part: "whole" });
    for (let i = 1; i < r.drawn.length; i++) expect(r.drawn[i].startMs).toBeGreaterThanOrEqual(r.drawn[i - 1].startMs + r.drawn[i - 1].durationMs);
    expect(r.drawn.every((p) => p.durationMs > 0)).toBe(true);
    // The whole board keeps the same order.
    const ids = boardPaths(scene).map((p) => p.id);
    expect(ids.slice(-r.drawn.length)).toEqual(r.drawn.map((p) => p.id));
  });
});

describe("column subtraction: 300 - 128 = 172, borrowing across zeros", () => {
  const start = () =>
    ok(createScene(), {
      op: "columns",
      id: "diff",
      operation: "subtract",
      operands: [
        { id: "top", value: "300" },
        { id: "bottom", value: "128" },
      ],
      place: { region: "main" },
    });
  const borrow = (id: string, from: string, to: string) => ({ op: "regroup", id, objectId: "diff", rowId: "top", kind: "borrow", from, to });

  it("refuses to borrow from the tens while they are 0", () => {
    const r = applyBatch(start(), { transactionId: "b", commands: [borrow("b1", "tens", "ones")] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal).toMatchObject({ index: 0, code: "not_allowed" });
  });

  it("borrows from the hundreds into the tens, then from the tens into the ones, keeping each crossed-out digit", () => {
    let scene = start();
    scene = ok(scene, borrow("b1", "hundreds", "tens"));
    expect(info(scene, cell("diff", "top", "hundreds"))).toMatchObject({ value: "2", crossedOut: ["3"] });
    expect(info(scene, cell("diff", "top", "tens"))).toMatchObject({ value: "10", crossedOut: ["0"] });
    scene = ok(scene, borrow("b2", "tens", "ones"));
    expect(info(scene, cell("diff", "top", "tens"))).toMatchObject({ value: "9", crossedOut: ["0", "10"] });
    expect(info(scene, cell("diff", "top", "ones"))).toMatchObject({ value: "10", crossedOut: ["0"] });
    // The original 300 stays written; each borrow draws strikes, its new values and an arrow.
    expect(info(scene, { objectId: "diff", part: "row", rowId: "top" }).value).toBe("300");
    for (const id of ["b1", "b2"]) {
      const kinds = pathsFor(scene, { objectId: id, part: "whole" }).map((p) => p.kind);
      expect(kinds.filter((k) => k === "strike")).toHaveLength(2);
      expect(kinds).toContain("arrow");
    }
    const b2Glyphs = pathsFor(scene, { objectId: "b2", part: "whole" }).filter((p) => p.kind === "glyph").map((p) => p.glyph);
    expect([...new Set(b2Glyphs)].sort()).toEqual(["0", "1", "9"]);
    // No borrow is left that the method needs.
    const extra = applyBatch(scene, { transactionId: "b3", commands: [borrow("b3", "hundreds", "tens")] });
    expect(extra.ok).toBe(false);

    scene = ok(scene, { op: "put", target: { objectId: "diff", part: "row", rowId: "answer" }, value: "172" });
    expect(info(scene, { objectId: "diff", part: "row", rowId: "answer" }).value).toBe("172");
  });

  it("refuses a wrong answer digit and says why", () => {
    const r = applyBatch(start(), { transactionId: "w", commands: [{ op: "put", target: cell("diff", "answer", "ones"), value: "8" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.refusal.code).toBe("wrong_value");
      expect(r.refusal.reason).toMatch(/ones digit of the answer is 2/);
    }
  });
});

describe("column multiplication", () => {
  it("34 × 6 = 204: carries the 2 from the ones and checks every digit", () => {
    let scene = ok(createScene(), {
      op: "columns",
      id: "m",
      operation: "multiply",
      operands: [
        { id: "top", value: "34" },
        { id: "by", value: "6" },
      ],
      place: { region: "main" },
    });
    expect(boardPaths(scene).some((p) => p.glyph === "×")).toBe(true);
    scene = ok(
      scene,
      { op: "put", target: cell("m", "answer", "ones"), value: "4" },
      { op: "regroup", id: "c1", objectId: "m", rowId: "answer", kind: "carry", from: "ones", to: "tens" },
    );
    expect(info(scene, { objectId: "c1", part: "whole" }).value).toBe("2");
    const wrong = applyBatch(scene, { transactionId: "x", commands: [{ op: "put", target: cell("m", "answer", "tens"), value: "8" }] });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.refusal.reason).toMatch(/tens digit of the answer is 0/);
    scene = ok(scene, { op: "put", target: cell("m", "answer", "tens"), value: "0" }, { op: "put", target: cell("m", "answer", "hundreds"), value: "2" });
    expect(info(scene, { objectId: "m", part: "row", rowId: "answer" }).value).toBe("204");
    scene = ok(scene, { op: "mark", id: "done", target: { objectId: "m", part: "row", rowId: "answer" }, style: "check" });
    expect(boardPaths(scene).filter((p) => p.objectId === "done").every((p) => p.kind === "check" && p.ink === "green")).toBe(true);
  });

  it("23 × 14 = 322: one work row per digit of the multiplier, with the placeholder zero", () => {
    let scene = ok(createScene(), {
      op: "columns",
      id: "m",
      operation: "multiply",
      operands: [
        { id: "top", value: "23" },
        { id: "by", value: "14" },
      ],
      place: { region: "main" },
    });
    const rows = boardTargets(scene).filter((t) => t.target.part === "row").map((t) => (t.target as { rowId: string }).rowId);
    expect(rows).toEqual(["top", "by", "p0", "p1", "answer"]);
    scene = ok(scene, { op: "regroup", id: "c0", objectId: "m", rowId: "p0", kind: "carry", from: "ones", to: "tens" });
    expect(info(scene, { objectId: "c0", part: "whole" }).value).toBe("1");
    scene = ok(
      scene,
      { op: "put", target: { objectId: "m", part: "row", rowId: "p0" }, value: "92" },
      { op: "put", target: cell("m", "p1", "ones"), value: "0" },
      { op: "put", target: { objectId: "m", part: "row", rowId: "answer" }, value: "322" },
    );
    const p1 = applyBatch(scene, { transactionId: "p1", commands: [{ op: "put", target: cell("m", "p1", "tens"), value: "4" }] });
    expect(p1.ok).toBe(false);
    if (!p1.ok) expect(p1.refusal.reason).toMatch(/tens digit of the work row 2 is 3/);
  });
});

const sum = (id = "sum1", place: unknown = { region: "main" }) => ({
  op: "columns",
  id,
  operation: "add",
  operands: [
    { id: "top", value: "27" },
    { id: "bottom", value: "39" },
  ],
  place,
});

describe("refused commands", () => {
  const refusal = (scene: Scene, ...commands: unknown[]) => {
    const r = applyBatch(scene, { transactionId: `r${++tx}`, commands });
    if (r.ok) throw new Error("expected a refusal");
    return r.refusal;
  };

  it("refuses an unknown op, a coordinate and a model-supplied carry value", () => {
    expect(refusal(createScene(), { op: "explode" })).toMatchObject({ index: 0, code: "invalid_command" });
    expect(refusal(createScene(), { ...sum(), x: 120, y: 40 })).toMatchObject({ code: "invalid_command", reason: expect.stringMatching(/unknown field "x"/) });
    const scene = ok(createScene(), sum());
    expect(refusal(scene, { op: "regroup", id: "c", objectId: "sum1", rowId: "answer", kind: "carry", from: "ones", to: "tens", value: "1" })).toMatchObject({
      code: "invalid_command",
      reason: expect.stringMatching(/unknown field "value"/),
    });
    // A model with no model data is refused, not drawn.
    expect(refusal(scene, { op: "model", id: "m" })).toMatchObject({ code: "invalid_command" });
    // Columns check the value the model writes, so a put there needs one.
    expect(refusal(scene, { op: "put", target: cell("sum1", "answer", "ones") })).toMatchObject({ code: "invalid_command" });
  });

  it("refuses an unknown target and lists the valid ones", () => {
    const scene = ok(createScene(), sum());
    const r = refusal(scene, { op: "mark", id: "m", target: cell("sum1", "answer", "thousands"), style: "circle" });
    expect(r.code).toBe("unknown_target");
    expect(r.valid?.some((t) => sameTarget(t.target, cell("sum1", "answer", "ones")))).toBe(true);
    expect(refusal(scene, { op: "put", target: cell("nope", "answer", "ones"), value: "6" })).toMatchObject({ code: "unknown_target" });
  });

  it("refuses a carry where there is none, a check on an unfinished answer, and a reused id", () => {
    const small = ok(createScene(), { ...sum("s"), operands: [{ id: "top", value: "12" }, { id: "bottom", value: "34" }] });
    expect(refusal(small, { op: "regroup", id: "c", objectId: "s", rowId: "answer", kind: "carry", from: "ones", to: "tens" })).toMatchObject({
      code: "not_allowed",
      reason: expect.stringMatching(/no carry from the ones/),
    });
    const scene = ok(createScene(), sum());
    expect(refusal(scene, { op: "regroup", id: "c", objectId: "sum1", rowId: "answer", kind: "carry", from: "tens", to: "hundreds" })).toMatchObject({ code: "unknown_target" });
    expect(refusal(scene, { op: "mark", id: "ok", target: { objectId: "sum1", part: "row", rowId: "answer" }, style: "check" })).toMatchObject({ code: "not_allowed" });
    expect(refusal(scene, sum("sum1"))).toMatchObject({ code: "duplicate_id" });
  });

  it("applies a batch all or none", () => {
    const scene = ok(createScene(), sum());
    const r = refusal(scene, { op: "put", target: cell("sum1", "answer", "ones"), value: "6" }, { op: "put", target: cell("sum1", "answer", "tens"), value: "5" });
    expect(r).toMatchObject({ index: 1, code: "wrong_value" });
    expect(info(scene, cell("sum1", "answer", "ones")).value).toBeNull();
  });
});

describe("the child's ink is protected", () => {
  /** A short stroke the child draws, in board widths. */
  const scribble = (x: number, y: number) => ({ erase: false, w: 3, pts: [[x, y], [x + 0.05, y + 0.02]] as [number, number][] });

  it("cannot be removed, undone or cleared by Maya", () => {
    let scene = ok(createScene(), sum());
    const drawn = addChildInk(scene, { page: 1, stroke: scribble(0.6, 0.3), boardWidth: 800 });
    scene = drawn.scene;
    const r = applyBatch(scene, { transactionId: "rm", commands: [{ op: "remove", objectId: drawn.id }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal.code).toBe("protected_ink");

    scene = ok(scene, { op: "mark", id: "glow", target: { objectId: "sum1", part: "column", column: "ones" }, style: "highlight" });
    const marked = `t${tx}`;
    scene = ok(scene, { op: "undo", transactionId: marked });
    expect(boardPaths(scene).some((p) => p.objectId === "glow")).toBe(false);
    scene = ok(scene, { op: "clear", scope: "maya_annotations" });
    scene = ok(scene, { op: "clear", scope: "maya_objects" });
    expect(boardPaths(scene)).toEqual([]);
    expect(boardTargets(scene)).toEqual([]);
    expect(childInk(scene)).toEqual([{ id: drawn.id, page: 1, stroke: scribble(0.6, 0.3), boardWidth: 800 }]);
  });

  it("is never covered: new work goes around it, and an undo that would cover it is refused", () => {
    // The child writes in the top-left corner, where the first object would go.
    const inked = addChildInk(createScene(), { page: 1, stroke: scribble(0.06, 0.06), boardWidth: 800 }).scene;
    const scene = ok(inked, sum());
    const pts = boardPaths(scene).flatMap((p) => p.pts);
    const box = { left: Math.min(...pts.map(([x]) => x)), right: Math.max(...pts.map(([x]) => x)), top: Math.min(...pts.map(([, y]) => y)), bottom: Math.max(...pts.map(([, y]) => y)) };
    const covers = (x: number, y: number) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    expect(covers(0.06, 0.06) || covers(0.11, 0.08)).toBe(false);
    // Without the child's ink, the sum goes in that corner.
    const plain = boardPaths(ok(createScene(), sum())).flatMap((p) => p.pts);
    expect(Math.min(...plain.map(([x]) => x))).toBeLessThan(0.06);

    // Maya clears her sum, the child writes where it was, and Maya tries to undo the clear.
    let board = ok(createScene(), sum());
    board = ok(board, { op: "clear", scope: "maya_objects" });
    const cleared = `t${tx}`;
    board = addChildInk(board, { page: 1, stroke: scribble(0.1, 0.1), boardWidth: 800 }).scene;
    const r = applyBatch(board, { transactionId: "back", commands: [{ op: "undo", transactionId: cleared }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal.code).toBe("unsafe_undo");
  });
});

describe("Maya's own history", () => {
  it("undo takes back a whole transaction, and refuses when later work depends on it", () => {
    let scene = ok(createScene(), sum());
    const created = `t${tx}`;
    scene = ok(scene, { op: "put", target: cell("sum1", "answer", "ones"), value: "6" }, { op: "regroup", id: "carry1", objectId: "sum1", rowId: "answer", kind: "carry", from: "ones", to: "tens" });
    const step = `t${tx}`;
    const unsafe = applyBatch(scene, { transactionId: "u1", commands: [{ op: "undo", transactionId: created }] });
    expect(unsafe.ok).toBe(false);
    if (!unsafe.ok) expect(unsafe.refusal.code).toBe("unsafe_undo");

    const r = applyBatch(scene, { transactionId: "u2", commands: [{ op: "undo", transactionId: step }] });
    if (!r.ok) throw new Error(r.refusal.reason);
    expect(info(r.scene, cell("sum1", "answer", "ones")).value).toBeNull();
    expect(boardTargets(r.scene).some((t) => t.target.objectId === "carry1")).toBe(false);
    expect(r.erased.length).toBeGreaterThan(0);
    expect(r.erased.every((id) => !boardPaths(r.scene).some((p) => p.id === id))).toBe(true);
    // The sum did not move.
    expect(boardPaths(r.scene)).toEqual(boardPaths(scene).filter((p) => !r.erased.includes(p.id)));
  });

  it("remove takes away one annotation, or an object with everything on it", () => {
    let scene = ok(
      createScene(),
      sum(),
      { op: "mark", id: "glow", target: { objectId: "sum1", part: "column", column: "ones" }, style: "highlight" },
      { op: "mark", id: "ring", target: cell("sum1", "top", "ones"), style: "circle" },
    );
    scene = ok(scene, { op: "remove", objectId: "glow" });
    expect(boardPaths(scene).some((p) => p.objectId === "glow")).toBe(false);
    expect(boardPaths(scene).some((p) => p.objectId === "ring")).toBe(true);
    scene = ok(scene, { op: "remove", objectId: "sum1" });
    expect(boardPaths(scene)).toEqual([]);
  });
});

describe("layout and pages", () => {
  it("places work below earlier work, and moves to a new board page when the page is full", () => {
    let scene = ok(createScene(), sum("a"));
    scene = ok(scene, sum("b", { below: "a" }));
    const aTop = top(boardPaths(scene).filter((p) => p.objectId === "a"));
    const bTop = top(boardPaths(scene).filter((p) => p.objectId === "b"));
    expect(bTop).toBeGreaterThan(aTop);
    expect(boardPages(scene)).toBe(1);

    // Each sum is 4 cells tall; a 16-row page holds 3 stacked with gaps. The fourth goes to page 2.
    scene = ok(scene, sum("c", { below: "b" }));
    const r = applyBatch(scene, { transactionId: "d", commands: [sum("d", { below: "c" })] });
    if (!r.ok) throw new Error(r.refusal.reason);
    expect(r.notices).toEqual([{ kind: "new_page", objectId: "d", page: 2 }]);
    expect(boardPages(r.scene)).toBe(2);
    expect(boardView(r.scene).page).toBe(2);
    expect(r.drawn.every((p) => p.page === 2)).toBe(true);
    expect(boardPaths(r.scene).filter((p) => p.objectId === "a").every((p) => p.page === 1)).toBe(true);
    // Shapes on page 2 start at the top again.
    expect(top(r.drawn)).toBeCloseTo(aTop, 6);
  });

  it("slides down past a taller neighbour before it starts a new page", () => {
    // A 300 - 128 to the right of the sum is taller than the sum, so the row under the sum is blocked by it.
    let scene = ok(createScene(), sum());
    scene = ok(scene, { op: "columns", id: "d", operation: "subtract", operands: [{ id: "top", value: "300" }, { id: "bottom", value: "128" }], place: { rightOf: "sum1" } });
    scene = ok(scene, { op: "write", id: "eq", text: "27 + 39 = 66", place: { below: "sum1" } });
    expect(boardPages(scene)).toBe(1);
    const sumLeft = Math.min(...xs(boardPaths(scene).filter((p) => p.objectId === "sum1")));
    const eq = boardPaths(scene).filter((p) => p.objectId === "eq");
    expect(top(eq)).toBeGreaterThan(Math.max(...boardPaths(scene).filter((p) => p.objectId === "d").flatMap((p) => p.pts.map(([, y]) => y))));
    expect(Math.min(...xs(eq))).toBeLessThan(sumLeft + 1 / 24);
  });

  it("refuses an object too big for any page", () => {
    const tiny = createScene({ page: { cols: 6, rows: 6 } });
    const r = applyBatch(tiny, { transactionId: "big", commands: [{ ...sum(), operands: [{ id: "top", value: "1234567" }, { id: "bottom", value: "1" }] }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal.code).toBe("no_room");
  });

  it("writes a note with word targets, draws an arrow between targets, and focuses a target", () => {
    let scene = ok(createScene(), sum(), { op: "write", id: "eq", text: "27 + 39 = 66", place: { below: "sum1" } });
    expect(info(scene, { objectId: "eq", part: "word", index: 4 }).value).toBe("66");
    expect(boardPaths(scene).filter((p) => p.objectId === "eq" && p.glyph === "6")).not.toHaveLength(0);
    scene = ok(scene, { op: "arrow", id: "link", from: cell("sum1", "top", "ones"), to: { objectId: "eq", part: "word", index: 0 } });
    expect(boardPaths(scene).filter((p) => p.objectId === "link").map((p) => p.kind)).toEqual(["arrow", "arrow", "arrow"]);
    scene = ok(scene, { op: "focus", target: { objectId: "eq", part: "whole" } });
    expect(boardView(scene)).toEqual({ page: 1, target: { objectId: "eq", part: "whole" } });
    // Relief SingleLine (D-182) has letters, so Maya can write words; a sign outside the font is still refused.
    const letters = applyBatch(scene, { transactionId: "abc", commands: [{ op: "write", id: "w", text: "carry", place: { region: "main" } }] });
    expect(letters.ok).toBe(true);
    const unknown = applyBatch(scene, { transactionId: "abd", commands: [{ op: "write", id: "u", text: "\u2603", place: { region: "main" } }] });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.refusal.code).toBe("unsupported");
  });
});

describe("review fixes", () => {
  const refusal = (scene: Scene, ...commands: unknown[]) => {
    const r = applyBatch(scene, { transactionId: `r${++tx}`, commands });
    if (r.ok) throw new Error("expected a refusal");
    return r.refusal;
  };

  it("an undo replays a clear on the page it cleared, not the page in view", () => {
    let scene = ok(createScene(), sum("a"), { op: "mark", id: "M", target: { objectId: "a", part: "whole" }, style: "circle" });
    scene = ok(scene, sum("b", { below: "a" }), sum("c", { below: "b" }), sum("d", { below: "c" }), { op: "mark", id: "P", target: { objectId: "d", part: "whole" }, style: "circle" });
    expect(boardView(scene).page).toBe(2);
    scene = ok(scene, { op: "focus", target: { objectId: "a", part: "whole" } });
    const focused = `t${tx}`;
    scene = ok(scene, { op: "clear", scope: "maya_annotations" });
    scene = ok(scene, { op: "undo", transactionId: focused });
    const marks = boardPaths(scene).map((p) => p.objectId);
    expect(marks).not.toContain("M");
    expect(marks).toContain("P");
  });

  it("gives a reused id new path ids, so a renderer redraws it", () => {
    const scene = ok(createScene(), sum(), { op: "mark", id: "M", target: { objectId: "sum1", part: "column", column: "ones" }, style: "highlight" });
    const r = applyBatch(scene, {
      transactionId: "move",
      commands: [
        { op: "remove", objectId: "M" },
        { op: "mark", id: "M", target: { objectId: "sum1", part: "column", column: "tens" }, style: "highlight" },
      ],
    });
    if (!r.ok) throw new Error(r.refusal.reason);
    expect(r.drawn.map((p) => p.objectId)).toEqual(["M"]);
    expect(r.erased).toHaveLength(1);
  });

  it("refuses a check on anything but a finished answer", () => {
    const scene = ok(createScene(), sum());
    expect(refusal(scene, { op: "mark", id: "k", target: { objectId: "sum1", part: "whole" }, style: "check" }).code).toBe("not_allowed");
    expect(refusal(scene, { op: "mark", id: "k", target: { objectId: "sum1", part: "column", column: "ones" }, style: "check" }).code).toBe("not_allowed");
    expect(refusal(scene, { op: "mark", id: "k", target: cell("sum1", "top", "ones"), style: "check" }).code).toBe("not_allowed");
    const done = ok(scene, { op: "put", target: { objectId: "sum1", part: "row", rowId: "answer" }, value: "66" });
    ok(done, { op: "mark", id: "k", target: { objectId: "sum1", part: "whole" }, style: "check" });
  });

  it("lets an undo through when later work does not depend on it", () => {
    let scene = ok(createScene(), sum());
    scene = ok(scene, { op: "mark", id: "glow", target: { objectId: "sum1", part: "column", column: "ones" }, style: "highlight" });
    const glow = `t${tx}`;
    scene = ok(scene, { op: "put", target: cell("sum1", "answer", "ones"), value: "6" });
    scene = ok(scene, { op: "undo", transactionId: glow });
    expect(boardPaths(scene).some((p) => p.objectId === "glow")).toBe(false);
    expect(info(scene, cell("sum1", "answer", "ones")).value).toBe("6");
    // A later check depends on the answer it checks: undoing that answer is refused, not thrown.
    scene = ok(scene, { op: "put", target: cell("sum1", "answer", "tens"), value: "6" });
    const tens = `t${tx}`;
    scene = ok(scene, { op: "mark", id: "k", target: { objectId: "sum1", part: "row", rowId: "answer" }, style: "check" });
    expect(refusal(scene, { op: "undo", transactionId: tens }).code).toBe("unsafe_undo");
  });

  it("refuses a page that does not exist and an arrow to itself", () => {
    const scene = ok(createScene(), sum());
    expect(refusal(scene, { op: "clear", page: 9, scope: "maya_objects" }).code).toBe("unknown_target");
    expect(refusal(scene, { op: "arrow", id: "a", from: cell("sum1", "top", "ones"), to: cell("sum1", "top", "ones") }).code).toBe("not_allowed");
  });

  it("places work near a named target", () => {
    let scene = ok(createScene(), sum());
    scene = ok(scene, { op: "write", id: "n", text: "6 + 9", place: { near: cell("sum1", "answer", "ones"), side: "right" } });
    const sumPts = boardPaths(scene).filter((p) => p.objectId === "sum1" || p.objectId === "n");
    const noteXs = xs(sumPts.filter((p) => p.objectId === "n"));
    const sumXs = xs(sumPts.filter((p) => p.objectId === "sum1"));
    expect(Math.min(...noteXs)).toBeGreaterThan(Math.max(...sumXs));
    expect(boardPages(scene)).toBe(1);
  });
});

describe("second review fixes", () => {
  const refusal = (scene: Scene, ...commands: unknown[]) => {
    const r = applyBatch(scene, { transactionId: `r${++tx}`, commands });
    if (r.ok) throw new Error("expected a refusal");
    return r.refusal;
  };
  /** Applies a batch that must succeed and returns the whole result. */
  const applied = (scene: Scene, ...commands: unknown[]) => {
    const r = applyBatch(scene, { transactionId: `t${++tx}`, commands });
    if (!r.ok) throw new Error(`refused: ${r.refusal.code}: ${r.refusal.reason}`);
    return r;
  };
  /** The child draws along the points, on an 800-pixel board. */
  const childStroke = (scene: Scene, pts: [number, number][], w = 3) => addChildInk(scene, { page: 1, stroke: { erase: false, w, pts }, boardWidth: 800 }).scene;

  /** Distance from a point to a segment. */
  function toSegment(p: [number, number], a: [number, number], b: [number, number]) {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const d = dx * dx + dy * dy;
    const t = d === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / d));
    return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
  }
  /** The closest two polylines come, checked at their points and at a few points along each segment. */
  function gap(a: [number, number][], b: [number, number][]) {
    const dense = (pts: [number, number][]) =>
      pts.flatMap((p, i) => (i === 0 ? [p] : [0.25, 0.5, 0.75, 1].map((t): [number, number] => [pts[i - 1][0] + (p[0] - pts[i - 1][0]) * t, pts[i - 1][1] + (p[1] - pts[i - 1][1]) * t])));
    const one = (pts: [number, number][], line: [number, number][]) =>
      Math.min(...dense(pts).map((p) => (line.length === 1 ? Math.hypot(p[0] - line[0][0], p[1] - line[0][1]) : Math.min(...line.slice(1).map((end, i) => toSegment(p, line[i], end))))));
    return Math.min(one(a, b), one(b, a));
  }
  /** True when the two strokes touch, counting their widths. */
  const touch = (a: BoardPath, b: BoardPath) => gap(a.pts, b.pts) < (a.width + b.width) / 2;

  describe("R4: ids that are names of object properties", () => {
    it("refuses an unknown id such as constructor with a typed refusal", () => {
      const scene = ok(createScene(), sum());
      for (const id of ["constructor", "toString", "hasOwnProperty", "valueOf"]) {
        expect(refusal(scene, { op: "remove", objectId: id }).code).toBe("unknown_target");
        expect(refusal(scene, { op: "put", target: cell(id, "answer", "ones"), value: "6" }).code).toBe("unknown_target");
        expect(refusal(scene, { op: "mark", id: "m", target: { objectId: id, part: "whole" }, style: "circle" }).code).toBe("unknown_target");
      }
    });

    it("creates, removes and undoes objects and carries with those ids", () => {
      let scene = ok(createScene(), { op: "write", id: "constructor", text: "1", place: { region: "main" } });
      scene = ok(scene, { op: "remove", objectId: "constructor" });
      expect(boardPaths(scene)).toEqual([]);
      scene = ok(scene, sum());
      scene = ok(scene, { op: "regroup", id: "toString", objectId: "sum1", rowId: "answer", kind: "carry", from: "ones", to: "tens" });
      const carried = `t${tx}`;
      expect(info(scene, { objectId: "toString", part: "whole" }).value).toBe("1");
      const removed = ok(scene, { op: "remove", objectId: "toString" });
      expect(boardPaths(removed).some((p) => p.objectId === "toString")).toBe(false);
      const undone = ok(scene, { op: "undo", transactionId: carried });
      expect(boardPaths(undone).some((p) => p.objectId === "toString")).toBe(false);
    });
  });

  describe("R2: clearing annotations", () => {
    it("erases carries with the marks, and an undo brings back exactly the same strokes", () => {
      let scene = ok(createScene(), sum());
      scene = ok(scene, { op: "regroup", id: "carry1", objectId: "sum1", rowId: "answer", kind: "carry", from: "ones", to: "tens" }, { op: "mark", id: "ring", target: cell("sum1", "top", "ones"), style: "circle" });
      const before = boardPaths(scene);
      const r = applied(scene, { op: "clear", scope: "maya_annotations" });
      expect(boardPaths(r.scene).filter((p) => p.objectId === "carry1" || p.objectId === "ring")).toEqual([]);
      expect(boardTargets(r.scene).some((t) => t.target.objectId === "carry1")).toBe(false);
      expect(r.erased).toHaveLength(before.filter((p) => p.objectId === "carry1" || p.objectId === "ring").length);
      // The math stays.
      expect(info(r.scene, cell("sum1", "top", "ones")).value).toBe("7");
      const back = ok(r.scene, { op: "undo", transactionId: `t${tx}` });
      expect(boardPaths(back)).toEqual(before);
    });

    it("erases a borrow chain and shows the original top number again", () => {
      let scene = ok(createScene(), { op: "columns", id: "diff", operation: "subtract", operands: [{ id: "top", value: "300" }, { id: "bottom", value: "128" }], place: { region: "main" } });
      const plain = boardPaths(scene);
      scene = ok(
        scene,
        { op: "regroup", id: "b1", objectId: "diff", rowId: "top", kind: "borrow", from: "hundreds", to: "tens" },
        { op: "regroup", id: "b2", objectId: "diff", rowId: "top", kind: "borrow", from: "tens", to: "ones" },
      );
      expect(info(scene, cell("diff", "top", "tens")).crossedOut).toEqual(["0", "10"]);
      const borrowed = boardPaths(scene);
      scene = ok(scene, { op: "clear", scope: "maya_annotations" });
      expect(info(scene, cell("diff", "top", "hundreds"))).toMatchObject({ value: "3" });
      expect(info(scene, cell("diff", "top", "tens")).crossedOut).toBeUndefined();
      expect(info(scene, cell("diff", "top", "ones")).value).toBe("0");
      expect(boardPaths(scene)).toEqual(plain);
      // The borrows can be shown again, and an undo of the clear restores them.
      expect(boardPaths(ok(scene, { op: "undo", transactionId: `t${tx}` }))).toEqual(borrowed);
      ok(scene, { op: "regroup", id: "b3", objectId: "diff", rowId: "top", kind: "borrow", from: "hundreds", to: "tens" });
    });

    it("clears only the page it names", () => {
      let scene = ok(createScene(), sum("a"), { op: "regroup", id: "ca", objectId: "a", rowId: "answer", kind: "carry", from: "ones", to: "tens" });
      scene = ok(scene, sum("b", { below: "a" }), sum("c", { below: "b" }), sum("d", { below: "c" }));
      scene = ok(scene, { op: "regroup", id: "cd", objectId: "d", rowId: "answer", kind: "carry", from: "ones", to: "tens" });
      expect(boardView(scene).page).toBe(2);
      scene = ok(scene, { op: "clear", page: 1, scope: "maya_annotations" });
      const ids = boardPaths(scene).map((p) => p.objectId);
      expect(ids).not.toContain("ca");
      expect(ids).toContain("cd");
    });
  });

  describe("R1: Maya never draws over the child's ink", () => {
    const ring = { op: "mark", id: "ring", target: cell("sum1", "top", "ones"), style: "circle" };

    it("refuses a put, a mark and a regroup whose strokes would cross the child's ink", () => {
      const scene = ok(createScene(), sum());
      const cases: unknown[] = [
        { op: "put", target: cell("sum1", "answer", "ones"), value: "6" },
        ring,
        { op: "regroup", id: "carry1", objectId: "sum1", rowId: "answer", kind: "carry", from: "ones", to: "tens" },
      ];
      for (const cmd of cases) {
        const proposed = applied(scene, cmd);
        const inked = childStroke(scene, proposed.drawn[0].pts);
        expect(refusal(inked, cmd).code).toBe("protected_ink");
        // Ink somewhere else does not get in the way.
        ok(childStroke(scene, [[0.9, 0.6], [0.95, 0.62]]), cmd);
      }
    });

    it("routes an arrow around the child's ink, or refuses it when no route is clear", () => {
      // No carry: the lane above the top number is free for the arrow to go around.
      const scene = ok(createScene(), { ...sum(), operands: [{ id: "top", value: "21" }, { id: "bottom", value: "34" }] });
      const link = { op: "arrow", id: "link", from: cell("sum1", "top", "ones"), to: cell("sum1", "top", "tens") };
      const shaft = applied(scene, link).drawn[0].pts;
      const r = applied(childStroke(scene, shaft), link);
      const child: BoardPath = { ...r.drawn[0], pts: shaft, width: 3 / 800 };
      expect(r.drawn.length).toBe(3);
      for (const p of r.drawn) expect(touch(p, child)).toBe(false);
      // The child scribbles over the whole problem: no arrow between its digits is clear.
      const covered = childStroke(scene, [[0, 0], [0.4, 0], [0.4, 0.3], [0, 0.3], [0, 0]], 400);
      expect(refusal(covered, link).code).toBe("no_room");
    });

    it("refuses a highlight over the child's ink too", () => {
      const scene = ok(createScene(), sum());
      const glow = { op: "mark", id: "glow", target: { objectId: "sum1", part: "column", column: "ones" }, style: "highlight" };
      const proposed = applied(scene, glow);
      expect(refusal(childStroke(scene, proposed.drawn[0].pts), glow).code).toBe("protected_ink");
    });

    it("refuses an undo that would bring back a mark or a carry over the child's ink", () => {
      let scene = ok(createScene(), sum());
      const made = applied(scene, ring);
      scene = ok(made.scene, { op: "remove", objectId: "ring" });
      const removed = `t${tx}`;
      expect(refusal(childStroke(scene, made.drawn[0].pts), { op: "undo", transactionId: removed }).code).toBe("unsafe_undo");

      let carried = ok(createScene(), sum());
      const carry = applied(carried, { op: "regroup", id: "carry1", objectId: "sum1", rowId: "answer", kind: "carry", from: "ones", to: "tens" });
      carried = ok(carry.scene, { op: "remove", objectId: "carry1" });
      const dropped = `t${tx}`;
      expect(refusal(childStroke(carried, carry.drawn[0].pts), { op: "undo", transactionId: dropped }).code).toBe("unsafe_undo");
    });

    it("keeps new work clear of a thick child stroke, counting its width", () => {
      // A 200-pixel stroke on an 800-pixel board reaches 1/8 of the board width around its points.
      const scene = ok(childStroke(createScene(), [[0.02, 0.02], [0.022, 0.02]], 200), sum());
      const reach = 200 / 2 / 800;
      for (const p of boardPaths(scene)) expect(gap(p.pts, [[0.02, 0.02], [0.022, 0.02]])).toBeGreaterThanOrEqual(reach + p.width / 2);
    });

    it("needs the board width to read the child's stroke width", () => {
      expect(() => addChildInk(createScene(), { page: 1, stroke: { erase: false, w: 3, pts: [[0.1, 0.1]] }, boardWidth: 0 })).toThrow(RangeError);
    });
  });

  describe("R3: arrows go around unrelated work", () => {
    it("routes each multiplication carry arrow clear of the other carries", () => {
      let scene = ok(createScene(), { op: "columns", id: "m", operation: "multiply", operands: [{ id: "top", value: "99" }, { id: "by", value: "99" }], place: { region: "main" } });
      scene = ok(
        scene,
        { op: "regroup", id: "c0", objectId: "m", rowId: "p0", kind: "carry", from: "ones", to: "tens" },
        { op: "regroup", id: "c1", objectId: "m", rowId: "p0", kind: "carry", from: "tens", to: "hundreds" },
        { op: "regroup", id: "d0", objectId: "m", rowId: "p1", kind: "carry", from: "tens", to: "hundreds" },
        { op: "regroup", id: "d1", objectId: "m", rowId: "p1", kind: "carry", from: "hundreds", to: "thousands" },
        { op: "regroup", id: "a0", objectId: "m", rowId: "answer", kind: "carry", from: "tens", to: "hundreds" },
      );
      const paths = boardPaths(scene);
      const ids = ["c0", "c1", "d0", "d1", "a0"];
      for (const id of ids) {
        const arrows = paths.filter((p) => p.objectId === id && p.kind === "arrow");
        expect(arrows.length).toBe(3);
        // Clear of every other carry and of the digits of the problem.
        const others = paths.filter((p) => p.objectId !== id && (ids.includes(p.objectId) || p.kind === "glyph"));
        for (const a of arrows) for (const o of others) expect(touch(a, o), `${id} arrow touches ${o.id}`).toBe(false);
      }
    });

    it("routes an addition carry arrow clear of the digits", () => {
      let scene = ok(createScene(), { ...sum(), operands: [{ id: "top", value: "999" }, { id: "bottom", value: "1" }] });
      scene = ok(
        scene,
        { op: "regroup", id: "k0", objectId: "sum1", rowId: "answer", kind: "carry", from: "ones", to: "tens" },
        { op: "regroup", id: "k1", objectId: "sum1", rowId: "answer", kind: "carry", from: "tens", to: "hundreds" },
        { op: "regroup", id: "k2", objectId: "sum1", rowId: "answer", kind: "carry", from: "hundreds", to: "thousands" },
      );
      const paths = boardPaths(scene);
      for (const a of paths.filter((p) => p.kind === "arrow"))
        for (const o of paths.filter((p) => p.objectId !== a.objectId && (p.kind === "glyph" || p.objectId.startsWith("k")))) expect(touch(a, o), `${a.id} touches ${o.id}`).toBe(false);
    });

    it("routes a common arrow around an object between its ends", () => {
      const note = (id: string, place: unknown) => ({ op: "write", id, text: "1", place });
      let scene = ok(createScene(), note("a", { region: "main" }), note("b", { below: "a" }), note("c", { below: "b" }));
      scene = ok(scene, { op: "arrow", id: "link", from: { objectId: "a", part: "whole" }, to: { objectId: "c", part: "whole" } });
      const paths = boardPaths(scene);
      const arrow = paths.filter((p) => p.objectId === "link");
      expect(arrow.length).toBe(3);
      for (const a of arrow) for (const o of paths.filter((p) => p.objectId === "b")) expect(touch(a, o)).toBe(false);
      // It goes around b's whole cell, not through its blank part.
      const bCell = Math.floor(Math.min(...xs(paths.filter((p) => p.objectId === "b"))) * 24) / 24;
      const bTop = Math.floor(top(paths.filter((p) => p.objectId === "b")) * 24) / 24;
      const inB = ([x, y]: [number, number]) => x > bCell && x < bCell + 1 / 24 && y > bTop && y < bTop + 1 / 24;
      expect(arrow.flatMap((p) => p.pts).some(inB)).toBe(false);
    });

    it("routes an arrow around an unrelated circle", () => {
      const note = (id: string, place: unknown) => ({ op: "write", id, text: "1", place });
      let scene = ok(createScene(), note("a", { region: "main" }), note("b", { below: "a" }), note("c", { below: "b" }));
      scene = ok(scene, { op: "mark", id: "ring", target: { objectId: "b", part: "whole" }, style: "circle" });
      scene = ok(scene, { op: "arrow", id: "link", from: { objectId: "a", part: "whole" }, to: { objectId: "c", part: "whole" } });
      const paths = boardPaths(scene);
      const circle = paths.find((p) => p.objectId === "ring")!;
      for (const a of paths.filter((p) => p.objectId === "link")) expect(touch(a, circle)).toBe(false);
    });

    it("draws an arrow from any digit of the numbers to any digit of the answer, clear of the other digits", () => {
      const scene = ok(createScene(), { ...sum(), operands: [{ id: "top", value: "123" }, { id: "bottom", value: "456" }] });
      const columns = ["ones", "tens", "hundreds"];
      for (const row of ["top", "bottom"])
        for (const from of columns)
          for (const to of columns) {
            const r = applyBatch(scene, { transactionId: "arrow", commands: [{ op: "arrow", id: "link", from: cell("sum1", row, from), to: cell("sum1", "answer", to) }] });
            expect(r.ok, `${row} ${from} to answer ${to}`).toBe(true);
            if (!r.ok) continue;
            const paths = boardPaths(r.scene);
            const digits = paths.filter((p) => p.kind === "glyph" && p.target !== null && !sameTarget(p.target, cell("sum1", row, from)));
            for (const a of paths.filter((p) => p.objectId === "link")) for (const d of digits) expect(touch(a, d), `${row} ${from} to answer ${to}`).toBe(false);
          }
    });

    it("keeps the arrow's route when the board changes later", () => {
      let scene = ok(createScene(), sum());
      const r = applied(scene, { op: "arrow", id: "link", from: cell("sum1", "top", "ones"), to: cell("sum1", "bottom", "tens") });
      scene = ok(r.scene, { op: "write", id: "n", text: "6", place: { rightOf: "sum1" } });
      expect(boardPaths(scene).filter((p) => p.objectId === "link")).toEqual(boardPaths(r.scene).filter((p) => p.objectId === "link"));
    });
  });

  describe("R3 round 2: arrows keep clear of math that comes later", () => {
    const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    /** True when two polylines cross exactly, or come closer than their half widths. */
    function collide(a: BoardPath, b: BoardPath) {
      for (let i = 1; i < a.pts.length; i++)
        for (let j = 1; j < b.pts.length; j++) {
          const [p, q, r, s] = [a.pts[i - 1], a.pts[i], b.pts[j - 1], b.pts[j]];
          if (cross(p, q, r) * cross(p, q, s) < 0 && cross(r, s, p) * cross(r, s, q) < 0) return true;
        }
      return touch(a, b);
    }
    /** The common arrow's strokes that collide with digits, carries, borrows or strikes. */
    function arrowCollisions(scene: Scene, arrowId: string) {
      const paths = boardPaths(scene);
      const others = paths.filter((p) => p.objectId !== arrowId && p.kind !== "rule" && p.kind !== "highlight");
      return paths.filter((p) => p.objectId === arrowId).flatMap((a) => others.filter((o) => collide(a, o)).map((o) => `${a.id} x ${o.id}`));
    }
    const sum27 = () => ok(createScene(), { op: "columns", id: "m", operation: "add", operands: [{ id: "top", value: "27" }, { id: "bottom", value: "39" }], place: { region: "main" } });
    const link = { op: "arrow", id: "link", from: cell("m", "bottom", "ones"), to: cell("m", "bottom", "tens") };
    const put66 = { op: "put", target: { objectId: "m", part: "row", rowId: "answer" }, value: "66" };

    it("an arrow between the digits of 39 never runs through the answer 66 written later", () => {
      const after = ok(ok(sum27(), link), put66);
      expect(arrowCollisions(after, "link")).toEqual([]);
      // The same in one batch, and with the answer written first.
      expect(arrowCollisions(ok(sum27(), link, put66), "link")).toEqual([]);
      expect(arrowCollisions(ok(ok(sum27(), put66), link), "link")).toEqual([]);
    });

    it("an undo that brings back the arrow after the answer is written brings it back clear of the answer", () => {
      let scene = ok(ok(sum27(), link), { op: "remove", objectId: "link" });
      const removal = `t${tx}`;
      scene = ok(ok(scene, put66), { op: "undo", transactionId: removal });
      expect(boardPaths(scene).filter((p) => p.objectId === "link").length).toBe(3);
      expect(arrowCollisions(scene, "link")).toEqual([]);
    });

    it("an arrow to a borrowed value leaves room for the next borrow, which crosses that value out", () => {
      let scene = ok(createScene(), { op: "columns", id: "m", operation: "subtract", operands: [{ id: "top", value: "300" }, { id: "by", value: "128" }], place: { region: "main" } });
      scene = ok(scene, { op: "regroup", id: "b1", objectId: "m", rowId: "top", kind: "borrow", from: "hundreds", to: "tens" });
      scene = ok(scene, { op: "arrow", id: "link", from: { objectId: "m", part: "row", rowId: "answer" }, to: { objectId: "b1", part: "whole" } });
      scene = ok(scene, { op: "regroup", id: "b2", objectId: "m", rowId: "top", kind: "borrow", from: "tens", to: "ones" }, { op: "put", target: { objectId: "m", part: "row", rowId: "answer" }, value: "172" });
      expect(arrowCollisions(scene, "link")).toEqual([]);
    });

    /** Notes a and c, with the arrow between them run straight through the cell where note b was. */
    const throughB = () => {
      const note = (id: string, place: unknown) => ({ op: "write", id, text: "1", place });
      let scene = ok(createScene(), note("a", { region: "main" }), note("b", { below: "a" }), note("c", { below: "b" }));
      scene = ok(scene, { op: "remove", objectId: "b" });
      const removal = `t${tx}`;
      scene = ok(scene, { op: "arrow", id: "link", from: { objectId: "a", part: "whole" }, to: { objectId: "c", part: "whole" } });
      return { scene, removal };
    };

    it("refuses an undo that would bring back an object onto an arrow drawn since, and keeps the board", () => {
      const { scene, removal } = throughB();
      const r = applyBatch(scene, { transactionId: `u${++tx}`, commands: [{ op: "undo", transactionId: removal }] });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.refusal.code).toBe("unsafe_undo");
      expect(boardPaths(scene).some((p) => p.objectId === "b")).toBe(false);
    });

    it("places a new object past an arrow, not on it", () => {
      const { scene } = throughB();
      const placed = ok(scene, { op: "write", id: "n", text: "1", place: { below: "a" } });
      expect(boardPaths(placed).filter((p) => p.objectId === "n").length).toBeGreaterThan(0);
      expect(arrowCollisions(placed, "link")).toEqual([]);
    });

    it("refuses a later mark whose strokes would run through an arrow, naming the arrow", () => {
      const note = (id: string, place: unknown) => ({ op: "write", id, text: "1", place });
      let scene = ok(createScene(), note("a", { region: "main" }), note("b", { below: "a" }), note("c", { below: "b" }));
      scene = ok(scene, { op: "arrow", id: "link", from: { objectId: "a", part: "whole" }, to: { objectId: "c", part: "whole" } });
      const r = applyBatch(scene, { transactionId: `m${++tx}`, commands: [{ op: "focus", target: { objectId: "a", part: "whole" } }, { op: "mark", id: "ring", target: { objectId: "b", part: "whole" }, style: "circle" }] });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.refusal).toMatchObject({ index: 1, code: "not_allowed" });
      if (!r.ok) expect(r.refusal.reason).toContain('"link"');
      // A mark on the arrow's own end may meet it: the arrow has to reach that end.
      const ended = ok(scene, { op: "mark", id: "end", target: { objectId: "c", part: "whole" }, style: "circle" });
      expect(boardPaths(ended).some((p) => p.objectId === "end")).toBe(true);
    });

    const row = (rowId: string) => ({ objectId: "m", part: "row", rowId });
    const carry = (id: string, rowId: string, from: string, to: string) => ({ op: "regroup", id, objectId: "m", rowId, kind: "carry", from, to });
    const borrow = (id: string, from: string, to: string) => ({ op: "regroup", id, objectId: "m", rowId: "top", kind: "borrow", from, to });
    const problems = [
      { name: "27 + 39", operation: "add", values: ["27", "39"], rest: [carry("k", "answer", "ones", "tens"), { op: "put", target: row("answer"), value: "66" }] },
      {
        name: "300 - 128",
        operation: "subtract",
        values: ["300", "128"],
        rest: [borrow("b1", "hundreds", "tens"), borrow("b2", "tens", "ones"), { op: "put", target: row("answer"), value: "172" }],
      },
      {
        name: "23 × 14",
        operation: "multiply",
        values: ["23", "14"],
        rest: [
          carry("k0", "p0", "ones", "tens"),
          { op: "put", target: row("p0"), value: "92" },
          { op: "put", target: row("p1"), value: "230" },
          carry("k1", "answer", "tens", "hundreds"),
          { op: "put", target: row("answer"), value: "322" },
        ],
      },
    ];
    /** Every cell of the problem, written or not. */
    const cells = (scene: Scene) => boardTargets(scene).filter((t) => t.target.part === "cell").map((t) => t.target);

    for (const p of problems)
      it(`${p.name}: an arrow between any two cells stays clear of every digit, carry and borrow written after it`, () => {
        const start = ok(createScene(), { op: "columns", id: "m", operation: p.operation, operands: [{ id: "top", value: p.values[0] }, { id: "by", value: p.values[1] }], place: { region: "main" } });
        let routed = 0;
        for (const from of cells(start))
          for (const to of cells(start)) {
            if (sameTarget(from, to)) continue;
            const arrow = { op: "arrow", id: "link", from, to };
            const label = `${JSON.stringify(from)} to ${JSON.stringify(to)}`;
            const r = applyBatch(start, { transactionId: `a${++tx}`, commands: [arrow] });
            if (!r.ok) {
              expect(r.refusal.code, label).toBe("no_room");
              continue;
            }
            routed++;
            // In later batches, one step at a time: every step is accepted and nothing it writes meets the arrow.
            let later = r.scene;
            for (const step of p.rest) later = ok(later, step);
            expect(arrowCollisions(later, "link"), label).toEqual([]);
            // In one batch with the arrow first: the same.
            expect(arrowCollisions(ok(start, arrow, ...p.rest), "link"), label).toEqual([]);
          }
        expect(routed).toBeGreaterThan(0);
      });
  });
});
