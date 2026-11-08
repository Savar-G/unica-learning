// Behaviour-gate cases for missing numbers (Wave A, A3): a missing factor by division after dropping a zero, a 3-digit
// missing factor by trying numbers, and a missing number taken away. Scripted child, scripted fake model, free.
import { packageLines, type LineOffer, type TemplateKey } from "@/lib/maya/lines";
import type { OperationPackage, QuestionPackage } from "@/lib/question-package";
import { FIXTURES } from "./fixtures";
import type { Behaviour, Plan, Read, Step } from "./gate";

const child = (text: string, read?: Read, maya?: Plan[]): Step => ({ child: text, ...(read ? { read } : {}), ...(maya ? { maya } : {}) });
const variants = (offers: LineOffer[], key: TemplateKey): string[] => offers.filter((line) => line.key === key).flatMap((line) => line.texts);
const wrote: Step[] = [child("Okay.", undefined, [{ act: "ask_write", understanding: "uncertain" }]), child("I wrote it.", { paper: "written" })];
const OPEN = "open" as const;

const divide = packageLines(FIXTURES.M_DIVIDE as OperationPackage);
const trial = packageLines(FIXTURES.M_TRY as OperationPackage);
const subtract = packageLines(FIXTURES.M_SUBTRACT as OperationPackage);
/** One example_step act per worked step of a fixture's easier example (the whole example after one turn). */
const exampleActs = (pkg: QuestionPackage) => (pkg.easierExample?.steps ?? []).map(() => "example_step" as const);
const CLOSE_LINES = (l: ReturnType<typeof packageLines>) => l.closeUnsolved().flatMap((o) => o.texts);
const tryLine = (heard: string) => trial.notYet("result").filter((o) => o.slots.heard === heard).flatMap((o) => o.texts);

