// Long division on the board: the divisor, the bracket and the dividend, with the quotient row above and two rows per
// step below (the product, then the difference with the next digit brought down beside it). Every row is reserved when
// the problem is created, so the work never moves. The code works out each step from the numbers; the model only says
// which step to show, and a wrong value or a step out of order is refused.
import type { Point } from "@/lib/board/glyphs";
import { curvedArrow } from "@/lib/board/geometry";
import {
  glyphStrokes,
  missingGlyphs,
  refuse,
  type Ctx,
  type LocalStroke,
  type LocalTarget,
  type RefusalBody,
  type Representation,
  type Reserved,
} from "@/lib/board/representation";
import { PLACE_NAMES, type DivisionCommand, type Ink, type MarkStyle, type Rect, type Target } from "@/lib/board/types";

/** One step of the method: divide the partial dividend, multiply, subtract, then bring the next digit down. */
interface DivStep {
  /** The dividend digit (index from the left) the step's quotient digit sits over. */
  at: number;
  partial: number;
  q: number;
  product: number;
  diff: number;
}

interface Written {
  digit: number;
  seq: number;
  ink: Ink;
}

export interface DivisionState {
  dividend: string;
  divisor: string;
  seq: number;
  steps: DivStep[];
  /** What is written in each row: by the dividend digit it sits under (`at`), or by digit for the remainder. */
  written: Record<string, Record<number, Written>>;
}

/**
 * A row the model writes in. Rows are named for their step: "quotient", "product1", "difference1", "bring2" (the digit
 * step 2 brings down), "product2"... and "remainder" when there is one.
 */
interface WorkRow {
  id: string;
  /** The step it belongs to, from 1; 0 for the quotient. */
  step: number;
  value: string;
  y: number;
  /** The dividend digit each of its digits sits under, left to right; null for the remainder, beside the quotient. */
  cols: number[] | null;
  ink: Ink;
  /** What the row is, for labels and reasons: "step 2 product". */
  name: string;
}

const DIGIT_WIDTH = 0.07;
const SMALL_WIDTH = 0.05;

/** The steps of the standard method. It starts with the fewest leading digits that hold the divisor. */
function plan(dividend: string, divisor: string): DivStep[] {
  const d = Number(divisor);
  const first = [...dividend].findIndex((_, i) => Number(dividend.slice(0, i + 1)) >= d);
  const start = first < 0 ? dividend.length - 1 : first;
  const steps: DivStep[] = [];
  for (let at = start; at < dividend.length; at++) {
    const partial = at === start ? Number(dividend.slice(0, start + 1)) : steps.at(-1)!.diff * 10 + Number(dividend[at]);
    const q = Math.floor(partial / d);
    steps.push({ at, partial, q, product: q * d, diff: partial - q * d });
  }
  return steps;
}

/** The grid column of a dividend digit: the divisor, then the bracket, then the dividend. */
const colX = (state: DivisionState, at: number) => state.divisor.length + 1 + at;
const placeOf = (state: DivisionState, at: number) => PLACE_NAMES[state.dividend.length - 1 - at];
const height = (state: DivisionState) => 2 + 2 * state.steps.length;
const remainder = (state: DivisionState) => state.steps.at(-1)!.diff;
const quotient = (state: DivisionState) => state.steps.map((s) => s.q).join("");
/** The dividend digits a number sits under when its last digit is under `at`. */
const span = (at: number, length: number) => Array.from({ length }, (_, i) => at - length + 1 + i);
/** A step as a true equality: "15 ÷ 6 = 2 R 3", never "15 ÷ 6 = 2". */
const equality = (partial: number | string, divisor: string, q: number | string, r: number) => `${partial} ÷ ${divisor} = ${q}${r > 0 ? ` R ${r}` : ""}`;
/** Where the R of the remainder goes, a little right of the quotient, and where its digits start. */
const rX = (state: DivisionState) => colX(state, state.dividend.length) + 0.6;
const remainderX = (state: DivisionState) => rX(state) + 1.2;
/** The object's width in cells: the divisor, the bracket and the dividend, then the remainder when there is one. */
const width = (state: DivisionState) => Math.ceil(remainder(state) > 0 ? remainderX(state) + String(remainder(state)).length : colX(state, state.dividend.length));

