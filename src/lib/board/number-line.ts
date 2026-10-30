// A number line on the board (#317): a bounded line with a tick at every exact multiple of `tick` from `min` to `max`,
// labels under the ticks, and jumps as arcs above it. Values are exact fractions: a tick's position is its index, found
// by exact division, so 1/3 and 2/6 are one tick and no floating-point sum picks a label. Each tick is a target named by
// its value in lowest terms, so the names never change when the line is drawn again or at another size.
//
// Jumps are annotations the line owns, like a carry in columns. Each goes in the lowest of a fixed set of lanes where its
// arc and label clear the jumps already there; the lanes are reserved when the line is made, so a jump never moves
// anything.
import { curvedArrow, overlaps, polylineHitsRect, traceTouches } from "@/lib/board/geometry";
import type { Point } from "@/lib/board/glyphs";
import { layoutNumber, numberChars, numberStrokes, numberText, type NumberLayout, type NumberParts } from "@/lib/board/fraction";
import { gcd } from "@/lib/question-package-math";
import { add, compare, div, equal, isWhole, rational, readNumber, sub, toDecimal, valueKey, type Rational, type ReadNumber } from "@/lib/board/rational";
import { missingGlyphs, refuse, type Ctx, type LocalStroke, type LocalTarget, type RefusalBody, type Representation, type Reserved } from "@/lib/board/representation";
import type { Ink, JumpCommand, LineLabels, NumberForm, NumberLineCommand, Rect, Target } from "@/lib/board/types";

const MAX_TICKS = 25;
const MAX_UNIT = 100;
/** Jump lanes above the line. */
const LANES = 3;
/** The size of label digits, against a fraction object's. */
const LABEL_SIZE = 0.6;
const LINE_WIDTH = 0.06;
const LABEL_WIDTH = 0.05;
const ARC_WIDTH = 0.05;
/** How far the lowest arc rises above the line, in cells. */
const FIRST_RISE = 0.7;
/** The gap between an arc and its tick, and around labels, in cells. */
const INSET = 0.1;
/** Half the height of a tick mark. */
const TICK_HALF = 0.25;

interface Jump {
  id: string;
  from: number;
  to: number;
  lane: number;
  label: NumberParts | null;
  ink: Ink;
  seq: number;
}

interface Geometry {
  spacing: number;
  /** x of tick 0, from the object's left edge. */
  x0: number;
  lineY: number;
  labelH: number;
  laneH: number;
  w: number;
  h: number;
}

export interface NumberLineState {
  min: Rational;
  tick: Rational;
  count: number;
  form: NumberForm;
  /** Every label's denominator: the line counts in these parts ("2/6" on a line in sixths). */
  unit: number;
  /** Ticks labelled when the line was drawn; `put` labels the others. */
  shown: boolean[];
  put: Record<number, { seq: number; ink: Ink }>;
  jumps: Jump[];
  ink: Ink;
  seq: number;
  geo: Geometry;
}

const times = (r: Rational, k: number) => rational(r.num * k, r.den);
const valueAt = (state: Pick<NumberLineState, "min" | "tick">, i: number) => add(state.min, times(state.tick, i));
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

/** A value's tick on the line, or null when no tick shows it. */
function tickOf(state: NumberLineState, v: Rational): number | null {
  const k = div(sub(v, state.min), state.tick);
  return isWhole(k) && k.num >= 0 && k.num < state.count ? k.num : null;
}

/** How the line writes a value: whole numbers plainly, others as a decimal, an improper fraction or a mixed number in the line's unit. */
function labelOf(v: Rational, form: NumberForm, unit: number, signed = false): NumberParts {
  const sign = v.num < 0 ? "−" : signed ? "+" : "";
  const a = rational(Math.abs(v.num), v.den);
  if (isWhole(a)) return { sign, whole: String(a.num), fraction: null };
  if (form === "decimal") return { sign, whole: toDecimal(a), fraction: null };
  const scale = unit / a.den;
  if (form === "mixed" && a.num > a.den) {
    return { sign, whole: String(Math.floor(a.num / a.den)), fraction: { numerator: String((a.num % a.den) * scale), denominator: String(unit) } };
  }
  return { sign, whole: null, fraction: { numerator: String(a.num * scale), denominator: String(unit) } };
}

