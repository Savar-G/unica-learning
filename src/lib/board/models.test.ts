import { describe, expect, it } from "vitest";
import { addChildInk, applyBatch, boardPages, boardPaths, boardTargets, childInk, createScene, sameTarget, PLACEHOLDER_GLYPHS, type BoardPath, type GlyphSet, type Scene, type Target } from "@/lib/board";

// Math models on the board (#318, spec #297): the model names a closed kind with bounded fields, and the core computes
// every count, position and named part from them. These tests use only the public API.

let tx = 0;
function ok(scene: Scene, ...commands: unknown[]): Scene {
  const r = applyBatch(scene, { transactionId: `m${++tx}`, commands });
  if (!r.ok) throw new Error(`refused: ${r.refusal.code}: ${r.refusal.reason}`);
  return r.scene;
}
function refusal(scene: Scene, ...commands: unknown[]) {
  const r = applyBatch(scene, { transactionId: `m${++tx}`, commands });
  if (r.ok) throw new Error("expected a refusal");
  return r.refusal;
}

const model = (id: string, spec: Record<string, unknown>, place: unknown = { region: "main" }) => ({ op: "model", id, model: spec, place });
const piece = (objectId: string, name: string): Target => ({ objectId, part: "piece", piece: name });
const whole = (objectId: string): Target => ({ objectId, part: "whole" });

function info(scene: Scene, target: Target) {
  const found = boardTargets(scene).find((t) => sameTarget(t.target, target));
  if (!found) throw new Error(`no target ${JSON.stringify(target)}`);
  return found;
}
const has = (scene: Scene, target: Target) => boardTargets(scene).some((t) => sameTarget(t.target, target));
const pathsFor = (scene: Scene, target: Target) => boardPaths(scene).filter((p) => p.target !== null && sameTarget(p.target, target));

/** The box around some strokes, in board widths. */
function box(paths: BoardPath[]) {
  const pts = paths.flatMap((p) => p.pts);
  if (pts.length === 0) throw new Error("no strokes");
  const xs = pts.map(([x]) => x);
  const ys = pts.map(([, y]) => y);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}
/** True when every point of the inner strokes lies inside the outer box. */
const within = (inner: BoardPath[], outer: ReturnType<typeof box>) =>
  inner.length > 0 && inner.every((p) => p.pts.every(([x, y]) => x >= outer.left - 1e-6 && x <= outer.right + 1e-6 && y >= outer.top - 1e-6 && y <= outer.bottom + 1e-6));
/** The box a highlight mark covers: its line plus half its width each side. */
function highlightBox(scene: Scene, markId: string) {
  const h = boardPaths(scene).find((p) => p.objectId === markId && p.kind === "highlight")!;
  const b = box([h]);
  return { left: b.left - h.width / 2, right: b.right + h.width / 2, top: b.top - h.width / 2, bottom: b.bottom + h.width / 2 };
}

describe("base-ten blocks: 245", () => {
  const start = () => ok(createScene(), model("blocks", { kind: "base_ten", hundreds: 2, tens: 4, ones: 5 }));

  it("draws 2 flats, 4 rods and 5 cubes, each a named target, and nothing more", () => {
    const scene = start();
    expect(info(scene, whole("blocks")).value).toBe("245");
    expect(info(scene, piece("blocks", "hundreds")).value).toBe("2");
    expect(info(scene, piece("blocks", "tens")).value).toBe("4");
    expect(info(scene, piece("blocks", "ones")).value).toBe("5");
    for (const name of ["hundred-1", "hundred-2", "ten-1", "ten-4", "one-1", "one-5"]) expect(pathsFor(scene, piece("blocks", name)).length).toBeGreaterThan(0);
    for (const name of ["hundred-3", "ten-5", "one-6", "ten-0"]) expect(has(scene, piece("blocks", name))).toBe(false);
    const drawnUnits = new Set(boardPaths(scene).flatMap((p) => (p.target?.part === "piece" ? [p.target.piece] : [])));
    expect([...drawnUnits].sort()).toEqual(["hundred-1", "hundred-2", "one-1", "one-2", "one-3", "one-4", "one-5", "ten-1", "ten-2", "ten-3", "ten-4"]);
  });

  it("lays the flats, rods and cubes out left to right, a rod as tall as a flat and ten cubes tall", () => {
    const scene = start();
    const flat = box(pathsFor(scene, piece("blocks", "hundred-1")));
    const rod = box(pathsFor(scene, piece("blocks", "ten-1")));
    const cube = box(pathsFor(scene, piece("blocks", "one-1")));
    expect(rod.bottom - rod.top).toBeCloseTo(flat.bottom - flat.top, 6);
    expect(rod.right - rod.left).toBeCloseTo(cube.right - cube.left, 6);
    expect(rod.bottom - rod.top).toBeCloseTo(10 * (cube.bottom - cube.top), 6);
    expect(flat.right - flat.left).toBeCloseTo(flat.bottom - flat.top, 6);
    expect(box(pathsFor(scene, piece("blocks", "hundred-2"))).right).toBeLessThan(rod.left);
    expect(box(pathsFor(scene, piece("blocks", "ten-4"))).right).toBeLessThan(cube.left);
    // The rods stand in order.
    const lefts = [1, 2, 3, 4].map((i) => box(pathsFor(scene, piece("blocks", `ten-${i}`))).left);
    expect([...lefts].sort((a, b) => a - b)).toEqual(lefts);
  });

  it("anchors a group: a highlight on the tens covers every rod and no flat or cube", () => {
    const scene = ok(start(), { op: "mark", id: "glow", target: piece("blocks", "tens"), style: "highlight" });
    const lit = highlightBox(scene, "glow");
    for (let i = 1; i <= 4; i++) expect(within(pathsFor(scene, piece("blocks", `ten-${i}`)), lit)).toBe(true);
    expect(within(pathsFor(scene, piece("blocks", "hundred-2")), lit)).toBe(false);
    expect(within(pathsFor(scene, piece("blocks", "one-1")), lit)).toBe(false);
  });

  it("leaves out an empty group", () => {
    const scene = ok(createScene(), model("b", { kind: "base_ten", hundreds: 0, tens: 3, ones: 0 }));
    expect(info(scene, whole("b")).value).toBe("30");
    expect(has(scene, piece("b", "hundreds"))).toBe(false);
    expect(has(scene, piece("b", "ones"))).toBe(false);
    expect(has(scene, piece("b", "tens"))).toBe(true);
  });
});

