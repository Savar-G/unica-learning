// The place-value chart (design: .design/research/maya-place-value-design.md): one number written digit by digit in a
// column for each place, with the place names above. The code reads every digit and works out every value from the
// number; the model (or Maya's controller) only says which part to show. A `put` of a wrong digit, value, comparison or
// answer is refused. Rows: "digits" (the number), "value" (a digit's value, put per column), "equation" (one sentence of
// the chart's own list: "4 × 10,000 = 40,000", "8 > 2") and "answer" (the child's checked answer, in green).
// In `build` mode ("6 wholes and 4 tenths") the number is not shown: a "parts" row names the parts, and the digit row is
// filled by `put`.
import { glyphStrokes, missingGlyphs, refuse, type Ctx, type LocalStroke, type LocalTarget, type RefusalBody, type Representation, DIGIT_WIDTH, SMALL_WIDTH } from "@/lib/board/representation";
import { DECIMAL_PLACE_NAMES, PLACE_NAMES, type ChartPlace, type Ink, type PlaceChartCommand, type Rect, type Target } from "@/lib/board/types";

/** The two lines each place name is written in. */
const NAME_LINES: Record<ChartPlace, [string, string]> = {
  millions: ["", "millions"],
  hundred_thousands: ["hundred", "thousands"],
  ten_thousands: ["ten", "thousands"],
  thousands: ["", "thousands"],
  hundreds: ["", "hundreds"],
  tens: ["", "tens"],
  ones: ["", "ones"],
  tenths: ["", "tenths"],
  hundredths: ["", "hundredths"],
  thousandths: ["", "thousandths"],
};
/** The words of a part in build mode: "4 tenths", "6 wholes" (the ones place is "wholes" when decimals follow). */
const PART_WORD: Record<ChartPlace, [string, string]> = {
  millions: ["million", "millions"], hundred_thousands: ["hundred thousand", "hundred thousands"], ten_thousands: ["ten thousand", "ten thousands"],
  thousands: ["thousand", "thousands"], hundreds: ["hundred", "hundreds"], tens: ["ten", "tens"], ones: ["whole", "wholes"],
  tenths: ["tenth", "tenths"], hundredths: ["hundredth", "hundredths"], thousandths: ["thousandth", "thousandths"],
};

const COL_W = 3.2;
const POINT_W = 0.9;
const PAD = 0.35;
const BASE_ROWS = { names: { y: 0.3, h: 1.2 }, parts: { y: 1.7, h: 0.8 }, digits: { y: 1.75, h: 1.5 }, value: { y: 3.4, h: 1.1 }, equation: { y: 4.8, h: 0.95 }, answer: { y: 6.0, h: 1.1 } };
/** In build mode a "parts" row ("5 wholes", "8 tenths") sits under the names and everything below it moves down. */
const PARTS_SHIFT = 0.95;
type Row = { y: number; h: number };
function rowsOf(s: Pick<PlaceChartState, "mode">): Record<keyof typeof BASE_ROWS, Row> {
  const dy = s.mode === "build" ? PARTS_SHIFT : 0;
  const move = (r: Row): Row => ({ y: r.y + dy, h: r.h });
  return { names: BASE_ROWS.names, parts: BASE_ROWS.parts, digits: move(BASE_ROWS.digits), value: move(BASE_ROWS.value), equation: move(BASE_ROWS.equation), answer: move(BASE_ROWS.answer) };
}
const HEIGHT = 8.4;
/** The frame's top edge, above the names. */
const TOP = 0.05;
/** The highlight band: a rounded stripe behind one column, from the frame's top to the digit row's bottom. */
const BAND_W = 1.6;

export interface PlaceChartState {
  mode: "read" | "build";
  /** The number as text ("48461", "6.4"). */
  number: string;
  /** The columns, left to right, and each one's digit. */
  columns: { place: ChartPlace; digit: number; pad?: true }[];
  seq: number;
  digits: Record<string, { seq: number; ink: Ink }>;
  values: Record<string, { seq: number; ink: Ink }>;
  equation: { text: string; seq: number; ink: Ink } | null;
  answer: { text: string; seq: number; ink: Ink } | null;
}

