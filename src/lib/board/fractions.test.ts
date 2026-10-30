import { describe, expect, it } from "vitest";
import { addChildInk, applyBatch, boardPages, boardPaths, boardTargets, boardView, childInk, createScene, sameTarget, type Scene, type Target } from "@/lib/board";

// Fractions and number lines on Maya's board (#317, spec #297): the model names values as exact numbers ("1/3", "-0.5",
// "1 1/2"), never positions; the core puts each value on its tick, so equal values land on one point. These tests use
// only the public API.

let tx = 0;
/** Applies one batch and fails the test with the refusal when the core refuses it. */
function ok(scene: Scene, ...commands: unknown[]): Scene {
  const r = applyBatch(scene, { transactionId: `f${++tx}`, commands });
  if (!r.ok) throw new Error(`refused: ${r.refusal.code}: ${r.refusal.reason}`);
  return r.scene;
}

/** The refusal of one batch, failing the test when the core applies it. */
function refused(scene: Scene, ...commands: unknown[]) {
  const r = applyBatch(scene, { transactionId: `f${++tx}`, commands });
  if (r.ok) throw new Error("applied, expected a refusal");
  return r.refusal;
}

function info(scene: Scene, target: Target) {
  const found = boardTargets(scene).find((t) => sameTarget(t.target, target));
  if (!found) throw new Error(`no target ${JSON.stringify(target)}`);
  return found;
}

const part = (objectId: string, p: string) => ({ objectId, part: p }) as Target;

describe("fractions", () => {
  it("writes a fraction with its numerator, bar and denominator as targets", () => {
    const scene = ok(createScene(), { op: "fraction", id: "f1", numerator: "3", denominator: "4", place: { region: "main" } });
    expect(info(scene, part("f1", "numerator")).value).toBe("3");
    expect(info(scene, part("f1", "denominator")).value).toBe("4");
    expect(info(scene, part("f1", "bar"))).toMatchObject({ writable: false });
    expect(info(scene, part("f1", "whole")).value).toBe("3/4");
  });
});

const value = (objectId: string, v: string): Target => ({ objectId, part: "value", value: v });
const line = (id: string, min: string, max: string, tick: string, extra: object = {}) => ({ op: "number_line", id, min, max, tick, place: { region: "main" }, ...extra });

describe("number lines", () => {
  it("names each tick by its exact value, so 2/6 and 1/3 are one point", () => {
    const scene = ok(createScene(), line("n1", "0", "1", "1/6"));
    const ticks = boardTargets(scene).filter((t) => t.target.part === "value");
    expect(ticks.map((t) => (t.target as { value: string }).value)).toEqual(["0", "1/6", "1/3", "1/2", "2/3", "5/6", "1"]);
    // The line counts in sixths: it labels 1/3 as 2/6.
    expect(info(scene, value("n1", "1/3")).value).toBe("2/6");
    expect(info(scene, value("n1", "2/6"))).toEqual(info(scene, value("n1", "1/3")));
    // A circle on 2/6 is the circle on 1/3, and not the one on 1/6.
    const circle = (v: string) => boardPaths(ok(scene, { op: "mark", id: "m1", target: value("n1", v), style: "circle" })).filter((p) => p.objectId === "m1").map((p) => p.pts);
    expect(circle("2/6")).toEqual(circle("1/3"));
    expect(circle("1/6")).not.toEqual(circle("1/3"));
  });

  it("ends a jump to 2/6 and a jump to 1/3 at the same point", () => {
    const scene = ok(createScene(), line("n1", "0", "1", "1/6"));
    const arc = (to: string, label: string) => {
      const after = ok(scene, { op: "jump", id: "j1", lineId: "n1", fromValue: "0", toValue: to, label });
      return boardPaths(after).find((p) => p.objectId === "j1" && p.kind === "arrow")!;
    };
    const sixths = arc("2/6", "+2/6");
    const third = arc("1/3", "+1/3");
    expect(sixths.pts.at(-1)).toEqual(third.pts.at(-1));
    expect(sixths.pts).toEqual(third.pts);
    // The jump is a target of its own, with the label Maya wrote.
    const after = ok(scene, { op: "jump", id: "j1", lineId: "n1", fromValue: "0", toValue: "1/3", label: "+1/3" });
    expect(info(after, part("j1", "whole")).value).toBe("+1/3");
  });

  it("checks a jump's label against its size", () => {
    const scene = ok(createScene(), line("n1", "0", "1", "1/6"));
    expect(refused(scene, { op: "jump", id: "j1", lineId: "n1", fromValue: "1/6", toValue: "5/6", label: "+3/6" })).toMatchObject({ code: "wrong_value" });
    // Backward is a minus.
    expect(refused(scene, { op: "jump", id: "j1", lineId: "n1", fromValue: "5/6", toValue: "1/6", label: "+4/6" })).toMatchObject({ code: "wrong_value" });
    ok(scene, { op: "jump", id: "j1", lineId: "n1", fromValue: "5/6", toValue: "1/6", label: "-2/3" });
  });
});

