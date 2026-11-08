// The "other-topic" questions Maya cannot teach yet (Maya coverage, Wave C): true/false claims, word answers that
// compare two amounts, and clock times. Each is read here with the three agreements of the Wave A brief (rule 3), so
// the teaching path that lands later (A4's claim path, A2's evaluate steps, a time path) starts from checked data:
// 1. the printed text, by a closed form for its template;
// 2. code's own computation from the printed numbers, which equals the stored answer key (the circled word or the box);
// 3. the template is exactly this one (its answer, check and derived expressions, as stored), and its slot and derived
//    values are the printed numbers.
// A reading gives the work code does (`work`: an operation of a kind the question package computes, or none for a
// same-denominator compare, where only the numerators are compared), the two amounts compared, and the answer. Nothing
// here makes a package or changes one. Pure TypeScript.
import { operationProblem, operationResult, sameValue, type Operation, type QuestionPackage } from "@/lib/question-package";
import { templateAnswer, templateAnswerValue, templateNumbers, type TemplateSource } from "@/lib/question-package-template";

/** How a topic question's answer comes from code's work. */
export type TopicReading =
  /** "True or false: 5/6 > 3/6.": the same denominator, so the numerators decide. No operation. */
  | { topic: "same-denominator"; claim: { left: number; right: number; denominator: number; relation: ">" }; answer: "true" | "false" }
  /** A claimed amount checked against code's work: "2 intervals above 90 is 94" (90 + 2 × 2 = 94). */
  | { topic: "scale" | "money" | "minute-hand"; work: Operation; claimed: number; answer: "true" | "false" }
  /** Red against the other colours together: 1 red against blue and green, 5 + 5. */
  | { topic: "marbles"; left: number; work: Operation; relation: ">"; answer: "true" | "false" }
  /** One area more than another: 5 by 3 squares (5 × 3) against 4 by 2 squares (4 × 2). */
  | { topic: "area"; work: [Operation, Operation]; relation: ">"; answer: "true" | "false" }
  /** Which of two areas is bigger, as the printed words: "7 by 6" (7 × 6 against 5 × 6). */
  | { topic: "area-compare"; work: [Operation, Operation]; words: [string, string]; answer: string }
  /** Which of two outcomes of a 1 to 6 die is more likely, by code's count of each: "even" (3 numbers against 1). */
  | { topic: "die-compare"; counts: [number, number]; words: [string, string]; answer: string }
  /** A clock time: "What time is 50 minutes after 6:13?" is 6:13 + 50 min (time-add). */
  | { topic: "time"; work: Operation; answer: string };

type Numbers = Record<string, number>;
interface Stored { source: TemplateSource; key: string; values: Numbers }

/** The single template check of the item and its stored key (a circled word or a box answer), or null. */
function stored(pkg: QuestionPackage, format: string, kind: "template" | "template-choice"): Stored | null {
  const item = pkg.item;
  if (!item || !item.scorable || item.format !== format || item.error !== null || item.checks.length !== 1) return null;
  const check = item.checks[0];
  if (check.kind !== kind) return null;
  const answer = templateAnswer(check.source);
  const values = templateNumbers(check.source);
  if (!("answer" in answer) || !values) return null;
  const region = item.regions.find((r) => r.id === check.region);
  if (kind === "template-choice") {
    if (region?.kind !== "choice" || region.answer !== answer.answer || region.choices.join(",") !== "true,false") return null;
    return { source: check.source, key: answer.answer, values };
  }
  const key = templateAnswerValue(answer.answer);
  if (region?.kind !== "box" || !region.answer || !sameValue(region.answer, key)) return null;
  return { source: check.source, key: answer.answer, values };
}

/** The template's answer, check and derived expressions are exactly these. */
const sameSource = (s: TemplateSource, t: { answer: string; check: string | null; derived: string[][] }) =>
  s.answer === t.answer && s.check === t.check && JSON.stringify(s.derived) === JSON.stringify(t.derived);

/** The numbers of a die that the question does not number: 1 to 6. */
const DIE = [1, 2, 3, 4, 5, 6];
const word = (b: boolean): "true" | "false" => (b ? "true" : "false");
const n = "([1-9]\\d{0,3}|0)";
const valid = (op: Operation) => operationProblem(op) === null;
const resultOf = (op: Operation) => {
  const v = operationResult(op);
  return v.type === "number" ? v.value : null;
};

/** One topic: its template id, closed form, exact template, and how code reads it. */
interface Topic {
  templates: string[];
  format: string;
  kind: "template" | "template-choice";
  form: RegExp;
  source: { answer: string; check: string | null; derived: string[][] };
  read: (m: string[], v: Numbers) => TopicReading | null;
}

/** The derived sides of the two area templates (3.9-area-square-units #4.1 and #4.3). */
const AREA_DERIVED = [["a", "2 + a0 % 7"], ["b", "2 + b0 % min(7, 50 // a - 1)"], ["c", "2 + c0 % 7"], ["d", "2 + d0 % min(7, 50 // c - 1)"]];