const withCommas = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
/** A place's value as a whole number or decimal text: 10000, 0.1. */
export function placeValue(place: ChartPlace): number {
  const i = PLACE_NAMES.indexOf(place as (typeof PLACE_NAMES)[number]);
  if (i >= 0) return 10 ** i;
  return Math.round(10 ** -(DECIMAL_PLACE_NAMES.indexOf(place as (typeof DECIMAL_PLACE_NAMES)[number]) + 1) * 1000) / 1000;
}
const valueText = (digit: number, place: ChartPlace): string => {
  const v = Math.round(digit * placeValue(place) * 1000) / 1000;
  return Number.isInteger(v) ? String(v) : String(v);
};
const placeValueText = (place: ChartPlace): string => (placeValue(place) >= 1 ? withCommas(placeValue(place)) : String(placeValue(place)));
const shownValue = (text: string) => (/^\d+$/.test(text) ? withCommas(Number(text)) : text);

/**
 * The columns of a number: from its highest place down to its last decimal place. A short number gets empty columns
 * (`pad`, no digit written) so every chart is about as wide and the board's fit-to-content zoom shows digits at the same
 * size: at least 4 whole places for a whole number; at least 2 whole and 2 decimal places for a decimal ("5.8" shows tens,
 * ones, tenths, hundredths).
 */
function columnsOf(number: string): { place: ChartPlace; digit: number; pad?: true }[] {
  const [whole, frac = ""] = number.split(".");
  const wholeCols = Math.max(whole.length, frac ? 2 : 4);
  const fracCols = frac ? Math.max(frac.length, 2) : 0;
  const out: { place: ChartPlace; digit: number; pad?: true }[] = [];
  for (let i = 0; i < wholeCols; i++) {
    const at = wholeCols - 1 - i;
    const given = at < whole.length;
    out.push({ place: PLACE_NAMES[at], digit: given ? Number(whole[whole.length - 1 - at]) : 0, ...(given ? {} : { pad: true as const }) });
  }
  for (let i = 0; i < fracCols; i++) out.push({ place: DECIMAL_PLACE_NAMES[i], digit: i < frac.length ? Number(frac[i]) : 0, ...(i < frac.length ? {} : { pad: true as const }) });
  return out;
}

/** The sentences `put` may write in the equation row: every digit times its place, and every pair of digits compared. */
function allowedEquations(state: PlaceChartState): string[] {
  const out: string[] = [];
  const real = state.columns.filter((c) => !c.pad);
  for (const c of real) out.push(`${c.digit} × ${placeValueText(c.place)} = ${shownValue(valueText(c.digit, c.place))}`);
  for (const a of real) for (const b of real) if (a !== b) out.push(`${a.digit} ${a.digit > b.digit ? ">" : a.digit < b.digit ? "<" : "="} ${b.digit}`);
  return out;
}

const hasPoint = (s: PlaceChartState) => s.columns.some((c) => (DECIMAL_PLACE_NAMES as readonly string[]).includes(c.place));
const nOnes = (s: PlaceChartState) => s.columns.findIndex((c) => c.place === "ones");
/** The grid x of column i's left edge: the decimal point takes a thin column of its own right after the ones. */
const colX = (s: PlaceChartState, i: number) => PAD + i * COL_W + (hasPoint(s) && i > nOnes(s) ? POINT_W : 0);
const width = (s: PlaceChartState) => 2 * PAD + s.columns.length * COL_W + (hasPoint(s) ? POINT_W : 0);
const colRect = (s: PlaceChartState, i: number, row: Row): Rect => ({ x: colX(s, i), y: row.y, w: COL_W, h: row.h });
/**
 * The rectangle a highlight band is made from. The board draws a highlight on a tall target as one thick round-capped
 * stroke (annotations.ts): its width is 0.9 of the target's, its centre line runs 0.1 inside the top and bottom, and
 * its caps reach half a width past the ends. This rectangle is worked out so the finished stripe is BAND_W wide and fills
 * the column from the frame's top to the bottom of the digit row, with no change to the board's highlight.
 */
