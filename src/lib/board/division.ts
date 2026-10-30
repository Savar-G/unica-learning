// Long division on the board: the divisor, the bracket and the dividend, with the quotient row above and two rows per
// step below (the product, then the difference with the next digit brought down beside it). Every row is reserved when
// the problem is created, so the work never moves. The code works out each step from the numbers; the model only says
// which step to show, in the method's order, and a value it gives that is wrong is refused.
import type { Point } from "@/lib/board/glyphs";
import { curvedArrow } from "@/lib/board/geometry";
import {
  DIGIT_WIDTH,
  glyphStrokes,
  missingGlyphs,
  refuse,
  SMALL_WIDTH,
  type Ctx,
  type LocalStroke,
  type LocalTarget,
  type RefusalBody,
  type Representation,
  type Reserved,
  type WrittenDigit,
} from "@/lib/board/representation";
import { PLACE_NAMES, type DivisionCommand, type Ink, type MarkStyle, type Rect, type Target } from "@/lib/board/types";

/** One step of the method: divide the partial dividend, multiply, subtract, then bring the next digit down. */
interface DivStep {
  /** The index (from the left) of the dividend digit the step's quotient digit sits over. */
  at: number;
  partial: number;
  quotientDigit: number;
  product: number;
  difference: number;
}

export interface DivisionState {
  dividend: string;
  divisor: string;
  seq: number;
  steps: DivStep[];
  /** What is written in each work row, by place index (the place each digit is named by). */
  written: Record<string, Record<number, WrittenDigit>>;
}

type RowKind = "quotient" | "bring" | "product" | "difference" | "remainder";

/**
 * A row the model writes in. Rows are named for their step: "quotient", "product1", "difference1", "bring2" (the digit
 * step 2 brings down), "product2"... and "remainder" when there is one.
 */
interface WorkRow {
  id: string;
  kind: RowKind;
  /** The step it belongs to, from 1; 0 for the quotient. */
  step: number;
  value: string;
  /** What the row is, for labels and reasons: "step 2 product". */
  name: string;
  ink: Ink;
  /** Its digits, left to right: the place index each is named by, and the cell it is written in. */
  cells: { place: number; rect: Rect }[];
}

/** The steps of the standard method. It starts with the fewest leading digits that hold the divisor. */
function plan(dividend: string, divisor: string): DivStep[] {
  const d = Number(divisor);
  const first = [...dividend].findIndex((_, i) => Number(dividend.slice(0, i + 1)) >= d);
  const start = first < 0 ? dividend.length - 1 : first;
  const steps: DivStep[] = [];
  for (let at = start; at < dividend.length; at++) {
    const partial = at === start ? Number(dividend.slice(0, start + 1)) : steps.at(-1)!.difference * 10 + Number(dividend[at]);
    const quotientDigit = Math.floor(partial / d);
    steps.push({ at, partial, quotientDigit, product: quotientDigit * d, difference: partial - quotientDigit * d });
  }
  return steps;
}

/** The grid column of a dividend digit: the divisor, then the bracket, then the dividend. */
const colX = (state: DivisionState, at: number) => state.divisor.length + 1 + at;
/** The place index of a dividend digit: 0 for the ones. */
const placeOf = (state: DivisionState, at: number) => state.dividend.length - 1 - at;
const height = (state: DivisionState) => 2 + 2 * state.steps.length;
const remainder = (state: DivisionState) => state.steps.at(-1)!.difference;
const quotient = (state: DivisionState) => state.steps.map((s) => s.quotientDigit).join("");
/** A step as a true equality: "15 ÷ 6 = 2 R 3", never "15 ÷ 6 = 2". */
const equality = (partial: number | string, divisor: string, q: number | string, r: number) => `${partial} ÷ ${divisor} = ${q}${r > 0 ? ` R ${r}` : ""}`;
/** Where the R of the remainder goes, a little right of the quotient, and where the remainder's digits start. */
const letterRX = (state: DivisionState) => colX(state, state.dividend.length) + 0.6;
const remainderDigitsX = (state: DivisionState) => letterRX(state) + 1.2;
/** The object's width in cells: the divisor, the bracket and the dividend, then the remainder when there is one. */
const width = (state: DivisionState) =>
  Math.ceil(remainder(state) > 0 ? remainderDigitsX(state) + String(remainder(state)).length : colX(state, state.dividend.length));

