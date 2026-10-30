// Column arithmetic on the board: addition, subtraction and multiplication laid out on a digit grid, with the carry and
// borrow lanes reserved above the top number before anything is drawn. The code computes every answer digit, carry and
// borrow from the operands; the model only says which step to show, and a wrong value or an unneeded step is refused.
import type { Point } from "@/lib/board/glyphs";
import { arrowStrokes } from "@/lib/board/geometry";
import {
  glyphStrokes,
  missingGlyphs,
  refuse,
  type Ctx,
  type LocalStroke,
  type LocalTarget,
  type RefusalBody,
  type Representation,
} from "@/lib/board/representation";
import { PLACE_NAMES, type ColumnsCommand, type Ink, type PlaceName, type Rect, type RegroupCommand, type Target } from "@/lib/board/types";

interface CalcRow {
  /** "answer", or "p0", "p1"... for the work rows of a multiplication by a number with several digits. */
  id: string;
  value: string;
  /** The carry out of each place, computed from the math. */
  carries: number[];
  y: number;
  /** The lane its carries are written in. */
  laneY: number;
}

interface Written {
  digit: number;
  seq: number;
  ink: Ink;
}

interface Regroup {
  id: string;
  kind: "carry" | "borrow";
  rowId: string;
  from: number;
  to: number;
  /** The carry value; 1 for a borrow. */
  value: number;
  seq: number;
  ink: Ink;
}

export interface ColumnsState {
  operation: ColumnsCommand["operation"];
  /** How many places the grid has. */
  places: number;
  seq: number;
  operands: { id: string; value: string; y: number }[];
  calc: CalcRow[];
  /** Subtraction: how many times the standard method moves one unit from each place to the next lower one. */
  borrowPlan: number[];
  laneCount: number;
  rules: number[];
  /** The row with the plus sign before the work rows are added, in a long multiplication. */
  plusY: number | null;
  height: number;
  written: Record<string, Record<number, Written>>;
  regroups: Regroup[];
}

const OPERATOR = { add: "+", subtract: "−", multiply: "×" } as const;
const DIGIT_WIDTH = 0.07;
const SMALL_WIDTH = 0.05;

const digitAt = (value: string, place: number) => (place < value.length ? Number(value[value.length - 1 - place]) : 0);
const placeName = (place: number) => PLACE_NAMES[place];
const placeIndex = (name: PlaceName) => PLACE_NAMES.indexOf(name);

/** Adds rows of digits column by column: the carry out of each place. */
function additionCarries(values: string[], places: number): number[] {
  const carries: number[] = [];
  let carry = 0;
  for (let c = 0; c < places; c++) {
    const sum = values.reduce((s, v) => s + digitAt(v, c), carry);
    carry = Math.floor(sum / 10);
    carries.push(carry);
  }
  return carries;
}

/** Multiplies a number by one digit, shifted by `shift` places: the carry out of each place. */
function productCarries(top: string, digit: number, shift: number, places: number): number[] {
  const carries: number[] = Array(places).fill(0);
  let carry = 0;
  for (let c = shift; c < places; c++) {
    const product = digitAt(top, c - shift) * digit + carry;
    carry = Math.floor(product / 10);
    carries[c] = carry;
  }
  return carries;
}

/** The standard subtraction method: which places lend one unit to the next lower place, and how often. */
function borrowPlan(top: string, bottom: string): number[] {
  const cur = [...top].reverse().map(Number);
  const plan = Array(cur.length).fill(0);
  for (let c = 0; c < cur.length; c++) {
    if (cur[c] >= digitAt(bottom, c)) continue;
    let j = c + 1;
    while (cur[j] === 0) j++;
    for (let t = j; t > c; t--) {
      cur[t] -= 1;
      cur[t - 1] += 10;
      plan[t] += 1;
    }
  }
  return plan;
}

/** The values the top number's places have shown, oldest first, after the given borrows. */
function topHistory(state: ColumnsState, upTo: Regroup[] = state.regroups): number[][] {
  const history = [...state.operands[0].value].reverse().map((d) => [Number(d)]);
  for (const r of upTo) {
    if (r.kind !== "borrow") continue;
    history[r.from].push(history[r.from].at(-1)! - 1);
    history[r.to].push(history[r.to].at(-1)! + 10);
  }
  return history;
}

