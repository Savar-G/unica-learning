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
    // With no value, the line writes the tick's own label.
    const own = ok(wholes, { op: "put", target: value("n1", "5/2") });
    expect(info(own, value("n1", "5/2"))).toMatchObject({ value: "5/2", writable: false });
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

describe("stable tick names", () => {
  const names = (scene: Scene, id: string) => boardTargets(scene).filter((t) => t.target.objectId === id && t.target.part === "value").map((t) => t.target);

  it("keeps each tick's name as the board changes around the line", () => {
    let scene = ok(createScene(), line("n1", "-1", "1", "1/4", { labels: "ends" }));
    const before = names(scene, "n1");
    expect(before).toContainEqual(value("n1", "-3/4"));
    scene = ok(scene, { op: "jump", id: "j1", lineId: "n1", fromValue: "-1", toValue: "1/2" }, { op: "put", target: value("n1", "2/4"), value: "1/2" });
    scene = ok(scene, { op: "fraction", id: "f1", numerator: "1", denominator: "2", place: { below: "n1" } });
    expect(names(scene, "n1")).toEqual(before);
    scene = ok(scene, { op: "clear", scope: "maya_objects" });
    scene = ok(scene, { op: "undo", transactionId: `f${tx}` });
    expect(names(scene, "n1")).toEqual(before);
  });

  it("labels a tick whose name is a long fraction: 1000.5 is 2001/2", () => {
    const scene = ok(createScene(), line("n1", "1000", "1002", "0.5", { labels: "ends" }));
    expect(info(scene, value("n1", "2001/2"))).toMatchObject({ value: null, writable: true });
    const labelled = ok(scene, { op: "put", target: value("n1", "1000.5"), value: "1000.5" });
    expect(info(labelled, value("n1", "2001/2")).value).toBe("1000.5");
  });

  it("refuses a value it cannot read as an invalid command, and a 0 denominator as not allowed", () => {
    const scene = ok(createScene(), line("n1", "0", "1", "1/4"));
    expect(refused(scene, { op: "jump", id: "j1", lineId: "n1", fromValue: "0", toValue: "half" }).code).toBe("invalid_command");
    expect(refused(scene, { op: "jump", id: "j1", lineId: "n1", fromValue: "0", toValue: "1/0" }).code).toBe("not_allowed");
    expect(refused(scene, { op: "mark", id: "m1", target: value("n1", "x"), style: "circle" }).code).toBe("invalid_command");
    // A coordinate is never a value.
    expect(refused(scene, { op: "jump", id: "j1", lineId: "n1", fromValue: "0", toValue: "1/4", x: 3 }).code).toBe("invalid_command");
  });
});

describe("review R1: every tick name the board returns works in every command", () => {
  const wide = () => createScene({ page: { cols: 200, rows: 16 } });
  const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
  /** min + count * tick as a fraction in lowest terms, computed here with whole numbers only. */
  const end = (min: [number, number], tick: [number, number], count: number) => {
    const n = min[0] * tick[1] + count * tick[0] * min[1];
    const d = min[1] * tick[1];
    const g = gcd(n, d);
    return d / g === 1 ? `${n / g}` : `${n / g}/${d / g}`;
  };
  const MINS: [string, [number, number]][] = [
    ["0", [0, 1]],
    ["-1", [-1, 1]],
    ["-9999.999", [-9999999, 1000]],
    ["9998", [9998, 1]],
    ["-3/4", [-3, 4]],
    ["1 1/2", [3, 2]],
    ["-10000", [-10000, 1]],
  ];
  const TICKS: [string, [number, number]][] = [
    ["0.001", [1, 1000]],
    ["0.1", [1, 10]],
    ["0.25", [1, 4]],
    ["1/3", [1, 3]],
    ["1/8", [1, 8]],
    ["1/100", [1, 100]],
    ["5/6", [5, 6]],
    ["2", [2, 1]],
  ];

  it("names from thousandths, large decimals, negatives and fractions read back as the same tick", () => {
    let accepted = 0;
    let names = 0;
    for (const [minText, min] of MINS)
      for (const [tickText, tick] of TICKS)
        for (const count of [1, 3, 24]) {
          const made = applyBatch(wide(), { transactionId: "line", commands: [line("n1", minText, end(min, tick, count), tickText, { labels: "none" })] });
          if (!made.ok) continue;
          accepted++;
          const scene = made.scene;
          const ticks = boardTargets(scene).filter((t) => t.target.part === "value").map((t) => t.target as Target & { value: string });
          expect(ticks).toHaveLength(count + 1);
          names += ticks.length;
          const where = `line ${minText} by ${tickText}, ${count} steps`;
          const batch = (commands: unknown[]) => {
            const r = applyBatch(scene, { transactionId: "use", commands });
            expect(r.ok ? null : `${where}: ${r.refusal.code} ${r.refusal.reason} at ${JSON.stringify(commands[r.refusal.index])}`).toBeNull();
            return r;
          };
          batch(ticks.map((t) => ({ op: "focus", target: t })));
          const marked = batch(ticks.map((t, i) => ({ op: "mark", id: `m${i}`, target: t, style: "highlight" })));
          if (marked.ok) for (const t of ticks) expect(boardTargets(marked.scene).filter((x) => sameTarget(x.target, t))).toHaveLength(1);
          const labelled = batch(ticks.map((t) => ({ op: "put", target: t, value: t.value })));
          if (labelled.ok) expect(boardTargets(labelled.scene).filter((x) => x.target.part === "value" && x.value === null)).toEqual([]);
          batch(ticks.slice(1).map((t, i) => ({ op: "jump", id: `j${i}`, lineId: "n1", fromValue: ticks[i].value, toValue: t.value })));
        }
    // The matrix is not empty: most lines are accepted, with thousands of names.
    expect(accepted).toBeGreaterThan(100);
    expect(names).toBeGreaterThan(1500);
  });

  it("refuses a line past the bounds the names are made for", () => {
    expect(refused(createScene(), line("n1", "10000/1", "10002/1", "1")).reason).toMatch(/from -10000 to 10000/);
    expect(refused(createScene(), line("n1", "0", "1", "1/1001")).reason).toMatch(/denominators up to 1000/);
  });
});

