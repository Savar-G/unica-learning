// The place-value kind of the tutor core (D-345, Phase 2, family F3): whole-number place value up to the hundred
// thousands, as Maya's session adapter makes it (src/lib/maya-teaching/place-value.ts and place-value-parts.ts):
// - digit: "In 34924, which digit is in the thousands place?" (4);
// - value: "What is the value of the digit in the ten thousands place of 48942?" (40000);
// - compare: "True or false: in 16466, the digit in the thousands place is bigger than the digit in the hundreds place.";
// - sum: "In 99467, what is the value of the thousands digit plus the value of the tens digit?" (9000 + 60 = 9060).
// Code computes every digit and value from the number's own digits, and checks Maya's place claims ("the 9 is in the
// thousands place", "the 8 is worth 8,000", "48942 has 4 ten thousands") against the number (`claimProblems`). A spot
// the error, a claim check, a tenths build and a 7-digit number keep the controller.
import type { OperationPackage, Place, WorkedStep } from "@/lib/question-package";
import { digitAt, placeIndex, WHOLE_PLACES, withCommas } from "@/lib/question-package-place-value";
import { expressionKey, noteFromEquation, type TutorCommand, type TutorDrawing, type TutorKind, type TutorStepFact } from "../tutor-kind";

type PlaceOp = Extract<OperationPackage["operation"], { kind: "place-value" }>;
type Ask = "digit" | "value" | "compare" | "sum";

/** The highest place this kind teaches: the hundred thousands (a 6-digit number, the most a chart holds on one page). */
const MAX_DIGITS = 6;
/** The step kinds of this family. A package with any other step (a claim check, a comparison) is another family's. */
const STEP_KINDS: readonly string[] = ["read-digit", "bigger", "place-worth", "result"];
/** Package fields of other families: a spot-the-error, a claim, a pattern, a comparison or a missing-number package. */
const OTHER_FAMILIES = ["spot", "claim", "pattern", "comparison", "missing"] as const;

/** One part of the question: a place of the number and its digit and value. */
interface Part { place: Place; k: number; digit: number; value: number }

/** What this kind reads from a package, all computed again from the number's own digits. */
interface Facts { ask: Ask; n: number; length: number; parts: Part[]; answer: number | "true" | "false" }

const partOf = (n: number, place: Place): Part => {
  const k = placeIndex(place);
  const digit = digitAt(n, k);
  return { place, k, digit, value: digit * 10 ** k };
};

/** The facts of a package this kind fits, or null. */
function factsOf(pkg: OperationPackage): Facts | null {
  const op = pkg.operation as PlaceOp | null;
  if (!op || op.kind !== "place-value") return null;
  if (op.ask !== "digit" && op.ask !== "value" && op.ask !== "compare" && op.ask !== "sum") return null;
  const n = op.operands[0];
  if (!Number.isSafeInteger(n) || n < 10) return null;
  const length = String(n).length;
  if (length > MAX_DIGITS) return null;
  const places = op.ask === "compare" || op.ask === "sum" ? [op.place, op.second] : [op.place];
  if (places.some((p) => placeIndex(p) < 0 || placeIndex(p) >= length)) return null;
  const parts = places.map((p) => partOf(n, p));
  const answer = op.ask === "digit" ? parts[0].digit
    : op.ask === "value" ? parts[0].value
      : op.ask === "sum" ? parts[0].value + parts[1].value
        : parts[0].digit > parts[1].digit ? "true" : "false";
  return { ask: op.ask, n, length, parts, answer };
}

/** Only a package whose answer and steps agree with code's own computation: anything else keeps the controller. */
function fits(pkg: OperationPackage): boolean {
  const f = factsOf(pkg);
  if (!f) return false;
  if (OTHER_FAMILIES.some((key) => (pkg as unknown as Record<string, unknown>)[key] != null)) return false;
  // A printed spot the error: Maya teaches the worked answer's check (claim-compare), another family's.
  if ((pkg.item as { format?: string } | null | undefined)?.format === "spot-the-error") return false;
  if (!pkg.steps.every((s) => STEP_KINDS.includes(s.kind))) return false;
  const v = pkg.answer.value;
  if (f.ask === "compare" ? v.type !== "choice" || v.value !== f.answer : v.type !== "number" || v.value !== f.answer) return false;
  // Every work step says what code computes.
  const work = pkg.steps.filter((s) => s.kind !== "result");
  const want: string[] = f.ask === "digit" ? [] : f.ask === "value" ? ["digit"] : f.ask === "sum" ? ["worth-1", "worth-2"]
    : ["digit-1", "digit-2", ...(f.parts[0].digit !== f.parts[1].digit ? ["bigger"] : [])];
  if (work.length !== want.length || work.some((s, i) => s.id !== want[i])) return false;
  return work.every((s) => stepAgrees(s, f));
}

function stepAgrees(s: WorkedStep, f: Facts): boolean {
  if (s.kind === "read-digit") {
    const p = f.parts.find((x) => x.place === s.place);
    return !!p && s.digit === p.digit && s.worth === 10 ** p.k;
  }
  if (s.kind === "place-worth") {
    const p = f.parts.find((x) => x.place === s.place);
    return !!p && s.digit === p.digit && s.worth === 10 ** p.k && s.value === p.value;
  }
  if (s.kind === "bigger") return s.a === f.parts[0].digit && s.b === f.parts[1].digit && s.bigger === Math.max(s.a, s.b);
  return false;
}

