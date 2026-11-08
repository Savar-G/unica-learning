// Gate cases for place-value questions (B1a, design: .design/research/maya-place-value-design.md, section 7.2): each
// fixture is the teaching package Maya's session adapter makes from a synthetic stored "which digit" or "value of the
// digit" question (src/lib/maya-teaching/place-value.ts), as a call gets it. The cases show: a digit question never gives
// its digit away, the targeted fixes, a zero said only after the child says it, the easier example then an honest close
// after two misses (no given answer), and the J06 behaviours: an early correct digit is acknowledged and the help goes
// on to the value, and a question about a place is answered with code's line before going on.
import { packageLines, type LineOffer } from "@/lib/maya/lines";
import type { OperationPackage, QuestionPackage } from "@/lib/question-package";
import { placeValueTeachingPackage } from "@/lib/maya-teaching/place-value";
import { storedPlaceValue } from "@/lib/maya-teaching/place-value-samples";
import type { Behaviour, Plan, Read, Step } from "./gate";

export type PlaceValueFixtureId = "PVD" | "PVD0" | "PVV" | "PVV0";

const made = (stored: QuestionPackage): QuestionPackage => {
  const r = placeValueTeachingPackage(stored);
  if ("held" in r) throw new Error(`the adapter held ${stored.text}: ${r.held}`);
  return r.package;
};

export const PLACE_VALUE_FIXTURES: Record<PlaceValueFixtureId, QuestionPackage> = {
  /** In 53172, which digit is in the thousands place? 3. */
  PVD: made(storedPlaceValue({ variant: "1.1", n0: 53172, place: "thousands" })),
  /** In 530172, which digit is in the thousands place? 0. */
  PVD0: made(storedPlaceValue({ variant: "3.1", n0: 530172, place: "thousands" })),
  /** What is the value of the digit in the ten thousands place of 785243? 80000. */
  PVV: made(storedPlaceValue({ variant: "2.2", n0: 785243, place: "ten thousands" })),
  /** 402561: value of the ten thousands digit? 0. */
  PVV0: made(storedPlaceValue({ variant: "3.2", n0: 402561, place: "ten thousands", form: "short" })),
};

const child = (text: string, read?: Read, maya?: Plan[]): Step => ({ child: text, ...(read ? { read } : {}), ...(maya ? { maya } : {}) });
const solvedEnd: Step[] = [child("Okay.", undefined, [{ act: "ask_write", understanding: "uncertain" }]), child("I wrote it.", { paper: "written" })];
const OPEN = "open" as const;
const lines = (id: PlaceValueFixtureId) => packageLines(PLACE_VALUE_FIXTURES[id] as OperationPackage);
const texts = (offers: LineOffer[], key: LineOffer["key"]) => offers.filter((o) => o.key === key).flatMap((o) => o.texts);
const num = (value: number) => ({ type: "number" as const, value });

/** A guide proposal sent as the model would, with the targeted check line it picks by its `heard` slot. */
const fix = (heard: number, invite: string): Plan => ({
  act: "guide",
  raw: {
    version: 2, act: "guide", step: "result", level: 0,
    reading: { answers: [{ value: num(heard), step: "result", verdict: "wrong" }] },
    parts: [{ line: "check.not_yet", slots: { step: "result", heard: String(heard) } }, { line: "step.invite", slots: { step: invite } }],
  },
});

