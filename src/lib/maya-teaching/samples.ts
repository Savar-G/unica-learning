// Synthetic stored workbook packages in the shapes the generator stores (Wave A): the same template frames, slots and
// derived values as the book's templates, with made-up names and numbers. No customer data. The tests, the behaviour
// gate and the practice suite build their questions from these, through the adapter, as a call does. Pure TypeScript.
import type { QuestionPackage } from "@/lib/question-package";
import type { TemplateSource } from "@/lib/question-package-template";

const BOOK = "0b6c7c1e-6f5d-4a52-9d55-5a1f0e3c2a10";
const int = (value: number) => ({ int: String(value) });
const slot = (name: string, value: number, min: number, max: number) => ({ name, value: int(value), domain: { min, max } });

interface Stored {
  id: string;
  text: string;
  templateId: string;
  skill: string;
  level: number;
  format: "show-work" | "write-number" | "tick-and-number";
  source: TemplateSource;
  key: number;
  /** A tick-and-number item's ticked sign; a template-choice check reads it. */
  sign?: string;
}

/** A stored workbook package with no teaching data, as the generator saves it. */
export function storedQuestion(q: Stored, question = 1): QuestionPackage {
  const regions = [
    ...(q.sign ? [{ id: "operation", kind: "choice", mark: "tick", label: "Tick the operation", answer: q.sign, choices: ["+", "−", "×", "÷"] }] : []),
    { id: "answer", kind: "box", label: q.format === "show-work" ? null : "Write the answer", answer: { type: "number", value: q.key } },
    ...(q.format === "write-number" ? [] : [{ id: "work", kind: "work", label: "Show your work" }]),
  ];
  return {
    id: `${BOOK}:${q.id}`, ref: { source: "workbook", workbookId: BOOK, page: 7, question },
    templateId: q.templateId, textSource: "code", text: q.text,
    operation: null, answer: null, steps: [], wrongAnswers: [], easierExample: null,
    level: q.level, difficulty: 1, skill: { standard: q.skill.split("-")[0], skills: [q.skill] },
    item: {
      format: q.format, scorable: true, parentChecked: false, error: null, regions,
      checks: [
        { kind: "template", region: "answer", source: q.source },
        ...(q.sign ? [{ kind: "template-choice", region: "operation", source: { ...q.source, answer: `'${q.sign}'` } }] : []),
      ],
    },
  } as unknown as QuestionPackage;
}

/** 4.4 step 5's story: 10000 take away a number made from four digits (the template's own derived values). */
export function subtractFromTenThousand(name: string, things: string, digits: [number, number, number, number], format: "show-work" | "tick-and-number" = "show-work"): QuestionPackage {
  const [u1, u2, u3, u4] = digits;
  const b = 1 + ((u1 * 1000 + u2 * 100 + u3 * 10 + u4) % 9999);
  return storedQuestion({
    id: `sub-${b}`, text: `${name} has 10000 ${things} and gives ${b} away. How many ${things} are left?`,
    templateId: "4.4-subtract-within-10000#5.3:story", skill: "4.4-subtract-within-10000", level: 16, format, key: 10000 - b,
    ...(format === "tick-and-number" ? { sign: "−" } : {}),
    source: { answer: "a - b", check: null, values: null,
      slots: [slot("u1", u1, 0, 9), slot("u2", u2, 0, 9), slot("u3", u3, 0, 9), slot("u4", u4, 0, 9), slot("flip", 0, 0, 1)],
      derived: [["A", "10000"], ["B", "1 + (u1 * 1000 + u2 * 100 + u3 * 10 + u4) % 9999"], ["a", "A"], ["b", "B"], ["d", "A - B"], ["shown", "d if flip == 0 else d + 10"]] },
  });
}

/** 4.5 step 4's story: "Each crate has 284 apples. Nora has 7 of them. How many apples in all?" */
export function eachHasStory(container: string, size: number, things: string, name: string, groups: number): QuestionPackage {
  return storedQuestion({
    id: `each-${size}x${groups}`, text: `Each ${container} has ${size} ${things}. ${name} has ${groups} of them. How many ${things} in all?`,
    templateId: "4.5-multiply-1-digit#4.2:story", skill: "4.5-multiply-1-digit", level: 16, format: "show-work", key: size * groups,
    source: { answer: "a * b", check: "a % 10 * b >= 10", values: null, slots: [slot("a", size, 112, 706), slot("b", groups, 3, 8)], derived: [] },
  });
}