const must = (pkg: OperationPackage): Facts => {
  const f = factsOf(pkg);
  if (!f) throw new Error("maya tutor: not a place-value question");
  return f;
};

/** The places from the ones up to `k`, as a child counts them from the right: "ones, tens, hundreds, thousands". */
const countTo = (k: number) => WHOLE_PLACES.slice(0, k + 1).join(", ");
/** A digit's value as a count of its place and as a number: "4 ten thousands, which is 40,000". */
const worthText = (p: Part) => `${p.digit} ${p.place}, which is ${withCommas(p.value)}`;
const digitLine = (p: Part) => `the digit in the ${p.place} place is ${p.digit}`;

/** Each step as plain facts for the brief, in the order a child works them. */
function steps(pkg: OperationPackage): TutorStepFact[] {
  const f = must(pkg);
  const [a, b] = f.parts;
  const top = Math.max(...f.parts.map((p) => p.k));
  const count = `count the places from the right: ${countTo(top)}`;
  if (f.ask === "digit") {
    // The question's only step is its answer.
    return [{ id: "result", place: a.place, work: `${count}; ${digitLine(a)}`, result: a.digit }];
  }
  if (f.ask === "value") {
    return [{ id: "digit", place: a.place, work: `${count}; ${digitLine(a)}; a digit's value is the digit times its place: the ${a.digit} is worth ${worthText(a)}`, result: a.digit }];
  }
  if (f.ask === "sum") {
    return [
      { id: "worth-1", place: a.place, work: `${count}; ${digitLine(a)}; the ${a.digit} in the ${a.place} place is worth ${worthText(a)}`, result: a.value },
      { id: "worth-2", place: b.place, work: `${digitLine(b)}; the ${b.digit} in the ${b.place} place is worth ${worthText(b)}; ${withCommas(a.value)} + ${withCommas(b.value)} = ${withCommas(a.value + b.value)}`, result: b.value },
    ];
  }
  const out: TutorStepFact[] = [
    { id: "digit-1", place: a.place, work: `${count}; ${digitLine(a)}`, result: a.digit },
    { id: "digit-2", place: b.place, work: digitLine(b), result: b.digit },
  ];
  if (a.digit !== b.digit) {
    const [big, small] = a.digit > b.digit ? [a.digit, b.digit] : [b.digit, a.digit];
    out.push({ id: "bigger", work: `${big} is bigger than ${small}, so the statement is ${f.answer}`, result: big });
  }
  return out;
}

/** The place a digit would have if a child counted the places from the left (k from the right in a number of `length`). */
const fromLeft = (length: number, k: number) => length - 1 - k;

/** What a number the child said means for this question: right, a known mistake, or not one of its values. */
function numberMeaning(pkg: OperationPackage, n: number): string {
  const f = must(pkg);
  const [a, b] = f.parts;
  if (n === f.answer) return "the right answer to the whole question";
  const right: string[] = [];
  const mistakes = new Set<string>();
  const work = workValues(pkg);
  // Right for a step.
  for (const p of f.parts) {
    if (f.ask !== "digit" && n === p.digit) right.push(`right for the ${p.place} digit (${digitLine(p)})${f.ask === "compare" ? "" : `, but not the answer: its value is ${withCommas(p.value)}`}`);
    if (f.ask === "sum" && n === p.value) right.push(`right for the value of the ${p.place} digit (the ${p.digit} is worth ${withCommas(p.value)}), but not the whole answer`);
  }
  if (f.ask === "compare" && a.digit !== b.digit && n === Math.max(a.digit, b.digit) && right.length === 0) right.push("right for the bigger digit");
  if (right.length) return right.join("; ");
  if (!work.includes(n)) {
    for (const p of f.parts) {
      const left = fromLeft(f.length, p.k);
      const shown = (j: number) => (f.ask === "digit" || f.ask === "compare" ? digitAt(f.n, j) : digitAt(f.n, j) * 10 ** p.k);
      // Counted the places from the left: in 34924 the thousands read as the 4 of the ten... from the left.
      if (left !== p.k && n === shown(left)) mistakes.add(`a likely mistake: counted the places from the left, so read the ${WHOLE_PLACES[left]} digit for the ${p.place}`);
      // The next place over.
      for (const j of [p.k + 1, p.k - 1]) if (j >= 0 && j < f.length && n === shown(j)) mistakes.add(`a likely mistake: read the digit of the next place over (the ${WHOLE_PLACES[j]}) for the ${p.place}`);
      if (f.ask === "digit" || f.ask === "compare") {
        if (p.k > 0 && n === p.value) mistakes.add(`a likely mistake: gave the digit's value (${withCommas(p.value)}), not the digit`);
      } else if (p.digit !== 0) {
        if (n === p.digit * 10 ** (p.k + 1)) mistakes.add(`a likely mistake: a value with one zero too many (the ${p.digit} worth the next place up)`);
        if (p.k >= 1 && n === p.digit * 10 ** (p.k - 1)) mistakes.add(`a likely mistake: a value with one zero too few (the ${p.digit} worth the next place down)`);
        if (n === 10 ** p.k && p.digit !== 1) mistakes.add(`a likely mistake: the worth of one ${p.place.replace(/s$/, "")}, not of ${p.digit} ${p.place}`);
      }
    }
    if (f.ask === "sum") {
      if (n === a.digit + b.digit) mistakes.add("a likely mistake: added the two digits, not their values");
      if (n === a.digit * 10 + b.digit) mistakes.add("a likely mistake: wrote the two digits side by side");
      if (n === a.digit * 10 ** (a.k - 1) + b.value || n === a.value + b.digit * 10 ** (b.k + 1)) mistakes.add("a likely mistake: one of the two values has a zero too few or too many");
    }
    // Code's own expected wrong answers (src/lib/maya-teaching), with their reasons.
    for (const w of pkg.wrongAnswers) if (w.value.type === "number" && w.value.value === n && mistakes.size === 0) mistakes.add(`a likely mistake: ${w.description.charAt(0).toLowerCase()}${w.description.slice(1)}`);
  }
  if (mistakes.size) return [...mistakes].join("; ");
  if (n === f.n) return "the question's number";
  for (let j = 0; j < f.length; j++) {
    if (n === digitAt(f.n, j)) return `a digit of the number (the ${WHOLE_PLACES[j]} digit), not the one asked`;
    if (j > 0 && digitAt(f.n, j) > 0 && n === digitAt(f.n, j) * 10 ** j) return `the value of the ${WHOLE_PLACES[j]} digit, not of the one asked`;
  }
  return "not a value of this question";
}