describe("arrays: 3 rows of 5", () => {
  const start = () => ok(createScene(), model("arr", { kind: "array", rows: 3, columns: 5 }));

  it("draws 15 items, each a named target, with every row and column named", () => {
    const scene = start();
    expect(info(scene, whole("arr")).value).toBe("15");
    expect(info(scene, piece("arr", "row-2")).value).toBe("5");
    expect(info(scene, piece("arr", "column-4")).value).toBe("3");
    const items = new Set(boardPaths(scene).flatMap((p) => (p.target?.part === "piece" ? [p.target.piece] : [])));
    expect(items.size).toBe(15);
    expect(items.has("item-3-5")).toBe(true);
    for (const name of ["row-4", "column-6", "item-4-1", "item-1-6", "row-0"]) expect(has(scene, piece("arr", name))).toBe(false);
  });

  it("puts the items of a row side by side and the rows one under another", () => {
    const scene = start();
    const at = (r: number, c: number) => box(pathsFor(scene, piece("arr", `item-${r}-${c}`)));
    expect(at(1, 2).left).toBeGreaterThan(at(1, 1).right);
    expect(at(1, 2).top).toBeCloseTo(at(1, 1).top, 6);
    expect(at(2, 1).top).toBeGreaterThan(at(1, 1).bottom);
    expect(at(2, 1).left).toBeCloseTo(at(1, 1).left, 6);
    // A highlight on row 2 covers its five items and none of row 1 or row 3.
    const lit = ok(scene, { op: "mark", id: "glow", target: piece("arr", "row-2"), style: "highlight" });
    const band = highlightBox(lit, "glow");
    for (let c = 1; c <= 5; c++) expect(within(pathsFor(lit, piece("arr", `item-2-${c}`)), band)).toBe(true);
    expect(within(pathsFor(lit, piece("arr", "item-1-1")), band)).toBe(false);
    expect(within(pathsFor(lit, piece("arr", "item-3-1")), band)).toBe(false);
  });
});

describe("fraction strips", () => {
  it("splits the whole into 4 equal parts and shades the first 3", () => {
    const scene = ok(createScene(), model("strip", { kind: "fraction_strip", parts: 4, shaded: 3 }));
    expect(info(scene, whole("strip")).value).toBe("3/4");
    expect(info(scene, piece("strip", "shaded")).value).toBe("3/4");
    expect(info(scene, piece("strip", "unshaded")).value).toBe("1/4");
    expect(info(scene, piece("strip", "part-2")).value).toBe("1/4");
    expect(has(scene, piece("strip", "part-5"))).toBe(false);
    const parts = [1, 2, 3, 4].map((i) => box(pathsFor(scene, piece("strip", `part-${i}`))));
    const all = box(boardPaths(scene).filter((p) => p.objectId === "strip"));
    for (const p of parts) expect(p.right - p.left).toBeCloseTo((all.right - all.left) / 4, 6);
    for (let i = 1; i < 4; i++) expect(parts[i].left).toBeCloseTo(parts[i - 1].right, 6);
    // The shading fills parts 1 to 3 and stops at part 4.
    const shading = pathsFor(scene, piece("strip", "shaded"));
    expect(within(shading, { ...parts[0], right: parts[2].right })).toBe(true);
    expect(box(shading).right).toBeGreaterThan(parts[2].left);
    expect(box(shading).right).toBeLessThanOrEqual(parts[3].left);
  });

  it("names an equal fraction in its label, and two strips stacked line up part for part", () => {
    let scene = ok(createScene(), model("half", { kind: "fraction_strip", parts: 2, shaded: 1 }));
    scene = ok(scene, model("quarters", { kind: "fraction_strip", parts: 4, shaded: 2 }, { below: "half" }));
    expect(info(scene, whole("quarters")).label).toMatch(/2\/4.*1\/2|equal to 1\/2/);
    const half = box(pathsFor(scene, piece("half", "part-1")));
    const twoQuarters = box([...pathsFor(scene, piece("quarters", "part-1")), ...pathsFor(scene, piece("quarters", "part-2"))]);
    expect(twoQuarters.left).toBeCloseTo(half.left, 6);
    expect(twoQuarters.right).toBeCloseTo(half.right, 6);
    expect(twoQuarters.top).toBeGreaterThan(half.bottom);
    expect(has(scene, piece("half", "unshaded"))).toBe(true);
    const none = ok(createScene(), model("s", { kind: "fraction_strip", parts: 3, shaded: 0 }));
    expect(has(none, piece("s", "shaded"))).toBe(false);
  });
});

/** A pen with capital letters too (one stroke each), like the real stroke font the board gets later. */
const LETTERS: GlyphSet = { name: "letters", strokes: (c) => (/^[A-Z]$/.test(c) ? [[[0.2, 0.9], [0.5, 0.1], [0.8, 0.9]]] : PLACEHOLDER_GLYPHS.strokes(c)) };
const glyphPaths = (scene: Scene, objectId: string, glyph: string) => boardPaths(scene).filter((p) => p.objectId === objectId && p.glyph === glyph);
const centreX = (b: ReturnType<typeof box>) => (b.left + b.right) / 2;
const centreY = (b: ReturnType<typeof box>) => (b.top + b.bottom) / 2;

