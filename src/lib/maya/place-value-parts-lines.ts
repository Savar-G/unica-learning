// Maya's lines and board offers for B1b's place-value asks: compare, sum and tenths build (design:
// .design/research/maya-place-value-design.md, sections 3 and 4; wordings in place-value-parts-templates.ts). Every line
// is filled from the checked package, never from the model. placeValueLines (place-value-lines.ts) builds B1a's set and
// hands it here for these asks; this file changes only the lines whose meaning differs. Pure TypeScript.
import { valueText, type OperationPackage, type Place, type WorkedStep } from "@/lib/question-package";
import { buildParts, buildValue, partsOf, partsText, type BuildOperation, type PartsOperation, type TwoPlaces } from "@/lib/question-package-place-parts";
import { placeIndex, withCommas, WHOLE_PLACES } from "@/lib/question-package-place-value";
import type { Command, Place as BoardPlace } from "@/lib/board";
import type { LineId, LineOffer, PackageLines, Slots } from "./lines";
import type { PlaceBoardOffer, PlaceValueTemplateKey } from "./place-value-lines";

type Vars = Record<string, string | number>;
/** How place-value-lines.ts makes an offer from a template; passed in, so this module does not import it at run time. */
export type MakePlaceOffer = (line: LineId, key: PlaceValueTemplateKey, vars: Vars, extra?: Omit<LineOffer, "line" | "texts" | "key">) => LineOffer;

const UNIT: Record<string, string> = {
  ones: "one", tens: "ten", hundreds: "hundred", thousands: "thousand", "ten thousands": "ten thousand", "hundred thousands": "hundred thousand", millions: "million",
};
const ORDINAL = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"];
const countTo = (k: number) => WHOLE_PLACES.slice(0, k + 1).join(", ");

/** The words of one digit's place, for B1a's digit lines: "the thousands place is the fourth from the right". */
function placeVars(number: number, place: Place, digit: number): Vars {
  const k = placeIndex(place);
  return { number: withCommas(number), place, unit: UNIT[place], perOne: withCommas(10 ** k), digit, count: countTo(k), ordinal: ORDINAL[k], value: withCommas(digit * 10 ** k) };
}

/** "6 is bigger than 4.", "3 is smaller than 7.", "5 and 5 are the same." */
const compareSentence = (a: number, b: number) => (a > b ? `${a} is bigger than ${b}.` : a < b ? `${a} is smaller than ${b}.` : `${a} and ${b} are the same.`);
const relation = (a: number, b: number) => (a > b ? ">" : a < b ? "<" : "=");

/** The vars of a compare or a sum. */
function twoVars(op: TwoPlaces): Vars {
  const p = partsOf(op);
  return {
    number: withCommas(p.n), pa: op.place, pb: op.second, a: p.a, b: p.b, hi: Math.max(p.a, p.b), lo: Math.min(p.a, p.b),
    cmp: compareSentence(p.a, p.b), cmpLower: compareSentence(p.a, p.b), va: withCommas(p.valueA), vb: withCommas(p.valueB),
    answer: withCommas(p.valueA + p.valueB),
  };
}
function buildVars(op: BuildOperation): Vars {
  const [w, t] = op.operands;
  return { w, t, wp: `${w} ${w === 1 ? "whole" : "wholes"}`, tp: `${t} ${t === 1 ? "tenth" : "tenths"}`, answer: String(buildValue(op)) };
}

/** The compare question in words, ending with its two words: "Is the hundreds digit of 375 bigger than its tens digit? True or false?" */
const compareAsk = (op: TwoPlaces) => `Is the ${op.place} digit of ${withCommas(op.operands[0])} bigger than its ${op.second} digit? True or false?`;

/**
 * B1b's lines, laid over B1a's set (`pv`) for a compare, sum or build. `shared` is lines.ts's own set for the package,
 * for the lines whose shared wording fits ("Not quite. Let's look at this answer again.").
 */