/** A number as the model wrote it, for a jump label: "+1/3" stays "+1/3". */
function writtenParts(read: ReadNumber, text: string): NumberParts {
  const body = text.replace(/^[+\-−]/, "");
  const sign = read.value.num < 0 ? "−" : "+";
  const [whole, fraction] = read.form === "fraction" ? [null, body] : read.form === "mixed" ? body.split(" ") : [body, null];
  if (!fraction) return { sign, whole, fraction: null };
  const [numerator, denominator] = fraction.split("/");
  return { sign, whole, fraction: { numerator, denominator } };
}

const labelText = (state: NumberLineState, i: number) => numberText(labelOf(valueAt(state, i), state.form, state.unit));
const tickX = (geo: Geometry, i: number) => geo.x0 + i * geo.spacing;
const isShown = (state: NumberLineState, i: number) => state.shown[i] || i in state.put;

function labelBox(state: NumberLineState, i: number): { layout: NumberLayout; rect: Rect } {
  const layout = layoutNumber(labelOf(valueAt(state, i), state.form, state.unit), LABEL_SIZE);
  return { layout, rect: { x: tickX(state.geo, i) - layout.w / 2, y: state.geo.lineY + TICK_HALF + INSET, w: layout.w, h: layout.h } };
}

function read(text: string, what: string): Rational | RefusalBody {
  const r = readNumber(text);
  return "reason" in r ? refuse("not_allowed", `${what}: ${r.reason}`) : r.value;
}

function create(cmd: NumberLineCommand, ctx: Ctx): { state: NumberLineState; size: { w: number; h: number } } | RefusalBody {
  const values: Rational[] = [];
  const decimals: boolean[] = [];
  for (const [what, text] of [["min", cmd.min], ["max", cmd.max], ["tick", cmd.tick]] as const) {
    const r = readNumber(text);
    if ("reason" in r) return refuse("not_allowed", `The ${what}: ${r.reason}`);
    values.push(r.value);
    decimals.push(r.form === "decimal");
  }
  const [min, max, tick] = values;
  if (compare(tick, rational(0)) <= 0) return refuse("not_allowed", "The tick must be more than 0.");
  if (compare(max, min) <= 0) return refuse("not_allowed", "The max must be more than the min.");
  const steps = div(sub(max, min), tick);
  if (!isWhole(steps)) return refuse("not_allowed", `Ticks every ${cmd.tick} from ${cmd.min} do not land on ${cmd.max}: pick a max that is a whole number of ticks away.`);
  const count = steps.num + 1;
  if (count > MAX_TICKS) return refuse("no_room", `That is ${count} ticks: a number line has at most ${MAX_TICKS}. Use a bigger tick or a shorter range.`);
  const unit = lcm(min.den, tick.den);
  if (unit > MAX_UNIT) return refuse("unsupported", `The ticks need a denominator of ${unit}: the board writes up to ${MAX_UNIT}.`);
  const form: NumberForm = cmd.form ?? (decimals.some(Boolean) ? "decimal" : "fraction");
  const base = { min, tick };
  if (form === "decimal") {
    const bad = Array.from({ length: count }, (_, i) => valueAt(base, i)).find((v) => toDecimal(v) === null);
    if (bad) return refuse("not_allowed", `${valueKey(bad)} has no exact decimal: use the fraction form for this line.`);
  }
  const labels: LineLabels = cmd.labels ?? "all";
  const shown = Array.from({ length: count }, (_, i) => labels === "all" || (labels === "ends" && (i === 0 || i === count - 1)) || (labels === "wholes" && isWhole(valueAt(base, i))));
  const layouts = Array.from({ length: count }, (_, i) => layoutNumber(labelOf(valueAt(base, i), form, unit), LABEL_SIZE));
  const missing = missingGlyphs(ctx.glyphs, Array.from({ length: count }, (_, i) => numberChars(labelOf(valueAt(base, i), form, unit, true))).join("") + "−");
  if (missing.length > 0) return refuse("unsupported", `The board pen cannot write ${missing.join(" ")} yet.`);

  // Room for the widest label under each tick, and for the end labels inside the line's box.
  const widest = Math.max(...layouts.map((l) => l.w));
  const labelH = Math.max(...layouts.map((l) => l.h));
  const spacing = Math.max(1, widest + 0.4);
  const x0 = Math.max(0.6, widest / 2 + 0.2);
  const laneH = labelH + 0.5;
  const lineY = 0.2 + labelH + INSET + FIRST_RISE + (LANES - 1) * laneH;
  const rawW = 2 * x0 + (count - 1) * spacing;
  const w = Math.ceil(rawW);
  const h = Math.ceil(lineY + TICK_HALF + INSET + labelH + 0.1);
  const geo: Geometry = { spacing, x0: x0 + (w - rawW) / 2, lineY, labelH, laneH, w, h };
  const state: NumberLineState = { min, tick, count, form, unit, shown, put: {}, jumps: [], ink: "blue", seq: ctx.seq, geo };
  return { state, size: { w, h } };
}