describe("invalid denominators", () => {
  it("refuses a fraction over 0, with the reason", () => {
    const r = refused(createScene(), { op: "fraction", id: "f1", numerator: "3", denominator: "0", place: { region: "main" } });
    expect(r).toMatchObject({ index: 0, code: "not_allowed" });
    expect(r.reason).toMatch(/0 as its denominator/);
    expect(refused(createScene(), line("n1", "0", "1", "1/0")).reason).toMatch(/0 as its denominator/);
  });

  it("refuses a value the line's ticks cannot show, and says what the ticks are", () => {
    const scene = ok(createScene(), line("n1", "0", "1", "1/4"));
    const r = refused(scene, { op: "jump", id: "j1", lineId: "n1", fromValue: "0", toValue: "1/3" });
    expect(r).toMatchObject({ code: "not_allowed" });
    expect(r.reason).toMatch(/1\/3 is not on a tick/);
    expect(r.reason).toMatch(/steps of 1\/4/);
    // A mark on that value is refused too, with the ticks it can use.
    const m = refused(scene, { op: "mark", id: "m1", target: value("n1", "1/3"), style: "circle" });
    expect(m.code).toBe("unknown_target");
    expect(m.valid?.map((t) => t.target)).toContainEqual(value("n1", "1/4"));
    // A line whose ticks miss its end.
    expect(refused(createScene(), line("n2", "0", "1", "1/3", { form: "decimal" })).reason).toMatch(/no exact decimal/);
    expect(refused(createScene(), line("n2", "0", "1", "2/3")).reason).toMatch(/do not land on 1/);
  });
});

describe("negative and decimal values", () => {
  /** The x of a tick: the middle of its tick mark. */
  const tickX = (scene: Scene, t: Target) => boardPaths(scene).find((p) => p.kind === "rule" && p.target !== null && sameTarget(p.target, t))!.pts[0][0];

  it("places negative decimals in order, labels them with a minus, and jumps backward across 0", () => {
    let scene = ok(createScene(), line("n1", "-2", "2", "0.5"));
    expect(info(scene, value("n1", "-1.5")).value).toBe("−1.5");
    // -0.5 is -1/2, however it is written.
    expect(info(scene, value("n1", "−0.5"))).toEqual(info(scene, value("n1", "-1/2")));
    const xs = ["-2", "-1.5", "-0.5", "0", "0.5", "2"].map((v) => tickX(scene, value("n1", v)));
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    // Equal steps: the gap from -2 to -1.5 is the gap from 1.5 to 2.
    expect(xs[1] - xs[0]).toBeCloseTo(tickX(scene, value("n1", "2")) - tickX(scene, value("n1", "1.5")), 3);

    scene = ok(scene, { op: "jump", id: "back", lineId: "n1", fromValue: "1.5", toValue: "-0.5", label: "-2" });
    const arc = boardPaths(scene).find((p) => p.objectId === "back" && p.kind === "arrow")!;
    expect(arc.pts[0][0]).toBeGreaterThan(arc.pts.at(-1)![0]);
    expect(arc.pts.at(-1)![0]).toBeCloseTo(tickX(scene, value("n1", "-0.5")), 1);
    expect(info(scene, part("back", "whole")).value).toBe("−2");
  });

  it("adds tenths exactly: 0.1 + 0.2 lands on the 0.3 tick", () => {
    const scene = ok(createScene(), line("n1", "0", "1", "0.1"));
    expect(info(scene, value("n1", "3/10")).value).toBe("0.3");
    ok(scene, { op: "jump", id: "j1", lineId: "n1", fromValue: "0.1", toValue: "0.3", label: "+0.2" });
    expect(refused(scene, { op: "jump", id: "j1", lineId: "n1", fromValue: "0.1", toValue: "0.3", label: "+0.3" }).code).toBe("wrong_value");
    expect(refused(scene, { op: "jump", id: "j1", lineId: "n1", fromValue: "0", toValue: "0.25" }).code).toBe("not_allowed");
  });

  it("writes mixed numbers when asked, and only labels whole numbers when asked", () => {
    const mixed = ok(createScene(), line("n1", "0", "3", "1/2", { form: "mixed" }));
    expect(info(mixed, value("n1", "3/2")).value).toBe("1 1/2");
    const wholes = ok(createScene(), line("n1", "0", "3", "1/2", { labels: "wholes" }));
    expect(info(wholes, value("n1", "1")).value).toBe("1");
    expect(info(wholes, value("n1", "3/2"))).toMatchObject({ value: null, writable: true });
    // Maya can label a tick later; the value is checked.
    expect(refused(wholes, { op: "put", target: value("n1", "3/2"), value: "5/2" }).code).toBe("wrong_value");
    const labelled = ok(wholes, { op: "put", target: value("n1", "1 1/2"), value: "3/2" });
    expect(info(labelled, value("n1", "3/2"))).toMatchObject({ value: "3/2", writable: false });
  });
});

