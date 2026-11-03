// The item contract (#480). Code owns the type, the numbers, the operation and the
// help. The writer can change only the words of a story or an explanation.
import { framesFor, fillFrame, frameDoes, PEOPLE, THINGS, storyProblem } from "./workbook-wording";
import approvedSkills from "./workbook-approved-skills.json";
import type { AiItem, AiOperation, AiValue, BuiltQuestion, GeneratedFormat, SlotPlace } from "./workbook-generator-items";
import { buildQuestion } from "./workbook-generator-items";
import { checkQuestionPackage } from "./question-package";
import { LIKELIHOOD_EVENTS } from "./workbook-likelihood-bank";
import { STORY_FRAMES } from "./workbook-story-bank";

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
    likelihood: LIKELIHOOD_EVENTS.map(event => `${event} Circle never, maybe or always.`),
    relation: ["Mia sees 3 red counters and 5 blue counters. Are there more red counters or blue counters?", "Is 8 close to 0 or 10?"],
    bond: ["4 + ? = 9", "Mia needs 10 shells. She has 6. How many more shells does she need?"],
    step: ["7 + 1 = ?", "Ben has 8 cars. He gives 2 away. How many cars does Ben have now?"],
    add: ["7 + 5 = ?", "Ava has 3 apples. She gets 4 more. How many apples does Ava have now?"],
    subtract: ["9 - 4 = ?", "Leo has 9 cups. He gives 4 away. How many cups does Leo have now?"],
    order: ["Write the numbers from least to greatest. [6, 2, 9]", "Write the numbers from greatest to least. [3, 8, 5]"],
    places: ["Write the tens and ones in 17.", "Write the tens and ones in 24."],
    multiply: ["3 × 4 = ?", "Mia fills 3 bags. Each bag has 4 shells. How many shells does Mia pack?"],
    divide: ["12 ÷ 3 = ?", "Ben shares 12 apples equally among 3 bags. How many apples does Ben put in each bag?"],
    explain: ["How can you check your answer to the first story on this page?", "How do you know your answer to the first story on this page is right?"],
  },
  middle: {
    add: ["268 + 157 = ?", "Mia has 268 beads. She gets 157 more. How many beads does Mia have now?"],
    subtract: ["425 - 157 = ?", "Ben has 425 cards. He gives 157 away. How many cards does Ben have now?"],
    multiply: ["7 × 8 = ?", "Ava fills 7 boxes. Each box holds 8 cups. How many cups does Ava pack?"],
    divide: ["72 ÷ 8 = ?", "Leo shares 72 beads equally among 8 bags. How many beads does Leo put in each bag?"],
    explain: ["How can you check your answer to the first story on this page?", "Explain how to check the first story on this page."],
  },
  upper: {
    add: ["1250 + 875 = ?", "Mia has 1250 beads. She gets 875 more. How many beads does Mia have now?"],
    subtract: ["1250 - 875 = ?", "Ben has 1250 cards. He gives 875 away. How many cards does Ben have now?"],
    multiply: ["6 × 9 = ?", "Ava fills 6 boxes. Each box holds 9 cups. How many cups does Ava pack?"],
    divide: ["63 ÷ 7 = ?", "Leo shares 63 beads equally among 7 bags. How many beads does Leo put in each bag?"],
    explain: ["How can you check your answer to the first story on this page?", "Explain how to check the first story on this page."],
  },
} as const;

export function itemExamples(type: QuestionType, level: number, source: ItemPlan["source"]) {
  const band = level <= 9 ? ITEM_EXAMPLES.early : level <= 18 ? ITEM_EXAMPLES.middle : ITEM_EXAMPLES.upper;
  const key = source === "explain" ? "explain" : type;
  const items: readonly string[] = key in band ? band[key as keyof typeof band] : ITEM_EXAMPLES.early[key];
  const storyKind = type === "sequence" ? "add" : type;
  const examples = source === "story" && (storyKind === "add" || storyKind === "subtract") ? STORY_FRAMES[storyKind].slice(0, 4).map(f => fillFrame(f,
    level <= 9 ? {a:3,b:2,t:5} : level <= 18 ? {a:268,b:157,t:425} : {a:1250,b:875,t:2125}, "Mia", "shells")) : [];
  const challenge = source === "story" && type === "sequence" ? ["Mia has 5 shells. She gets 1 more. Then she gets 2 more. How many shells does Mia have now?", "Ben packs 10 books. Ava brings 1 book. Leo brings 2 books. Mia brings 3 books. How many books does Ben pack?"] : [];
  return { band: level <= 9 ? "K-2" : level <= 18 ? "3-5" : "6-9", type: key, items: [...items, ...examples, ...challenge] };
}