/** The cells of a number written in a row with its last digit under dividend digit `at`. */
function cellsEndingAt(state: DivisionState, at: number, length: number, y: number): WorkRow["cells"] {
  return Array.from({ length }, (_, i) => {
    const under = at - length + 1 + i;
    return { place: placeOf(state, under), rect: { x: colX(state, under), y, w: 1, h: 1 } };
  });
}

function rows(state: DivisionState): WorkRow[] {
  const { steps } = state;
  const out: WorkRow[] = [
    {
      id: "quotient",
      kind: "quotient",
      step: 0,
      value: quotient(state),
      name: "quotient",
      ink: "green",
      cells: steps.map((s) => ({ place: placeOf(state, s.at), rect: { x: colX(state, s.at), y: 0, w: 1, h: 1 } })),
    },
  ];
  steps.forEach((s, k) => {
    const n = k + 1;
    const product = String(s.product);
    const difference = String(s.difference);
    if (k > 0) out.push({ id: `bring${n}`, kind: "bring", step: n, value: state.dividend[s.at], name: `step ${n} bring-down`, ink: "blue", cells: cellsEndingAt(state, s.at, 1, 1 + 2 * k) });
    out.push({ id: `product${n}`, kind: "product", step: n, value: product, name: `step ${n} product`, ink: "blue", cells: cellsEndingAt(state, s.at, product.length, 2 + 2 * k) });
    out.push({ id: `difference${n}`, kind: "difference", step: n, value: difference, name: `step ${n} difference`, ink: "blue", cells: cellsEndingAt(state, s.at, difference.length, 3 + 2 * k) });
  });
  const r = String(remainder(state));
  if (remainder(state) > 0)
    out.push({
      id: "remainder",
      kind: "remainder",
      step: steps.length,
      value: r,
      name: "remainder",
      ink: "green",
      cells: [...r].map((_, i) => ({ place: r.length - 1 - i, rect: { x: remainderDigitsX(state) + i, y: 0, w: 1, h: 1 } })),
    });
  return out;
}

const rowValue = (state: DivisionState, row: WorkRow) => (row.cells.every((c) => state.written[row.id][c.place]) ? row.value : null);

/** Why a digit of a row cannot be written yet: each step divides, multiplies, subtracts, then brings the next digit down. */
function notYet(state: DivisionState, all: WorkRow[], row: WorkRow, place: number): RefusalBody | null {
  const finished = (id: string) => rowValue(state, all.find((w) => w.id === id)!) !== null;
  const step = state.steps[row.step - 1];
  switch (row.kind) {
    case "quotient": {
      const n = state.steps.findIndex((t) => placeOf(state, t.at) === place) + 1;
      if (n > 1 && !finished(`bring${n}`)) return refuse("not_allowed", `Step ${n} starts by bringing down the ${PLACE_NAMES[place]} digit: put it on bring${n} first.`);
      return null;
    }
    case "product":
      if (state.written.quotient[placeOf(state, step.at)]) return null;
      return refuse("not_allowed", `Step ${row.step} multiplies by its quotient digit: write the quotient digit over the ${PLACE_NAMES[placeOf(state, step.at)]} first.`);
    case "difference":
      return finished(`product${row.step}`) ? null : refuse("not_allowed", `Step ${row.step} subtracts its product: finish product${row.step} first.`);
    case "bring":
      return finished(`difference${row.step - 1}`) ? null : refuse("not_allowed", `Bring down after subtracting: finish difference${row.step - 1} first.`);
    case "remainder":
      return finished(`difference${row.step}`) ? null : refuse("not_allowed", `The remainder is what the last subtraction leaves: finish difference${row.step} first.`);
  }
}