function rows(state: DivisionState): WorkRow[] {
  const { steps } = state;
  const out: WorkRow[] = [{ id: "quotient", step: 0, value: quotient(state), y: 0, cols: steps.map((s) => s.at), ink: "green", name: "quotient" }];
  steps.forEach((s, k) => {
    const n = k + 1;
    if (k > 0) out.push({ id: `bring${n}`, step: n, value: state.dividend[s.at], y: 1 + 2 * k, cols: [s.at], ink: "blue", name: `step ${n} bring-down` });
    const product = String(s.product);
    out.push({ id: `product${n}`, step: n, value: product, y: 2 + 2 * k, cols: span(s.at, product.length), ink: "blue", name: `step ${n} product` });
    const diff = String(s.diff);
    out.push({ id: `difference${n}`, step: n, value: diff, y: 3 + 2 * k, cols: span(s.at, diff.length), ink: "blue", name: `step ${n} difference` });
  });
  if (remainder(state) > 0) out.push({ id: "remainder", step: steps.length, value: String(remainder(state)), y: 0, cols: null, ink: "green", name: "remainder" });
  return out;
}

/** The written digit keys of a row: dividend digits for the grid rows, digit indices for the remainder. */
const keys = (r: WorkRow) => r.cols ?? [...r.value].map((_, i) => i);
const rowValue = (state: DivisionState, r: WorkRow) => (keys(r).every((k) => state.written[r.id][k]) ? r.value : null);
/** The rectangle of one digit of a row. */
function digitBox(state: DivisionState, r: WorkRow, key: number): Rect {
  return r.cols ? { x: colX(state, key), y: r.y, w: 1, h: 1 } : { x: remainderX(state) + key, y: r.y, w: 1, h: 1 };
}
function rowRect(state: DivisionState, r: WorkRow): Rect {
  const ks = keys(r);
  const first = digitBox(state, r, ks[0]);
  return { ...first, w: digitBox(state, r, ks.at(-1)!).x + 1 - first.x };
}

function create(cmd: DivisionCommand, ctx: Ctx): { state: DivisionState; size: { w: number; h: number } } | RefusalBody {
  const { dividend, divisor } = cmd;
  if (Number(divisor) === 0) return refuse("not_allowed", "Nothing can be divided by 0: the divisor must be 1 or more.");
  const steps = plan(dividend, divisor);
  const r = steps.at(-1)!.diff;
  const missing = missingGlyphs(ctx.glyphs, dividend + divisor + "−" + (r > 0 ? "R" : ""));
  if (missing.length > 0) return refuse("unsupported", `The board pen cannot write ${missing.join(" ")} yet.`);
  const state: DivisionState = { dividend, divisor, seq: ctx.seq, steps, written: {} };
  state.written = Object.fromEntries(rows(state).map((row) => [row.id, {}]));
  return { state, size: { w: width(state), h: height(state) } };
}

