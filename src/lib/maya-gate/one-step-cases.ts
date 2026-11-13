// Gate cases for one-step workbook questions Maya teaches through her session adapter (Wave A, src/lib/maya-teaching):
// each fixture is the teaching package the adapter makes from a synthetic stored package, as a call gets it. They are
// above today's limits, so they also show Maya's 5- and 6-digit columns: the place names she says and the child's
// "ten thousands" and "hundred thousands" read as places, never as the numbers 10 or 100.
import type { QuestionPackage } from "@/lib/question-package";
import { teachingPackage } from "@/lib/maya-teaching";
import { bareSum, eachHasStory, subtractFromTenThousand } from "@/lib/maya-teaching/samples";
import type { Behaviour, Step } from "./gate";

export type OneStepFixtureId = "W5" | "W3" | "W6";

const made = (stored: QuestionPackage) => {
  const pkg = teachingPackage(stored) as QuestionPackage;
  if (!pkg.operation) throw new Error(`the adapter did not make ${stored.text}`);
  return pkg;
};

export const ONE_STEP_FIXTURES: Record<OneStepFixtureId, QuestionPackage> = {
  /** 10000 − 3615: a 5-digit subtraction story, regrouping across every zero. */
  W5: made(subtractFromTenThousand("Leo", "stickers", [3, 6, 1, 4])),
  /** 284 × 7: a 3-digit × 1-digit "Each … has" story. */
  W3: made(eachHasStory("crate", 284, "apples", "Nora", 7)),
  /** 352418 + 41275: a 6-digit column addition. */
  W6: made(bareSum(352418, 41275)),
};

const child = (text: string, read?: Step extends infer S ? S extends { child: string; read?: infer R } ? R : never : never, maya?: Behaviour["open"]): Step =>
  ({ child: text, ...(read ? { read } : {}), ...(maya ? { maya } : {}) });
const solvedEnd: Step[] = [child("Okay.", undefined, [{ act: "ask_write", understanding: "uncertain" }]), child("I wrote it.", { paper: "written" })];
const OPEN = "open" as const;

const next = (step: string) => [{ act: "guide" as const, step, level: 0 as const, lines: ["check.right_step" as const, "step.invite" as const] }];