/** One slot's deterministic item, including the story's fixed math. */
export function planItem(o: { skill: string; slot: string; level: number; day: number; ordinal: number; range: ItemDayRange; story?: boolean; explain?: boolean; challenge?: boolean; format?: GeneratedFormat; attempt?: number; compact?: boolean }): ItemPlan | null {
  const type = approvedQuestionTypes(o.skill)[0];
  if (!type) return null;
  const r = o.range;
  const seed = o.ordinal + (o.attempt ?? 0) * 71;
  const skillMax = /(?:within-10$|K[1235])/.test(o.skill) ? 10 : /within-20$|doubles/.test(o.skill) ? 20 : /within-100$|split-tens/.test(o.skill) ? 100 : r.max;
  const max = Math.min(skillMax, Math.floor(r.max));
  if (max < 3 || /make-10|partners-of-10/.test(o.skill) && max < 10 || o.skill === "1.1-ten-and-ones" && max < 11) return null;
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
      item.text = `${LIKELIHOOD_EVENTS[seed % LIKELIHOOD_EVENTS.length]} Circle never, maybe or always.`;
      item.format = "written-reason"; // Built as a circle region below, using the existing renderer.
      break;
    }
    case "count": {
      const countMax = /subitize-to-5/.test(o.skill) ? Math.min(5, max) : /subitize|^K/.test(o.skill) ? Math.min(10, max) : Math.min(20, max);
      const count = Math.min(countMax, Math.max(1, Math.ceil(Math.min(r.min, countMax)), 1 + seed % countMax));
      item.text = seed % 2 && !/ten-frame/.test(o.skill) ? `Colour ${count} dots in the row.` : `Fill the ten-frame boxes to show ${count}.`;
      item.format = "draw";
      numbers = [count];
      break;
    }
    case "sequence": {
      const stepSize = /skip-count/.test(o.skill) ? (seed % 2 || max < 10 ? 2 : 5) : 1;
      const terms = Math.min(o.compact ? 3 : 3 + seed % 3, Math.floor(max / stepSize) + 1);
      const end = Math.min(max, Math.max(stepSize * (terms - 1), top));
      const first = Math.max(0, end - stepSize * (terms - 1));
      const down = Math.floor(seed / 3) % 2 === 1;
      item.format = "sequence";
      item.text = down ? "Count back." : "Fill the gaps.";
      const mask = 1 + Math.floor(seed / 7) % ((1 << terms) - 2);
      const blanks = o.compact ? [seed % terms] : Array.from({length: terms}, (_, i) => i).filter(i => mask & (1 << i));
      item.sequence = { start: itemNumber(down ? end : first), step: itemNumber(down ? -stepSize : stepSize), terms, blanks };
      break;
    }
    case "order":
      item.format = "order"; item.text = "Write the numbers from least to greatest.";
      item.numbers = (o.skill === "6.1-compare-order" ? [top / 2 + .271, Math.max(0, a - 1) + .21, a + .101] : [top, Math.max(0, a - 1), a]).map(itemNumber); item.direction = "up";
      break;
    case "relation": {
      const refs = o.skill === "K3-benchmarks-5-10" ? [0, 5, 10] : o.skill === "1.2-benchmarks-10-20" ? [0, 10, 20] : [0, 25, 50, 100];
      item.format = "relation";
      if (o.skill === "K2-compare-quantities") {
        item.text = "Which group has more?"; item.numbers = [a, top].map(itemNumber);
        item.relation = { kind: "more", to: [], labels: ["red counters", "blue counters"] };
      } else {
        item.text = `Is ${top} closer to ${refs[seed % 2]} or ${refs[seed % 2 + 1]}?`;
        item.numbers = [itemNumber(top)]; item.relation = { kind: "closer", to: refs.slice(seed % 2, seed % 2 + 2), labels: [] };
      }
      break;
    }
    case "places": {
      const decimals = /decimal/.test(o.skill);
      const number = decimals ? Math.floor(top / 2) + (/^4\./.test(o.skill) ? 0.27 : 0.271)
        : /place-value-1000$/.test(o.skill) ? Math.max(101, Math.floor(top / 100) * 100 + 1) : Math.max(/^5\./.test(o.skill) ? 100001 : /^4\./.test(o.skill) ? 1001 : 10, top);
      if (!decimals && number < 10 || number > max) return null;
      item.format = "places"; item.text = "Write the digits in their places.";
      item.numbers = [itemNumber(number)]; item.places = null;
      break;
    }
    default: {
      let x = a, y = b;
      let kind: AiOperation["kind"] = "add";
      if (type === "bond") { kind = "missing-addend"; y = /make-10|partners/.test(o.skill) ? 10 : top; x = Math.min(a, y - 2); }
      if (o.skill === "1.1-ten-and-ones") { kind = "add"; x = 10; y = 1 + seed % (Math.min(20, max) - 10); }
      if (o.skill === "1.3-make-10-to-add") { if (max < 11) return null; kind = "add"; x = 9; y = 2 + seed % Math.min(8, max - 10); }
      if (o.skill === "1.3-doubles") x = y = 1 + seed % Math.floor(max / 2);
      if (o.skill === "2.3-near-doubles") { x = 1 + seed % Math.floor((max - 1) / 2); y = x + 1; }
      if (type === "step") {
        y = /two/.test(o.skill) ? 2 : 1;
        kind = Math.floor(seed / 3) % 2 ? "subtract" : "add";
        x = kind === "subtract" ? y + seed % (max - y + 1) : 1 + seed % (max - y);
      }
      if (type === "subtract") { kind = "subtract"; x = top; y = a; }
      if (type === "sequence" && source === "story" && seed % 2) { kind = "subtract"; x = top; y = a; }
      if (/^(?:2\.4-(?:add|subtract|split)|[34]\.[34]-(?:add|subtract))/.test(o.skill)) {
        const min = /^2/.test(o.skill) ? 10 : /^3/.test(o.skill) ? 100 : 1000;
        if (max < min + 17) return null;
        if (type === "subtract") { x = Math.floor(top / min) * min; if (x < min + 10) x = min + 10; y = 17; }
        else { y = 17; x = Math.floor((Math.max(top, min + 27) - y) / 10) * 10 - 2; }
        if (x < min || x + (type === "subtract" ? 0 : y) > max) return null;
      }
      if (type === "multiply" || type === "divide") { if (max < 4) return null; y = 2 + seed % Math.min(9, Math.floor(max / 2) - 1); x = Math.max(2, Math.min(10, Math.floor(max / y), a)); kind = type; if (type === "divide") x *= y; }
      item.operation = operation(kind, x, y);
      if (r.pictures && top <= 10 && ["add", "subtract", "missing-addend"].includes(kind) && o.format !== "spot-the-error") item.figure = "ten-frame";
      if (kind === "missing-addend" && item.figure) item.figureShows = "part";
      const sign = { add: "+", subtract: "-", multiply: "×", divide: "÷", "missing-addend": "+" }[kind as "add"];
      item.text = kind === "missing-addend" ? `${x} + ? = ${y}` : seed % 2 ? `${x} ${sign} ${y} = ?` : `? = ${x} ${sign} ${y}`;
      numbers = [x, y];
      if (source === "story") item.text = kind === "missing-addend" ? `Mia needs ${y} shells. She has ${x}. How many more shells does Mia need?` : kind === "subtract" ? `Mia has ${x} shells. She gives ${y} away. How many shells does Mia have now?` : kind === "multiply" ? `Mia fills ${x} bags. Each bag holds ${y} shells. How many shells does Mia pack?` : kind === "divide" ? `Mia shares ${x} shells equally among ${y} bags. How many shells does Mia put in each bag?` : `Mia has ${x} shells. She gets ${y} more. How many shells does Mia have now?`;
      item.format = source === "story" ? o.format === "tick-and-number" ? "tick-and-number" : "show-work" : o.format ?? "write-number";
      // A code-built example with a different answer. Whole-number operations use
      // buildQuestion's checked easier-example builder where available.
      if (kind === "multiply" || kind === "divide") item.easier = { text: `2 ${sign} 2 = ?`, operation: operation(kind, 2, 2) };
      if (o.skill === "1.3-doubles" || o.skill === "2.3-near-doubles") item.easier = { text: `${x - 1} + ${y - 1} = ?`, operation: operation("add", x - 1, y - 1) };
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
    item.figure = null; item.figureShows = null;
    const [x, y] = item.operation.operands.map(v => v.value!);
    const pair: [number, number] = item.operation.kind === "add" ? [x, y] : item.operation.kind === "subtract" ? [x - y, y] : [x, y - x];
    const frames = framesFor("story", false, true).filter(f => {
      const does = frameDoes(f, pair);
      return does.operation.kind === item.operation!.kind && does.operation.operands.join() === [x, y].join();
    });
    const name = PEOPLE[seed % PEOPLE.length], thing = THINGS[Math.floor(seed / PEOPLE.length) % THINGS.length];
    const extra = item.operation.kind === "add" ? STORY_FRAMES.add : item.operation.kind === "subtract" ? STORY_FRAMES.subtract : [];
    const words = [...frames.map(f => f.f), ...extra].map(f => fillFrame(f, {a: pair[0], b: pair[1], t: pair[0] + pair[1]}, name, thing));
    const sound = words.filter(text => stable((text.match(/\d+/g) ?? []).map(Number).sort((a,b)=>a-b)) === stable([...numbers].sort((a,b)=>a-b)));
    if (sound.length) { item.text = sound[Math.floor(seed / 3) % sound.length]; item.name = name; item.thing = thing; }
  }
  if (o.challenge) {
    // A count-on challenge has two changes, then three changes on later days.
    // Other skills require their own reviewed multi-step builder.
    if (!/^1\.1-(?:count|read-write|number-line)/.test(o.skill)) return null;
    const changes = o.day >= 8 ? [1, 2, 3] : [1, 2];
    const start = max - changes.reduce((n, v) => n + v, 0);
    if (start < 1) return null;
    const values = [start, ...changes];
    item.operation = { kind: "evaluate", operands: [], expression: values.join(" + "), unit: null, denominator: null, values: [] };
    const settings = [
      [`Mia has ${start} shells. She gets 1 more. Then she gets 2 more.`, "How many shells does Mia have now?"],
      [`Ben puts ${start} apples in a bag. He adds 1 apple. Ava puts in 2 more.`, "How many apples are in the bag now?"],
      [`Ava sees ${start} birds on a fence. 1 bird lands. Then 2 more birds land.`, "How many birds does Ava see now?"],
      [`Leo builds a tower with ${start} blocks. He puts 1 block on top. Then he adds 2 more blocks.`, "How many blocks are in Leo's tower now?"],
      [`Mia packs ${start} books. Ben brings 1 book. Ava brings 2 more books.`, "How many books does Mia pack?"],
      [`Ben draws ${start} dots. He draws 1 more dot. Then he draws 2 more dots.`, "How many dots did Ben draw?"],
      [`Ava finds ${start} buttons. She finds 1 under a chair. Then she finds 2 in a box.`, "How many buttons did Ava find?"],
      [`Leo has ${start} cars on a shelf. He puts 1 car beside them. Then he puts down 2 more cars.`, "How many cars are on the shelf now?"],
      [`Mia counts ${start} ducks in a pond. 1 duck swims over. Then 2 more ducks join them.`, "How many ducks does Mia see now?"],
      [`Ben puts ${start} pens on a desk. Ava adds 1 pen. Leo adds 2 more pens.`, "How many pens are on the desk now?"],
    ];
    const setting = settings[(o.day - 1) % settings.length];
    item.text = `${setting[0]}${changes.length === 3 ? " Mia adds 3 more." : ""} ${setting[1]}`;
    item.format = "show-work"; item.figure = null; item.sequence = null;
    item.easier = { text: `${[start - 1, ...changes].join(" + ")} = ?`, operation: { ...item.operation, expression: [start - 1, ...changes].join(" + ") } };
    item.wrongAnswers = [{ value: itemNumber(max - 1), cause: "careless", description: "Counts one too few.", step: null }]; numbers = values;
    return { type, source: "story", item, numbers, dayRange: r };
  }
  if (source === "explain") { item.text = "How can you check your answer to the first story on this page?"; item.format = "written-reason"; item.operation = null; item.figure = null; item.figureShows = null; item.numbers = []; item.sequence = null; item.relation = null; item.wrongAnswers = []; item.easier = null; numbers = []; }
  return { type, source, item, numbers, dayRange: r };
}