const TOPICS: Topic[] = [
  {
    templates: ["4.3-same-denominator#3.4:true-false"], format: "circle", kind: "template-choice",
    form: new RegExp(`^True or false: ${n}/${n} > ${n}/\\2\\.$`),
    source: { answer: "'true' if a > b else 'false'", check: "a != b", derived: [["a", "1 + u1 % (d - 1)"], ["b", "1 + u2 % (d - 1)"]] },
    read: ([, a, d, b], v) => (v.a === +a && v.b === +b && v.d === +d && +a < +d && +b < +d
      ? { topic: "same-denominator", claim: { left: +a, right: +b, denominator: +d, relation: ">" }, answer: word(+a > +b) } : null),
  },
  {
    templates: ["4.16-many-to-one#3.4:true-false"], format: "circle", kind: "template-choice",
    form: new RegExp(`^A scale's marks are ${n}, ${n}, ${n}\\. True or false: ${n} intervals above \\2 is ${n}\\.$`),
    source: {
      answer: "'true' if flip == 0 else 'false'", check: null,
      derived: [["k", "2 + 8 * (u1 % 2)"], ["v", "10 * (2 + u2 % 9)"], ["shown", "(v + m * k) if flip == 0 else (v + m * k) + (k)"], ["lower", "v - k"], ["upper", "v + k"]],
    },
    read: ([, lo, mid, hi, m, s], v) => {
      const k = +mid - +lo;
      if (k <= 0 || +hi - +mid !== k || v.lower !== +lo || v.v !== +mid || v.upper !== +hi || v.m !== +m || v.shown !== +s) return null;
      const work: Operation = { kind: "evaluate", operands: [`${mid} + ${m} × ${k}`] };
      return valid(work) ? { topic: "scale", work, claimed: +s, answer: word(resultOf(work) === +s) } : null;
    },
  },
  {
    templates: ["4.18-money-notation#3.3:true-false"], format: "circle", kind: "template-choice",
    form: new RegExp(`^True or false: ${n} \\$20 bills and ${n} quarters is \\$(\\d{1,4})\\.(\\d\\d)\\.$`),
    source: {
      answer: "'true' if flip == 0 else 'false'", check: null,
      derived: [["w", "b20 * 2000 + qu * 25"], ["shown", "str((w if flip == 0 else w + 50) // 100) + '.' + ('0' + str((w if flip == 0 else w + 50) % 100) if (w if flip == 0 else w + 50) % 100 < 10 else str((w if flip == 0 else w + 50) % 100))"]],
    },
    read: ([, bills, quarters, dollars, cents], v) => {
      if (v.b20 !== +bills || v.qu !== +quarters || v.w !== +bills * 2000 + +quarters * 25) return null;
      const work: Operation = { kind: "evaluate", operands: [`${bills} × 20 + ${quarters} × 0.25`] };
      const claimed = +dollars + +cents / 100;
      const got = resultOf(work);
      return valid(work) && got !== null ? { topic: "money", work, claimed, answer: word(Math.round(got * 100) === +dollars * 100 + +cents) } : null;
    },
  },
  {
    templates: ["4.12-read-analog#3.4:true-false"], format: "circle", kind: "template-choice",
    form: new RegExp(`^True or false: the minute hand ${n} marks past the ${n} shows ${n} minutes\\.$`),
    source: { answer: "'true' if flip == 0 else 'false'", check: "x >= 2", derived: [["shown", "k * 5 + x if flip == 0 else k * 5 + x - 1"]] },
    read: ([, x, k, s], v) => {
      if (v.x !== +x || v.k !== +k || v.shown !== +s || +x > 4 || +k < 1 || +k > 11) return null;
      const work: Operation = { kind: "evaluate", operands: [`${k} × 5 + ${x}`] };
      return valid(work) ? { topic: "minute-hand", work, claimed: +s, answer: word(resultOf(work) === +s) } : null;
    },
  },
  {
    templates: ["4.17-predict-outcome#3.3:true-false"], format: "circle", kind: "template-choice",
    form: new RegExp(`^True or false: with ${n} red, ${n} blue and ${n} green marbles, red is more likely than the other colours together\\.$`),
    source: { answer: "'true' if a > b + c else 'false'", check: "a != b + c and 8 <= a + b + c <= 12", derived: [] },
    read: ([, a, b, c], v) => {
      if (v.a !== +a || v.b !== +b || v.c !== +c) return null;
      const work: Operation = { kind: "add", operands: [+b, +c] };
      const others = resultOf(work);
      return valid(work) && others !== null ? { topic: "marbles", left: +a, work, relation: ">", answer: word(+a > others) } : null;
    },
  },
  {
    templates: ["3.9-area-square-units#4.3:true-false"], format: "circle", kind: "template-choice",
    form: new RegExp(`^True or false: ${n} by ${n} squares is bigger than ${n} by ${n} squares\\.$`),
    source: { answer: "'true' if a * b > c * d else 'false'", check: "a * b != c * d", derived: AREA_DERIVED },
    read: ([, a, b, c, d], v) => (v.a === +a && v.b === +b && v.c === +c && v.d === +d
      ? { topic: "area", work: [{ kind: "multiply", operands: [+a, +b] }, { kind: "multiply", operands: [+c, +d] }], relation: ">", answer: word(+a * +b > +c * +d) } : null),
  },
  {
    templates: ["3.9-area-square-units#4.1:compare"], format: "write-words", kind: "template",
    form: new RegExp(`^Which is bigger: ${n} by ${n} squares, or ${n} by ${n} squares\\?$`),
    source: { answer: "str(a) + ' by ' + str(b) if a * b > c * d else (str(c) + ' by ' + str(d) if c * d > a * b else 'the same')", check: "a * b != c * d", derived: AREA_DERIVED },
    read: ([, a, b, c, d], v) => {
      if (v.a !== +a || v.b !== +b || v.c !== +c || v.d !== +d || +a * +b === +c * +d) return null;
      const words: [string, string] = [`${a} by ${b}`, `${c} by ${d}`];
      return { topic: "area-compare", work: [{ kind: "multiply", operands: [+a, +b] }, { kind: "multiply", operands: [+c, +d] }], words, answer: +a * +b > +c * +d ? words[0] : words[1] };
    },
  },
  {
    templates: ["4.17-predict-outcome#3.4:compare"], format: "write-words", kind: "template",
    form: new RegExp(`^Which is more likely when you roll a die: an even number or a number less than ${n}\\?$`),
    source: { answer: "'even' if 3 > c - 1 else 'less than ' + str(c)", check: null, derived: [["c", "[2, 3, 5, 6][u1 % 4]"]] },
    read: ([, c], v) => {
      if (v.c !== +c || +c < 2 || +c > 7) return null;
      const evens = DIE.filter((x) => x % 2 === 0).length;
      const below = DIE.filter((x) => x < +c).length;
      if (evens === below) return null;
      const words: [string, string] = ["even", `less than ${c}`];
      return { topic: "die-compare", counts: [evens, below], words, answer: evens > below ? words[0] : words[1] };
    },
  },
];

