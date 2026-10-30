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
    expect(refusal(scene, { op: "division", id: "d" })).toMatchObject({ code: "unsupported" });
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
    const drawn = addChildInk(scene, { page: 1, stroke: scribble(0.6, 0.3) });
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
    expect(childInk(scene)).toEqual([{ id: drawn.id, page: 1, stroke: scribble(0.6, 0.3) }]);
  });

  it("is never covered: new work goes around it, and an undo that would cover it is refused", () => {
    // The child writes in the top-left corner, where the first object would go.
    const inked = addChildInk(createScene(), { page: 1, stroke: scribble(0.06, 0.06) }).scene;
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
    board = addChildInk(board, { page: 1, stroke: scribble(0.1, 0.1) }).scene;
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
    const letters = applyBatch(scene, { transactionId: "abc", commands: [{ op: "write", id: "w", text: "carry", place: { region: "main" } }] });
    expect(letters.ok).toBe(false);
    if (!letters.ok) expect(letters.refusal.code).toBe("unsupported");
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