/** The grid column of a place: the operator sits in column 0, the highest place next to it. */
const colX = (state: ColumnsState, place: number) => 1 + (state.places - 1 - place);
/** The grid row of a borrow lane: lane 0 is right above the top number. */
const borrowLaneRow = (state: ColumnsState, lane: number) => state.laneCount - 1 - lane;
/** The box a small lane value is written in, centred over its place. */
function laneBox(state: ColumnsState, place: number, y: number, text: string): Rect {
  const w = Math.min(0.7, 0.38 * text.length);
  return { x: colX(state, place) + 0.5 - w / 2, y: y + 0.32, w, h: 0.58 };
}
const strikeAcross = (r: Rect): Point[] => [
  [r.x - 0.05, r.y + r.h],
  [r.x + r.w + 0.05, r.y],
];

function create(cmd: ColumnsCommand, ctx: Ctx): { state: ColumnsState; size: { w: number; h: number } } | RefusalBody {
  const { operation, operands } = cmd;
  const values = operands.map((o) => o.value);
  if (operation === "add" && (operands.length < 2 || operands.length > 4)) return refuse("unsupported", "Column addition takes 2 to 4 numbers.");
  if (operation !== "add" && operands.length !== 2) return refuse("unsupported", `Column ${operation === "subtract" ? "subtraction" : "multiplication"} takes exactly 2 numbers.`);
  const ids = new Set<string>();
  for (const o of operands) {
    if (o.id === "answer" || /^p\d+$/.test(o.id)) return refuse("invalid_command", `The row id "${o.id}" is reserved for the answer and work rows.`);
    if (ids.has(o.id)) return refuse("duplicate_id", `Two numbers have the row id "${o.id}".`);
    ids.add(o.id);
  }
  const missing = missingGlyphs(ctx.glyphs, values.join("") + OPERATOR[operation] + "+");
  if (missing.length > 0) return refuse("unsupported", `The board pen cannot write ${missing.join(" ")} yet.`);
  const [a, b] = values.map(Number);
  if (operation === "subtract" && b > a) return refuse("unsupported", `${values[0]} − ${values[1]} is below zero: columns do not show negative answers.`);

  const opCount = operands.length;
  const calc: CalcRow[] = [];
  let laneCount: number;
  let places: number;
  let plan: number[] = [];
  const rules: number[] = [];
  let plusY: number | null = null;
  if (operation === "multiply" && values[1].length > 1) {
    const k = values[1].length;
    const partials = [...values[1]].reverse().map((d, i) => (a * Number(d) === 0 ? "0".repeat(i + 1) : String(a * Number(d)) + "0".repeat(i)));
    const answer = String(a * b);
    places = Math.max(answer.length, ...values.map((v) => v.length), ...partials.map((p) => p.length));
    laneCount = k + 1;
    const firstWork = laneCount + opCount;
    partials.forEach((value, i) =>
      calc.push({ id: `p${i}`, value, carries: productCarries(values[0], Number(values[1][k - 1 - i]), i, places), y: firstWork + i, laneY: k - i }),
    );
    calc.push({ id: "answer", value: answer, carries: additionCarries(partials, places), y: firstWork + k, laneY: 0 });
    rules.push(firstWork, firstWork + k);
    plusY = firstWork + k - 1;
  } else {
    const answer = String(operation === "add" ? values.reduce((s, v) => s + Number(v), 0) : operation === "subtract" ? a - b : a * b);
    places = Math.max(answer.length, ...values.map((v) => v.length));
    let carries: number[] = Array(places).fill(0);
    if (operation === "subtract") {
      plan = borrowPlan(values[0], values[1]);
      const lanes = plan.map((p, c) => p + (plan[c + 1] ?? 0));
      laneCount = Math.max(1, ...lanes);
    } else {
      laneCount = 1;
      carries = operation === "add" ? additionCarries(values, places) : productCarries(values[0], b, 0, places);
    }
    calc.push({ id: "answer", value: answer, carries, y: laneCount + opCount, laneY: 0 });
    rules.push(laneCount + opCount);
  }
  if (places > PLACE_NAMES.length) return refuse("unsupported", `Columns go up to the ${PLACE_NAMES.at(-1)}.`);

  const answerY = calc.at(-1)!.y;
  const state: ColumnsState = {
    operation,
    places,
    seq: ctx.seq,
    operands: operands.map((o, i) => ({ id: o.id, value: o.value, y: laneCount + i })),
    calc,
    borrowPlan: plan,
    laneCount,
    rules,
    plusY,
    height: answerY + 1,
    written: Object.fromEntries(calc.map((r) => [r.id, {}])),
    regroups: [],
  };
  return { state, size: { w: places + 2, h: state.height } };
}

const rowLabel = (id: string) => (id === "answer" ? "answer" : /^p\d+$/.test(id) ? `work row ${Number(id.slice(1)) + 1}` : id);

