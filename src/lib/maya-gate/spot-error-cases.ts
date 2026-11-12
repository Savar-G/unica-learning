// Gate cases for spot-the-error questions (C2, design: .design/research/maya-spot-error-design.md): each fixture is the
// teaching package Maya's session adapter makes from a synthetic stored spot-the-error question (made-up numbers in the
// book's shapes, src/lib/maya-teaching/spot-error-samples.ts), as a call gets it. The cases show: the question's own work,
// the compare step, then the word yes or no, then the fix written; a bare word only after Maya's own question (lesson 5);
// no early word without the fix; the J06 behaviours (a result in the child's own words acknowledged once, a question
// answered with code's line); full sentences in scope (lesson 1); "I'm stuck." first at grade 3 (lessons 2 and 3); and the
// easier example then the honest close for a child who only asks for help (lessons 7 and 10).
import { packageLines, type LineOffer } from "@/lib/maya/lines";
import { spotView } from "@/lib/maya/spot-error";
import { teachingPackage } from "@/lib/maya-teaching";
import { spotMissing, spotMultiplyTens, spotPlaceValue } from "@/lib/maya-teaching/spot-error-samples";
import type { OperationPackage, QuestionPackage } from "@/lib/question-package";
import type { Behaviour, Plan, Read, Step } from "./gate";

export type SpotFixtureId = "SPOT_MUL" | "SPOT_MISS" | "SPOT_PVV" | "SPOT_PVD" | "SPOT_RIGHT";

const made = (stored: QuestionPackage): QuestionPackage => {
  const pkg = teachingPackage(stored) as QuestionPackage;
  if (!pkg.operation) throw new Error(`the adapter held ${stored.text}`);
  return pkg;
};

export const SPOT_FIXTURES: Record<SpotFixtureId, QuestionPackage> = {
  /** 7 × 640 = ? Answer given: 448. Not right; the fix is 4480. */
  SPOT_MUL: made(spotMultiplyTens(7, 643, 448)),
  /** 4 × ? = 680. Answer given: 17. Not right; the fix is 170. */
  SPOT_MISS: made(spotMissing(4, 170, 17)),
  /** What is the value of the digit in the ten thousands place of 46213? Answer given: 4000. The fix is 40000. */
  SPOT_PVV: made(spotPlaceValue("1.2", 46213, "ten thousands", 4000)),
  /** In 571324, which digit is in the hundred thousands place? Answer given: 7. The fix is 5. */
  SPOT_PVD: made(spotPlaceValue("2.1", 571324, "hundred thousands", 7)),
  /** What is the value of the digit in the thousands place of 48216? Answer given: 8000. It is right. */
  SPOT_RIGHT: made(spotPlaceValue("1.2", 48216, "thousands", 8000)),
};

const child = (text: string, read?: Read, maya?: Plan[]): Step => ({ child: text, ...(read ? { read } : {}), ...(maya ? { maya } : {}) });
const writeEnd: Step[] = [child("Okay.", undefined, [{ act: "ask_write", lines: ["write.answer"] }]), child("I wrote it.", { paper: "written" })];
const OPEN = "open" as const;
const lines = (id: SpotFixtureId) => packageLines(spotView(SPOT_FIXTURES[id] as OperationPackage));
const texts = (offers: LineOffer[], key: string) => offers.filter((o) => o.key === key).flatMap((o) => o.texts);
/** A child turn the model fails on: code's fallback answers it. */
const down = (text: string, read?: Read): Step => ({ child: text, ...(read ? { read } : {}), maya: [{ throws: true }] });
/** The easier example's turns, one act each. */
const examples = (n: number) => Array.from({ length: n }, () => "example_step" as const);
/** The honest close's wordings (lesson 10). */
const closeTexts = (id: SpotFixtureId) => lines(id).closeUnsolved().flatMap((o) => o.texts);

