import { describe, expect, it } from "vitest";
import { addChildInk, applyBatch, boardPages, boardPaths, boardView, DEFAULT_PAGE, boardTargets, createScene, sameTarget, type BoardPath, type Scene, type Target } from "@/lib/board";

// Long division on Maya's board (#316, spec #297): the model names each step, and the core computes and checks every
// quotient digit, product, difference and bring-down. These tests use only the public API.

let tx = 0;
/** Applies one batch and fails the test with the refusal when the core refuses it. */
function ok(scene: Scene, ...commands: unknown[]): Scene {
  const r = applyBatch(scene, { transactionId: `d${++tx}`, commands });
  if (!r.ok) throw new Error(`refused: ${r.refusal.code}: ${r.refusal.reason}`);
  return r.scene;
}

const cell = (objectId: string, rowId: string, column: string): Target => ({ objectId, part: "cell", rowId, column }) as Target;
const row = (objectId: string, rowId: string): Target => ({ objectId, part: "row", rowId });

function info(scene: Scene, target: Target) {
  const found = boardTargets(scene).find((t) => sameTarget(t.target, target));
  if (!found) throw new Error(`no target ${JSON.stringify(target)}`);
  return found;
}

const pathsFor = (scene: Scene, target: Target) => boardPaths(scene).filter((p) => p.target !== null && sameTarget(p.target, target));
const box = (paths: BoardPath[]) => {
  const pts = paths.flatMap((p) => p.pts);
  return { left: Math.min(...pts.map(([x]) => x)), right: Math.max(...pts.map(([x]) => x)), top: Math.min(...pts.map(([, y]) => y)), bottom: Math.max(...pts.map(([, y]) => y)) };
};

const divide = (id: string, dividend: string, divisor: string, place: unknown = { region: "main" }) => ({ op: "division", id, dividend, divisor, place });

describe("618 ÷ 3 = 206: a zero inside the quotient", () => {
  const start = () => ok(createScene(), divide("div", "618", "3"));

  it("writes the divisor and the dividend, and leaves one empty quotient cell over each step's digit", () => {
    const scene = start();
    expect(info(scene, row("div", "dividend")).value).toBe("618");
    expect(info(scene, row("div", "divisor")).value).toBe("3");
    expect(info(scene, cell("div", "dividend", "hundreds")).value).toBe("6");
    for (const column of ["hundreds", "tens", "ones"]) expect(info(scene, cell("div", "quotient", column))).toMatchObject({ writable: true, value: null });
    expect(info(scene, row("div", "quotient"))).toMatchObject({ writable: true, value: null });
  });

  it("shows each step in order: divide, multiply, subtract, bring down, with the 0 for 1 ÷ 3", () => {
    let scene = start();
    const put = (target: Target, value: string) => ({ op: "put", target, value });
    // Step 1: 6 ÷ 3 = 2, 2 × 3 = 6, 6 − 6 = 0.
    scene = ok(scene, put(cell("div", "quotient", "hundreds"), "2"), put(row("div", "product1"), "6"), put(row("div", "difference1"), "0"));
    // Step 2 brings down the 1: 1 ÷ 3 = 0 R 1, so the quotient gets its 0, 0 × 3 = 0, 1 − 0 = 1.
    scene = ok(scene, put(row("div", "bring2"), "1"), put(cell("div", "quotient", "tens"), "0"), put(row("div", "product2"), "0"), put(row("div", "difference2"), "1"));
    // Step 3 brings down the 8: 18 ÷ 3 = 6, 6 × 3 = 18, 18 − 18 = 0.
    scene = ok(scene, put(row("div", "bring3"), "8"), put(cell("div", "quotient", "ones"), "6"), put(row("div", "product3"), "18"), put(row("div", "difference3"), "0"));
    expect(info(scene, row("div", "quotient")).value).toBe("206");
    expect(info(scene, row("div", "product3"))).toMatchObject({ value: "18", writable: false });
    expect(info(scene, cell("div", "product3", "tens")).value).toBe("1");
    expect(info(scene, cell("div", "difference2", "tens")).value).toBe("1");
    // No remainder: there is no remainder slot.
    expect(boardTargets(scene).some((t) => "rowId" in t.target && t.target.rowId === "remainder")).toBe(false);
  });

  it("names each step with a true equality", () => {
    const labels = ["step1", "step2", "step3"].map((s) => info(start(), row("div", s)).label);
    expect(labels).toEqual(["div step 1: 6 ÷ 3 = 2", "div step 2: 1 ÷ 3 = 0 R 1", "div step 3: 18 ÷ 3 = 6"]);
  });
});