function regroupLabel(r: Regroup) {
  return r.kind === "carry"
    ? `carry ${r.value} from the ${placeName(r.from)} to the ${placeName(r.to)}`
    : `borrow 1 from the ${placeName(r.from)} into the ${placeName(r.to)}`;
}

function rowValue(state: ColumnsState, row: CalcRow): string | null {
  const w = state.written[row.id];
  return [...row.value].every((_, i) => w[row.value.length - 1 - i]) ? row.value : null;
}

function targets(state: ColumnsState, objectId: string): LocalTarget[] {
  const out: LocalTarget[] = [];
  const width = state.places + 1;
  const firstY = state.operands[0].y;
  const answerY = state.calc.at(-1)!.y;
  out.push({ target: { objectId, part: "whole" }, label: objectId, writable: false, value: null, rect: { x: 0, y: 0, w: state.places + 2, h: state.height } });
  for (let c = 0; c < state.places; c++)
    out.push({
      target: { objectId, part: "column", column: placeName(c) },
      label: `${objectId} ${placeName(c)} column`,
      writable: false,
      value: null,
      rect: { x: colX(state, c), y: firstY, w: 1, h: answerY + 1 - firstY },
    });
  const history = state.operation === "subtract" ? topHistory(state) : null;
  state.operands.forEach((o, i) => {
    out.push({ target: { objectId, part: "row", rowId: o.id }, label: `${objectId} ${o.id}`, writable: false, value: o.value, rect: { x: 0, y: o.y, w: width, h: 1 } });
    for (let c = 0; c < o.value.length; c++) {
      const shown = i === 0 && history ? history[c] : [digitAt(o.value, c)];
      out.push({
        target: { objectId, part: "cell", rowId: o.id, column: placeName(c) },
        label: `${objectId} ${o.id} ${placeName(c)}`,
        writable: false,
        value: String(shown.at(-1)),
        ...(shown.length > 1 ? { crossedOut: shown.slice(0, -1).map(String) } : {}),
        rect: { x: colX(state, c), y: o.y, w: 1, h: 1 },
      });
    }
  });
  for (const row of state.calc) {
    const w = state.written[row.id];
    out.push({
      target: { objectId, part: "row", rowId: row.id },
      label: `${objectId} ${rowLabel(row.id)}`,
      writable: Object.keys(w).length === 0,
      value: rowValue(state, row),
      rect: { x: 0, y: row.y, w: width, h: 1 },
    });
    for (let c = 0; c < row.value.length; c++)
      out.push({
        target: { objectId, part: "cell", rowId: row.id, column: placeName(c) },
        label: `${objectId} ${rowLabel(row.id)} ${placeName(c)}`,
        writable: !w[c],
        value: w[c] ? String(w[c].digit) : null,
        rect: { x: colX(state, c), y: row.y, w: 1, h: 1 },
      });
  }
  const done: Regroup[] = [];
  for (const r of state.regroups) {
    done.push(r);
    const row = state.calc.find((c) => c.id === r.rowId);
    const lane = r.kind === "carry" ? row!.laneY : borrowLaneRow(state, topHistory(state, done)[r.to].length - 2);
    const left = colX(state, Math.max(r.from, r.to));
    out.push({
      target: { objectId: r.id, part: "whole" },
      label: regroupLabel(r),
      writable: false,
      value: r.kind === "carry" ? String(r.value) : String(topHistory(state, done)[r.to].at(-1)),
      rect: r.kind === "carry" ? { x: colX(state, r.to), y: lane, w: 1, h: 1 } : { x: left, y: lane, w: 2, h: 1 },
    });
  }
  return out;
}

function calcCell(state: ColumnsState, target: Target): { row: CalcRow; place: number | null } | RefusalBody {
  if (target.part !== "cell" && target.part !== "row") return refuse("not_writable", "Put writes in a cell or a row of the answer or a work row.");
  const row = state.calc.find((r) => r.id === target.rowId);
  if (!row) {
    if (state.operands.some((o) => o.id === target.rowId)) return refuse("not_writable", `The ${target.rowId} number is already written.`);
    return refuse("unknown_target", `There is no row "${target.rowId}".`);
  }
  if (target.part === "row") return { row, place: null };
  const place = placeIndex(target.column);
  if (place < 0 || place >= row.value.length) return refuse("not_writable", `The ${rowLabel(row.id)} has no ${target.column} digit.`);
  return { row, place };
}

