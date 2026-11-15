// The clock-time kind of the tutor core (D-345, F5): "What time is 50 minutes after 6:13?", worked by counting on to
// the next hour, the whole hours, then the minutes ("count-on" steps). Clock times are not numbers the core reads, so
// this kind reads every clock time in Maya's sentence itself: a sentence with a clock time it cannot check is refused.
import type { ClockTime, OperationPackage, WorkedStep } from "@/lib/question-package";
import type { TutorKind, TutorStepFact } from "../tutor-kind";

type CountOn = Extract<WorkedStep, { kind: "count-on" }>;

const DAY = 24 * 60;
const minutesOf = (t: ClockTime) => t.hours * 60 + t.minutes;
const clockText = (t: ClockTime) => `${t.hours}:${String(t.minutes).padStart(2, "0")}`;
const textOfMinutes = (m: number) => `${Math.floor((m % DAY) / 60)}:${String(m % 60).padStart(2, "0")}`;
const amount = (m: number) => (m % 60 === 0 && m > 0 ? `${m / 60} ${m === 60 ? "hour" : "hours"}` : `${m} ${m === 1 ? "minute" : "minutes"}`);

/** The amount of time added, in minutes, or null when code cannot read it as whole minutes. */
function durationMinutes(pkg: OperationPackage): number | null {
  if (pkg.operation.kind !== "time-add") return null;
  const d = pkg.operation.operands[1];
  const one = (value: number, unit: string) => (unit === "min" ? value : unit === "h" ? value * 60 : NaN);
  const total = d.type === "quantity" ? one(d.value, d.unit) : d.parts.reduce((t, x) => t + one(x.value, x.unit), 0);
  return Number.isInteger(total) && total > 0 ? total : null;
}

const countSteps = (pkg: OperationPackage) => pkg.steps.filter((s): s is CountOn => s.kind === "count-on");

/**
 * F5: a 24-hour clock time with no a.m. or p.m. (the Book 1 shape) and whole minutes added, worked only by count-on
 * steps that code proves here: each starts where the last one ended, its minutes are the time between its ends, and
 * the last ends at the answer. A time with a.m. or p.m. keeps the controller: its periods would split Maya's sentences.
 */
function fits(pkg: OperationPackage): boolean {
  const op = pkg.operation;
  if (op.kind !== "time-add") return false;
  const start = op.operands[0];
  const answer = pkg.answer.value;
  if (start.period !== null || answer.type !== "time" || answer.period !== null) return false;
  const added = durationMinutes(pkg);
  if (added === null || !pkg.steps.every((s) => s.kind === "count-on" || s.kind === "result")) return false;
  const steps = countSteps(pkg);
  if (steps.length === 0) return false;
  let at = minutesOf(start);
  let sum = 0;
  for (const st of steps) {
    if (st.from.period !== null || st.to.period !== null || minutesOf(st.from) !== at % DAY) return false;
    if ((minutesOf(st.to) - minutesOf(st.from) + DAY) % DAY !== st.minutes || st.minutes <= 0) return false;
    at += st.minutes;
    sum += st.minutes;
  }
  return sum === added && at % DAY === minutesOf(answer);
}

function steps(pkg: OperationPackage): TutorStepFact[] {
  return countSteps(pkg).map((st) => {
    const why = st.id === "to-hour" ? "to the next hour first" : st.id === "hours" ? "the whole hours" : "then the minutes left";
    return { id: st.id, work: `count on ${amount(st.minutes)} from ${clockText(st.from)} to ${clockText(st.to)}; ${why}`, result: st.minutes };
  });
}