/** Values of the work that are never a wrong answer: each asked digit, and each value a sum adds. */
function workValues(pkg: OperationPackage): number[] {
  const f = must(pkg);
  if (f.ask === "digit") return [];
  if (f.ask === "value") return [f.parts[0].digit];
  if (f.ask === "sum") return f.parts.flatMap((p) => [p.digit, p.value]);
  return f.parts.map((p) => p.digit);
}

/** The numbers and operations a streamed sentence may hold: the number, its digits, each place's worth and each value. */
function streamScope(pkg: OperationPackage): { numbers: number[]; expressions: string[] } {
  const f = must(pkg);
  const numbers = [f.n, 1, 10, ...(typeof f.answer === "number" ? [f.answer] : [])];
  for (let j = 0; j < f.length; j++) numbers.push(digitAt(f.n, j), 10 ** j, digitAt(f.n, j) * 10 ** j);
  const expressions = f.parts.map((p) => expressionKey([p.digit, 10 ** p.k], ["*"]));
  if (f.ask === "sum") expressions.push(expressionKey([f.parts[0].value, f.parts[1].value], ["+"]));
  return { numbers, expressions };
}

/** The next open step's question, or the whole question when every step is done. */
function stepQuestion(pkg: OperationPackage, done: readonly string[]): string {
  const f = must(pkg);
  const [a, b] = f.parts;
  const num = withCommas(f.n);
  const which = (p: Part) => `Which digit is in the ${p.place} place of ${num}?`;
  if (f.ask === "digit") return which(a);
  if (f.ask === "value") return done.includes("digit") ? `What is the value of the ${a.digit} in the ${a.place} place?` : which(a);
  if (f.ask === "sum") {
    if (!done.includes("worth-1")) return `What is the value of the ${a.place} digit of ${num}?`;
    if (!done.includes("worth-2")) return `What is the value of the ${b.place} digit of ${num}?`;
    return `So what is ${withCommas(a.value)} plus ${withCommas(b.value)}?`;
  }
  if (!done.includes("digit-1")) return which(a);
  if (!done.includes("digit-2")) return which(b);
  if (a.digit !== b.digit && !done.includes("bigger")) return `Which is bigger, ${a.digit} or ${b.digit}?`;
  return "So is the statement true or false?";
}

// ---------- Board ----------

const chartPlace = (p: Place) => p.replace(" ", "_");
/** A chart with no digits written: a digit or compare question (the child reads the digits from their page). */
const blankChart = (f: Facts) => f.ask === "digit" || f.ask === "compare" || f.parts.some((p) => p.digit === 0);

function drawings(pkg: OperationPackage): readonly TutorDrawing[] {
  const f = must(pkg);
  const places = f.parts.map((p) => `"${p.place}"`).join(" or ");
  const out: TutorDrawing[] = [
    { id: "chart", does: blankChart(f) ? `draws a place-value chart of the places of ${withCommas(f.n)}, with no digits written` : `draws a place-value chart of ${withCommas(f.n)}` },
    { id: "band", does: `colors one place of the chart ("place": a place of the number, such as ${places})` },
  ];
  if (blankChart(f)) out.push({ id: "digit", does: `writes the digit of the place given in the chart ("place": ${places})` });
  if (f.ask === "value" || f.ask === "sum") out.push({ id: "value", does: `writes the value of the digit of the place given under it ("place": ${places})` });
  if (f.ask !== "sum") out.push({ id: "sentence", does: f.ask === "compare" ? "writes the two digits compared under the chart" : "writes the digit times its place under the chart" });
  out.push({ id: "answer", does: "writes the checked answer on the chart" });
  if (f.ask === "sum") out.push({ id: "note", does: "writes one true equation of numbers below the chart (\"place\": \"9000 + 60 = 9060\")" });
  return out;
}

