// The item contract (#480). Code owns the type, the numbers, the operation and the
// help. The writer can change only the words of a story or an explanation.
import { framesFor, fillFrame, frameDoes, PEOPLE, THINGS } from "./workbook-wording";
import approvedSkills from "./workbook-approved-skills.json";
import type { AiItem, AiOperation, AiValue, BuiltQuestion, GeneratedFormat, SlotPlace } from "./workbook-generator-items";
import { buildQuestion } from "./workbook-generator-items";
import { checkQuestionPackage } from "./question-package";

export type QuestionType = keyof typeof approvedSkills;
export interface ItemDayRange { min: number; max: number; pictures: boolean; help: "full" | "partial" | "none" }
export interface ItemPlan {
  type: QuestionType;
  source: "code" | "story" | "explain";
  item: AiItem;
  /** The exact multiset of numbers that the story must print, including duplicates. */
  numbers: number[];
  dayRange: ItemDayRange;
}

/** No default format for a skill absent from this reviewed list. */
export function approvedQuestionTypes(skill: string): QuestionType[] {
  return (Object.entries(approvedSkills) as [QuestionType, string[]][]).filter(([, ids]) => ids.includes(skill)).map(([type]) => type);
}

export const itemNumber = (value: number): AiValue => ({ type: "number", value, numerator: null, denominator: null, whole: null, unit: null, hours: null, minutes: null, period: null, parts: [], text: null });
const operation = (kind: AiOperation["kind"], a: number, b: number): AiOperation => ({ kind, operands: [itemNumber(a), itemNumber(b)], expression: null, unit: null, denominator: null, values: [] });

// These are review candidates, not a claim of Savar's approval. A change to this
// bank changes the outline fingerprint and invalidates an older run's resume.
export const ITEM_EXAMPLES = {
  early: {
    sequence: ["Fill in the missing numbers. [3, 4, box, 6]", "Count back. [8, box, 6, 5]"],
    count: ["Colour 5 dots in the row.", "Fill a ten-frame to show 7."],
    likelihood: ["Will a stone grow legs? Circle never, maybe or always.", "Will a bird land here today? Circle never, maybe or always."],
    relation: ["Is 7 less than 5?", "Is 8 close to 0 or 10?"],
    bond: ["4 + ? = 9", "Mia needs 10 shells. She has 6. How many more shells does she need?"],
    step: ["7 + 1 = ?", "Ben has 8 cars. He gives 2 away. How many cars does Ben have now?"],
    add: ["7 + 5 = ?", "Ava has 3 apples. She gets 4 more. How many apples does Ava have now?"],
    subtract: ["9 - 4 = ?", "Leo has 9 cups. He gives 4 away. How many cups does Leo have now?"],
    order: ["Write the numbers from least to greatest. [6, 2, 9]", "Write the numbers from greatest to least. [3, 8, 5]"],
    places: ["Write the tens and ones in 17.", "Write the tens and ones in 24."],
    multiply: ["3 × 4 = ?", "Mia fills 3 bags. Each bag has 4 shells. How many shells does Mia pack?"],
    divide: ["12 ÷ 3 = ?", "Ben shares 12 apples equally among 3 bags. How many apples does Ben put in each bag?"],
    explain: ["How can you check that 4 + 3 = 7?", "How do you know that 8 is more than 5?"],
  },
  middle: {
    add: ["268 + 157 = ?", "Mia has 268 beads. She gets 157 more. How many beads does Mia have now?"],
    subtract: ["425 - 157 = ?", "Ben has 425 cards. He gives 157 away. How many cards does Ben have now?"],
    multiply: ["24 × 3 = ?", "Ava fills 3 boxes. Each box holds 24 cups. How many cups does Ava pack?"],
    divide: ["72 ÷ 3 = ?", "Leo shares 72 beads equally among 3 bags. How many beads does Leo put in each bag?"],
    explain: ["How can you check that 268 + 157 = 425?", "Why does 72 ÷ 3 give the same answer as 72 ÷ 6 × 2?"],
  },
  upper: {
    add: ["1250 + 875 = ?", "Mia has 1250 beads. She gets 875 more. How many beads does Mia have now?"],
    subtract: ["1250 - 875 = ?", "Ben has 1250 cards. He gives 875 away. How many cards does Ben have now?"],
    multiply: ["125 × 8 = ?", "Ava fills 8 boxes. Each box holds 125 cups. How many cups does Ava pack?"],
    divide: ["1000 ÷ 8 = ?", "Leo shares 1000 beads equally among 8 bags. How many beads does Leo put in each bag?"],
    explain: ["How can you check that 125 × 8 = 1000?", "Explain why 1000 ÷ 8 = 125."],
  },
} as const;

