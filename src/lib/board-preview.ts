// The admin board preview (#319): 27 + 39 and 157 ÷ 6 as Maya would work them, and the digits, in each font Savar
// chooses from. Built on the server through the board core, so the page sends only the strokes to the browser.
import { applyBatch, BOARD_FONTS, boardView, createScene, type BoardFont, type GlyphSet, type PageSize } from "@/lib/board";
import { fitView, type PlayStep } from "@/lib/board-svg";

const cell = (rowId: string, column: string) => ({ objectId: "sum1", part: "cell", rowId, column });

/** 27 + 39 = 66 in Maya's teaching order: the sum, the ones column lit, the ones digit and its carry, the tens, a check. */
const SUM: unknown[][] = [
  [{ op: "columns", id: "sum1", operation: "add", operands: [{ id: "top", value: "27" }, { id: "bottom", value: "39" }], place: { region: "main" } }],
  [{ op: "mark", id: "onesGlow", target: { objectId: "sum1", part: "column", column: "ones" }, style: "highlight" }],
  [
    { op: "put", target: cell("answer", "ones"), value: "6", ink: "green" },
    { op: "regroup", id: "carry1", objectId: "sum1", rowId: "answer", kind: "carry", from: "ones", to: "tens" },
  ],
  [{ op: "put", target: cell("answer", "tens"), value: "6", ink: "green" }],
  [{ op: "mark", id: "done", target: { objectId: "sum1", part: "row", rowId: "answer" }, style: "check" }],
];

const div = (rowId: string) => ({ objectId: "div", part: "row", rowId });
const quotient = (column: string) => ({ objectId: "div", part: "cell", rowId: "quotient", column });

/** 157 ÷ 6 = 26 R 1 as long division: the core works out and checks each digit, product, difference and bring-down. */
const DIVISION: unknown[][] = [
  [{ op: "division", id: "div", dividend: "157", divisor: "6", place: { region: "main" } }],
  [{ op: "put", target: quotient("tens") }, { op: "put", target: div("product1") }, { op: "put", target: div("difference1") }],
  [{ op: "put", target: div("bring2") }, { op: "put", target: quotient("ones") }, { op: "put", target: div("product2") }, { op: "put", target: div("difference2") }],
  [{ op: "put", target: div("remainder") }],
];

/** The digits, then the signs: the font's + × ÷ = and the board's own minus and check mark. */
const SPECIMEN: unknown[][] = [
  [{ op: "write", id: "digits", text: "0123456789", place: { region: "main" } }],
  [{ op: "write", id: "signs", text: "+ − × ÷ = ✓", place: { below: "digits" } }],
];

export interface PreviewBoard {
  steps: PlayStep[];
  /** The SVG viewBox around the finished work. */
  viewBox: string;
}

export interface FontPreview extends Omit<BoardFont, "glyphs"> {
  sum: PreviewBoard;
  division: PreviewBoard;
  specimen: PreviewBoard;
}

function play(glyphs: GlyphSet, batches: unknown[][], page?: PageSize): PreviewBoard {
  let scene = createScene({ glyphs, page });
  const steps: PlayStep[] = [];
  batches.forEach((commands, i) => {
    const r = applyBatch(scene, { transactionId: `preview-${i}`, commands });
    if (!r.ok) throw new Error(`The board refused preview step ${i}: ${r.refusal.reason}`);
    scene = r.scene;
    steps.push({ drawn: r.drawn, erased: r.erased, view: boardView(r.scene) });
  });
  return { steps, viewBox: fitView(steps.flatMap((s) => s.drawn), 0.02) };
}

export function fontPreviews(): FontPreview[] {
  return BOARD_FONTS.map(({ glyphs, ...font }) => ({
    ...font,
    sum: play(glyphs, SUM),
    division: play(glyphs, DIVISION),
    specimen: play(glyphs, SPECIMEN, { cols: 13, rows: 5 }),
  }));
}