describe("geometry shapes", () => {
  it("a 4 by 3 rectangle: named corners, sides and angles, with the side lengths the code computes", () => {
    const scene = ok(
      createScene(),
      model("rect", {
        kind: "geometry",
        shape: "rectangle",
        width: 4,
        height: 3,
        labels: [
          { piece: "side-AB", show: "length" },
          { piece: "side-BC", show: "length" },
          { piece: "angle-A", show: "right" },
          { piece: "side-CD", show: "unknown" },
        ],
      }),
    );
    for (const name of ["vertex-A", "vertex-D", "side-AB", "side-DA", "angle-C"]) expect(has(scene, piece("rect", name))).toBe(true);
    expect(has(scene, piece("rect", "vertex-E"))).toBe(false);
    expect(info(scene, piece("rect", "side-AB")).value).toBe("4");
    expect(info(scene, piece("rect", "side-BC")).value).toBe("3");
    expect(info(scene, piece("rect", "side-CD")).value).toBe("?");
    expect(info(scene, piece("rect", "side-DA")).value).toBeNull();
    expect(info(scene, piece("rect", "angle-A")).value).toBe("90");

    // AB is the bottom side, 4 long; BC the right side, 3 long, in the same scale.
    const ab = box(pathsFor(scene, piece("rect", "side-AB")).filter((p) => p.kind === "rule"));
    const bc = box(pathsFor(scene, piece("rect", "side-BC")).filter((p) => p.kind === "rule"));
    expect((ab.right - ab.left) / (bc.bottom - bc.top)).toBeCloseTo(4 / 3, 3);
    expect(bc.left).toBeCloseTo(ab.right, 6);
    // Each length is written beside its own side, outside the rectangle.
    const four = box(glyphPaths(scene, "rect", "4"));
    expect(four.top).toBeGreaterThan(ab.bottom);
    expect(centreX(four)).toBeCloseTo(centreX(ab), 1);
    const three = box(glyphPaths(scene, "rect", "3"));
    expect(three.left).toBeGreaterThan(bc.right);
    expect(centreY(three)).toBeCloseTo(centreY(bc), 1);
    expect(glyphPaths(scene, "rect", "?")).not.toHaveLength(0);
  });

  it("a 3-4-5 right triangle: the long side is 5, and a measured angle is computed", () => {
    const scene = ok(
      createScene(),
      model("tri", { kind: "geometry", shape: "right_triangle", base: 3, height: 4, labels: [{ piece: "side-BC", show: "length" }, { piece: "angle-A", show: "measure" }] }),
    );
    expect(info(scene, piece("tri", "side-BC")).value).toBe("5");
    expect(info(scene, piece("tri", "angle-A")).value).toBe("90");
    expect(has(scene, piece("tri", "vertex-D"))).toBe(false);
  });

  it("refuses a length or an angle that is not a whole number, a right angle that is not one, and a part it does not have", () => {
    const shape = (labels: unknown[]) => model("t", { kind: "geometry", shape: "triangle", base: 2, height: 3, apex: 1, labels });
    expect(refusal(createScene(), shape([{ piece: "side-CA", show: "length" }]))).toMatchObject({ code: "not_allowed", reason: expect.stringMatching(/CA/) });
    expect(refusal(createScene(), shape([{ piece: "angle-A", show: "right" }]))).toMatchObject({ code: "not_allowed" });
    expect(refusal(createScene(), shape([{ piece: "angle-A", show: "measure" }]))).toMatchObject({ code: "not_allowed" });
    expect(refusal(createScene(), shape([{ piece: "side-AD", show: "length" }]))).toMatchObject({ code: "invalid_command", reason: expect.stringMatching(/side-AB/) });
    expect(refusal(createScene(), shape([{ piece: "angle-A", show: "length" }]))).toMatchObject({ code: "invalid_command" });
    expect(refusal(createScene(), shape([{ piece: "side-AB", show: "length" }, { piece: "side-AB", show: "unknown" }]))).toMatchObject({ code: "invalid_command" });
    // The base 2 is fine.
    expect(info(ok(createScene(), shape([{ piece: "side-AB", show: "length" }])), piece("t", "side-AB")).value).toBe("2");
  });

  it("writes the corner names when the pen has letters, and still names the parts when it does not", () => {
    const spec = { kind: "geometry", shape: "square", side: 2 };
    const lettered = ok(createScene({ glyphs: LETTERS }), model("sq", spec));
    const a = box(glyphPaths(lettered, "sq", "A"));
    const ab = box(pathsFor(lettered, piece("sq", "side-AB")).filter((p) => p.kind === "rule"));
    const da = box(pathsFor(lettered, piece("sq", "side-DA")).filter((p) => p.kind === "rule"));
    // A is the bottom-left corner: its name sits below and left of it.
    expect(a.top).toBeGreaterThan(ab.bottom - 0.01);
    expect(a.right).toBeLessThan(da.left + 0.01);
    const plain = ok(createScene(), model("sq", spec));
    expect(boardPaths(plain).some((p) => p.glyph === "A")).toBe(false);
    // The summary says the letter is not on the board, so Maya does not ask the child to look for it.
    expect(info(plain, piece("sq", "vertex-A")).label).toMatch(/name A is not written/);
    expect(info(lettered, piece("sq", "vertex-A")).label).not.toMatch(/not written/);
  });

  it("a circle: its centre and radius are named, and the radius length is written", () => {
    const scene = ok(createScene(), model("c", { kind: "geometry", shape: "circle", radius: 3, labels: [{ piece: "radius", show: "length" }] }));
    expect(info(scene, piece("c", "radius")).value).toBe("3");
    expect(has(scene, piece("c", "centre"))).toBe(true);
    const ring = box(pathsFor(scene, whole("c")).filter((p) => p.kind === "rule"));
    const radius = box(pathsFor(scene, piece("c", "radius")).filter((p) => p.kind === "rule"));
    expect(radius.right - radius.left).toBeCloseTo((ring.right - ring.left) / 2, 2);
  });
});

