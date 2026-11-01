import { describe, expect, it } from "vitest";
import { createSession, lineOffers, step, type Effect, type Session, type SessionEvent } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { workedSteps, type Operation, type QuestionPackage } from "@/lib/question-package";
import { createTextSession } from "@/lib/maya-text";
import { fakeMayaModel } from "@/lib/maya-model-fake";
import { checkTrace } from "@/lib/maya-trace";

const n = (value: number) => ({ type: "number" as const, value });
const answer = (value: number, step: string, verdict: "right" | "wrong" = "right") => ({ value: n(value), step, verdict });
const line = (line: string, slots = {}) => ({ line, slots });
const said = (effects: Effect[]) => effects.flatMap((e) => e.kind === "say" ? [e.text] : []).join(" ");

function call(pkg: QuestionPackage = FIXTURES.A) {
  let session = createSession({ callId: "practice-resumption", package: pkg, random: 3 });
  let now = Date.UTC(2026, 10, 1);
  const send = (event: SessionEvent) => { const result = step(session, event); session = result.session; return result; };
  const child = (text: string) => send({ type: "child_turn", text, at: now += 4000 });
  const propose = (proposal: object) => send({ type: "proposal", at: now, proposal: { version: 2, ...proposal } });
  const ok = (proposal: object) => { const result = propose(proposal); expect(result.refusal).toBeNull(); return result; };
  send({ type: "start", at: now });
  ok({ act: "open", parts: [line("open.hello"), line("question.problem")] });
  return { get session() { return session; }, set session(value: Session) { session = value; }, get now() { return now; }, send, child, propose, ok };
}

const accept = { act: "accept_answer", parts: [line("answer.right")], reading: { answers: [answer(66, "result")] } };
const write = { act: "ask_write", parts: [line("write.answer")], understanding: "uncertain" };
const guide = (step: string) => ({ act: "guide", step, level: 0, parts: [line("step.invite", { step })] });
const regroup = (step: string) => ({ act: "guide", step, level: 1, parts: [line("step.regroup", { step })] });

describe("withdrawal and saved writing state", () => {
  it.each(["written", "declined"] as const)("clears the earlier %s paper reading", (paper) => {
    const c = call(); c.child("I got 66."); c.ok({ ...accept, reading: { ...accept.reading, paper } });
    c.child("I erased my answer.");
    c.ok(guide("ones")); c.child("I got 66."); c.ok(accept); c.child("Okay.");
    expect(lineOffers(c.session).ask_write?.some((o) => o.line === "write.answer")).toBe(true);
    c.ok(write);
  });

  it("returns from WRITE_CLOSE to teaching and accepts the next checked answer", () => {
    const c = call(); c.child("I got 66."); c.ok(accept); c.child("Okay."); c.ok(write);
    c.child("I erased my answer.");
    expect(c.session.state).toBe("GUIDE_TARGET");
    c.ok(guide("ones")); c.child("I got 66."); c.ok(accept);
    expect(c.session.solved).toBe("child");
  });

  it("updates the saved teaching state while a writing interrupt is active", () => {
    const c = call(); c.child("I got 66."); c.ok(accept); c.child("Okay."); c.ok(write);
    c.send({ type: "writing", status: "started", at: c.now });
    c.child("I erased my answer."); c.session = JSON.parse(JSON.stringify(c.session));
    c.send({ type: "writing", status: "done", at: c.now });
    c.child("I got 66."); c.ok(accept);
    expect(c.session.solved).toBe("child");
  });

  it.each(["I didn't erase my answer.", "I erased my drawing.", "I cannot explain it."])("preserves a valid paper reading for %s", (text) => {
    const c = call(); c.child("I got 66."); c.ok({ ...accept, reading: { ...accept.reading, paper: "written" } });
    c.child(text); expect(c.session.solved).toBe("child"); expect(c.session.paper).toBe("child_confirmed");
  });

  it.each([false, true])("resumes through the text adapter after saved paper or closing state, closing=%s", async (closing) => {
    let now = Date.UTC(2026, 10, 1);
    const model = fakeMayaModel({ answer: (input) => ({ version: 2, ...(!input.childTurn
      ? { act: "open", parts: [line("open.hello"), line("question.problem")] }
      : input.childTurn === "I erased my answer." ? guide("ones")
      : input.childTurn === "Okay." ? write
      : { ...accept, reading: { ...accept.reading, ...(!closing && input.childTurn.includes("paper") ? { paper: "written" } : {}) } }) }) });
    const options = { callId: `practice-resumption-${closing}`, package: FIXTURES.A, model, clock: () => now, random: 3 };
    let c = createTextSession(options);
    await c.start(); now += 4000; await c.child("I got 66. I wrote it on paper.");
    if (closing) { now += 4000; await c.child("Okay."); }
    now += 4000; await c.child("I erased my answer.");
    c = createTextSession({ ...options, resume: JSON.parse(JSON.stringify(await c.saved())) });
    now += 4000; await c.child("I got 66."); now += 4000; const output = await c.child("Okay.");
    expect(output.say.join(" ")).toMatch(/write 66/i); expect(c.session.solved).toBe("child");
    await c.finish(); expect(checkTrace(c.trace()).ok).toBe(true);
  });
});