/**
 * The commands for the model's drawing requests, in order, and the keys of what they drew. `drawn`: what the call drew
 * already (never twice). Every command comes from code's own digits and values; the chart is drawn first when a request
 * needs it. Only a "note" takes the model's text, rebuilt from a true equation's values.
 */
function draw(pkg: OperationPackage, requests: readonly { offer: string; place?: string }[], drawn: readonly string[], noteId: (i: number) => string): { commands: TutorCommand[]; keys: string[] } {
  const f = must(pkg);
  const commands: TutorCommand[] = [];
  const keys: string[] = [];
  const has = (k: string) => drawn.includes(k) || keys.includes(k);
  const blank = blankChart(f);
  const chart = () => {
    if (has("chart")) return;
    commands.push({ op: "place_chart", id: "question", number: String(f.n), ...(blank ? { blank: true } : {}), place: { region: "main" } });
    keys.push("chart");
  };
  const cell = (rowId: string, p: Part) => ({ objectId: "question", part: "cell", rowId, column: chartPlace(p.place) });
  // The asked part the request names, else the first one not yet drawn for that request.
  const asked = (offer: string, place: string | undefined) => f.parts.find((p) => p.place === normalPlace(place)) ?? f.parts.find((p) => !has(`${offer}:${p.place}`));
  const digit = (p: Part) => {
    if (!blank || has(`digit:${p.place}`)) return;
    chart();
    commands.push({ op: "put", target: cell("digits", p), value: String(p.digit) });
    keys.push(`digit:${p.place}`);
  };
  const value = (p: Part) => {
    if (has(`value:${p.place}`)) return;
    digit(p);
    chart();
    commands.push({ op: "put", target: cell("value", p), value: String(p.value) });
    keys.push(`value:${p.place}`);
  };
  const sentence = () => {
    if (has("sentence") || f.ask === "sum") return;
    const [a, b] = f.parts;
    if (f.ask === "compare") {
      digit(a);
      digit(b);
    } else value(a);
    chart();
    const text = f.ask === "compare" ? `${a.digit} ${a.digit > b.digit ? ">" : a.digit < b.digit ? "<" : "="} ${b.digit}` : `${a.digit} × ${withCommas(10 ** a.k)} = ${withCommas(a.value)}`;
    commands.push({ op: "put", target: { objectId: "question", part: "row", rowId: "equation" }, value: text });
    keys.push("sentence");
  };
  let notes = 0;
  for (const d of requests) {
    if (d.offer === "chart") chart();
    else if (d.offer === "band") {
      // Any place of the number (a child counts them from the right); the asked place when none is given.
      const k = placeIndex(normalPlace(d.place));
      const place = k >= 0 && k < f.length ? WHOLE_PLACES[k] : f.parts.find((p) => !has(`band:${p.place}`))?.place;
      if (!place || has(`band:${place}`)) continue;
      chart();
      commands.push({ op: "mark", id: `tutor-band-${chartPlace(place)}`, target: { objectId: "question", part: "piece", piece: `band-${chartPlace(place)}` }, style: "highlight" });
      keys.push(`band:${place}`);
    } else if (d.offer === "digit") {
      const p = asked("digit", d.place);
      if (p) digit(p);
    } else if (d.offer === "value" && (f.ask === "value" || f.ask === "sum")) {
      const p = asked("value", d.place);
      if (p) value(p);
    } else if (d.offer === "sentence") sentence();
    else if (d.offer === "answer") {
      if (has("answer")) continue;
      if (f.ask === "digit") digit(f.parts[0]);
      else if (f.ask === "sum") f.parts.forEach(value);
      else sentence();
      chart();
      commands.push({ op: "put", target: { objectId: "question", part: "row", rowId: "answer" }, value: typeof f.answer === "number" ? withCommas(f.answer) : f.answer });
      keys.push("answer");
    } else if (d.offer === "note" && d.place) {
      // Only a whole equation of numbers, rebuilt from its values: no other text reaches the board.
      const text = noteFromEquation(d.place.replace(/(\d),(?=\d{3}\b)/g, "$1"));
      if (!text) continue;
      chart();
      commands.push({ op: "write", id: noteId(notes++), text, place: { below: "question" } });
    }
  }
  return { commands, keys };
}

/** A place as the model may write it ("ten_thousands", "Ten-thousands", "the thousands place") as a whole place name. */
function normalPlace(place: string | undefined): Place {
  const p = (place ?? "").toLowerCase().replace(/[_-]/g, " ").replace(/\b(?:the|place|column|digit)\b/g, " ").replace(/\s+/g, " ").trim();
  return p as Place;
}

// ---------- Maya's place claims ----------

const SMALL = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const WORD = new RegExp(String.raw`\b(?:${[...SMALL, ...TENS, "hundred", "thousand", "million"].join("|")})\b(?:(?:\s+|\s+and\s+)(?:${[...SMALL, ...TENS, "hundred", "thousand", "million"].join("|")})\b)*`, "g");

