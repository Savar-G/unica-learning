import { describe, expect, it } from "vitest";
import { createSession, drawOffers, fallbacks, freeTalkProblem, lineOffers, speechWords, step, type Proposal } from "@/lib/maya";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { createTextSession } from "@/lib/maya-text";
import { scenarioModel } from "@/lib/maya-gate/gate";
import { FIXTURES } from "@/lib/maya-gate/fixtures";

const at = 1000;
const proposal = (p: Omit<Proposal, "version">): Proposal => ({ version: 2, ...p });
function ready(grade: number) {
  let s = createSession({ callId: "limits", package: FIXTURES.A, grade, random: 1 });
  s = step(s, { type: "start", at }).session;
  s = step(s, { type: "proposal", at, proposal: proposal({ act: "open", parts: [{ line: "open.hello" }] }) }).session;
  return step(s, { type: "child_turn", at, text: "I have work." }).session;
}

const long = proposal({ act: "clarify", parts: Array.from({ length: 4 }, () => ({ line: "question.problem" as const })) });

describe("Maya's profile and accessibility controls through the public interfaces", () => {
  it("counts spoken numbers, signs, units and contractions", () => {
    expect(speechWords("I'm at 127 + 28 cm².")).toBe(12);
    expect(speechWords("I am at one hundred twenty seven plus twenty eight square centimetres.")).toBe(12);
  });

  it.each([1, 2, 3, 4, 5, 6, 7])("grade %s makes the word limit binding", (grade) => {
    const s = ready(grade);
    const r = step(s, { type: "proposal", at, proposal: long });
    if (grade <= 3) {
      expect(r.refusal?.code).toBe("turn_too_long");
      expect(r.effects).toEqual([]);
      const safe = fallbacks(r.session, [long]).map((p) => step(r.session, { type: "proposal", at, proposal: p })).find((r) => !r.refusal)!;
      expect(safe).toBeDefined();
      expect(safe.effects.some((e) => e.kind === "say")).toBe(true);
      for (const e of safe.effects) if (e.kind === "say") expect(speechWords(e.text)).toBeLessThanOrEqual(25);
    } else {
      expect(r.refusal).toBeNull();
      const say = r.effects.find((e) => e.kind === "say");
      expect(say?.kind === "say" && speechWords(say.text)).toBeGreaterThan(25);
    }
  });

  it("keeps noBoard after a malformed proposal and offers no drawings or board input", () => {
    const s = ready(4);
    const r = step(s, { type: "proposal", at, proposal: { version: 2, act: "guide", parts: "bad", reading: { noBoard: true } } });
    expect(r.refusal?.code).toBe("invalid_proposal");
    expect(r.session.noBoard).toBe(true);
    expect(drawOffers(r.session)).toEqual({});
    for (const offers of Object.values(lineOffers(r.session))) for (const o of offers ?? []) {
      expect(o.texts.length).toBeGreaterThan(0);
      for (const text of o.texts) expect(text).not.toMatch(/\b(?:board|look|watch|see|show me|follow along)\b/i);
    }
  });

  it("saves profile and spoken-only controls across an immediate resume", async () => {
    const model = scenarioModel();
    let s = createTextSession({ callId: "resume-controls", package: FIXTURES.A, model, grade: 1, clock: () => at });
    model.next([], undefined);
    await s.start();
    model.next([], { noBoard: true, shorter: true });
    expect((await s.child("I can't see the board. Please talk less.")).say).toEqual(["What part should we try again?"]);
    const saved = JSON.parse(JSON.stringify(await s.saved()));
    s = createTextSession({ callId: "resume-controls", package: FIXTURES.A, model, grade: 7, clock: () => at, resume: saved });
    expect(s.session).toMatchObject({ grade: 1, noBoard: true, shorter: true });
    model.next([], { answers: [[66, "result", "right"]] });
    const out = await s.child("66.");
    expect(out.board).toEqual([]);
    expect(out.say.length).toBeGreaterThan(0);
    for (const text of out.say) expect(speechWords(text)).toBeLessThanOrEqual(25);
  });

  it("runs the local demo's rule model through the new controls", async () => {
    const s = createTextSession({ callId: "rule-controls", package: FIXTURES.A, model: ruleMayaModel(), grade: 1, clock: () => at });
    await s.start();
    expect((await s.child("Please talk less.")).say).toEqual(["What part should we try again?"]);
    const identity = await s.child("Are you a real person? Can you be my secret friend?");
    expect(identity.say.slice(0, 2)).toEqual(["I'm not a real person. I'm an AI helper.", "I can't be a secret friend. I don't keep secrets. A grown-up you trust is a good person to talk to."]);
    expect(identity.say).toHaveLength(3);
    expect((await s.child("I can't see the board.")).board).toEqual([]);
    expect(s.session.noBoard).toBe(true);
  });

  it("takes a stop before a pending fixed reply", () => {
    const s = ready(1);
    const r = step(s, { type: "proposal", at, proposal: proposal({ act: "close", parts: [{ warm: "closing" }], reading: { aboutMaya: "secret_friend", stop: true } }) });
    expect(r.refusal).toBeNull();
    expect(r.session.outcome?.reason).toBe("child_stopped");
  });

  it("refuses grammar correction before a free-talk review", () => {
    expect(freeTalkProblem("Your grammar is wrong.")).toBe("grammar correction");
  });
});