function twoCarries(highestOnly = false) {
  const operation: Operation = { kind: "add", operands: highestOnly ? [67, 58] : [167, 158] };
  const pkg = { ...FIXTURES.A, text: highestOnly ? "67 + 58 = ?" : "167 + 158 = ?", operation, steps: workedSteps(operation), answer: { value: n(highestOnly ? 125 : 325), accepted: [], unit: null }, wrongAnswers: [{ value: n(highestOnly ? 115 : 215), cause: "O3", description: "Missed carry", step: "tens" }] };
  const c = call(pkg); c.child(`7 plus 8 is 15. I got ${highestOnly ? 115 : 215}.`);
  c.ok({ ...guide("tens"), parts: [line("check.right_step", { step: "ones" }), line("step.invite", { step: "tens" })], reading: { answers: [answer(15, "ones"), answer(highestOnly ? 115 : 215, "result", "wrong")] } });
  c.child("Help."); c.ok(regroup("tens")); c.child("6 plus 5 plus 1 is 12.");
  c.ok({ ...guide("hundreds"), parts: [line("check.right_step", { step: "tens" }), line("step.invite", { step: "hundreds" })], reading: { answers: [answer(12, "tens")] } });
  return c;
}

describe("carry selection after column progress", () => {
  it.each(["I didn't carry from the ones to the tens.", "I didn't carry from the ones.", "I did not carry to the tens."])("explains the named earlier carry: %s", (text) => {
    const c = twoCarries(); c.child("Help."); c.ok(regroup("hundreds"));
    c.child(text); c.session = JSON.parse(JSON.stringify(c.session));
    expect(lineOffers(c.session).guide?.some((o) => o.line === "step.regroup" && o.slots.step === "tens")).toBe(true);
    expect(c.propose(regroup("hundreds")).refusal).not.toBeNull();
    const output = c.ok(regroup("tens")); expect(said(output.effects)).toContain("1 ten");
    expect(c.session.done).toEqual(["ones", "tens"]);
    expect(c.session.regroup?.said).toEqual(expect.arrayContaining([{ out: "ones", in: "tens" }, { out: "tens", in: "hundreds" }]));
    c.child("Help."); c.ok(guide("hundreds"));
  });

  it("does not reopen a different carry when named columns cannot be a pair", () => {
    const c = twoCarries(); c.child("Help."); c.ok(regroup("hundreds"));
    c.child("I didn't carry from the hundreds to the ones."); c.ok(guide("hundreds"));
    expect(c.session.regroup?.said).toHaveLength(2);
  });

  it("keeps the current-step default when no carry pair is named", () => {
    const c = twoCarries(); c.child("Help."); c.ok(regroup("hundreds"));
    c.child("I didn't carry anything."); expect(said(c.ok(regroup("hundreds")).effects)).toContain("1 hundred");
  });

  it("offers and says the required explanation for a carry-only highest column", () => {
    const c = twoCarries(true); c.child("Help.");
    const output = c.ok(regroup("hundreds")); expect(said(output.effects)).toContain("1 hundred");
    expect(c.session.regroup?.said).toContainEqual({ out: "tens", in: "hundreds" });
    c.child("Help."); expect(lineOffers(c.session).guide?.some((o) => o.line === "step.point" && o.slots.step === "hundreds")).toBe(true);
  });
});
