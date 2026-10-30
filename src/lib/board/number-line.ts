// A number line on the board (#317): a bounded line with a tick at every exact multiple of `tick` from `min` to `max`,
// labels under the ticks, and jumps as arcs above it. Values are exact fractions: a tick's position is its index, found
// by exact division, so 1/3 and 2/6 are one tick and no floating-point sum picks a label. Each tick is a target named by
// its value in lowest terms, so the names never change when the line is drawn again or at another size.
//
// Jumps are annotations the line owns, like a carry in columns. Each goes in the lowest of a fixed set of lanes where its
// arc and label clear the jumps already there; the lanes are reserved when the line is made, so a jump never moves
// anything.
import { curvedArrow, overlaps, polylineHitsRect, polylinesCross, traceTouches, type Trace } from "@/lib/board/geometry";
import type { Point } from "@/lib/board/glyphs";
import { layoutNumber, numberChars, numberStrokes, numberText, refuseMissing, type NumberLayout, type NumberParts } from "@/lib/board/fraction";
import { lcm } from "@/lib/question-package-math";
import { add, ceil, compare, div, equal, isWhole, LINE_LIMIT, max, rational, readNumber, sub, times, toDecimal, toNumber, valueKey, type Rational, type ReadNumber } from "@/lib/board/rational";
import { isRefusal, refuse, type Ctx, type LocalStroke, type LocalTarget, type RefusalBody, type Representation, type Reserved } from "@/lib/board/representation";
import type { Ink, JumpCommand, LineLabels, NumberForm, NumberLineCommand, Rect, Target } from "@/lib/board/types";

const MAX_TICKS = 25;
const MAX_UNIT = 100;
/** Jump lanes above the line. */
const LANES = 3;
/** The size of label digits, against a fraction object's. */
const LABEL_SIZE = rational(3, 5);
const LINE_WIDTH = 0.06;
const LABEL_WIDTH = 0.05;
const ARC_WIDTH = 0.05;
// Layout distances in cells, exact: sizes and positions are worked out with them before anything is drawn.
/** How far the lowest arc rises above the line. */
const RISE = rational(7, 10);
/** The gap between an arc and its tick, and around labels. */
const GAP = rational(1, 10);
/** Half the height of a tick mark. */
const HALF_TICK = rational(1, 4);
/** Room above the top lane's label, and below the tick labels. */
const TOP = rational(1, 5);
const BOTTOM = rational(1, 10);
/** Room between ticks beside the widest label, and the narrowest tick spacing. */
const LABEL_ROOM = rational(2, 5);
const MIN_SPACING = rational(1);
/** The narrowest room from the line's end to its end tick. */
const MIN_END = rational(3, 5);
/** A lane is a label high and this much more. */
const LANE_ROOM = rational(1, 2);
// The same distances as floats, for drawing.
const FIRST_RISE = toNumber(RISE);
const INSET = toNumber(GAP);
const TICK_HALF = toNumber(HALF_TICK);

interface Jump {
  id: string;
  from: number;
  to: number;
  lane: number;
  label: NumberParts | null;
  ink: Ink;
  seq: number;
}

/** Where the line's parts go, in cells from the object's top-left corner. Tick positions stay exact. */
interface Geometry {
  spacing: Rational;
  /** x of tick 0. */
  x0: Rational;
  lineY: number;
  labelH: number;
  laneH: number;
  w: number;
  h: number;
}

/** How a line writes its values: the form, and the denominator every fraction label uses. */
interface LabelStyle {
  form: NumberForm;
  /** The line counts in these parts: "2/6" on a line in sixths. */
  unit: number;
}

export interface NumberLineState extends LabelStyle {
  min: Rational;
  tick: Rational;
  count: number;
  /** Ticks labelled when the line was drawn; `put` labels the others. */
  shown: boolean[];
  put: Record<number, { seq: number; ink: Ink }>;
  jumps: Jump[];
  ink: Ink;
  seq: number;
  geo: Geometry;
}

const valueAt = (state: Pick<NumberLineState, "min" | "tick">, i: number) => add(state.min, times(state.tick, i));

/** A value's tick on the line, or null when no tick shows it. */
function tickOf(state: NumberLineState, v: Rational): number | null {
  const k = div(sub(v, state.min), state.tick);
  return isWhole(k) && k.num >= 0 && k.num < state.count ? k.num : null;
}