/** The refusal for a batch the core must refuse. */
function refusal(scene: Scene, ...commands: unknown[]) {
  const r = applyBatch(scene, { transactionId: `d${++tx}`, commands });
  if (r.ok) throw new Error("expected a refusal");
  return r.refusal;
}
const put = (target: Target, value: string) => ({ op: "put", target, value });

describe("refused division commands", () => {
  it("refuses dividing by zero", () => {
    expect(refusal(createScene(), divide("d", "12", "0"))).toMatchObject({ index: 0, code: "not_allowed", reason: expect.stringMatching(/divided by 0/) });
  });

  it("refuses a step out of order: multiply before divide, subtract before multiply, divide before bringing down", () => {
    let scene = ok(createScene(), divide("div", "157", "6"));
    expect(refusal(scene, put(row("div", "product1"), "12"))).toMatchObject({ code: "not_allowed", reason: expect.stringMatching(/quotient digit over the tens first/) });
    scene = ok(scene, put(cell("div", "quotient", "tens"), "2"));
    expect(refusal(scene, put(row("div", "difference1"), "3"))).toMatchObject({ code: "not_allowed", reason: expect.stringMatching(/product1/) });
    scene = ok(scene, put(row("div", "product1"), "12"));
    expect(refusal(scene, put(row("div", "bring2"), "7"))).toMatchObject({ code: "not_allowed", reason: expect.stringMatching(/difference1/) });
    scene = ok(scene, put(row("div", "difference1"), "3"));
    expect(refusal(scene, put(cell("div", "quotient", "ones"), "6"))).toMatchObject({ code: "not_allowed", reason: expect.stringMatching(/bring2/) });
    // All or none: a batch that writes the quotient before its bring-down changes nothing.
    expect(refusal(scene, put(cell("div", "quotient", "ones"), "6"), put(row("div", "bring2"), "7"))).toMatchObject({ index: 0, code: "not_allowed" });
    expect(info(scene, row("div", "bring2")).value).toBeNull();
  });

  it("refuses a wrong value and states only true equalities in the reason", () => {
    let scene = ok(createScene(), divide("div", "157", "6"));
    // 15 ÷ 6 is 2 R 3, so a 3 in the quotient is wrong; the reason never claims "15 ÷ 6 = 2".
    const q = refusal(scene, put(cell("div", "quotient", "tens"), "3"));
    expect(q).toMatchObject({ code: "wrong_value" });
    expect(q.reason).toContain("15 ÷ 6 = 2 R 3");
    expect(q.reason).not.toMatch(/15 ÷ 6 = 2(?! R)/);
    scene = ok(scene, put(cell("div", "quotient", "tens"), "2"));
    expect(refusal(scene, put(row("div", "product1"), "13")).reason).toContain("2 × 6 = 12");
    scene = ok(scene, put(row("div", "product1"), "12"));
    expect(refusal(scene, put(row("div", "difference1"), "4")).reason).toContain("15 − 12 = 3");
    scene = ok(scene, put(row("div", "difference1"), "3"));
    expect(refusal(scene, put(row("div", "bring2"), "5"))).toMatchObject({ code: "wrong_value", reason: expect.stringMatching(/bring down 7/) });
  });

  it("refuses a dividend or divisor that is not a whole number, or too long", () => {
    expect(refusal(createScene(), divide("d", "1.5", "3"))).toMatchObject({ code: "unsupported" });
    expect(refusal(createScene(), divide("d", "012", "3"))).toMatchObject({ code: "invalid_command" });
    expect(refusal(createScene(), divide("d", "1234567", "3"))).toMatchObject({ code: "invalid_command" });
    expect(refusal(createScene(), { ...divide("d", "12", "3"), quotient: "4" })).toMatchObject({ code: "invalid_command", reason: expect.stringMatching(/unknown field "quotient"/) });
  });
});

