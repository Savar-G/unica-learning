// Gate cases from the re-review of #741 (C3b) on the scale, minute-hand and money claims: another person's or a copied
// ", so" answer with a model that proposes accept or a confirm (P1-1), and a wrong word right after the easier example,
// with the model down and with a model that proposes "not yet" and the question, at grades 3, 4 and 5 (P1-2). Added to
// BEHAVIOURS (behaviours.ts); c3b-review-cases.test.ts runs them on their own.
import type { Act } from "@/lib/maya";
import type { Behaviour, Plan, Step } from "./gate";

const OPEN = "open" as const;

const child = (text: string, read?: Extract<Step, { child: string }>["read"], maya?: Plan[]): Step => ({ child: text, ...(read ? { read } : {}), ...(maya ? { maya } : {}) });
/** The model is down: every request throws, so code's own fallbacks speak. */
const DOWN: Plan[] = [{ throws: true }];
const stuck = (maya: Plan[]) => child("I'm stuck.", { help: "more" }, maya);

/** Each claim: its fixture, its id letter, the total code works out, and a wrong number. Every one of them holds (true). */
const CLAIMS = [["SCALE", "S", "80", "6800"], ["MINUTE", "M", "38", "380"], ["MONEY", "Y", "40.75", "4075"]] as const;

export const C3B_REVIEW_BEHAVIOURS: Behaviour[] = [
  // P1-1: what comes before ", so" is the child's own work. A speaker ("My mom said"), a copy ("I copied") or a wrong
  // number never makes the word the child's answer, whatever the model proposes.
  ...CLAIMS.flatMap(([fixture, letter, total, wrongTotal]) => [
    `My mom said ${total}, so it's true.`, `I copied ${total}, so it's true.`, `Mom says ${total}, so true.`, `My mom said ${wrongTotal}, so it's true.`,
  ].flatMap((said, i) => (["accept_answer", "confirm"] as const).map((act, j): Behaviour => ({
    id: `OTR${letter}${i + 1}${"ac"[j]}`,
    title: `${fixture}: '${said}' is no answer, with a model that proposes ${act === "confirm" ? "a confirm" : "accept"} (re-review of #741, P1-1)`,
    fixture,
    status: "passing",
    steps: [
      child(said, { start: "has_work" }, [act === "confirm" ? { act: "confirm", heard: "true" } : { act: "accept_answer", repair: { act: "confirm" } }]),
      child("Yes.", undefined, [{ act: "accept_answer", repair: { act: "confirm" } }]),
      child("Can we stop now?", { stop: true }),
    ],
    expect: { outcome: { reason: "child_stopped" }, counts: { confirmations: 0 }, never: ["accept_answer", "give_answer"] },
  })))),
  // P1-2: the easier example, then "It's false." for a true claim: Maya answers it (the claim's question, never the
  // answer), and the next "I'm stuck." gets the honest close. Never a call with no safe line. "d": the model is down from
  // the start, so code shows the example at the first "I'm stuck."; "n": the model shows the example, then proposes "not
  // yet" and the question; "g": the model guides to the top hint first. The example is one Maya turn of 5 parts at
  // grade 3 and 4 above.
  ...CLAIMS.flatMap(([fixture, letter]) => [3, 4, 5].flatMap((grade) => {
    const turns = grade === 3 ? 5 : 4;
    const notYet: Plan[] = [{ act: "try_target", lines: ["check.not_yet", "try.target"] }];
    const variants = [
      { kind: "d", what: "the model down", acts: [] as Act[], steps: [stuck(DOWN), child("It's false.", undefined, DOWN)] },
      { kind: "n", what: "a model that shows the example, then proposes not yet and the question", acts: [] as Act[], steps: [
        stuck([{ act: "example_step" }]), child("It's false.", undefined, notYet),
      ] },
      // At grade 3 code shows the example at the first "I'm stuck." (a grade-3 turn has no room for the hints first).
      // MINUTE's first step offers no H1 or H2 line: the model's invite comes twice, and #698's loop guard never lets it
      // come a third time, so the example comes at the third "I'm stuck.".
      ...(grade === 3 ? [] : [{ kind: "g", what: "a model that guides to the top hint first", acts: (fixture === "MINUTE" ? ["guide", "guide"] : ["guide", "guide", "guide"]) as Act[], steps: [
        ...(fixture === "MINUTE" ? [stuck([{ act: "guide", level: 0 }]), stuck([{ act: "guide", level: 0 }])] : [stuck([{ act: "guide", level: 0 }]), stuck([{ act: "guide", level: 1 }]), stuck([{ act: "guide", level: 2 }])]),
        stuck([{ act: "example_step" }]), child("It's false.", undefined, notYet),
      ] }]),
    ];
    return variants.map(({ kind, what, steps, acts }): Behaviour => ({
      id: `OTW${letter}${grade}${kind}`,
      grade,
      title: `${fixture}, grade ${grade}, ${what}: "It's false." right after the easier example gets a line, then "I'm stuck." the honest close (re-review of #741, P1-2)`,
      fixture,
      status: "passing",
      steps: [...steps, child("I'm stuck.", { help: "more" }, DOWN)],
      expect: {
        outcome: { reason: "maya_closed" },
        acts: [OPEN, ...acts, ...Array.from({ length: turns }, () => "example_step" as const), "try_target", "close"],
        never: ["accept_answer", "give_answer"],
      },
    }));
  })),
];
