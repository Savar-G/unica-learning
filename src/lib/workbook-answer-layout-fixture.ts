import type { AnswerRegion, QuestionPackage } from "@/lib/question-package";
import type { Block, DayContent } from "@/lib/workbook-page";
import type { DraftPage, WorkbookDraft } from "@/lib/workbook-render";

// Synthetic pages for the answer-box layout rules (#1212): made-up questions, no real child or family. Each page is a
// day page of a made-up first book, at a level and with the measured ("consistent") layout on or off.

export const ANSWER_LAYOUT_BOOK: Omit<WorkbookDraft, "pages"> = {
  id: "00000000-0000-4000-8000-000000001212", childId: "22222222-2222-4222-8222-222222222222", number: 1, levels: [6], profileBuild: null,
};

type Spec = { text: string; regions: AnswerRegion[]; format?: string };
const box = (answer: string | number, id = "answer", label: string | null = null): AnswerRegion =>
  ({ id, kind: "box", label, answer: typeof answer === "number" ? { type: "number", value: answer } : { type: "text", value: answer } });
const work: AnswerRegion = { id: "work", kind: "work", label: "Show your work" };
const circle = (choices: string[], answer: string): AnswerRegion => ({ id: "answer", kind: "choice", mark: "circle", label: null, choices, answer });
const lines = (label: string): AnswerRegion => ({ id: "why", kind: "lines", label });

function pkg(page: number, n: number, level: number, s: Spec): QuestionPackage {
  return {
    id: `${ANSWER_LAYOUT_BOOK.id}:p${page}.${n}`, ref: { page, source: "workbook", question: n, workbookId: ANSWER_LAYOUT_BOOK.id },
    templateId: null, textSource: "code", text: s.text,
    item: { format: s.format ?? "boxes", scorable: true, parentChecked: false, error: null, regions: s.regions, checks: [] },
    answer: null, operation: null, steps: [], skill: { standard: "2.1", skills: ["2.1-place-value"] }, level, difficulty: 2, wrongAnswers: [], easierExample: null,
  } as QuestionPackage;
}

interface PageSpec { number: number; type: string; day: number; page: number; title: string; subtitle: string; blocks: (items: number[]) => Block[]; questions: Spec[] }

function page(level: number, consistent: boolean, p: PageSpec): DraftPage {
  // (A page holds what its slot takes: two Challenge cards on a saved legacy page, four test cards in the large type.)
  const most = p.type === "challenge" && !consistent ? 2 : p.type === "show-what-you-know" && level <= 9 ? 4 : p.questions.length;
  p = { ...p, questions: p.questions.slice(0, most) };
  const numbers = p.questions.map((_, i) => i + 1);
  const content = {
    kind: "day", id: `UL·SAMPLE·W01·D${String(p.day).padStart(2, "0")}·P${p.page}`, level, day: p.day, page: p.page, pages: 8, topic: "Place value",
    title: p.title, subtitle: p.subtitle, grownUp: null, blocks: p.blocks(numbers), extraGap: 0, consistentLayout: consistent, fillingComplete: true, atMaximum: true,
  } as DayContent;
  return { number: p.number, type: p.type, dayLabel: `Day ${p.day}`, qrToken: `token-${String(p.number).padStart(12, "0")}`,
    questions: p.questions.map((s, i) => ({ number: i + 1, package: pkg(p.number, i + 1, level, s) })), content } as DraftPage;
}

const calc = (text: string, answer: number): Spec => ({ text, regions: [box(answer), work], format: "show-work" });