// ---------- jumps ----------

/** A jump's arc (the shaft, then the arrowhead's two strokes) and its label box, in a lane. */
function jumpShape(state: NumberLineState, j: Pick<Jump, "from" | "to" | "lane" | "label">): { lines: Point[][]; label: Rect | null; layout: NumberLayout | null } {
  const { geo } = state;
  const dir = Math.sign(j.to - j.from);
  const y = geo.lineY - TICK_HALF / 2;
  const from: Point = [tickX(geo, j.from) + dir * INSET, y];
  const to: Point = [tickX(geo, j.to) - dir * INSET, y];
  const apex = geo.lineY - FIRST_RISE - j.lane * geo.laneH;
  // A quadratic curve peaks halfway between its ends and its control point.
  const lines = curvedArrow(from, [(from[0] + to[0]) / 2, 2 * apex - y], to);
  if (!j.label) return { lines, label: null, layout: null };
  const layout = layoutNumber(j.label, LABEL_SIZE);
  const x = Math.min(Math.max(0, (from[0] + to[0]) / 2 - layout.w / 2), geo.w - layout.w);
  return { lines, label: { x, y: apex - INSET - layout.h, w: layout.w, h: layout.h }, layout };
}

/**
 * True when two jumps' arcs or labels meet. Arcs from or to one tick meet there, as on paper, so arcs are compared away
 * from their ends: the middle of each shaft.
 */
function jumpsMeet(a: ReturnType<typeof jumpShape>, b: ReturnType<typeof jumpShape>): boolean {
  const pad = (r: Rect): Rect => ({ x: r.x - INSET, y: r.y - INSET, w: r.w + 2 * INSET, h: r.h + 2 * INSET });
  const middle = (shape: ReturnType<typeof jumpShape>) => ({ pts: shape.lines[0].slice(2, -2), width: ARC_WIDTH });
  if (traceTouches(middle(a), middle(b), INSET / 2)) return true;
  if (a.label && b.lines.some((q) => polylineHitsRect(q, pad(a.label!)))) return true;
  if (b.label && a.lines.some((p) => polylineHitsRect(p, pad(b.label!)))) return true;
  return !!a.label && !!b.label && overlaps(pad(a.label), b.label);
}

