import { describe, expect, it } from "vitest";
import { applyBatch, boardPaths, boardView, createScene, type BoardPath, type Scene, type TimedPath } from "@/lib/board";
import { finishedFrame, fitView, frameAt, pageAt, pathData, reveal, timeline, type PlayStep } from "@/lib/board-svg";

// The web renderer's pure part (#319): Maya's board paths as SVG path data, and the playback of drawn strokes as a pure
// function of the time since playing started. No DOM: the React component only paints what these return.

describe("SVG path data", () => {
  it("draws a stroke as one open polyline, in thousandths of the board width", () => {
    expect(pathData([[0.1, 0.2], [0.35, 0.2], [0.3504, 0.41234]])).toBe("M100 200L350 200L350.4 412.3");
  });

  it("draws a single point as a dot", () => {
    expect(pathData([[0.5, 0.5]])).toBe("M500 500L500 500");
  });
});

/** A stroke of Maya's, as the core returns it: only what the playback reads matters here. */
let painted = 0;
function stroke(id: string, startMs: number, durationMs: number, layer: BoardPath["layer"] = "math"): TimedPath {
  return {
    id,
    owner: "maya",
    objectId: "o",
    target: null,
    kind: "glyph",
    page: 1,
    layer,
    ink: "blue",
    opacity: 1,
    width: 0.004,
    pts: [
      [0, 0],
      [0.5, 0],
    ],
    length: 0.5,
    durationMs,
    startMs,
    order: ++painted,
  };
}

const shown = (frame: ReturnType<typeof frameAt>) => frame.map((f) => [f.path.id, f.progress]);

describe("playback", () => {
  // Two batches as the core returns them: times start at 0 in each batch.
  const steps = [{ drawn: [stroke("a", 0, 100), stroke("b", 140, 100)] }, { drawn: [stroke("c", 0, 200)] }];

  it("plays batches one after another, with a pause between them", () => {
    const t = timeline(steps, { gapMs: 300 });
    expect(t.durationMs).toBe(240 + 300 + 200);
    expect(shown(frameAt(t, 540 + 100))).toEqual([["a", 1], ["b", 1], ["c", 0.5]]);
  });

  it("draws each stroke from its start time over its duration, and nothing before it starts", () => {
    const t = timeline(steps, { gapMs: 300 });
    expect(shown(frameAt(t, 0))).toEqual([]);
    expect(shown(frameAt(t, 25))).toEqual([["a", 0.25]]);
    expect(shown(frameAt(t, 120))).toEqual([["a", 1]]);
    expect(shown(frameAt(t, 190))).toEqual([["a", 1], ["b", 0.5]]);
  });

  it("shows the finished board at once from any time after the end", () => {
    const t = timeline(steps);
    expect(shown(frameAt(t, Infinity))).toEqual([["a", 1], ["b", 1], ["c", 1]]);
  });

  it("takes strokes away when a later batch erases them (an undo or a clear)", () => {
    const t = timeline([...steps, { drawn: [], erased: ["c"] }, { drawn: [stroke("d", 0, 100)] }], { gapMs: 300 });
    // The erasing batch starts at 740 + 300 = 1040; the next one at 1340.
    expect(shown(frameAt(t, 1039))).toEqual([["a", 1], ["b", 1], ["c", 1]]);
    expect(shown(frameAt(t, 1040))).toEqual([["a", 1], ["b", 1]]);
    expect(shown(frameAt(t, Infinity))).toEqual([["a", 1], ["b", 1], ["d", 1]]);
  });

  it("paints highlights under the math, and marks over it", () => {
    const t = timeline([{ drawn: [stroke("carry", 0, 10, "annotation"), stroke("digit", 10, 10), stroke("glow", 20, 10, "behind")] }]);
    expect(frameAt(t, Infinity).map((f) => f.path.id)).toEqual(["glow", "digit", "carry"]);
  });
});