function band(s: PlaceChartState, i: number): Rect {
  const w = BAND_W / 0.9;
  const h = bandBottom(s) - TOP - BAND_W + 0.2;
  return { x: colX(s, i) + (COL_W - w) / 2, y: TOP + BAND_W / 2 - 0.1, w, h };
}
const bandBottom = (s: PlaceChartState) => rowsOf(s).digits.y + rowsOf(s).digits.h + 0.1;
const idx = (s: PlaceChartState, place: ChartPlace) => s.columns.findIndex((c) => c.place === place);

function create(cmd: PlaceChartCommand, ctx: Ctx): { state: PlaceChartState; size: { w: number; h: number } } | RefusalBody {
  const missing = missingGlyphs(ctx.glyphs, cmd.number + "abcdefghijklmnopqrstuvwxyz,×=<> ");
  if (missing.length > 0) return refuse("unsupported", `The board pen cannot write ${missing.join(" ")} yet.`);
  const mode = cmd.mode ?? "read";
  if (mode === "build" && !cmd.number.includes(".")) return refuse("unsupported", "A chart built from parts needs a decimal number.");
  const state: PlaceChartState = { mode, number: cmd.number, columns: columnsOf(cmd.number), seq: ctx.seq, digits: {}, values: {}, equation: null, answer: null };
  if (state.columns.length > 8) return refuse("unsupported", "A place chart has at most 8 columns.");
  if (mode === "read") state.columns.filter((c) => !c.pad).forEach((c) => (state.digits[c.place] = { seq: ctx.seq, ink: "blue" }));
  return { state, size: { w: width(state), h: HEIGHT } };
}

const rowLabel = (id: string) => id;

function targets(state: PlaceChartState, objectId: string): LocalTarget[] {
  const R = rowsOf(state);
  const out: LocalTarget[] = [{ target: { objectId, part: "whole" }, label: objectId, writable: false, value: state.mode === "read" ? state.number : null, rect: { x: 0, y: 0, w: width(state), h: HEIGHT } }];
  state.columns.forEach((c, i) => {
    out.push({
      target: { objectId, part: "column", column: c.place },
      label: `${objectId} ${c.place.replace("_", " ")} column`,
      writable: false,
      value: null,
      rect: { x: colX(state, i), y: TOP, w: COL_W, h: R.digits.y + R.digits.h - TOP + 0.1 },
    });
    out.push({ target: { objectId, part: "piece", piece: `band-${c.place}` }, label: `${objectId} ${c.place.replace("_", " ")} highlight band`, writable: false, value: null, rect: band(state, i) });
    const shown = !!state.digits[c.place];
    out.push({
      target: { objectId, part: "cell", rowId: "digits", column: c.place },
      label: `${objectId} digit of the ${c.place.replace("_", " ")}`,
      writable: state.mode === "build" && !shown && !c.pad,
      value: shown ? String(c.digit) : null,
      rect: colRect(state, i, R.digits),
    });
    out.push({
      target: { objectId, part: "cell", rowId: "value", column: c.place },
      label: `${objectId} value of the ${c.place.replace("_", " ")} digit`,
      writable: !c.pad && !state.values[c.place],
      value: state.values[c.place] ? valueText(c.digit, c.place) : null,
      rect: colRect(state, i, R.value),
    });
  });
  const full = (row: { y: number; h: number }): Rect => ({ x: PAD, y: row.y, w: width(state) - 2 * PAD, h: row.h });
  out.push({ target: { objectId, part: "row", rowId: "equation" }, label: `${objectId} equation`, writable: state.equation === null, value: state.equation?.text ?? null, rect: full(R.equation) });
  out.push({ target: { objectId, part: "row", rowId: "answer" }, label: `${objectId} answer`, writable: state.answer === null, value: state.answer?.text ?? null, rect: full(R.answer) });
  return out;
}