describe("157 ÷ 6 = 26 R 1: a remainder", () => {
  const finish = () => {
    let scene = ok(createScene(), divide("div", "157", "6"));
    scene = ok(scene, put(cell("div", "quotient", "tens"), "2"), put(row("div", "product1"), "12"), put(row("div", "difference1"), "3"));
    scene = ok(scene, put(row("div", "bring2"), "7"), put(cell("div", "quotient", "ones"), "6"), put(row("div", "product2"), "36"), put(row("div", "difference2"), "1"));
    return scene;
  };

  it("starts over the tens, because 1 is less than 6, and names the steps 15 ÷ 6 and 37 ÷ 6", () => {
    const scene = ok(createScene(), divide("div", "157", "6"));
    expect(boardTargets(scene).some((t) => sameTarget(t.target, cell("div", "quotient", "hundreds")))).toBe(false);
    expect(info(scene, row("div", "step1")).label).toBe("div step 1: 15 ÷ 6 = 2 R 3");
    expect(info(scene, row("div", "step2")).label).toBe("div step 2: 37 ÷ 6 = 6 R 1");
  });

  it("writes the remainder as R 1 right of the quotient, once the last subtraction is done", () => {
    const scene = finish();
    expect(info(scene, row("div", "quotient")).value).toBe("26");
    expect(info(scene, row("div", "remainder"))).toMatchObject({ writable: true, value: null });
    expect(refusal(scene, put(row("div", "remainder"), "R 1"))).toMatchObject({ code: "invalid_command", reason: expect.stringMatching(/the board writes the R/) });
    expect(refusal(scene, put(row("div", "remainder"), "2")).reason).toContain("157 ÷ 6 = 26 R 1");
    const done = ok(scene, put(row("div", "remainder"), "1"));
    expect(info(done, row("div", "remainder")).value).toBe("1");
    const r = pathsFor(done, row("div", "remainder"));
    expect(r.map((p) => p.glyph)).toEqual(["R", "R", "1"]);
    // The R and its digit sit in the quotient row, right of the last quotient digit.
    const ones = box(pathsFor(done, cell("div", "quotient", "ones")));
    expect(box(r).left).toBeGreaterThan(ones.right);
    expect(box(r).top).toBeLessThan(ones.bottom);
    expect(box(r).bottom).toBeGreaterThan(ones.top);
  });

  it("refuses the remainder before the last subtraction, and a check before the work is finished", () => {
    let scene = ok(createScene(), divide("div", "157", "6"));
    scene = ok(scene, put(cell("div", "quotient", "tens"), "2"), put(row("div", "product1"), "12"), put(row("div", "difference1"), "3"));
    expect(refusal(scene, put(row("div", "remainder"), "1"))).toMatchObject({ code: "not_allowed", reason: expect.stringMatching(/difference2/) });
    const check = (target: Target) => ({ op: "mark", id: `c${++tx}`, target, style: "check" });
    expect(refusal(scene, check(row("div", "quotient")))).toMatchObject({ code: "not_allowed" });
    expect(refusal(scene, check(row("div", "step2")))).toMatchObject({ code: "not_allowed" });
    ok(scene, check(row("div", "step1")));
    ok(scene, check(row("div", "product1")));
    const done = ok(finish(), put(row("div", "remainder"), "1"));
    expect(refusal(finish(), check({ objectId: "div", part: "whole" }))).toMatchObject({ code: "not_allowed" });
    ok(done, check({ objectId: "div", part: "whole" }), check(row("div", "quotient")));
  });
});

