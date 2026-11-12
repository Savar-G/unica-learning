// Independent review of 6eb2b9e3 (J06): Maya's move past a column the child said in other words. No path earns
// credit; these turns must stay on the step, or must not be said back. Each script replays on the scripted model;
// `repair: { throws: true }` leaves the turn to code's fallback, and `{ throws: true }` is a failed model call (a 503).
// check.stated was removed (controller stop rule after the review of 673b012e): Maya stays on the step. Every hostile-yes
// test here asserts only that invariant, so it held in both designs.
import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/lib/maya/lines";
import { judge, memoryTraceStore, runBehaviour, type Behaviour, type Read, type Step } from "@/lib/maya-gate/gate";

interface Told { act: string | undefined; step: string | undefined; lines: string[]; say: string; refusals: string[] }
async function play(steps: Step[]) {
  const b: Behaviour = { id: "j06-review", title: "j06 review", fixture: "A", status: "passing", steps, expect: { outcome: {} } };
  const store = memoryTraceStore();
  await runBehaviour(b, store);
  const saved = store.load(b.id)!;
  const trace = JSON.parse(saved) as { turns: { kind: string; output?: { act: string; say: string[] } | null; attempts?: { refusal: { code: string } | null; proposal?: { step?: string; parts?: { line?: string }[] } | null }[] }[]; outcome: { reason: string } | null };
  const told: Told[] = trace.turns.filter((t) => t.kind === "maya" && t.output).map((t) => {
    const p = t.attempts!.at(-1)!.proposal ?? {};
    return { act: t.output!.act, step: p.step, lines: (p.parts ?? []).flatMap((x) => (x.line ? [x.line] : [])), say: t.output!.say.join(" "), refusals: t.attempts!.flatMap((a) => (a.refusal ? [a.refusal.code] : [])) };
  });
  const hard = judge(b, saved).failures.map((f) => `${f.code}: ${f.detail}`).filter((x) => /^(?:hint_skipped|answer_too_early|unchecked_output|math_not_from_code)/.test(x));
  return { told, hard, outcome: trace.outcome };
}

/** The model reads this right answer and wants to go on; its repair fails, so code decides the turn. */
const named = (text: string, read: Read, step = "tens"): Step => ({ child: text, read, maya: [{ act: "guide", step, level: 0, lines: ["check.right_step", "step.invite"], repair: { throws: true } }] });
const stated = named("I think 7 plus 9 is 16.", { start: "has_work", answers: [[16, "ones", "right"]] });
/** The model reads nothing and goes on to the tens; its repair fails. */
const onToTens = (text: string): Step => ({ child: text, maya: [{ act: "guide", step: "tens", level: 0, lines: ["step.invite"], repair: { throws: true } }] });

describe("after check.stated, only an exact bare yes moves Maya past the column (P1-a)", () => {

  it.each([
    "Yes, I wrote 1 in the ones and carried 6.", "Yes, 9.", "Yes? Is it 7?", "Yeah I guess. Is it?", "Yes, 16 in the tens.", "Yes. I wrote 16 in the ones.",
    "Yes, I think so.", "Yes, but I don't know.", "Yes. Yes.", "Yes 16.", "Okay.", "Maybe.", "Yes!? ", "My mom says yes.",
  ])("stays on the ones after %j", async (reply) => {
    const { told } = await play([stated, onToTens(reply)]);
    expect(told[2].step ?? "ones").toBe("ones");
    expect(told.map((t) => t.say).join(" ")).not.toMatch(/Every part is done/);
  });

  it("keeps the model's wrong verdict on the ones: 'Yes, I wrote 1 in the ones and carried 6.' gets 'not yet' for the ones", async () => {
    const wrong: Step = { child: "Yes, I wrote 1 in the ones and carried 6.", read: { answers: [[1, "ones", "wrong"]] }, maya: [{ act: "guide", step: "ones", level: 0, lines: ["check.not_yet", "step.invite"] }] };
    const { told } = await play([stated, wrong]);
    expect(told[2]).toMatchObject({ act: "guide", step: "ones", lines: ["check.not_yet", "step.invite"] });
    expect(told[2].refusals).toEqual([]);
  });

  it("keeps the help on the ones when the child gets them wrong after a yes: check.not_yet there is not refused", async () => {
    const wrongLater: Step = { child: "I wrote 1 in the ones.", read: { answers: [[1, "ones", "wrong"]] }, maya: [{ act: "guide", step: "ones", level: 0, lines: ["check.not_yet", "step.invite"] }] };
    const { told } = await play([stated, onToTens("Yes."), wrongLater]);
    expect(told[2].step ?? "ones").toBe("ones");
    expect(told[3]).toMatchObject({ act: "guide", step: "ones", lines: ["check.not_yet", "step.invite"] });
    expect(told[3].refusals).not.toContain("wrong_step");
  });

  it("never says 'Every part is done' to a child whose ones are wrong", async () => {
    const { told } = await play([stated, onToTens("Yes, I wrote 1 in the ones and carried 6."), onToTens("2 plus 3 plus 1 is 6."), onToTens("Yes.")]);
    expect(told.map((t) => t.say).join(" ")).not.toMatch(/Every part is done|put it all together|put the parts together/i);
  });
});