function targets(state: DivisionState, objectId: string): LocalTarget[] {
  const { dividend, divisor, steps } = state;
  const out: LocalTarget[] = [];
  const box = (at: number, y: number): Rect => ({ x: colX(state, at), y, w: 1, h: 1 });
  out.push({ target: { objectId, part: "whole" }, label: `${objectId} ${dividend} ÷ ${divisor}`, writable: false, value: null, rect: { x: 0, y: 0, w: width(state), h: height(state) } });
  for (let at = 0; at < dividend.length; at++)
    out.push({ target: { objectId, part: "column", column: placeOf(state, at) }, label: `${objectId} ${placeOf(state, at)} column`, writable: false, value: null, rect: { x: colX(state, at), y: 0, w: 1, h: height(state) } });
  out.push({ target: { objectId, part: "row", rowId: "divisor" }, label: `${objectId} divisor`, writable: false, value: divisor, rect: { x: 0, y: 1, w: divisor.length, h: 1 } });
  [...divisor].forEach((d, i) =>
    out.push({ target: { objectId, part: "cell", rowId: "divisor", column: PLACE_NAMES[divisor.length - 1 - i] }, label: `${objectId} divisor ${PLACE_NAMES[divisor.length - 1 - i]}`, writable: false, value: d, rect: { x: i, y: 1, w: 1, h: 1 } }),
  );
  out.push({ target: { objectId, part: "row", rowId: "dividend" }, label: `${objectId} dividend`, writable: false, value: dividend, rect: { x: colX(state, 0), y: 1, w: dividend.length, h: 1 } });
  [...dividend].forEach((d, at) =>
    out.push({ target: { objectId, part: "cell", rowId: "dividend", column: placeOf(state, at) }, label: `${objectId} dividend ${placeOf(state, at)}`, writable: false, value: d, rect: box(at, 1) }),
  );
  for (const r of rows(state)) {
    const w = state.written[r.id];
    out.push({ target: { objectId, part: "row", rowId: r.id }, label: `${objectId} ${r.name}`, writable: Object.keys(w).length === 0, value: rowValue(state, r), rect: rowRect(state, r) });
    if (r.cols)
      for (const at of r.cols)
        out.push({
          target: { objectId, part: "cell", rowId: r.id, column: placeOf(state, at) },
          label: `${objectId} ${r.name} ${placeOf(state, at)}`,
          writable: !w[at],
          value: w[at] ? String(w[at].digit) : null,
          rect: box(at, r.y),
        });
  }
  // An anchor for each step: its partial dividend (the dividend's first digits, or the last difference with the digit
  // brought down), then its product with the minus sign, and its difference.
  steps.forEach((s, k) => {
    const partialAt = k === 0 ? 0 : steps[k - 1].at - String(steps[k - 1].diff).length + 1;
    const x = colX(state, Math.min(partialAt, s.at - String(s.product).length));
    out.push({
      target: { objectId, part: "row", rowId: `step${k + 1}` },
      label: `${objectId} step ${k + 1}: ${equality(s.partial, divisor, s.q, s.diff)}`,
      writable: false,
      value: null,
      rect: { x, y: 1 + 2 * k, w: colX(state, s.at) + 1 - x, h: 3 },
    });
  });
  return out;
}

/** Why a digit of a row cannot be written yet: each step divides, multiplies, subtracts, then brings the next digit down. */
function notYet(state: DivisionState, r: WorkRow, key: number): RefusalBody | null {
  const all = rows(state);
  const done = (id: string) => rowValue(state, all.find((w) => w.id === id)!) !== null;
  const s = state.steps[r.step - 1];
  if (r.id === "quotient") {
    const n = state.steps.findIndex((t) => t.at === key) + 1;
    if (n > 1 && !done(`bring${n}`)) return refuse("not_allowed", `Step ${n} starts by bringing down the ${placeOf(state, key)} digit: put it on bring${n} first.`);
  } else if (r.id.startsWith("product")) {
    if (!state.written.quotient[s.at]) return refuse("not_allowed", `Step ${r.step} multiplies by its quotient digit: write the quotient digit over the ${placeOf(state, s.at)} first.`);
  } else if (r.id.startsWith("difference")) {
    if (!done(`product${r.step}`)) return refuse("not_allowed", `Step ${r.step} subtracts its product: finish product${r.step} first.`);
  } else if (r.id.startsWith("bring")) {
    if (!done(`difference${r.step - 1}`)) return refuse("not_allowed", `Bring down after subtracting: finish difference${r.step - 1} first.`);
  } else if (!done(`difference${r.step}`)) return refuse("not_allowed", `The remainder is what the last subtraction leaves: finish difference${r.step} first.`);
  return null;
}