describe("review R2: the longest labels and values", () => {
  const line995 = () => ok(createScene(), line("n1", "-999.995", "-999.99", "0.005", { labels: "none" }));

  it("labels a tick with its longest spellings, and refuses a wrong value of the same length", () => {
    expect(info(line995(), value("n1", "-199999/200"))).toMatchObject({ writable: true });
    for (const spelling of ["-999.995", "-199999/200", "-999 199/200", "−999 199/200"]) {
      const labelled = ok(line995(), { op: "put", target: value("n1", "-999.995"), value: spelling });
      expect(info(labelled, value("n1", "-199999/200")).value).toBe("−999.995");
    }
    expect(refused(line995(), { op: "put", target: value("n1", "-999.995"), value: "-999.990" }).code).toBe("wrong_value");
    expect(refused(line995(), { op: "put", target: value("n1", "-999.995"), value: "-999 198/200" }).code).toBe("wrong_value");
  });

  it("reads the longest number text there is: a jump of +19999 998/1000 across the widest line", () => {
    const scene = ok(createScene(), line("n1", "-9999.999", "9999.999", "9999.999"));
    const r = ok(scene, { op: "jump", id: "j1", lineId: "n1", fromValue: "-9999.999", toValue: "9999.999", label: "+19999 998/1000" });
    expect(info(r, part("j1", "whole")).value).toBe("+19999 998/1000");
    expect(refused(scene, { op: "jump", id: "j1", lineId: "n1", fromValue: "-9999.999", toValue: "9999.999", label: "+19999 997/1000" }).code).toBe("wrong_value");
  });
});

describe("review R3: exact layout", () => {
  /** The x of each tick mark, in board widths, in order. */
  const tickXs = (scene: Scene) =>
    boardTargets(scene)
      .filter((t) => t.target.part === "value")
      .map((t) => boardPaths(scene).find((p) => p.kind === "rule" && p.target !== null && sameTarget(p.target, t.target))!.pts[0][0]);

  it("fits a line that needs exactly 40 cells on a page with 40 free, with every tick where exact math puts it", () => {
    // -2 to 6 in thirds: 25 ticks, the widest label 6/5 cells, so a spacing of 8/5, an end room of 4/5 and 40 cells.
    const scene = ok(createScene({ page: { cols: 42, rows: 16 } }), line("n1", "-2", "6", "1/3"));
    const xs = tickXs(scene);
    expect(xs).toHaveLength(25);
    // The line starts one margin cell in: tick i is at 1 + 4/5 + 8i/5 cells, of 42.
    xs.forEach((x, i) => expect(x).toBeCloseTo((9 + 8 * i) / 5 / 42, 4));
    const rule = boardPaths(scene).find((p) => p.kind === "rule" && p.target !== null && sameTarget(p.target, part("n1", "whole")))!;
    expect((rule.pts[1][0] - rule.pts[0][0]) * 42).toBeCloseTo(39.8, 2);
  });

  it("puts the first tick of that line at 1.8 cells on a wide page", () => {
    const scene = ok(createScene({ page: { cols: 200, rows: 16 } }), line("n1", "-2", "6", "1/3"));
    expect(tickXs(scene)[0]).toBeCloseTo(0.009, 4);
  });
});

