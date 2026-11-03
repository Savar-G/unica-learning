// The item contract (#480). Code owns the type, the numbers, the operation and the
// help. The writer can change only the words of a story or an explanation.
import { framesFor, fillFrame, frameDoes, PEOPLE, THINGS, storyProblem } from "./workbook-wording";
import approvedSkills from "./workbook-approved-skills.json";
import type { AiItem, AiOperation, AiValue, BuiltQuestion, GeneratedFormat, SlotPlace } from "./workbook-generator-items";
import { buildQuestion } from "./workbook-generator-items";
import { checkQuestionPackage } from "./question-package";
import { LIKELIHOOD_EVENTS } from "./workbook-likelihood-bank";
import { STORY_FRAMES, COMPACT_STORY_FRAMES } from "./workbook-story-bank";
import { buildStepItem, stepStoryProblem, type StepTemplateRef } from "./workbook-step-items";

/** An approved hand-built type, or "template": a question filled from its step's templates (#489). */
export type QuestionType = keyof typeof approvedSkills | "template";
export interface ItemDayRange { min: number; max: number; pictures: boolean; help: "full" | "partial" | "none" }
export interface ItemPlan {
  type: QuestionType;
  source: "code" | "story" | "explain";
  item: AiItem;
  /** The exact multiset of numbers that the story must print, including duplicates. */
  numbers: number[];
  dayRange: ItemDayRange;
  textBudget?: { lines: number; perLine: number; characters: number };
  /** #489: the step template the item was filled from; absent on a hand-built item. */
  template?: StepTemplateRef;
}

export function itemTextLines(text: string, perLine: number): number {
  let lines = 1, used = 0;
  for (const word of text.trim().split(/\s+/)) {
    if (used && used + word.length + 1 > perLine) { lines++; used = 0; }
    used += word.length + (used ? 1 : 0);
    if (used > perLine) { lines += Math.floor((used - 1) / perLine); used = ((used - 1) % perLine) + 1; }
  }
  return lines;
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
    count: ["Colour 5 dots in the row.", "Colour in 7 cells on the printed ten-frame."],
    likelihood: LIKELIHOOD_EVENTS.map(event => `${event} Circle never, sometimes or always.`),
    relation: ["Mia sees 3 red counters and 5 blue counters. Are there more red counters or blue counters?", "Is 8 close to 0 or 10?"],
    bond: ["4 + ? = 9", "Mia needs 10 shells. She has 6. How many more shells does she need?"],
    step: ["7 + 1 = ?", "Ben has 8 cars. He gives 2 away. How many cars does Ben have now?"],
    add: ["7 + 5 = ?", "Ava has 3 apples. She gets 4 more. How many apples does Ava have now?"],
    subtract: ["9 - 4 = ?", "Leo has 9 cups. He gives 4 away. How many cups does Leo have now?"],
    order: ["Write the numbers from least to greatest. [6, 2, 9]", "Write the numbers from greatest to least. [3, 8, 5]"],
    places: ["Write the tens and ones in 17.", "Write the tens and ones in 24."],
    multiply: ["3 × 4 = ?", "Mia fills 3 bags. Each bag has 4 shells. How many shells does Mia pack?"],
    divide: ["12 ÷ 3 = ?", "Ben shares 12 apples equally among 3 bags. How many apples does Ben put in each bag?"],
    explain: ["How can you check the first story on this page?", "How do you know your answer to the first story on this page is right?"],
  },
  middle: {
    add: ["268 + 157 = ?", "Mia has 268 beads. She gets 157 more. How many beads does Mia have now?"],
    subtract: ["425 - 157 = ?", "Ben has 425 cards. He gives 157 away. How many cards does Ben have now?"],
    multiply: ["7 × 8 = ?", "Ava fills 7 boxes. Each box holds 8 cups. How many cups does Ava pack?"],
    divide: ["72 ÷ 8 = ?", "Leo shares 72 beads equally among 8 bags. How many beads does Leo put in each bag?"],
    explain: ["How can you check the first story on this page?", "Explain how to check the first story on this page."],
  },
  upper: {
    add: ["1250 + 875 = ?", "Mia has 1250 beads. She gets 875 more. How many beads does Mia have now?"],
    subtract: ["1250 - 875 = ?", "Ben has 1250 cards. He gives 875 away. How many cards does Ben have now?"],
    multiply: ["6 × 9 = ?", "Ava fills 6 boxes. Each box holds 9 cups. How many cups does Ava pack?"],
    divide: ["63 ÷ 7 = ?", "Leo shares 63 beads equally among 7 bags. How many beads does Leo put in each bag?"],
    explain: ["How can you check the first story on this page?", "Explain how to check the first story on this page."],
  },
} as const;