function put(state: PlaceChartState, target: Target, value: string | undefined, ink: Ink | undefined, ctx: Ctx): PlaceChartState | RefusalBody {
  if (value === undefined) return refuse("invalid_command", "Put in a place chart needs the value to write: the core checks it.");
  if (target.part === "row") {
    if (target.rowId === "equation") {
      if (state.equation) return refuse("already_written", "The equation row is already written.");
      if (!allowedEquations(state).includes(value)) return refuse("wrong_value", `"${value}" is not a true sentence about this number: the chart writes only its own.`);
      return { ...state, equation: { text: value, seq: ctx.seq, ink: ink ?? "blue" } };
    }
    if (target.rowId === "answer") {
      if (state.answer) return refuse("already_written", "The answer is already written.");
      if (!/^[\w.,]{1,12}$/.test(value)) return refuse("invalid_command", "The answer is a short number or word.");
      return { ...state, answer: { text: value, seq: ctx.seq, ink: ink ?? "green" } };
    }
    return refuse("unknown_target", `There is no row "${target.rowId}".`);
  }
  if (target.part !== "cell") return refuse("not_writable", "Put writes in a cell of the digits or the value row, or in the equation or answer row.");
  const i = idx(state, target.column);
  if (i < 0) return refuse("unknown_target", `This chart has no ${target.column.replace("_", " ")} column.`);
  const c = state.columns[i];
  if (c.pad) return refuse("not_writable", `The number has no ${c.place.replace("_", " ")} digit: that column stays empty.`);
  if (target.rowId === "digits") {
    if (state.mode !== "build") return refuse("not_writable", "The digits of this number are already written.");
    if (state.digits[c.place]) return refuse("already_written", `The ${c.place} digit is already written.`);
    if (value !== String(c.digit)) return refuse("wrong_value", `The ${c.place.replace("_", " ")} digit is ${c.digit}, not ${value}.`);
    return { ...state, digits: { ...state.digits, [c.place]: { seq: ctx.seq, ink: ink ?? "green" } } };
  }
  if (target.rowId === "value") {
    if (state.values[c.place]) return refuse("already_written", `The value of the ${c.place.replace("_", " ")} digit is already written.`);
    if (state.mode === "build" && !state.digits[c.place]) return refuse("not_allowed", "Write the digit before its value.");
    if (value !== valueText(c.digit, c.place)) return refuse("wrong_value", `The value of the ${c.place.replace("_", " ")} digit is ${valueText(c.digit, c.place)}, not ${value}.`);
    return { ...state, values: { ...state.values, [c.place]: { seq: ctx.seq, ink: ink ?? "green" } } };
  }
  return refuse("unknown_target", `There is no row "${target.rowId}".`);
}