describe("layout", () => {
  it("lines each quotient digit up over its dividend digit, and each product under the digits it divides", () => {
    let scene = ok(createScene(), divide("div", "157", "6"));
    scene = ok(scene, put(cell("div", "quotient", "tens"), "2"), put(row("div", "product1"), "12"));
    const centre = (paths: BoardPath[]) => (box(paths).left + box(paths).right) / 2;
    const width = 1 / DEFAULT_PAGE.cols;
    expect(Math.abs(centre(pathsFor(scene, cell("div", "quotient", "tens"))) - centre(pathsFor(scene, cell("div", "dividend", "tens"))))).toBeLessThan(width / 2);
    expect(Math.abs(centre(pathsFor(scene, cell("div", "product1", "tens"))) - centre(pathsFor(scene, cell("div", "dividend", "tens"))))).toBeLessThan(width / 2);
    expect(Math.abs(centre(pathsFor(scene, cell("div", "product1", "hundreds"))) - centre(pathsFor(scene, cell("div", "dividend", "hundreds"))))).toBeLessThan(width / 2);
    // The quotient sits above the dividend, the product below it, with the bracket, the minus sign and a rule drawn.
    expect(box(pathsFor(scene, cell("div", "quotient", "tens"))).bottom).toBeLessThan(box(pathsFor(scene, cell("div", "dividend", "tens"))).top);
    expect(box(pathsFor(scene, cell("div", "product1", "tens"))).top).toBeGreaterThan(box(pathsFor(scene, cell("div", "dividend", "tens"))).bottom);
    const kinds = boardPaths(scene).map((p) => p.glyph ?? p.kind);
    expect(kinds.filter((k) => k === "rule")).toHaveLength(2);
    expect(kinds).toContain("−");
  });

  it("reserves every row when it is created, and moves to a new board page when the page has no room for them", () => {
    let scene = ok(createScene(), { op: "columns", id: "sum", operation: "add", operands: [{ id: "a", value: "27" }, { id: "b", value: "39" }], place: { region: "main" } });
    // 987654 ÷ 3 takes six steps: twelve rows of work under the dividend, more than is left under the sum.
    const r = applyBatch(scene, { transactionId: "big", commands: [divide("div", "987654", "3", { below: "sum" })] });
    if (!r.ok) throw new Error(r.refusal.reason);
    expect(r.notices).toEqual([{ kind: "new_page", objectId: "div", page: 2 }]);
    scene = r.scene;
    expect(boardPages(scene)).toBe(2);
    expect(boardView(scene).page).toBe(2);
    expect(info(scene, row("div", "difference6")).page).toBe(2);
    const onesBefore = pathsFor(scene, cell("div", "dividend", "ones"));
    // Writing every step keeps everything where it was, on page 2, inside the page.
    const steps = [
      ["hundred_thousands", "3", "9", "0"],
      ["ten_thousands", "2", "6", "2"],
      ["thousands", "9", "27", "0"],
      ["hundreds", "2", "6", "0"],
      ["tens", "1", "3", "2"],
      ["ones", "8", "24", "0"],
    ];
    const digits = "987654";
    steps.forEach(([column, q, product, diff], k) => {
      const n = k + 1;
      const cmds: unknown[] = n > 1 ? [put(row("div", `bring${n}`), digits[k])] : [];
      cmds.push(put(cell("div", "quotient", column), q), put(row("div", `product${n}`), product), put(row("div", `difference${n}`), diff));
      scene = ok(scene, ...cmds);
    });
    expect(info(scene, row("div", "quotient")).value).toBe("329218");
    expect(boardPages(scene)).toBe(2);
    expect(pathsFor(scene, cell("div", "dividend", "ones"))).toEqual(onesBefore);
    const mine = boardPaths(scene).filter((p) => p.objectId === "div");
    expect(mine.every((p) => p.page === 2)).toBe(true);
    const all = box(mine);
    expect(all.bottom).toBeLessThanOrEqual(DEFAULT_PAGE.rows / DEFAULT_PAGE.cols);
    expect(all.right).toBeLessThanOrEqual(1);
  });

  it("routes an arrow between any two cells of 618 ÷ 3 clear of every step written after it", () => {
    const start = ok(createScene(), divide("div", "618", "3"));
    const rest = [
      put(cell("div", "quotient", "hundreds"), "2"),
      put(row("div", "product1"), "6"),
      put(row("div", "difference1"), "0"),
      put(row("div", "bring2"), "1"),
      put(cell("div", "quotient", "tens"), "0"),
      put(row("div", "product2"), "0"),
      put(row("div", "difference2"), "1"),
      put(row("div", "bring3"), "8"),
      put(cell("div", "quotient", "ones"), "6"),
      put(row("div", "product3"), "18"),
      put(row("div", "difference3"), "0"),
    ];
    const cells = boardTargets(start).filter((t) => t.target.part === "cell").map((t) => t.target);
    let routed = 0;
    for (const from of cells)
      for (const to of cells) {
        if (sameTarget(from, to)) continue;
        const r = applyBatch(start, { transactionId: `a${++tx}`, commands: [{ op: "arrow", id: "link", from, to }] });
        const label = `${JSON.stringify(from)} to ${JSON.stringify(to)}`;
        if (!r.ok) {
          expect(r.refusal.code, label).toBe("no_room");
          continue;
        }
        routed++;
        // The core refuses any later stroke that runs through the arrow, so every step being accepted means none does.
        let later = r.scene;
        for (const step of rest) {
          const next = applyBatch(later, { transactionId: `a${++tx}`, commands: [step] });
          expect(next.ok ? "ok" : next.refusal.reason, label).toBe("ok");
          if (next.ok) later = next.scene;
        }
      }
    expect(routed).toBeGreaterThan(0);
  });
});