/** How the line writes a value: whole numbers plainly, others as a decimal, an improper fraction or a mixed number in the line's unit. */
function labelOf({ form, unit }: LabelStyle, v: Rational): NumberParts {
  const sign = v.num < 0 ? "−" : "";
  const a = rational(Math.abs(v.num), v.den);
  if (isWhole(a)) return { sign, whole: String(a.num), fraction: null };
  if (form === "decimal") return { sign, whole: toDecimal(a), fraction: null };
  const scale = unit / a.den;
  if (form === "mixed" && a.num > a.den) {
    return { sign, whole: String(Math.floor(a.num / a.den)), fraction: { numerator: String((a.num % a.den) * scale), denominator: String(unit) } };
  }
  return { sign, whole: null, fraction: { numerator: String(a.num * scale), denominator: String(unit) } };
}

/** A jump's size as the line writes it, with its direction: "+2/6", "−1.5". */
const stepOf = (style: LabelStyle, size: Rational): NumberParts => ({ ...labelOf(style, size), sign: size.num < 0 ? "−" : "+" });

/** A jump label as the model wrote it, with its direction sign: "1/3" and "+1/3" are both drawn "+1/3". */
function writtenParts(read: ReadNumber, text: string): NumberParts {
  const body = text.replace(/^[+\-−]/, "");
  const sign = read.value.num < 0 ? "−" : "+";
  const [whole, fraction] = read.form === "fraction" ? [null, body] : read.form === "mixed" ? body.split(" ") : [body, null];
  if (!fraction) return { sign, whole, fraction: null };
  const [numerator, denominator] = fraction.split("/");
  return { sign, whole, fraction: { numerator, denominator } };
}

const labelText = (state: NumberLineState, i: number) => numberText(labelOf(state, valueAt(state, i)));
const tickX = (geo: Geometry, i: number) => toNumber(add(geo.x0, times(geo.spacing, i)));
const isShown = (state: NumberLineState, i: number) => state.shown[i] || i in state.put;

function labelBox(state: NumberLineState, i: number): { layout: NumberLayout; rect: Rect } {
  const layout = layoutNumber(labelOf(state, valueAt(state, i)), LABEL_SIZE);
  return { layout, rect: { x: tickX(state.geo, i) - layout.w / 2, y: state.geo.lineY + TICK_HALF + INSET, w: layout.w, h: layout.h } };
}

/** A number the model wrote, or why it cannot be read: unreadable text is an invalid command, a 0 denominator is not allowed. */
function readValue(text: string, what: string): ReadNumber | RefusalBody {
  const r = readNumber(text);
  return isRefusal(r) ? { ...r, reason: `${what}: ${r.reason}` } : r;
}