describe("room on the board", () => {
  it("moves a number line that does not fit to a new board page", () => {
    const scene = ok(createScene(), line("n1", "0", "2", "1/6"));
    const r = applyBatch(scene, { transactionId: "second", commands: [{ ...line("n2", "0", "2", "1/4"), place: { below: "n1" } }] });
    if (!r.ok) throw new Error(r.refusal.reason);
    expect(r.notices).toEqual([{ kind: "new_page", objectId: "n2", page: 2 }]);
    expect(boardPages(r.scene)).toBe(2);
    expect(info(r.scene, value("n2", "1/2")).page).toBe(2);
    expect(boardView(r.scene).page).toBe(2);
    // A fraction next to the first line still goes on page 1 when it fits there.
    const f = ok(r.scene, { op: "fraction", id: "f1", numerator: "1", denominator: "3", place: { near: value("n1", "1/3"), side: "below" } });
    expect(info(f, part("f1", "whole")).page).toBe(1);
  });

  it("refuses a line too long for a page, and too many ticks, with the reason", () => {
    expect(refused(createScene(), line("n1", "-10", "10", "1"))).toMatchObject({ code: "no_room" });
    const many = refused(createScene(), line("n1", "0", "30", "1"));
    expect(many.code).toBe("no_room");
    expect(many.reason).toMatch(/31 ticks/);
  });

  it("stacks jumps over the same part of the line in lanes, and refuses one more when the lanes are full", () => {
    let scene = ok(createScene(), line("n1", "0", "1", "1/6"));
    const jump = (id: string, from: string, to: string) => ({ op: "jump", id, lineId: "n1", fromValue: from, toValue: to });
    const apex = (s: Scene, id: string) => Math.min(...boardPaths(s).filter((p) => p.objectId === id && p.kind === "arrow").flatMap((p) => p.pts.map(([, y]) => y)));
    // Jumps end to end share the lowest lane.
    scene = ok(scene, jump("a", "0", "1/6"), jump("b", "1/6", "1/3"));
    expect(apex(scene, "b")).toBeCloseTo(apex(scene, "a"), 6);
    // A jump over them goes higher, and another higher still.
    scene = ok(scene, jump("c", "0", "1/3"));
    expect(apex(scene, "c")).toBeLessThan(apex(scene, "a"));
    scene = ok(scene, jump("d", "1/3", "0"));
    expect(apex(scene, "d")).toBeLessThan(apex(scene, "c"));
    const full = refused(scene, jump("e", "0", "1/2"));
    expect(full.code).toBe("no_room");
    expect(full.reason).toMatch(/lanes/);
    // Further along the line the lowest lane is free.
    scene = ok(scene, jump("f", "1/2", "1"));
    expect(apex(scene, "f")).toBeGreaterThan(apex(scene, "c"));
  });
});

