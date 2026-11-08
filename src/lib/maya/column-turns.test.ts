// The two controller faults of the subscription practice run at 361a05c9 (PR #698, traces gate-698-full-361a05c9).
// Fault A: a column step was credited only when the whole turn was one bare template, so "I got 16, like I said. What do
// I do next?" never finished the ones (C01-r1). Fault B: after Maya showed a column at H3, a copy of it never moved the
// ladder on, and a refused "show me" left Maya with no safe line (C04-r2, C04-r3). Each script replays on the scripted
// model; `repair: { throws: true }` leaves the turn to code's fallback, and `{ throws: true }` is a failed model call.
import { describe, expect, it } from "vitest";
import { createSession, step, type LineChoice, type LineId, type Proposal, type SessionEvent, type Slots } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { memoryTraceStore, runBehaviour, type Behaviour, type Plan, type Read, type Step } from "@/lib/maya-gate/gate";

interface Told { act: string | undefined; step: string | undefined; lines: string[]; say: string }
interface Turn { kind: string; detail?: string; output?: { act: string; say: string[] } | null; attempts?: { proposal?: { step?: string; parts?: { line?: string }[] } | null }[] }
async function play(steps: Step[]) {
  const b: Behaviour = { id: "column-turns", title: "column turns", fixture: "A", status: "passing", steps, expect: { outcome: {} } };
  const store = memoryTraceStore();
  await runBehaviour(b, store);
  const trace = JSON.parse(store.load(b.id)!) as { turns: Turn[]; outcome: { reason: string; assistance: string } | null };
  const told: Told[] = trace.turns.filter((t) => t.kind === "maya" && t.output).map((t) => {
    const p = t.attempts!.at(-1)!.proposal ?? {};
    return { act: t.output!.act, step: p.step, lines: (p.parts ?? []).flatMap((x) => (x.line ? [x.line] : [])), say: t.output!.say.join(" ") };
  });
  return { told, turns: trace.turns, outcome: trace.outcome };
}

const THROWS: Plan[] = [{ throws: true }];
const down = (text: string): Step => ({ child: text, maya: THROWS });
/** The model names this step right and asks to go on; its repair call fails, so code decides. */
const named = (text: string, value: number, stepId = "ones"): Step => ({
  child: text, read: { answers: [[value, stepId, "right"]] },
  maya: [{ act: "guide", step: stepId === "ones" ? "tens" : "result", level: 0, lines: ["check.right_step", "step.invite"], repair: { throws: true } }],
});
const shown: Step = { child: "Show me the ones.", read: { help: "show" }, maya: [{ act: "guide", step: "ones", level: 3, lines: ["step.show"] }] };