/** A run of number words as a number ("forty thousand", "nine thousand and sixty"), or null when it does not parse. */
function wordsValue(run: string): number | null {
  let total = 0;
  let group = 0;
  let last: "unit" | "tens" | "scale" | null = null;
  for (const w of run.split(/\s+/).filter((x) => x !== "and")) {
    const small = SMALL.indexOf(w);
    const tens = TENS.indexOf(w);
    if (small >= 0) {
      if (last === "unit") return null;
      if (last === "tens" && small >= 10) return null;
      group += small;
      last = "unit";
    } else if (tens >= 0) {
      if (last === "unit" || last === "tens") return null;
      group += (tens + 2) * 10;
      last = "tens";
    } else if (w === "hundred") {
      if (group === 0 || group >= 100) return null;
      group *= 100;
      last = "scale";
    } else {
      const scale = w === "thousand" ? 1000 : 1_000_000;
      if (group === 0) return null;
      total += group * scale;
      group = 0;
      last = "scale";
    }
  }
  return total + group;
}

/**
 * A sentence in a form the claim readers match: lower case, numbers in digits with no commas, and each plural place name
 * as a token `@k` (k: its power of ten): "the 8 is worth eight thousand" is "the 8 is worth 8000"; "the ten thousands
 * place" is "the @4 place". Null when a run of number words does not parse.
 */
function normalized(sentence: string): string | null {
  let t = sentence.toLowerCase().replace(/[’]/g, "'").replace(/[−–]/g, "-").replace(/(\d),(?=\d{3}\b)/g, "$1").replace(/([a-z])-(?=[a-z])/g, "$1 ").replace(/\s+/g, " ");
  // A singular count of one place: "1 ten thousand", "a thousand", "one hundred" (not "one hundred and ...").
  t = t.replace(/\b(?:1|one|a) (hundred thousand|ten thousand|thousand|hundred|ten)\b(?! (?:and|thousand|hundred|\d|[a-z]+ty|one|two|three|four|five|six|seven|eight|nine))/g, (_, unit: string) => `1 ${unit}s`);
  // Place names next, so "ten thousands" is a place and not the number ten.
  const PLACES: [RegExp, number][] = [[/\bhundred thousands\b/g, 5], [/\bten thousands\b/g, 4], [/\bmillions\b/g, 6], [/\bthousands\b/g, 3], [/\bhundreds\b/g, 2], [/\btens\b/g, 1], [/\bones\b/g, 0]];
  for (const [re, k] of PLACES) t = t.replace(re, `@${k}`);
  // Digits before a scale word: "8 thousand" is 8000, "4 hundred thousand" is 400000.
  t = t.replace(/\b(\d+) ((?:(?:hundred|thousand|million) )*(?:hundred|thousand|million))\b/g, (_, d: string, scales: string) => String(scales.split(" ").reduce((v, w) => v * (w === "hundred" ? 100 : w === "thousand" ? 1000 : 1_000_000), Number(d))));
  let bad = false;
  const products = (x: string) => x.replace(/\b(\d+) (?:times|×|x) (\d+)\b/g, (_, a: string, b: string) => String(Number(a) * Number(b)));
  t = t.replace(WORD, (run) => {
    // A run that is two numbers joined by "and" ("six and four") is read as each number.
    const parts = run.trim().split(/ and /);
    const whole = wordsValue(run.trim());
    if (whole !== null) return String(whole);
    const each = parts.map((x) => wordsValue(x));
    if (each.some((v) => v === null)) { bad = true; return run; }
    return each.join(" and ");
  });
  // "the ones place" said as "the one place", "the ten place": a place, singular.
  return bad ? null : products(t.replace(/\bthe 1 (place|digit|column)\b/g, "the @0 $1").replace(/\bthe 10 (place|digit|column)\b/g, "the @1 $1"));
}

const D = String.raw`(\d+)`;
const P = String.raw`@(\d)`;
const PL = String.raw`(?:\s(?:place|column|spot|position))?`;
/** "the 4 in 48942": a digit of a number the sentence names. */
const IN = String.raw`(?: in \d{2,})?`;
/** A value: a number ("8000"), a count of a place ("8 @3": 8 thousands), or both ("8 @3, which is 8000"). */
const V = String.raw`(\d+(?: @\d)?)`;
const valueOf = (v: string): number => {
  const m = /^(\d+)(?: @(\d))?$/.exec(v)!;
  return Number(m[1]) * 10 ** Number(m[2] ?? 0);
};

/** The number a sentence is about: one it names after "in", "of" or "for", or before "has"; else the question's. */
function referentOf(t: string, fallback: number): number {
  const m = /\b(?:in|of|for|number) (\d{2,})\b(?! @)/.exec(t) ?? /(?:^|[,:;] |\bso )(\d{2,}) (?:has|have)\b/.exec(t);
  return m ? Number(m[1]) : fallback;
}

type Reader = { re: RegExp; check: (m: RegExpExecArray, n: number, answer: number | null) => string | null };