export function itemExamples(type: QuestionType, level: number, source: ItemPlan["source"]) {
  const band = level <= 9 ? ITEM_EXAMPLES.early : level <= 18 ? ITEM_EXAMPLES.middle : ITEM_EXAMPLES.upper;
  const key = source === "explain" ? "explain" : type;
  const items: readonly string[] = key in band ? band[key as keyof typeof band] : ITEM_EXAMPLES.early[key as keyof typeof ITEM_EXAMPLES.early] ?? [];
  const storyKind = type === "sequence" ? "add" : type;
  const examples = source === "story" && (storyKind === "add" || storyKind === "subtract") ? (level <= 9 ? COMPACT_STORY_FRAMES : STORY_FRAMES)[storyKind].slice(0, 4).map(f => fillFrame(f,
    level <= 9 ? {a:3,b:2,t:5} : level <= 18 ? {a:268,b:157,t:425} : {a:1250,b:875,t:2125}, "Mia", "shells")) : [];
  const challenge = source === "story" && type === "sequence" ? ["Mia has 5 shells. She gets 1 more. Then she gets 2 more. How many shells does Mia have now?", "Ben packs 10 books. Ava brings 1 book. Leo brings 2 books. Mia brings 3 books. How many books does Ben pack?"] : [];
  return { band: level <= 9 ? "K-2" : level <= 18 ? "3-5" : "6-9", type: key, items: [...items, ...examples, ...challenge] };
}