describe("coordinate grids", () => {
  const ruleOf = (scene: Scene, objectId: string, name: string) => box(pathsFor(scene, piece(objectId, name)).filter((p) => p.kind === "rule"));
  const dot = (scene: Scene, objectId: string, name: string) => box(pathsFor(scene, piece(objectId, name)).filter((p) => p.kind === "circle"));

  it("plots named points at their mathematical values, measured from the axes", () => {
    const scene = ok(
      createScene(),
      model("g", { kind: "coordinate_grid", xMin: 0, xMax: 6, yMin: 0, yMax: 5, points: [{ name: "A", x: 2, y: 3 }, { name: "B", x: 5, y: 1 }] }),
    );
    expect(info(scene, piece("g", "point-A")).value).toBe("(2, 3)");
    expect(info(scene, piece("g", "point-B")).value).toBe("(5, 1)");
    for (const name of ["x-axis", "y-axis", "origin"]) expect(has(scene, piece("g", name))).toBe(true);
    expect(has(scene, piece("g", "point-C"))).toBe(false);
    const yAxis = ruleOf(scene, "g", "y-axis").left;
    const xAxis = ruleOf(scene, "g", "x-axis").top;
    const a = dot(scene, "g", "point-A");
    const b = dot(scene, "g", "point-B");
    expect((centreX(a) - yAxis) / (centreX(b) - yAxis)).toBeCloseTo(2 / 5, 2);
    expect((xAxis - centreY(a)) / (xAxis - centreY(b))).toBeCloseTo(3 / 1, 2);
    // The axes are numbered: 6 is the last x number, 5 the last y number.
    expect(glyphPaths(scene, "g", "6").length).toBeGreaterThan(0);
    expect(centreX(box(glyphPaths(scene, "g", "6")))).toBeCloseTo(ruleOf(scene, "g", "x-axis").right, 2);
  });

  it("puts negative values left of and below the axes, numbered with a minus sign", () => {
    const scene = ok(createScene(), model("g", { kind: "coordinate_grid", xMin: -3, xMax: 3, yMin: -2, yMax: 2, points: [{ name: "C", x: -2, y: -1 }] }));
    const c = dot(scene, "g", "point-C");
    expect(centreX(c)).toBeLessThan(ruleOf(scene, "g", "y-axis").left);
    expect(centreY(c)).toBeGreaterThan(ruleOf(scene, "g", "x-axis").top);
    expect(glyphPaths(scene, "g", "−").length).toBeGreaterThan(0);
  });

  it("has no axis where the range leaves out zero", () => {
    const scene = ok(createScene(), model("g", { kind: "coordinate_grid", xMin: 2, xMax: 8, yMin: 0, yMax: 4, points: [] }));
    expect(has(scene, piece("g", "x-axis"))).toBe(true);
    expect(has(scene, piece("g", "y-axis"))).toBe(false);
    expect(has(scene, piece("g", "origin"))).toBe(false);
  });

  it("writes the point names when the pen has letters", () => {
    const scene = ok(createScene({ glyphs: LETTERS }), model("g", { kind: "coordinate_grid", xMin: 0, xMax: 4, yMin: 0, yMax: 4, points: [{ name: "P", x: 1, y: 1 }] }));
    const name = box(glyphPaths(scene, "g", "P"));
    const p = dot(scene, "g", "point-P");
    expect(name.left).toBeGreaterThan(p.left);
    expect(name.bottom).toBeLessThan(p.bottom);
    expect(info(scene, piece("g", "point-P")).label).not.toMatch(/not written/);
    const plain = ok(createScene(), model("g", { kind: "coordinate_grid", xMin: 0, xMax: 4, yMin: 0, yMax: 4, points: [{ name: "P", x: 1, y: 1 }] }));
    expect(info(plain, piece("g", "point-P")).label).toMatch(/name P is not written/);
  });
});