describe("fault A: one step template with next-step questions from a closed list", () => {
  // [turn, the value a model would name]
  const HEARD: [string, number][] = [
    ["I got 16, like I said. What do I do next?", 16], ["I got 16, like I said.", 16], ["I got 16 like I said.", 16],
    ["I already got 16. Where does the 1 go?", 16], ["I already got 16.", 16], ["I got 16. What do I do now?", 16],
    ["I got 16. What do I do with the 1?", 16], ["I got 16. What do I do with the one?", 16], ["I got 16. What do I do with the carry?", 16],
    ["It's 16. Where does the carried 1 go?", 16], ["16. Where does the ten go?", 16], ["It's 16. Do I write the 1 at the top of the tens?", 16],
    ["7 plus 9 is 16. Do I put the 1 in the tens?", 16], ["7 plus 9 is 16. What about the tens?", 16], ["16. Now what?", 16], ["I got 16. What's next?", 16],
    ["Okay. I got 16. What do I do next?", 16], ["I got 16. So what do I do next?", 16],
    ["You said 16, so I wrote 6 and carried 1.", 6], ["You said 16 so I wrote 6 and carried 1.", 6], ["Like you said, I wrote 6 and carried 1.", 6],
    ["You said 16, so I wrote 6 and carried 1. What do I do next?", 6],
  ];
  it.each(HEARD)("credits the ones for %j on both paths", async (text, value) => {
    for (const s of [down(text), named(text, value)]) {
      const told = (await play([s])).told[1];
      expect(told).toMatchObject({ act: "guide", step: "tens" });
      expect(told.lines).toContain("check.right_step");
    }
  });

  const REFUSED: [string, number][] = [
    // The near-misses the brief names.
    ["I got 16. My mom said where the 1 goes?", 16], ["I got 16. Is that right?", 16], ["I think I got 16. What do I do next?", 16],
    ["I got 16. What do I do with the 15?", 16], ["You said 16.", 16], ["I didn't get 16. What do I do next?", 16],
    // More near-misses: a check of the value, another number or speaker, a hedge, a negation, Maya's number as the value.
    ["I got 16. Is it 16?", 16], ["I got 16. Right?", 16], ["I got 16. What do I do next? Is it 16?", 16], ["I got 16. Where does the 6 go?", 16],
    ["I got 16. Where does the 2 go?", 16], ["I got 16. What do I do with the 7?", 16], ["My mom got 16. What do I do next?", 16], ["I got 16. Maybe what do I do next?", 16],
    ["I got 16. Mom, what do I do next?", 16], ["I got 16. What does my mom do next?", 16], ["I got 16. I don't know what to do next.", 16], ["I got 16. What do I not do next?", 16],
    ["I got 16, like you said. What do I do next?", 16], ["You said 16, so it's 16.", 16], ["Like you said, it's 16.", 16], ["You said 16. What do I do next?", 16],
    ["I got 16. I got 16. What do I do next?", 16], ["Is it 16? What do I do next?", 16], ["I got 16? What do I do next?", 16], ["I got 15. What do I do next?", 16],
    ["You said 15, so I wrote 6 and carried 1.", 6], ["You said 16, so my mom wrote 6 and carried 1.", 6], ["You said 16, so I think I wrote 6 and carried 1.", 6],
    ["You said 16, so I wrote 6.", 6], ["You said 16, so I didn't write 6 and carried 1.", 6], ["You said 16, so I wrote 5 and carried 1.", 6],
  ];
  it.each(REFUSED)("gives no ones credit for %j on both paths", async (text, value) => {
    for (const s of [down(text), named(text, value)]) {
      const told = (await play([s])).told[1];
      expect(told.lines).not.toContain("check.right_step");
      expect(told.say).not.toMatch(/7 \+ 9 = 16/);
      expect(told.step ?? "ones").toBe("ones");
    }
  });

  it("asks no carry question of a column with no carry: 'Where does the 1 go?' beside the tens' 6 credits nothing", async () => {
    const ones: Step = { child: "7 plus 9 is 16.", read: { answers: [[16, "ones", "right"]] } };
    for (const s of [down("It's 6. Where does the 1 go?"), named("It's 6. Where does the 1 go?", 6, "tens")]) {
      const told = (await play([ones, s])).told[2];
      expect(told.lines).not.toContain("check.right_step");
      expect(told.step).toBe("tens");
    }
    // The forms with no number still hold for the tens.
    for (const s of [down("It's 6. What do I do next?"), named("It's 6. What do I do next?", 6, "tens")]) {
      expect((await play([ones, s])).told[2]).toMatchObject({ act: "guide", step: "result", lines: ["check.right_step", "step.invite"] });
    }
  });
});