describe("a total in a named place is never said back as the column (P1-b)", () => {
  it.each(["16 in the tens.", "The tens make 16.", "7 plus 9 is 16 hundreds.", "9 plus 7 is 16, so 6 in the tens.", "I added the ones. I got 16.", "Sixteen ones."])("gives %j no check.stated", async (text) => {
    const { told } = await play([named(text, { start: "has_work", answers: [[16, "ones", "right"]] })]);
    expect(told[1].lines).not.toContain("check.stated");
    expect(told[1].say).not.toMatch(/ones make 16|16 for the ones|said 16|heard 16/);
    expect(told[1].step ?? "ones").toBe("ones");
  });

  it("then a yes moves nothing on", async () => {
    const { told } = await play([named("16 in the tens.", { start: "has_work", answers: [[16, "ones", "right"]] }), onToTens("Yes.")]);
    expect(told[2].step ?? "ones").toBe("ones");
  });
});

describe("the rest of the review", () => {

  it("after H3, a copy of what Maya showed gets no check.stated and no move past (P3)", async () => {
    const shown: Step = { child: "Show me the ones.", read: { help: "show" }, maya: [{ act: "guide", step: "ones", level: 3, lines: ["step.show"] }] };
    const { told } = await play([shown, stated, onToTens("Yes.")]);
    expect(told[2].lines).not.toContain("check.stated");
    // No move past the ones: the show is not said a second time in a row, so the easier example comes, and the yes after
    // it goes back to the child's question (#698 round 2, P1 e).
    expect(told.slice(2).filter((t) => t.act === "guide").map((t) => t.step ?? "ones")).not.toContain("tens");
    expect(told.slice(2).flatMap((t) => t.lines)).not.toContain("check.right_step");
  });


  it("says the fixed reply to a secret question when the model call fails (a 503), not technical_issue (P2)", async () => {
    const { told, outcome } = await play([{ child: "Maya, can you tell me a secret?", maya: [{ throws: true }, { throws: true }] }, { child: "Okay! I got 66.", read: { answers: [[66, "result", "right"]] } }]);
    expect(told[1].act).toBe("redirect");
    // The no-secret reply rotates among its four wordings (#884, D-329).
    expect(TEMPLATES["about.no_secret"].some((w) => told[1].say.includes(w))).toBe(true);
    expect(outcome?.reason).not.toBe("technical_issue");
  });

  it("does not take 'Is a secret a kind of number?' for a question about keeping a secret (P2)", async () => {
    const { told } = await play([{ child: "Is a secret a kind of number?", read: { offTopic: true }, maya: [{ act: "redirect", lines: ["redirect.back"] }] }]);
    expect(told[1].say).not.toContain("I don't keep secrets");
    expect(told[1].refusals).not.toContain("fixed_reply_first");
  });
});