describe("refused models", () => {
  const code = (spec: unknown) => refusal(createScene(), { op: "model", id: "m", model: spec, place: { region: "main" } });

  it("refuses a model with an unknown kind or an unknown field, and a drawn position", () => {
    expect(code({ kind: "pie_chart", slices: 3 })).toMatchObject({ code: "invalid_command", reason: expect.stringMatching(/model.kind must be one of base_ten, array, fraction_strip, geometry, coordinate_grid/) });
    expect(code({ kind: "array", rows: 2, columns: 3, colour: "red" })).toMatchObject({ code: "invalid_command", reason: expect.stringMatching(/unknown field "colour"/) });
    expect(code({ kind: "base_ten", hundreds: 1, tens: 0, ones: 0, x: 4 })).toMatchObject({ code: "invalid_command", reason: expect.stringMatching(/unknown field "x"/) });
    expect(code({ kind: "geometry", shape: "square", side: 3, width: 3 })).toMatchObject({ reason: expect.stringMatching(/unknown field "width"/) });
    expect(code({ kind: "geometry", shape: "square", side: 3, labels: [{ piece: "side-AB", show: "length", at: [1, 2] }] })).toMatchObject({ reason: expect.stringMatching(/unknown field "at"/) });
    expect(code({ kind: "coordinate_grid", xMin: 0, xMax: 4, yMin: 0, yMax: 4, points: [{ name: "A", x: 1, y: 1, px: 30 }] })).toMatchObject({ reason: expect.stringMatching(/unknown field "px"/) });
    expect(refusal(createScene(), { op: "model", id: "m", model: { kind: "array", rows: 2, columns: 2 }, place: { region: "main" }, size: 3 })).toMatchObject({ code: "invalid_command" });
    expect(code({ kind: "array", rows: 2 })).toMatchObject({ reason: expect.stringMatching(/needs "columns"/) });
    expect(code("array")).toMatchObject({ code: "invalid_command" });
  });

  it("refuses values out of range", () => {
    const cases: [unknown, RegExp][] = [
      [{ kind: "base_ten", hundreds: 10, tens: 0, ones: 0 }, /hundreds must be a whole number from 0 to 9/],
      [{ kind: "base_ten", hundreds: 0, tens: 20, ones: 0 }, /tens/],
      [{ kind: "base_ten", hundreds: 0, tens: 0, ones: -1 }, /ones/],
      [{ kind: "base_ten", hundreds: 0, tens: 0, ones: 0 }, /at least one block/],
      [{ kind: "base_ten", hundreds: 1.5, tens: 0, ones: 0 }, /hundreds/],
      [{ kind: "array", rows: 11, columns: 2 }, /rows must be a whole number from 1 to 10/],
      [{ kind: "array", rows: 2, columns: 0 }, /columns/],
      [{ kind: "array", rows: "3", columns: 2 }, /rows/],
      [{ kind: "fraction_strip", parts: 13, shaded: 1 }, /parts must be a whole number from 1 to 12/],
      [{ kind: "fraction_strip", parts: 4, shaded: 5 }, /shaded must be a whole number from 0 to 4/],
      [{ kind: "geometry", shape: "hexagon", side: 2 }, /geometry.shape must be one of/],
      [{ kind: "geometry", shape: "rectangle", width: 11, height: 2 }, /width must be a whole number from 1 to 10/],
      [{ kind: "geometry", shape: "triangle", base: 4, height: 2, apex: 5 }, /apex must be a whole number from 0 to 4/],
      [{ kind: "geometry", shape: "trapezoid", bottom: 4, top: 4, height: 2 }, /top must be a whole number from 1 to 3/],
      [{ kind: "geometry", shape: "circle", radius: 6 }, /radius must be a whole number from 1 to 5/],
      [{ kind: "geometry", shape: "square", side: 2, labels: [{ piece: "side-AB", show: "area" }] }, /show must be one of/],
      [{ kind: "coordinate_grid", xMin: -11, xMax: 0, yMin: 0, yMax: 4, points: [] }, /xMin must be a whole number from -10 to 10/],
      [{ kind: "coordinate_grid", xMin: -10, xMax: 10, yMin: 0, yMax: 4, points: [] }, /by at most 16/],
      [{ kind: "coordinate_grid", xMin: 0, xMax: 4, yMin: 3, yMax: 3, points: [] }, /yMax must be more than yMin/],
      [{ kind: "coordinate_grid", xMin: 0, xMax: 4, yMin: 0, yMax: 4, points: [{ name: "A", x: 5, y: 1 }] }, /point A x must be a whole number from 0 to 4/],
      [{ kind: "coordinate_grid", xMin: 0, xMax: 4, yMin: 0, yMax: 4, points: [{ name: "A", x: 1, y: 1 }, { name: "A", x: 2, y: 2 }] }, /Two points are named A/],
      [{ kind: "coordinate_grid", xMin: 0, xMax: 4, yMin: 0, yMax: 4, points: [{ name: "AB", x: 1, y: 1 }] }, /one capital letter/],
    ];
    for (const [spec, reason] of cases) expect(code(spec), JSON.stringify(spec)).toMatchObject({ code: "invalid_command", reason: expect.stringMatching(reason) });
  });

  it("refuses a part name the model made up, and lists the real ones", () => {
    const scene = ok(createScene(), model("arr", { kind: "array", rows: 2, columns: 3 }));
    const r = refusal(scene, { op: "mark", id: "m", target: piece("arr", "row-3"), style: "circle" });
    expect(r.code).toBe("unknown_target");
    expect(r.valid?.some((t) => sameTarget(t.target, piece("arr", "row-2")))).toBe(true);
    expect(refusal(scene, { op: "mark", id: "m", target: { objectId: "arr", part: "piece", piece: "row 2" }, style: "circle" })).toMatchObject({ code: "invalid_command" });
    expect(refusal(scene, { op: "put", target: piece("arr", "row-1"), value: "3" })).toMatchObject({ code: "not_writable" });
  });
});