const placeName = (k: number) => WHOLE_PLACES[k] ?? `place ${k}`;
const inNumber = (n: number, k: number) => k < String(n).length;
const digitClaim = (n: number, d: number, k: number): string | null => {
  if (!inNumber(n, k)) return `${withCommas(n)} has no ${placeName(k)} place`;
  return digitAt(n, k) === d ? null : `the digit in the ${placeName(k)} place of ${withCommas(n)} is ${digitAt(n, k)}, not ${d}`;
};
const valueClaim = (n: number, d: number | null, k: number | null, value: number): string | null => {
  // With a place: the digit there, times the place. With only a digit: some place of the number that holds it.
  if (k !== null) {
    if (!inNumber(n, k)) return `${withCommas(n)} has no ${placeName(k)} place`;
    const real = digitAt(n, k);
    if (d !== null && real !== d) return `the digit in the ${placeName(k)} place of ${withCommas(n)} is ${real}, not ${d}`;
    return real * 10 ** k === value ? null : `the ${real} in the ${placeName(k)} place is worth ${withCommas(real * 10 ** k)}, not ${withCommas(value)}`;
  }
  const at = [...Array(String(n).length).keys()].filter((j) => digitAt(n, j) === d);
  if (at.length === 0) return `${withCommas(n)} has no digit ${d}`;
  return at.some((j) => d! * 10 ** j === value) ? null : `no ${d} in ${withCommas(n)} is worth ${withCommas(value)}`;
};
const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"];
const compare = (a: number, how: string, b: number): string | null => {
  const bigger = /bigger|greater|larger|more|higher|>/.test(how);
  const holds = bigger ? a > b : a < b;
  return holds ? null : `${a} is not ${bigger ? "bigger" : "smaller"} than ${b}`;
};
const BIG = String.raw`(bigger|greater|larger|more|higher|smaller|less|fewer|lower)`;

