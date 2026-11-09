// Place value, B1b (design: .design/research/maya-place-value-design.md, section 2): what a stored compare, sum or
// tenths-build workbook question asks, worked out from the stored package only when the same four things agree as for
// B1a's digit and value asks (place-value.ts). A question that fails any check stays held, with the reason. Nothing here
// changes the stored package or the printed book.
// 1. the template key, from an exact allow-list, gives the ask;
// 2. the printed text matches one closed form, which gives the number (or the wholes and tenths) and the places;
// 3. the template's own expressions, run by B1a's `evaluate` on the stored slot values, give the printed number
//    (`derived` first) and an answer whose expression has the ask's shape for the printed places;
// 4. code's result from the printed text equals that answer and the stored answer key.
// Pure TypeScript: no clock, network or randomness, no `eval` and no `Function`.
import type { Place, QuestionPackage } from "@/lib/question-package";
import { digitAt, MAX_PLACE_NUMBER, placeIndex, WHOLE_PLACES } from "@/lib/question-package-place-value";
import { evaluate, type ExprValue } from "./place-value";

/** What a B1b question asks, as all four agreements found it. */
export type PlacePartsObject =
  | { ask: "compare"; number: number; place: Place; second: Place; answer: "true" | "false" }
  | { ask: "sum"; number: number; place: Place; second: Place; answer: number }
  | { ask: "build"; wholes: number; tenths: number; answer: number };

type Held = { held: string };
const held = (why: string): Held => ({ held: why });