/** 4.9 step 3's tick-and-number story: "Theo puts 4 shells in each bag. How many shells in 6 bags?" */
export function putsInEachStory(name: string, size: number, things: string, container: string, plural: string, groups: number): QuestionPackage {
  return storedQuestion({
    id: `puts-${size}x${groups}`, text: `${name} puts ${size} ${things} in each ${container}. How many ${things} in ${groups} ${plural}?`,
    templateId: "4.9-table-pattern#3.2:story", skill: "4.9-table-pattern", level: 13, format: "tick-and-number", key: size * groups, sign: "×",
    source: { answer: "m * p", check: null, values: null, slots: [slot("m", size, 2, 7), slot("p", groups, 1, 6)], derived: [] },
  });
}

/** 5.8 step 2: a sum of two thousands, bare ("16000 + 3000 = ?") or as a story, from the template's derived values. */
export function thousandsSum(a0: number, b0: number, story?: { name: string; things: string }): QuestionPackage {
  const a = Math.floor(a0 / 1000) * 1000;
  const b = 1000 * (1 + ((Math.floor(b0 / 1000) - 1) % Math.max(1, 20 - a / 1000)));
  return storedQuestion({
    id: `sum-${a}+${b}`, text: story ? `${story.name} collected ${a} ${story.things} and a friend collected ${b}. How many ${story.things} is that in all?` : `${a} + ${b} = ?`,
    templateId: story ? "5.8-extend-facts#2.3:story" : "5.8-extend-facts#2.1:bare", skill: "5.8-extend-facts", level: 16, format: "write-number", key: a + b,
    source: { answer: "a + b", check: "a <= 19000", values: null, slots: [slot("a0", a0, 1000, 19999), slot("b0", b0, 1000, 19999)],
      derived: [["a", "a0 // 1000 * 1000"], ["b", "1000 * (1 + (b0 // 1000 - 1) % max(1, 20000 // 1000 - a // 1000))"]] },
  });
}

/** 5.9's multi-step story: "Mo's shop has 4 boxes with 230 beads in each. It sells 460 beads. How many beads are left?" */
export function boxesThenSells(name: string, boxes: number, b0: number, things: string): QuestionPackage {
  const b = Math.floor(b0 / 10) * 10, c = Math.floor(Math.floor(boxes * b / 2) / 10) * 10;
  return storedQuestion({
    id: `boxes-${boxes}x${b}-${c}`, text: `${name}'s shop has ${boxes} boxes with ${b} ${things} in each. It sells ${c} ${things}. How many ${things} are left?`,
    templateId: "5.9-multiply-tens#1.8:story", skill: "5.9-multiply-tens", level: 16, format: "show-work", key: boxes * b - c,
    source: { answer: "a * b - c", check: "b0 >= 10 and a >= 2 and c > 0", values: null, slots: [slot("a0", boxes, 2, 9), slot("b0", b0, 10, 999)],
      derived: [["a", "a0"], ["b", "b0 // 10 * 10"], ["c", "a * b // 2 // 10 * 10"]] },
  });
}

/** 5.1's chained show-work item: "73562 + 1000 + 100 = ?", with the template's own one-step expression ("n + 1100"). */
export function addsThousandChain(n: number): QuestionPackage {
  return storedQuestion({
    id: `chain-${n}`, text: `${n} + 1000 + 100 = ?`, templateId: "5.1-place-value-million#1.6:missing", skill: "5.1-place-value-million", level: 16,
    format: "show-work", key: n + 1100,
    source: { answer: "n + 1100", check: "'0' not in str(n) and n >= 50000 and n <= 98899", values: null, slots: [slot("n0", n, 10000, 99999)], derived: [["n", "n0"]] },
  });
}

/** A bare sum with a plain "a + b" template ("352418 + 41275 = ?"): a 6-digit column addition. */
export function bareSum(a: number, b: number): QuestionPackage {
  return storedQuestion({
    id: `bare-${a}+${b}`, text: `${a} + ${b} = ?`, templateId: "5.8-extend-facts#2.1:bare", skill: "5.8-extend-facts", level: 16, format: "write-number", key: a + b,
    source: { answer: "a + b", check: null, values: null, slots: [slot("a", a, 0, 999_999), slot("b", b, 0, 999_999)], derived: [] },
  });
}