/** The claim forms this kind reads, each checked against the number the sentence is about. */
const READERS: readonly Reader[] = [
  // "the 9 is in the thousands place", "9 is in the @3", "the 9 sits in the thousands"
  { re: new RegExp(String.raw`\b${D}${IN} (?:is|sits|goes|is written|lives) in the ${P}${PL}`, "g"), check: (m, n) => digitClaim(n, Number(m[1]), Number(m[2])) },
  // "the digit in the thousands place is 4", "the thousands digit is 4", "the thousands place has a 4", "4 is the thousands digit"
  { re: new RegExp(String.raw`\bthe digit in the ${P}${PL} (?:is|was) ${D}\b(?! @)`, "g"), check: (m, n) => (Number(m[2]) < 10 ? digitClaim(n, Number(m[2]), Number(m[1])) : valueClaim(n, null, Number(m[1]), Number(m[2]))) },
  {
    // "the thousands digit is 4"; with a number of 10 or more it is a value ("the thousands digit is 4000") or, for a
    // place, the worth of one of it ("the thousands place is 1000").
    re: new RegExp(String.raw`\bthe ${P} (digit|place|column) (?:is|was) (?:a |the )?${D}\b(?! @)`, "g"),
    check: (m, n) => {
      const [k, d] = [Number(m[1]), Number(m[3])];
      if (d < 10) return digitClaim(n, d, k);
      if (m[2] !== "digit" && d === 10 ** k) return null;
      return valueClaim(n, null, k, d);
    },
  },
  // "the thousands place is worth 1000" (one of it), or the digit's value there.
  { re: new RegExp(String.raw`\bthe ${P} (?:place|column) (?:is worth|stands for|means) ${V}\b`, "g"), check: (m, n) => (valueOf(m[2]) === 10 ** Number(m[1]) ? null : valueClaim(n, null, Number(m[1]), valueOf(m[2]))) },
  { re: new RegExp(String.raw`\bthe ${P}${PL} (?:has|holds|shows) (?:a |an |the )?${D}\b(?! @)`, "g"), check: (m, n) => digitClaim(n, Number(m[2]), Number(m[1])) },
  { re: new RegExp(String.raw`\bthere is (?:a |an )?${D} in the ${P}`, "g"), check: (m, n) => digitClaim(n, Number(m[1]), Number(m[2])) },
  { re: new RegExp(String.raw`\b${D} is the ${P} digit\b`, "g"), check: (m, n) => digitClaim(n, Number(m[1]), Number(m[2])) },
  // "2 is the digit in the tens place", "4 is the right digit for the thousands place"
  { re: new RegExp(String.raw`\b${D} is (?:the |a )?(?:right |correct )?digit (?:in|for|of) the ${P}${PL}`, "g"), check: (m, n) => digitClaim(n, Number(m[1]), Number(m[2])) },
  // Denials: "2 is not in the thousands place", "the digit in the thousands place is not 2", "the 8 is not worth 800"
  { re: new RegExp(String.raw`\b${D}${IN} (?:is not|isn't) (?:in )?the ${P}${PL}(?: digit)?`, "g"), check: (m, n) => (inNumber(n, Number(m[2])) && digitAt(n, Number(m[2])) === Number(m[1]) ? `${m[1]} is the digit in the ${placeName(Number(m[2]))} place of ${withCommas(n)}` : null) },
  { re: new RegExp(String.raw`\bthe (?:${P} digit|digit in the ${P}${PL}) (?:is not|isn't) ${D}\b(?! @)`, "g"), check: (m, n) => { const k = Number(m[1] ?? m[2]); return inNumber(n, k) && digitAt(n, k) === Number(m[3]) ? `the digit in the ${placeName(k)} place of ${withCommas(n)} is ${m[3]}` : null; } },
  { re: new RegExp(String.raw`\b${D}${IN}(?: in the ${P}${PL})? (?:is not|isn't) worth ${V}\b`, "g"), check: (m, n) => (valueClaim(n, Number(m[1]), m[2] === undefined ? null : Number(m[2]), valueOf(m[3])) === null && (m[2] !== undefined || [...Array(String(n).length).keys()].filter((j) => digitAt(n, j) === Number(m[1])).length === 1) ? `the ${m[1]} is worth ${withCommas(valueOf(m[3]))}` : null) },
  // "the 8 is worth 8000", "the 8 in the thousands place is worth 8 thousands", "the 4 means 40000"
  { re: new RegExp(String.raw`\b${D}${IN}(?: in the ${P}${PL})? (?:is worth|are worth|means|stands for|has a value of|shows) ${V}\b`, "g"), check: (m, n) => valueClaim(n, Number(m[1]), m[2] === undefined ? null : Number(m[2]), valueOf(m[3])) },
  // "the value of the 8 is 8000", "the value of the 8 in the thousands place is 8000"
  { re: new RegExp(String.raw`\bvalue of (?:the |that |this )?${D}(?: in the ${P}${PL})? (?:is|was) ${V}\b`, "g"), check: (m, n) => valueClaim(n, Number(m[1]), m[2] === undefined ? null : Number(m[2]), valueOf(m[3])) },
  // "the value of the thousands digit is 8000", "the value of the digit in the thousands place is 8000", "the thousands digit is worth 8000"
  { re: new RegExp(String.raw`\bvalue of the (?:${P} digit|digit in the ${P}${PL}) (?:is|was) ${V}\b`, "g"), check: (m, n) => valueClaim(n, null, Number(m[1] ?? m[2]), valueOf(m[3])) },
  { re: new RegExp(String.raw`\bthe (?:${P} digit|digit in the ${P}${PL})(?:'s value)? (?:is worth|has a value of|is) ${V}\b`, "g"), check: (m, n) => (/@/.test(m[3]) || valueOf(m[3]) >= 10 || /worth|value/.test(m[0]) ? valueClaim(n, null, Number(m[1] ?? m[2]), valueOf(m[3])) : null) },
  // "4 ten thousands is 40000", "8 thousands, which is 8000", "8 thousands make 8000"
  {
    re: new RegExp(String.raw`\b${D} ${P},? (?:which |that )?(?:is|are|makes?|equals|is worth|are worth|is the same as) ${V}\b`, "g"),
    check: (m) => {
      const left = Number(m[1]) * 10 ** Number(m[2]);
      return left === valueOf(m[3]) ? null : `${m[1]} ${placeName(Number(m[2]))} is ${withCommas(left)}, not ${withCommas(valueOf(m[3]))}`;
    },
  },
  // "48942 has 4 ten thousands", "48942 has 4 ten thousands, 8 thousands and 9 hundreds"; "there are 4 ten thousands in 48942"
  {
    re: new RegExp(String.raw`\b(\d{2,}) (?:has|have) (\d+ @\d(?:(?:,| and|, and) \d+ @\d)*)`, "g"),
    check: (m) => {
      const n = Number(m[1]);
      for (const q of m[2].matchAll(/(\d+) @(\d)/g)) {
        const [d, k] = [Number(q[1]), Number(q[2])];
        if (!inNumber(n, k)) return `${withCommas(n)} has no ${placeName(k)} place`;
        if (d !== digitAt(n, k) && d !== Math.floor(n / 10 ** k)) return `${withCommas(n)} has ${digitAt(n, k)} in the ${placeName(k)} place, not ${d}`;
      }
      return null;
    },
  },
  { re: new RegExp(String.raw`\bthere (?:is|are) ${D} ${P} in (\d{2,})`, "g"), check: (m) => { const [d, k, n] = [Number(m[1]), Number(m[2]), Number(m[3])]; return !inNumber(n, k) ? `${withCommas(n)} has no ${placeName(k)} place` : d === digitAt(n, k) || d === Math.floor(n / 10 ** k) ? null : `${withCommas(n)} has ${digitAt(n, k)} in the ${placeName(k)} place, not ${d}`; } },
  // "48942 has 5 digits"
  { re: /\b(\d{2,}) (?:has|have) (\d+) digits\b/g, check: (m) => (String(Number(m[1])).length === Number(m[2]) ? null : `${withCommas(Number(m[1]))} has ${String(Number(m[1])).length} digits, not ${m[2]}`) },
  // "the thousands place is the fourth place from the right"
  {
    re: new RegExp(String.raw`\bthe ${P}${PL} is (?:the )?(${ORDINALS.join("|")}|\d(?:st|nd|rd|th)?) (?:places? |digits? |columns? |one )?from the (right|left)\b`, "g"),
    check: (m, n) => {
      const k = Number(m[1]);
      const at = ORDINALS.includes(m[2]) ? ORDINALS.indexOf(m[2]) + 1 : Number(m[2].replace(/\D/g, ""));
      const want = m[3] === "right" ? k + 1 : String(n).length - k;
      return at === want ? null : `the ${placeName(k)} place is the ${ORDINALS[want - 1] ?? `${want}th`} place from the ${m[3]} in ${withCommas(n)}`;
    },
  },
  // "it is 4 ten thousands", "so it is worth 40000", "its value is 40000": a digit of the number, or a digit's value there.
  {
    re: new RegExp(String.raw`\b(?:it|its value|this digit|that digit|the digit|this one|that one|that|this) (?:is|is worth|has a value of|means|stands for) ${V}\b`, "g"),
    check: (m, n, answer) => {
      const v = valueOf(m[1]);
      if (v === answer || v === n) return null;
      const digits = [...Array(String(n).length).keys()];
      if (!/@/.test(m[1]) && v < 10) return digits.some((j) => digitAt(n, j) === v) ? null : `${withCommas(n)} has no digit ${v}`;
      return digits.some((j) => digitAt(n, j) * 10 ** j === v) ? null : `no digit of ${withCommas(n)} is worth ${withCommas(v)}`;
    },
  },
  // "4000 is the thousands place", "4000 is in the thousands": a value that belongs to a place (1 to 9 of it).
  { re: new RegExp(String.raw`\b(\d+) (?:is|is in|belongs to|goes in) the ${P}${PL}`, "g"), check: (m) => { const [v, k] = [Number(m[1]), Number(m[2])]; return v < 10 || (v % 10 ** k === 0 && v / 10 ** k >= 1 && v / 10 ** k <= 9) ? null : `${withCommas(v)} is not a digit's value in the ${placeName(k)} place`; } },
  // "the thousands digit is bigger than the hundreds digit", "the 6 is bigger than the 4", "6 is bigger than 4", "6 > 4"
  {
    re: new RegExp(String.raw`\bthe (?:${P} digit|digit in the ${P}${PL}) is ${BIG} than the (?:${P} digit|digit in the ${P}${PL})`, "g"),
    check: (m, n) => {
      const [ka, kb] = [Number(m[1] ?? m[2]), Number(m[4] ?? m[5])];
      if (!inNumber(n, ka) || !inNumber(n, kb)) return `${withCommas(n)} has no ${placeName(inNumber(n, ka) ? kb : ka)} place`;
      return compare(digitAt(n, ka), m[3], digitAt(n, kb));
    },
  },
  { re: new RegExp(String.raw`\b${D} is ${BIG} than (?:the )?${D}\b(?! @)`, "g"), check: (m) => compare(Number(m[1]), m[2], Number(m[3])) },
  { re: /\b(\d+) ?([<>]) ?(\d+)\b/g, check: (m) => compare(Number(m[1]), m[2], Number(m[3])) },
];