/** Why a value is wrong, starting with the true equality behind it. */
function wrongValue(state: DivisionState, r: WorkRow, value: string, at: number | null): RefusalBody {
  const s = state.steps[r.step - 1];
  const right = at === null ? r.value : r.value[r.cols!.indexOf(at)];
  const where = at === null ? r.name : `${placeOf(state, at)} digit of the ${r.name}`;
  const whole = equality(state.dividend, state.divisor, quotient(state), remainder(state));
  let why: string;
  if (r.id === "quotient") {
    const t = at === null ? null : state.steps.find((u) => u.at === at)!;
    why = t ? equality(t.partial, state.divisor, t.q, t.diff) : whole;
  } else if (r.id.startsWith("product")) why = `${s.q} × ${state.divisor} = ${s.product}`;
  else if (r.id.startsWith("difference")) why = `${s.partial} − ${s.product} = ${s.diff}`;
  else if (r.id.startsWith("bring")) return refuse("wrong_value", `The ${placeOf(state, s.at)} digit of ${state.dividend} is ${r.value}: bring down ${r.value}, not ${value}.`);
  else why = whole;
  return refuse("wrong_value", `${why}: the ${where} is ${right}, not ${value}.`);
}

function put(state: DivisionState, target: Target, value: string, ink: Ink | undefined, ctx: Ctx): DivisionState | RefusalBody {
  if (target.part !== "row" && target.part !== "cell") return refuse("not_writable", "Put writes in a cell or a row of the quotient, a product, a difference, a bring-down or the remainder.");
  const r = rows(state).find((w) => w.id === target.rowId);
  if (!r) {
    if (target.rowId === "dividend" || target.rowId === "divisor") return refuse("not_writable", `The ${target.rowId} is already written.`);
    return refuse("unknown_target", `There is no row "${target.rowId}" to write in.`);
  }
  const written = { ...state.written[r.id] };
  const pen = ink ?? r.ink;
  if (target.part === "row") {
    if (Object.keys(written).length > 0) return refuse("already_written", `Part of the ${r.name} is written; put the rest by cell.`);
    for (const k of keys(r)) {
      const why = notYet(state, r, k);
      if (why) return why;
    }
    if (r.id === "remainder" && /^R\s*\d+$/.test(value)) return refuse("invalid_command", `Put the remainder as a number, such as ${r.value}: the board writes the R.`);
    if (value !== r.value) return wrongValue(state, r, value, null);
    keys(r).forEach((k, i) => (written[k] = { digit: Number(r.value[i]), seq: ctx.seq, ink: pen }));
  } else {
    if (!r.cols) return refuse("not_writable", "Put the whole remainder on the remainder row.");
    const at = state.dividend.length - 1 - PLACE_NAMES.indexOf(target.column);
    const i = r.cols.indexOf(at);
    if (i < 0) return refuse("not_writable", `The ${r.name} has no ${target.column} digit.`);
    if (!/^\d$/.test(value)) return refuse("invalid_command", "A cell takes one digit.");
    if (written[at]) return refuse("already_written", `The ${target.column} digit of the ${r.name} is already written.`);
    const why = notYet(state, r, at);
    if (why) return why;
    if (value !== r.value[i]) return wrongValue(state, r, value, at);
    written[at] = { digit: Number(value), seq: ctx.seq, ink: pen };
  }
  return { ...state, written: { ...state.written, [r.id]: written } };
}

/**
 * What later steps will write: every digit, minus sign, rule, bring-down arrow and the remainder not drawn yet. The steps
 * are known from the numbers, so these are the finished problem's strokes that are not on the board.
 */
function reserved(state: DivisionState, objectId: string, ctx: Ctx): Reserved {
  const now = new Set(draw(state, objectId, ctx).map((s) => s.key));
  const written = Object.fromEntries(
    rows(state).map((r) => [r.id, { ...Object.fromEntries(keys(r).map((k, i) => [k, { digit: Number(r.value[i]), seq: state.seq, ink: r.ink }])), ...state.written[r.id] }]),
  );
  return { strokes: draw({ ...state, written }, objectId, ctx).filter((s) => !now.has(s.key)), boxes: [] };
}