describe("models with the common commands", () => {
  /** A short stroke the child draws, in board widths. */
  const scribble = (x: number, y: number) => ({ erase: false, w: 3, pts: [[x, y], [x + 0.05, y + 0.02]] as [number, number][] });

  it("marks, arrows, focus, remove and undo work on a model's named parts", () => {
    let scene = ok(createScene(), model("blocks", { kind: "base_ten", hundreds: 1, tens: 2, ones: 3 }));
    scene = ok(
      scene,
      { op: "mark", id: "ring", target: piece("blocks", "ten-2"), style: "circle" },
      { op: "arrow", id: "move", from: piece("blocks", "ten-1"), to: piece("blocks", "ones") },
      { op: "focus", target: piece("blocks", "hundred-1") },
    );
    expect(boardPaths(scene).some((p) => p.objectId === "ring" && p.kind === "circle")).toBe(true);
    expect(boardPaths(scene).some((p) => p.objectId === "move" && p.kind === "arrow")).toBe(true);
    const marked = `m${tx}`;
    scene = ok(scene, { op: "undo", transactionId: marked });
    expect(boardPaths(scene).some((p) => p.objectId === "ring" || p.objectId === "move")).toBe(false);
    scene = ok(scene, { op: "remove", objectId: "blocks" });
    expect(boardPaths(scene)).toEqual([]);
    expect(boardTargets(scene)).toEqual([]);
  });

  it("keeps the child's ink: a model goes around it, and remove, undo and clear never touch it", () => {
    // The child writes in the top-left corner, where the first model would go.
    const drawn = addChildInk(createScene(), { page: 1, stroke: scribble(0.06, 0.06), boardWidth: 800 });
    let scene = ok(drawn.scene, model("strip", { kind: "fraction_strip", parts: 3, shaded: 1 }));
    const strip = box(boardPaths(scene).filter((p) => p.objectId === "strip"));
    // The scribble runs from (0.06, 0.06) to (0.11, 0.08): the strip keeps clear of it.
    expect(strip.left > 0.11 || strip.top > 0.08).toBe(true);
    expect(refusal(scene, { op: "remove", objectId: drawn.id })).toMatchObject({ code: "protected_ink" });
    scene = ok(scene, { op: "clear", scope: "maya_objects" });
    expect(boardPaths(scene)).toEqual([]);
    expect(childInk(scene)).toEqual([{ id: drawn.id, page: 1, stroke: scribble(0.06, 0.06), boardWidth: 800 }]);

    // Maya clears a grid, the child writes where it was, and Maya tries to bring it back.
    let board = ok(createScene(), model("g", { kind: "coordinate_grid", xMin: 0, xMax: 6, yMin: 0, yMax: 5, points: [] }));
    board = ok(board, { op: "clear", scope: "maya_objects" });
    const cleared = `m${tx}`;
    board = addChildInk(board, { page: 1, stroke: scribble(0.2, 0.15), boardWidth: 800 }).scene;
    expect(refusal(board, { op: "undo", transactionId: cleared })).toMatchObject({ code: "unsafe_undo" });
  });

  it("moves to a new board page when the page is full", () => {
    const big = { kind: "geometry", shape: "rectangle", width: 10, height: 10 };
    const scene = ok(createScene(), model("a", big));
    const r = applyBatch(scene, { transactionId: "next", commands: [model("b", big, { below: "a" })] });
    if (!r.ok) throw new Error(r.refusal.reason);
    expect(r.notices).toEqual([{ kind: "new_page", objectId: "b", page: 2 }]);
    expect(boardPages(r.scene)).toBe(2);
    expect(r.drawn.every((p) => p.page === 2)).toBe(true);
    expect(info(r.scene, piece("b", "side-AB")).page).toBe(2);
  });

  it("fits the largest model of each kind on one page", () => {
    const largest = [
      { kind: "base_ten", hundreds: 9, tens: 19, ones: 19 },
      { kind: "array", rows: 10, columns: 10 },
      { kind: "fraction_strip", parts: 12, shaded: 12 },
      { kind: "geometry", shape: "parallelogram", base: 10, height: 10, slant: 5 },
      { kind: "geometry", shape: "circle", radius: 5 },
      { kind: "coordinate_grid", xMin: -8, xMax: 8, yMin: -5, yMax: 5, points: [] },
    ];
    for (const spec of largest) {
      const scene = ok(createScene(), model("big", spec));
      expect(boardPages(scene), JSON.stringify(spec)).toBe(1);
    }
    // Each draws inside the space it takes: on an empty page it starts one cell in, and nothing pokes above or left of
    // that (a point name at the top of a grid, a corner name), even with a pen that has letters.
    const named = [
      ...largest,
      { kind: "geometry", shape: "triangle", base: 10, height: 1, apex: 0, labels: [{ piece: "side-AB", show: "length" }] },
      { kind: "coordinate_grid", xMin: -3, xMax: 3, yMin: -2, yMax: 2, points: [{ name: "A", x: -3, y: 2 }, { name: "B", x: 3, y: 2 }] },
    ];
    for (const spec of named) {
      const scene = ok(createScene({ glyphs: LETTERS }), model("big", spec));
      const b = box(boardPaths(scene));
      expect(Math.min(b.left, b.top), JSON.stringify(spec)).toBeGreaterThanOrEqual(1 / 24 - 1e-6);
    }
    const blocks = ok(createScene(), model("b", largest[0]));
    expect(info(blocks, whole("b")).value).toBe("1109");
    expect(boardPaths(blocks).filter((p) => p.target?.part === "piece" && p.target.piece.startsWith("one-") && p.kind === "rule").length).toBe(19);
  });
});

// ---------- review fixes (#353): labels that stay readable, strict optional fields, strokes inside their space ----------

const BIG_PAGE = { cols: 60, rows: 40 };
type Box = ReturnType<typeof box>;
const grown = (b: Box, by: number): Box => ({ left: b.left - by, right: b.right + by, top: b.top - by, bottom: b.bottom + by });
const boxesMeet = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
/** True when the straight segment from p to q passes inside the box (sampled finely). */
function segmentEnters(p: [number, number], q: [number, number], b: Box): boolean {
  for (let i = 0; i <= 400; i++) {
    const [x, y] = [p[0] + ((q[0] - p[0]) * i) / 400, p[1] + ((q[1] - p[1]) * i) / 400];
    if (x > b.left && x < b.right && y > b.top && y < b.bottom) return true;
  }
  return false;
}

/**
 * The problems with a geometry model's labels, from its public paths: two labels that meet, a label that a line of the
 * shape runs through, or an angle label nearer another corner than its own. Empty when every label reads clearly.
 */
function labelProblems(scene: Scene, id: string): string[] {
  const unit = 1 / scene.page.cols;
  const paths = boardPaths(scene).filter((p) => p.objectId === id);
  const labels = new Map<string, BoardPath[]>();
  for (const p of paths) if (p.kind === "glyph" && p.target?.part === "piece") labels.set(p.target.piece, [...(labels.get(p.target.piece) ?? []), p]);
  const lines = paths.filter((p) => p.kind === "rule");
  const corners = new Map<string, [number, number]>();
  for (const p of lines)
    if (p.target?.part === "piece" && p.target.piece.startsWith("side-")) {
      const [a, b] = p.target.piece.slice(5).split("");
      corners.set(a, p.pts[0]);
      corners.set(b, p.pts.at(-1)!);
    }
  const problems: string[] = [];
  const boxes = [...labels].map(([piece, ps]) => ({ piece, b: grown(box(ps), 0.06 * unit) }));
  boxes.forEach((x, i) =>
    boxes.slice(i + 1).forEach((y) => {
      if (boxesMeet(x.b, y.b)) problems.push(`${x.piece} meets ${y.piece}`);
    }),
  );
  for (const { piece, b } of boxes) {
    for (const l of lines) for (let i = 1; i < l.pts.length; i++) if (segmentEnters(l.pts[i - 1], l.pts[i], b)) problems.push(`${piece} is crossed by ${l.target?.part === "piece" ? l.target.piece : "a line"}`);
    if (piece.startsWith("angle-")) {
      const c: [number, number] = [(b.left + b.right) / 2, (b.top + b.bottom) / 2];
      const d = (p: [number, number]) => Math.hypot(p[0] - c[0], p[1] - c[1]);
      const own = d(corners.get(piece.slice(6))!);
      for (const [name, at] of corners) if (name !== piece.slice(6) && d(at) <= own) problems.push(`${piece} is nearer corner ${name}`);
    }
  }
  return [...new Set(problems)];
}