describe("the common commands on a division", () => {
  const solved = () => {
    let scene = ok(createScene(), divide("div", "157", "6"));
    scene = ok(scene, put(cell("div", "quotient", "tens"), "2"), put(row("div", "product1"), "12"), put(row("div", "difference1"), "3"));
    scene = ok(scene, put(row("div", "bring2"), "7"), put(cell("div", "quotient", "ones"), "6"), put(row("div", "product2"), "36"), put(row("div", "difference2"), "1"));
    return ok(scene, put(row("div", "remainder"), "1"));
  };

  it("marks and focuses a step, circles the whole problem with its remainder, and removes it all", () => {
    let scene = solved();
    scene = ok(scene, { op: "mark", id: "glow", target: row("div", "step2"), style: "highlight" }, { op: "focus", target: row("div", "step2") });
    expect(boardView(scene).target).toEqual(row("div", "step2"));
    // The highlight lies over the 37, the 36 and the 1 of step 2, and not over step 1's 12.
    const glow = boardPaths(scene).find((p) => p.objectId === "glow")!;
    const band = { left: Math.min(...glow.pts.map(([x]) => x)) - glow.width / 2, right: Math.max(...glow.pts.map(([x]) => x)) + glow.width / 2 };
    // The highlight is one thick stroke down the step: its centre line runs from its top to its bottom.
    const top = Math.min(...glow.pts.map(([, y]) => y));
    const bottom = Math.max(...glow.pts.map(([, y]) => y));
    const under = (paths: BoardPath[]) => box(paths).left >= band.left && box(paths).right <= band.right && box(paths).bottom > top && box(paths).top < bottom;
    expect(under(pathsFor(scene, cell("div", "product2", "tens")))).toBe(true);
    expect(under(pathsFor(scene, cell("div", "difference2", "ones")))).toBe(true);
    expect(under(pathsFor(scene, cell("div", "product1", "hundreds")))).toBe(false);
    scene = ok(scene, { op: "mark", id: "ring", target: { objectId: "div", part: "whole" }, style: "circle" });
    const ring = box(boardPaths(scene).filter((p) => p.objectId === "ring"));
    const r = box(pathsFor(scene, row("div", "remainder")));
    expect(r.right).toBeLessThan(ring.right);
    scene = ok(scene, { op: "remove", objectId: "div" });
    expect(boardPaths(scene)).toEqual([]);
    expect(boardTargets(scene)).toEqual([]);
  });

  it("undoes a step, and refuses an undo that later steps depend on", () => {
    let scene = ok(createScene(), divide("div", "157", "6"));
    scene = ok(scene, put(cell("div", "quotient", "tens"), "2"));
    const productTx = `d${tx + 1}`;
    scene = ok(scene, put(row("div", "product1"), "12"));
    const later = ok(scene, put(row("div", "difference1"), "3"));
    // The difference needs the product: undoing the product first is refused.
    expect(applyBatch(later, { transactionId: "u1", commands: [{ op: "undo", transactionId: productTx }] }).ok).toBe(false);
    const undone = applyBatch(scene, { transactionId: "u2", commands: [{ op: "undo", transactionId: productTx }] });
    expect(undone.ok).toBe(true);
    if (undone.ok) {
      expect(info(undone.scene, row("div", "product1"))).toMatchObject({ writable: true, value: null });
      expect(undone.erased.length).toBeGreaterThan(0);
    }
  });

  it("never writes over the child's ink: a step whose digits would cover it is refused", () => {
    const start = ok(createScene(), divide("div", "157", "6"));
    // The child writes where the tens digit of the quotient goes, over the 5 of 157.
    const tens = box(pathsFor(start, cell("div", "dividend", "tens")));
    const x = (tens.left + tens.right) / 2;
    const y = tens.top - 1 / DEFAULT_PAGE.cols / 2;
    const scene = addChildInk(start, { page: 1, stroke: { erase: false, w: 3, pts: [[x - 0.005, y], [x + 0.005, y]] }, boardWidth: 800 }).scene;
    expect(refusal(scene, put(cell("div", "quotient", "tens"), "2"))).toMatchObject({ code: "protected_ink" });
    expect(refusal(scene, { op: "remove", objectId: "child-1" })).toMatchObject({ code: "protected_ink" });
  });
});