export function placePartsLines(pkg: OperationPackage & { operation: PartsOperation }, pv: PackageLines, shared: PackageLines, offer: MakePlaceOffer): PackageLines {
  const op = pkg.operation;
  const ex = pkg.easierExample.operation as PartsOperation;
  const steps = pkg.steps.filter((s) => s.kind !== "result");
  const answer = pkg.answer.value;
  // A wording that says the answer as a number is left out of every line said before it stands (as B1a's `safe`).
  const safe = (offers: LineOffer[]): LineOffer[] => offers.map((o) => {
    const keep = o.texts.map((_, i) => i).filter((i) => answer.type !== "number" || !o.texts[i].includes(valueText(answer)) && !o.texts[i].includes(withCommas(answer.value)));
    return { ...o, texts: keep.map((i) => o.texts[i]), wordingIds: keep.map((i) => o.wordingIds?.[i] ?? `${o.key}#${i}`) };
  }).filter((o) => o.texts.length > 0);
  const at = (id: string, level: 0 | 1 | 2 | 3): Pick<LineOffer, "slots" | "level"> => ({ slots: { step: id } as Slots, level });
  const vars: Vars = op.ask === "build" ? buildVars(op) : twoVars(op);
  const chartOpen = op.ask === "build" ? offer("chart.open", "chart.open.parts", vars)
    : offer("chart.open", op.ask === "compare" ? "chart.open.blank" : "chart.open", { number: vars.number });

  const stepHelp = (step: WorkedStep): LineOffer[] => {
    const id = step.id;
    if (step.kind === "read-digit") {
      const v = placeVars(op.operands[0], step.place, step.digit);
      return [
        offer("step.invite", "invite.place", v, at(id, 0)),
        offer("step.point", "point.place", v, at(id, 1)),
        offer("step.why", "where.place", v, at(id, 1)),
        // No stripe and no circle in a compare: the child counts on their own page (the digits decide the word).
        offer("step.operation", "operation.place.count", v, at(id, 2)),
        offer("step.show", "show.place", { show: `The digit in the ${step.place} place is ${step.digit}.` }, at(id, 3)),
        { ...chartOpen, ...at(id, 0) },
      ];
    }
    if (step.kind === "bigger") {
      return [
        offer("step.invite", "invite.bigger", vars, at(id, 0)),
        offer("step.point", "point.bigger", vars, at(id, 1)),
        offer("step.why", "why.bigger", vars, at(id, 1)),
        offer("step.operation", "operation.bigger", vars, at(id, 2)),
        offer("step.show", "show.bigger", { show: `${step.bigger} is bigger than ${step.bigger === step.a ? step.b : step.a}.` }, at(id, 3)),
      ];
    }
    if (step.kind === "place-worth") {
      const v = placeVars(op.operands[0], step.place, step.digit);
      const one = step.digit === 1 ? ".one" : "";
      return [
        offer("step.invite", `invite.worth${one}` as PlaceValueTemplateKey, v, at(id, 0)),
        offer("step.point", `point.worth${one}` as PlaceValueTemplateKey, v, at(id, 1)),
        offer("step.why", `why.worth${one}` as PlaceValueTemplateKey, v, at(id, 1)),
        offer("step.operation", `operation.worth${one}` as PlaceValueTemplateKey, v, at(id, 2)),
        offer("step.show", "show.worth", { show: `The ${step.digit} in the ${step.place} place is worth ${v.value}.` }, at(id, 3)),
        { ...chartOpen, ...at(id, 0) },
      ];
    }
    return [];
  };
  // The last step has no H3: its H3 would be the answer.
  const resultHelp = (): LineOffer[] => {
    if (op.ask === "compare") {
      return [
        offer("step.invite", "invite.compare", vars, at("result", 0)), offer("step.point", "point.compare", vars, at("result", 1)),
        offer("step.why", "why.compare", vars, at("result", 1)), offer("step.operation", "operation.compare", vars, at("result", 2)),
      ];
    }
    if (op.ask === "sum") {
      return safe([
        offer("step.invite", "invite.sum", vars, at("result", 0)), offer("step.point", "point.sum", vars, at("result", 1)),
        offer("step.why", "why.sum", vars, at("result", 1)), offer("step.operation", "operation.sum", vars, at("result", 2)),
      ]);
    }
    return safe([
      offer("step.invite", "invite.build", vars, at("result", 0)), offer("step.point", "point.build", vars, at("result", 1)),
      offer("step.why", "why.build", vars, at("result", 1)), offer("step.operation", "operation.build", vars, at("result", 2)),
      { ...chartOpen, ...at("result", 0) },
    ]);
  };
  const rightStep = (id: string): LineOffer[] => {
    const step = steps.find((s) => s.id === id);
    const requires = { answer: "right" as const, step: id };
    if (step?.kind === "read-digit") {
      const v = placeVars(op.operands[0], step.place, step.digit);
      return [offer("check.right_step", step.digit === 0 ? "right.digit.zero" : "right.digit", v, { slots: { step: id }, requires })];
    }
    if (step?.kind === "bigger") return [offer("check.right_step", "right.bigger", vars, { slots: { step: id }, requires })];
    if (step?.kind === "place-worth") return [offer("check.right_step", "right.worth", placeVars(op.operands[0], step.place, step.digit), { slots: { step: id }, requires })];
    return [];
  };
  const notYet = (id: string): LineOffer[] => {
    const step = steps.find((s) => s.id === id);
    const requires = { answer: "wrong" as const, step: id };
    if (step?.kind === "read-digit") return [offer("check.not_yet", "notyet.place", placeVars(op.operands[0], step.place, step.digit), { slots: { step: id }, requires })];
    if (step?.kind === "bigger") return [offer("check.not_yet", "notyet.bigger", vars, { slots: { step: id }, requires })];
    if (step?.kind === "place-worth") return [offer("check.not_yet", "notyet.worth", placeVars(op.operands[0], step.place, step.digit), { slots: { step: id }, requires })];
    if (id !== "result") return [];
    // The targeted line for one wrong answer, by its heard slot: the two digits added (a sum), the point left out (a build).
    const targeted = (key: PlaceValueTemplateKey, heard: number): LineOffer =>
      offer("check.not_yet", key, vars, { slots: { step: "result", heard: valueText({ type: "number", value: heard }) }, requires: { answer: "wrong", step: "result", heard: valueText({ type: "number", value: heard }) } });
    if (op.ask === "sum") {
      const p = partsOf(op);
      return [...safe(shared.notYet("result")), ...(p.a + p.b !== p.valueA + p.valueB ? [targeted("fix.sum.digits", p.a + p.b)] : [])];
    }
    if (op.ask === "build") return [offer("check.not_yet", "notyet.build", vars, { slots: { step: "result" }, requires: { answer: "wrong", step: "result" } }), targeted("fix.build.point", op.operands[0] * 10 + op.operands[1])];
    return shared.notYet("result");
  };
  const answerKey: PlaceValueTemplateKey = op.ask === "compare" ? "answer.compare" : op.ask === "sum" ? "answer.sum" : "answer.build";
  const answerWord = answer.type === "choice" ? answer.value : "";
  const exampleStep = (id: string): LineOffer[] => {
    const step = pkg.easierExample.steps.find((s) => s.id === id);
    if (!step) return [];
    const slots = { step: id };
    if (step.kind === "read-digit") return [offer("example.step", "example.digit", placeVars(ex.operands[0], step.place, step.digit), { slots })];
    if (step.kind === "bigger") return [offer("example.step", "example.bigger", { show: `${step.bigger} is bigger than ${step.bigger === step.a ? step.b : step.a}.` }, { slots })];
    if (step.kind === "place-worth") return [offer("example.step", "example.worth", placeVars(ex.operands[0], step.place, step.digit), { slots })];
    if (ex.ask === "compare") return [offer("example.step", "example.compare", { word: valueText(pkg.easierExample.answer) }, { slots })];
    if (ex.ask === "sum") return [offer("example.step", "example.sum", twoVars(ex), { slots })];
    return [offer("example.step", "example.build", buildVars(ex as BuildOperation), { slots })];
  };
  return {
    ...pv,
    question: (): LineOffer[] => op.ask === "build" ? pv.question()
      : [offer("question.problem", op.ask === "compare" ? "question.compare" : "question.sum", vars), ...shared.question().filter((o) => o.line === "question.read")],
    exampleIntro: (): LineOffer[] => (ex.ask === "compare"
      ? [offer("example.intro", "example.intro.compare", { ask: compareAsk(ex) })]
      : ex.ask === "sum"
        ? [offer("example.intro", "example.intro.sum", { ask: `the ${ex.place} value plus the ${ex.second} value of ${withCommas(ex.operands[0])}` })]
        : safe(shared.exampleIntro())),
    exampleStep,
    assess: (): LineOffer[] => [offer("assess.ask", "assess.parts", {})],
    help: (id: string): LineOffer[] => (id === "result" ? resultHelp() : (() => {
      const step = steps.find((s) => s.id === id);
      return step ? stepHelp(step) : [];
    })()),
    rightStep,
    notYet,
    explain: () => [],
    // The honest close (brief lesson 10): hard, fine to stop, one next step; never the answer.
    closeUnsolved: (): LineOffer[] => [offer("close.honest", "close.hard", {})],
    answerRight: (): LineOffer[] => [offer("answer.right", answerKey, { ...vars, word: answerWord })],
    stepIds: steps.map((s) => s.id),
  };
}