describe("review R4: jumps never cross", () => {
  type Pt = readonly [number, number];
  /** The distance between two segments, worked out here so the test does not lean on the core's geometry. */
  function segGap(a: Pt, b: Pt, c: Pt, d: Pt): number {
    const cross = (o: Pt, p: Pt, q: Pt) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
    const [d1, d2, d3, d4] = [cross(a, b, c), cross(a, b, d), cross(c, d, a), cross(c, d, b)];
    if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
    const toSeg = (p: Pt, s: Pt, e: Pt) => {
      const [dx, dy] = [e[0] - s[0], e[1] - s[1]];
      const len = dx * dx + dy * dy;
      const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - s[0]) * dx + (p[1] - s[1]) * dy) / len));
      return Math.hypot(p[0] - s[0] - t * dx, p[1] - s[1] - t * dy);
    };
    return Math.min(toSeg(a, c, d), toSeg(b, c, d), toSeg(c, a, b), toSeg(d, a, b));
  }
  /** The closest the strokes (shaft and arrowhead) of two jumps come, less their half widths. */
  function clearance(scene: Scene, a: string, b: string): number {
    const arcs = (id: string) => boardPaths(scene).filter((p) => p.objectId === id && p.kind === "arrow");
    let best = Infinity;
    for (const p of arcs(a))
      for (const q of arcs(b))
        for (let i = 1; i < p.pts.length; i++)
          for (let j = 1; j < q.pts.length; j++) best = Math.min(best, segGap(p.pts[i - 1], p.pts[i], q.pts[j - 1], q.pts[j]) - (p.width + q.width) / 2);
    return best;
  }
  const jump = (id: string, from: string, to: string) => ({ op: "jump", id, lineId: "n", fromValue: from, toValue: to });

  it("refuses a jump from 1 to 3 that would cross a jump from 0 to 2", () => {
    const scene = ok(ok(createScene(), line("n", "0", "3", "1")), jump("a", "0", "2"));
    expect(refused(scene, jump("b", "1", "3")).code).toBe("no_room");
  });

  it("never accepts two jumps with four different ends whose arcs meet: whole numbers, negative decimals, thirds", () => {
    const cases: [string, string, string, string[]][] = [
      ["0", "3", "1", ["0", "1", "2", "3"]],
      ["-1.5", "1.5", "1", ["-1.5", "-0.5", "0.5", "1.5"]],
      ["0", "1", "1/3", ["0", "1/3", "2/3", "1"]],
    ];
    let accepted = 0;
    let refusedCount = 0;
    for (const [min, max, tick, values] of cases) {
      const made = ok(createScene(), line("n", min, max, tick));
      for (const a of values)
        for (const b of values)
          for (const c of values)
            for (const d of values) {
              if (new Set([a, b, c, d]).size !== 4) continue;
              const first = ok(made, jump("a", a, b));
              const r = applyBatch(first, { transactionId: `f${++tx}`, commands: [jump("b", c, d)] });
              if (!r.ok) {
                expect(r.refusal.code).toBe("no_room");
                refusedCount++;
                continue;
              }
              accepted++;
              expect(clearance(r.scene, "a", "b"), `${min}..${max}: ${a}->${b}, then ${c}->${d}`).toBeGreaterThan(0);
            }
    }
    // Jumps side by side or one over the other still go on.
    expect(accepted).toBeGreaterThan(0);
    expect(refusedCount).toBeGreaterThan(0);
  });

  it("lets jumps that share one tick meet only at that tick", () => {
    const COLS = 24;
    /** Where two segments cross, or null. */
    const crossing = (a: Pt, b: Pt, c: Pt, d: Pt): Pt | null => {
      const [ux, uy, vx, vy] = [b[0] - a[0], b[1] - a[1], d[0] - c[0], d[1] - c[1]];
      const det = ux * vy - uy * vx;
      if (Math.abs(det) < 1e-14) return null;
      const [dx, dy] = [c[0] - a[0], c[1] - a[1]];
      const t = (dx * vy - dy * vx) / det;
      const u = (dx * uy - dy * ux) / det;
      return t > 0 && t < 1 && u > 0 && u < 1 ? [a[0] + t * ux, a[1] + t * uy] : null;
    };
    const cases: [string, string, string, string[]][] = [
      ["0", "3", "1", ["0", "1", "2", "3"]],
      ["-1.5", "1.5", "1", ["-1.5", "-0.5", "0.5", "1.5"]],
      ["0", "1", "1/3", ["0", "1/3", "2/3", "1"]],
    ];
    let accepted = 0;
    for (const [min, max, tick, values] of cases) {
      const made = ok(createScene({ page: { cols: COLS, rows: 16 } }), line("n", min, max, tick));
      const tickAt = (v: string) => boardPaths(made).find((p) => p.kind === "rule" && p.target !== null && sameTarget(p.target, value("n", v)))!.pts[0][0];
      for (const a of values)
        for (const b of values)
          for (const c of values)
            for (const d of values) {
              const ends = [a, b, c, d];
              if (a === b || c === d || new Set(ends).size !== 3) continue;
              const shared = ends.find((v, i) => ends.indexOf(v) !== i)!;
              const r = applyBatch(ok(made, jump("a", a, b)), { transactionId: `f${++tx}`, commands: [jump("b", c, d)] });
              if (!r.ok) continue;
              accepted++;
              const arcs = (id: string) => boardPaths(r.scene).filter((p) => p.objectId === id && p.kind === "arrow");
              for (const p of arcs("a"))
                for (const q of arcs("b"))
                  for (let i = 1; i < p.pts.length; i++)
                    for (let j = 1; j < q.pts.length; j++) {
                      const hit = crossing(p.pts[i - 1], p.pts[i], q.pts[j - 1], q.pts[j]);
                      // Arcs start just above the line: a crossing is allowed only within half a cell of the shared tick there.
                      if (hit) expect(Math.hypot(hit[0] - tickAt(shared), hit[1] - p.pts[0][1]) * COLS, `${a}->${b}, then ${c}->${d}`).toBeLessThan(0.5);
                    }
            }
    }
    expect(accepted).toBeGreaterThan(0);
  });

  it("still lets jumps meet at a shared tick", () => {
    let scene = ok(createScene(), line("n", "0", "3", "1"));
    scene = ok(scene, jump("a", "0", "1"), jump("b", "1", "2"), jump("c", "2", "3"), jump("d", "0", "2"), jump("e", "3", "2"));
    expect(boardTargets(scene).filter((t) => t.target.part === "whole" && t.target.objectId !== "n")).toHaveLength(5);
  });
});

