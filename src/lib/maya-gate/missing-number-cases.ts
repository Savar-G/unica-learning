// Behaviour-gate cases for missing numbers (Wave A, A3): a missing factor by division after dropping a zero, a 3-digit
// missing factor by trying numbers, and a missing number taken away. Scripted child, scripted fake model, free.
import { packageLines, type LineOffer, type TemplateKey } from "@/lib/maya/lines";
import type { OperationPackage } from "@/lib/question-package";
import { FIXTURES } from "./fixtures";
import type { Behaviour, Plan, Read, Step } from "./gate";

const child = (text: string, read?: Read, maya?: Plan[]): Step => ({ child: text, ...(read ? { read } : {}), ...(maya ? { maya } : {}) });
const variants = (offers: LineOffer[], key: TemplateKey): string[] => offers.filter((line) => line.key === key).flatMap((line) => line.texts);
const wrote: Step[] = [child("Okay.", undefined, [{ act: "ask_write", understanding: "uncertain" }]), child("I wrote it.", { paper: "written" })];
const OPEN = "open" as const;

const divide = packageLines(FIXTURES.M_DIVIDE as OperationPackage);
const trial = packageLines(FIXTURES.M_TRY as OperationPackage);
const subtract = packageLines(FIXTURES.M_SUBTRACT as OperationPackage);
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
    // Re-review P2b: H3 shows the try next to the answer; the child saying it back is a copy, not a miss, so no answer is given.
    id: "MN2f",
    title: "236 × ? = 1416, after H3 shows '236 × 5 = 1180. That is less than 1416.', the child says it back: a copy, answered with 'try a bigger number', never the answer; then 6 is accepted",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("236 times 5 is 1180.", { answers: [[5, "try", "wrong"]] }, [{ act: "guide", level: 0, lines: ["check.not_yet"], heard: "5" }]),
      child("6.", { answers: [[6, "result", "right"]] }),
      ...wrote,
    ],
    expect: {
      outcome: { reason: "solved", highestHint: 3 },
      acts: [OPEN, "guide", "guide", "guide", "guide", "accept_answer", "ask_write", "close"],
      counts: { refusals: 0 },
      outputs: [{ mayaTurn: 4, lines: [trial.notYet("try").filter((o) => o.slots.heard === "5").flatMap((o) => o.texts)] }],
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
    // Lesson 13 (re-check of e7a3ccfa): a copy of H3's try is no failure, so a proposed give_answer is refused on it.
    id: "MN2g",
    title: "236 × ? = 1416, after H3, '236 times 5 is 1180.' with give_answer proposed: refused (hint_too_high), the copy gets 'try a bigger number'; then 6 is accepted",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("236 times 5 is 1180.", { answers: [[5, "try", "wrong"]] }, [{ act: "give_answer", repair: { act: "guide", level: 0, lines: ["check.not_yet"], heard: "5" } }]),
      child("6.", { answers: [[6, "result", "right"]] }),
      ...wrote,
    ],
    expect: { outcome: { reason: "solved", highestHint: 3 }, refused: ["hint_too_high"], outputs: [{ mayaTurn: 4, lines: [trial.notYet("try").filter((o) => o.slots.heard === "5").flatMap((o) => o.texts)] }], never: ["give_answer", "redirect"] },
  },
  {
    id: "MN2h",
    title: "236 × ? = 1416, after H3, '5.' with give_answer proposed: refused (hint_too_high); then 6 is accepted",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("5.", { answers: [[5, "try", "wrong"]] }, [{ act: "give_answer", repair: { act: "guide", level: 0, lines: ["check.not_yet"], heard: "5" } }]),
      child("6.", { answers: [[6, "result", "right"]] }),
      ...wrote,
    ],
    expect: { outcome: { reason: "solved", highestHint: 3 }, refused: ["hint_too_high"], outputs: [{ mayaTurn: 4, lines: [trial.notYet("try").filter((o) => o.slots.heard === "5").flatMap((o) => o.texts)] }], never: ["give_answer", "redirect"] },
  },
  {
    id: "MN2i",
    title: "236 × ? = 1416, after H3, '5.' gets 'try a bigger number', then 'Okay.' with give_answer proposed: refused (hint_too_high); then 6 is accepted",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("5.", { answers: [[5, "try", "wrong"]] }, [{ act: "guide", level: 0, lines: ["check.not_yet"], heard: "5" }]),
      child("Okay.", undefined, [{ act: "give_answer", repair: { act: "guide", level: 3 } }]),
      child("6.", { answers: [[6, "result", "right"]] }),
      ...wrote,
    ],
    expect: { outcome: { reason: "solved", highestHint: 3 }, refused: ["hint_too_high"], outputs: [{ mayaTurn: 4, lines: [trial.notYet("try").filter((o) => o.slots.heard === "5").flatMap((o) => o.texts)] }], never: ["give_answer", "redirect"] },
  },
  {
    // Lessons 7 and 10, today's end state on this base: repeated copies after H3 each get code's "try a bigger number",
    // never the answer and never a refusal. The honest close is not on site/maya-wave-a (it is #735's base change).
    id: "MN2j",
    title: "236 × ? = 1416, after H3, the child copies '5.' three times: each copy gets 'try a bigger number', never the answer; then 6 is accepted (end state documented: no honest close on this base)",
    fixture: "M_TRY",
    status: "passing",
    steps: [
      child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", level: 1 }]),
      child("I still don't get it.", { help: "more" }, [{ act: "guide", level: 2 }]),
      child("Can you show me?", { help: "more" }, [{ act: "guide", level: 3 }]),
      child("5.", { answers: [[5, "try", "wrong"]] }, [{ act: "guide", level: 0, lines: ["check.not_yet"], heard: "5" }]),
      child("5?", { answers: [[5, "try", "wrong"]] }, [{ act: "guide", level: 0, lines: ["check.not_yet"], heard: "5" }]),
      child("It's 5.", { answers: [[5, "try", "wrong"]] }, [{ act: "guide", level: 0, lines: ["check.not_yet"], heard: "5" }]),
      child("6.", { answers: [[6, "result", "right"]] }),
      ...wrote,
    ],
    expect: {
      outcome: { reason: "solved", highestHint: 3 },
      acts: [OPEN, "guide", "guide", "guide", "guide", "guide", "guide", "accept_answer", "ask_write", "close"],
      counts: { refusals: 0 },
      outputs: [{ mayaTurn: 4, lines: [trial.notYet("try").filter((o) => o.slots.heard === "5").flatMap((o) => o.texts)] }, { mayaTurn: 5, lines: [trial.notYet("try").filter((o) => o.slots.heard === "5").flatMap((o) => o.texts)] }, { mayaTurn: 6, lines: [trial.notYet("try").filter((o) => o.slots.heard === "5").flatMap((o) => o.texts)] }],
      never: ["give_answer", "redirect"],
    },
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
    // Item 4 (wave-b 921ab669): a wrong number at the top hint with a failing model never ends as technical_issue. The end
    // state on this base is the base ladder's given answer (#735 replaces it with the easier example and an honest close).
    id: "MN8a",
    title: "236 × ? = 1416, H3, then a wrong '7.' with a failing model: code's fallback shows H3 again; the next help request gets the base ladder's given answer (#735); never technical_issue",
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
      outcome: { reason: "solved", assistance: "answer_given" },
      acts: [OPEN, "guide", "guide", "guide", "guide", "give_answer", "close"],
      never: ["redirect"],
    },
  },
  {
    // Item 4 (wave-b 921ab669): a wrong number at the top hint with a failing model never ends as technical_issue. The end
    // state on this base is the base ladder's given answer (#735 replaces it with the easier example and an honest close).
    id: "MN8b",
    title: "30 × ? = 1620, H3, then a wrong '1.' with a failing model: code's fallback shows H3 again; the next help request gets the base ladder's given answer (#735); never technical_issue",
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
      outcome: { reason: "solved", assistance: "answer_given" },
      acts: [OPEN, "guide", "guide", "guide", "guide", "give_answer", "close"],
      never: ["redirect"],
    },
  },
  {
    // Item 4 (wave-b 921ab669): a wrong number at the top hint with a failing model never ends as technical_issue. The end
    // state on this base is the base ladder's given answer (#735 replaces it with the easier example and an honest close).
    id: "MN8c",
    title: "9000 − ? = 3000, H3, then a wrong '1.' with a failing model: code's fallback shows H3 again; the next help request gets the base ladder's given answer (#735); never technical_issue",
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
      outcome: { reason: "solved", assistance: "answer_given" },
      acts: [OPEN, "guide", "guide", "guide", "guide", "give_answer", "close"],
      never: ["redirect"],
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