const chartPlace = (p: Place) => p.replace(" ", "_");
const asCommand = (c: Record<string, unknown>) => c as unknown as Command;

/** The place_chart command a B1b question's chart is: blank for a compare (no digits until the word stands). */
export function partsChart(op: PartsOperation, id: string, place: BoardPlace): Command {
  if (op.ask === "build") return asCommand({ op: "place_chart", id, parts: [{ place: "ones", digit: String(op.operands[0]) }, { place: "tenths", digit: String(op.operands[1]) }], place });
  return asCommand({ op: "place_chart", id, number: String(op.operands[0]), ...(op.ask === "compare" && id === "question" ? { blank: true } : {}), place });
}

/** A chart command shows this B1b problem: its own number, or a build's own parts. */
export function partsChartFits(c: Record<string, unknown>, op: PartsOperation): boolean {
  if (op.ask !== "build") return c.number === String(op.operands[0]) && c.parts === undefined;
  const parts = c.parts as { place?: unknown; digit?: unknown }[] | undefined;
  return c.number === undefined && Array.isArray(parts) && parts.length === 2 &&
    parts[0]?.place === "ones" && parts[0]?.digit === String(op.operands[0]) && parts[1]?.place === "tenths" && parts[1]?.digit === String(op.operands[1]);
}