function jump(state: NumberLineState, cmd: JumpCommand, ctx: Ctx): NumberLineState | RefusalBody {
  const ends: number[] = [];
  for (const [what, text] of [["fromValue", cmd.fromValue], ["toValue", cmd.toValue]] as const) {
    const v = read(text, `The jump's ${what}`);
    if ("code" in v) return v;
    const i = tickOf(state, v);
    if (i === null)
      return refuse("not_allowed", `${text} is not on a tick of this line: its ticks go from ${labelText(state, 0)} to ${labelText(state, state.count - 1)} in steps of ${numberText(labelOf(state.tick, state.form, state.unit))}.`);
    ends.push(i);
  }
  const [from, to] = ends;
  if (from === to) return refuse("not_allowed", "A jump moves to another value.");
  const size = sub(valueAt(state, to), valueAt(state, from));
  let label: NumberParts | null = null;
  if (cmd.label !== undefined) {
    const r = readNumber(cmd.label);
    if ("reason" in r) return refuse("invalid_command", `The jump's label: ${r.reason}`);
    const right = numberText(labelOf(size, state.form, state.unit, true));
    if (!equal(r.value, size) || (size.num < 0 && r.sign !== "-") || (size.num > 0 && r.sign === "-"))
      return refuse("wrong_value", `This jump goes ${size.num < 0 ? "back" : "forward"} ${numberText(labelOf(rational(Math.abs(size.num), size.den), state.form, state.unit))}: its label is ${right}, not ${cmd.label}.`);
    label = writtenParts(r, cmd.label);
    const missing = missingGlyphs(ctx.glyphs, numberChars(label));
    if (missing.length > 0) return refuse("unsupported", `The board pen cannot write ${missing.join(" ")} yet.`);
  }
  const others = state.jumps.map((j) => jumpShape(state, j));
  for (let lane = 0; lane < LANES; lane++) {
    const shape = jumpShape(state, { from, to, lane, label });
    if (shape.label && shape.label.w > state.geo.w) return refuse("no_room", "That label is wider than the line.");
    if (others.some((o) => jumpsMeet(shape, o))) continue;
    return { ...state, jumps: [...state.jumps, { id: cmd.id, from, to, lane, label, ink: cmd.ink ?? "red", seq: ctx.seq }] };
  }
  return refuse("no_room", `The ${LANES} jump lanes over this part of the line are full: remove a jump first, or draw a new line.`);
}

// ---------- the representation ----------

function targets(state: NumberLineState, objectId: string): LocalTarget[] {
  const { geo } = state;
  const ends = `${labelText(state, 0)} to ${labelText(state, state.count - 1)}`;
  const out: LocalTarget[] = [
    {
      target: { objectId, part: "whole" },
      label: `${objectId}: a number line from ${ends}, a tick every ${numberText(labelOf(state.tick, state.form, state.unit))}`,
      writable: false,
      value: null,
      rect: { x: 0, y: 0, w: geo.w, h: geo.h },
    },
  ];
  for (let i = 0; i < state.count; i++) {
    const { rect } = labelBox(state, i);
    const half = Math.min(geo.spacing / 2 - 0.05, Math.max(0.3, rect.w / 2 + INSET));
    out.push({
      target: { objectId, part: "value", value: valueKey(valueAt(state, i)) },
      label: `${objectId} at ${labelText(state, i)}`,
      writable: !isShown(state, i),
      value: isShown(state, i) ? labelText(state, i) : null,
      rect: { x: tickX(geo, i) - half, y: geo.lineY - TICK_HALF - 0.05, w: 2 * half, h: rect.y + rect.h - (geo.lineY - TICK_HALF - 0.05) },
    });
  }
  for (const j of state.jumps) {
    const shape = jumpShape(state, j);
    const xs = shape.lines.flat().map(([x]) => x).concat(shape.label ? [shape.label.x, shape.label.x + shape.label.w] : []);
    const top = shape.label ? shape.label.y : geo.lineY - FIRST_RISE - j.lane * geo.laneH;
    out.push({
      target: { objectId: j.id, part: "whole" },
      label: `jump from ${labelText(state, j.from)} to ${labelText(state, j.to)}`,
      writable: false,
      value: j.label ? numberText(j.label) : null,
      rect: { x: Math.min(...xs), y: top, w: Math.max(...xs) - Math.min(...xs), h: geo.lineY - top },
    });
  }
  return out;
}

