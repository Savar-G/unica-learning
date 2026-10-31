// Sample books (#310): a whole workbook of deterministic sample content for any level, so every page type renders
// without AI (the AI generator is #311). It plans the book with the real planner (src/lib/workbook-plan.ts) for a
// child at the level's grade, then fills every planned slot (src/lib/workbook-page.ts) with sample questions that pass
// the question package check: whole-number and decimal arithmetic chosen by level band, stories, Mixed set, Solve it two
// ways, Spot the error, written reasons, Math in the world parts, parent-led circle and picture items. The numbers are
// placeholders for the look: they do not teach the planned skill (the generator writes those).
//
// A slot gets the items the plan asks for, up to what the slot takes (slotMax); `capped` lists each slot that had to
// take fewer, so a plan that asks for more than a page holds shows up.
// Pure TypeScript: no Next.js, React, network, database, clock or Math.random.
import { BC_SKILL_MAP, type Grade } from "@/lib/assessment";
import {
  checkQuestionPackage,
  operationResult,
  operationText,
  workedSteps,
  type AnswerValue,
  type Item,
  type NumberValue,
  type Operation,
  type QuestionPackage,
  type WrongAnswer,
} from "@/lib/question-package";
import { curriculumFor } from "@/lib/workbook-curriculum";
import {
  assembleBook,
  pageSlots,
  type FilledBlock,
  type FilledDayPage,
  type Figure,
  type PlannedSlot,
} from "@/lib/workbook-page";
import { DEFAULT_STEPS, planLevel, planWorkbook, type PlanInput, type PlannedPage, type WorkbookPlan } from "@/lib/workbook-plan";
import type { WorkbookDraft } from "@/lib/workbook-render";
import { slotMax } from "@/lib/workbook-template";

const BC = curriculumFor("bc")!;
const SKILLS = new Map(BC_SKILL_MAP.standards.flatMap((s) => s.skills.map((k) => [k.id, s.code] as const)));

// ---------- Deterministic numbers ----------

/** A small seeded generator (mulberry32): the same seed gives the same numbers. */
function seeded(seed: string): (min: number, max: number) => number {
  let h = 1779033703;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 3432918353);
  let a = h >>> 0;
  return (min, max) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return min + Math.floor(r * (max - min + 1));
  };
}
type Rand = ReturnType<typeof seeded>;

// ---------- Packages ----------

/** Easier operations to try, smallest first: the first that passes the check is the easier example. */
const EASIER: Record<string, Operation[]> = {
  add: [{ kind: "add", operands: [2, 1] }, { kind: "add", operands: [3, 4] }, { kind: "add", operands: [12, 5] }, { kind: "add", operands: [21, 13] }],
  subtract: [{ kind: "subtract", operands: [5, 2] }, { kind: "subtract", operands: [8, 3] }, { kind: "subtract", operands: [17, 5] }, { kind: "subtract", operands: [26, 13] }],
  multiply: [{ kind: "multiply", operands: [2, 1] }, { kind: "multiply", operands: [2, 3] }, { kind: "multiply", operands: [12, 2] }, { kind: "multiply", operands: [21, 3] }],
  divide: [{ kind: "divide", operands: [4, 2] }, { kind: "divide", operands: [6, 3] }, { kind: "divide", operands: [24, 2] }, { kind: "divide", operands: [36, 3] }],
  "decimal-add": [{ kind: "decimal-add", operands: [0.2, 0.3] }, { kind: "decimal-add", operands: [1.2, 0.3] }, { kind: "decimal-add", operands: [2.1, 1.4] }],
  "decimal-subtract": [{ kind: "decimal-subtract", operands: [0.5, 0.2] }, { kind: "decimal-subtract", operands: [1.5, 0.3] }, { kind: "decimal-subtract", operands: [2.8, 1.4] }],
};

const num = (value: number): NumberValue => ({ type: "number", value });
const round = (v: number) => Math.round(v * 1000) / 1000;

/** Wrong answers to try: the other operation, then near misses. */
function wrongs(op: Operation): WrongAnswer[] {
  const [a, b] = op.operands as [number, number];
  const right = operationResult(op);
  const r = right.type === "number" ? right.value : right.type === "remainder" ? right.quotient : 0;
  const other: Record<string, number> = { add: a - b, subtract: a + b, multiply: a + b, divide: a * b, "decimal-add": round(a - b), "decimal-subtract": round(a + b) };
  return [
    { value: num(other[op.kind] ?? r + 10), cause: "operation", description: "Uses the wrong operation", step: null },
    { value: num(round(r + 10)), cause: "careless", description: "A slip in one column", step: null },
    { value: num(round(r + 1)), cause: "careless", description: "Counts on one too many", step: null },
  ].filter((w) => w.value.type === "number" && w.value.value >= 0);
}