export const ONE_STEP_BEHAVIOURS: Behaviour[] = [
  {
    id: "W5a", title: "10000 − 3615 story, says 7615 (smaller from larger): regrouping across the zeros is guided column by column", fixture: "W5", status: "passing",
    steps: [
      child("I got 7615.", { start: "has_work", answers: [[7615, "result", "wrong"]] }, [{ act: "guide", step: "ones", level: 1 }]),
      child("10 take away 5 is 5.", { answers: [[5, "ones", "right"]] }, next("tens")),
      child("9 take away 1 is 8.", { answers: [[8, "tens", "right"]] }, next("hundreds")),
      child("9 take away 6 is 3.", { answers: [[3, "hundreds", "right"]] }, next("thousands")),
      child("9 take away 3 is 6, so 6385.", { answers: [[6, "thousands", "right"], [6385, "result", "right"]] }),
      ...solvedEnd,
    ],
    expect: { outcome: { reason: "solved", assistance: "hint", highestHint: 1 }, acts: [OPEN, "guide", "guide", "guide", "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0 } },
  },
  {
    id: "W5b", title: "10000 − 3615 story, solved at the opening in words: 'six thousand three hundred eighty five' is accepted", fixture: "W5", status: "passing",
    steps: [child("Six thousand three hundred eighty five.", { start: "has_work", answers: [[6385, "result", "right"]] }), ...solvedEnd],
    expect: { outcome: { reason: "solved", assistance: "independent" }, acts: [OPEN, "accept_answer", "ask_write", "close"], counts: { refusals: 0 } },
  },
  {
    id: "W5c", title: "10000 − 3615 story, cannot start: the easier example of the same shape that fits every turn (10 − 3: a subtraction from a round number with a regroup), then back to the question", fixture: "W5", status: "passing",
    steps: [
      child("I don't know how to start.", { start: "no_start" }, [{ act: "example_step", draw: ["example.columns"] }, {}, {}]),
      child("Okay.", undefined, [{}, {}]),
      child("I did it the same way. It's 6385.", { answers: [[6385, "result", "right"]] }),
      ...solvedEnd,
    ],
    expect: { outcome: { reason: "solved", assistance: "worked_example" }, acts: [OPEN, "example_step", "example_step", "example_step", "try_target", "accept_answer", "ask_write", "close"], counts: { refusals: 0 } },
  },
  // J06 (#698 practice, wave-a-brief): an early, own-words right step is acknowledged and not asked again; a question
  // about the current step gets a code-written answer before going on. Both on the credit rules of #698, unchanged.
  {
    id: "W6b", title: "352418 + 41275, J06: the ones given early in the child's own words ('I wrote 3 and carried 1.') is acknowledged once and never asked again", fixture: "W6", status: "passing",
    steps: [
      child("I wrote 3 and carried 1.", { start: "has_work", answers: [[3, "ones", "right"]] }, next("tens")),
      child("1 plus 7 plus 1 is 9.", { answers: [[9, "tens", "right"]] }, next("hundreds")),
      child("4 plus 2 is 6.", { answers: [[6, "hundreds", "right"]] }, next("thousands")),
      child("2 plus 1 is 3.", { answers: [[3, "thousands", "right"]] }, next("ten thousands")),
      child("5 plus 4 is 9.", { answers: [[9, "ten thousands", "right"]] }, next("hundred thousands")),
      child("3 hundred thousands, so 393693.", { answers: [[393693, "result", "right"]] }),
      ...solvedEnd,
    ],
    expect: { outcome: { reason: "solved" }, acts: [OPEN, "guide", "guide", "guide", "guide", "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0, confirmations: 0 } },
  },
  {
    id: "W6c", title: "352418 + 41275, J06: 'Why does the 1 go to the tens?' gets the code-written answer (where the carried ten comes from), then the tens", fixture: "W6", status: "passing",
    steps: [
      child("8 plus 5 is 13.", { start: "has_work", answers: [[13, "ones", "right"]] }, next("tens")),
      child("Why does the 1 go to the tens?", { help: "more" }, [{ act: "guide", step: "tens", level: 1, lines: ["step.regroup"] }]),
      child("1 plus 7 plus 1 is 9.", { answers: [[9, "tens", "right"]] }, next("hundreds")),
      child("4 plus 2 is 6.", { answers: [[6, "hundreds", "right"]] }, next("thousands")),
      child("2 plus 1 is 3.", { answers: [[3, "thousands", "right"]] }, next("ten thousands")),
      child("5 plus 4 is 9.", { answers: [[9, "ten thousands", "right"]] }, next("hundred thousands")),
      child("3 hundred thousands, so 393693.", { answers: [[393693, "result", "right"]] }),
      ...solvedEnd,
    ],
    expect: { outcome: { reason: "solved", assistance: "hint" }, acts: [OPEN, "guide", "guide", "guide", "guide", "guide", "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0 } },
  },
  {
    id: "W5d", title: "10000 − 3615, J06: 'Why do I have to regroup?' on the ones gets the code-written answer; the full sentence '10000 minus 3615 is 6385.' is confirmed once, then accepted", fixture: "W5", status: "passing",
    steps: [
      child("I got 7615.", { start: "has_work", answers: [[7615, "result", "wrong"]] }, [{ act: "guide", step: "ones", level: 1 }]),
      child("Why do I have to regroup?", { help: "more" }, [{ act: "guide", step: "ones", level: 2, lines: ["step.regroup"] }]),
      child("10 take away 5 is 5.", { answers: [[5, "ones", "right"]] }, next("tens")),
      child("9 take away 1 is 8.", { answers: [[8, "tens", "right"]] }, next("hundreds")),
      child("9 take away 6 is 3.", { answers: [[3, "hundreds", "right"]] }, next("thousands")),
      // A subtraction said in full ("minus") is read as not sure, as for 52 − 28: one confirm, then a yes accepts it.
      child("10000 minus 3615 is 6385.", undefined, [{ act: "confirm", heard: "6385" }]),
      child("Yes.", { answers: [[6385, "result", "right"]] }),
      ...solvedEnd,
    ],
    expect: { outcome: { reason: "solved", assistance: "hint", highestHint: 2 }, acts: [OPEN, "guide", "guide", "guide", "guide", "guide", "confirm", "accept_answer", "ask_write", "close"], counts: { refusals: 0, confirmations: 1 } },
  },
  {
    id: "W3a", title: "284 × 7 'Each crate has' story, says 1488 (drops the carries): each row digit with its carry is guided", fixture: "W3", status: "passing",
    steps: [
      child("I got 1488.", { start: "has_work", answers: [[1488, "result", "wrong"]] }, [{ act: "guide", step: "r1-ones", level: 1 }]),
      child("4 times 7 is 28.", { answers: [[28, "r1-ones", "right"]] }, next("r1-tens")),
      child("8 times 7 plus 2 is 58.", { answers: [[58, "r1-tens", "right"]] }, next("r1-hundreds")),
      child("2 times 7 plus 5 is 19, so 1988.", { answers: [[19, "r1-hundreds", "right"], [1988, "result", "right"]] }),
      ...solvedEnd,
    ],
    expect: { outcome: { reason: "solved", assistance: "hint", highestHint: 1 }, acts: [OPEN, "guide", "guide", "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0 } },
  },
  {
    id: "W6a", title: "352418 + 41275: a 6-digit sum, column by column to the hundred thousands, with the question's six columns on the board; '3 hundred thousands' is a column, not 300", fixture: "W6", status: "passing",
    steps: [
      child("8 plus 5 is 13.", { start: "has_work", answers: [[13, "ones", "right"]] }, [{ ...next("tens")[0], draw: ["question.columns"] }]),
      child("1 plus 7 plus 1 is 9.", { answers: [[9, "tens", "right"]] }, next("hundreds")),
      child("4 plus 2 is 6.", { answers: [[6, "hundreds", "right"]] }, next("thousands")),
      child("2 plus 1 is 3.", { answers: [[3, "thousands", "right"]] }, next("ten thousands")),
      child("5 plus 4 is 9.", { answers: [[9, "ten thousands", "right"]] }, next("hundred thousands")),
      child("3 hundred thousands, so 393693.", { answers: [[393693, "result", "right"]] }),
      ...solvedEnd,
    ],
    expect: { outcome: { reason: "solved" }, acts: [OPEN, "guide", "guide", "guide", "guide", "guide", "accept_answer", "ask_write", "close"], counts: { refusals: 0, boardBatches: 1 } },
  },
];
