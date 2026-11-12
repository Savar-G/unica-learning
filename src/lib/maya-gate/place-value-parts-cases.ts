// Gate cases for B1b's place-value asks (compare, sum, tenths build; design: .design/research/maya-place-value-design.md,
// section 7.2): each fixture is the teaching package Maya's session adapter makes from a synthetic stored question
// (src/lib/maya-teaching/place-value-parts.ts), as a call gets it. The cases show: the circled word read only by A4's
// reader (a bare word is said back first, a hedge or a question is not an answer); no step credit from a hedged,
// questioning, other-speaker or copied turn; no given answer (the easier example, then an honest close); the J06
// behaviours (an early step in the child's own words is acknowledged and Maya goes on, and a question about the step gets
// code's answer first); framing at any level; full-sentence work in scope.
import { packageLines, type LineOffer } from "@/lib/maya/lines";
import type { OperationPackage, QuestionPackage } from "@/lib/question-package";
import { placePartsTeachingPackage } from "@/lib/maya-teaching/place-value-parts";
import { storedBuild, storedCompare, storedSum } from "@/lib/maya-teaching/place-value-parts-samples";
import type { Behaviour, Plan, Read, Step } from "./gate";

export type PlacePartsFixtureId = "PVC" | "PVC0" | "PVCZ" | "PVSUM" | "PVB";

const made = (stored: QuestionPackage): QuestionPackage => {
  const r = placePartsTeachingPackage(stored);
  if (!r || "held" in r) throw new Error(`the adapter held ${stored.text}: ${r ? r.held : "not a B1b template"}`);
  return r.package;
};

export const PLACE_PARTS_FIXTURES: Record<PlacePartsFixtureId, QuestionPackage> = {
  /** True or false: in 38472, the digit in the thousands place is bigger than the digit in the hundreds place. True. */
  PVC: made(storedCompare({ step: 1, n0: 38472, place: "thousands", second: "hundreds" })),
  /** True or false: in 735561, the digit in the thousands place is bigger than ... hundreds place. False (5 and 5). */
  PVC0: made(storedCompare({ step: 2, n0: 735561, place: "thousands", second: "hundreds" })),
  /** True or false: in 482097, the digit in the ten thousands place is bigger than ... hundreds place. True (8 and 0). */
  PVCZ: made(storedCompare({ step: 3, n0: 482097, place: "ten thousands", second: "hundreds" })),
  /** In 87346, what is the value of the thousands digit plus the value of the tens digit? 7040. */
  PVSUM: made(storedSum({ step: 1, n0: 87346, place: "thousands", second: "tens" })),
  /** 5 wholes and 8 tenths is ? as a decimal. 5.8. */
  PVB: made(storedBuild({ wholes: 5, tenths: 8 })),
};