export const MISSING_NUMBER_BEHAVIOURS: Behaviour[] = [
  {
    id: "MN1",
    title: "30 × ? = 1620, cannot start: the easier example frames 20 × ? = 40 as 40 ÷ 20 and drops a zero, then 54 is accepted",
    fixture: "M_DIVIDE",
    status: "passing",
    steps: [
      // The whole easier example follows the one turn: framing, zeros, the division, the result.
      child("I don't know how to start.", { start: "no_start" }, [{ act: "example_step" }]),
      child("Okay.", undefined, [{ act: "try_target" }]),
      child("162 divided by 3 is 54.", { answers: [[54, "result", "right"]] }),
      ...wrote,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "worked_example" },
      acts: [OPEN, "example_step", "example_step", "example_step", "example_step", "try_target", "accept_answer", "ask_write", "close"],
      counts: { refusals: 0 },
      outputs: [
        { mayaTurn: 5, lines: [variants(divide.tryTarget(), "try.target.frame")] },
        { mayaTurn: 6, lines: [variants(divide.answerRight(), "answer.right")] },
      ],
      never: ["give_answer"],
    },
  },
  {
    id: "MN2",
    title: "236 × ? = 1416 by trying numbers: 7 is multiplied out (too big), 5 (too small), then 6 is accepted; no long division",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I got 7.", { start: "has_work", answers: [[7, "result", "wrong"]] }, [{ act: "guide", level: 0, lines: ["check.not_yet"], heard: "7" }]),
      child("5.", { answers: [[5, "result", "wrong"]] }, [{ act: "guide", level: 0, lines: ["check.not_yet"], heard: "5" }]),
      child("6.", { answers: [[6, "result", "right"]] }),
      ...wrote,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "independent" },
      acts: [OPEN, "guide", "guide", "accept_answer", "ask_write", "close"],
      counts: { refusals: 0 },
      outputs: [
        { mayaTurn: 1, lines: [tryLine("7")] },
        { mayaTurn: 2, lines: [tryLine("5")] },
        // The child gave only the number, so the turn asks how they got it.
        { mayaTurn: 3, lines: [variants(trial.answerRight(), "answer.right"), variants(trial.thinking(), "check.thinking")] },
      ],
      never: ["give_answer", "example_step"],
    },
  },
  {
    id: "MN2b",
    title: "236 × ? = 1416, stuck: the try hint at H1, the rounding hint at H2, then 6 is accepted",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("6.", { answers: [[6, "result", "right"]] }),
      ...wrote,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "hint", highestHint: 2 },
      acts: [OPEN, "guide", "guide", "accept_answer", "ask_write", "close"],
      counts: { refusals: 0 },
      outputs: [
        // The first hint carries the framing (Maya has not said it yet); the next one does not repeat it.
        { mayaTurn: 1, lines: [variants(trial.help("try", "due"), "trial.point")] },
        { mayaTurn: 2, lines: [variants(trial.help("try", "done"), "trial.round")] },
      ],
      never: ["give_answer"],
    },
  },
  {
    // J06 (#698 practice): a right try in the child's own words is credited once, said back, and Maya moves on.
    id: "MN2c",
    title: "236 × ? = 1416, '236 times 6 is 1416': the try step is heard on the whole turn and said back without the number (it is the answer), then 'So what is the missing number?' and 6 accepted",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("236 times 6 is 1416.", { start: "has_work", answers: [[6, "try", "right"]] }, [{ act: "guide", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("6.", { answers: [[6, "result", "right"]] }),
      ...wrote,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "independent" },
      acts: [OPEN, "guide", "accept_answer", "ask_write", "close"],
      counts: { refusals: 0 },
      outputs: [{ mayaTurn: 1, lines: [variants(trial.rightStep("try"), "trial.right"), variants(trial.help("result"), "invite.result.try")] }],
      never: ["give_answer", "example_step"],
    },
  },
  {
    // J06: a child's question about the step gets a code line that answers it: the framing says why it divides.
    id: "MN1b",
    title: "30 × ? = 1620, 'Why do I divide?': the framing line says why (30 times the missing number makes 1620), then 54 is accepted",
    fixture: "M_DIVIDE",
    status: "passing",
    steps: [
      child("Why do I divide?", { start: "has_work", help: "more" }, [{ act: "guide", level: 0 }]),
      child("162 divided by 3 is 54.", { answers: [[54, "result", "right"]] }),
      ...wrote,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "independent" },
      acts: [OPEN, "guide", "accept_answer", "ask_write", "close"],
      counts: { refusals: 0 },
      outputs: [{ mayaTurn: 1, lines: [variants(divide.help(divide.stepIds[0]), "invite.frame.zeros")] }],
      never: ["give_answer", "example_step"],
    },
  },
  {
    // P2 (review of #732): a child who starts stuck gets H1 first; that hint carries the framing and the zeros, so
    // 162 ÷ 3 is never said before 1620 ÷ 30 is.
    id: "MN1c",
    title: "30 × ? = 1620, 'I'm stuck.': the first hint (H1) starts with the framing, 'The missing number is 1620 ÷ 30. That is 162 ÷ 3.', then 54 is accepted",
    fixture: "M_DIVIDE",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("162 divided by 3 is 54.", { answers: [[54, "result", "right"]] }),
      ...wrote,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "hint", highestHint: 1 },
      acts: [OPEN, "guide", "accept_answer", "ask_write", "close"],
      counts: { refusals: 0 },
      outputs: [{ mayaTurn: 1, lines: [variants(divide.help(divide.stepIds[0], "due"), "point.divide.first")] }],
      never: ["give_answer", "example_step", "redirect"],
    },
  },
  {
    // Lessons 2 and 3: at grade 3 (25-word turns) the first hint after "I'm stuck." is the framing alone, short enough.
    id: "MN1f",
    grade: 3,
    title: "30 × ? = 1620 at grade 3, 'I'm stuck.': the first hint (H1) is the short framing, 'The missing number is 1620 ÷ 30. That is 162 ÷ 3.', within 25 words; then 54 is accepted",
    fixture: "M_DIVIDE",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("162 divided by 3 is 54.", { answers: [[54, "result", "right"]] }),
      ...wrote,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "hint", highestHint: 1 },
      acts: [OPEN, "guide", "accept_answer", "ask_write", "close"],
      counts: { refusals: 0 },
      outputs: [{ mayaTurn: 1, lines: [["The missing number is 1620 ÷ 30. That is 162 ÷ 3."]] }],
      never: ["give_answer", "example_step", "redirect"],
    },
  },
  {
    // J06 (b): a question about the current step gets code's answer (step.why), not the invite again.
    id: "MN2d",
    title: "236 × ? = 1416, 'Why do I try numbers?': code's answer (multiplying is easier than dividing by 236), then 6 is accepted",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("Why do I try numbers?", { start: "has_work", help: "more" }, [{ act: "guide", level: 1, lines: ["step.why"] }]),
      child("6.", { answers: [[6, "result", "right"]] }),
      ...wrote,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "hint", highestHint: 1 },
      acts: [OPEN, "guide", "accept_answer", "ask_write", "close"],
      counts: { refusals: 0 },
      outputs: [{ mayaTurn: 1, lines: [variants(trial.help("try", "due"), "trial.why")] }],
      never: ["give_answer", "example_step", "redirect"],
    },
  },
  {
    // J06 (a): the child says the operation that finds the ? before Maya: acknowledged once, never framed again.
    id: "MN1d",
    title: "30 × ? = 1620, 'I do 1620 divided by 30.': acknowledged ('Yes! The missing number is 1620 ÷ 30.') with the zeros next and no framing of Maya's own, then 54 is accepted",
    fixture: "M_DIVIDE",
    status: "passing",
    steps: [
      child("I do 1620 divided by 30.", { start: "has_work" }, [{ act: "guide", level: 0 }]),
      child("162 divided by 3 is 54.", { answers: [[54, "result", "right"]] }),
      ...wrote,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "independent" },
      acts: [OPEN, "guide", "accept_answer", "ask_write", "close"],
      counts: { refusals: 0 },
      outputs: [{ mayaTurn: 1, lines: [variants(divide.help(divide.stepIds[0], "heard"), "invite.frame.heard.zeros")] }],
      never: ["give_answer", "example_step", "redirect"],
    },
  },
  {
    // J06 (a) on the try path.
    id: "MN2e",
    title: "236 × ? = 1416, 'I do 1416 divided by 236.': acknowledged, then a try is invited with no framing of Maya's own, then 6 is accepted",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I do 1416 divided by 236.", { start: "has_work" }, [{ act: "guide", level: 0 }]),
      child("6.", { answers: [[6, "result", "right"]] }),
      ...wrote,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "independent" },
      acts: [OPEN, "guide", "accept_answer", "ask_write", "close"],
      counts: { refusals: 0 },
      outputs: [{ mayaTurn: 1, lines: [variants(trial.help("try", "heard"), "invite.frame.heard.try")] }],
      never: ["give_answer", "example_step", "redirect"],
    },
  },
  {
    // J06 (a): once "Now you try yours" framed it, the next hint goes on from there and never frames again.
    id: "MN1e",
    title: "30 × ? = 1620 after the easier example and 'Now you try yours' (which frames 1620 ÷ 30), 'I'm stuck.': only the zeros come next, not the framing again",
    fixture: "M_DIVIDE",
    status: "passing",
    steps: [
      child("I don't know how to start.", { start: "no_start" }, [{ act: "example_step" }]),
      child("Okay.", undefined, [{ act: "try_target" }]),
      child("I'm stuck.", { help: "more" }, [{ act: "guide", level: 0 }]),
      child("162 divided by 3 is 54.", { answers: [[54, "result", "right"]] }),
      ...wrote,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "worked_example" },
      acts: [OPEN, "example_step", "example_step", "example_step", "example_step", "try_target", "guide", "accept_answer", "ask_write", "close"],
      counts: { refusals: 0 },
      outputs: [{ mayaTurn: 6, lines: [variants(divide.help(divide.stepIds[0], "done"), "invite.zeros")] }],
      never: ["give_answer", "redirect"],
    },
  },
  {
    // P1 (review of #732): the child's own tries are work on the question, never an outside request.
    id: "MN4",
    title: "236 × ? = 1416, '236 times 5 is 1180.' then '236 times 7 is 1652.': each try is in scope and multiplied out, then 6 is accepted",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("236 times 5 is 1180.", { start: "has_work", answers: [[5, "try", "wrong"]] }, [{ act: "guide", level: 0, lines: ["check.not_yet"], heard: "5" }]),
      child("236 times 7 is 1652.", { answers: [[7, "try", "wrong"]] }, [{ act: "guide", level: 0, lines: ["check.not_yet"], heard: "7" }]),
      child("6.", { answers: [[6, "result", "right"]] }),
      ...wrote,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "independent" },
      acts: [OPEN, "guide", "guide", "accept_answer", "ask_write", "close"],
      counts: { refusals: 0 },
      outputs: [
        { mayaTurn: 1, lines: [trial.notYet("try").filter((o) => o.slots.heard === "5").flatMap((o) => o.texts)] },
        { mayaTurn: 2, lines: [trial.notYet("try").filter((o) => o.slots.heard === "7").flatMap((o) => o.texts)] },
      ],
      never: ["give_answer", "redirect"],
    },
  },
  {
    // P1: the framing's operation and its check are the question's own math.
    id: "MN5",
    title: "30 × ? = 1620, '1620 divided by 30 is 54.' is accepted, and '30 times 54 is 1620.' is a check of it, not an outside request",
    fixture: "M_DIVIDE",
    status: "passing",
    steps: [
      child("1620 divided by 30 is 54.", { start: "has_work", answers: [[54, "result", "right"]] }),
      child("30 times 54 is 1620.", undefined, [{ act: "ask_write", understanding: "uncertain" }]),
      child("I wrote it.", { paper: "written" }),
    ],
    expect: {
      outcome: { reason: "solved", assistance: "independent" },
      acts: [OPEN, "accept_answer", "ask_write", "close"],
      counts: { refusals: 0 },
      never: ["give_answer", "redirect"],
    },
  },
  {
    // P1: a subtraction's check is the question's own math.
    id: "MN6",
    title: "9000 − ? = 3000, 'I got 6000.' is accepted, and '9000 minus 6000 is 3000.' is a check of it, not an outside request",
    fixture: "M_SUBTRACT",
    status: "passing",
    steps: [
      child("I got 6000.", { start: "has_work", answers: [[6000, "result", "right"]] }),
      child("9000 minus 6000 is 3000.", undefined, [{ act: "ask_write", understanding: "uncertain" }]),
      child("I wrote it.", { paper: "written" }),
    ],
    expect: {
      outcome: { reason: "solved", assistance: "independent" },
      acts: [OPEN, "accept_answer", "ask_write", "close"],
      counts: { refusals: 0 },
      never: ["give_answer", "redirect"],
    },
  },
  {
    // Re-review P1: Maya's own estimate hint (trial.round) leads to the child's estimate; it is the question's math.
    id: "MN7",
    title: "236 × ? = 1416, after the rounding hint, '200 times 7 is 1400.': in scope, 7 is multiplied out (too big), then 6 is accepted",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("200 times 7 is 1400.", { answers: [[7, "try", "wrong"]] }, [{ act: "guide", level: 0, lines: ["check.not_yet"], heard: "7" }]),
      child("6.", { answers: [[6, "result", "right"]] }),
      ...wrote,
    ],
    expect: {
      outcome: { reason: "solved", highestHint: 2 },
      acts: [OPEN, "guide", "guide", "guide", "accept_answer", "ask_write", "close"],
      counts: { refusals: 0 },
      outputs: [{ mayaTurn: 3, lines: [trial.notYet("try").filter((o) => o.slots.heard === "7").flatMap((o) => o.texts)] }],
      never: ["give_answer", "redirect"],
    },
  },
  {
    id: "MN7b",
    title: "236 × ? = 1416, after the rounding hint, '1416 divided by 200 is 7.': in scope, 7 is multiplied out (too big), then 6 is accepted",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("1416 divided by 200 is 7.", { answers: [[7, "try", "wrong"]] }, [{ act: "guide", level: 0, lines: ["check.not_yet"], heard: "7" }]),
      child("6.", { answers: [[6, "result", "right"]] }),
      ...wrote,
    ],
    expect: {
      outcome: { reason: "solved", highestHint: 2 },
      acts: [OPEN, "guide", "guide", "guide", "accept_answer", "ask_write", "close"],
      counts: { refusals: 0 },
      outputs: [{ mayaTurn: 3, lines: [trial.notYet("try").filter((o) => o.slots.heard === "7").flatMap((o) => o.texts)] }],
      never: ["give_answer", "redirect"],
    },
  },
  {
    // Re-review P2a: adding back is a check of a subtraction's answer, the question's own math.
    id: "MN6b",
    title: "9000 − ? = 3000, 'I got 6000.' is accepted, and '6000 plus 3000 is 9000.' is a check of it, not an outside request",
    fixture: "M_SUBTRACT",
    status: "passing",
    steps: [
      child("I got 6000.", { start: "has_work", answers: [[6000, "result", "right"]] }),
      child("6000 plus 3000 is 9000.", undefined, [{ act: "ask_write", understanding: "uncertain" }]),
      child("I wrote it.", { paper: "written" }),
    ],
    expect: { outcome: { reason: "solved", assistance: "independent" }, acts: [OPEN, "accept_answer", "ask_write", "close"], counts: { refusals: 0 }, never: ["give_answer", "redirect"] },
  },
  {
    id: "MN6c",
    title: "9000 − ? = 3000, 'I got 6000.' is accepted, and '3000 plus 6000 is 9000.' is a check of it, not an outside request",
    fixture: "M_SUBTRACT",
    status: "passing",
    steps: [
      child("I got 6000.", { start: "has_work", answers: [[6000, "result", "right"]] }),
      child("3000 plus 6000 is 9000.", undefined, [{ act: "ask_write", understanding: "uncertain" }]),
      child("I wrote it.", { paper: "written" }),
    ],
    expect: { outcome: { reason: "solved", assistance: "independent" }, acts: [OPEN, "accept_answer", "ask_write", "close"], counts: { refusals: 0 }, never: ["give_answer", "redirect"] },
  },
  {
    // Re-check optional P3: the estimate's own product, divided back.
    id: "MN7c",
    title: "236 × ? = 1416, after the rounding hint, '1400 divided by 200 is 7.': in scope, 7 is multiplied out (too big), then 6 is accepted",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("1400 divided by 200 is 7.", { answers: [[7, "try", "wrong"]] }, [{ act: "guide", level: 0, lines: ["check.not_yet"], heard: "7" }]),
      child("6.", { answers: [[6, "result", "right"]] }),
      ...wrote,
    ],
    expect: {
      outcome: { reason: "solved", highestHint: 2 },
      acts: [OPEN, "guide", "guide", "guide", "accept_answer", "ask_write", "close"],
      counts: { refusals: 0 },
      outputs: [{ mayaTurn: 3, lines: [trial.notYet("try").filter((o) => o.slots.heard === "7").flatMap((o) => o.texts)] }],
      never: ["give_answer", "redirect"],
    },
  },
  {
    // The way out (review of #732, lessons 7 and 10): after H3, a copy of what H3 showed is no miss; it brings the easier
    // example, and a child still stuck after it gets the honest close (close.together, "We worked on ... together
    // today."): never the answer, never give_answer.
    id: "MN2f",
    title: "236 × ? = 1416, after H3 shows '236 × 5 = 1180. That is less than 1416.', the child says it back: no miss, the easier example; 'I'm stuck.' gets the honest close, never the answer",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("236 times 5 is 1180.", { answers: [[5, "try", "wrong"]] }, [{ act: "example_step" }]),
      child("I'm stuck.", { help: "more" }, [{ act: "close" }]),
    ],
    expect: {
      outcome: { reason: "child_stopped", highestHint: 3 },
      acts: [OPEN, "guide", "guide", "guide", ...exampleActs(FIXTURES.M_TRY), "close"],
      counts: { refusals: 0 },
      outputs: [{ mayaTurn: 7, lines: [CLOSE_LINES(trial)] }],
      never: ["give_answer", "redirect", "accept_answer"],
    },
  },
  {
    // Lesson 13: a proposed give_answer is refused on the copy turn and on the next neutral turn.
    id: "MN2g",
    title: "236 × ? = 1416, after H3, '236 times 5 is 1180.' with give_answer proposed: refused, the easier example comes; 'Okay.' with give_answer proposed: refused; then 6 is accepted",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("236 times 5 is 1180.", { answers: [[5, "try", "wrong"]] }, [{ act: "give_answer", repair: { act: "example_step" } }]),
      child("Okay.", undefined, [{ act: "give_answer", repair: { act: "try_target" } }]),
      child("6.", { answers: [[6, "result", "right"]] }),
      ...wrote,
    ],
    expect: { outcome: { reason: "solved", highestHint: 3 }, refused: ["act_not_allowed", "act_not_allowed"], never: ["give_answer", "redirect"] },
  },
  {
    id: "MN2h",
    title: "236 × ? = 1416, after H3, '5.' with give_answer proposed: refused, the easier example comes; then 6 is accepted",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("5.", { answers: [[5, "try", "wrong"]] }, [{ act: "give_answer", repair: { act: "example_step" } }]),
      child("Okay.", undefined, [{ act: "try_target" }]),
      child("6.", { answers: [[6, "result", "right"]] }),
      ...wrote,
    ],
    expect: { outcome: { reason: "solved", highestHint: 3 }, refused: ["act_not_allowed"], never: ["give_answer", "redirect"] },
  },
  {
    // Review P2 (round 5): the copy read as its product (1180) is a copy too: code reads the child's words, not the value.
    id: "MN2k",
    title: "236 × ? = 1416, after H3, '236 times 5 is 1180.' read as 1180, with give_answer proposed: refused (a copy, decided from the child's words); the easier example comes",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("236 times 5 is 1180.", { answers: [[1180, "try", "wrong"]] }, [{ act: "give_answer", repair: { act: "example_step" } }]),
      child("Okay.", undefined, [{ act: "give_answer", repair: { act: "try_target" } }]),
      child("6.", { answers: [[6, "result", "right"]] }),
      ...wrote,
    ],
    expect: { outcome: { reason: "solved", highestHint: 3 }, refused: ["act_not_allowed", "act_not_allowed"], never: ["give_answer", "redirect"] },
  },
  {
    id: "MN2i",
    title: "236 × ? = 1416, after H3, '5.' brings the easier example, then 'I'm stuck.' gets the honest close, never the answer",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("5.", { answers: [[5, "try", "wrong"]] }, [{ act: "example_step" }]),
      child("I'm stuck.", { help: "more" }, [{ act: "close" }]),
    ],
    expect: {
      outcome: { reason: "child_stopped", highestHint: 3 },
      acts: [OPEN, "guide", "guide", "guide", ...exampleActs(FIXTURES.M_TRY), "close"],
      counts: { refusals: 0 },
      outputs: [{ mayaTurn: 7, lines: [CLOSE_LINES(trial)] }],
      never: ["give_answer", "redirect"],
    },
  },
  {
    // Repeated copies have a way out: the easier example, then the honest close (no loop on H3 to the call clock).
    id: "MN2j",
    title: "236 × ? = 1416, after H3, the child copies '5.' again and again: the easier example, then the honest close, never the answer",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("5.", { answers: [[5, "try", "wrong"]] }, [{ act: "example_step" }]),
      child("5.", { answers: [[5, "try", "wrong"]] }, [{ act: "close" }]),
    ],
    expect: {
      outcome: { reason: "child_stopped", highestHint: 3 },
      acts: [OPEN, "guide", "guide", "guide", ...exampleActs(FIXTURES.M_TRY), "close"],
      counts: { refusals: 0 },
      outputs: [{ mayaTurn: 7, lines: [CLOSE_LINES(trial)] }],
      never: ["give_answer", "redirect"],
    },
  },
  {
    // The way out with a failing model (wave-b 921ab669): a wrong number at the top hint, then still stuck; code's own
    // fallback gives the easier example, then the honest close. Never technical_issue, never give_answer.
    id: "MN8a",
    title: "236 × ? = 1416, H3, then a wrong '7.' with a failing model: the easier example, then 'I don't know.' twice: the easier example, then the honest close; never give_answer",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("7.", { answers: [[7, "try", "wrong"]] }, [{ throws: true }]),
      child("I don't know.", { help: "more" }, [{ throws: true }]),
      child("I don't know.", { help: "more" }, [{ throws: true }]),
    ],
    expect: {
      outcome: { reason: "child_stopped", highestHint: 3 },
      acts: [OPEN, "guide", "guide", "guide", "guide", ...exampleActs(FIXTURES.M_TRY), "close"],
      never: ["give_answer", "redirect"],
    },
  },
  {
    // The same, with a model that proposes give_answer on every turn: each is refused; code's fallback gives the way out.
    id: "MN9a",
    title: "236 × ? = 1416, H3, then a wrong '7.' (one real miss) and 'I don't know.' twice, with give_answer proposed on every turn: refused each time; the easier example, then the honest close",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("7.", { answers: [[7, "try", "wrong"]] }, [{ act: "give_answer", repair: { act: "give_answer" } }]),
      child("I don't know.", { help: "more" }, [{ act: "give_answer", repair: { act: "give_answer" } }]),
      child("I don't know.", { help: "more" }, [{ act: "give_answer", repair: { act: "give_answer" } }]),
    ],
    expect: {
      outcome: { reason: "child_stopped", highestHint: 3 },
      acts: [OPEN, "guide", "guide", "guide", "guide", ...exampleActs(FIXTURES.M_TRY), "close"],
      refused: ["act_not_allowed", "act_not_allowed"],
      never: ["give_answer", "redirect"],
    },
  },
  {
    // The way out with a failing model (wave-b 921ab669): a wrong number at the top hint, then still stuck; code's own
    // fallback gives the easier example, then the honest close. Never technical_issue, never give_answer.
    id: "MN8b",
    title: "30 × ? = 1620, H3, then a wrong '1.' with a failing model: the easier example, then 'I don't know.' twice: the easier example, then the honest close; never give_answer",
    fixture: "M_DIVIDE",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("1.", { answers: [[1, "hundreds", "wrong"]] }, [{ throws: true }]),
      child("I don't know.", { help: "more" }, [{ throws: true }]),
      child("I don't know.", { help: "more" }, [{ throws: true }]),
    ],
    expect: {
      outcome: { reason: "child_stopped", highestHint: 3 },
      acts: [OPEN, "guide", "guide", "guide", "guide", ...exampleActs(FIXTURES.M_DIVIDE), "close"],
      never: ["give_answer", "redirect"],
    },
  },
  {
    // The same, with a model that proposes give_answer on every turn: each is refused; code's fallback gives the way out.
    id: "MN9b",
    title: "30 × ? = 1620, H3, then a wrong '1.' (one real miss) and 'I don't know.' twice, with give_answer proposed on every turn: refused each time; the easier example, then the honest close",
    fixture: "M_DIVIDE",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("1.", { answers: [[1, "hundreds", "wrong"]] }, [{ act: "give_answer", repair: { act: "give_answer" } }]),
      child("I don't know.", { help: "more" }, [{ act: "give_answer", repair: { act: "give_answer" } }]),
      child("I don't know.", { help: "more" }, [{ act: "give_answer", repair: { act: "give_answer" } }]),
    ],
    expect: {
      outcome: { reason: "child_stopped", highestHint: 3 },
      acts: [OPEN, "guide", "guide", "guide", "guide", ...exampleActs(FIXTURES.M_DIVIDE), "close"],
      refused: ["act_not_allowed", "act_not_allowed"],
      never: ["give_answer", "redirect"],
    },
  },
  {
    // The way out with a failing model (wave-b 921ab669): a wrong number at the top hint, then still stuck; code's own
    // fallback gives the easier example, then the honest close. Never technical_issue, never give_answer.
    id: "MN8c",
    title: "9000 − ? = 3000, H3, then a wrong '1.' with a failing model: the easier example, then 'I don't know.' twice: the easier example, then the honest close; never give_answer",
    fixture: "M_SUBTRACT",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("1.", { answers: [[1, "ones", "wrong"]] }, [{ throws: true }]),
      child("I don't know.", { help: "more" }, [{ throws: true }]),
      child("I don't know.", { help: "more" }, [{ throws: true }]),
    ],
    expect: {
      outcome: { reason: "child_stopped", highestHint: 3 },
      acts: [OPEN, "guide", "guide", "guide", "guide", ...exampleActs(FIXTURES.M_SUBTRACT), "close"],
      never: ["give_answer", "redirect"],
    },
  },
  {
    // The same, with a model that proposes give_answer on every turn: each is refused; code's fallback gives the way out.
    id: "MN9c",
    title: "9000 − ? = 3000, H3, then a wrong '1.' (one real miss) and 'I don't know.' twice, with give_answer proposed on every turn: refused each time; the easier example, then the honest close",
    fixture: "M_SUBTRACT",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("1.", { answers: [[1, "ones", "wrong"]] }, [{ act: "give_answer", repair: { act: "give_answer" } }]),
      child("I don't know.", { help: "more" }, [{ act: "give_answer", repair: { act: "give_answer" } }]),
      child("I don't know.", { help: "more" }, [{ act: "give_answer", repair: { act: "give_answer" } }]),
    ],
    expect: {
      outcome: { reason: "child_stopped", highestHint: 3 },
      acts: [OPEN, "guide", "guide", "guide", "guide", ...exampleActs(FIXTURES.M_SUBTRACT), "close"],
      refused: ["act_not_allowed", "act_not_allowed"],
      never: ["give_answer", "redirect"],
    },
  },
  {
    // D-199 stands: two real wrong numbers at H3 (not copies, not help) still reach the given answer.
    id: "MN10",
    title: "236 × ? = 1416, after H3, two real wrong tries ('7.' then '8.'): 'Not quite' and H3 again after the first, the second reaches the given answer (D-199)",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("7.", { answers: [[7, "try", "wrong"]] }, [{ act: "guide", level: 3, lines: ["check.not_yet", "step.show"] }]),
      child("8.", { answers: [[8, "try", "wrong"]] }, [{ act: "give_answer" }]),
      child("Okay.", undefined, [{ act: "close" }]),
    ],
    expect: {
      outcome: { reason: "solved", assistance: "answer_given" },
      acts: [OPEN, "guide", "guide", "guide", "guide", "give_answer", "close"],
      counts: { refusals: 0 },
      never: ["example_step", "redirect"],
    },
  },
  {
    // One real miss, then a copy, then a help request: neither is a miss, so the way out, not the answer.
    id: "MN10b",
    title: "236 × ? = 1416, after H3, one real miss ('7.'), then a copy ('5.'), then 'I'm stuck.': the easier example, then the honest close; never the answer",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("7.", { answers: [[7, "try", "wrong"]] }, [{ act: "guide", level: 3, lines: ["check.not_yet", "step.show"], heard: "7" }]),
      child("5.", { answers: [[5, "try", "wrong"]] }, [{ act: "give_answer", repair: { act: "example_step" } }]),
      child("I'm stuck.", { help: "more" }, [{ act: "give_answer", repair: { act: "close" } }]),
    ],
    expect: {
      outcome: { reason: "child_stopped", highestHint: 3 },
      acts: [OPEN, "guide", "guide", "guide", "guide", ...exampleActs(FIXTURES.M_TRY), "close"],
      refused: ["act_not_allowed", "act_not_allowed"],
      never: ["give_answer", "redirect"],
    },
  },
  {
    // Review of be4b8d72: a help request with a hedged number is never a real miss, so it never adds up to a given
    // answer: the easier example, then the honest close (notAMiss, one rule for every count).
    id: "MN11",
    title: "236 × ? = 1416, after H3, 'I'm stuck. Is it 7?' then 'I'm stuck. Is it 8?' (read as help with a wrong number), give_answer proposed each time: the easier example, then the honest close; never the answer",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("I'm stuck. Is it 7?", { help: "more", answers: [[7, "try", "wrong"]] }, [{ act: "give_answer", repair: { act: "give_answer" } }]),
      child("I'm stuck. Is it 8?", { help: "more", answers: [[8, "try", "wrong"]] }, [{ act: "give_answer", repair: { act: "give_answer" } }]),
    ],
    expect: {
      outcome: { reason: "child_stopped", highestHint: 3 },
      acts: [OPEN, "guide", "guide", "guide", ...exampleActs(FIXTURES.M_TRY), "close"],
      refused: ["act_not_allowed", "act_not_allowed"],
      never: ["give_answer", "redirect"],
    },
  },
  {
    // A question with a number ("Is it 7?") is not a committed answer, so it is no real miss either.
    id: "MN11b",
    title: "236 × ? = 1416, after H3, 'Is it 7?' then 'Is it 8?' (read as wrong numbers), give_answer proposed each time: the easier example, then the honest close; never the answer",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("Is it 7?", { answers: [[7, "try", "wrong"]] }, [{ act: "give_answer", repair: { act: "give_answer" } }]),
      child("Is it 8?", { answers: [[8, "try", "wrong"]] }, [{ act: "give_answer", repair: { act: "give_answer" } }]),
    ],
    expect: {
      outcome: { reason: "child_stopped", highestHint: 3 },
      acts: [OPEN, "guide", "guide", "guide", ...exampleActs(FIXTURES.M_TRY), "close"],
      refused: ["act_not_allowed", "act_not_allowed"],
      never: ["give_answer", "redirect"],
    },
  },
  {
    // Review of af0b4ab6: a help request in the child's own words is never a miss, even beside a number and with no help reading.
    id: "MN12",
    title: "236 × ? = 1416, after H3, 'I'm stuck, but it's 7.' then 'I'm stuck, but it's 8.' (read as wrong numbers, no help reading), give_answer proposed each time: the easier example, then the honest close; never the answer",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("I'm stuck, but it's 7.", { answers: [[7, "try", "wrong"]] }, [{ act: "give_answer", repair: { act: "give_answer" } }]),
      child("I'm stuck, but it's 8.", { answers: [[8, "try", "wrong"]] }, [{ act: "give_answer", repair: { act: "give_answer" } }]),
    ],
    expect: {
      outcome: { reason: "child_stopped", highestHint: 3 },
      acts: [OPEN, "guide", "guide", "guide", ...exampleActs(FIXTURES.M_TRY), "close"],
      refused: ["act_not_allowed", "act_not_allowed"],
      never: ["give_answer", "redirect"],
    },
  },
  {
    // Review of af0b4ab6: an 'I think' hedge is never a real miss (the controller's one doubt check, hedgedTurn).
    id: "MN12b",
    title: "236 × ? = 1416, after H3, 'I think it's 7.' then 'I think it's 8.' (read as wrong numbers, no help reading), give_answer proposed each time: the easier example, then the honest close; never the answer",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("I think it's 7.", { answers: [[7, "try", "wrong"]] }, [{ act: "give_answer", repair: { act: "give_answer" } }]),
      child("I think it's 8.", { answers: [[8, "try", "wrong"]] }, [{ act: "give_answer", repair: { act: "give_answer" } }]),
    ],
    expect: {
      outcome: { reason: "child_stopped", highestHint: 3 },
      acts: [OPEN, "guide", "guide", "guide", ...exampleActs(FIXTURES.M_TRY), "close"],
      refused: ["act_not_allowed", "act_not_allowed"],
      never: ["give_answer", "redirect"],
    },
  },
  {
    // D-199 stands for committed numbers in other forms: "It's 7." and a wrong product ("5 times 236 is 1170.").
    id: "MN10c",
    title: "236 × ? = 1416, after H3, two committed wrong numbers ('It's 7.' then '5 times 236 is 1170.'): the second reaches the given answer (D-199)",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("It's 7.", { answers: [[7, "try", "wrong"]] }, [{ act: "guide", level: 3, lines: ["check.not_yet", "step.show"] }]),
      child("5 times 236 is 1170.", { answers: [[5, "try", "wrong"]] }, [{ act: "give_answer" }]),
      child("Okay.", undefined, [{ act: "close" }]),
    ],
    expect: {
      outcome: { reason: "solved", assistance: "answer_given" },
      acts: [OPEN, "guide", "guide", "guide", "guide", "give_answer", "close"],
      counts: { refusals: 0 },
      never: ["example_step", "redirect"],
    },
  },
  {
    id: "MN3",
    title: "9000 − ? = 3000, says 12000 (adds): not yet, the framing invite says 9000 − 3000, then 6000 is accepted",
    fixture: "M_SUBTRACT",
    status: "passing",
    steps: [
      child("I got 12000.", { start: "has_work", answers: [[12000, "result", "wrong"]] }, [{ act: "guide", level: 0, lines: ["check.not_yet", "step.invite"] }]),
      child("9000 take away 3000 is 6000.", { answers: [[6000, "result", "right"]] }),
      ...wrote,
    ],
    expect: {
      outcome: { reason: "solved", assistance: "independent" },
      acts: [OPEN, "guide", "accept_answer", "ask_write", "close"],
      counts: { refusals: 0 },
      outputs: [
        { mayaTurn: 1, lines: [variants(subtract.notYet("result"), "check.not_yet"), variants(subtract.help("ones"), "invite.frame")] },
      ],
      never: ["give_answer", "example_step"],
    },
  },
];