interface At {
  id: string;
  skill: string;
  level: number;
}

const base = (at: At, text: string): Omit<QuestionPackage, "answer" | "operation" | "steps" | "wrongAnswers" | "easierExample"> => ({
  id: at.id,
  // The book gives each package its place; this ref is replaced.
  ref: { source: "workbook", workbookId: "sample", page: 1, question: 1 },
  templateId: null,
  text,
  skill: { standard: SKILLS.get(at.skill)!, skills: [at.skill] },
  level: at.level,
  difficulty: 2,
});

/** A package of an operation, with an easier example and wrong answers that pass the check; throws when none does. */
function opPackage(at: At, op: Operation, text: string, item?: (p: QuestionPackage) => Item, unit: string | null = null): QuestionPackage {
  for (const easier of EASIER[op.kind] ?? []) {
    for (const wrong of wrongs(op)) {
      const p: QuestionPackage = {
        ...base(at, text),
        answer: { value: operationResult(op), accepted: [], unit },
        operation: op,
        steps: workedSteps(op),
        wrongAnswers: [wrong],
        easierExample: { text: `${operationText(easier)} = ?`, operation: easier, answer: operationResult(easier), steps: workedSteps(easier) },
      };
      if (item) p.item = item(p);
      if (checkQuestionPackage(p).ok) return p;
    }
  }
  // A sum too small for any smaller easier example (3 × 3, 9 − 3): its boxes checked as an equation, with no operation.
  const [a, b] = op.operands as [number, number];
  const sign = { add: "+", subtract: "−", multiply: "×", divide: "÷" } as const;
  const right = operationResult(op);
  if (op.kind in sign && right.type === "number") {
    const equation = (region: string) => ({
      kind: "equations" as const, different: false, numbers: "whole" as const,
      equations: [{ left: num(a), op: sign[op.kind as keyof typeof sign], right: num(b), result: { region } }],
    });
    const fake: QuestionPackage = { ...base(at, text), answer: { value: right, accepted: [], unit }, operation: op, steps: [], wrongAnswers: [], easierExample: null };
    const own = item ? item(fake) : { format: "write-number" as const, scorable: true, parentChecked: false, error: null, regions: [box("answer", null, right)], checks: [opCheck("answer")] };
    if (own.checks.every((c) => c.kind === "operation")) {
      return itemPackage(at, text, { ...own, checks: own.checks.map((c) => equation((c as { region: string }).region)) });
    }
  }
  throw new Error(`sample book: no sample package passes the check for ${operationText(op)} (${text})`);
}

/** A package with no operation: its item holds the answers. Must be checked or "not checked by code". */
function itemPackage(at: At, text: string, item: Item): QuestionPackage {
  const p: QuestionPackage = { ...base(at, text), answer: null, operation: null, steps: [], wrongAnswers: [], easierExample: null, item };
  const check = checkQuestionPackage(p);
  if (!check.ok && check.status !== "not-checked") throw new Error(`sample book: ${text}: ${check.reason}`);
  return p;
}

const answerOf = (p: QuestionPackage) => p.answer!.value;
const signOf = (op: Operation) => (op.kind.endsWith("add") ? "+" : op.kind.endsWith("subtract") ? "−" : op.kind === "multiply" ? "×" : "÷");

// ---------- Items by kind ----------

type Band = "parent" | "early" | "mid" | "upper";
const bandOf = (level: number): Band => (level <= 3 ? "parent" : level <= 9 ? "early" : level <= 18 ? "mid" : "upper");

/** A fact of the warm-up. */
function factOp(band: Band, r: Rand): Operation {
  if (band === "parent") return { kind: "add", operands: [r(1, 5), r(1, 4)] };
  if (band === "early") return r(0, 1) ? { kind: "add", operands: [r(3, 9), r(2, 9)] } : { kind: "subtract", operands: [r(10, 18), r(2, 9)] };
  const a = r(3, 9);
  const b = r(3, 9);
  return r(0, 2) === 0 ? { kind: "divide", operands: [a * b, a] } : { kind: "multiply", operands: [a, b] };
}

/** A sum big enough to work two ways or show an error: two digits with a carry below U10, three digits from U10. */
function richOp(band: Band, r: Rand): Operation {
  return band === "parent" || band === "early"
    ? { kind: "add", operands: [r(14, 58), r(17, 39)] }
    : { kind: "add", operands: [r(128, 586), r(117, 389)] };
}