/** Why a value is wrong, starting with the true equality behind it. `place` is null for a whole row. */
function wrongValue(state: DivisionState, row: WorkRow, value: string, place: number | null): RefusalBody {
  const step = state.steps[row.step - 1];
  const right = place === null ? row.value : row.value[row.cells.findIndex((c) => c.place === place)];
  const where = place === null ? row.name : `${PLACE_NAMES[place]} digit of the ${row.name}`;
  const whole = equality(state.dividend, state.divisor, quotient(state), remainder(state));
  let why: string;
  switch (row.kind) {
    case "quotient": {
      const s = place === null ? null : state.steps.find((t) => placeOf(state, t.at) === place)!;
      why = s ? equality(s.partial, state.divisor, s.quotientDigit, s.difference) : whole;
      break;
    }
    case "product":
      why = `${step.quotientDigit} × ${state.divisor} = ${step.product}`;
      break;
    case "difference":
      why = `${step.partial} − ${step.product} = ${step.difference}`;
      break;
    case "bring":
      return refuse("wrong_value", `The ${PLACE_NAMES[placeOf(state, step.at)]} digit of ${state.dividend} is ${row.value}: bring down ${row.value}, not ${value}.`);
    case "remainder":
      why = whole;
  }
  return refuse("wrong_value", `${why}: the ${where} is ${right}, not ${value}.`);
}

function create(cmd: DivisionCommand, ctx: Ctx): { state: DivisionState; size: { w: number; h: number } } | RefusalBody {
  const { dividend, divisor } = cmd;
  if (Number(divisor) === 0) return refuse("not_allowed", "Nothing can be divided by 0: the divisor must be 1 or more.");
  const state: DivisionState = { dividend, divisor, seq: ctx.seq, steps: plan(dividend, divisor), written: {} };
  const missing = missingGlyphs(ctx.glyphs, dividend + divisor + "−" + (remainder(state) > 0 ? "R" : ""));
  if (missing.length > 0) return refuse("unsupported", `The board pen cannot write ${missing.join(" ")} yet.`);
  state.written = Object.fromEntries(rows(state).map((row) => [row.id, {}]));
  return { state, size: { w: width(state), h: height(state) } };
}

function targets(state: DivisionState, objectId: string): LocalTarget[] {
  const { dividend, divisor, steps } = state;
  const out: LocalTarget[] = [];
  const h = height(state);
  out.push({ target: { objectId, part: "whole" }, label: `${objectId} ${dividend} ÷ ${divisor}`, writable: false, value: null, rect: { x: 0, y: 0, w: width(state), h } });
  for (let at = 0; at < dividend.length; at++) {
    const column = PLACE_NAMES[placeOf(state, at)];
    out.push({ target: { objectId, part: "column", column }, label: `${objectId} ${column} column`, writable: false, value: null, rect: { x: colX(state, at), y: 0, w: 1, h } });
  }
  const given = [
    { rowId: "divisor", value: divisor, x: 0 },
    { rowId: "dividend", value: dividend, x: colX(state, 0) },
  ];
  for (const { rowId, value, x } of given) {
    out.push({ target: { objectId, part: "row", rowId }, label: `${objectId} ${rowId}`, writable: false, value, rect: { x, y: 1, w: value.length, h: 1 } });
    [...value].forEach((d, i) => {
      const column = PLACE_NAMES[value.length - 1 - i];
      out.push({ target: { objectId, part: "cell", rowId, column }, label: `${objectId} ${rowId} ${column}`, writable: false, value: d, rect: { x: x + i, y: 1, w: 1, h: 1 } });
    });
  }
  // Writable means the next step can write there now.
  const all = rows(state);
  for (const row of all) {
    const written = state.written[row.id];
    const ready = (place: number) => notYet(state, all, row, place) === null;
    const first = row.cells[0].rect;
    out.push({
      target: { objectId, part: "row", rowId: row.id },
      label: `${objectId} ${row.name}`,
      writable: Object.keys(written).length === 0 && row.cells.every((c) => ready(c.place)),
      value: rowValue(state, row),
      rect: { ...first, w: row.cells.at(-1)!.rect.x + 1 - first.x },
    });
    for (const c of row.cells)
      out.push({
        target: { objectId, part: "cell", rowId: row.id, column: PLACE_NAMES[c.place] },
        label: `${objectId} ${row.name} ${PLACE_NAMES[c.place]}`,
        writable: !written[c.place] && ready(c.place),
        value: written[c.place] ? String(written[c.place].digit) : null,
        rect: c.rect,
      });
  }
  // An anchor for each step: its partial dividend (the dividend's first digits, or the last difference with the digit
  // brought down), then its product with the minus sign, and its difference.
  steps.forEach((s, k) => {
    const partialAt = k === 0 ? 0 : steps[k - 1].at - String(steps[k - 1].difference).length + 1;
    const x = colX(state, Math.min(partialAt, s.at - String(s.product).length));
    out.push({
      target: { objectId, part: "row", rowId: `step${k + 1}` },
      label: `${objectId} step ${k + 1}: ${equality(s.partial, divisor, s.quotientDigit, s.difference)}`,
      writable: false,
      value: null,
      rect: { x, y: 1 + 2 * k, w: colX(state, s.at) + 1 - x, h: 3 },
    });
  });
  return out;
}