const stable = (value: unknown): string => JSON.stringify(value, (_key, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);

/** Validate before building, before any legacy code can replace the writer's words. */
export function itemContractProblem(raw: unknown, plan: ItemPlan): string | null {
  if (!raw || typeof raw !== "object") return "the writer did not fill the approved item";
  const r = raw as AiItem;
  if (r.skill !== plan.item.skill || r.format !== plan.item.format) return "the writer changed the approved skill or question format";
  if (stable(r.operation) !== stable(plan.item.operation)) return "the writer changed the code-picked operation or operands";
  for (const field of ["numbers", "places", "sequence", "relation", "direction", "figure", "figureShows", "easier", "wrongAnswers", "shownWrong"] as const)
    if (stable(r[field]) !== stable(plan.item[field])) return `the writer changed the code-picked ${field}`;
  if (typeof r.text !== "string") return "the writer gave no question text";
  if (plan.source === "explain" && !/^(?:How (?:do|can|did)|Why\b|Explain\b)/i.test(r.text)) return "an explain item must ask how or why";
  if (plan.source === "explain" && !/first story on this page/i.test(r.text)) return "the explanation must refer to the first story on this page";
  if (plan.source === "explain" && PEOPLE.some(name => new RegExp(`\\b${name}\\b`).test(r.text))) return "refer to the story without adding another named person";
  if (plan.source !== "code" && /^(?:Draw|Trace|Colour)\b/i.test(r.text)) return "the writer changed the approved task to drawing or tracing";
  if (plan.source !== "code") {
    const read = (r.text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).sort((a, b) => a - b);
    const given = [...plan.numbers].sort((a, b) => a - b);
    if (JSON.stringify(read) !== JSON.stringify(given)) return `the text must use exactly the code-picked numbers: ${given.join(", ")}`;
  }
  if (plan.source === "story") {
    const problem = storyProblem(r.text);
    if (problem) return problem;
  }
  if (/\btrace\w*\b/i.test(r.text) && Number(plan.item.skill.split(".")[0]) > 0) return "tracing is for Kindergarten only";
  return null;
}

export function buildPlannedItem(plan: ItemPlan, raw: unknown, place: SlotPlace): BuiltQuestion {
  const problem = itemContractProblem(raw, plan) ?? skillItemProblem(plan);
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
        figure: /Colour/.test(p.text) ? { kind: "dots", groups: [Math.min(20, Math.floor(plan.dayRange.max))], takenAway: 0 } : { kind: "ten-frame", counters: plan.numbers[0] > 10 ? [0, 0] : [0] } };
    built.check = { status: "not-checked", reason: "a parent checks the circle or coloured drawing" };
  }
  built.package.textSource = plan.source === "code" ? "code" : "ai";
  const checked = checkQuestionPackage(built.package);
  if (checked.status === "failed") return { ...built, check: { status: "failed", reason: checked.reason } };
  return built;
}

