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
        { mayaTurn: 1, lines: [variants(trial.help("try"), "trial.point")] },
        { mayaTurn: 2, lines: [variants(trial.help("try"), "trial.round")] },
      ],
      never: ["give_answer"],
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