function put(state: DivisionState, target: Target, value: string | undefined, ink: Ink | undefined, ctx: Ctx): DivisionState | RefusalBody {
  if (target.part !== "row" && target.part !== "cell") return refuse("not_writable", "Put writes in a cell or a row of the quotient, a product, a difference, a bring-down or the remainder.");
  const all = rows(state);
  const row = all.find((w) => w.id === target.rowId);
  if (!row) {
    if (target.rowId === "dividend" || target.rowId === "divisor") return refuse("not_writable", `The ${target.rowId} is already written.`);
    return refuse("unknown_target", `There is no row "${target.rowId}" to write in.`);
  }
  const written = { ...state.written[row.id] };
  const pen = ink ?? row.ink;
  if (target.part === "row") {
    if (Object.keys(written).length > 0) return refuse("already_written", `Part of the ${row.name} is written; put the rest by cell.`);
    for (const c of row.cells) {
      const why = notYet(state, all, row, c.place);
      if (why) return why;
    }
    if (value !== undefined) {
      if (row.kind === "remainder" && /^R\s*\d+$/.test(value)) return refuse("invalid_command", `Put the remainder as a number, such as ${row.value}: the board writes the R.`);
      if (value !== row.value) return wrongValue(state, row, value, null);
    }
    row.cells.forEach((c, i) => (written[c.place] = { digit: Number(row.value[i]), seq: ctx.seq, ink: pen }));
  } else {
    const place = PLACE_NAMES.indexOf(target.column);
    const i = row.cells.findIndex((c) => c.place === place);
    if (i < 0) return refuse("not_writable", `The ${row.name} has no ${target.column} digit.`);
    if (value !== undefined && !/^\d$/.test(value)) return refuse("invalid_command", "A cell takes one digit.");
    if (written[place]) return refuse("already_written", `The ${target.column} digit of the ${row.name} is already written.`);
    const why = notYet(state, all, row, place);
    if (why) return why;
    if (value !== undefined && value !== row.value[i]) return wrongValue(state, row, value, place);
    written[place] = { digit: Number(row.value[i]), seq: ctx.seq, ink: pen };
  }
  return { ...state, written: { ...state.written, [row.id]: written } };
}

/**
 * What later steps will write: every digit, minus sign, rule, bring-down arrow and the remainder not drawn yet. The steps
 * are known from the numbers, so these are the finished problem's strokes that are not on the board.
 */
function reserved(state: DivisionState, objectId: string, ctx: Ctx): Reserved {
  const now = new Set(draw(state, objectId, ctx).map((s) => s.key));
  const finished = Object.fromEntries(
    rows(state).map((row) => [
      row.id,
      { ...Object.fromEntries(row.cells.map((c, i) => [c.place, { digit: Number(row.value[i]), seq: state.seq, ink: row.ink }])), ...state.written[row.id] },
    ]),
  );
  return { strokes: draw({ ...state, written: finished }, objectId, ctx).filter((s) => !now.has(s.key)), boxes: [] };
}

/** A check means "this is right": only on finished work (a written digit, a finished row or step, the finished problem). */
function refuseMark(state: DivisionState, target: Target, style: MarkStyle): RefusalBody | null {
  if (style !== "check") return null;
  const all = rows(state);
  const finished = (row: WorkRow) => rowValue(state, row) !== null;
  const step = target.part === "row" ? /^step(\d+)$/.exec(target.rowId) : null;
  const row = target.part === "row" || target.part === "cell" ? all.find((w) => w.id === target.rowId) : undefined;
  let done: boolean;
  let what: string;
  if (target.part === "whole") {
    done = all.every(finished);
    what = "The division";
  } else if (step) {
    const n = Number(step[1]);
    done = !!state.written.quotient[placeOf(state, state.steps[n - 1].at)] && all.filter((w) => w.step === n && w.kind !== "remainder").every(finished);
    what = `Step ${n}`;
  } else if (row) {
    done = target.part === "cell" ? !!state.written[row.id][PLACE_NAMES.indexOf(target.column)] : finished(row);
    what = `The ${row.name}`;
  } else return refuse("not_allowed", "A check marks finished work: put it on the quotient, a step, a work row or the whole problem.");
  return done ? null : refuse("not_allowed", `${what} is not finished: check it after it is written.`);
}