/**
 * True when every stroke of a model, with its pen width, lies inside the space the board reserved for it: on an empty
 * page the model starts one cell in, and a note placed right of it and one placed below it start one cell past its edges.
 */
function strokesInsideSpace(spec: Record<string, unknown>, glyphs?: GlyphSet): boolean {
  const scene = ok(
    createScene({ page: BIG_PAGE, glyphs }),
    model("m", spec),
    { op: "write", id: "r", text: "1", place: { rightOf: "m" } },
    { op: "write", id: "b", text: "1", place: { below: "m" } },
  );
  const cells = (n: number) => n * BIG_PAGE.cols;
  const paths = boardPaths(scene);
  // The glyph "1" starts 0.34 of a cell in from its cell's left edge and 0.1 down from its top.
  const right = cells(box(paths.filter((p) => p.objectId === "r")).left) - 0.34 - 1;
  const bottom = cells(box(paths.filter((p) => p.objectId === "b")).top) - 0.1 - 1;
  const tolerance = 0.01;
  return paths
    .filter((p) => p.objectId === "m")
    .every((p) =>
      p.pts.every(([x, y]) => {
        const [cx, cy, half] = [cells(x), cells(y), cells(p.width) / 2];
        return cx - half >= 1 - tolerance && cy - half >= 1 - tolerance && cx + half <= right + tolerance && cy + half <= bottom + tolerance;
      }),
    );
}

/** Every side and angle of a geometry model, labelled with a "?", or with its size when `sized`. */
function allLabels(spec: Record<string, unknown>, sized: boolean) {
  const plain = ok(createScene(), model("probe", spec));
  return boardTargets(plain)
    .flatMap((t) => (t.target.part === "piece" && /^(side-|angle-|radius)/.test(t.target.piece) ? [t.target.piece] : []))
    .map((p) => ({ piece: p, show: sized ? (p.startsWith("angle-") ? "measure" : "length") : "unknown" }));
}
/** The labels of `allLabels` the code can write alone: a size that is not a whole number is refused for its own reason. */
const writable = (base: Record<string, unknown>, labels: { piece: string; show: string }[]) =>
  labels.filter((l) => {
    const r = applyBatch(createScene(), { transactionId: "p", commands: [model("p", { ...base, labels: [l] })] });
    return r.ok || /no clear room/.test(r.refusal.reason);
  });

describe("geometry labels stay readable (#353 R1)", () => {
  it("refuses a 1 by 10 rectangle with four angle sizes: there is no clear room for them", () => {
    const r = refusal(createScene(), model("m", { kind: "geometry", shape: "rectangle", width: 1, height: 10, labels: ["A", "B", "C", "D"].map((a) => ({ piece: `angle-${a}`, show: "measure" })) }));
    expect(r).toMatchObject({ code: "not_allowed", reason: expect.stringMatching(/no clear room.*angle-/) });
  });

  it("labels the sides of a 1 by 10 rectangle, each clear of the shape and of the other labels", () => {
    const spec = { kind: "geometry", shape: "rectangle", width: 1, height: 10, labels: ["AB", "BC", "CD", "DA"].map((s) => ({ piece: `side-${s}`, show: "length" })) };
    const scene = ok(createScene({ glyphs: LETTERS }), model("m", spec));
    expect(labelProblems(scene, "m")).toEqual([]);
    expect(strokesInsideSpace(spec, LETTERS)).toBe(true);
  });

  const thinAndSmall: Record<string, unknown>[] = [
    { shape: "square", side: 1 },
    { shape: "rectangle", width: 1, height: 1 },
    { shape: "rectangle", width: 1, height: 10 },
    { shape: "rectangle", width: 10, height: 1 },
    { shape: "right_triangle", base: 1, height: 1 },
    { shape: "right_triangle", base: 1, height: 10 },
    { shape: "right_triangle", base: 10, height: 1 },
    { shape: "triangle", base: 1, height: 1, apex: 0 },
    { shape: "triangle", base: 1, height: 10, apex: 1 },
    { shape: "triangle", base: 10, height: 1, apex: 5 },
    { shape: "triangle", base: 10, height: 10, apex: 0 },
    { shape: "parallelogram", base: 1, height: 1, slant: 1 },
    { shape: "parallelogram", base: 1, height: 10, slant: 5 },
    { shape: "parallelogram", base: 10, height: 1, slant: 5 },
    { shape: "trapezoid", bottom: 2, top: 1, height: 1 },
    { shape: "trapezoid", bottom: 2, top: 1, height: 10 },
    { shape: "trapezoid", bottom: 10, top: 9, height: 1 },
    { shape: "trapezoid", bottom: 10, top: 1, height: 1 },
    { shape: "circle", radius: 1 },
    { shape: "circle", radius: 5 },
  ];
  for (const dims of thinAndSmall)
    for (const sized of [false, true])
      it(`${JSON.stringify(dims)} with every part labelled ${sized ? "by size" : "?"}: clear labels inside its space, or a refusal that says why`, () => {
        const base = { kind: "geometry", ...dims };
        const spec = { ...base, labels: writable(base, allLabels(base, sized)) };
        const r = applyBatch(createScene({ glyphs: LETTERS }), { transactionId: "t", commands: [model("m", spec)] });
        if (!r.ok) {
          expect(r.refusal).toMatchObject({ code: "not_allowed", reason: expect.stringMatching(/no clear room/) });
          return;
        }
        expect(labelProblems(r.scene, "m")).toEqual([]);
        expect(strokesInsideSpace(spec, LETTERS)).toBe(true);
      });

  it("still labels every part of the smallest shapes that are not thin", () => {
    const small = thinAndSmall.filter((d) => Object.entries(d).every(([k, v]) => k === "shape" || k === "apex" || (v as number) <= 2));
    expect(small.length).toBeGreaterThanOrEqual(6);
    for (const dims of small)
      for (const sized of [false, true]) {
        const base = { kind: "geometry", ...dims };
        const r = applyBatch(createScene({ glyphs: LETTERS }), { transactionId: "t", commands: [model("m", { ...base, labels: writable(base, allLabels(base, sized)) })] });
        expect(r.ok, `${JSON.stringify(dims)} ${sized}`).toBe(true);
      }
  });
});