/** A number with two decimal places (never a whole tenth, so it stays a hundredths sum). */
const hundredths = (n: number) => (n % 10 === 0 ? n + 3 : n) / 100;

/** A practice sum: harder by band. */
function practiceOp(band: Band, r: Rand, level: number): Operation {
  switch (band) {
    case "parent": return { kind: "add", operands: [r(1, 5), r(1, 4)] };
    case "early": return level <= 6
      ? { kind: "add", operands: [r(4, 9), r(3, 9)] }
      : r(0, 1) ? { kind: "add", operands: [r(14, 58), r(13, 39)] } : { kind: "subtract", operands: [r(41, 95), r(12, 38)] };
    case "mid": return r(0, 1) ? { kind: "add", operands: [r(128, 586), r(117, 389)] } : { kind: "subtract", operands: [r(512, 948), r(127, 486)] };
    case "upper": return r(0, 1)
      ? { kind: "decimal-add", operands: [hundredths(r(105, 980)), hundredths(r(105, 690))] }
      : { kind: "multiply", operands: [r(12, 48), r(3, 9)] };
  }
}

const NAMES = ["Mateo", "Leah", "Ava", "Ethan", "Priya", "Noah", "Sara", "Jun"];
const THINGS = ["stickers", "marbles", "books", "shells", "cards", "pencils", "apples", "beads"];

/** A one- or two-step story with its operation. */
function storyOf(band: Band, r: Rand): { op: Operation; text: string; unit: string } {
  const who = NAMES[r(0, NAMES.length - 1)];
  const thing = THINGS[r(0, THINGS.length - 1)];
  if (band === "parent" || band === "early") {
    const a = band === "parent" ? r(2, 5) : r(6, 15);
    const b = band === "parent" ? r(1, 4) : r(3, 9);
    return r(0, 1)
      ? { op: { kind: "add", operands: [a, b] }, text: `${who} has ${a} ${thing}. Mom gives ${b} more. How many now?`, unit: thing }
      : { op: { kind: "subtract", operands: [a + b, b] }, text: `${who} has ${a + b} ${thing}. ${b} roll away. How many are left?`, unit: thing };
  }
  if (band === "mid") {
    const a = r(124, 468);
    const b = r(115, 379);
    return r(0, 1)
      ? { op: { kind: "add", operands: [a, b] }, text: `A school collected ${a} ${thing} in May and ${b} in June. How many ${thing} is that in all?`, unit: thing }
      : { op: { kind: "subtract", operands: [a + b, b] }, text: `A shop had ${a + b} ${thing}. It sold ${b}. How many ${thing} are left?`, unit: thing };
  }
  const rows = r(12, 36);
  const each = r(4, 9);
  return { op: { kind: "multiply", operands: [rows, each] }, text: `A ferry has ${rows} rows with ${each} seats in each row. How many seats are there?`, unit: "seats" };
}

/** A Mixed set story where the child picks the operation. */
function mixedOf(band: Band, r: Rand): { op: Operation; text: string } {
  const who = NAMES[r(0, NAMES.length - 1)];
  const thing = THINGS[r(0, THINGS.length - 1)];
  const k = r(0, band === "upper" ? 3 : 1);
  const a = r(24, 96);
  const b = r(3, 9);
  switch (k) {
    case 0: return { op: { kind: "add", operands: [a, b * 7] }, text: `${who} has ${a} ${thing} and finds ${b * 7} more. How many ${thing} is that in all?` };
    case 1: return { op: { kind: "subtract", operands: [a + 40, a] }, text: `A bus has ${a + 40} seats. ${a} are taken. How many seats are empty?` };
    case 2: return { op: { kind: "multiply", operands: [b, 12] }, text: `A box holds 12 ${thing}. ${who} has ${b} boxes. How many ${thing} is that?` };
    default: return { op: { kind: "divide", operands: [b * 8, 8] }, text: `${b * 8} ${thing} are shared equally between 8 friends. How many does each friend get?` };
  }
}

const box = (id: string, label: string | null, answer: AnswerValue | null) => ({ id, kind: "box" as const, label, answer });
const opCheck = (region: string) => ({ kind: "operation" as const, region });

// ---------- Topics ----------