function draw(state: DivisionState, objectId: string, ctx: Ctx): LocalStroke[] {
  const out: LocalStroke[] = [];
  const math = { objectId, layer: "math" as const, width: DIGIT_WIDTH, seq: state.seq, ink: "blue" as Ink };
  const { dividend, divisor } = state;
  [...divisor].forEach((d, i) => {
    const column = PLACE_NAMES[divisor.length - 1 - i];
    out.push(...glyphStrokes(ctx.glyphs, d, { x: i, y: 1, w: 1, h: 1 }, { ...math, target: { objectId, part: "cell", rowId: "divisor", column } }, `divisor/${i}`));
  });
  // The bracket: one pen stroke up the curve and along the top of the dividend.
  const bx = divisor.length;
  out.push({
    ...math,
    key: "bracket",
    kind: "rule",
    ink: "black",
    width: 0.06,
    target: null,
    pts: [[bx + 0.3, 2], [bx + 0.48, 1.75], [bx + 0.55, 1.5], [bx + 0.48, 1.25], [bx + 0.35, 1], [colX(state, dividend.length) - 0.05, 1]],
  });
  [...dividend].forEach((d, at) => {
    const target: Target = { objectId, part: "cell", rowId: "dividend", column: PLACE_NAMES[placeOf(state, at)] };
    out.push(...glyphStrokes(ctx.glyphs, d, { x: colX(state, at), y: 1, w: 1, h: 1 }, { ...math, target }, `dividend/${at}`));
  });

  for (const row of rows(state)) {
    const digits = row.cells.flatMap((c) => (state.written[row.id][c.place] ? [{ ...c, ...state.written[row.id][c.place] }] : []));
    if (digits.length === 0) continue;
    const pen = { ...math, ink: digits[0].ink, seq: Math.min(...digits.map((d) => d.seq)), target: { objectId, part: "row" as const, rowId: row.id } };
    const first = row.cells[0].rect;
    const last = row.cells.at(-1)!.rect;
    // A product brings its minus sign, and a finished product the rule under it.
    if (row.kind === "product") out.push(...glyphStrokes(ctx.glyphs, "−", { ...first, x: first.x - 1 }, { ...pen, target: null }, `${row.id}/minus`));
    // A bring-down brings its arrow from the dividend digit, down the empty column beside the work.
    if (row.kind === "bring") {
      const x = first.x + 0.5;
      const from: Point = [x, 2.02];
      const to: Point = [x, first.y + 0.05];
      curvedArrow(from, [x, (from[1] + to[1]) / 2], to).forEach((pts, i) => out.push({ ...pen, key: `${row.id}/arrow/${i}`, kind: "arrow", layer: "annotation", width: SMALL_WIDTH, pts }));
    }
    if (row.kind === "remainder") out.push(...glyphStrokes(ctx.glyphs, "R", { x: letterRX(state), y: 0, w: 1, h: 1 }, pen, "remainder/R"));
    for (const d of digits) {
      const target: Target = { objectId, part: "cell", rowId: row.id, column: PLACE_NAMES[d.place] };
      out.push(...glyphStrokes(ctx.glyphs, String(d.digit), d.rect, { ...math, ink: d.ink, seq: d.seq, target }, `w/${row.id}/${d.place}`));
    }
    if (row.kind === "product" && rowValue(state, row) !== null)
      out.push({
        ...pen,
        seq: Math.max(...digits.map((d) => d.seq)),
        key: `${row.id}/rule`,
        kind: "rule",
        ink: "black",
        width: 0.06,
        target: null,
        pts: [[first.x - 0.9, first.y + 1], [last.x + 0.9, first.y + 1]],
      });
  }
  return out;
}

export const division: Representation<DivisionState, DivisionCommand> = {
  op: "division",
  create,
  targets,
  put,
  reserved,
  refuseMark,
  draw,
};