describe("the common commands", () => {
  const sixths = () => ok(createScene(), line("n1", "0", "1", "1/6"));
  const jumpTo = (id: string, to: string) => ({ op: "jump", id, lineId: "n1", fromValue: "0", toValue: to });
  const strokesOf = (scene: Scene, id: string) => boardPaths(scene).filter((p) => p.objectId === id);

  it("never draws a jump over the child's ink, and never removes or clears it", () => {
    let scene = sixths();
    // The child writes a line just above the number line, from 0 to 1/2, where a jump from 0 to 1/2 would arc.
    const [x0, y] = boardPaths(scene).find((p) => p.target !== null && sameTarget(p.target, value("n1", "0")))!.pts[0];
    const x1 = boardPaths(scene).find((p) => p.target !== null && sameTarget(p.target, value("n1", "1/2")))!.pts[0][0];
    const drawn = addChildInk(scene, { page: 1, stroke: { erase: false, w: 3, pts: [[x0, y - 0.015], [x1, y - 0.015]] }, boardWidth: 800 });
    scene = drawn.scene;
    expect(refused(scene, jumpTo("j1", "1/2")).code).toBe("protected_ink");
    expect(refused(scene, { op: "remove", objectId: drawn.id }).code).toBe("protected_ink");
    scene = ok(scene, { op: "clear", scope: "maya_objects" });
    expect(boardPaths(scene)).toEqual([]);
    expect(childInk(scene).map((c) => c.id)).toEqual([drawn.id]);
  });

  it("removes, undoes and clears jumps, and keeps the line", () => {
    let scene = sixths();
    const lineStrokes = strokesOf(scene, "n1");
    scene = ok(scene, jumpTo("j1", "1/3"));
    const withJ1 = scene;
    scene = ok(scene, jumpTo("j2", "1/2"));
    expect(strokesOf(scene, "j2").length).toBeGreaterThan(0);
    // Undo takes back the last jump; the first stays where it was.
    scene = ok(scene, { op: "undo", transactionId: `f${tx}` });
    expect(boardPaths(scene)).toEqual(boardPaths(withJ1));
    scene = ok(scene, { op: "remove", objectId: "j1" });
    expect(strokesOf(scene, "j1")).toEqual([]);
    scene = ok(scene, jumpTo("j3", "1/6"), { op: "mark", id: "m1", target: part("j3", "whole"), style: "circle" });
    scene = ok(scene, { op: "clear", scope: "maya_annotations" });
    expect(boardPaths(scene)).toEqual(lineStrokes);
    // A jump needs a number line.
    scene = ok(scene, { op: "fraction", id: "f1", numerator: "1", denominator: "3", place: { region: "main" } });
    expect(refused(scene, { op: "jump", id: "j4", lineId: "f1", fromValue: "0", toValue: "1/3" }).code).toBe("not_allowed");
  });

  it("points an arrow from a fraction's numerator to its tick, and focuses a part", () => {
    let scene = ok(sixths(), { op: "fraction", id: "f1", numerator: "2", denominator: "6", place: { rightOf: "n1" } });
    scene = ok(scene, { op: "arrow", id: "a1", from: part("f1", "numerator"), to: value("n1", "1/3") });
    expect(strokesOf(scene, "a1").length).toBeGreaterThan(0);
    scene = ok(scene, { op: "focus", target: part("f1", "denominator") });
    expect(boardView(scene).target).toEqual(part("f1", "denominator"));
    // A mixed number's whole number is a part of its own.
    scene = ok(scene, { op: "fraction", id: "f2", whole: "2", numerator: "1", denominator: "3", place: { below: "f1" } });
    expect(info(scene, part("f2", "whole_number")).value).toBe("2");
    expect(info(scene, part("f2", "whole")).value).toBe("2 1/3");
    expect(refused(scene, { op: "fraction", id: "f3", whole: "1", numerator: "5", denominator: "4", place: { region: "main" } }).reason).toMatch(/less than 1/);
  });
});