/** One slot's deterministic item, including the story's fixed math. */
export function planItem(o: { skill: string; slot: string; level: number; day: number; ordinal: number; range: ItemDayRange; story?: boolean; explain?: boolean; challenge?: boolean; format?: GeneratedFormat; attempt?: number; compact?: boolean; textBudget?: ItemPlan["textBudget"] }): ItemPlan | null {
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
      item.text = LIKELIHOOD_EVENTS[seed % LIKELIHOOD_EVENTS.length];
      if (o.textBudget && (item.text.length > o.textBudget.characters || itemTextLines(item.text,o.textBudget.perLine)>o.textBudget.lines)) return null;
      item.format = "written-reason"; // Built as a circle region below, using the existing renderer.
      break;
    }
    case "count": {
      const countMax = /subitize-to-5/.test(o.skill) ? Math.min(5, max) : /subitize|^K/.test(o.skill) ? Math.min(10, max) : Math.min(20, max);
      const count = Math.min(countMax, Math.max(1, Math.ceil(Math.min(r.min, countMax)), 1 + seed % countMax));
      item.text = count <= 8 && Math.floor(seed / countMax) % 2 && !/ten-frame/.test(o.skill) ? `Colour ${count} ${count === 1 ? "dot" : "dots"} in the row.` : `Colour in ${count} ${count === 1 ? "cell" : "cells"}.`;
      item.format = "draw";
      numbers = [count];
      break;
    }
    case "sequence": {
      // A third form beside counting on and back (Cedric's section 9): count on 1 from a number, in three wordings.
      // Only on a later attempt, so a page takes it when the planner needs a third form, not by default.
      if ((o.attempt ?? 0) % 3 === 2 && !/skip-count/.test(o.skill) && max >= 4) {
        const n = Math.max(1, Math.min(max - 1, top - 1));
        item.operation = operation("add", n, 1);
        item.text = [`Count on 1 from ${n}. Which number is it?`, `Start at ${n}. Count on 1. Write the number.`, `What number is 1 after ${n}?`,
          `Count on 1 from ${n}. Write where you land.`, `Begin at ${n} and count 1 more. Write it.`][Math.floor((o.attempt ?? 0) / 3) % 5];
        item.format = o.format === "spot-the-error" || o.format === "two-ways" || o.format === "tick-and-number" ? "write-number" : o.format ?? "write-number";
        item.wrongAnswers = [{ value: itemNumber(n + 2), cause: "careless", description: "Counts one too many.", step: null }];
        numbers = [n];
        break;
      }
      const stepSize = /skip-count/.test(o.skill) ? (seed % 2 || max < 10 ? 2 : 5) : 1;
      const terms = Math.min(o.compact ? max >= 10 ? 4 : 4 + seed % 2 : 3 + seed % 3, Math.floor(max / stepSize) + 1);
      const end = Math.min(max, Math.max(stepSize * (terms - 1), top));
      const first = Math.max(0, end - stepSize * (terms - 1));
      const down = Math.floor(seed / 3) % 2 === 1;
      item.format = "sequence";
      item.text = down ? "Count back." : "Fill gaps.";
      const mask = 1 + Math.floor(seed / 7) % ((1 << terms) - 2);
      const blanks = Array.from({length: terms}, (_, i) => i).filter(i => mask & (1 << i)).slice(0,Math.min(2,terms-2));
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
        item.relation = { kind: "more", to: [], labels: ["red", "blue"] };
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
      item.format = "places"; item.text = `Write the digits in ${number}.`;
      item.numbers = [itemNumber(number)];
      item.places = null;
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
      if (type === "multiply" || type === "divide") { if (max < 4) return null; y = 2 + seed % Math.min(9, Math.floor(max / 2) - 1); x = Math.max(2, Math.min(2 + Math.floor(seed / 9) % 9, Math.floor(max / y))); kind = type; if (type === "divide") x *= y; }
      item.operation = operation(kind, x, y);
      if (r.pictures && top <= 10 && ["add", "subtract", "missing-addend"].includes(kind) && o.format !== "spot-the-error") item.figure = "ten-frame";
      if (kind === "missing-addend" && item.figure) item.figureShows = "part";
      const sign = { add: "+", subtract: "-", multiply: "×", divide: "÷", "missing-addend": "+" }[kind as "add"];
      item.text = kind === "missing-addend" ? `${x} + ? = ${y}` : seed % 2 ? `${x} ${sign} ${y} = ?` : `? = ${x} ${sign} ${y}`;
      if (o.compact && source === "code" && kind !== "missing-addend") item.text = `${x}${sign}${y}=`;
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
    const compact = COMPACT_STORY_FRAMES[item.operation.kind as keyof typeof COMPACT_STORY_FRAMES] ?? [];
    const words = [...frames.map(f => f.f), ...extra, ...compact].map(f => fillFrame(f, {a: pair[0], b: pair[1], t: pair[0] + pair[1]}, name, thing));
    const sound = words.filter(text => !/\bdraw(?:s|ing)?\b/i.test(text) && stable((text.match(/\d+/g) ?? []).map(Number).sort((a,b)=>a-b)) === stable([...numbers].sort((a,b)=>a-b)) && (!o.textBudget || text.length <= o.textBudget.characters && itemTextLines(text, o.textBudget.perLine) <= o.textBudget.lines));
    if (!sound.length) return null;
    if (sound.length) { item.text = sound[Math.floor(seed / 3) % sound.length]; item.name = name; item.thing = thing; }
  }
  if (o.challenge) {
    // A count-on challenge has two changes, then three changes on later days.
    // Other skills require their own reviewed multi-step builder.
    if (!/^1\.1-(?:count|read-write|number-line)/.test(o.skill)) return null;
    const position = (Number(o.slot.split(".")[1]) || 1) - 1;
    const changes = o.day >= 8 ? [1, 2, 3 + position] : [1, 2 + position];
    const start = max - changes.reduce((n, v) => n + v, 0);
    if (start < 1) return null;
    const values = [start, ...changes];
    item.operation = { kind: "evaluate", operands: [], expression: values.join(" + "), unit: null, denominator: null, values: [] };
    const settings = [
      [`Mia has ${start} shells. She gets 1 more. Then she gets ${changes[1]} more.`, "How many shells does Mia have now?"],
      [`Ben puts ${start} apples in a bag. He adds 1 apple. Ava puts in ${changes[1]} more.`, "How many apples are in the bag now?"],
      [`Ava sees ${start} birds on a fence. 1 bird lands. Then ${changes[1]} more birds land.`, "How many birds does Ava see now?"],
      [`Leo builds a tower with ${start} blocks. He puts 1 block on top. Then he adds ${changes[1]} more blocks.`, "How many blocks are in Leo's tower now?"],
      [`Mia packs ${start} books. Ben brings 1 book. Ava brings ${changes[1]} more books.`, "How many books does Mia pack?"],
      [`Ben finds ${start} buttons. He finds 1 more. Then he finds ${changes[1]} in a bag.`, "How many buttons did Ben find?"],
      [`Ava finds ${start} buttons. She finds 1 under a chair. Then she finds ${changes[1]} in a box.`, "How many buttons did Ava find?"],
      [`Leo has ${start} cars on a shelf. He puts 1 car beside them. Then he puts down ${changes[1]} more cars.`, "How many cars are on the shelf now?"],
      [`Mia counts ${start} ducks in a pond. 1 duck swims over. Then ${changes[1]} more ducks join them.`, "How many ducks does Mia see now?"],
      [`Ben puts ${start} pens on a desk. Ava adds 1 pen. Leo adds ${changes[1]} more pens.`, "How many pens are on the desk now?"],
      [`Mia puts ${start} cups on a tray. Ben adds 1 cup. Ava adds ${changes[1]} cups.`, "How many cups are on the tray now?"],
      [`Ben collects ${start} leaves. He finds 1 by a tree. Then he finds ${changes[1]} by a gate.`, "How many leaves did Ben collect?"],
      [`Ava hangs up ${start} hats. Leo brings 1 hat. Mia brings ${changes[1]} hats.`, "How many hats are hanging up now?"],
      [`Leo puts ${start} socks in a bag. He finds 1 sock. Then he finds ${changes[1]} more socks.`, "How many socks does Leo pack?"],
      [`Mia picks ${start} plums. Ben gives her 1 plum. Ava gives her ${changes[1]} plums.`, "How many plums does Mia have now?"],
      [`Ben sets out ${start} plates. He adds 1 plate for Mia. Then he adds ${changes[1]} more plates.`, "How many plates are set out now?"],
      [`Ava buys ${start} pens. Leo gives her 1 pen. She finds ${changes[1]} pens in her desk.`, "How many pens does Ava have now?"],
      [`Leo has ${start} stickers. He gets 1 for a game. Then he gets ${changes[1]} for a race.`, "How many stickers does Leo have now?"],
      [`Mia lines up ${start} shoes. She adds 1 shoe. Then she puts down ${changes[1]} more shoes.`, "How many shoes are in the line now?"],
      [`Ben counts ${start} boats. 1 boat arrives. Then ${changes[1]} more boats arrive.`, "How many boats does Ben see now?"],
    ];
    settings.push(
      [`Mia puts ${start} seeds in a pot. She adds 1 seed, then ${changes[1]} more.`, "How many seeds are in the pot?"],
      [`Ben picks up ${start} stones. He picks up 1 by a tree and ${changes[1]} by a wall.`, "How many stones does Ben pick up?"],
      [`Ava puts ${start} flowers in a vase. She adds 1 flower, then ${changes[1]} more.`, "How many flowers are in the vase?"],
      [`Leo loads ${start} logs on a cart. Mia brings 1 log. Ben brings ${changes[1]} logs.`, "How many logs are on the cart?"],
      [`Mia has ${start} eggs. A hen lays 1 egg. Another hen lays ${changes[1]} eggs.`, "How many eggs does Mia have?"],
      [`Ben puts ${start} toys in a tub. Ava puts in 1 toy, then ${changes[1]} more.`, "How many toys are in the tub?"],
      [`Ava counts ${start} fish. 1 swims over. Then ${changes[1]} more swim over.`, "How many fish can Ava see?"],
      [`Leo has ${start} tickets. Ben gives him 1 ticket. Mia gives him ${changes[1]} tickets.`, "How many tickets does Leo have?"],
      [`Mia stacks ${start} towels. She adds 1 clean towel, then ${changes[1]} more.`, "How many towels are in the stack?"],
      [`Ben has ${start} peaches. He picks 1 peach. Ava picks ${changes[1]} peaches.`, "How many peaches do they have?"],
      [`Mia has ${start} keys. Ben returns 1 key. Ava returns ${changes[1]} keys.`, "How many keys does Mia have?"],
      [`Ben sets out ${start} chairs. Ava brings 1 chair. Leo brings ${changes[1]} chairs.`, "How many chairs are set out?"],
      [`Ava counts ${start} hens. 1 comes from a shed. Then ${changes[1]} more come out.`, "How many hens can Ava see?"],
      [`Leo sorts ${start} coins. Mia finds 1 coin. Ben finds ${changes[1]} coins.`, "How many coins do they have?"],
      [`Mia hangs ${start} bells. Ben hangs 1 bell. Ava hangs ${changes[1]} bells.`, "How many bells are hanging?"],
      [`Ben packs ${start} pears. He adds 1 ripe pear, then ${changes[1]} more.`, "How many pears does Ben pack?"],
      [`Ava has ${start} ribbons. She gets 1 at a fair and ${changes[1]} at a show.`, "How many ribbons does Ava have?"],
      [`Leo picks ${start} beans. He finds 1 on a vine, then ${changes[1]} more.`, "How many beans does Leo pick?"],
      [`Mia washes ${start} bowls. Ben brings 1 bowl. Ava brings ${changes[1]} bowls.`, "How many bowls do they have?"],
      [`Ben fills ${start} jars. He fills 1 with rice, then ${changes[1]} with oats.`, "How many jars does Ben fill?"]);
    const settingIndex=(o.day - 1 + position * 10) % settings.length;
    const setting = settings[settingIndex];
    const extra=changes[2];
    const third:Record<number,string>={7:`Ben adds ${extra} cars.`,8:`${extra} ducks join.`,9:`Mia adds ${extra} pens.`,
      17:`Ava gives him ${extra}.`,18:`Leo brings ${extra}.`,19:`${extra} more sail in.`,
      27:`He gets ${extra} more.`,28:`Ben stacks ${extra} more.`,29:`Leo picks ${extra} more.`};
    item.text = `${setting[0]}${changes.length === 3 ? ` ${third[settingIndex] ?? `They bring ${extra} more.`}` : ""} ${setting[1]}`;
    item.format = "show-work"; item.figure = null; item.sequence = null;
    item.easier = { text: `${[start - 1, ...changes].join(" + ")} = ?`, operation: { ...item.operation, expression: [start - 1, ...changes].join(" + ") } };
    item.wrongAnswers = [{ value: itemNumber(max - 1), cause: "careless", description: "Counts one too few.", step: null }]; numbers = values;
    return { type, source: "story", item, numbers, dayRange: r, ...(o.textBudget ? { textBudget: o.textBudget } : {}) };
  }
  if (source === "explain") { item.text = "How can you check the first story on this page?"; item.format = "written-reason"; item.operation = null; item.figure = null; item.figureShows = null; item.numbers = []; item.sequence = null; item.relation = null; item.wrongAnswers = []; item.easier = null; numbers = []; }
  return { type, source, item, numbers, dayRange: r, ...(o.textBudget ? { textBudget: o.textBudget } : {}) };
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
  if (plan.textBudget && (r.text.length > plan.textBudget.characters || itemTextLines(r.text, plan.textBudget.perLine) > plan.textBudget.lines)) return `the text must fit ${plan.textBudget.lines} lines of ${plan.textBudget.perLine} characters`;
  if (plan.source === "explain" && !/^(?:How (?:do|can|did)|Why\b|Explain\b)/i.test(r.text)) return "an explain item must ask how or why";
  if (plan.source === "explain" && !STORY_EXPLAIN.test(r.text)) return "the explanation must refer to the first story on this page";
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
  if (plan.template) return buildTemplatePlan(plan, plan.template, raw, place);
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
      regions: [{ id: "answer", kind: "choice", mark: "circle", label: null, choices: ["never", "sometimes", "always"], answer: null }], checks: [], error: null }
      : { format: "colour-or-shade", scorable: false, parentChecked: true, regions: [{ id: "drawing", kind: "picture", label: null }], checks: [], error: null,
        figure: / dots? in the row/.test(p.text) ? { kind: "dots", groups: [Math.min(8, Math.floor(plan.dayRange.max))], takenAway: 0 } : { kind: "ten-frame", counters: plan.numbers[0] > 10 ? [0, 0] : [0] } };
    built.check = { status: "not-checked", reason: "a parent checks the circle or coloured drawing" };
  }
  if (plan.source === "code" && plan.type === "relation" && plan.item.relation?.kind === "more") {
    const [red,blue]=plan.item.numbers.map(n=>n.value);
    built.package.text=`Red: ${red}. Blue: ${blue}. Which has more?`;
  }
  built.package.textSource = plan.source === "code" ? "code" : "ai";
  const checked = checkQuestionPackage(built.package);
  if (checked.status === "failed") return { ...built, check: { status: "failed", reason: checked.reason } };
  return built;
}