function numberMeaning(pkg: OperationPackage, n: number): string {
  if (pkg.operation.kind !== "time-add" || pkg.answer.value.type !== "time") return "not a value of this question";
  const start = pkg.operation.operands[0];
  const answer = pkg.answer.value;
  const added = durationMinutes(pkg) ?? 0;
  const meanings: string[] = [];
  if (n === answer.hours * 100 + answer.minutes && answer.minutes > 0) meanings.push(`the right answer time, ${clockText(answer)}, said as one number`);
  if (n === answer.minutes) meanings.push(`right: the minutes of the answer time ${clockText(answer)}`);
  if (n === answer.hours) meanings.push(`right: the hour of the answer time ${clockText(answer)}`);
  for (const st of countSteps(pkg)) if (n === st.minutes) meanings.push(`right: ${amount(st.minutes)} from ${clockText(st.from)} to ${clockText(st.to)}`);
  if (meanings.length) return meanings.join("; ");
  // The minutes added with no trade of 60 minutes for 1 hour ("6:63").
  if (start.minutes + added >= 60 && n === start.minutes + added) return `a likely mistake: ${start.minutes} + ${added} = ${n} minutes, but an hour has only 60 minutes, so trade 60 minutes for 1 hour`;
  if (start.minutes + added >= 60 && n === start.hours * 100 + start.minutes + added) return `a likely mistake: wrote ${start.hours}:${start.minutes + added}, but an hour has only 60 minutes`;
  if (n === start.hours || n === start.minutes || n === added) return "a number of the question";
  return "not a value of this question";
}

function workValues(pkg: OperationPackage): number[] {
  const answer = pkg.answer.value.type === "time" ? [pkg.answer.value.hours, pkg.answer.value.minutes] : [];
  return [...countSteps(pkg).flatMap((st) => [st.minutes, st.to.hours, st.to.minutes]), ...answer];
}

function streamScope(pkg: OperationPackage): { numbers: number[]; expressions: string[] } {
  const start = pkg.operation.kind === "time-add" ? [pkg.operation.operands[0].hours, pkg.operation.operands[0].minutes] : [];
  const added = durationMinutes(pkg);
  const numbers = [...start, ...(added === null ? [] : [added]), 60, 1, ...workValues(pkg), ...countSteps(pkg).flatMap((st) => [st.from.hours, st.from.minutes])];
  return { numbers: [...new Set(numbers)], expressions: [] };
}

/** A clock time in a sentence, with a.m. or p.m. when it has one. */
const CLOCK = String.raw`(\d{1,2}):(\d{2})(?!\d)`;
const AMOUNT = String.raw`(\d+)\s+(minutes?|mins?|hours?)`;
const amountMinutes = (n: string, unit: string) => Number(n) * (/^h/i.test(unit) ? 60 : 1);
const clockMinutes = (h: string, m: string) => Number(h) * 60 + Number(m);

/**
 * The clock-time claims of one sentence that are false, read by this kind (the core reads "6:13" as two numbers).
 * Read and checked: "N minutes after H:MM is H:MM", "H:MM plus N minutes is H:MM", "from H:MM to H:MM is N minutes",
 * "count on N minutes from H:MM to H:MM", and "the answer is H:MM". Fail closed: a time that is not a clock time
 * ("6:63"), a time with a.m. or p.m., and any other sentence that links a clock time to a number or another time is
 * refused.
 */