function create(cmd: NumberLineCommand, ctx: Ctx): { state: NumberLineState; size: { w: number; h: number } } | RefusalBody {
  const values: Rational[] = [];
  const decimals: boolean[] = [];
  for (const [what, text] of [["min", cmd.min], ["max", cmd.max], ["tick", cmd.tick]] as const) {
    const r = readValue(text, `The ${what}`);
    if (isRefusal(r)) return r;
    values.push(r.value);
    decimals.push(r.form === "decimal");
  }
  const [min, top, tick] = values;
  if (values.slice(0, 2).some((v) => Math.abs(v.num) > LINE_LIMIT * v.den)) return refuse("not_allowed", `A number line goes from -${LINE_LIMIT} to ${LINE_LIMIT}.`);
  if (compare(tick, rational(0)) <= 0) return refuse("not_allowed", "The tick must be more than 0.");
  if (compare(top, min) <= 0) return refuse("not_allowed", "The max must be more than the min.");
  const steps = div(sub(top, min), tick);
  if (!isWhole(steps)) return refuse("not_allowed", `Ticks every ${cmd.tick} from ${cmd.min} do not land on ${cmd.max}: pick a max that is a whole number of ticks away.`);
  const count = steps.num + 1;
  if (count > MAX_TICKS) return refuse("no_room", `That is ${count} ticks: a number line has at most ${MAX_TICKS}. Use a bigger tick or a shorter range.`);
  const unit = lcm(min.den, tick.den);
  const form: NumberForm = cmd.form ?? (decimals.some(Boolean) ? "decimal" : "fraction");
  if (form !== "decimal" && unit > MAX_UNIT) return refuse("unsupported", `The ticks need a denominator of ${unit}: the board writes fractions up to ${MAX_UNIT}.`);
  const base = { min, tick };
  const style: LabelStyle = { form, unit };
  if (form === "decimal") {
    const bad = Array.from({ length: count }, (_, i) => valueAt(base, i)).find((v) => toDecimal(v) === null);
    if (bad) return refuse("not_allowed", `${valueKey(bad)} has no exact decimal: use the fraction form for this line.`);
  }
  const labels: LineLabels = cmd.labels ?? "all";
  const shown = Array.from({ length: count }, (_, i) => labels === "all" || (labels === "ends" && (i === 0 || i === count - 1)) || (labels === "wholes" && isWhole(valueAt(base, i))));
  const layouts = Array.from({ length: count }, (_, i) => layoutNumber(labelOf(style, valueAt(base, i)), LABEL_SIZE));
  // The labels, and the signs of jump labels.
  const cannot = refuseMissing(ctx.glyphs, Array.from({ length: count }, (_, i) => numberChars(labelOf(style, valueAt(base, i)))).join("") + "+−");
  if (cannot) return cannot;

  // Room for the widest label under each tick, and for the end labels inside the line's box. Exact, so a line that
  // needs 40 cells takes 40, and its ticks sit where the math puts them.
  const widest = layouts.map((l) => l.exact.w).reduce(max);
  const labelH = layouts.map((l) => l.exact.h).reduce(max);
  const spacing = max(MIN_SPACING, add(widest, LABEL_ROOM));
  const x0 = max(MIN_END, add(div(widest, rational(2)), div(LABEL_ROOM, rational(2))));
  const laneH = add(labelH, LANE_ROOM);
  const lineY = [TOP, labelH, GAP, RISE, times(laneH, LANES - 1)].reduce(add);
  const rawW = add(times(x0, 2), times(spacing, count - 1));
  const w = ceil(rawW);
  const h = ceil([lineY, HALF_TICK, GAP, labelH, BOTTOM].reduce(add));
  const centred = add(x0, div(sub(rational(w), rawW), rational(2)));
  const geo: Geometry = { spacing, x0: centred, lineY: toNumber(lineY), labelH: toNumber(labelH), laneH: toNumber(laneH), w, h };
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

/** The steps of a jump's shaft next to a tick another jump shares, where the two arcs rise together. */
const SHARED_STEPS = 2;

/**
 * True when two jumps' arcs or labels meet. The arcs (shaft and arrowhead) never cross. They may touch only at a tick
 * both jumps start or end at, where they rise together, as on paper: there the shaft's first `SHARED_STEPS` steps from
 * that tick, and an arrowhead that points at it, are left out of the touch check.
 */
function jumpsMeet(state: NumberLineState, a: Jump, b: Jump): boolean {
  const pad = (r: Rect): Rect => ({ x: r.x - INSET, y: r.y - INSET, w: r.w + 2 * INSET, h: r.h + 2 * INSET });
  const shared = (t: number) => [a.from, a.to].includes(t) && [b.from, b.to].includes(t);
  const traces = (j: Jump, shape: ReturnType<typeof jumpShape>): Trace[] => {
    const [shaft, ...head] = shape.lines;
    const lines = [shaft.slice(shared(j.from) ? SHARED_STEPS : 0, shared(j.to) ? -SHARED_STEPS : undefined), ...(shared(j.to) ? [] : head)];
    return lines.map((pts) => ({ pts, width: ARC_WIDTH }));
  };
  const [sa, sb] = [jumpShape(state, a), jumpShape(state, b)];
  if (sa.lines.some((p) => sb.lines.some((q) => polylinesCross(p, q)))) return true;
  const [ta, tb] = [traces(a, sa), traces(b, sb)];
  if (ta.some((p) => tb.some((q) => traceTouches(p, q, INSET / 2)))) return true;
  if (sa.label && sb.lines.some((q) => polylineHitsRect(q, pad(sa.label!)))) return true;
  if (sb.label && sa.lines.some((p) => polylineHitsRect(p, pad(sb.label!)))) return true;
  return !!sa.label && !!sb.label && overlaps(pad(sa.label), sb.label);
}

function jump(state: NumberLineState, cmd: JumpCommand, ctx: Ctx): NumberLineState | RefusalBody {
  const ends: number[] = [];
  for (const [what, text] of [["fromValue", cmd.fromValue], ["toValue", cmd.toValue]] as const) {
    const v = readValue(text, `The jump's ${what}`);
    if (isRefusal(v)) return v;
    const i = tickOf(state, v.value);
    if (i === null)
      return refuse("not_allowed", `${text} is not on a tick of this line: its ticks go from ${labelText(state, 0)} to ${labelText(state, state.count - 1)} in steps of ${numberText(labelOf(state, state.tick))}.`);
    ends.push(i);
  }
  const [from, to] = ends;
  if (from === to) return refuse("not_allowed", "A jump moves to another value.");
  const size = sub(valueAt(state, to), valueAt(state, from));
  let label: NumberParts | null = null;
  if (cmd.label !== undefined) {
    const r = readValue(cmd.label, "The jump's label");
    if (isRefusal(r)) return r;
    if (!equal(r.value, size))
      return refuse("wrong_value", `This jump goes ${size.num < 0 ? "back" : "forward"} ${numberText(labelOf(state, rational(Math.abs(size.num), size.den)))}: its label is ${numberText(stepOf(state, size))}, not ${cmd.label}.`);
    label = writtenParts(r, cmd.label);
    const cannot = refuseMissing(ctx.glyphs, numberChars(label));
    if (cannot) return cannot;
  }
  for (let lane = 0; lane < LANES; lane++) {
    const next: Jump = { id: cmd.id, from, to, lane, label, ink: cmd.ink ?? "red", seq: ctx.seq };
    const shape = jumpShape(state, next);
    if (shape.label && shape.label.w > state.geo.w) return refuse("no_room", "That label is wider than the line.");
    if (state.jumps.some((o) => jumpsMeet(state, next, o))) continue;
    return { ...state, jumps: [...state.jumps, next] };
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
      label: `${objectId}: a number line from ${ends}, a tick every ${numberText(labelOf(state, state.tick))}`,
      writable: false,
      value: null,
      rect: { x: 0, y: 0, w: geo.w, h: geo.h },
    },
  ];
  for (let i = 0; i < state.count; i++) {
    const { rect } = labelBox(state, i);
    const half = Math.min(toNumber(geo.spacing) / 2 - 0.05, Math.max(0.3, rect.w / 2 + INSET));
    out.push({
      target: { objectId, part: "value", value: valueKey(valueAt(state, i)) },
      label: `${objectId} at ${labelText(state, i)}`,
      writable: !isShown(state, i),
      value: isShown(state, i) ? labelText(state, i) : null,
      // A gap under the label, so an arrow that ends below the tick keeps clear of the label it will get.
      rect: { x: tickX(geo, i) - half, y: geo.lineY - TICK_HALF - 0.05, w: 2 * half, h: rect.y + rect.h + INSET - (geo.lineY - TICK_HALF - 0.05) },
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

/** Labels a tick in the line's own form. A value, when given, must be the tick's; with none, the line writes its own. */
function put(state: NumberLineState, target: Target, value: string | undefined, ink: Ink | undefined, ctx: Ctx): NumberLineState | RefusalBody {
  if (target.part !== "value") return refuse("not_writable", "Put writes a label under a tick: name the tick by its value.");
  // The target's value is already a name in lowest terms (the parser and the summary give it so).
  const i = Array.from({ length: state.count }, (_, k) => valueKey(valueAt(state, k))).indexOf(target.value);
  if (i < 0) return refuse("unknown_target", `${target.value} is not on a tick of this line.`);
  if (isShown(state, i)) return refuse("already_written", `The tick at ${labelText(state, i)} is already labelled.`);
  if (value !== undefined) {
    const v = readValue(value, "The label");
    if (isRefusal(v)) return v;
    if (!equal(v.value, valueAt(state, i))) return refuse("wrong_value", `That tick is ${labelText(state, i)}, not ${value}.`);
  }
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
    out.push(...numberStrokes(ctx, labelOf(state, valueAt(state, i)), layout, { dx: rect.x, dy: rect.y }, base, () => target, `label/${i}`));
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

/**
 * Later jumps go in the lanes above the line, kept as a box. Later labels are known now, so they are the strokes of the
 * labels not written yet: an arrow to a tick keeps clear of the label it will get, so that label can still be written.
 */
function reserved(state: NumberLineState, objectId: string, ctx: Ctx): Reserved {
  const { geo } = state;
  const now = new Set(draw(state, objectId, ctx).map((s) => s.key));
  const labelled = { ...state, shown: state.shown.map(() => true) };
  return { strokes: draw(labelled, objectId, ctx).filter((s) => !now.has(s.key)), boxes: [{ x: 0, y: 0, w: geo.w, h: geo.lineY - TICK_HALF }] };
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