describe("review R5: an arrow keeps clear of the labels a line still writes", () => {
  const setup = () =>
    ok(
      createScene({ page: { cols: 60, rows: 30 } }),
      line("n", "-1", "2", "0.5", { labels: "none", form: "mixed" }),
      { op: "fraction", id: "f", numerator: "1", denominator: "2", place: { rightOf: "n" } },
    );
  const ticks = (scene: Scene) => boardTargets(scene).filter((t) => t.target.objectId === "n" && t.target.part === "value");

  it("labels 3/2 after an arrow from the fraction's numerator points at it", () => {
    let scene = setup();
    scene = ok(scene, { op: "arrow", id: "a", from: part("f", "numerator"), to: value("n", "3/2") });
    scene = ok(scene, { op: "put", target: value("n", "3/2"), value: "1.5" });
    expect(info(scene, value("n", "3/2")).value).toBe("1 1/2");
    // In one batch too.
    ok(setup(), { op: "arrow", id: "a", from: part("f", "numerator"), to: value("n", "3/2") }, { op: "put", target: value("n", "3/2"), value: "1.5" });
  });

  it("leaves every writable tick writable after any arrow it accepts, to a tick or from one", () => {
    const base = setup();
    let accepted = 0;
    for (const from of ["numerator", "bar", "denominator", "whole"])
      for (const t of ticks(base)) {
        for (const ends of [{ from: part("f", from), to: t.target }, { from: t.target, to: part("f", from) }]) {
          const r = applyBatch(base, { transactionId: `f${++tx}`, commands: [{ op: "arrow", id: "a", ...ends }] });
          if (!r.ok) {
            expect(r.refusal.code).toBe("no_room");
            continue;
          }
          accepted++;
          for (const w of ticks(r.scene).filter((x) => x.writable)) ok(r.scene, { op: "put", target: w.target });
        }
      }
    expect(accepted).toBeGreaterThan(0);
  });
});