export function timeClaimProblems(pkg: OperationPackage, sentence: string): string[] {
  const text = sentence.replace(/[−–]/g, "-");
  if (!new RegExp(CLOCK).test(text)) return [];
  const problems: string[] = [];
  for (const m of text.matchAll(new RegExp(CLOCK, "g"))) {
    if (Number(m[1]) > 23 || Number(m[2]) > 59) problems.push(`${m[0]} is not a clock time: an hour has only 60 minutes`);
  }
  if (/\d\s*(?:[ap]\.?\s?m\b\.?)/i.test(text)) problems.push("a time with a.m. or p.m. is said in a form code cannot check here");
  if (problems.length) return problems;
  const answer = pkg.answer.value.type === "time" && fits(pkg) ? minutesOf(pkg.answer.value) : null;
  let rest = text;
  const read = (re: RegExp, check: (m: string[]) => string | null) => {
    rest = rest.replace(re, (...args) => {
      const problem = check(args.slice(0, -2) as string[]);
      if (problem) problems.push(problem);
      return " ";
    });
  };
  const after = (from: number, by: number, to: number, said: string) => ((from + by) % DAY === to ? null : `${amount(by)} after ${textOfMinutes(from)} is ${textOfMinutes(from + by)}, not ${said}`);
  const between = (from: number, to: number, by: number) => ((to - from + DAY) % DAY === by ? null : `from ${textOfMinutes(from)} to ${textOfMinutes(to)} is ${amount((to - from + DAY) % DAY)}, not ${amount(by)}`);
  const REL = String.raw`\s+(?:is|=|equals|makes|gives|comes to|will be|would be|gets you to|takes you to|brings you to)\s+`;
  read(new RegExp(String.raw`\b${AMOUNT}\s+(?:after|past|later than)\s+${CLOCK}${REL}${CLOCK}`, "gi"), (m) => after(clockMinutes(m[3], m[4]), amountMinutes(m[1], m[2]), clockMinutes(m[5], m[6]), `${m[5]}:${m[6]}`));
  read(new RegExp(String.raw`${CLOCK}\s+(?:plus|\+|and)\s+${AMOUNT}${REL}${CLOCK}`, "gi"), (m) => after(clockMinutes(m[1], m[2]), amountMinutes(m[3], m[4]), clockMinutes(m[5], m[6]), `${m[5]}:${m[6]}`));
  read(new RegExp(String.raw`\b(?:from\s+)?${CLOCK}\s+(?:to|until|till)\s+${CLOCK}${REL}${AMOUNT}`, "gi"), (m) => between(clockMinutes(m[1], m[2]), clockMinutes(m[3], m[4]), amountMinutes(m[5], m[6])));
  read(new RegExp(String.raw`\bcount(?:ing)?\s+on\s+${AMOUNT}\s+from\s+${CLOCK}\s+(?:to|until|till)\s+${CLOCK}`, "gi"), (m) => between(clockMinutes(m[3], m[4]), clockMinutes(m[5], m[6]), amountMinutes(m[1], m[2])));
  read(new RegExp(String.raw`\b(?:the\s+(?:whole\s+|final\s+)?answer|the\s+time)${REL}${CLOCK}`, "gi"), (m) => (answer === null ? "this question has no answer time" : clockMinutes(m[1], m[2]) === answer ? null : `the answer is ${textOfMinutes(answer)}, not ${m[1]}:${m[2]}`));
  // A clock time left that is linked to a number or another time in a form code did not read: refused.
  if (new RegExp(CLOCK).test(rest)) {
    const linked = /\b(?:is|are|=|equals|makes|gives|becomes|became|comes to|will be|would be|gets|lands|plus|minus|after|before|past|later|earlier)\b|[=+]/i.test(rest) || new RegExp(AMOUNT, "i").test(rest);
    const known = new Set([...(pkg.operation.kind === "time-add" ? [minutesOf(pkg.operation.operands[0])] : []), ...countSteps(pkg).flatMap((st) => [minutesOf(st.from), minutesOf(st.to)]), ...(answer === null ? [] : [answer])]);
    const unknown = [...rest.matchAll(new RegExp(CLOCK, "g"))].some((m) => !known.has(clockMinutes(m[1], m[2])));
    if (linked || unknown) problems.push("it says something about a clock time in a form code cannot check");
  }
  return problems;
}

export const timeAddKind: TutorKind = {
  id: "time-add",
  fits,
  steps,
  numberMeaning,
  workValues,
  streamScope,
  // No plain form holds a clock time: code's honest line asks for the whole answer.
  stepQuestion: () => null,
  drawings: () => [],
  draw: () => ({ commands: [], keys: [] }),
  claimProblems: timeClaimProblems,
  notes: () => ["Count on to the next hour first, then the whole hours, then the minutes left. An hour has 60 minutes."],
};