export const PLACE_VALUE_BEHAVIOURS: Behaviour[] = [
  {
    id: "PV01", title: "Which digit: says the right digit alone; accepted with no hint, the chart's digit and answer written in that turn", fixture: "PVD", status: "passing",
    steps: [child("3", { start: "has_work", answers: [[3, "result", "right"]] }, [{ act: "accept_answer", lines: ["answer.right"], draw: ["question.chart", "question.answer"] }]), ...solvedEnd],
    expect: {
      outcome: { reason: "solved", assistance: "independent" }, acts: [OPEN, "accept_answer", "ask_write", "close"], counts: { refusals: 0, boardBatches: 1 },
    },
  },
  {
    id: "PV02", title: "Which digit: says the left neighbour's digit, gets the places named from the right (no stripe), then says it", fixture: "PVD", status: "passing",
    steps: [
      child("5", { start: "has_work", answers: [[5, "result", "wrong"]] }, [{ act: "guide", step: "result", level: 1, lines: ["check.not_yet", "step.point"] }]),
      child("3", { answers: [[3, "result", "right"]] }),
      ...solvedEnd,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "hint", highestHint: 1 }, acts: [OPEN, "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0 },
      outputs: [{ mayaTurn: 1, lines: [texts(lines("PVD").notYet("result"), "check.not_yet"), texts(lines("PVD").help("result"), "point.place")] }],
    },
  },
  {
    id: "PV03", title: "Which digit: says the value (3000); Maya says that is the value and asks for the digit, no credit", fixture: "PVD", status: "passing",
    steps: [child("3000", { start: "has_work", answers: [[3000, "result", "wrong"]] }, [fix(3000, "result")]), child("3", { answers: [[3, "result", "right"]] }), ...solvedEnd],
    expect: {
      outcome: { reason: "solved", assistance: "independent" }, acts: [OPEN, "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0 },
      outputs: [{ mayaTurn: 1, lines: [texts(lines("PVD").notYet("result"), "fix.digit"), texts(lines("PVD").help("result"), "invite.place")] }],
    },
  },
  {
    id: "PV04", title: "Value: the digit, then the value; the digit step is credited and the chart shows the value with its sentence", fixture: "PVV", status: "passing",
    steps: [
      child("I don't know.", { start: "has_work" }, [{ act: "guide", step: "digit", level: 0, draw: ["question.chart"], lines: ["chart.open", "step.invite"] }]),
      child("8", { answers: [[8, "digit", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("80000", { answers: [[80000, "result", "right"]] }, [{ act: "accept_answer", lines: ["answer.right"], draw: ["question.answer"] }]),
      ...solvedEnd,
    ],
    expect: { outcome: { reason: "solved", assistance: "independent" }, acts: [OPEN, "guide", "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0, boardBatches: 2 } },
  },
  {
    id: "PV05", title: "Value: one zero too few (8000); H1 says what each ten thousand is worth, then the child says 80000", fixture: "PVV", status: "passing",
    steps: [
      child("8", { start: "has_work", answers: [[8, "digit", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("8000", { answers: [[8000, "result", "wrong"]] }, [{ act: "guide", step: "result", level: 1, lines: ["check.not_yet", "step.point"] }]),
      child("80000", { answers: [[80000, "result", "right"]] }),
      ...solvedEnd,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "hint", highestHint: 1 }, acts: [OPEN, "guide", "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0 },
      outputs: [{ mayaTurn: 2, lines: [texts(lines("PVV").notYet("result"), "check.not_yet"), texts(lines("PVV").help("result"), "point.times")] }],
    },
  },
  {
    id: "PV06", title: "Value: says only the digit again after the digit step; Maya says that is the digit and asks for its value", fixture: "PVV", status: "passing",
    steps: [
      child("8", { start: "has_work", answers: [[8, "digit", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("8", { answers: [[8, "result", "wrong"]] }, [fix(8, "result")]),
      child("80000", { answers: [[80000, "result", "right"]] }),
      ...solvedEnd,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "independent" }, acts: [OPEN, "guide", "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0 },
      outputs: [{ mayaTurn: 2, lines: [texts(lines("PVV").notYet("result"), "fix.value"), texts(lines("PVV").help("result"), "invite.value")] }],
    },
  },
  {
    id: "PV07a", title: "Which digit, zero: Maya says 0 only after the child says it, and says the zero holds the place", fixture: "PVD0", status: "passing",
    steps: [
      child("I'm not sure.", { start: "has_work" }, [{ act: "guide", step: "result", level: 0 }]),
      child("Zero.", { answers: [[0, "result", "right"]] }, [{ act: "accept_answer", lines: ["answer.right"], draw: ["question.chart", "question.answer"] }]),
      ...solvedEnd,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "independent" }, acts: [OPEN, "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0 },
      outputs: [{ mayaTurn: 2, lines: [texts(lines("PVD0").answerRight(), "answer.digit.zero"), texts(lines("PVD0").thinking(), "check.thinking")] }],
    },
  },
  {
    id: "PV07b", title: "Value, zero: the child says the digit is 0, which is also the value; accepted, with the zero line", fixture: "PVV0", status: "passing",
    steps: [child("0", { start: "has_work", answers: [[0, "digit", "right"], [0, "result", "right"]] }, [{ act: "accept_answer", lines: ["answer.right"] }]), ...solvedEnd],
    expect: { outcome: { reason: "solved" }, acts: [OPEN, "accept_answer", "ask_write", "close"], counts: { refusals: 0 } },
  },
  {
    id: "PV10", title: "Which digit: the child asks to be shown; the last step has no H3, so Maya helps one level up instead", fixture: "PVD", status: "passing",
    steps: [
      child("Can you show me?", { start: "has_work", help: "show" }, [{ act: "guide", step: "result", level: 3, lines: ["step.show"], repair: { act: "guide", step: "result", level: 1, lines: ["step.point"] } }]),
      child("3", { answers: [[3, "result", "right"]] }),
      ...solvedEnd,
    ],
    expect: { outcome: { reason: "solved", highestHint: 1 }, acts: [OPEN, "guide", "accept_answer", "ask_write", "close"], refused: ["line_not_offered"], never: ["give_answer"] },
  },
  {
    id: "PV11", title: "Which digit: two wrong answers; the easier example, then an honest close with no answer given", fixture: "PVD", status: "passing",
    steps: [
      child("5", { start: "has_work", answers: [[5, "result", "wrong"]] }, [{ act: "guide", step: "result", level: 1, lines: ["check.not_yet", "step.point"] }]),
      child("1", { answers: [[1, "result", "wrong"]] }),
      child("I still don't get it."),
    ],
    expect: { outcome: { reason: "child_stopped", assistance: "worked_example" }, acts: [OPEN, "guide", "example_step", "close"], never: ["give_answer", "accept_answer"] },
  },
  {
    id: "PV14", title: "Which digit: cannot start; the easier example of the same shape, then the child's own digit", fixture: "PVD", status: "passing",
    steps: [child("I don't know how to start.", { start: "no_start" }), child("3", { answers: [[3, "result", "right"]] }), ...solvedEnd],
    expect: { outcome: { reason: "solved", assistance: "worked_example" }, acts: [OPEN, "example_step", "accept_answer", "ask_write", "close"], counts: { refusals: 0 } },
  },
  {
    id: "PVJ1", title: "J06, value: the child gives the digit before Maya asks; it is acknowledged and the help goes on to the value", fixture: "PVV", status: "passing",
    steps: [
      child("The digit is 8.", { start: "has_work", answers: [[8, "digit", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("80000", { answers: [[80000, "result", "right"]] }),
      ...solvedEnd,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "independent" }, acts: [OPEN, "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0 },
      outputs: [{ mayaTurn: 1, lines: [texts(lines("PVV").rightStep("digit"), "right.digit"), texts(lines("PVV").help("result"), "invite.value")] }],
    },
  },
  {
    id: "PVJ1b", title: "J06, value: the model fails on an early digit; code hears the whole turn, acknowledges it and asks for the value", fixture: "PVV", status: "passing",
    steps: [child("It's 8.", { start: "has_work" }, [{ throws: true }]), child("80000", { answers: [[80000, "result", "right"]] }), ...solvedEnd],
    expect: {
      outcome: { reason: "solved", assistance: "independent" }, acts: [OPEN, "guide", "accept_answer", "ask_write", "close"], counts: { fallbacks: 1 },
      outputs: [{ mayaTurn: 1, lines: [texts(lines("PVV").rightStep("digit"), "right.digit"), texts(lines("PVV").help("result"), "invite.value")] }],
    },
  },
  {
    id: "PVJ2", title: "J06, which digit: the child asks which place is the thousands; Maya answers with code's line, then the child says the digit", fixture: "PVD", status: "passing",
    steps: [
      child("Which one is the thousands place?", { start: "has_work" }, [{ act: "guide", step: "result", level: 1, lines: ["step.why"] }]),
      child("3", { answers: [[3, "result", "right"]] }),
      ...solvedEnd,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "independent" }, acts: [OPEN, "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0 },
      outputs: [{ mayaTurn: 1, lines: [texts(lines("PVD").help("result"), "where.place")] }],
    },
  },
  {
    id: "PVJ2b", title: "J06, which digit: the model fails on a question about a place; code's fallback answers it first", fixture: "PVD", status: "passing",
    steps: [child("Where is the thousands place?", { start: "has_work" }, [{ throws: true }]), child("3", { answers: [[3, "result", "right"]] }), ...solvedEnd],
    expect: {
      outcome: { reason: "solved" }, acts: [OPEN, "guide", "accept_answer", "ask_write", "close"], counts: { fallbacks: 1 },
      outputs: [{ mayaTurn: 1, lines: [texts(lines("PVD").help("result"), "where.place")] }],
    },
  },
  // Framing at any hint level (review lesson 2): the first line on a step says where the place is or what it is worth.
  {
    id: "PV15", title: "Which digit: 'I'm stuck.' first; code's first line says where the place is, counted from the right", fixture: "PVD", status: "passing",
    steps: [child("I'm stuck.", { start: "has_work" }, [{ throws: true }]), child("3", { answers: [[3, "result", "right"]] }), ...solvedEnd],
    expect: {
      outcome: { reason: "solved" }, acts: [OPEN, "guide", "accept_answer", "ask_write", "close"], counts: { fallbacks: 1 },
      outputs: [{ mayaTurn: 1, lines: [texts(lines("PVD").help("result"), "invite.place")] }],
    },
  },
  {
    id: "PV16", title: "Which digit: 'I'm stuck.' first and the model starts at H2; code draws the chart and the stripe its line names", fixture: "PVD", status: "passing",
    steps: [child("I'm stuck.", { start: "has_work" }, [{ act: "guide", step: "result", level: 2, lines: ["step.operation"] }]), child("3", { answers: [[3, "result", "right"]] }), ...solvedEnd],
    expect: { outcome: { reason: "solved", highestHint: 2 }, acts: [OPEN, "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0, boardBatches: 1 } },
  },
  {
    id: "PV17", title: "Value: 'I'm stuck.' on the value step; code's first line says what each ten thousand is worth", fixture: "PVV", status: "passing",
    steps: [
      child("8", { start: "has_work", answers: [[8, "digit", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("I'm stuck.", undefined, [{ throws: true }]),
      child("80000", { answers: [[80000, "result", "right"]] }),
      ...solvedEnd,
    ],
    expect: {
      outcome: { reason: "solved" }, acts: [OPEN, "guide", "guide", "accept_answer", "ask_write", "close"], counts: { fallbacks: 1 },
      outputs: [{ mayaTurn: 2, lines: [texts(lines("PVV").help("result"), "point.times")] }],
    },
  },
  // The scope check (review lesson 1): the child's work in a full sentence is this question's work, never off topic.
  {
    id: "PVS1", title: "Value: '8 times 10,000 is 80,000.' in a full sentence is the answer, not another problem", fixture: "PVV", status: "passing",
    steps: [{ child: "8 times 10,000 is 80,000.", within: true, read: { start: "has_work", answers: [[80000, "result", "right"]] } }, ...solvedEnd],
    expect: { outcome: { reason: "solved", assistance: "independent" }, acts: [OPEN, "accept_answer", "ask_write", "close"], counts: { refusals: 0 } },
  },
  {
    id: "PVS2", title: "Value: 'The 8 is in the ten thousands place.' is work on this question; Maya goes on to the value", fixture: "PVV", status: "passing",
    steps: [
      { child: "The 8 is in the ten thousands place.", within: true, read: { start: "has_work" }, maya: [{ act: "guide", step: "digit", level: 0 }] },
      child("80000", { answers: [[80000, "result", "right"]] }),
      ...solvedEnd,
    ],
    expect: { outcome: { reason: "solved" }, acts: [OPEN, "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0 } },
  },
  {
    id: "PVS3", title: "Value: '8 times 1000 is 8000.' (one place too small) is checked as wrong work, never sent off topic", fixture: "PVV", status: "passing",
    steps: [
      child("8", { start: "has_work", answers: [[8, "digit", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      { child: "8 times 1000 is 8000.", within: true, read: { answers: [[8000, "result", "wrong"]] }, maya: [{ act: "guide", step: "result", level: 1, lines: ["check.not_yet", "step.point"] }] },
      { child: "8 times 10000 is 80000.", within: true, read: { answers: [[80000, "result", "right"]] } },
      ...solvedEnd,
    ],
    expect: { outcome: { reason: "solved", highestHint: 1 }, acts: [OPEN, "guide", "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0 } },
  },
  {
    id: "PVS4", title: "Which digit: '3 times 1000 is 3000.' is this question's work; Maya says that is the value and asks for the digit", fixture: "PVD", status: "passing",
    steps: [{ child: "3 times 1000 is 3000.", within: true, read: { start: "has_work", answers: [[3000, "result", "wrong"]] }, maya: [fix(3000, "result")] }, child("3", { answers: [[3, "result", "right"]] }), ...solvedEnd],
    expect: { outcome: { reason: "solved" }, acts: [OPEN, "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0 } },
  },
  // J06 on the value step: a "why" question gets code's answer before anything else.
  {
    id: "PVJ3", title: "J06, value: 'Why do I multiply by 10,000?' gets code's answer, then the child says the value", fixture: "PVV", status: "passing",
    steps: [
      child("8", { start: "has_work", answers: [[8, "digit", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      { child: "Why do I multiply by 10,000?", within: true, maya: [{ act: "guide", step: "result", level: 1, lines: ["step.why"] }] },
      child("80000", { answers: [[80000, "result", "right"]] }),
      ...solvedEnd,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "independent" }, acts: [OPEN, "guide", "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0 },
      outputs: [{ mayaTurn: 2, lines: [texts(lines("PVV").help("result"), "why.value")] }],
    },
  },
  {
    id: "PVJ3b", title: "J06, value: the model fails on 'Why do I multiply?'; code's fallback answers it first", fixture: "PVV", status: "passing",
    steps: [
      child("8", { start: "has_work", answers: [[8, "digit", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      { child: "Why do I multiply?", within: true, maya: [{ throws: true }] },
      child("80000", { answers: [[80000, "result", "right"]] }),
      ...solvedEnd,
    ],
    expect: {
      outcome: { reason: "solved" }, acts: [OPEN, "guide", "guide", "accept_answer", "ask_write", "close"], counts: { fallbacks: 1 },
      outputs: [{ mayaTurn: 2, lines: [texts(lines("PVV").help("result"), "why.value")] }],
    },
  },
];