/** The clock forms (4.12-read-analog#3.2 and #3.5): "What time is 40 minutes after 9:00?". */
const TIME_FORM = /^What time is ([1-5]?\d) minutes after (1[0-2]|[1-9]):([0-5]\d)\?$/;
const TIME_SOURCES: Record<string, { answer: string; check: string | null; derived: string[][]; read: (v: Numbers) => [number, number, number] | null }> = {
  "4.12-read-analog#3.2:bare": {
    answer: "str(h) + ':' + (('0' + str(m)) if m < 10 else str(m))", check: null, derived: [],
    read: (v) => [v.h, 0, v.m],
  },
  "4.12-read-analog#3.5:bare": {
    answer: "str((e // 60 - 1) % 12 + 1) + ':' + ('00' if e % 60 == 0 else ('0' + str(e % 60) if e % 60 < 10 else str(e % 60)))", check: null,
    derived: [["t", "hr * 60 + mm"], ["e", "t + m"], ["ts", "str((t // 60 - 1) % 12 + 1) + ':' + ('00' if t % 60 == 0 else ('0' + str(t % 60) if t % 60 < 10 else str(t % 60)))"]],
    read: (v) => [v.hr, v.mm, v.m],
  },
};

function readTime(pkg: QuestionPackage): TopicReading | null {
  const t = TIME_SOURCES[pkg.templateId ?? ""];
  const m = TIME_FORM.exec(pkg.text.trim());
  const s = stored(pkg, "write-words", "template");
  if (!t || !m || !s || !sameSource(s.source, t)) return null;
  const [minutes, hour, minute] = [+m[1], +m[2], +m[3]];
  const slots = t.read(s.values);
  if (!slots || slots[0] !== hour || slots[1] !== minute || slots[2] !== minutes) return null;
  const work: Operation = { kind: "time-add", operands: [{ type: "time", hours: hour, minutes: minute, period: null }, { type: "quantity", value: minutes, unit: "min" }] };
  if (!valid(work)) return null;
  // The book prints a time with no a.m. or p.m.; the package's clock with no period is the 24-hour clock ("09:40"), so
  // code writes the result as the book does: the hour from 1 to 12, then the minutes.
  const end = operationResult(work);
  if (end.type !== "time") return null;
  const got = `${((end.hours + 11) % 12) + 1}:${String(end.minutes).padStart(2, "0")}`;
  return got === s.key ? { topic: "time", work, answer: got } : null;
}

/**
 * The checked reading of an "other-topic" question that has no teaching path yet, or null when the printed text, code's
 * work and the template do not all agree.
 */
export function readTopicQuestion(pkg: QuestionPackage): TopicReading | null {
  if (pkg.operation !== null) return null;
  if (pkg.templateId && Object.hasOwn(TIME_SOURCES, pkg.templateId)) return readTime(pkg);
  const topic = TOPICS.find((t) => t.templates.includes(pkg.templateId ?? ""));
  if (!topic) return null;
  const m = topic.form.exec(pkg.text.trim());
  const s = stored(pkg, topic.format, topic.kind);
  if (!m || !s || !sameSource(s.source, topic.source)) return null;
  const reading = topic.read([...m], s.values);
  return reading && reading.answer === s.key ? reading : null;
}