/** A check means "this is right": only on finished work (a written digit, a finished row or step, the finished problem). */
function refuseMark(state: DivisionState, target: Target, style: MarkStyle): RefusalBody | null {
  if (style !== "check") return null;
  const all = rows(state);
  const done = (r: WorkRow) => rowValue(state, r) !== null;
  let finished: boolean;
  let what: string;
  const step = target.part === "row" ? /^step(\d+)$/.exec(target.rowId) : null;
  const r = target.part === "row" || target.part === "cell" ? all.find((w) => w.id === target.rowId) : undefined;
  if (target.part === "whole") {
    finished = all.every(done);
    what = "The division";
  } else if (step) {
    const n = Number(step[1]);
    finished = !!state.written.quotient[state.steps[n - 1].at] && all.filter((w) => w.step === n && w.id !== "quotient" && w.id !== "remainder").every(done);
    what = `Step ${n}`;
  } else if (r) {
    finished = target.part === "cell" ? !!state.written[r.id][state.dividend.length - 1 - PLACE_NAMES.indexOf(target.column)] : done(r);
    what = `The ${r.name}`;
  } else return refuse("not_allowed", "A check marks finished work: put it on the quotient, a step, a work row or the whole problem.");
  return finished ? null : refuse("not_allowed", `${what} is not finished: check it after it is written.`);
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
  [...dividend].forEach((d, at) =>
    out.push(...glyphStrokes(ctx.glyphs, d, { x: colX(state, at), y: 1, w: 1, h: 1 }, { ...math, target: { objectId, part: "cell", rowId: "dividend", column: placeOf(state, at) } }, `dividend/${at}`)),
  );

  for (const r of rows(state)) {
    const done = Object.entries(state.written[r.id])
      .map(([k, w]) => ({ k: Number(k), ...w }))
      .sort((a, b) => a.k - b.k);
    if (done.length === 0) continue;
    const firstSeq = Math.min(...done.map((w) => w.seq));
    const pen = { ...math, ink: done[0].ink, seq: firstSeq, target: { objectId, part: "row" as const, rowId: r.id } };
    // A product brings its minus sign, and a finished product the rule under it.
    if (r.id.startsWith("product")) out.push(...glyphStrokes(ctx.glyphs, "−", digitBox(state, r, r.cols![0] - 1), { ...pen, target: null }, `${r.id}/minus`));
    // A bring-down brings its arrow from the dividend digit, down the empty column beside the work.
    if (r.id.startsWith("bring")) {
      const x = colX(state, r.cols![0]) + 0.5;
      const from: Point = [x, 2.02];
      const to: Point = [x, r.y + 0.05];
      curvedArrow(from, [x, (from[1] + to[1]) / 2], to).forEach((pts, i) => out.push({ ...pen, key: `${r.id}/arrow/${i}`, kind: "arrow", layer: "annotation", width: SMALL_WIDTH, pts }));
    }
    if (r.id === "remainder") out.push(...glyphStrokes(ctx.glyphs, "R", { x: rX(state), y: 0, w: 1, h: 1 }, pen, "remainder/R"));
    for (const w of done) {
      const target: Target = r.cols ? { objectId, part: "cell", rowId: r.id, column: placeOf(state, w.k) } : { objectId, part: "row", rowId: r.id };
      out.push(...glyphStrokes(ctx.glyphs, String(w.digit), digitBox(state, r, w.k), { ...math, ink: w.ink, seq: w.seq, target }, `w/${r.id}/${w.k}`));
    }
    if (r.id.startsWith("product") && rowValue(state, r) !== null) {
      const last = Math.max(...done.map((w) => w.seq));
      const left = colX(state, r.cols![0] - 1) + 0.1;
      out.push({ ...pen, seq: last, key: `${r.id}/rule`, kind: "rule", ink: "black", width: 0.06, target: null, pts: [[left, r.y + 1], [colX(state, r.cols!.at(-1)!) + 0.9, r.y + 1]] });
    }
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