/**
 * The board offers of a B1b question for an act: the chart; a sum's stripe and circle in the turn a line asks for them,
 * and a step's value once the child said it; a build's two stripes; and with the accepted answer, its checked marks: a
 * compare's two digits, both columns striped and "8 > 2" (screen c, approved), a build's digits, and the answer row.
 */
export function placePartsBoardOffers(input: {
  pkg: OperationPackage & { operation: PartsOperation };
  act: string;
  roles: Readonly<Record<string, string>>;
  batch: number;
  chosen: readonly LineOffer[];
}): PlaceBoardOffer[] {
  const { pkg, act, roles, chosen } = input;
  const out: PlaceBoardOffer[] = [];
  const has = (id: string) => Object.hasOwn(roles, id);
  const mark = (objectId: string, target: Record<string, unknown>, style: "highlight" | "circle", i: number): Command =>
    asCommand({ op: "mark", id: `pv-${input.batch + 1}-${i}`, target: { objectId, ...target }, style });
  const band = (objectId: string, place: Place, i: number) => mark(objectId, { part: "piece", piece: `band-${chartPlace(place)}` }, "highlight", i);
  const put = (objectId: string, target: Record<string, unknown>, value: string) => asCommand({ op: "put", target: { objectId, ...target }, value });
  if (act === "example_step") {
    const ex = pkg.easierExample.operation as PartsOperation;
    if (!has("example")) out.push({ id: "example.chart", shows: `a place-value chart of the easier example, ${partsText(ex)}`, commands: (place) => [partsChart(ex, "example", place)] });
    return out;
  }
  const op = pkg.operation;
  const fits = op.ask === "build" || String(op.operands[0]).length <= 6;
  if (!has("question") && fits) {
    out.push({ id: "question.chart", shows: op.ask === "compare" ? `a place-value chart of the places of ${withCommas(op.operands[0])}, with no digits written` : `a place-value chart of ${op.ask === "build" ? buildParts(op) : withCommas(op.operands[0])}`, commands: (place) => [partsChart(op, "question", place)] });
  }
  const keys = chosen.map((o) => o.key as string);
  const stepOf = (keyList: readonly string[]) => {
    const o = chosen.find((c) => keyList.includes(c.key as string));
    return o ? pkg.steps.find((s) => s.id === o.slots.step) : undefined;
  };
  if (op.ask === "sum") {
    const banded = stepOf(["point.worth", "point.worth.one"]);
    if (banded?.kind === "place-worth") out.push({ id: "question.band", shows: `color the ${banded.place} place on the chart`, commands: () => [band("question", banded.place, 0)] });
    const circled = stepOf(["operation.worth", "operation.worth.one"]);
    if (circled?.kind === "place-worth") out.push({ id: "question.circle", shows: `circle the digit in the ${circled.place} place`, commands: () => [mark("question", { part: "cell", rowId: "digits", column: chartPlace(circled.place) }, "circle", 1)] });
    const right = stepOf(["right.worth"]);
    if (right?.kind === "place-worth") out.push({ id: "question.value", shows: `write ${withCommas(right.value)}, the value the child said, in the ${right.place} column`, commands: () => [put("question", { part: "cell", rowId: "value", column: chartPlace(right.place) }, String(right.value))] });
  }
  if (op.ask === "build" && keys.includes("point.build")) {
    out.push({ id: "question.band", shows: "color the ones place and the tenths place", commands: () => [band("question", "ones", 0), band("question", "tenths", 1)] });
  }
  if (chosen.some((o) => o.line === "answer.right")) {
    let commands: Command[];
    if (op.ask === "compare") {
      const p = partsOf(op);
      const word = pkg.answer.value.type === "choice" ? pkg.answer.value.value : "";
      commands = [
        put("question", { part: "cell", rowId: "digits", column: chartPlace(op.place) }, String(p.a)),
        put("question", { part: "cell", rowId: "digits", column: chartPlace(op.second) }, String(p.b)),
        band("question", op.place, 2), band("question", op.second, 3),
        put("question", { part: "row", rowId: "equation" }, `${p.a} ${relation(p.a, p.b)} ${p.b}`),
        put("question", { part: "row", rowId: "answer" }, word),
      ];
    } else if (op.ask === "build") {
      commands = [
        put("question", { part: "cell", rowId: "digits", column: "ones" }, String(op.operands[0])),
        put("question", { part: "cell", rowId: "digits", column: "tenths" }, String(op.operands[1])),
        put("question", { part: "row", rowId: "answer" }, String(buildValue(op))),
      ];
    } else {
      commands = [put("question", { part: "row", rowId: "answer" }, withCommas(partsOf(op).valueA + partsOf(op).valueB))];
    }
    out.push({ id: "question.answer", shows: `write the checked answer on the chart`, commands: () => commands });
  }
  return out;
}