export const SPOT_BEHAVIOURS: Behaviour[] = [
  {
    id: "SE01", title: "Spot the error, multiply: the product in a full sentence is acknowledged once, then the question; a bare 'No.' is said back, and the yes to that commits it",
    fixture: "SPOT_MUL", status: "passing",
    steps: [
      { child: "7 times 640 is 4480.", within: true, read: { start: "has_work", answers: [[4480, "claim", "right"]] }, maya: [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }] },
      child("No.", undefined, [{ act: "confirm", lines: ["confirm.word"] }]),
      child("Yes.", undefined, [{ act: "accept_answer", lines: ["answer.right"] }]),
      ...writeEnd,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "independent", paperStatus: "child_confirmed" },
      acts: [OPEN, "guide", "confirm", "accept_answer", "ask_write", "close"], counts: { refusals: 0, confirmations: 1 }, never: ["give_answer"],
      outputs: [
        { mayaTurn: 1, lines: [texts(lines("SPOT_MUL").rightStep("claim"), "right.spot.find"), texts(lines("SPOT_MUL").help("result"), "invite.spot")] },
        { mayaTurn: 4, lines: [texts(lines("SPOT_MUL").writeAnswer(), "write.spot")] },
      ],
    },
  },
  {
    id: "SE02", title: "J06, spot the error: 'How do I know if it's right?' gets code's compare line, then the child's committed word with the fix is accepted",
    fixture: "SPOT_MUL", status: "passing",
    steps: [
      { child: "7 times 640 is 4480.", within: true, read: { start: "has_work", answers: [[4480, "claim", "right"]] }, maya: [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }] },
      child("How do I know if it's right?", { help: "more" }, [{ act: "guide", step: "result", level: 1, lines: ["step.point"] }]),
      child("It's wrong, it should be 4480.", undefined, [{ act: "accept_answer", lines: ["answer.right"] }]),
      ...writeEnd,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "hint", highestHint: 1 }, acts: [OPEN, "guide", "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0 }, never: ["give_answer"],
      outputs: [{ mayaTurn: 2, lines: [texts(lines("SPOT_MUL").help("result"), "point.spot")] }],
    },
  },
  {
    id: "SE03", title: "Spot the error, missing number: '680 divided by 4 is 170, so it's wrong.' is this question's work and its word: accepted at once",
    fixture: "SPOT_MISS", status: "passing",
    steps: [
      { child: "680 divided by 4 is 170, so it's wrong.", within: true, read: { start: "has_work", answers: [[170, "claim", "right"]] }, maya: [{ act: "accept_answer", lines: ["answer.right"] }] },
      ...writeEnd,
    ],
    expect: { outcome: { reason: "solved", assistance: "independent" }, acts: [OPEN, "accept_answer", "ask_write", "close"], counts: { refusals: 0 }, never: ["give_answer"] },
  },
  {
    id: "SE04", grade: 3, title: "Grade 3, spot the error that is right: '8 times 1000 is 8000, so it's right.' stays in scope and is accepted as yes",
    fixture: "SPOT_RIGHT", status: "passing",
    open: [{ act: "open", lines: ["open.hello", "question.problem"] }],
    steps: [
      { child: "8 times 1000 is 8000, so it's right.", within: true, read: { start: "has_work", answers: [[8000, "claim", "right"]] }, maya: [{ act: "accept_answer", lines: ["answer.right"] }] },
      ...writeEnd,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "independent" }, acts: [OPEN, "accept_answer", "ask_write", "close"], counts: { refusals: 0 },
      outputs: [{ mayaTurn: 2, lines: [texts(lines("SPOT_RIGHT").writeAnswer(), "write.spot.holds")] }],
    },
  },
  {
    id: "SE05", title: "Spot the error: 'It's wrong.' before the fix is no answer yet; Maya goes on with the work and never says the fix first",
    fixture: "SPOT_MUL", status: "passing",
    steps: [
      // Code reads the word (the model never reads one): a right word with no fix yet is no answer, so the work goes on.
      child("It's wrong.", { start: "has_work" }, [{ act: "guide" }]),
      { child: "7 times 640 is 4480.", within: true, read: { answers: [[4480, "claim", "right"]] }, maya: [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }] },
      child("So it's not right.", undefined, [{ act: "accept_answer", lines: ["answer.right"] }]),
      ...writeEnd,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "independent" }, acts: [OPEN, "guide", "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0 }, never: ["give_answer"],
    },
  },
  {
    id: "SE06", grade: 3, title: "Grade 3, spot the error, 'I'm stuck.' first: the easier example is a spot the error of the same shape, within 25 words a turn",
    fixture: "SPOT_PVV", status: "passing",
    open: [{ act: "open", lines: ["open.hello", "question.problem"] }],
    steps: [
      child("I'm stuck.", { start: "no_start" }, [{ act: "example_step" }]),
      child("Can we stop now?", { stop: true }),
    ],
    expect: { outcome: { reason: "child_stopped" }, counts: { refusals: 0 }, never: ["give_answer", "guide"] },
  },
  {
    id: "SE07", title: "Spot the error, which digit: only 'I'm stuck.'; help rises to H2 (no H3: it is the fix), then the easier example, then the honest close",
    fixture: "SPOT_PVD", status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work" }, [{ throws: true }]),
      child("I'm stuck.", undefined, [{ throws: true }]),
      child("I'm stuck.", undefined, [{ throws: true }]),
      child("I'm stuck.", undefined, [{ throws: true }]),
      child("I'm stuck.", undefined, [{ throws: true }]),
      child("I don't know.", undefined, [{ throws: true }]),
    ],
    expect: {
      outcome: { reason: "maya_closed", assistance: "worked_example", highestHint: 2 }, never: ["give_answer", "accept_answer"],
    },
  },
  {
    id: "SE08", title: "Spot the error: a plain yes to 'Did you say 4480?' credits the product, never the word; then the committed word",
    fixture: "SPOT_MUL", status: "passing",
    steps: [
      child("Maybe 4480.", { start: "has_work", unclear: true }, [{ act: "confirm" }]),
      child("Yes.", undefined, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("It's not right.", undefined, [{ act: "accept_answer" }]),
      ...writeEnd,
    ],
    expect: { outcome: { reason: "solved" }, acts: [OPEN, "confirm", "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0, confirmations: 1 } },
  },
  {
    id: "SE09", title: "Spot the error, value: the digit, then 'It should be 40000.' (the fix in the child's words), then a bare 'Wrong.' said back and confirmed",
    fixture: "SPOT_PVV", status: "passing",
    steps: [
      child("4", { start: "has_work", answers: [[4, "digit", "right"]] }, [{ act: "guide", step: "claim", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("It should be 40000.", { answers: [[40000, "claim", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("Wrong.", undefined, [{ act: "confirm", lines: ["confirm.word"] }]),
      child("Yes.", undefined, [{ act: "accept_answer" }]),
      ...writeEnd,
    ],
    expect: { outcome: { reason: "solved", assistance: "independent" }, acts: [OPEN, "guide", "guide", "confirm", "accept_answer", "ask_write", "close"], counts: { refusals: 0, confirmations: 1 } },
  },
  {
    id: "SE10", title: "Spot the error: after 'Did you say 4480?' a bare 'No.' answers that question, never the claim, and gets no say-back",
    fixture: "SPOT_MUL", status: "passing",
    steps: [
      child("Maybe 4480.", { start: "has_work", unclear: true }, [{ act: "confirm" }]),
      child("No.", undefined, [{ act: "guide" }]),
      child("7 times 640 is 4480, so it's wrong.", { answers: [[4480, "claim", "right"]] }, [{ act: "accept_answer" }]),
      ...writeEnd,
    ],
    expect: { outcome: { reason: "solved" }, acts: [OPEN, "confirm", "guide", "accept_answer", "ask_write", "close"], never: ["give_answer"] },
  },
  {
    id: "SE11", title: "Spot the error: another speaker's product and a hedged product credit nothing",
    fixture: "SPOT_MUL", status: "passing",
    steps: [
      child("My mom said 4480.", { start: "has_work" }, [{ throws: true }]),
      child("Is it 4480?", undefined, [{ throws: true }]),
      { child: "7 times 640 is 4480.", within: true, read: { answers: [[4480, "claim", "right"]] }, maya: [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }] },
      child("It's wrong.", undefined, [{ act: "accept_answer" }]),
      ...writeEnd,
    ],
    expect: { outcome: { reason: "solved" }, never: ["give_answer"] },
  },
  // Review of #743, P1: a wrong word at the top help, with the model down (it throws on every turn). step() then allows
  // only the easier example or the close; fallbacks() must work out its acts from the same reading, the word included
  // (the shape of #740's 921ab669), or every offer is refused and the call ends as technical_issue with no stuck step.
  {
    id: "SE12", title: "Model down, multiply: 'I'm stuck.' through the example, the try and H0 to H3 on the first work step, then 'It's right.': the honest close",
    fixture: "SPOT_MUL", status: "passing",
    steps: [...Array.from({ length: 7 }, () => down("I'm stuck.")), down("It's right.")],
    expect: {
      outcome: { reason: "maya_closed", assistance: "guided", highestHint: 3 },
      acts: [OPEN, ...examples(11), "try_target", "guide", "guide", "guide", "guide", "close"],
      outputs: [{ mayaTurn: 17, lines: [closeTexts("SPOT_MUL")] }], never: ["give_answer", "accept_answer"],
    },
  },
  {
    id: "SE13", title: "Model down, multiply: the fix, then 'I'm stuck.' to the word step's top help (H2), then 'It's right.': the easier example, then the honest close",
    fixture: "SPOT_MUL", status: "passing",
    steps: [down("7 times 640 is 4480.", { start: "has_work" }), down("I'm stuck."), down("I'm stuck."), down("It's right."), down("Okay."), down("I'm stuck.")],
    expect: {
      outcome: { reason: "maya_closed", assistance: "worked_example", highestHint: 2 },
      acts: [OPEN, "guide", "guide", "guide", ...examples(11), "close"],
      outputs: [{ mayaTurn: 15, lines: [closeTexts("SPOT_MUL")] }], never: ["give_answer", "accept_answer"],
    },
  },
  {
    id: "SE14", title: "Model down, missing number: 'I'm stuck.' through the example, the try and H0 to H3 on the first work step, then 'It's right.': the honest close",
    fixture: "SPOT_MISS", status: "passing",
    steps: [...Array.from({ length: 6 }, () => down("I'm stuck.")), down("It's right.")],
    expect: {
      outcome: { reason: "maya_closed", assistance: "guided", highestHint: 3 },
      acts: [OPEN, "example_step", "example_step", "example_step", "example_step", "try_target", "guide", "guide", "guide", "guide", "close"],
      outputs: [{ mayaTurn: 10, lines: [closeTexts("SPOT_MISS")] }], never: ["give_answer", "accept_answer"],
    },
  },
  {
    id: "SE15", title: "Model down, missing number: the fix, then 'I'm stuck.' to the word step's top help (H2), then 'It's right.': the easier example, then the honest close",
    fixture: "SPOT_MISS", status: "passing",
    steps: [down("680 divided by 4 is 170.", { start: "has_work" }), down("I'm stuck."), down("I'm stuck."), down("It's right."), down("I'm stuck.")],
    expect: {
      outcome: { reason: "maya_closed", assistance: "worked_example", highestHint: 2 },
      acts: [OPEN, "guide", "guide", "guide", "example_step", "example_step", "example_step", "example_step", "close"],
      outputs: [{ mayaTurn: 8, lines: [closeTexts("SPOT_MISS")] }], never: ["give_answer", "accept_answer"],
    },
  },
];