function put(state: NumberLineState, target: Target, value: string, ink: Ink | undefined, ctx: Ctx): NumberLineState | RefusalBody {
  if (target.part !== "value") return refuse("not_writable", "Put writes a label under a tick: name the tick by its value.");
  const at = readNumber(target.value);
  const i = "reason" in at ? null : tickOf(state, at.value);
  if (i === null) return refuse("unknown_target", `${target.value} is not on a tick of this line.`);
  if (isShown(state, i)) return refuse("already_written", `The tick at ${labelText(state, i)} is already labelled.`);
  const v = readNumber(value);
  if ("reason" in v) return refuse("invalid_command", `The label: ${v.reason}`);
  if (!equal(v.value, valueAt(state, i))) return refuse("wrong_value", `That tick is ${labelText(state, i)}, not ${value}.`);
  return { ...state, put: { ...state.put, [i]: { seq: ctx.seq, ink: ink ?? "green" } } };
}

function draw(state: NumberLineState, objectId: string, ctx: Ctx): LocalStroke[] {
  const { geo } = state;
  const math = { objectId, layer: "math" as const, ink: state.ink, width: LINE_WIDTH, seq: state.seq };
  const y = geo.lineY;
  const out: LocalStroke[] = [
    { ...math, key: "line", kind: "rule", target: { objectId, part: "whole" }, pts: [[0.1, y], [geo.w - 0.1, y]] },
    { ...math, key: "end/left", kind: "rule", target: null, pts: [[0.35, y - 0.2], [0.1, y], [0.35, y + 0.2]] },
    { ...math, key: "end/right", kind: "rule", target: null, pts: [[geo.w - 0.35, y - 0.2], [geo.w - 0.1, y], [geo.w - 0.35, y + 0.2]] },
  ];
  for (let i = 0; i < state.count; i++) {
    const target: Target = { objectId, part: "value", value: valueKey(valueAt(state, i)) };
    const x = tickX(geo, i);
    out.push({ ...math, key: `tick/${i}`, kind: "rule", target, pts: [[x, y - TICK_HALF], [x, y + TICK_HALF]] });
    if (!isShown(state, i)) continue;
    const { layout, rect } = labelBox(state, i);
    const pen = state.put[i] ?? { seq: state.seq, ink: state.ink };
    const base = { objectId, layer: "math" as const, ink: pen.ink, width: LABEL_WIDTH, seq: pen.seq };
    out.push(...numberStrokes(ctx, labelOf(valueAt(state, i), state.form, state.unit), layout, { dx: rect.x, dy: rect.y }, base, () => target, `label/${i}`));
  }
  for (const j of state.jumps) {
    const shape = jumpShape(state, j);
    const target: Target = { objectId: j.id, part: "whole" };
    const base = { objectId: j.id, layer: "annotation" as const, ink: j.ink, width: ARC_WIDTH, seq: j.seq, target };
    shape.lines.forEach((pts, k) => out.push({ ...base, key: `${j.id}/arc/${k}`, kind: "arrow", pts }));
    if (j.label && shape.label && shape.layout)
      out.push(...numberStrokes(ctx, j.label, shape.layout, { dx: shape.label.x, dy: shape.label.y }, { ...base, width: LABEL_WIDTH }, () => target, `${j.id}/label`));
  }
  return out;
}

/** Later jumps go in the lanes above the line, and later labels under the ticks: an arrow keeps clear of both. */
function reserved(state: NumberLineState): Reserved {
  const { geo } = state;
  const boxes: Rect[] = [{ x: 0, y: 0, w: geo.w, h: geo.lineY - TICK_HALF }];
  for (let i = 0; i < state.count; i++) if (!isShown(state, i)) boxes.push(labelBox(state, i).rect);
  return { strokes: [], boxes };
}

export const numberLine: Representation<NumberLineState, NumberLineCommand> = {
  op: "number_line",
  create,
  targets,
  put,
  jump,
  removeOwned: (state, id) => ({ ...state, jumps: state.jumps.filter((j) => j.id !== id) }),
  reserved,
  draw,
};
