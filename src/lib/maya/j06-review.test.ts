// Independent review of 6eb2b9e3 (J06): Maya's move past a column the child said in other words. No path earns
// credit; these turns must stay on the step, or must not be said back. Each script replays on the scripted model;
// `repair: { throws: true }` leaves the turn to code's fallback, and `{ throws: true }` is a failed model call (a 503).
import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { judge, memoryTraceStore, runBehaviour, type Behaviour, type Plan, type Read, type Step } from "@/lib/maya-gate/gate";
import { packageLines } from "@/lib/maya/lines";
import type { OperationPackage } from "@/lib/question-package";

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
  it("says check.stated, then a bare yes moves on to the tens", async () => {
    const { told, hard } = await play([stated, onToTens("Yes.")]);
    expect(told[1].lines).toEqual(["check.stated"]);
    expect(told[2]).toMatchObject({ act: "guide", step: "tens" });
    expect(hard).toEqual([]);
  });

  it.each([
    "Yes, I wrote 1 in the ones and carried 6.", "Yes, 9.", "Yes? Is it 7?", "Yeah I guess. Is it?", "Yes, 16 in the tens.", "Yes. I wrote 16 in the ones.",
    "Yes, I think so.", "Yes, but I don't know.", "Yes. Yes.", "Yes 16.", "Okay.", "Maybe.", "Yes!? ", "My mom says yes.",
  ])("stays on the ones after %j", async (reply) => {
    const { told } = await play([stated, onToTens(reply)]);
    expect(told[1].lines).toEqual(["check.stated"]);
    expect(told[2].step ?? "ones").toBe("ones");
    expect(told.map((t) => t.say).join(" ")).not.toMatch(/Every part is done/);
  });

  it("keeps the model's wrong verdict on the ones: 'Yes, I wrote 1 in the ones and carried 6.' gets 'not yet' for the ones", async () => {
    const wrong: Step = { child: "Yes, I wrote 1 in the ones and carried 6.", read: { answers: [[1, "ones", "wrong"]] }, maya: [{ act: "guide", step: "ones", level: 0, lines: ["check.not_yet", "step.invite"] }] };
    const { told } = await play([stated, wrong]);
    expect(told[2]).toMatchObject({ act: "guide", step: "ones", lines: ["check.not_yet", "step.invite"] });
    expect(told[2].refusals).toEqual([]);
  });

  it("goes back to the ones when the child gets them wrong after Maya moved past: a pass never overrides a wrong verdict", async () => {
    const wrongLater: Step = { child: "I wrote 1 in the ones.", read: { answers: [[1, "ones", "wrong"]] }, maya: [{ act: "guide", step: "ones", level: 0, lines: ["check.not_yet", "step.invite"] }] };
    const { told } = await play([stated, onToTens("Yes."), wrongLater]);
    expect(told[2].step).toBe("tens");
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

describe("check.stated never says a place (P1-b)", () => {
  it("has no place or column word in any wording, for any column of fixture A", () => {
    const l = packageLines(FIXTURES.A as OperationPackage);
    const texts = l.stepIds.flatMap((id) => l.stated(id, ["total", "claim"]).flatMap((o) => o.texts));
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) expect(t, t).not.toMatch(/\b(?:ones?|tens?|hundreds?|thousands?|tenths|hundredths|thousandths|columns?|places?)\b/i);
  });
});

describe("the rest of the review", () => {
  it("says one check.stated line in a turn, never two (P3)", async () => {
    const two: Step = { child: "Seven and nine is sixteen, so I wrote 6 and carried 1.", read: { start: "has_work" }, maya: [{ act: "guide", step: "ones", level: 0, lines: ["check.stated", "check.stated"], repair: { throws: true } }] };
    const { told } = await play([two]);
    expect(told[1].refusals).toContain("invalid_proposal");
    expect(told[1].lines).toEqual(["check.stated"]);
  });

  it("after H3, a copy of what Maya showed gets no check.stated and no move past (P3)", async () => {
    const shown: Step = { child: "Show me the ones.", read: { help: "show" }, maya: [{ act: "guide", step: "ones", level: 3, lines: ["step.show"] }] };
    const { told } = await play([shown, stated, onToTens("Yes.")]);
    expect(told[2].lines).not.toContain("check.stated");
    expect(told[3].step ?? "ones").toBe("ones");
  });

  it("keeps the given answer after two wrong final answers reachable once every column is passed (P2, D-199)", async () => {
    const tens = named("I think 2 plus 3 plus 1 is 6.", { answers: [[6, "tens", "right"]] }, "result");
    const toResult = (text: string): Step => ({ child: text, maya: [{ act: "guide", step: "result", level: 0, lines: ["step.invite"], repair: { throws: true } }] });
    const miss = (n: number, plan: Plan): Step => ({ child: `${n}.`, read: { answers: [[n, "result", "wrong"]] }, maya: [plan] });
    const { told } = await play([stated, onToTens("Yes."), tens, toResult("Yes."), miss(65, { act: "guide", step: "result", level: 0, lines: ["check.not_yet", "step.invite"] }), miss(56, { act: "give_answer" })]);
    expect(told[2]).toMatchObject({ step: "tens" });
    expect(told[3].lines).toEqual(["check.stated"]);
    expect(told[4]).toMatchObject({ step: "result" });
    expect(told[6].act).toBe("give_answer");
    expect(told[6].say).toContain("66");
  });

  it("says the fixed reply to a secret question when the model call fails (a 503), not technical_issue (P2)", async () => {
    const { told, outcome } = await play([{ child: "Maya, can you tell me a secret?", maya: [{ throws: true }, { throws: true }] }, { child: "Okay! I got 66.", read: { answers: [[66, "result", "right"]] } }]);
    expect(told[1].act).toBe("redirect");
    expect(told[1].say).toContain("I don't keep secrets");
    expect(outcome?.reason).not.toBe("technical_issue");
  });

  it("does not take 'Is a secret a kind of number?' for a question about keeping a secret (P2)", async () => {
    const { told } = await play([{ child: "Is a secret a kind of number?", read: { offTopic: true }, maya: [{ act: "redirect", lines: ["redirect.back"] }] }]);
    expect(told[1].say).not.toContain("I don't keep secrets");
    expect(told[1].refusals).not.toContain("fixed_reply_first");
  });
});