/** Agreement 1: the template keys taught here, and the ask each gives. */
const KEYS: { re: RegExp; ask: PlacePartsObject["ask"] }[] = [
  { re: /^5\.1-place-value-million#[123]\.5:true-false$/, ask: "compare" },
  { re: /^5\.1-place-value-million#[123]\.7:bare$/, ask: "sum" },
  { re: /^4\.2-tenths#3\.1:bare$/, ask: "build" },
];

const PLACE_WORDS = [...WHOLE_PLACES].sort((a, b) => b.length - a.length).join("|");
const NUMBER = "([1-9]\\d{0,6})";
/** Agreement 2: the printed forms, each whole. */
const FORMS: { ask: PlacePartsObject["ask"]; re: RegExp; number: number; place: number; second: number }[] = [
  { ask: "compare", number: 1, place: 2, second: 3, re: new RegExp(`^True or false: in ${NUMBER}, the digit in the (${PLACE_WORDS}) place is bigger than the digit in the (${PLACE_WORDS}) place\\.$`) },
  { ask: "sum", number: 1, place: 2, second: 3, re: new RegExp(`^In ${NUMBER}, what is the value of the (${PLACE_WORDS}) digit plus the value of the (${PLACE_WORDS}) digit\\?$`) },
  { ask: "sum", number: 2, place: 1, second: 3, re: new RegExp(`^What is the value of the (${PLACE_WORDS}) digit of ${NUMBER} plus the value of its (${PLACE_WORDS}) digit\\?$`) },
];
const BUILD_FORM = /^([1-9]) (wholes?) and ([1-9]) (tenths?) is \? as a decimal\.$/;

/** Agreement 3: the answer expression's shape, with the two powers of ten. */
const COMPARE_SHAPE = /^'true' if n \/\/ (1(?:0{1,6})) % 10 > n \/\/ (1(?:0{0,6})) % 10 else 'false'$/;
const SUM_SHAPE = /^n \/\/ (1(?:0{1,6})) % 10 \* (1(?:0{1,6})) \+ n \/\/ (1(?:0{0,6})) % 10 \* (1(?:0{0,6}))$/;
const BUILD_EXPRESSION = "round(w + p / 10, 1)";

const isNum = (v: ExprValue | undefined): v is { num: bigint; den: bigint } => typeof v === "object" && v !== null;
const int = (n: bigint): ExprValue => ({ num: n, den: BigInt(1) });

/** The slot values and derived values of a template source, or why not. */
function namesOf(src: { slots: { name: string; value: unknown }[]; derived: [string, string][]; check: string | null }): Map<string, ExprValue> | Held {
  const names = new Map<string, ExprValue>();
  for (const slot of src.slots) {
    const v = slot.value as { int?: unknown };
    if (typeof v?.int !== "string" || !/^-?\d{1,16}$/.test(v.int)) return held(`the slot ${slot.name} is not a whole number`);
    names.set(slot.name, int(BigInt(v.int)));
  }
  for (const [name, expression] of src.derived) {
    if (names.has(name)) return held(`the derived value ${name} names a slot again`);
    const r = evaluate(expression, names);
    if ("refused" in r) return held(`the derived value ${name}: ${r.refused}`);
    names.set(name, r.value);
  }
  if (src.check !== null) {
    const r = evaluate(src.check, names);
    if ("refused" in r || r.value !== true) return held("the stored numbers do not pass the template's check");
  }
  return names;
}

/**
 * What a stored compare, sum or tenths-build question asks, when the template key, the printed text, the template's
 * expressions and code's own result all agree; otherwise why it stays held, or null for a template that is not one of
 * these (B1a's or another deriver's).
 */
export function placePartsOf(raw: QuestionPackage): PlacePartsObject | Held | null {
  const key = KEYS.find((k) => k.re.test(raw.templateId ?? ""));
  if (!key) return null;
  if (raw.operation !== null || raw.answer !== null || raw.easierExample !== null || raw.steps.length > 0 || raw.wrongAnswers.length > 0) {
    return held("the stored question already has teaching data");
  }
  const item = raw.item;
  if (!item || item.checks.length !== 1) return held("the item has not one check");
  const check = item.checks[0];
  if (check.kind !== "template" && check.kind !== "template-choice") return held("the item's check is not a template check");
  const src = check.source;
  if (src.values !== null || (src.labels ?? null) !== null) return held("the template source has values or labels a place-value template does not use");
  const names = namesOf(src);
  if ("held" in names) return names;
  const evaluated = evaluate(src.answer, names);
  if ("refused" in evaluated) return held(`the answer expression: ${evaluated.refused}`);
  const ev = evaluated.value;
  const answerText = src.answer.trim().replace(/\s+/g, " ");

  if (key.ask === "build") {
    // A build: a box, the slots w and p, no derived values, and the one expression.
    const region = item.regions.length === 1 ? item.regions[0] : null;
    if (check.kind !== "template" || region?.kind !== "box" || check.region !== region.id) return held("the item's check is not the template's answer box");
    const m = BUILD_FORM.exec(raw.text);
    if (!m) return held("the printed text is not the tenths form");
    const [w, t] = [Number(m[1]), Number(m[3])];
    if ((w === 1) !== (m[2] === "whole") || (t === 1) !== (m[4] === "tenth")) return held("the printed words do not agree with their numbers");
    if (src.derived.length !== 0 || src.slots.length !== 2) return held("the template has other values than the wholes and the tenths");
    const sw = names.get("w");
    const sp = names.get("p");
    if (!isNum(sw) || !isNum(sp) || sw.num !== BigInt(w) || sp.num !== BigInt(t) || sw.den !== BigInt(1) || sp.den !== BigInt(1)) return held("the template's numbers are not the printed numbers");
    if (answerText !== BUILD_EXPRESSION) return held("the answer expression is not the tenths build");
    // 4. code's tenths, the expression's value and the key: 10w + t tenths, exactly.
    const tenths = w * 10 + t;
    if (!isNum(ev) || ev.num * BigInt(10) !== BigInt(tenths) * ev.den) return held("the template's answer is not code's result");
    const k = region.answer;
    if (k?.type !== "number" || k.value !== tenths / 10) return held("the stored answer key is not code's result");
    return { ask: "build", wholes: w, tenths: t, answer: tenths / 10 };
  }

  const forms = FORMS.filter((f) => f.ask === key.ask).flatMap((f) => {
    const m = f.re.exec(raw.text);
    return m ? [{ number: Number(m[f.number]), place: m[f.place] as Place, second: m[f.second] as Place }] : [];
  });
  if (forms.length !== 1) return held("the printed text is not one of the place-value forms");
  const printed = forms[0];
  const ka = placeIndex(printed.place);
  const kb = placeIndex(printed.second);
  const length = String(printed.number).length;
  if (printed.number > MAX_PLACE_NUMBER || ka >= length || kb >= length || ka <= kb) return held("the printed places are not two places of the printed number, the higher first");
  const n = names.get("n");
  if (!isNum(n) || n.den !== BigInt(1) || n.num !== BigInt(printed.number)) return held("the template's number is not the printed number");
  const a = digitAt(printed.number, ka);
  const b = digitAt(printed.number, kb);

  if (key.ask === "compare") {
    const region = item.regions.length === 1 ? item.regions[0] : null;
    if (check.kind !== "template-choice" || region?.kind !== "choice" || check.region !== region.id) return held("the item's check is not the template's circled word");
    // Only the true/false pair, in that printed order (an allow-list): the word reader takes its two words from it.
    if (region.choices.length !== 2 || region.choices[0] !== "true" || region.choices[1] !== "false") return held("the circled words are not true and false");
    const shape = COMPARE_SHAPE.exec(answerText);
    if (!shape || shape[1].length - 1 !== ka || shape[2].length - 1 !== kb) return held("the answer expression is about other places than the printed text");
    const word = a > b ? "true" : "false";
    if (ev !== word) return held("the template's answer is not code's result");
    if (region.answer !== word) return held("the stored answer key is not code's result");
    return { ask: "compare", number: printed.number, place: printed.place, second: printed.second, answer: word };
  }

  const region = item.regions.find((r) => r.kind === "box");
  if (check.kind !== "template" || region?.kind !== "box" || check.region !== region.id || item.regions.some((r) => r.kind !== "box" && r.kind !== "work")) {
    return held("the item's check is not the template's answer box");
  }
  const shape = SUM_SHAPE.exec(answerText);
  if (!shape || [shape[1], shape[2]].some((p) => p.length - 1 !== ka) || [shape[3], shape[4]].some((p) => p.length - 1 !== kb)) {
    return held("the answer expression is about other places than the printed text");
  }
  // A 0 digit's value adds nothing: there is no second part to teach (and a hint would point at the answer's 0).
  if (a === 0 || b === 0) return held("a sum with a 0 digit has one part to teach");
  const sum = a * 10 ** ka + b * 10 ** kb;
  if (!isNum(ev) || ev.den !== BigInt(1) || ev.num !== BigInt(sum)) return held("the template's answer is not code's result");
  if (region.answer?.type !== "number" || region.answer.value !== sum) return held("the stored answer key is not code's result");
  return { ask: "sum", number: printed.number, place: printed.place, second: printed.second, answer: sum };
}