export function approvedSkillIds(): string[] {
  return [...new Set(Object.values(approvedSkills).flat())];
}

/** Semantic guards supplement the arithmetic checker. A correct sum can teach the wrong skill. */
export function skillItemProblem(plan: ItemPlan): string | null {
  const p = plan.item, id = p.skill;
  if (!approvedQuestionTypes(id).includes(plan.type)) return "the skill has no approved builder";
  if (plan.source === "explain") return p.text.includes("first story on this page") ? null : "the explanation must refer to the story on this page";
  const [a, b] = p.operation?.operands.map(x => x.value!) ?? [];
  const bad = (ok: boolean, rule: string) => ok ? null : `${id}: ${rule}`;
  if (id === "1.3-doubles") return bad(p.operation?.kind === "add" && a === b && a + b <= 20, "use equal addends within 20");
  if (id === "2.3-near-doubles") return bad(p.operation?.kind === "add" && Math.abs(a - b) === 1 && a + b <= 20, "use addends that differ by 1 within 20");
  if (id === "1.1-ten-and-ones") return bad(p.operation?.kind === "add" && a === 10 && b >= 1 && b <= 10, "use ten and some ones");
  if (/make-10|partners-of-10/.test(id) && id !== "1.3-make-10-to-add") return bad(p.operation?.kind === "missing-addend" && b === 10, "find the missing part of 10");
  if (id === "1.3-make-10-to-add") return bad(p.operation?.kind === "add" && a < 10 && b < 10 && a + b > 10, "add across 10");
  if (plan.type === "step") return bad(["add", "subtract"].includes(p.operation?.kind ?? "") && b === (/two/.test(id) ? 2 : 1), "change by the stated step");
  if (/^2\.4-(?:add|subtract|split)/.test(id)) return bad(a >= 10 && a <= 99 && b >= 10 && b <= 99, "use two-digit operands");
  if (/^[34]\.[34]-add/.test(id)) return bad(p.operation?.kind === "add" && a % 10 + b % 10 >= 10, "include a carry");
  if (/^[34]\.[34]-subtract/.test(id)) return bad(p.operation?.kind === "subtract" && a % 10 < b % 10, "include regrouping");
  if (plan.type === "places") {
    const n = p.numbers[0]?.value ?? NaN;
    if (/decimal/.test(id)) return bad(!Number.isInteger(n) && String(n).split(".")[1]?.length === (/^4/.test(id) ? 2 : 3) && (p.places === null || p.places.includes(/^4/.test(id) ? "hundredths" : "thousandths")), "use the taught decimal places");
    if (id === "3.1-place-value-1000") return bad(n >= 100 && Math.floor(n / 10) % 10 === 0, "include a zero placeholder");
    return bad(Number.isInteger(n) && n >= 10, "use a multi-digit whole number");
  }
  if (plan.type === "relation") {
    if (id === "K2-compare-quantities") return bad(["more", "fewer", "equal"].includes(p.relation?.kind ?? "") && p.numbers.length === 2, "compare the quantities");
    const refs = id === "K3-benchmarks-5-10" ? [0,5,10] : id === "1.2-benchmarks-10-20" ? [0,10,20] : [0,25,50,100];
    return bad(p.relation?.kind === "closer" && p.relation.to.length === 2 && p.relation.to.every(n=>refs.includes(n)) && p.relation.to[0] !== p.relation.to[1], "use the taught benchmarks");
  }
  if (plan.type === "order") return bad(p.format === "order" && p.numbers.length >= 3 && (id !== "6.1-compare-order" || p.numbers.some(v=>!Number.isInteger(v.value))), "order the taught number forms");
  if (plan.type === "sequence" && p.sequence) return bad(Math.abs(p.sequence.step.value!) === (/skip-count/.test(id) ? Math.abs(p.sequence.step.value!) === 2 ? 2 : 5 : 1), "use the taught counting step");
  if (plan.type === "multiply" || plan.type === "divide") return bad(a >= 2 && b >= 2 && b <= 10 && (plan.type === "multiply" ? a <= 10 && a * b <= 100 : a <= 100 && a % b === 0), "use related multiplication facts within 100");
  if (plan.type === "count") return bad(plan.numbers[0] <= (/subitize-to-5/.test(id) ? 5 : /^K|subitize/.test(id) ? 10 : 20), "use the skill's counting limit");
  return null;
}
