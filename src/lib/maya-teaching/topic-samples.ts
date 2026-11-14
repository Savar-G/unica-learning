// Synthetic printed workbook packages with the template shapes of the "other-topic" group (Maya coverage, Wave C), for
// tests, the behaviour gate and the practice suite. Each is a package as the generator stores it: no operation, an item
// with one template check, and the template source with its slot values. The numbers are free choices, never a
// customer's. Pure TypeScript.
import type { AnswerValue, QuestionPackage } from "@/lib/question-package";
import type { TemplateSource } from "@/lib/question-package-template";
import { SYMMETRY_LINES } from "./symmetry";

const int = (n: number) => ({ int: String(n) });
const shapeList = `[${SYMMETRY_LINES.map(([name]) => `'${name}'`).join(", ")}]`;

/** A printed package with one template-checked answer box (write-number, or write-words for a word answer). */
export function printed(id: string, templateId: string, skill: string, text: string, source: TemplateSource, answer: AnswerValue, format = "write-number"): QuestionPackage {
  return {
    id,
    ref: { source: "workbook", workbookId: "other-topic-samples", page: 1, question: 1 },
    templateId,
    textSource: "code",
    text,
    item: {
      format,
      error: null,
      scorable: true,
      parentChecked: false,
      checks: [{ kind: "template", region: "answer", source }],
      regions: [{ id: "answer", kind: "box", label: null, answer }],
    },
    answer: null,
    operation: null,
    steps: [],
    skill: { standard: skill.split("-")[0], skills: [skill] },
    level: 16,
    difficulty: 1,
    wrongAnswers: [],
    easierExample: null,
  } as QuestionPackage;
}

/** "Roll a die numbered 1 to {last}. How many of the numbers are {kind}?" (4.17-predict-outcome#3.2:story). */
export function diePrinted(last: number, kind: "odd" | "even", answer = Math.floor(last / 2)): QuestionPackage {
  return printed(`sample-die-${last}-${kind}`, "4.17-predict-outcome#3.2:story", "4.17-predict-outcome",
    `Roll a die numbered 1 to ${last}. How many of the numbers are ${kind}?`, {
      answer: "s // 2", check: "s % 2 == 0", values: null,
      slots: [{ name: "s", value: int(last), domain: { min: 6, max: 12 } }, { name: "flip", value: int(kind === "even" ? 0 : 1), domain: { min: 0, max: 1 } }],
      derived: [["kind", "'even' if flip == 0 else 'odd'"]],
    }, { type: "number", value: answer });
}

/** "How many lines of symmetry do {A} and {B} have in all?" (4.15-line-symmetry#3.5:bare), shapes by table index. */
export function symmetryPrinted(i: number, j: number): QuestionPackage {
  return printed(`sample-symmetry-${i}-${j}`, "4.15-line-symmetry#3.5:bare", "4.15-line-symmetry",
    `How many lines of symmetry do ${SYMMETRY_LINES[i][0]} and ${SYMMETRY_LINES[j][0]} have in all?`, {
      answer: "L[i] + L[j]", check: "i != j", values: null,
      slots: [{ name: "i", value: int(i), domain: { min: 0, max: 5 } }, { name: "j", value: int(j), domain: { min: 0, max: 5 } }],
      derived: [["L", `[${SYMMETRY_LINES.map(([, n]) => n).join(", ")}]`], ["A", `${shapeList}[i]`], ["B", `${shapeList}[j]`]],
    }, { type: "number", value: SYMMETRY_LINES[i][1] + SYMMETRY_LINES[j][1] });
}

/** "A rectangle has length {l} {unit} and width {w} {unit}, ... What is its perimeter in {unit}?" (4.14-perimeter#3.1:bare). */
export function perimeterPrinted(length: number, width: number, unit = "m"): QuestionPackage {
  return printed(`sample-perimeter-${length}-${width}`, "4.14-perimeter#3.1:bare", "4.14-perimeter",
    `A rectangle has length ${length} ${unit} and width ${width} ${unit}, but only two sides are labelled. What is its perimeter in ${unit}?`, {
      answer: "2 * (l + w)", check: "w <= l", values: null, derived: [],
      slots: [{ name: "l", value: int(length), domain: { min: 9, max: 250 } }, { name: "w", value: int(width), domain: { min: 5, max: 150 } }],
    }, { type: "number", value: 2 * (length + width) });
}

/** A printed true/false package: one template-choice check on a circled "true" or "false". */
export function choicePrinted(templateId: string, text: string, source: TemplateSource, word: "true" | "false"): QuestionPackage {
  const pkg = printed(`sample-${templateId}`, templateId, templateId.split("#")[0], text, source, { type: "text", value: word }, "circle");
  pkg.item!.checks = [{ kind: "template-choice", region: "answer", source }];
  pkg.item!.regions = [{ id: "answer", kind: "choice", mark: "circle", label: null, choices: ["true", "false"], answer: word }];
  return pkg;
}

const SCALE_DERIVED: [string, string][] = [["k", "2 + 8 * (u1 % 2)"], ["v", "10 * (2 + u2 % 9)"], ["shown", "(v + m * k) if flip == 0 else (v + m * k) + (k)"], ["lower", "v - k"], ["upper", "v + k"]];
const MONEY_DERIVED: [string, string][] = [["w", "b20 * 2000 + qu * 25"], ["shown", "str((w if flip == 0 else w + 50) // 100) + '.' + ('0' + str((w if flip == 0 else w + 50) % 100) if (w if flip == 0 else w + 50) % 100 < 10 else str((w if flip == 0 else w + 50) % 100))"]];
const slotsOf = (values: Record<string, number>, max = 12) => Object.entries(values).map(([name, v]) => ({ name, value: int(v), domain: { min: 0, max } }));