/** A sentence that only asks: "Which digit is in the thousands place?" (its claims are still read). */
const ASKS = /^(?:so |now |ok |okay )?(?:which|what|how|where|can|could|is|are|do|does|did|will|would|why)\b[^.!]*\?$/;
/** A word that says something about a number. */
const CLAIM_VERB = /\b(?:is|are|was|were|has|have|holds|shows|means|stands|worth|equals|makes?|gives|tells)\b|=/;

/**
 * Maya's place claims in one sentence that do not hold, checked against the number the sentence is about (the
 * question's unless the sentence names another after "in" or "of"). Fail closed: a sentence that says something about a
 * place and a number in a form no reader matches is a problem too.
 */
function claimProblems(pkg: OperationPackage, sentence: string): string[] {
  const f = must(pkg);
  const t = normalized(sentence.trim().replace(/[.!]+$/, ""));
  if (t === null) return ["it has number words code cannot read"];
  const n = referentOf(t, f.n);
  const problems: string[] = [];
  // Each matched claim is blanked, by position, from what the fail-closed check reads.
  const mask = [...t];
  for (const r of READERS) {
    for (const m of t.matchAll(r.re)) {
      const problem = r.check(m as RegExpExecArray, n, n === f.n && typeof f.answer === "number" ? f.answer : null);
      if (problem) problems.push(problem);
      for (let i = m.index!; i < m.index! + m[0].length; i++) mask[i] = " ";
    }
  }
  let rest = mask.join("");
  if (problems.length) return [...new Set(problems)];
  // Fail closed: what is left still names a place and a number and says something.
  // A number Maya says is not the answer ("not 4 ones", "not 4,000") states nothing about the number.
  rest = rest.replace(/\b(?:in|of|for|number) \d{2,}\b/g, " ").replace(/\bnot (?:the |a )?\d+(?: @\d)?/g, " ");
  if (!ASKS.test(t.trim()) && /@\d/.test(rest) && /\b\d+\b/.test(rest.replace(/@\d/g, " ")) && CLAIM_VERB.test(rest)) {
    return ["it says something about a place and a number that code cannot read: say it as \"the 9 is in the thousands place\" or \"the 9 is worth 9,000\""];
  }
  return [];
}

function notes(pkg: OperationPackage): string[] {
  const f = must(pkg);
  return [
    `The places of ${withCommas(f.n)} from the right: ${countTo(f.length - 1)}.`,
    "Each place is worth 10 times the place to its right. A digit's value is the digit times its place: the digit 4 in the ten thousands place is worth 4 ten thousands, which is 40,000.",
    `Code checks each place claim against ${withCommas(f.n)}, unless the sentence names another number ("in 847").`,
  ];
}

export const placeValueKind: TutorKind = {
  id: "place-value",
  fits,
  steps,
  numberMeaning,
  workValues,
  streamScope,
  stepQuestion,
  drawings,
  draw,
  claimProblems,
  notes,
};