export function itemExamples(type: QuestionType, level: number, source: ItemPlan["source"]) {
  const band = level <= 9 ? ITEM_EXAMPLES.early : level <= 18 ? ITEM_EXAMPLES.middle : ITEM_EXAMPLES.upper;
  const key = source === "explain" ? "explain" : type;
  return { band: level <= 9 ? "K-2" : level <= 18 ? "3-5" : "6-9", type: key, items: key in band ? band[key as keyof typeof band] : ITEM_EXAMPLES.early[key] };
}

/** One slot's deterministic item, including the story's fixed math. */
export function planItem(o: { skill: string; slot: string; level: number; day: number; ordinal: number; range: ItemDayRange; story?: boolean; explain?: boolean; format?: GeneratedFormat; attempt?: number }): ItemPlan | null {
  const type = approvedQuestionTypes(o.skill)[0];
  if (!type) return null;
  const r = o.range;
  const seed = o.ordinal + (o.attempt ?? 0) * 71;
  const max = Math.max(3, Math.floor(r.max));
  const top = Math.min(max, Math.max(3, Math.ceil(r.min), 3 + seed % (max - 2)));
  const a = 1 + (Math.floor(seed / Math.max(1, max - 2)) + seed * 7) % (top - 1);
  const b = top - a;
  const arithmetic = ["sequence", "bond", "step", "add", "subtract", "multiply", "divide"].includes(type);
  const source = o.explain && type !== "likelihood" ? "explain" : o.story && arithmetic ? "story" : "code";
  const item: AiItem = { slot: o.slot, skill: o.skill, difficulty: o.day <= 3 ? 1 : o.day <= 7 ? 2 : 3,
    text: "", format: "write-number", operation: null, wrongAnswers: [], easier: null, shownWrong: null,
    figure: null, numbers: [], places: null, direction: null, sequence: null, pattern: null, relation: null, figureShows: null, name: "Mia", thing: "shells" };
  let numbers: number[] = [];
  switch (type === "sequence" && (source === "story" || o.format === "spot-the-error" || o.format === "two-ways") ? "add" : type) {
    case "likelihood": {
      const events = ["Will a stone grow legs?", "Will a bird land here today?", "Will a ball fall when Mia drops it?", "Will Ben see a dog today?", "Will a fish read a book?", "Will a cup hold water when Ava fills it?"];
      item.text = `${events[seed % events.length].replace(/Mia|Ben|Ava/, PEOPLE[Math.floor(seed / events.length) % PEOPLE.length])} Circle never, maybe or always.`;
      item.format = "written-reason"; // Built as a circle region below, using the existing renderer.
      break;
    }
    case "count":
      item.text = `Fill the ten-frame boxes to show ${top}.`;
      item.format = "draw";
      numbers = [top];
      break;
    case "sequence": {
      const stepSize = /skip-count/.test(o.skill) ? (seed % 2 || max < 10 ? 2 : 5) : 1;
      const terms = Math.min(3 + seed % 3, Math.floor(max / stepSize) + 1);
      const end = Math.min(max, Math.max(stepSize * (terms - 1), top));
      const first = Math.max(0, end - stepSize * (terms - 1));
      const down = Math.floor(seed / 3) % 2 === 1;
      item.format = "sequence";
      item.text = down ? "Count back. Fill in the missing numbers." : "Fill in the missing numbers.";
      const mask = 1 + Math.floor(seed / 7) % ((1 << terms) - 2);
      const blanks = Array.from({length: terms}, (_, i) => i).filter(i => mask & (1 << i));
      item.sequence = { start: itemNumber(down ? end : first), step: itemNumber(down ? -stepSize : stepSize), terms, blanks };
      break;
    }
    case "order":
      item.format = "order"; item.text = "Write the numbers from least to greatest.";
      item.numbers = [top, Math.max(0, a - 1), a].map(itemNumber); item.direction = "up";
      break;
    case "relation":
      item.format = "relation"; item.text = `Is ${a} less than ${top}?`;
      item.numbers = [itemNumber(a)]; item.relation = { kind: "less-than", to: [top], labels: [] };
      break;
    case "places":
      item.format = "places"; item.text = "Write the tens and ones.";
      item.numbers = [itemNumber(top)]; item.places = ["tens", "ones"];
      break;
    default: {
      let x = a, y = b;
      let kind: AiOperation["kind"] = "add";
      if (type === "bond") { kind = "missing-addend"; y = /make-10|partners/.test(o.skill) ? 10 : top; x = Math.min(a, y - 2); }
      if (type === "step") {
        y = /two/.test(o.skill) ? 2 : 1;
        kind = Math.floor(seed / 3) % 2 ? "subtract" : "add";
        x = kind === "subtract" ? y + seed % (max - y + 1) : 1 + seed % (max - y);
      }
      if (type === "subtract") { kind = "subtract"; x = top; y = a; }
      if (type === "multiply" || type === "divide") { y = 2 + seed % 8; x = Math.max(2, Math.min(Math.floor(max / y), a)); kind = type; if (type === "divide") x *= y; }
      item.operation = operation(kind, x, y);
      if (r.pictures && top <= 10 && ["add", "subtract", "missing-addend"].includes(kind) && o.format !== "spot-the-error") item.figure = "ten-frame";
      if (kind === "missing-addend" && item.figure) item.figureShows = "part";
      const sign = { add: "+", subtract: "-", multiply: "×", divide: "÷", "missing-addend": "+" }[kind as "add"];
      item.text = kind === "missing-addend" ? `${x} + ? = ${y}` : seed % 2 ? `${x} ${sign} ${y} = ?` : `? = ${x} ${sign} ${y}`;
      numbers = [x, y];
      if (source === "story") item.text = kind === "missing-addend" ? `Mia needs ${y} shells. She has ${x}. How many more shells does Mia need?` : kind === "subtract" ? `Mia has ${x} shells. She gives ${y} away. How many shells does Mia have now?` : kind === "multiply" ? `Mia fills ${x} bags. Each bag holds ${y} shells. How many shells does Mia pack?` : kind === "divide" ? `Mia shares ${x} shells equally among ${y} bags. How many shells does Mia put in each bag?` : `Mia has ${x} shells. She gets ${y} more. How many shells does Mia have now?`;
      item.format = source === "story" ? "show-work" : o.format ?? "write-number";
      // A code-built example with a different answer. Whole-number operations use
      // buildQuestion's checked easier-example builder where available.
      if (kind === "multiply" || kind === "divide") item.easier = { text: `2 ${sign} 2 = ?`, operation: operation(kind, 2, 2) };
      const right = kind === "add" ? x + y : kind === "missing-addend" ? y - x : kind === "subtract" ? x - y : kind === "multiply" ? x * y : x / y;
      item.wrongAnswers = [{ value: itemNumber(right > 0 ? right - 1 : right + 1), cause: "careless", description: "Counts incorrectly.", step: null }];
      if (item.format === "spot-the-error") {
        const short = right >= max && y >= 2;
        item.wrongAnswers = [{ value: itemNumber(short ? right - 1 : right + 1), cause: short ? "counted-one-short" : "counted-one-extra", description: short ? "Counts one too few." : "Counts one too many.", step: null }]; item.shownWrong = 0;
      }
      break;
    }
  }
  if (source === "story" && item.operation && ["add", "subtract", "missing-addend"].includes(item.operation.kind)) {
    const [x, y] = item.operation.operands.map(v => v.value!);
    const pair: [number, number] = item.operation.kind === "add" ? [x, y] : item.operation.kind === "subtract" ? [x - y, y] : [x, y - x];
    const frames = framesFor("story", false, true).filter(f => {
      const does = frameDoes(f, pair);
      return does.operation.kind === item.operation!.kind && does.operation.operands.join() === [x, y].join();
    });
    const name = PEOPLE[seed % PEOPLE.length], thing = THINGS[Math.floor(seed / PEOPLE.length) % THINGS.length];
    const words = frames.map(f => fillFrame(f.f, {a: pair[0], b: pair[1], t: pair[0] + pair[1]}, name, thing));
    const sound = words.filter(text => stable((text.match(/\d+/g) ?? []).map(Number).sort((a,b)=>a-b)) === stable([...numbers].sort((a,b)=>a-b)));
    if (sound.length) { item.text = sound[Math.floor(seed / 3) % sound.length]; item.name = name; item.thing = thing; }
  }
  if (source === "explain") { item.text = type === "likelihood" ? "Why can a stone never grow legs?" : `How can you check ${top}?`; item.format = "written-reason"; item.operation = null; item.wrongAnswers = []; item.easier = null; numbers = type === "likelihood" ? [] : [top]; }
  return { type, source, item, numbers, dayRange: r };
}