function put(state: ColumnsState, target: Target, value: string, ink: Ink | undefined, ctx: Ctx): ColumnsState | RefusalBody {
  const found = calcCell(state, target);
  if ("code" in found) return found;
  const { row, place } = found;
  const written = { ...state.written[row.id] };
  const pen = ink ?? (row.id === "answer" ? "green" : "blue");
  if (place === null) {
    if (Object.keys(written).length > 0) return refuse("already_written", `Part of the ${rowLabel(row.id)} is written; put the rest by cell.`);
    if (value !== row.value) return refuse("wrong_value", `The ${rowLabel(row.id)} is ${row.value}, not ${value}.`);
    for (let c = 0; c < row.value.length; c++) written[c] = { digit: digitAt(row.value, c), seq: ctx.seq, ink: pen };
  } else {
    if (!/^\d$/.test(value)) return refuse("invalid_command", "A cell takes one digit.");
    if (written[place]) return refuse("already_written", `The ${rowLabel(row.id)} ${placeName(place)} digit is already written.`);
    const right = digitAt(row.value, place);
    if (Number(value) !== right) return refuse("wrong_value", `The ${placeName(place)} digit of the ${rowLabel(row.id)} is ${right}, not ${value}.`);
    written[place] = { digit: right, seq: ctx.seq, ink: pen };
  }
  return { ...state, written: { ...state.written, [row.id]: written } };
}

function regroup(state: ColumnsState, req: RegroupCommand, ctx: Ctx): ColumnsState | RefusalBody {
  const from = placeIndex(req.from);
  const to = placeIndex(req.to);
  if (from < 0 || to < 0 || from >= state.places || to >= state.places) return refuse("unknown_target", `This problem has places from the ones to the ${placeName(state.places - 1)}.`);
  const add = (r: Regroup): ColumnsState => ({ ...state, regroups: [...state.regroups, r] });
  if (req.kind === "carry") {
    if (state.operation === "subtract") return refuse("not_allowed", "Subtraction borrows; it does not carry.");
    if (to !== from + 1) return refuse("not_allowed", "A carry goes from one place to the next place to the left.");
    const row = state.calc.find((r) => r.id === req.rowId);
    if (!row) return refuse("unknown_target", `Carries belong to the answer or a work row, not "${req.rowId}".`);
    if (state.regroups.some((r) => r.kind === "carry" && r.rowId === row.id && r.from === from))
      return refuse("already_written", `The carry from the ${req.from} is already written.`);
    const value = row.carries[from];
    if (!value) return refuse("not_allowed", `There is no carry from the ${req.from} in the ${rowLabel(row.id)}.`);
    return add({ id: req.id, kind: "carry", rowId: row.id, from, to, value, seq: ctx.seq, ink: req.ink ?? "red" });
  }
  if (state.operation !== "subtract") return refuse("not_allowed", "Only subtraction borrows.");
  const topId = state.operands[0].id;
  if (req.rowId !== topId) return refuse("not_allowed", `A borrow changes the top number, "${topId}".`);
  if (from !== to + 1) return refuse("not_allowed", "A borrow takes one from a place into the next place to the right.");
  const used = state.regroups.filter((r) => r.kind === "borrow" && r.from === from).length;
  if (used >= state.borrowPlan[from]) return refuse("not_allowed", `The ${req.to} do not need to borrow from the ${req.from} here.`);
  const current = topHistory(state)[from].at(-1)!;
  if (current < 1) return refuse("not_allowed", `The ${req.from} have 0 to lend: borrow into the ${req.from} first.`);
  return add({ id: req.id, kind: "borrow", rowId: topId, from, to, value: 1, seq: ctx.seq, ink: req.ink ?? "red" });
}

function removeOwned(state: ColumnsState, id: string): ColumnsState | RefusalBody {
  const r = state.regroups.find((g) => g.id === id)!;
  if (r.kind === "borrow" && state.regroups.some((g) => g.kind === "borrow" && g.seq > r.seq))
    return refuse("not_allowed", "A later borrow depends on this one: remove that first.");
  return { ...state, regroups: state.regroups.filter((g) => g.id !== id) };
}

/** A check means "this is right": only on a finished answer or work row, a written answer digit, or a finished problem. */
function refuseMark(state: ColumnsState, target: Target, style: string): RefusalBody | null {
  if (style !== "check") return null;
  const answer = state.calc.at(-1)!;
  const row = target.part === "whole" ? answer : target.part === "row" || target.part === "cell" ? state.calc.find((r) => r.id === target.rowId) : undefined;
  if (!row) return refuse("not_allowed", "A check marks a finished answer: put it on the answer, a work row or the whole problem.");
  const done = target.part === "cell" ? !!state.written[row.id][placeIndex(target.column)] : rowValue(state, row) !== null;
  return done ? null : refuse("not_allowed", `The ${rowLabel(row.id)} is not finished: check it after it is written.`);
}