/** A short topic for a skill and step: the drafted step's name, else the skill's text up to its first clause. */
function topicOf(skill: string | undefined, step: number | undefined): string {
  if (!skill) return "Review";
  const named = step ? BC.skillSteps(skill)?.[step - 1]?.name : undefined;
  if (named) return named;
  const text = BC.skill(skill)?.text ?? skill;
  const clause = text.split(/,| \(| with | by | and | to tell | that /)[0];
  const words = clause.split(" ");
  let out = "";
  for (const w of words) {
    if ((out + " " + w).trim().length > 30) break;
    out = (out + " " + w).trim();
  }
  return (out || text.slice(0, 30)).replace(/[:;,.]+$/, "");
}

// ---------- Filling slots ----------

interface FillCtx {
  plan: WorkbookPlan;
  level: number;
  band: Band;
  workbookId: string;
  day: number;
  page: PlannedPage;
  capped: string[];
  next: () => string;
}

const firstSkill = (page: PlannedPage, part: number) => page.parts[part]?.skills[0] ?? page.parts.find((p) => p.skills.length > 0)!.skills[0];

function fillSlot(s: PlannedSlot, index: number, ctx: FillCtx): FilledBlock {
  const { band, level, page, day } = ctx;
  const r = seeded(`${ctx.workbookId}:${day}:${page.number}:${index}:${s.slot}`);
  const part = page.parts[s.part];
  const at = (): At => ({ id: ctx.next(), skill: firstSkill(page, s.part), level });
  const max = Math.max(0, Math.min(s.items, slotMax(s.slot, { level, pages: ctx.plan.days[day - 1].pages.length })));
  if (max < s.items) ctx.capped.push(`day ${day} page ${page.number} ${s.slot}: ${s.items} planned, ${max} placed`);
  const times = <T,>(n: number, f: (k: number) => T) => Array.from({ length: n }, (_, k) => f(k));
  const line = () => {
    const op = practiceOp(band, r, level);
    return opPackage(at(), op, `${operationText(op)} =`);
  };
  const parentItem = (k: number): QuestionPackage => {
    const a = r(1, 5);
    const b = r(1, 4);
    if (k % 3 === 0) {
      const choices = [String(a + b - 1), String(a + b), String(a + b + 2)];
      return itemPackage(at(), `Circle how many dots.`, {
        format: "circle", scorable: false, parentChecked: true, checks: [], error: null,
        regions: [{ id: "pick", kind: "choice", mark: "circle", label: null, choices, answer: String(a + b) }],
      });
    }
    if (k % 3 === 1) {
      return itemPackage(at(), `Colour ${a} of the squares.`, {
        format: "colour-or-shade", scorable: false, parentChecked: true, checks: [], error: null,
        regions: [{ id: "picture", kind: "picture", label: null }],
      });
    }
    const op: Operation = { kind: "add", operands: [a, b] };
    return opPackage(at(), op, `${operationText(op)} =`);
  };
  const parentFigure = (p: QuestionPackage): Figure | null => {
    if (p.item?.format === "circle") return { kind: "dots", groups: [Number((p.item.regions[0] as { answer: string }).answer)] };
    if (p.item?.format === "colour-or-shade") return { kind: "ten-frame", filled: 0 };
    const op = p.operation;
    return op && op.kind === "add" ? { kind: "ten-frame", filled: op.operands[0] as number } : null;
  };
  const parentList = (n: number): FilledBlock => {
    const items = times(n, parentItem);
    return { slot: s.slot, items, figures: items.map(parentFigure) };
  };
  if (band === "parent" && !["worked-example", "watch-one", "reminder", "how-do-you-know", "math-in-the-world", "solve-it-two-ways"].includes(s.slot)) {
    return parentList(max);
  }

  switch (s.slot) {
    case "warm-up": return { slot: s.slot, items: times(max, () => { const op = factOp(band, r); return opPackage(at(), op, `${operationText(op)} =`); }) };
    case "fix-it": case "remember-these": case "unit-check": case "mini-test": case "already-know-it": case "friday-5": case "show-what-you-know":
    case "level-test": case "on-your-own": case "practice-row": case "unit-b-practice": case "try-first": {
      const items = times(max, () => line());
      const labels = ["Two digits", "Harder: three digits", "Look first: some don't need a trade"];
      return {
        slot: s.slot, items,
        ...(s.slot === "practice-row" ? { label: labels[Math.min(index, labels.length - 1)] } : {}),
        ...(s.slot === "unit-b-practice" ? { note: "Write the answer in the box." } : {}),
        ...(s.slot === "on-your-own" && index === 0 ? { note: "Work each one in columns." } : {}),
      };
    }
    case "in-your-head": {
      const op: Operation = { kind: "add", operands: [r(25, 49), 19] };
      return {
        slot: s.slot, items: [opPackage(at(), op, `${operationText(op)} =`, (p) => ({
          format: "write-number", scorable: true, parentChecked: false, error: null,
          regions: [box("answer", null, answerOf(p)), { id: "how", kind: "lines", label: "How did you work it out?" }],
          checks: [opCheck("answer")],
        }))],
      };
    }
    case "worked-example": {
      const op = richOp(band, r);
      const [a, b] = op.operands as [number, number];
      const sign = signOf(op);
      const result = operationResult(op);
      const res = result.type === "number" ? result.value : 0;
      return {
        slot: s.slot, items: [], label: `${a} ${sign} ${b}`,
        note: part?.unit === "B" ? "Unit B · new step" : "Unit A · new step",
        methods: [
          { label: "In columns", lines: [`  ${a}`, `${sign} ${b}`, `= [${res}]`] },
          { label: "Split it", lines: sign === "+" ? [`${a} + ${b - (b % 10)} = [${a + b - (b % 10)}]`, `${a + b - (b % 10)} + ${b % 10} = [${res}]`] : [`${a} ${sign} ${b} = [${res}]`, `Check: ${res} and back again`] },
        ],
        explain: "Both ways give the same answer. Check with the other way.",
      };
    }
    case "now-you": {
      const items = times(max, (k) => {
        if (k === max - 1 && band !== "parent") {
          const n = r(12, 30);
          const f = [2, 3, 4, 5][r(0, 3)];
          const right = n % f === 0;
          return itemPackage(at(), `Is ${f} a factor of ${n}? Tick yes or no.`, {
            format: "tick-one", scorable: true, parentChecked: false, error: null,
            regions: [{ id: "pick", kind: "choice", mark: "tick", label: null, choices: ["yes", "no"], answer: right ? "yes" : "no" }],
            checks: [{ kind: "yes-no", statement: { kind: "factor", factor: f, of: n }, region: "pick", yes: "yes", no: "no" }],
          });
        }
        return line();
      });
      return { slot: s.slot, items, label: "your turn" };
    }
    case "spot-the-error": {
      const op = richOp(band, r);
      const p = opPackage(at(), op, "Find the wrong move. Write the fix.", (pk) => ({
        format: "spot-the-error", scorable: true, parentChecked: false,
        error: { answer: pk.wrongAnswers[0].value, step: pk.wrongAnswers[0].step },
        regions: [box("fix", "The fix", answerOf(pk)), { id: "why", kind: "lines", label: "What did Sam do wrong?" }],
        checks: [opCheck("fix")],
      }));
      const shown = p.wrongAnswers[0].value;
      return { slot: s.slot, items: [p], who: "Sam", lines: [`${operationText(op)} = [${shown.type === "number" ? shown.value : "?"}]`] };
    }
    case "watch-one": {
      const op = practiceOp(band, r, level);
      const res = operationResult(op);
      return { slot: s.slot, items: [], label: operationText(op), note: "Line up the places. Start with the ones.", lines: [`${operationText(op)} = [${res.type === "number" ? res.value : ""}]`] };
    }
    case "finish-these": {
      const items = times(max, () => {
        const op = practiceOp(band, r, level);
        return opPackage(at(), op, operationText(op));
      });
      return { slot: s.slot, items, hints: items.map((p) => {
        const op = p.operation;
        if (!op) return null;
        const [a, b] = op.operands as [number, number];
        return Number.isInteger(a) && Number.isInteger(b) && a >= 10 && op.kind === "add"
          ? `= [${a - (a % 10)} ${signOf(op)} ${b - (b % 10)}] ${signOf(op)} ... =`
          : null;
      }) };
    }
    case "solve-it-two-ways": {
      const op = richOp(band, r);
      return {
        slot: s.slot, items: [opPackage(at(), op, `${operationText(op)} = ?`, (p) => ({
          format: "two-ways", scorable: true, parentChecked: false, error: null,
          regions: [{ id: "way-1", kind: "work", label: "Method 1" }, { id: "way-2", kind: "work", label: "Method 2" }, box("answer", "Answer", answerOf(p))],
          checks: [opCheck("answer")],
        }))],
      };
    }
    case "word-problems": {
      const items = times(max, () => {
        const st = storyOf(band, r);
        return opPackage(at(), st.op, st.text, (p) => ({
          format: "show-work", scorable: true, parentChecked: false, error: null,
          regions: [{ id: "work", kind: "work", label: "Show your work" }, box("answer", "Answer", answerOf(p))],
          checks: [opCheck("answer")],
        }), st.unit);
      });
      return { slot: s.slot, items, figures: items.map((p) => (band === "early" && p.operation?.kind === "add" ? { kind: "dots", groups: p.operation.operands.map(Number) } as Figure : null)) };
    }
    case "how-do-you-know":
      return { slot: s.slot, items: [itemPackage(at(), "How do you know your answer to the last story is right?", {
        format: "written-reason", scorable: false, parentChecked: true, error: null, checks: [],
        regions: [{ id: "why", kind: "lines", label: "How do you know?" }],
      })] };
    case "reminder": {
      const op = richOp(band, r);
      const res = operationResult(op);
      return {
        slot: s.slot, items: [], label: "From yesterday", note: "From yesterday",
        lines: [`${operationText(op)} = [${res.type === "number" ? res.value : ""}]`],
        figure: { kind: "number-line", from: 0, to: 10, step: 1, hops: [[2, 5], [5, 9]] },
        explain: "Start at the first number and jump on. Each jump is one part of the second number.",
      };
    }
    case "mixed-set": {
      const items = times(max, () => {
        const m = mixedOf(band, r);
        const choices = band === "upper" ? ["+", "−", "×", "÷"] : ["+", "−", "×", "÷"].slice(0, ["multiply", "divide"].includes(m.op.kind) ? 4 : 2);
        return opPackage(at(), m.op, m.text, (p) => ({
          format: "tick-and-number", scorable: true, parentChecked: false, error: null,
          regions: [
            { id: "operation", kind: "choice", mark: "tick", label: "Tick the operation:", choices, answer: signOf(m.op) },
            box("answer", "Write the answer:", answerOf(p)),
            { id: "work", kind: "work", label: "Show your work" },
          ],
          checks: [{ kind: "operation-sign", region: "operation" }, opCheck("answer")],
        }));
      });
      return { slot: s.slot, items, note: items.some((p) => p.item!.regions[0].kind === "choice" && p.item!.regions[0].choices.length > 2) ? "Tick +, −, × or ÷, then write the answer." : "Tick + or −, then write the answer." };
    }
    case "picture-stories": {
      const items = times(max, () => {
        const st = storyOf(band === "mid" || band === "upper" ? "early" : band, r);
        return opPackage(at(), st.op, st.text, undefined, st.unit);
      });
      return { slot: s.slot, items, figures: items.map((p) => (p.operation ? { kind: "dots", groups: (p.operation.operands as number[]).slice(0, 2) } : null)) };
    }
    case "challenge": {
      const items = times(max, () => {
        const a = r(12, 29);
        const op: Operation = band === "early" ? { kind: "add", operands: [a, a + 9] } : { kind: "multiply", operands: [a, r(11, 19)] };
        const text = band === "early"
          ? `Two jars hold ${a} and ${a + 9} beads. How many beads are in both jars?`
          : `A garden has ${op.operands[0]} rows of ${op.operands[1]} plants. How many plants are there? Show two ways to check.`;
        return opPackage(at(), op, text, (p) => ({
          format: "show-work", scorable: true, parentChecked: false, error: null,
          regions: [box("answer", null, answerOf(p)), { id: "work", kind: "work", label: "Show your work" }],
          checks: [opCheck("answer")],
        }));
      });
      return { slot: s.slot, items };
    }
    case "math-in-the-world": {
      const metres = r(8, 14);
      const price = r(3, 6);
      const soil = r(2, 5);
      const plan = itemPackage(at(), "Plan: what will you find, and in what order?", {
        format: "written-reason", scorable: false, parentChecked: true, error: null, checks: [],
        regions: [{ id: "plan", kind: "lines", label: "Plan" }],
      });
      const n = (value: number) => ({ type: "number" as const, value });
      const parts = itemPackage(at(), `The garden bed is a square, ${metres} m on each side. Work out each part.`, {
        format: "boxes", scorable: true, parentChecked: false, error: null,
        regions: [
          box("a", "a) Edging for all 4 sides (m)", n(metres * 4)),
          box("b", "b) Cost of the edging ($)", n(metres * 4 * price)),
          box("c", "c) Cost of the soil ($)", n(soil * 12)),
          box("d", "d) Total cost ($)", n(metres * 4 * price + soil * 12)),
        ],
        checks: [{
          kind: "equations", different: false, numbers: "any", equations: [
            { left: n(metres), op: "×", right: n(4), result: { region: "a" } },
            { left: n(metres * 4), op: "×", right: n(price), result: { region: "b" } },
            { left: n(soil), op: "×", right: n(12), result: { region: "c" } },
            { left: n(metres * 4 * price), op: "+", right: n(soil * 12), result: { region: "d" } },
          ],
        }],
      });
      const budget = 400;
      const spend: Operation = { kind: "subtract", operands: [budget, metres * 4 * price + soil * 12] };
      const final = opPackage(at(), spend, "You have $400. How much money is left after you buy everything?", (p) => ({
        format: "show-work", scorable: true, parentChecked: false, error: null,
        regions: [{ id: "work", kind: "work", label: "Work it here" }, box("answer", "Final answer ($)", answerOf(p))],
        checks: [opCheck("answer")],
      }));
      return {
        slot: s.slot, items: [plan, parts, final].slice(0, max),
        info: [{ label: "Edging", value: `$${price} per metre` }, { label: "Soil", value: `${soil} bags, $12 each` }, { label: "Budget", value: `$${budget}` }],
      };
    }
  }
}

/** The headline words of a day page. */
function headerOf(page: PlannedPage, ctx: FillCtx, blocks: FilledBlock[]): Omit<FilledDayPage, "blocks"> {
  const { level } = ctx;
  const main = page.parts.find((p) => p.step) ?? page.parts[0];
  const topic = topicOf(main?.step?.skill ?? main?.skills[0], main?.step?.step);
  const early = level <= 9;
  const t = (title: string, subtitle: string) => ({ title, subtitle });
  const has = (slot: string) => blocks.some((b) => b.slot === slot);
  let head: { title: string; subtitle: string };
  const type = page.type === "parent-led" ? (blocks[0]?.slot === "worked-example" ? "new-idea" : blocks[0]?.slot ?? "practice") : page.type;
  switch (type) {
    case "warm-up": head = t("Warm-up", level >= 16 ? "Facts to 20. Beat your own count from last time." : "Facts to 20. Take your time: there is no timer."); break;
    case "new-idea": head = t(topic, level >= 19 ? "Try it first. Then see how it works." : "Watch how it works. Then try it."); break;
    case "practice": head = t(`Practice: ${topic}`, "Watch one. Finish two. Then do the rest on your own."); break;
    case "practice-2": head = t(`More practice: ${topic}`, "Each row is a little harder than the one before."); break;
    case "word-problems": head = t(`${topic} in stories`, "Read it. Work it out in the box. Write the answer."); break;
    case "math-in-the-world": head = t("Math in the world", "One real task: a garden bed. Plan it, then work it out."); break;
    case "unit-b": head = t(topic, `Unit B: ${topic.toLowerCase()}.`); break;
    case "friday-5": head = t("Remember these? and Friday 5", "Things you learned before, then five with no hints."); break;
    case "challenge": head = t("Challenge", has("challenge") && blocks.find((b) => b.slot === "challenge")!.items.length > 1 ? "Two to stretch you." : "One to stretch you."); break;
    case "show-what-you-know": head = t("Show what you know", "Ten days of work. Show what you learned!"); break;
    case "level-test": head = t(`Level U${level} test`, "Do this on your own."); break;
    default: head = t("Remember these?", "Things you learned before, so they stay fresh.");
  }
  // A title is one line: a long topic keeps the plain title.
  const room = level <= 9 ? 30 : 42;
  const plain: Record<string, string> = { practice: "Practice", "practice-2": "More practice", "word-problems": "Stories" };
  if (head.title.length > room) head = { ...head, title: plain[type] ?? topic.split(" ").slice(0, 3).join(" ") };
  const parentLed = page.type === "parent-led";
  const grownUp = parentLed
    ? "Read each line aloud. Your child circles, colours or writes one number."
    : early && type === "new-idea" ? "Read the blue box aloud. Show both ways with a finger." : null;
  return { topic: type === "level-test" ? "Level test" : type === "show-what-you-know" ? "Show what you know" : topic, ...head, grownUp };
}

// ---------- The book ----------

export interface SampleBookOptions {
  /** "U12". */
  level: string;
  workbookId: string;
  childId: string;
  child: string;
  /** 1 by default; from 2 the book has Fix it boxes. */
  number?: number;
  /** The level's last book: every step passed, so the plan makes the test workbook (level test on Day 7). */
  testWorkbook?: boolean;
  /** Page tokens; by default fixed ones made from the workbook id and page (16 to 64 URL-safe characters). */
  qrToken?: (n: number) => string;
}

export interface SampleBook {
  draft: WorkbookDraft;
  plan: WorkbookPlan;
  /** Slots that took fewer items than the plan asked for (see the header). */
  capped: string[];
}

/** The BC school grade of a level (three levels a grade from Kindergarten); internal only. */
const gradeOf = (level: number) => Math.floor((level - 1) / 3) as Grade;

/** A whole sample book for a level (see the header). Deterministic: the same options give the same book. */
export function sampleBook(o: SampleBookOptions): SampleBook {
  const level = planLevel(BC, o.level);
  if (!level) throw new Error(`sample book: no level ${o.level}`);
  const number = o.number ?? 1;
  const passed = o.testWorkbook
    ? Object.fromEntries(level.units.flatMap((u) => u.skills.filter((s) => s.delivery !== "warm-up").map((s) => [s.id, s.delivery === "activity" ? 1 : s.steps.length || DEFAULT_STEPS])))
    : {};
  const teach = level.units.flatMap((u) => u.skills).filter((s) => s.delivery !== "warm-up").map((s) => s.id);
  const input: PlanInput = {
    profile: { standards: [] }, grade: gradeOf(level.number), level, passed,
    workbook: { number, inLevel: o.testWorkbook ? level.workbooks : 0 },
    reviews: [], missedReviews: [],
    // From workbook 2, last time's misses come back in Fix it.
    misses: number > 1 ? teach.slice(0, 6).map((skill, i) => ({
      skill, question: { source: "workbook" as const, workbookId: "00000000-0000-4000-8000-0000000000b1", page: 10 + i, question: 1 },
      event: `sample-${i}`, result: "wrong" as const, mistake: null, stuckStep: null,
    })) : [],
    pausedWeeks: 0, support: null, unassessedUnits: [],
  };
  const result = planWorkbook(input);
  if (!result.ok) throw new Error(`sample book: ${result.reason}`);
  const plan = result.plan;
  const capped: string[] = [];
  let key = 0;
  const band = bandOf(level.number);
  const title = BC.level(o.level)!.title;
  const words = title.split(" ");
  const split = words.reduce((best, _, i) => (Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length) < Math.abs(words.slice(0, best).join(" ").length - words.slice(best).join(" ").length) ? i : best), 1);
  const dayTopic = (day: number, track: "A" | "B") => {
    const part = plan.days[day - 1].pages.flatMap((p) => p.parts).find((p) => p.unit === track && p.step);
    return part ? topicOf(part.step!.skill, part.step!.step) : null;
  };
  const draft = assembleBook({
    workbookId: o.workbookId, childId: o.childId, child: o.child, number, levelTitle: title, profileBuild: null, plan,
    cover: {
      title: [words.slice(0, split).join(" "), words.slice(split).join(" ")],
      sentence: number === 1
        ? `${o.child}'s assessment showed what is secure and what to build next at Level U${level.number}. So this workbook:`
        : `${o.child}'s last workbook showed which steps stuck and which need another go. So this workbook:`,
      bullets: [
        "Builds the next steps of this level, one small step at a time",
        "Shows each new idea with a worked example first",
        "Brings back earlier skills every day, so they stay fresh",
        number === 1 ? "Ends each week with five questions and no hints" : "Fixes last time's mistakes with new questions",
      ],
      parentLine: `This fortnight, ask ${o.child} to show you one worked example and explain it in their own words.`,
    },
    planRow: (day) => {
      const d = plan.days[day - 1];
      const a = dayTopic(day, "A");
      const b = dayTopic(day, "B");
      if (d.kind === "test") return { topic: "Level test", second: "Done alone, in one sitting" };
      if (d.kind === "light") return { topic: "A light day", second: "Remember these? and a challenge" };
      const second = day === 10 ? "Show what you know" : day === 5 ? "Friday 5" : b ?? (d.kind === "mixed" ? "Mixed practice" : "Remember these?");
      return { topic: a ?? (d.kind === "mixed" ? "Mixed practice" : "Review"), second };
    },
    fill(day, page) {
      const ctx: FillCtx = { plan, level: level.number, band, workbookId: o.workbookId, day, page, capped, next: () => `${o.workbookId}:s${++key}` };
      const blocks = pageSlots(page, level.number).map((s, i) => fillSlot(s, i, ctx));
      return { ...headerOf(page, ctx, blocks), blocks };
    },
    qrToken: o.qrToken ?? ((n) => `${o.workbookId.replace(/-/g, "").slice(0, 16)}p${String(n).padStart(3, "0")}`),
  });
  return { draft, plan, capped };
}