describe("the view", () => {
  it("fits the work with its line widths and a margin, in SVG units", () => {
    const a = { ...stroke("a", 0, 1), pts: [[0.1, 0.2], [0.3, 0.2]] as [number, number][], width: 0.01 };
    const b = { ...stroke("b", 0, 1), pts: [[0.2, 0.25], [0.2, 0.4]] as [number, number][], width: 0.02 };
    expect(fitView([a, b], 0.05)).toBe("45 145 310 315");
  });
});

describe("revealing a stroke as the pen moves", () => {
  it("shows the first part of the stroke with a dash as long as the stroke", () => {
    expect(reveal(stroke("a", 0, 100), 0.25)).toEqual({ dasharray: "500 500", dashoffset: 375 });
  });

  it("draws a finished stroke plainly", () => {
    expect(reveal(stroke("a", 0, 100), 1)).toBeNull();
  });
});

describe("27 + 39 from the board core", () => {
  const cell = (rowId: string, column: string) => ({ objectId: "sum1", part: "cell", rowId, column });
  const BATCHES = [
    [{ op: "columns", id: "sum1", operation: "add", operands: [{ id: "top", value: "27" }, { id: "bottom", value: "39" }], place: { region: "main" } }],
    [{ op: "mark", id: "ones", target: { objectId: "sum1", part: "column", column: "ones" }, style: "highlight" }],
    [{ op: "put", target: cell("answer", "ones"), value: "6", ink: "green" }, { op: "regroup", id: "carry1", objectId: "sum1", rowId: "answer", kind: "carry", from: "ones", to: "tens" }],
    [{ op: "remove", objectId: "ones" }],
    [{ op: "put", target: cell("answer", "tens"), value: "6", ink: "green" }],
  ];
  function play(): { scene: Scene; steps: PlayStep[] } {
    let scene = createScene();
    const steps: PlayStep[] = [];
    BATCHES.forEach((commands, i) => {
      const r = applyBatch(scene, { transactionId: `t${i}`, commands });
      if (!r.ok) throw new Error(r.refusal.reason);
      scene = r.scene;
      steps.push(r);
    });
    return { scene, steps };
  }

  it("ends a replay on exactly the board a reload shows at once", () => {
    const { scene, steps } = play();
    const t = timeline(steps);
    const end = frameAt(t, t.durationMs);
    expect(end.every((f) => f.progress === 1)).toBe(true);
    expect(end.map((f) => f.path.id)).toEqual(finishedFrame(boardPaths(scene), boardView(scene).page).map((f) => f.path.id));
    // The highlight came and went: it is not on the finished board.
    expect(end.some((f) => f.path.objectId === "ones")).toBe(false);
  });

  it("writes the answer's ones digit before the carry, and the carry before the tens digit", () => {
    const { steps } = play();
    const t = timeline(steps);
    const firstSeen = (match: (p: BoardPath) => boolean) => {
      for (let ms = 0; ms <= t.durationMs; ms += 10) if (frameAt(t, ms).some((f) => match(f.path))) return ms;
      return Infinity;
    };
    const ones = firstSeen((p) => p.target?.part === "cell" && p.target.rowId === "answer" && p.target.column === "ones");
    const carry = firstSeen((p) => p.objectId === "carry1");
    const tens = firstSeen((p) => p.target?.part === "cell" && p.target.rowId === "answer" && p.target.column === "tens");
    expect(ones).toBeLessThan(carry);
    expect(carry).toBeLessThan(tens);
  });
});