function draw(state: PlaceChartState, objectId: string, ctx: Ctx): LocalStroke[] {
  const R = rowsOf(state);
  const out: LocalStroke[] = [];
  const W = width(state);
  const frame = { objectId, layer: "math" as const, seq: state.seq, ink: "black" as Ink, target: null, kind: "rule" as const };
  const rule = (key: string, pts: [number, number][], width = 0.05) => out.push({ ...frame, key, width, pts });
  const top = TOP;
  // The frame holds the names and the digit row. The value row's frame is drawn with the first value (own stroke keys, so
  // nothing already on the board changes).
  const split = R.digits.y + R.digits.h + 0.1;
  const withValues = Object.keys(state.values).length > 0;
  const bottom = split;
  const pointX = hasPoint(state) ? colX(state, nOnes(state) + 1) - POINT_W : null;
  const edge = (i: number) => (i === 0 ? PAD : i === state.columns.length ? W - PAD : colX(state, i) - (pointX !== null && i === nOnes(state) + 1 ? POINT_W : 0));
  rule("rule/top", [[PAD, top], [W - PAD, top]], 0.04);
  rule("rule/names", [[PAD, R.digits.y - 0.12], [W - PAD, R.digits.y - 0.12]]);
  if (state.mode === "build") rule("rule/parts", [[PAD, R.parts.y - 0.05], [W - PAD, R.parts.y - 0.05]], 0.03);
  rule("rule/bottom", [[PAD, bottom], [W - PAD, bottom]], 0.04);
  for (let i = 0; i <= state.columns.length; i++) rule(`rule/col/${i}`, [[edge(i), top], [edge(i), bottom]], i === 0 || i === state.columns.length ? 0.04 : 0.03);
  if (pointX !== null) {
    rule("rule/col/point", [[pointX + POINT_W, top], [pointX + POINT_W, bottom]], 0.03);
    out.push(...glyphStrokes(ctx.glyphs, ".", { x: pointX, y: R.digits.y, w: POINT_W, h: R.digits.h }, { objectId, layer: "math", seq: state.seq, width: 0.13, ink: "black", target: null }, "point"));
  }
  if (withValues) {
    const vBottom = R.value.y + R.value.h;
    rule("vrow/bottom", [[PAD, vBottom], [W - PAD, vBottom]], 0.04);
    for (let i = 0; i <= state.columns.length; i++) rule(`vrow/col/${i}`, [[edge(i), bottom], [edge(i), vBottom]], i === 0 || i === state.columns.length ? 0.04 : 0.03);
    if (pointX !== null) rule("vrow/col/point", [[pointX + POINT_W, bottom], [pointX + POINT_W, vBottom]], 0.03);
  }
  state.columns.forEach((c, i) => {
    const base = { objectId, layer: "math" as const, seq: state.seq, ink: "black" as Ink, width: SMALL_WIDTH };
    const [first, second] = NAME_LINES[c.place];
    const nameBox = (text: string, y: number): Rect => {
      const adv = Math.min(0.36, (COL_W - 0.3) / Math.max(text.length, 1));
      const w = adv * text.length;
      return { x: colX(state, i) + (COL_W - w) / 2, y, w, h: 0.5 };
    };
    const target = { objectId, part: "column" as const, column: c.place };
    if (first) out.push(...glyphStrokes(ctx.glyphs, first, nameBox(first, R.names.y), { ...base, target }, `name/${c.place}/0`));
    out.push(...glyphStrokes(ctx.glyphs, second, nameBox(second, R.names.y + 0.55), { ...base, target }, `name/${c.place}/1`));
    const d = state.digits[c.place];
    if (d) {
      const w = 1.2;
      out.push(...glyphStrokes(ctx.glyphs, String(c.digit), { x: colX(state, i) + (COL_W - w) / 2, y: R.digits.y, w, h: R.digits.h }, { ...base, width: DIGIT_WIDTH * 1.2, ink: d.ink, seq: d.seq, target: { objectId, part: "cell", rowId: "digits", column: c.place } }, `digit/${c.place}`));
    }
    if (state.mode === "build" && !c.pad) {
      // The parts row: "5 wholes", "8 tenths". It names the parts the child puts together; it never shows the number.
      const text = `${c.digit} ${PART_WORD[c.place][c.digit === 1 ? 0 : 1]}`;
      const adv = Math.min(0.34, (COL_W - 0.6) / text.length);
      out.push(...glyphStrokes(ctx.glyphs, text, { x: colX(state, i) + (COL_W - adv * text.length) / 2, y: R.parts.y + 0.1, w: adv * text.length, h: 0.6 }, { ...base, ink: "blue", width: SMALL_WIDTH + 0.01, target: { objectId, part: "cell", rowId: "parts", column: c.place } }, `part/${c.place}`));
    }
    const v = state.values[c.place];
    if (v) {
      const text = shownValue(valueText(c.digit, c.place));
      const adv = Math.min(0.55, (COL_W - 0.3) / text.length);
      out.push(...glyphStrokes(ctx.glyphs, text, { x: colX(state, i) + (COL_W - adv * text.length) / 2, y: R.value.y + 0.15, w: adv * text.length, h: 0.8 }, { ...base, width: DIGIT_WIDTH, ink: v.ink, seq: v.seq, target: { objectId, part: "cell", rowId: "value", column: c.place } }, `value/${c.place}`));
    }
  });
  const line = (row: { y: number; h: number }, text: string, ink: Ink, seq: number, key: string, adv: number) => {
    const w = Math.min(W - 2 * PAD - 0.4, adv * text.length);
    const a = w / text.length;
    out.push(...glyphStrokes(ctx.glyphs, text, { x: (W - w) / 2, y: row.y + 0.1, w, h: row.h - 0.2 }, { objectId, layer: "math", seq, ink, width: DIGIT_WIDTH, target: { objectId, part: "row", rowId: key } }, key + String(a > 0)));
  };
  if (state.equation) line(R.equation, state.equation.text, state.equation.ink, state.equation.seq, "equation", 0.5);
  if (state.answer) line(R.answer, state.answer.text, state.answer.ink, state.answer.seq, "answer", 0.6);
  return out;
}

export const placeChart: Representation<PlaceChartState, PlaceChartCommand> = { op: "place_chart", create, targets, put, draw };
void rowLabel;
