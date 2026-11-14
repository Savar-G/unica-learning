// Maya's lines for a clock-time question (time-add, Maya coverage Wave C, C3c): "What time is 50 minutes after 6:13?"
// The package's checked worked steps count on: first to the next hour when the minutes pass it ("to-hour": 6:13 to
// 7:00 is 47 minutes), then the minutes left ("minutes": 3 more minutes after 7:00 is 7:03). Every time and number is
// filled from those steps. A time is said as the book prints it, the hour 1 to 12 then two minute digits ("7:03"); the
// package keeps the 24-hour clock with no period ("07:03"), so lines.ts says times through `clockSaid`.
// Every wording is new and waits for Savar's approval (D-202). Pure TypeScript.
import type { AnswerValue, Operation, OperationPackage, WorkedStep } from "@/lib/question-package";
import type { LineId, LineOffer, TemplateKey } from "./lines";

export const CLOCK_TEMPLATES = {
  // The count to the next hour. H1 names where to start and stop; H2 asks for the minutes; H3 shows them.
  "point.count.hour": [
    "Start at {from}. First count on to {to}, the next hour.", "Begin at {from}. Count on to the next hour, {to}.",
    "From {from}, go to the next hour first: {to}.", "Start at {from}. The next hour is {to}. Count on to it.",
    "Begin at {from}. First get to {to}.",
  ],
  "operation.count.hour": [
    "How many minutes from {from} to {to}?", "From {from} to {to} is how many minutes?", "Count the minutes from {from} to {to}.",
    "How many minutes does it take to get from {from} to {to}?", "What is the number of minutes from {from} to {to}?",
  ],
  "show.count.hour": [
    "From {from} to {to} is {minutes} minutes.", "It is {minutes} minutes from {from} to {to}.", "{from} to {to} is {minutes} minutes.",
    "Counting on from {from} to {to} takes {minutes} minutes.", "There are {minutes} minutes from {from} to {to}.",
  ],
  // The minutes left after the hour. {used}: the minutes the count to the hour already took.
  "point.count.rest": [
    "We used {used} of the {total} minutes. So {left} minutes are left.", "That took {used} minutes. {total} − {used} = {left} minutes left.",
    "{used} minutes are used. {left} of the {total} minutes are still left.", "We have {left} more minutes to count, after {from}.",
    "Take away the {used} minutes we used. {left} minutes are left.",
  ],
  "operation.count.rest": [
    "What time is {left} minutes after {from}?", "Count on {left} more minutes from {from}. What time is it?",
    "From {from}, count on {left} minutes. Where do you land?", "What is {left} minutes after {from}?",
    "Add {left} minutes to {from}. What time do you get?",
  ],
  // One count, when the minutes do not pass the next hour ("40 minutes after 9:00").
  "point.count.one": [
    "Start at {from}. The minutes go up by {minutes}.", "Begin at {from}. Add {minutes} to the minutes.",
    "From {from}, count on {minutes} minutes. The hour stays the same.", "Start at {from}. Count on {minutes} minutes.",
    "The hour stays {hour}. Count on {minutes} minutes from {from}.",
  ],
  // It asks for the time: only the time a one count reaches is credited, never its minutes, which the question prints
  // (review of #742, P3-b).
  "operation.count.one": [
    "The minutes start at {start}. Add {minutes}. What time is it?", "Work out {start} + {minutes}. What time does the clock show?",
    "{start} + {minutes} minutes past {hour}. What time is that?", "Add {minutes} to the {start} minutes. What time do you get?",
    "Count on {minutes} minutes from {from}. What time is it?",
  ],
} as const satisfies Record<string, readonly string[]>;

type Offer = (line: LineId, key: TemplateKey, vars: Record<string, string | number>, extra: Omit<LineOffer, "line" | "texts" | "key">) => LineOffer;
type CountOn = Extract<WorkedStep, { kind: "count-on" }>;

/** A clock time as the book prints it ("7:03"), for a time with no period and an hour 1 to 12; else null. */
export function clockSaid(v: AnswerValue): string | null {
  return v.type === "time" && v.period === null && v.hours >= 1 && v.hours <= 12 ? `${v.hours}:${String(v.minutes).padStart(2, "0")}` : null;
}

/** A time-add operation as the question says it: "50 minutes after 6:13"; null for any other operation. */
export function clockExpr(op: Operation): string | null {
  if (op.kind !== "time-add") return null;
  const [t, d] = op.operands;
  const at = clockSaid(t);
  return at && d.type === "quantity" && d.unit === "min" ? `${d.value} minutes after ${at}` : null;
}

/** What a count-on step is about, as Maya names it. */
export const clockWhere = (step: CountOn) => (step.id === "to-hour" ? "the next hour" : "the minutes");

/**
 * A clock-time step in words, for H3 and the easier example: a count ("47 minutes after 6:13 is 7:00.") or the result
 * ("50 minutes after 6:13 is 7:03", with no full stop, as every result's words). Null for any other step.
 */
export function clockShow(step: WorkedStep, op: Operation): string | null {
  if (step.kind === "result") {
    const [expr, value] = [clockExpr(op), clockSaid(step.value)];
    return expr && value ? `${expr} is ${value}` : null;
  }
  if (step.kind !== "count-on") return null;
  const [from, to] = [clockSaid(step.from), clockSaid(step.to)];
  return from && to ? `${step.minutes} minutes after ${from} is ${to}.` : null;
}

/** The H1 to H3 lines of a count-on step of a clock-time question, or null for any other step. */
export function clockHelp(pkg: OperationPackage, step: WorkedStep, offer: Offer): LineOffer[] | null {
  if (step.kind !== "count-on" || pkg.operation.kind !== "time-add") return null;
  const [from, to] = [clockSaid(step.from), clockSaid(step.to)];
  const d = pkg.operation.operands[1];
  if (!from || !to || d.type !== "quantity") return null;
  const slots = { step: step.id };
  const at = (line: LineId, key: TemplateKey, vars: Record<string, string | number>, level: 1 | 2 | 3) => offer(line, key, vars, { slots, level });
  if (step.id === "to-hour") {
    const vars = { from, to, minutes: step.minutes };
    return [at("step.point", "point.count.hour", vars, 1), at("step.operation", "operation.count.hour", vars, 2), at("step.show", "show.count.hour", vars, 3)];
  }
  const before = pkg.steps.find((s): s is CountOn => s.kind === "count-on" && s.id === "to-hour");
  if (before) {
    const vars = { from, used: before.minutes, total: d.value, left: step.minutes };
    return [at("step.point", "point.count.rest", vars, 1), at("step.operation", "operation.count.rest", vars, 2)];
  }
  const vars = { from, minutes: step.minutes, hour: `${step.from.hours} o'clock`, start: step.from.minutes };
  return [at("step.point", "point.count.one", vars, 1), at("step.operation", "operation.count.one", vars, 2)];
}

/**
 * The values that answer a count-on step (review of #742, P2-c and P3-b): the count to the next hour by its minutes only
 * (47), never the hour it reaches, which Maya says ("7:00"); the last count by the time it reaches only (7:03, 9:40):
 * its minutes are what Maya just said were left, or the question's own number.
 */
export const clockAnswers = (step: WorkedStep): AnswerValue[] =>
  step.kind !== "count-on" ? [] : step.id === "to-hour" ? [{ type: "number", value: step.minutes }] : [step.to];

/** The numbers and times a sentence about a count-on step may name: an hour's 60 minutes, and its start and stop. */
export const clockValues = (step: WorkedStep): AnswerValue[] =>
  step.kind === "count-on" ? [{ type: "number", value: 60 }, step.from, step.to] : [];
