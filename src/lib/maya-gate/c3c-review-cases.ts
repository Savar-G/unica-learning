// Gate cases from the review of #742 (C3c) on the compare claims MARBLES and AREA_TF: a wrong word with the model down,
// before and after the easier example (P1-a); another person's or a copied ", so" answer with a model that proposes
// accept (P1-b); and the other area's own product in the child's words (P1-c). Added to BEHAVIOURS (behaviours.ts).
import type { HintLevel } from "@/lib/maya";
import type { Behaviour, Plan, Step } from "./gate";

const OPEN = "open" as const;
const child = (text: string, read?: Extract<Step, { child: string }>["read"], maya?: Plan[]): Step => ({ child: text, ...(read ? { read } : {}), ...(maya ? { maya } : {}) });
/** The model is down: every request throws, so code's own fallbacks speak. */
const DOWN: Plan[] = [{ throws: true }];
const guideAt = (level: HintLevel) => child("I'm stuck.", { help: "more" }, [{ act: "guide", level }]);

/** Each compare claim: the wrong word, the right word, its id, and its easier example's turns (5 × 2 = 10 has a carry). */
const CLAIMS = [["MARBLES", "true", "false", "K6", 3], ["AREA_TF", "false", "true", "K7", 4]] as const;
const example = (n: number) => Array.from({ length: n }, () => "example_step" as const);

export const C3C_REVIEW_BEHAVIOURS: Behaviour[] = [
  {
    id: "OTCLOCKCOPY", title: "A clock count copied after H3 is not credited", fixture: "CLOCK_REVIEW", status: "passing",
    steps: [guideAt(0), guideAt(1), guideAt(2), child("46.", { answers: [[46, "to-hour", "wrong"]] }, [{ act: "guide", level: 3, lines: ["check.not_yet", "step.show"] }]),
      child("47.", { answers: [[47, "to-hour", "right"]] }, [{ act: "guide", level: 0 }]),
      child("Can we stop now?", { stop: true })],
    expect: { outcome: { reason: "child_stopped" }, refused: ["answer_not_committed"], never: ["give_answer", "accept_answer"] },
  },
  {
    id: "OTAREA8", title: "The other area's 4 times 2 is in scope", fixture: "AREA_REVIEW", status: "passing",
    steps: [child("4 times 2 is 8.", { start: "has_work" }, [{ act: "guide", level: 0 }]), child("Can we stop now?", { stop: true })],
    expect: { outcome: { reason: "child_stopped" }, never: ["redirect", "give_answer"] },
  },
  ...CLAIMS.flatMap(([fixture, wrong, , id, turns]): Behaviour[] => [
    {
      id: `OT${id}a`,
      title: `${fixture}, the model down: a wrong word ("It's ${wrong}.") right after the easier example gets the claim's question again, then "I'm stuck." gets the honest close, never the answer (review of #742, P1-a)`,
      fixture,
      status: "passing",
      steps: [child("I'm stuck.", undefined, DOWN), child(`It's ${wrong}.`, undefined, DOWN), child("I'm stuck.", undefined, DOWN)],
      expect: {
        outcome: { reason: "maya_closed" },
        acts: [OPEN, ...example(turns), "try_target", "close"],
        never: ["give_answer", "accept_answer"],
      },
    },
    {
      id: `OT${id}b`,
      title: `${fixture}: the model guides to the top hint, then is down; a wrong word ("It's ${wrong}.") before the easier example gets help, then the example and the honest close, never the answer (review of #742, P1-a)`,
      fixture,
      status: "passing",
      steps: [guideAt(0), guideAt(1), guideAt(2), child(`It's ${wrong}.`, undefined, DOWN), child("I'm stuck.", undefined, DOWN), child("I'm stuck.", undefined, DOWN)],
      expect: {
        outcome: { reason: "maya_closed" },
        acts: [OPEN, "guide", "guide", "guide", "guide", ...example(turns), "close"],
        never: ["give_answer", "accept_answer"],
      },
    },
  ]),
  // P1-b: what comes before ", so" is the child's own work or nothing. A model that proposes accept, and a confirm in
  // repair, never makes another person's word or a copy the answer.
  ...CLAIMS.flatMap(([fixture, , right, id]) => [`My mom said, so it's ${right}.`, `I copied it, so it's ${right}.`].map((said, i): Behaviour => ({
    id: `OT${id}${"cd"[i]}`,
    title: `${fixture}: '${said}' is no answer, whatever the model proposes (review of #742, P1-b)`,
    fixture,
    status: "passing",
    steps: [
      child(said, { start: "has_work" }, [{ act: "accept_answer", repair: { act: "confirm" } }]),
      child("Yes.", undefined, [{ act: "accept_answer", repair: { act: "confirm" } }]),
      child("Can we stop now?", { stop: true }),
    ],
    expect: { outcome: { reason: "child_stopped" }, refused: ["accepts_wrong_answer"], never: ["accept_answer", "give_answer"] },
  }))),
  // P1-c: the topic sentence says "4 by 4 squares is 16 squares"; the child's own "4 times 4 is 16." is on the question.
  {
    id: "OTK8",
    title: "AREA_TF: '4 times 4 is 16.' (the other area, which the topic sentence names) stays on the question, then the claim is solved (review of #742, P1-c)",
    fixture: "AREA_TF",
    status: "passing",
    steps: [
      child("4 times 4 is 16.", { start: "has_work" }, [{ act: "guide", level: 0, lines: ["step.invite"] }]),
      child("6 times 3 is 18.", { answers: [[18, "claim", "right"]] }, [{ act: "guide", level: 0, step: "result", lines: ["check.right_step", "step.invite"] }]),
      child("It's true.", undefined, [{ act: "accept_answer" }]),
      child("Okay.", undefined, [{ act: "ask_write", lines: ["write.answer"] }]),
      child("I circled it.", { paper: "written" }),
    ],
    expect: { outcome: { reason: "solved" }, never: ["redirect", "give_answer"] },
  },
];