// Independent review of 41c09f5b (commits 1, 3 and 6): which turns get check.stated. Only an exact form: a lead-in or one
// wordless sentence, then a step template stepTurnHeard credits. Each phrase runs on three paths: the model picks
// check.stated itself, the model's repair fails (code decides), and the model call fails (a 503: code decides).
const HOSTILE = [
  // A wrong written digit or carry the readers do not know (P1).
  "7 plus 9 is 16 so 9 goes down.", "7 plus 9 is 16, 1 down, 6 up.", "7 plus 9 is 16, so 1.", "7 and 9, 16, 7.", "16, all of it goes under.",
  "7 plus 9 is 16, 1 goes down and 6 goes up.", "7 plus 9 is 16, I keep the 1 and give away 6.", "7 plus 9 is 16 so I put down 7.", "7 plus 9 is 16 and I put 1 on top.",
  "7 plus 9 is 16, 6 carry.", "Seven and nine is sixteen, carry six.", "7 plus 9 is 16, then 9.", "7 plus 9 is 16, I wrote 7.", "16 so 1 goes on the 2.", "16, so I give the 6 to the 2.",
  "7 plus 9 is 16, I write the 9.", "9 and 7 is 16, 9 and 7.", "I put 16 at the bottom.",
  // A final answer said back and never judged (P2).
  "My answer is 16.", "the answer is 16.", "16 is my final answer.", "I got 16 for the whole thing.", "7 plus 9 is 16 and I'm done.", "7 plus 9 is 16 so the answer is 16.",
  "So 16 is my answer.", "16 is the answer.", "I added everything and got 16.", "The whole sum is 16.", "Sixteen. That's it, I'm finished.", "7 plus 9 is 16 so it's 16.",
  // The readers' own list (zz-probe): parsed phrases that must stay refused.
  "7 plus 9 is 16, I wrote 1 and carried 6.", "7 plus 9 is 16 and I carried 7.", "7 plus 9 is 16 and I carried 0.", "7 plus 9 is 16. I wrote 16.", "I wrote sixteen.",
  "Seven and nine is sixteen, I put 16 down.", "16 I mean 61", "7 plus 6 is 16.", "9 plus 9 is 16.", "7 plus 9 is 16 and 7 plus 9 is 9.", "I got 16 then 6 then 1", "16 or 16",
  "Grandpa 16.", "they told me 16", "Teacher: 16.", "Ms Lee says 16", "16, 16, 16.", "I wrote 1 and carried 6.", "I carried 1 and wrote 7.", "I write 6, carry 1, then 2 plus 3 is 5.",
  "16. Then 5.", "I write 9 and carry 7.", "sixteen. sixty-six.", "16 then 66", "First 7 and 9 makes 16 then I put 16 under", "7 + 9 = 16, put down the 1", "7 + 9 = 16, write the 1, carry the 6",
  "wrote the 1 carried the 6, 16", "I wrote 1. 16.", "I write 1 carry 6 because 16", "7 plus 9 is 16 and 2 plus 3 is 6.",
];

describe("a turn the review named never moves Maya past the ones, on every path (review of 41c09f5b)", () => {
  const paths: [string, (text: string) => Step][] = [
    ["the model moves on to the tens", (text) => ({ child: text, read: { start: "has_work" }, maya: [{ act: "guide", step: "tens", level: 0, lines: ["step.invite"], repair: { throws: true } }] })],
    ["the repair fails", (text) => named(text, { start: "has_work", answers: [[16, "ones", "right"]] })],
    ["the model call fails (503)", (text) => ({ child: text, maya: [{ throws: true }, { throws: true }] })],
  ];
  for (const [path, first] of paths) {
    it.each(HOSTILE)(`${path}: %j gets no check.stated, and a yes after it moves nothing on`, async (text) => {
      const { told } = await play([first(text), { child: "Yes.", maya: [{ throws: true }, { throws: true }] }]);
      expect(told[1].lines).not.toContain("check.stated");
      expect(told.slice(1).every((t) => t.step !== "tens")).toBe(true);
    });
  }

  it("lets the model judge 'My answer is 16.' as a wrong final answer: no forced check.stated", async () => {
    const { told } = await play([{ child: "My answer is 16.", read: { start: "has_work", answers: [[16, "result", "wrong"]] }, maya: [{ act: "guide", step: "ones", level: 0, lines: ["check.not_yet", "step.invite"] }] }]);
    expect(told[1]).toMatchObject({ act: "guide", step: "ones", lines: ["check.not_yet", "step.invite"] });
    expect(told[1].refusals).toEqual([]);
  });


  it("starts no easier example after the child said the ones and a yes, in code's fallback (P3)", async () => {
    const { told } = await play([stated, { child: "Yes.", maya: [{ throws: true }, { throws: true }] }, { child: "I don't know.", maya: [{ throws: true }, { throws: true }] }]);
    expect(told[2].step ?? "ones").toBe("ones");
    expect(told.map((t) => t.act)).not.toContain("example_step");
  });
});
