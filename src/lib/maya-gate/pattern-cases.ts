// Free scripted pattern cases, using the session adapter and synthetic template packages.
import { teachingPackage } from "@/lib/maya-teaching";
import { printedPattern } from "@/lib/maya-teaching/pattern-fixtures";
import { packageLines } from "@/lib/maya/lines";
import type { OperationPackage } from "@/lib/question-package";
import type { Behaviour, Read, Step, Plan } from "./gate";

export const PATTERN_FIXTURES = {
  PT_MISSING: teachingPackage(printedPattern("missing3")) as OperationPackage,
  PT_TERM: teachingPackage(printedPattern("term4", 20, 8)) as OperationPackage,
  PT_LONG: teachingPackage(printedPattern("missing9", 35, 10)) as OperationPackage,
  PT_PAIR: teachingPackage(printedPattern("pair", 34, 9)) as OperationPackage,
  PT_STORY: teachingPackage(printedPattern("days8", 32, 9)) as OperationPackage,
};
export type PatternFixtureId = keyof typeof PATTERN_FIXTURES;
const child = (child: string, read?: Read, maya?: Plan[]): Step => ({ child, read, maya });
/** "I'm stuck." n times; the model fails each time, so code's fallback raises the help one level a turn. */
const stuck = (n: number): Step[] => Array.from({ length: n }, () => child("I'm stuck.", { help: "more" }, [{ throws: true }]));
/** A wrong answer the model reads, with a guide the controller refuses; its repair fails too (the shape of #740's review). */
const wrongRefused = (value: number, step: string): Step => child(String(value), { answers: [[value, step, "wrong"]] }, [{
  act: "guide", repair: { throws: true },
  raw: {
    version: 2, act: "guide", step, level: 2, reading: { answers: [{ value: { type: "number", value }, step, verdict: "wrong" }] },
    parts: [{ line: "check.not_yet", slots: { step, heard: String(value) } }],
  },
}]);
/** The first step said right, with a failing model (code's own whole-turn reading credits it). */
const firstRight: Step = child("40 minus 26 is 14.", { start: "has_work", answers: [[14, "e1", "right"]] }, [{ throws: true }]);
/** A model that proposes credit on every turn: the step done (or the answer accepted) for the number in the turn. */
const greedy = (text: string, value: number, step: string, read: Read = {}): Step => child(text, { ...read, answers: [[value, step, "right"]] },
  [step === "result" ? { act: "accept_answer", lines: ["answer.right"] } : { act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]);
const EXAMPLE_THEN_CLOSE = ["example_step", "example_step", "example_step", "example_step", "close"] as const;
const end: Step[] = [child("Okay.", undefined, [{ act: "ask_write", understanding: "uncertain" }]), child("I wrote it.", { paper: "written" })];
const missing = packageLines(PATTERN_FIXTURES.PT_MISSING);
const term = packageLines(PATTERN_FIXTURES.PT_TERM);
const texts = (line: string) => missing.help("e1").filter(o => o.line === line).flatMap(o => o.texts);

export const PATTERN_BEHAVIOURS: Behaviour[] = [
  {
    id: "PT1", title: "J06: an early correct pattern increase is acknowledged and not repeated", fixture: "PT_MISSING", status: "passing", grade: 3,
    steps: [child("40 minus 26 is 14.", { start: "has_work", answers: [[14, "e1", "right"]] },
      [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"], draw: ["question.pattern"] }]),
      child("14 divided by 2 is 7.", { answers: [[7, "result", "right"]] }), ...end],
    expect: { outcome: { reason: "solved", assistance: "independent" }, counts: { refusals: 0 },
      acts: ["open", "guide", "accept_answer", "ask_write", "close"],
      outputs: [{ mayaTurn: 1, lines: [missing.rightStep("e1").flatMap(o => o.texts), missing.help("result").flatMap(o => o.texts)] }] },
  },
  {
    id: "PT2", title: "J06: why subtract the start gets a checked pattern explanation", fixture: "PT_MISSING", status: "passing", grade: 3,
    steps: [child("Why do I subtract the start?", undefined, [{ act: "guide", step: "e1", level: 1, lines: ["step.why"] }]),
      child("40 minus 26 is 14.", { answers: [[14, "e1", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("7", { answers: [[7, "result", "right"]] }), ...end],
    expect: { outcome: { reason: "solved", assistance: "hint" }, counts: { refusals: 0 }, outputs: [{ mayaTurn: 1, lines: [texts("step.why")] }] },
  },
  {
    id: "PT3", title: "Grade 3 starts stuck: same-shape pattern example, then the target", fixture: "PT_LONG", status: "passing", grade: 3,
    steps: [child("I'm stuck.", { start: "no_start" }, [{ act: "example_step", draw: ["example.pattern"] }]),
      child("Okay.", undefined, [{ act: "try_target" }]),
      child("115 minus 35 is 80.", { answers: [[80, "e1", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("80 divided by 8 is 10.", { answers: [[10, "result", "right"]] }), ...end],
    expect: { outcome: { reason: "solved", assistance: "worked_example" }, counts: { refusals: 0 } },
  },
  {
    id: "PT4", title: "Forward additions in full sentences remain in scope", fixture: "PT_TERM", status: "passing", grade: 3,
    steps: [child("20 plus 8 is 28.", undefined, [{ act: "guide", step: "e1", level: 0, draw: ["question.pattern"] }]),
      child("3 times 8 is 24.", { answers: [[24, "e1", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("20 plus 24 is 44.", { answers: [[44, "result", "right"]] }, [{ act: "accept_answer", draw: ["question.pattern"] }]), ...end],
    expect: { outcome: { reason: "solved" }, counts: { refusals: 0 }, never: ["redirect", "give_answer"] },
  },
  {
    id: "PT5", title: "Eighth and second terms are found separately before adding", fixture: "PT_PAIR", status: "passing", grade: 3,
    steps: [child("7 times 9 is 63.", { start: "has_work", answers: [[63, "e1", "right"]] }, [{ act: "guide", step: "e2", level: 0, lines: ["check.right_step", "step.invite"], draw: ["question.pattern"] }]),
      child("34 plus 63 is 97.", { answers: [[97, "e2", "right"]] }, [{ act: "guide", step: "e3", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("34 plus 9 is 43.", { answers: [[43, "e3", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("97 plus 43 is 140.", { answers: [[140, "result", "right"]] }), ...end],
    expect: { outcome: { reason: "solved" }, counts: { refusals: 0 }, never: ["give_answer"] },
  },
  {
    id: "PT6", title: "A daily increase counts from day zero", fixture: "PT_STORY", status: "passing", grade: 3,
    steps: [child("8 times 9 is 72.", { start: "has_work", answers: [[72, "e1", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"], draw: ["question.pattern"] }]),
      child("32 plus 72 is 104.", { answers: [[104, "result", "right"]] }, [{ act: "accept_answer", draw: ["question.pattern"] }]), ...end],
    expect: { outcome: { reason: "solved" }, counts: { refusals: 0 }, never: ["give_answer"] },
  },
  {
    id: "PT7", title: "Grade 3, 'I'm stuck.' first: the first hint (H1) says why the fourth term takes three steps", fixture: "PT_TERM", status: "passing", grade: 3,
    steps: [child("I'm stuck.", { start: "has_work", help: "more" }, [{ act: "guide", step: "e1", level: 1, lines: ["step.point"] }]),
      child("3 times 8 is 24.", { answers: [[24, "e1", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("44", { answers: [[44, "result", "right"]] }), ...end],
    expect: { outcome: { reason: "solved", assistance: "hint", highestHint: 1 }, counts: { refusals: 0 },
      outputs: [{ mayaTurn: 1, lines: [term.help("e1").filter(o => o.line === "step.point").flatMap(o => o.texts)] }], never: ["give_answer"] },
  },
  {
    id: "PT8", title: "Stuck on the last part: H1 is its multiplication fact, H2 counts by the divisor, never the answer; then a kind close", fixture: "PT_MISSING", status: "passing", grade: 3,
    steps: [child("40 minus 26 is 14.", { start: "has_work", answers: [[14, "e1", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("I'm stuck.", { help: "more" }, [{ act: "guide", step: "result", level: 1, lines: ["step.point"] }]),
      child("2 times 7 is 14, so 7.", { answers: [[7, "result", "right"]] }), ...end],
    expect: { outcome: { reason: "solved", assistance: "hint", highestHint: 1 }, counts: { refusals: 0 }, never: ["give_answer"],
      outputs: [{ mayaTurn: 2, lines: [missing.help("result").filter(o => o.line === "step.point").flatMap(o => o.texts)] }] },
  },
  {
    id: "PT8b", title: "Still stuck at H2 on the last part: counts by the divisor, then the child stops: an honest close, no answer", fixture: "PT_MISSING", status: "passing", grade: 3,
    steps: [child("40 minus 26 is 14.", { start: "has_work", answers: [[14, "e1", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("I'm stuck.", { help: "more" }, [{ act: "guide", step: "result", level: 1, lines: ["step.point"] }]),
      child("I'm still stuck.", { help: "more" }, [{ act: "guide", step: "result", level: 2, lines: ["step.operation"] }]),
      child("I want to stop.", { stop: true })],
    expect: { outcome: { reason: "child_stopped", assistance: "hint", highestHint: 2 }, counts: { refusals: 0 }, never: ["give_answer", "accept_answer"],
      acts: ["open", "guide", "guide", "guide", "close"],
      outputs: [{ mayaTurn: 3, lines: [missing.help("result").filter(o => o.line === "step.operation").flatMap(o => o.texts)] }] },
  },
  // ---------- The way out with a model that fails (lessons 7 and 10; the shape of 921ab669) ----------
  {
    id: "PT10", title: "Model failing: a wrong answer at the first part's top help (H3): the easier pattern, then on another wrong answer the honest close", fixture: "PT_MISSING", status: "passing", grade: 3,
    steps: [...stuck(4), wrongRefused(15, "e1"), wrongRefused(15, "e1")],
    expect: { outcome: { reason: "maya_closed", highestHint: 3 }, never: ["give_answer", "accept_answer"],
      acts: ["open", "guide", "guide", "guide", "guide", ...EXAMPLE_THEN_CLOSE] },
  },
  {
    id: "PT11", title: "Model failing: a wrong answer at the last part's top help (H2): the easier pattern, then the honest close", fixture: "PT_MISSING", status: "passing", grade: 3,
    steps: [firstRight, ...stuck(2), wrongRefused(8, "result"), wrongRefused(8, "result")],
    expect: { outcome: { reason: "maya_closed", assistance: "worked_example", highestHint: 2 }, never: ["give_answer", "accept_answer"],
      acts: ["open", "guide", "guide", "guide", ...EXAMPLE_THEN_CLOSE] },
  },
  {
    id: "PT12", title: "Model failing: 'I'm stuck.' on every hint of the last part: H1, H2, the easier pattern, then the honest close", fixture: "PT_MISSING", status: "passing", grade: 3,
    steps: [firstRight, ...stuck(4)],
    expect: { outcome: { reason: "maya_closed", assistance: "worked_example", highestHint: 2 }, never: ["give_answer", "accept_answer"],
      acts: ["open", "guide", "guide", "guide", ...EXAMPLE_THEN_CLOSE] },
  },
  {
    id: "PT13", title: "Lesson 13: '14.' only copies what H3 showed: no credit and no miss; give_answer is refused there and on the next 'Okay.'", fixture: "PT_MISSING", status: "passing", grade: 3,
    steps: [...stuck(4), child("14.", undefined, [{ act: "give_answer" }]), child("Okay.", undefined, [{ act: "give_answer" }])],
    expect: { outcome: {}, refused: ["act_not_allowed", "act_not_allowed"], never: ["give_answer", "accept_answer"],
      acts: ["open", "guide", "guide", "guide", "guide", "example_step", "example_step", "example_step", "example_step", "try_target"] },
  },
  {
    id: "PT14", title: "Lessons 5, 6 and 13, model proposing credit every turn: 'Yes.' first, 'My mom said 14.', 'I copied 14.', 'Maybe 14.', 'Is it 14?' credit nothing", fixture: "PT_MISSING", status: "passing", grade: 3,
    steps: [greedy("Yes.", 14, "e1", { start: "has_work" }), greedy("My mom said 14.", 14, "e1"), greedy("I copied 14.", 14, "e1"), greedy("Maybe 14.", 14, "e1"), greedy("Is it 14?", 14, "e1"),
      greedy("My mom said 7.", 7, "result"), greedy("I copied 7.", 7, "result")],
    // Rule D (2026-11-12): "Maybe 14." and "Is it 14?" say the right step held back only by their form, so Maya asks her
    // confirm and the turns count toward no climb; another person's or a copied number gets the step's help as before.
    // Nothing is credited, and no answer is accepted or given.
    expect: { outcome: {}, never: ["accept_answer", "give_answer"],
      acts: ["open", "guide", "guide", "guide", "confirm", "confirm", "guide", "confirm"],
      outputs: [1, 2, 3].map(mayaTurn => ({ mayaTurn, lines: [missing.help("e1").flatMap(o => o.texts)] })) },
  },
  {
    id: "PT9", title: "Hedged and copied steps get no credit: 'Maybe 14.' and 'My mom said 14.'", fixture: "PT_MISSING", status: "passing", grade: 3,
    steps: [child("Maybe 14.", { start: "has_work", unclear: true }),
      child("My mom said 14.", undefined),
      child("40 minus 26 is 14.", { answers: [[14, "e1", "right"]] }, [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }]),
      child("14 divided by 2 is 7.", { answers: [[7, "result", "right"]] }), ...end],
    expect: { outcome: { reason: "solved" }, never: ["give_answer"] },
  },
];