const child = (text: string, read?: Read, maya?: Plan[]): Step => ({ child: text, ...(read ? { read } : {}), ...(maya ? { maya } : {}) });
const solvedEnd: Step[] = [child("Okay.", undefined, [{ act: "ask_write", understanding: "uncertain" }]), child("I circled it.", { paper: "written" })];
const writtenEnd: Step[] = [child("Okay.", undefined, [{ act: "ask_write", understanding: "uncertain" }]), child("I wrote it.", { paper: "written" })];
const OPEN = "open" as const;
const lines = (id: PlacePartsFixtureId) => packageLines(PLACE_PARTS_FIXTURES[id] as OperationPackage);
const texts = (offers: LineOffer[], key: string) => offers.filter((o) => o.key === key).flatMap((o) => o.texts);
/** "I'm stuck." n times; the model fails each time, so code's fallback raises the help one level a turn. */
const stuck = (n: number): Step[] => Array.from({ length: n }, () => child("I'm stuck.", { help: "more" }, [{ throws: true }]));
/** A turn the model cannot answer at all (it throws): code's fallback says Maya's turn. */
const failing = (text: string): Step => child(text, undefined, [{ throws: true }]);
/** A wrong answer the model reads right but answers with a guide the top-help rule refuses; its repair fails too. */
const wrongRefused = (value: number, step: string): Step => child(String(value), { answers: [[value, step, "wrong"]] }, [{
  act: "guide", repair: { throws: true },
  raw: {
    version: 2, act: "guide", step, level: 2, reading: { answers: [{ value: { type: "number", value }, step, verdict: "wrong" }] },
    parts: [{ line: "check.not_yet", slots: { step, heard: String(value) } }],
  },
}]);
/** The opening "I'm stuck." with the child's start read, then more "I'm stuck." turns. */
const stuckFromStart = (n: number): Step[] => stuck(n).map((s, i) => (i === 0 ? { ...s, read: { start: "has_work" as const, help: "more" as const } } : s));
const EXAMPLE_THEN_CLOSE = { outcome: { reason: "maya_closed" as const, assistance: "worked_example" as const }, never: ["give_answer" as const, "accept_answer" as const] };
/** The compare's three steps said right, one turn each: the thousands digit, the hundreds digit, the bigger one. */
const compareSteps: Step[] = [
  child("8", { start: "has_work", answers: [[8, "digit-1", "right"]] }, [{ act: "guide", step: "digit-2", level: 0, lines: ["check.right_step", "step.invite"] }]),
  child("4", { answers: [[4, "digit-2", "right"]] }, [{ act: "guide", step: "bigger", level: 0, lines: ["check.right_step", "step.invite"] }]),
  child("8 is bigger.", { answers: [[8, "bigger", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
];

export const PLACE_PARTS_BEHAVIOURS: Behaviour[] = [
  // ---------- Compare ----------
  {
    id: "PVC01", title: "Compare: 'It's true.' at once; accepted, and the board stripes both columns and writes 8 > 4 (screen c)", fixture: "PVC", status: "passing",
    steps: [child("It's true.", { start: "has_work" }, [{ act: "accept_answer", lines: ["answer.right"], draw: ["question.chart", "question.answer"] }]), ...solvedEnd],
    expect: { outcome: { reason: "solved" }, acts: [OPEN, "accept_answer", "ask_write", "close"], counts: { refusals: 0, boardBatches: 1 }, never: ["give_answer"] },
  },
  {
    id: "PVC02", title: "Compare: each digit, then the bigger one, then the committed word; every step credited from its whole turn", fixture: "PVC", status: "passing",
    steps: [...compareSteps, child("It's true.", undefined, [{ act: "accept_answer", lines: ["answer.right"] }]), ...solvedEnd],
    expect: {
      outcome: { reason: "solved", assistance: "independent" }, acts: [OPEN, "guide", "guide", "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0 },
      outputs: [{ mayaTurn: 3, lines: [texts(lines("PVC").rightStep("bigger"), "right.bigger"), texts(lines("PVC").help("result"), "invite.compare")] }],
    },
  },
  {
    id: "PVC03", title: "Compare, the same digits: no bigger step; after both digits Maya asks the statement, and 'It's false.' stands", fixture: "PVC0", status: "passing",
    steps: [
      child("5", { start: "has_work", answers: [[5, "digit-1", "right"]] }, [{ act: "guide", step: "digit-2", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("5", { answers: [[5, "digit-2", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("It's false.", undefined, [{ act: "accept_answer", lines: ["answer.right"] }]),
      ...solvedEnd,
    ],
    expect: { outcome: { reason: "solved", assistance: "independent" }, acts: [OPEN, "guide", "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0 } },
  },
  {
    id: "PVC04", title: "Compare: a bare 'True.' after the statement's own question is said back first; the child's plain yes commits it", fixture: "PVC", status: "passing",
    steps: [...compareSteps, child("True.", undefined, [{ act: "confirm", lines: ["confirm.word"] }]), child("Yes.", undefined, [{ act: "accept_answer", lines: ["answer.right"] }]), ...solvedEnd],
    expect: { outcome: { reason: "solved" }, acts: [OPEN, "guide", "guide", "guide", "confirm", "accept_answer", "ask_write", "close"], counts: { refusals: 0 } },
  },
  {
    id: "PVC05", title: "Compare: a bare 'True.' after Maya's digit question is no claim answer and is not said back; the step goes on", fixture: "PVC", status: "passing",
    steps: [
      child("I don't know.", { start: "has_work" }, [{ act: "guide", step: "digit-1", level: 0 }]),
      child("True.", undefined, [{ act: "guide", step: "digit-1", level: 0 }]),
      child("8", { answers: [[8, "digit-1", "right"]] }),
    ],
    expect: { outcome: {}, acts: [OPEN, "guide", "guide", "guide"], never: ["accept_answer", "confirm"] },
  },
  {
    id: "PVC06", title: "Compare: 'Maybe 8.', 'Is it 8?' and 'My mom said 8.' give the digit step no credit; '8' does", fixture: "PVC", status: "passing",
    steps: [
      child("Maybe 8.", { start: "has_work", answers: [[8, "digit-1", "right"]] }, [{ act: "guide", step: "digit-1", level: 0, repair: { act: "guide", step: "digit-1", level: 0, read: {} } }]),
      child("Is it 8?", { answers: [[8, "digit-1", "right"]] }, [{ act: "guide", step: "digit-1", level: 0, repair: { act: "guide", step: "digit-1", level: 0, read: {} } }]),
      { child: "My mom said 8.", read: { answers: [[8, "digit-1", "right"]] }, maya: [{ act: "guide", step: "digit-1", level: 0, repair: { act: "guide", step: "digit-1", level: 0, read: {} } }] },
      child("8", { answers: [[8, "digit-1", "right"]] }, [{ act: "guide", step: "digit-2", level: 0, lines: ["check.right_step", "step.invite"] }]),
    ],
    expect: { outcome: {}, never: ["accept_answer"] },
  },
  {
    id: "PVC07", title: "Compare: after H3 shows the thousands digit, the child's '8' copies it and gets no step credit", fixture: "PVC", status: "passing",
    steps: [
      ...stuck(1).map((s) => ({ ...s, read: { start: "has_work" as const, help: "more" as const } })),
      ...stuck(3),
      child("8", { answers: [[8, "digit-1", "right"]] }, [{ act: "example_step", repair: { act: "example_step" } }]),
    ],
    // The copy is no step credit (the model's "right" reading is refused); the child is still stuck: the easier example.
    expect: { outcome: {}, acts: [OPEN, "guide", "guide", "guide", "guide", "example_step", "example_step", "example_step", "example_step"], never: ["accept_answer", "give_answer"] },
  },
  {
    id: "PVC08", title: "Compare: 'I'm stuck.' four times on the last step; the easier example, then an honest close, never the word", fixture: "PVC", status: "passing",
    steps: [...compareSteps, ...stuck(4)],
    expect: {
      outcome: { reason: "maya_closed", assistance: "worked_example" }, never: ["give_answer", "accept_answer"],
      acts: [OPEN, "guide", "guide", "guide", "guide", "guide", "example_step", "example_step", "example_step", "example_step", "close"],
      outputs: [{ mayaTurn: 10, lines: [texts(lines("PVC").closeUnsolved(), "close.hard")] }],
    },
  },
  {
    id: "PVCJ1", title: "J06, compare: 'The thousands digit is 8.' first; acknowledged, and Maya goes on to the hundreds digit", fixture: "PVC", status: "passing",
    steps: [
      child("The thousands digit is 8.", { start: "has_work" }, [{ throws: true }]),
      child("4", { answers: [[4, "digit-2", "right"]] }),
    ],
    expect: {
      outcome: {}, counts: { fallbacks: 1 },
      outputs: [{ mayaTurn: 1, lines: [texts(lines("PVC").rightStep("digit-1"), "right.digit"), texts(lines("PVC").help("digit-2"), "invite.place")] }],
    },
  },
  {
    id: "PVCJ2", title: "J06, compare: 'Which one is the hundreds place?' on the hundreds step gets code's answer first", fixture: "PVC", status: "passing",
    steps: [
      compareSteps[0],
      child("Which one is the hundreds place?", undefined, [{ throws: true }]),
      child("4", { answers: [[4, "digit-2", "right"]] }),
    ],
    expect: { outcome: {}, counts: { fallbacks: 1 }, outputs: [{ mayaTurn: 2, lines: [texts(lines("PVC").help("digit-2"), "where.place")] }] },
  },
  {
    id: "PVCJ3", title: "J06, compare: 'Why is 8 bigger?' on the bigger step gets code's answer first, never the digit", fixture: "PVC", status: "passing",
    steps: [compareSteps[0], compareSteps[1], { child: "Why is 8 bigger?", within: true, maya: [{ throws: true }] }, child("8", { answers: [[8, "bigger", "right"]] })],
    expect: { outcome: {}, counts: { fallbacks: 1 }, outputs: [{ mayaTurn: 3, lines: [texts(lines("PVC").help("bigger"), "why.bigger")] }] },
  },
  {
    id: "PVC09", grade: 3, title: "Compare, grade 3: 'I'm stuck.' first; code's first line says where the place is, within 25 words", fixture: "PVCZ", status: "passing",
    steps: [child("I'm stuck.", { start: "has_work" }, [{ throws: true }]), child("8", { answers: [[8, "digit-1", "right"]] })],
    expect: { outcome: {}, counts: { fallbacks: 1 }, outputs: [{ mayaTurn: 1, lines: [texts(lines("PVCZ").help("digit-1"), "invite.place")] }] },
  },
  {
    id: "PVC10", title: "Compare, a 0 digit: the child says 0 for the hundreds; credited with the zero line, and 'It's true.' stands", fixture: "PVCZ", status: "passing",
    steps: [
      child("8", { start: "has_work", answers: [[8, "digit-1", "right"]] }, [{ act: "guide", step: "digit-2", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("0", { answers: [[0, "digit-2", "right"]] }, [{ act: "guide", step: "bigger", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("8", { answers: [[8, "bigger", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("It's true.", undefined, [{ act: "accept_answer", lines: ["answer.right"] }]),
      ...solvedEnd,
    ],
    expect: { outcome: { reason: "solved" }, counts: { refusals: 0 }, outputs: [{ mayaTurn: 2, lines: [texts(lines("PVCZ").rightStep("digit-2"), "right.digit.zero"), texts(lines("PVCZ").help("bigger"), "invite.bigger")] }] },
  },
  // ---------- Sum ----------
  {
    id: "PVS01", title: "Sum: each value, then the two added; the values written on the chart as the child says them", fixture: "PVSUM", status: "passing",
    steps: [
      child("7000", { start: "has_work", answers: [[7000, "worth-1", "right"]] }, [{ act: "guide", step: "worth-2", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("40", { answers: [[40, "worth-2", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("7040", { answers: [[7040, "result", "right"]] }, [{ act: "accept_answer", lines: ["answer.right"] }]),
      ...writtenEnd,
    ],
    expect: { outcome: { reason: "solved", assistance: "independent" }, acts: [OPEN, "guide", "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0 } },
  },
  {
    id: "PVS02", title: "Sum: '7 times 1000 is 7000.' in a full sentence is this step's work; credited, never another problem", fixture: "PVSUM", status: "passing",
    steps: [
      { child: "7 times 1000 is 7000.", within: true, read: { start: "has_work", answers: [[7000, "worth-1", "right"]] }, maya: [{ act: "guide", step: "worth-2", level: 0, lines: ["check.right_step", "step.invite"] }] },
      { child: "4 times 10 is 40.", within: true, read: { answers: [[40, "worth-2", "right"]] }, maya: [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }] },
      { child: "7000 plus 40 is 7040.", within: true, read: { answers: [[7040, "result", "right"]] } },
      ...writtenEnd,
    ],
    expect: { outcome: { reason: "solved" }, counts: { refusals: 0 } },
  },
  {
    id: "PVS03", title: "Sum: the two digits added (11); Maya says that adds the digits and asks for the values", fixture: "PVSUM", status: "passing",
    steps: [
      child("11", { start: "has_work", answers: [[11, "result", "wrong"]] }, [{
        act: "guide",
        raw: {
          version: 2, act: "guide", step: "worth-1", level: 0, reading: { answers: [{ value: { type: "number", value: 11 }, step: "result", verdict: "wrong" }] },
          parts: [{ line: "check.not_yet", slots: { step: "result", heard: "11" } }, { line: "step.invite", slots: { step: "worth-1" } }],
        },
      }]),
      child("7040", { answers: [[7040, "result", "right"]] }),
      ...writtenEnd,
    ],
    expect: { outcome: { reason: "solved" }, counts: { refusals: 0 }, outputs: [{ mayaTurn: 1, lines: [texts(lines("PVSUM").notYet("result"), "fix.sum.digits"), texts(lines("PVSUM").help("worth-1"), "invite.worth")] }] },
  },
  {
    id: "PVS04", title: "Sum: 'I'm stuck.' four times on the last step; the easier example, then an honest close, never the sum", fixture: "PVSUM", status: "passing",
    steps: [
      child("7000", { start: "has_work", answers: [[7000, "worth-1", "right"]] }, [{ act: "guide", step: "worth-2", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("40", { answers: [[40, "worth-2", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      ...stuck(4),
    ],
    expect: { outcome: { reason: "maya_closed", assistance: "worked_example" }, acts: [OPEN, "guide", "guide", "guide", "guide", "example_step", "example_step", "example_step", "close"], never: ["give_answer", "accept_answer"] },
  },
  {
    id: "PVSJ1", title: "J06, sum: 'Why do I add them?' on the last step gets code's answer first", fixture: "PVSUM", status: "passing",
    steps: [
      child("7000", { start: "has_work", answers: [[7000, "worth-1", "right"]] }, [{ act: "guide", step: "worth-2", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("40", { answers: [[40, "worth-2", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      { child: "Why do I add them?", within: true, maya: [{ throws: true }] },
      child("7040", { answers: [[7040, "result", "right"]] }), ...writtenEnd,
    ],
    expect: { outcome: { reason: "solved" }, counts: { fallbacks: 1 }, outputs: [{ mayaTurn: 3, lines: [texts(lines("PVSUM").help("result"), "why.sum")] }] },
  },
  {
    id: "PVSJ2", title: "J06, sum: 'It's worth 7000.' first, in the child's own words; acknowledged, and Maya goes on to the tens", fixture: "PVSUM", status: "passing",
    steps: [child("It's worth 7000.", { start: "has_work" }, [{ throws: true }]), child("40", { answers: [[40, "worth-2", "right"]] })],
    expect: {
      outcome: {}, counts: { fallbacks: 1 },
      outputs: [{ mayaTurn: 1, lines: [texts(lines("PVSUM").rightStep("worth-1"), "right.worth"), texts(lines("PVSUM").help("worth-2"), "invite.worth")] }],
    },
  },
  // ---------- Build ----------
  {
    id: "PVB01", title: "Build: 'five point eight' is accepted; the board writes the digits and 5.8 in that turn", fixture: "PVB", status: "passing",
    steps: [child("five point eight", { start: "has_work", answers: [[5.8, "result", "right"]] }, [{ act: "accept_answer", lines: ["answer.right"], draw: ["question.chart", "question.answer"] }]), ...writtenEnd],
    expect: { outcome: { reason: "solved" }, counts: { refusals: 0, boardBatches: 1 } },
  },
  {
    id: "PVB02", title: "Build: '58' leaves out the point; Maya says so, then the child says 5.8", fixture: "PVB", status: "passing",
    steps: [
      child("58", { start: "has_work", answers: [[58, "result", "wrong"]] }, [{
        act: "guide",
        raw: {
          version: 2, act: "guide", step: "result", level: 1, reading: { answers: [{ value: { type: "number", value: 58 }, step: "result", verdict: "wrong" }] },
          parts: [{ line: "check.not_yet", slots: { step: "result", heard: "58" } }, { line: "step.point", slots: { step: "result" } }],
        },
      }]),
      child("5.8", { answers: [[5.8, "result", "right"]] }), ...writtenEnd,
    ],
    expect: { outcome: { reason: "solved", highestHint: 1 }, counts: { refusals: 0 }, outputs: [{ mayaTurn: 1, lines: [texts(lines("PVB").notYet("result"), "fix.build.point"), texts(lines("PVB").help("result"), "point.build")] }] },
  },
  {
    id: "PVB03", title: "Build: 'I'm stuck.' four times; H0 to H2, the easier example, then an honest close, never the decimal", fixture: "PVB", status: "passing",
    steps: [...stuck(4).map((s, i) => (i === 0 ? { ...s, read: { start: "has_work" as const, help: "more" as const } } : s)), ...stuck(2)],
    expect: { outcome: { reason: "maya_closed", assistance: "worked_example" }, acts: [OPEN, "guide", "guide", "guide", "example_step", "close"], never: ["give_answer", "accept_answer"] },
  },
  {
    id: "PVBJ1", grade: 3, title: "J06, build, grade 3: 'Why does the point go there?' gets code's answer first, within 25 words", fixture: "PVB", status: "passing",
    steps: [{ child: "Why does the point go there?", within: true, read: { start: "has_work" }, maya: [{ throws: true }] }, child("5.8", { answers: [[5.8, "result", "right"]] }), ...writtenEnd],
    expect: { outcome: { reason: "solved" }, counts: { fallbacks: 1 }, outputs: [{ mayaTurn: 1, lines: [texts(lines("PVB").help("result"), "why.build")] }] },
  },
  // ---------- A wrong committed word at the top help, with a model that fails (review of #740) ----------
  {
    id: "PVCT1", title: "Compare, model failing: 'It's false.' at the result's top help (H2); the easier example, then on 'It's false.' again the honest close", fixture: "PVC", status: "passing",
    steps: [...compareSteps, ...stuck(2), failing("It's false."), failing("It's false.")],
    expect: { ...EXAMPLE_THEN_CLOSE, acts: [OPEN, "guide", "guide", "guide", "guide", "guide", "example_step", "example_step", "example_step", "example_step", "close"] },
  },
  {
    id: "PVCT2", title: "Compare, the same digits, model failing: 'It's true.' at the result's top help; the easier example, then the honest close", fixture: "PVC0", status: "passing",
    steps: [
      child("5", { start: "has_work", answers: [[5, "digit-1", "right"]] }, [{ act: "guide", step: "digit-2", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("5", { answers: [[5, "digit-2", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      ...stuck(2), failing("It's true."), failing("It's true."),
    ],
    expect: { ...EXAMPLE_THEN_CLOSE, acts: [OPEN, "guide", "guide", "guide", "guide", "example_step", "example_step", "example_step", "example_step", "close"] },
  },
  {
    id: "PVCT3", title: "Compare, model failing: after the easier example and 'Okay.', a wrong 'It's false.' gets the honest close", fixture: "PVC", status: "passing",
    steps: [...compareSteps, ...stuck(3), failing("Okay."), failing("It's false.")],
    expect: { ...EXAMPLE_THEN_CLOSE, acts: [OPEN, "guide", "guide", "guide", "guide", "guide", "example_step", "example_step", "example_step", "example_step", "guide", "close"] },
  },
  {
    id: "PVDT1", title: "Which digit, top help: a wrong '5' whose guide is refused, the model failing on repair; the easier example, then the honest close", fixture: "PVD", status: "passing",
    steps: [...stuckFromStart(3), wrongRefused(5, "result"), wrongRefused(5, "result")],
    expect: { ...EXAMPLE_THEN_CLOSE, acts: [OPEN, "guide", "guide", "guide", "example_step", "close"] },
  },
  {
    id: "PVVT1", title: "Value, top help of the last step: a wrong '8000' whose guide is refused, the model failing on repair; the easier example, then the close", fixture: "PVV", status: "passing",
    steps: [failing("8"), ...stuck(2), wrongRefused(8000, "result"), wrongRefused(8000, "result")],
    expect: { ...EXAMPLE_THEN_CLOSE, acts: [OPEN, "guide", "guide", "guide", "example_step", "example_step", "close"] },
  },
  {
    id: "PVST1", title: "Sum, top help: a wrong '11' whose guide is refused, the model failing on repair; the easier example, then the honest close", fixture: "PVSUM", status: "passing",
    steps: [failing("7000"), failing("40"), ...stuck(2), wrongRefused(11, "result"), wrongRefused(11, "result")],
    expect: { ...EXAMPLE_THEN_CLOSE, acts: [OPEN, "guide", "guide", "guide", "guide", "example_step", "example_step", "example_step", "close"] },
  },
  {
    id: "PVBT1", title: "Build, top help: a wrong '58' whose guide is refused, the model failing on repair; the easier example, then the honest close", fixture: "PVB", status: "passing",
    steps: [...stuckFromStart(3), wrongRefused(58, "result"), wrongRefused(58, "result")],
    expect: { ...EXAMPLE_THEN_CLOSE, acts: [OPEN, "guide", "guide", "guide", "example_step", "close"] },
  },
];