/** The named scenarios, one page each. `level` 6 is the large type (U4 to U9), 12 the reference sizes. */
export function answerLayoutPages(level: number, consistent: boolean): Record<string, DraftPage> {
  const day = (spec: PageSpec) => page(level, consistent, spec);
  return {
    // Item 1: show-your-work and Challenge cards: the answer box at the bottom right, no label in the card.
    challenge: day({ number: 10, type: "challenge", day: 1, page: 8, title: "Challenge", subtitle: "Test yourself.",
      blocks: (n) => [{ slot: "challenge", items: n }],
      questions: [calc("In 858, add the hundreds value and the tens value. Then take away the ones digit.", 858), calc("A code is 891. Add 1 hundred and take away 1 ten. What is the new code?", 981), calc("In 959, how much more is the hundreds digit worth than the ones digit?", 891)] }),
    // Items 1 and 3: a Challenge with a yes or no answer and a written reason.
    "challenge-yes-no": day({ number: 42, type: "challenge", day: 4, page: 8, title: "Challenge", subtitle: "Test yourself.",
      blocks: (n) => [{ slot: "challenge", items: n }],
      questions: [
        { text: "Is 24 a multiple of 6?", regions: [circle(["yes", "no"], "yes"), lines("How do you know?")], format: "circle" },
        { text: "True or false: every even number is a multiple of 4. How do you know?", regions: [circle(["true", "false"], "false"), lines("How do you know?")], format: "circle" },
        calc("What is 7 × 14 − 20?", 78)] }),
    // Items 1 and 2: show what you know, with and without work space.
    "show-what-you-know": day({ number: 76, type: "show-what-you-know", day: 10, page: 2, title: "Show what you know", subtitle: "Ten days of work. Show what you learned!",
      blocks: (n) => [{ slot: "show-what-you-know", items: n }],
      questions: [calc("In 917, how much more is the 9 worth than the 7?", 893),
        { text: "25 toy cars in each group. 175 in all. How many groups?", regions: [box(7)] },
        { text: "Write 907 in expanded form.", regions: [box("900 + 7")] },
        calc("In 803, change the tens digit to 6. What is the new number?", 863),
        { text: "100 blocks in each group. 800 in all. How many groups?", regions: [box(8)] },
        calc("Start at 89. Add 50 four times. What do you reach?", 289)] }),
    // Item 4: comparison questions, the answer box between the two numbers; true or false beside them.
    "quick-check": day({ number: 9, type: "remember-these", day: 1, page: 7, title: "Quick check", subtitle: "Write in boxes. Circle your answers.",
      blocks: (n) => [{ slot: "unit-check", items: n }],
      questions: [{ text: "True or false: 275 < 195.", regions: [circle(["true", "false"], "false")], format: "circle" }, { text: "Write < or >: 278 ? 578", regions: [box("<")] },
        { text: "True or false: 784 < 683.", regions: [circle(["true", "false"], "false")], format: "circle" }, { text: "Write < or >: 515 ? 160", regions: [box(">")] }] }),
    // Item 2: one answer box per question, all in the same column.
    "mixed-answers": day({ number: 8, type: "practice", day: 1, page: 4, title: "Place value", subtitle: "Write in boxes.",
      blocks: (n) => [{ slot: "on-your-own", items: n }],
      questions: [{ text: "What is the value of the 7 in 472?", regions: [box(70)] }, { text: "Write 358 in expanded form.", regions: [box("300 + 50 + 8")] },
        { text: "Which is greater: 463 or 436?", regions: [box(463)] }, { text: "Round 647 to the nearest ten.", regions: [box(650)] },
        { text: "What number is 100 more than 482?", regions: [box(582)] }, { text: "Is 24 a multiple of 6? Write yes or no.", regions: [box("yes")] }] }),
    // Item 5: the five-skill check header.
    "friday-5": day({ number: 41, type: "friday-5", day: 5, page: 7, title: "Friday 5", subtitle: "Write in boxes.",
      blocks: (n) => [{ slot: "friday-5", items: n }],
      questions: [{ text: "What is 300 + 40 + 6?", regions: [box(346)] }, { text: "What is 520 − 100?", regions: [box(420)] }, { text: "Write 612 in words.", regions: [box("six hundred twelve")] },
        { text: "What is 8 × 4?", regions: [box(32)] }, { text: "What is 45 ÷ 5?", regions: [box(9)] }] }),
  };
}