describe("optional fields are strict (#353 R2)", () => {
  it("defaults only an omitted labels field: an empty list is fine, null is refused", () => {
    expect(applyBatch(createScene(), { transactionId: "a", commands: [model("m", { kind: "geometry", shape: "square", side: 3 })] }).ok).toBe(true);
    expect(applyBatch(createScene(), { transactionId: "b", commands: [model("m", { kind: "geometry", shape: "square", side: 3, labels: [] })] }).ok).toBe(true);
    expect(refusal(createScene(), model("m", { kind: "geometry", shape: "square", side: 3, labels: null }))).toMatchObject({ code: "invalid_command", reason: expect.stringMatching(/labels/) });
    expect(refusal(createScene(), { ...model("m", { kind: "array", rows: 2, columns: 2 }), ink: null })).toMatchObject({ code: "invalid_command", reason: expect.stringMatching(/ink/) });
    expect(refusal(createScene(), model("m", { kind: "coordinate_grid", xMin: 0, xMax: 4, yMin: 0, yMax: 4, points: null }))).toMatchObject({ code: "invalid_command", reason: expect.stringMatching(/points/) });
  });
});

describe("every model draws inside the space it takes (#353 N2)", () => {
  const specs: Record<string, unknown>[] = [
    { kind: "base_ten", hundreds: 0, tens: 0, ones: 1 },
    { kind: "base_ten", hundreds: 0, tens: 1, ones: 0 },
    { kind: "base_ten", hundreds: 1, tens: 0, ones: 0 },
    { kind: "base_ten", hundreds: 9, tens: 19, ones: 19 },
    { kind: "array", rows: 1, columns: 1 },
    { kind: "array", rows: 1, columns: 10 },
    { kind: "array", rows: 10, columns: 1 },
    { kind: "fraction_strip", parts: 1, shaded: 0 },
    { kind: "fraction_strip", parts: 1, shaded: 1 },
    { kind: "fraction_strip", parts: 12, shaded: 1 },
    { kind: "fraction_strip", parts: 7, shaded: 7 },
    { kind: "coordinate_grid", xMin: 0, xMax: 1, yMin: 0, yMax: 1, points: [{ name: "A", x: 1, y: 1 }] },
    { kind: "coordinate_grid", xMin: -8, xMax: 8, yMin: 0, yMax: 1, points: [{ name: "A", x: 8, y: 1 }, { name: "B", x: -8, y: 0 }] },
    { kind: "coordinate_grid", xMin: -10, xMax: -9, yMin: -10, yMax: 0, points: [{ name: "A", x: -9, y: 0 }] },
  ];
  for (const spec of specs)
    it(JSON.stringify(spec), () => {
      expect(strokesInsideSpace(spec, LETTERS)).toBe(true);
    });
});

describe("a lesson with division, columns and models on one board", () => {
  it("618 ÷ 3 beside 618 in blocks and 6 as 3 rows of 2: common commands work across all of them", () => {
    const cell = (objectId: string, rowId: string, column: string): Target => ({ objectId, part: "cell", rowId, column } as Target);
    let scene = ok(
      createScene(),
      { op: "division", id: "div", dividend: "618", divisor: "3", place: { region: "main" } },
      model("blocks", { kind: "base_ten", hundreds: 6, tens: 1, ones: 8 }, { rightOf: "div" }),
      model("arr", { kind: "array", rows: 3, columns: 2 }, { below: "div" }),
    );
    expect(info(scene, whole("blocks")).value).toBe("618");
    expect(info(scene, whole("arr")).value).toBe("6");
    scene = ok(
      scene,
      { op: "mark", id: "six", target: piece("blocks", "hundreds"), style: "circle" },
      { op: "arrow", id: "share", from: piece("arr", "column-1"), to: cell("div", "quotient", "hundreds") },
      { op: "put", target: cell("div", "quotient", "hundreds"), value: "2" },
    );
    const step = `m${tx}`;
    expect(info(scene, cell("div", "quotient", "hundreds")).value).toBe("2");
    expect(boardPaths(scene).some((p) => p.objectId === "share" && p.kind === "arrow")).toBe(true);
    scene = ok(scene, { op: "undo", transactionId: step });
    expect(info(scene, cell("div", "quotient", "hundreds")).value).toBeNull();
    expect(boardPaths(scene).some((p) => p.objectId === "six" || p.objectId === "share")).toBe(false);
    scene = ok(scene, { op: "columns", id: "sum", operation: "add", operands: [{ id: "top", value: "600" }, { id: "bottom", value: "18" }], place: { below: "blocks" } });
    scene = ok(scene, { op: "remove", objectId: "arr" });
    expect(has(scene, whole("arr"))).toBe(false);
    for (const id of ["div", "blocks", "sum"]) expect(has(scene, whole(id))).toBe(true);
    // No two objects draw over each other.
    const boxes = ["div", "blocks", "sum"].map((id) => box(boardPaths(scene).filter((p) => p.objectId === id)));
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => expect(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top).toBe(true)));
  });
});