describe("fault B: after Maya shows a column at H3", () => {
  it.each(["You said 16, so I wrote 6 and carried 1.", "Like you said, I wrote 6 and carried 1."])("credits the child's own claim about their paper: %j", async (text) => {
    for (const s of [down(text), named(text, 6)]) {
      const { told } = await play([shown, s]);
      expect(told[2]).toMatchObject({ act: "guide", step: "tens" });
      expect(told[2].act).not.toBe("give_answer");
    }
  });

  const COPIES = ["16.", "You said 16.", "You said 16, so it's 16.", "Like you said, it's 16.", "I got 16. What do I do next?", "Where does the 1 go?",
    "Okay. Where does the 1 go?", "What do I do next?", "Got it.", "Oh, I see.", "I get it now."];
  it.each(COPIES)("moves the ladder past the shown step with no credit for %j, and never gives the answer for it", async (text) => {
    for (const s of [down(text), named(text, 16)]) {
      const { told, outcome } = await play([shown, s]);
      expect(told[2]).toMatchObject({ act: "guide", step: "tens" });
      expect(told[2].lines).not.toContain("check.right_step");
      expect(outcome?.assistance).not.toBe("independent");
    }
  });

  it("answers 'Where does the 1 go?' with where the carried ten goes", async () => {
    const { told } = await play([shown, down("Where does the 1 go?")]);
    expect(told[2]).toMatchObject({ act: "guide", step: "tens", lines: ["step.regroup"] });
  });

  it.each(["Yes.", "Okay.", "6.", "I wrote it.", "My mom said 16.", "I think it's 16.", "Is it 16?"])("does not move past the shown step for %j", async (text) => {
    const told = (await play([shown, down(text)])).told[2];
    expect(told.lines).not.toContain("check.right_step");
    expect(told.step ?? "ones").toBe("ones");
  });

  it("leads a new help request about the shown step to the easier example, and a new miss to the honest close (#735)", async () => {
    for (const text of ["I still don't get it.", "Show me again."]) {
      const { told } = await play([shown, { child: text, read: { help: "more" }, maya: [{ act: "guide", step: "ones", level: 3, lines: ["step.show"], repair: { throws: true } }] }]);
      expect(told[2].act).toBe("example_step");
      expect(told.map((t) => t.act)).not.toContain("give_answer");
    }
    const { told } = await play([shown, { child: "15.", read: { answers: [[15, "ones", "wrong"]] }, maya: [{ act: "guide", step: "ones", level: 3, lines: ["step.show"], repair: { throws: true } }] }]);
    expect(told[2].act).toBe("close");
    expect(told[2].say).not.toMatch(/\b66\b/);
  });

  it("keeps the stuck step and gives no credit for the copied step", () => {
    const line = (name: LineId, slots: Slots = {}): LineChoice => ({ line: name, slots });
    let session = createSession({ callId: "column-turns", package: FIXTURES.A, freeTalk: true });
    let at = 1000;
    const send = (event: Record<string, unknown>) => { const r = step(session, { ...event, at } as SessionEvent); session = r.session; at += 4000; return r; };
    send({ type: "start" });
    expect(send({ type: "proposal", proposal: { version: 2, act: "open", parts: [line("open.hello"), line("question.problem")] } }).refusal).toBeNull();
    send({ type: "child_turn", text: "Show me the ones." });
    const show: Proposal = { version: 2, act: "guide", step: "ones", level: 3, parts: [line("step.show", { step: "ones" })], reading: { help: "show" } };
    expect(send({ type: "proposal", proposal: show }).refusal).toBeNull();
    send({ type: "child_turn", text: "You said 16." });
    const onward: Proposal = { version: 2, act: "guide", step: "tens", level: 0, parts: [line("step.invite", { step: "tens" })] };
    expect(send({ type: "proposal", proposal: onward }).refusal).toBeNull();
    expect(session.done).not.toContain("ones");
    expect(session.passed).toEqual(["ones"]);
    expect(session.stuckStep).toBe("ones");
    expect(session.highestHint).toBe(3);
    // The tens are the child's own work: they count, and the passed ones still do not.
    send({ type: "child_turn", text: "2 plus 3 plus 1 is 6." });
    const tens: Proposal = { version: 2, act: "guide", step: "result", level: 0, parts: [line("check.right_step", { step: "tens" }), line("step.invite", { step: "result" })], reading: { answers: [{ value: { type: "number", value: 6 }, step: "tens", verdict: "right" }] } };
    const r = send({ type: "proposal", proposal: tens });
    expect(r.refusal).toBeNull();
    expect(session.done).toEqual(["tens"]);
    expect(session.passed).toEqual(["ones"]);
  });

  // C04-r2 and C04-r3: a refused proposal whose reading says "show me" made the H3 rule allow only give_answer while the
  // ladder held the help at H3, so every fallback was refused: "Maya had no safe line to say" (technical_issue).
  const AFTER_SHOW = ["Um, I still don't know 7 plus 9. Is it 16?", "I don't know how to add 7 and 9. I just guessed.", "Show me again.", "I don't know.",
    "Where does the 1 go?", "16.", "You said 16, so I wrote 6 and carried 1.", "Yes.", "I wrote 6."];
  const READS: (Read | undefined)[] = [undefined, { help: "show" }, { help: "more" }, { unclear: true, help: "show" }, { start: "no_start", help: "show" }, { help: "show", answers: [[16, "ones", "right"]] },
    { answers: [[16, "ones", "right"]] }, { help: "more", answers: [[16, "result", "wrong"]] }, { answers: [[66, "result", "right"]] }];
  const PLANS: Plan[][] = [THROWS, [{ act: "guide", step: "ones", level: 3, lines: ["step.show"], repair: { throws: true } }],
    [{ act: "guide", step: "tens", level: 0, lines: ["step.invite"], repair: { act: "guide", step: "ones", level: 2, lines: ["step.operation"] } }]];
  it.each(AFTER_SHOW)("always has an allowed act and a working fallback after an H3 show: %j", async (text) => {
    for (const read of READS) for (const maya of PLANS) {
      const { turns } = await play([shown, { child: text, ...(read ? { read } : {}), maya }]);
      const last = turns.findLastIndex((t) => t.kind === "child");
      const after = turns.slice(last + 1);
      expect(after.some((t) => t.kind === "technical" && /no safe line/.test(t.detail ?? "")), JSON.stringify({ text, read, maya })).toBe(false);
      expect(after.some((t) => t.kind === "maya" && t.output), JSON.stringify({ text, read, maya })).toBe(true);
    }
  });

  it("replays C04-r2's turns with a model that reads 'show me' after the show: no technical_issue", async () => {
    const { turns } = await play([
      shown,
      { child: "You said 16, so I wrote 6 and carried 1.", maya: [{ act: "guide", step: "tens", level: 0, lines: ["step.invite"], repair: { act: "guide", step: "ones", level: 2, lines: ["step.operation"] } }] },
      { child: "Um, I still don't know 7 plus 9. Is it 16?", read: { help: "show" }, maya: [{ act: "guide", step: "ones", level: 3, lines: ["step.show"], repair: { throws: true } }] },
    ]);
    expect(turns.some((t) => t.kind === "technical" && /no safe line/.test(t.detail ?? ""))).toBe(false);
    expect(turns.slice(turns.findLastIndex((t) => t.kind === "child") + 1).some((t) => t.kind === "maya" && t.output)).toBe(true);
  });
});