/** "A scale's marks are .... True or false: {m} intervals above {v} is {shown}." (4.16-many-to-one#3.4), step 2 or 10. */
export function scalePrinted(step: 2 | 10, v: number, m: number, holds: boolean): QuestionPackage {
  const shown = v + m * step + (holds ? 0 : step);
  return choicePrinted("4.16-many-to-one#3.4:true-false", `A scale's marks are ${v - step}, ${v}, ${v + step}. True or false: ${m} intervals above ${v} is ${shown}.`,
    { answer: "'true' if flip == 0 else 'false'", check: null, values: null, derived: SCALE_DERIVED, slots: slotsOf({ u1: step === 10 ? 1 : 0, u2: v / 10 - 2, m, flip: holds ? 0 : 1 }, 9) },
    holds ? "true" : "false");
}

/** "True or false: {bills} $20 bills and {quarters} quarters is ${shown}." (4.18-money-notation#3.3). */
export function moneyPrinted(bills: number, quarters: number, holds: boolean): QuestionPackage {
  const cents = bills * 2000 + quarters * 25 + (holds ? 0 : 50);
  const shown = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
  return choicePrinted("4.18-money-notation#3.3:true-false", `True or false: ${bills} $20 bills and ${quarters} quarters is $${shown}.`,
    { answer: "'true' if flip == 0 else 'false'", check: null, values: null, derived: MONEY_DERIVED, slots: slotsOf({ b20: bills, qu: quarters, flip: holds ? 0 : 1 }, 3) },
    holds ? "true" : "false");
}

/** "True or false: the minute hand {marks} marks past the {number} shows {shown} minutes." (4.12-read-analog#3.4). */
export function minutePrinted(marks: number, number: number, holds: boolean): QuestionPackage {
  const shown = number * 5 + marks - (holds ? 0 : 1);
  return choicePrinted("4.12-read-analog#3.4:true-false", `True or false: the minute hand ${marks} marks past the ${number} shows ${shown} minutes.`,
    { answer: "'true' if flip == 0 else 'false'", check: "x >= 2", values: null, derived: [["shown", "k * 5 + x if flip == 0 else k * 5 + x - 1"]], slots: slotsOf({ x: marks, k: number, flip: holds ? 0 : 1 }, 11) },
    holds ? "true" : "false");
}

const ELAPSED_DERIVED: [string, string][] = [["t", "hr * 60 + mm"], ["e", "t + m"], ["ts", "str((t // 60 - 1) % 12 + 1) + ':' + ('00' if t % 60 == 0 else ('0' + str(t % 60) if t % 60 < 10 else str(t % 60)))"]];
const two = (n: number) => String(n).padStart(2, "0");

/**
 * "What time is {minutes} minutes after {h}:{mm}?": the elapsed-time template (4.12-read-analog#3.5) for a start with
 * minutes, the on-the-hour template (#3.2) for a start on the hour.
 */
export function clockPrinted(h: number, mm: number, minutes: number): QuestionPackage {
  const end = h * 60 + mm + minutes;
  const answer = `${((Math.floor(end / 60) - 1) % 12) + 1}:${two(end % 60)}`;
  const text = `What time is ${minutes} minutes after ${h}:${two(mm)}?`;
  if (mm === 0) {
    return printed(`sample-clock-${h}-${minutes}`, "4.12-read-analog#3.2:bare", "4.12-read-analog", text,
      { answer: "str(h) + ':' + (('0' + str(m)) if m < 10 else str(m))", check: null, values: null, derived: [], slots: slotsOf({ h, m: minutes }, 59) },
      { type: "text", value: answer }, "write-words");
  }
  return printed(`sample-clock-${h}-${mm}-${minutes}`, "4.12-read-analog#3.5:bare", "4.12-read-analog", text,
    { answer: "str((e // 60 - 1) % 12 + 1) + ':' + ('00' if e % 60 == 0 else ('0' + str(e % 60) if e % 60 < 10 else str(e % 60)))", check: null, values: null, derived: ELAPSED_DERIVED, slots: slotsOf({ hr: h, mm, m: minutes }, 59) },
    { type: "text", value: answer }, "write-words");
}

/** "True or false: with {a} red, {b} blue and {c} green marbles, red is more likely than the other colours together." */
export function marblesPrinted(a: number, b: number, c: number): QuestionPackage {
  return choicePrinted("4.17-predict-outcome#3.3:true-false", `True or false: with ${a} red, ${b} blue and ${c} green marbles, red is more likely than the other colours together.`,
    { answer: "'true' if a > b + c else 'false'", check: "a != b + c and 8 <= a + b + c <= 12", values: null, derived: [], slots: slotsOf({ a, b, c }, 12) },
    a > b + c ? "true" : "false");
}

const AREA_DERIVED: [string, string][] = [["a", "2 + a0 % 7"], ["b", "2 + b0 % min(7, 50 // a - 1)"], ["c", "2 + c0 % 7"], ["d", "2 + d0 % min(7, 50 // c - 1)"]];

/** "True or false: {a} by {b} squares is bigger than {c} by {d} squares." (3.9-area-square-units#4.3); small sides. */
export function areaClaimPrinted(a: number, b: number, c: number, d: number): QuestionPackage {
  return choicePrinted("3.9-area-square-units#4.3:true-false", `True or false: ${a} by ${b} squares is bigger than ${c} by ${d} squares.`,
    { answer: "'true' if a * b > c * d else 'false'", check: "a * b != c * d", values: null, derived: AREA_DERIVED, slots: slotsOf({ a0: a - 2, b0: b - 2, c0: c - 2, d0: d - 2 }, 8) },
    a * b > c * d ? "true" : "false");
}