/**
 * A step template item (#489): code's text, or the writer's rewording of a story with exactly the same numbers. The
 * package's answer comes from the template, recomputed by the checker from the sampled numbers.
 */
function buildTemplatePlan(plan: ItemPlan, ref: StepTemplateRef, raw: unknown, place: SlotPlace): BuiltQuestion {
  const failed = (reason: string): BuiltQuestion => ({ package: null, stepIds: [], check: { status: "failed", reason } });
  if (!raw || typeof raw !== "object") return failed("the writer did not fill the approved item");
  const r = raw as AiItem;
  if (r.skill !== plan.item.skill || r.format !== plan.item.format) return failed("the writer changed the approved skill or question format");
  if (plan.source === "story" && r.text !== plan.item.text) {
    // A rewording that breaks the contract (other numbers, no question at the end, too long) keeps the template's own
    // checked words instead: the slot is never left empty for the writer's words (the U4 review, items 2 and 4).
    const problem = stepStoryProblem(r.text, plan.numbers, ref, place.level)
      ?? (plan.textBudget && (r.text.length > plan.textBudget.characters || itemTextLines(r.text, plan.textBudget.perLine) > plan.textBudget.lines) ? "too long" : null);
    if (!problem) return buildStepItem(ref, r.text, place, "ai");
  }
  return buildStepItem(ref, plan.item.text, place, "code");
}

export function approvedSkillIds(): string[] {
  return [...new Set(Object.values(approvedSkills).flat())];
}

/** An explanation of the page's first story: "... the first story on this page ..." or "How did you work out question 1?". */
export const STORY_EXPLAIN = /first story on this page|\b(?:work(?:ed)? out|answer to) question \d+\b/i;

/** Semantic guards supplement the arithmetic checker. A correct sum can teach the wrong skill. */
export function skillItemProblem(plan: ItemPlan): string | null {
  const p = plan.item, id = p.skill;
  if (plan.type === "template") return plan.template || plan.source === "explain" ? null : "a template item needs its step template";
  if (!approvedQuestionTypes(id).includes(plan.type)) return "the skill has no approved builder";
  if (plan.source === "explain") return STORY_EXPLAIN.test(p.text) ? null : "the explanation must refer to the story on this page";
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