const stable = (value: unknown): string => JSON.stringify(value, (_key, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);

/** Validate before building, before any legacy code can replace the writer's words. */
export function itemContractProblem(raw: unknown, plan: ItemPlan): string | null {
  if (!raw || typeof raw !== "object") return "the writer did not fill the approved item";
  const r = raw as AiItem;
  if (r.skill !== plan.item.skill || r.format !== plan.item.format) return "the writer changed the approved skill or question format";
  if (stable(r.operation) !== stable(plan.item.operation)) return "the writer changed the code-picked operation or operands";
  if (typeof r.text !== "string") return "the writer gave no question text";
  if (plan.source === "explain" && !/^(?:How (?:do|can|did)|Why\b|Explain\b)/i.test(r.text)) return "an explain item must ask how or why";
  if (plan.source !== "code" && /^(?:Draw|Trace|Colour)\b/i.test(r.text)) return "the writer changed the approved task to drawing or tracing";
  if (plan.source !== "code") {
    const read = (r.text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).sort((a, b) => a - b);
    const given = [...plan.numbers].sort((a, b) => a - b);
    if (JSON.stringify(read) !== JSON.stringify(given)) return `the text must use exactly the code-picked numbers: ${given.join(", ")}`;
  }
  if (/\btrace\w*\b/i.test(r.text) && Number(plan.item.skill.split(".")[0]) > 0) return "tracing is for Kindergarten only";
  return null;
}

export function buildPlannedItem(plan: ItemPlan, raw: unknown, place: SlotPlace): BuiltQuestion {
  const problem = itemContractProblem(raw, plan);
  if (problem) return { package: null, check: { status: "failed", reason: problem }, stepIds: [] };
  const item = raw as AiItem;
  const built = buildQuestion({ ...plan.item, text: item.text }, { ...place, preserveText: true });
  if (!built.package) return built;
  // Reuse existing circle, picture and region support. These tasks are checked
  // by the parent: there is no false claim that code can check a coloured scan.
  if (plan.source === "code" && (plan.type === "likelihood" || plan.type === "count")) {
    const p = built.package;
    p.item = plan.type === "likelihood" ? { format: "circle", scorable: false, parentChecked: true,
      regions: [{ id: "answer", kind: "choice", mark: "circle", label: null, choices: ["never", "maybe", "always"], answer: null }], checks: [], error: null }
      : { format: "draw", scorable: false, parentChecked: true, regions: [{ id: "drawing", kind: "picture", label: null }], checks: [], error: null,
        figure: { kind: "ten-frame", counters: plan.numbers[0] > 10 ? [0, 0] : [0] } };
    built.check = { status: "not-checked", reason: "a parent checks the circle or coloured drawing" };
  }
  built.package.textSource = plan.source === "code" ? "code" : "ai";
  const checked = checkQuestionPackage(built.package);
  if (checked.status === "failed") return { ...built, check: { status: "failed", reason: checked.reason } };
  return built;
}