describe("paint order after an undo", () => {
  it("paints a stroke an undo brings back where the core paints it, as a reload would", () => {
    const ones = { objectId: "sum1", part: "column", column: "ones" };
    const batches: [string, unknown[]][] = [
      ["sum", [{ op: "columns", id: "sum1", operation: "add", operands: [{ id: "top", value: "27" }, { id: "bottom", value: "39" }], place: { region: "main" } }]],
      ["red", [{ op: "mark", id: "red", target: ones, style: "circle", ink: "red" }]],
      ["blue", [{ op: "mark", id: "blue", target: ones, style: "circle", ink: "blue" }]],
      ["drop", [{ op: "remove", objectId: "red" }]],
      ["back", [{ op: "undo", transactionId: "drop" }]],
    ];
    let scene = createScene();
    const steps: PlayStep[] = [];
    for (const [transactionId, commands] of batches) {
      const r = applyBatch(scene, { transactionId, commands });
      if (!r.ok) throw new Error(r.refusal.reason);
      scene = r.scene;
      steps.push(r);
    }
    const t = timeline(steps);
    const end = frameAt(t, t.durationMs).map((f) => f.path.id);
    const reload = finishedFrame(boardPaths(scene), boardView(scene).page).map((f) => f.path.id);
    expect(end).toEqual(reload);
    // The red circle came first, so the blue one is painted over it.
    const circles = end.filter((id) => id.startsWith("red") || id.startsWith("blue"));
    expect(circles.map((id) => id.split(":")[0])).toEqual(["red", "blue"]);
  });
});

describe("board pages", () => {
  const sum = (id: string, top: string, place: unknown) => [{ op: "columns", id, operation: "add", operands: [{ id: "top", value: top }, { id: "bottom", value: "39" }], place }];
  // Three stacked sums fill page 1; the fourth goes to page 2. Then Maya points back at the first sum.
  const BATCHES = [
    sum("a", "27", { region: "main" }),
    sum("b", "28", { below: "a" }),
    sum("c", "29", { below: "b" }),
    sum("d", "30", { below: "c" }),
    [{ op: "focus", target: { objectId: "a", part: "whole" } }],
  ];
  function play(count: number): { scene: Scene; steps: PlayStep[] } {
    let scene = createScene();
    const steps: PlayStep[] = [];
    BATCHES.slice(0, count).forEach((commands, i) => {
      const r = applyBatch(scene, { transactionId: `p${i}`, commands });
      if (!r.ok) throw new Error(r.refusal.reason);
      scene = r.scene;
      steps.push({ ...r, view: boardView(r.scene) });
    });
    return { scene, steps };
  }
  const pages = (frame: ReturnType<typeof frameAt>) => [...new Set(frame.map((f) => f.path.page))];

  it("turns to page 2 when the work overflows, and shows only that page", () => {
    const { scene, steps } = play(4);
    expect(boardView(scene).page).toBe(2);
    const t = timeline(steps);
    const end = frameAt(t, t.durationMs);
    expect(pages(end)).toEqual([2]);
    expect(end.map((f) => f.path.id)).toEqual(finishedFrame(boardPaths(scene), 2).map((f) => f.path.id));
    expect(end.length).toBe(boardPaths(scene).filter((p) => p.page === 2).length);
  });

  it("shows page 1 until the batch that writes on page 2 starts", () => {
    const { steps } = play(4);
    const t = timeline(steps);
    const pageTwoStarts = Math.min(...t.strokes.filter((s) => s.path.page === 2).map((s) => s.startMs));
    expect(pageAt(t, pageTwoStarts - 1)).toBe(1);
    expect(pages(frameAt(t, pageTwoStarts - 1))).toEqual([1]);
    expect(frameAt(t, pageTwoStarts - 1)).toHaveLength(finishedFrame(play(3).steps.flatMap((s) => s.drawn), 1).length);
    expect(pageAt(t, pageTwoStarts)).toBe(2);
    expect(pages(frameAt(t, pageTwoStarts + 1))).toEqual([2]);
  });

  it("goes back to page 1 when Maya points at work there, as a reload of the board would", () => {
    const { scene, steps } = play(5);
    expect(boardView(scene).page).toBe(1);
    const t = timeline(steps);
    expect(pageAt(t, Infinity)).toBe(1);
    expect(frameAt(t, Infinity).map((f) => f.path.id)).toEqual(finishedFrame(boardPaths(scene), 1).map((f) => f.path.id));
  });
});