function draw(state: ColumnsState, objectId: string, ctx: Ctx): LocalStroke[] {
  const out: LocalStroke[] = [];
  const math = { objectId, layer: "math" as const, width: DIGIT_WIDTH, seq: state.seq };
  const cellBox = (place: number, y: number): Rect => ({ x: colX(state, place), y, w: 1, h: 1 });
  for (const o of state.operands)
    for (let c = o.value.length - 1; c >= 0; c--)
      out.push(...glyphStrokes(ctx.glyphs, String(digitAt(o.value, c)), cellBox(c, o.y), { ...math, ink: "blue", target: { objectId, part: "cell", rowId: o.id, column: placeName(c) } }, `op/${o.id}/${c}`));
  const opRow = state.operands.at(-1)!;
  out.push(...glyphStrokes(ctx.glyphs, OPERATOR[state.operation], { x: 0, y: opRow.y, w: 1, h: 1 }, { ...math, ink: "black", target: null }, "operator"));
  state.rules.forEach((y, i) =>
    out.push({ ...math, key: `rule/${i}`, kind: "rule", ink: "black", width: 0.06, target: null, pts: [[0.1, y], [state.places + 0.9, y]] }),
  );
  if (state.plusY !== null) out.push(...glyphStrokes(ctx.glyphs, "+", { x: 0, y: state.plusY, w: 1, h: 1 }, { ...math, ink: "black", target: null }, "plus"));

  for (const row of state.calc)
    for (const [place, w] of Object.entries(state.written[row.id]).sort(([a], [b]) => Number(a) - Number(b))) {
      const c = Number(place);
      const target: Target = { objectId, part: "cell", rowId: row.id, column: placeName(c) };
      out.push(...glyphStrokes(ctx.glyphs, String(w.digit), cellBox(c, row.y), { ...math, ink: w.ink, seq: w.seq, target }, `w/${row.id}/${c}`));
    }

  const done: Regroup[] = [];
  for (const r of state.regroups) {
    const before = topHistory(state, done);
    done.push(r);
    const after = topHistory(state, done);
    const base = { objectId: r.id, layer: "annotation" as const, ink: r.ink, seq: r.seq, width: SMALL_WIDTH, target: { objectId: r.id, part: "whole" } as Target };
    if (r.kind === "carry") {
      const lane = state.calc.find((c) => c.id === r.rowId)!.laneY;
      const box = laneBox(state, r.to, lane, String(r.value));
      out.push(...glyphStrokes(ctx.glyphs, String(r.value), box, base, `${r.id}/value`));
      const start: Point = [colX(state, r.from) + 0.5, state.operands[0].y - 0.05];
      const end: Point = [box.x + box.w + 0.08, box.y + box.h * 0.6];
      arrowStrokes(start, end, 0.4).forEach((pts, i) => out.push({ ...base, key: `${r.id}/arrow/${i}`, kind: "arrow", pts }));
      continue;
    }
    // A borrow: cross out what each place shows, write its new value in the next lane up, with an arrow between.
    const shownBox = (place: number, history: number[][]): Rect => {
      const len = history[place].length;
      return len === 1 ? { x: colX(state, place) + 0.15, y: state.operands[0].y + 0.12, w: 0.7, h: 0.76 } : laneBox(state, place, borrowLaneRow(state, len - 2), String(history[place].at(-1)));
    };
    const side = (place: number, key: string) => {
      out.push({ ...base, key: `${r.id}/${key}/strike`, kind: "strike", pts: strikeAcross(shownBox(place, before)) });
      out.push(...glyphStrokes(ctx.glyphs, String(after[place].at(-1)), shownBox(place, after), base, `${r.id}/${key}/value`));
    };
    side(r.from, "from");
    const fromBox = shownBox(r.from, after);
    const toBox = shownBox(r.to, after);
    arrowStrokes([fromBox.x + fromBox.w, fromBox.y + 0.1], [toBox.x - 0.05, toBox.y + 0.1], 0.3).forEach((pts, i) =>
      out.push({ ...base, key: `${r.id}/arrow/${i}`, kind: "arrow", pts }),
    );
    side(r.to, "to");
  }
  return out;
}

export const columns: Representation<ColumnsState, ColumnsCommand> = {
  op: "columns",
  create,
  targets,
  put,
  regroup,
  removeOwned,
  refuseMark,
  draw,
};
