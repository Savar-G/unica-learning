// The exact-match rule of true math, layer 1 (the Chief of Staff's decision of 2026-11-15), and final check 3 of the
// tutor core (2026-11-15). Code alone passes a sentence only when the whole sentence is one of code's own texts for the
// question or one closed plain form with true math; the claim reader only refuses. A fake model, fake reviews and a
// passed-in clock. The math review answers "false" wherever a test needs to prove that a sentence the child heard was
// passed by code alone.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { codeAlone, checkTutorSay, exactTexts, isTutorQuestion, judgment, tutorKind, tutorStreamContext } from "@/lib/maya";
import { sentencesOf } from "@/lib/maya/say-check";
import { TUTOR_PROMPT } from "@/lib/maya/tutor-prompt";
import { createSession } from "@/lib/maya/session";
import { fixedOffers } from "@/lib/maya/lines";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { createTextSession } from "@/lib/maya-text";
import { teachingPackage } from "@/lib/maya-teaching";
import { storedPlaceValue } from "@/lib/maya-teaching/place-value-samples";
import { operationResult, workedSteps, type Operation, type OperationPackage } from "@/lib/question-package";

const SUB = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const ADD = SAMPLE_PACKAGES["add-27-39"] as OperationPackage;
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const tutored = (pkg: unknown) => createSession({ callId: "pkg", package: pkg, conversational: true, tutor: true }).package as OperationPackage;
function make(text: string, operation: Operation): OperationPackage {
  const easy: Operation = { kind: "divide", operands: [8, 2] };
  return { ...SUB, id: `probe-${text}`, text, operation, answer: { value: operationResult(operation), accepted: [], unit: null }, steps: workedSteps(operation), wrongAnswers: [{ value: { type: "number", value: 999 }, cause: "careless", description: "A made-up error.", step: null }], easierExample: { text: "8 ÷ 2 = ?", operation: easy, answer: operationResult(easy), steps: workedSteps(easy) } } as OperationPackage;
}
const CLAIM = tutored(FIXTURES.CLAIM_GT);
const PACKAGES: [string, OperationPackage, boolean][] = ([
  ["52 − 28", SUB, false],
  ["27 + 39", ADD, false],
  ["claim", CLAIM, true],
  ["place value", teachingPackage(storedPlaceValue({ variant: "1.2", n0: 48942, place: "ten thousands" })) as unknown as OperationPackage, false],
  ["fractions", tutored(FIXTURES.COMPARE_FRACTIONS), false],
  ["1340 ÷ 2", make("1340 ÷ 2 = ?", { kind: "divide", operands: [1340, 2] }), false],
  ["6 × 440", make("6 × 440 = ?", { kind: "multiply", operands: [6, 440] }), false],
] as [string, OperationPackage, boolean][]).filter(([, pkg]) => isTutorQuestion(pkg));
const ctxOf = (pkg: OperationPackage, word = false) => tutorStreamContext(pkg, "", "none", new Set(), [], word);

/** Every false sentence of the Sol rounds and of the pre-launch checks (src/lib/maya/__fixtures__, 125 distinct). */
const FALSE: { line: string; kind: string }[] = JSON.parse(readFileSync(new URL("./maya/__fixtures__/tutor-false-sentences-20261115.json", import.meta.url), "utf8"));
const settle = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };

function call(say: string | string[], opts: { stream?: boolean; math?: "true" | "false"; talk?: "pass" | "fail-math"; pkg?: unknown } = {}) {
  let now = Date.UTC(2026, 10, 15, 16);
  let n = 0;
  const says = Array.isArray(say) ? say : [say];
  const parts: string[] = [];
  let early: string[] = [];
  const math = fakeMathReviewer(() => ({ verdict: opts.math ?? "false", reason: opts.math === "true" ? "all true" : "false math" }));
  const talk = fakeTalkReviewer(opts.talk === "fail-math" ? () => ({ verdict: "fail", rules: ["math"], reason: "judges the answer wrongly" }) : undefined);
  const model = conversationalFake({
    answer: () => reply(says[Math.min(n++, says.length - 1)], "guide"),
    ...(opts.stream ? { stream: { chunk: 7, beforeEnd: async () => { await settle(); early = [...parts]; } } } : {}),
  });
  const session = createTextSession({
    callId: "exact-match", package: opts.pkg ?? SUB, model, clock: () => (now += 100), random: 3, tutor: true, reviewTimeLimitMs: 50,
    reviewer: talk, mathReviewer: math, ...(opts.stream ? { onSayPart: (x: string) => parts.push(x) } : {}),
  });
  return { session, math, talk, model, parts, early: () => early };
}

describe("layer 1: only an exact match passes on code alone", () => {
  it.each([false, true])("says a complete computed phrase with no math request (stream %s)", async (stream) => {
    const line = "After the trade, we have 4 tens. Write 4 in the ones place.";
    const { session, math, parts } = call(line, { stream });
    await session.start();
    parts.length = 0;
    const out = await session.child("Help me please.");
    expect(out.say.join(" ")).toBe(line);
    expect(math.requests).toEqual([]);
    if (stream) expect(parts.join(" ")).toBe(line);
  });

  it.each([false, true])("holds temporal false counts and added clauses for math review (stream %s)", async (stream) => {
    for (const line of ["After the trade, we had 5 tens.", "Write 4 in the ones place, with a negative sign.", "So we write 2 in the tens place."]) {
      const { session, math, parts } = call(line, { stream });
      await session.start();
      parts.length = 0;
      const out = await session.child("Help me please.");
      expect(math.requests.map(r => r.sentence), line).toContain(line);
      expect(out.say, line).not.toContain(line);
      expect(parts, line).not.toContain(line);
    }
  });

  it.each([false, true])("keeps the main question's new phrases under review after an easier example (stream %s)", async (stream) => {
    const line = "Write 4 in the ones place.";
    const { session, math, parts } = call(["For the easier example, what is 42 minus 7?", line], { stream, math: "true" });
    await session.start();
    await session.child("Help me please.");
    math.requests.length = 0;
    parts.length = 0;
    await session.child("Help me please.");
    expect(math.requests.map(r => r.sentence)).toContain(line);
  });

  it("never passes a false sentence of the earlier rounds on code alone, in any tutor package", () => {
    expect(FALSE.length).toBe(125);
    for (const { line } of FALSE) for (const [name, pkg, word] of PACKAGES) {
      const v = checkTutorSay(line, ctxOf(pkg, word));
      const held = !v.ok || sentencesOf(line).some((x) => v.math.includes(x));
      expect(held, `${name}: ${line}`).toBe(true);
    }
  });

  it.each([false, true])("keeps the reviewer's two layer-1 sentences from the child when the math review says false (stream %s)", async (stream) => {
    for (const line of ["24 is the answer with a negative sign.", "12 minus 8 is 4, with a negative sign."]) {
      const { session, math, parts } = call(line, { stream });
      await session.start();
      parts.length = 0;
      const out = await session.child("Help me please.");
      expect([...parts, ...out.say].join(" "), line).not.toContain("negative");
      expect(math.requests.map((r) => r.sentence), line).toContain(line);
    }
  });

  it("does not refuse \"52 minus 28 is the answer.\": it goes to the math review", async () => {
    const line = "52 minus 28 is the answer.";
    expect(checkTutorSay(line, ctxOf(SUB))).toMatchObject({ ok: true, math: [line] });
    const { session, math } = call(line, { math: "true" });
    await session.start();
    expect((await session.child("Help me please.")).say.join(" ")).toBe(line);
    expect(math.requests.map((r) => r.sentence)).toEqual([line]);
  });

  it("passes code's own step texts and step questions with no math review, in every tutor package", () => {
    for (const [name, pkg, word] of PACKAGES) {
      const kind = tutorKind(pkg);
      const texts = [...kind.steps(pkg).flatMap((st) => sentencesOf(`${st.work}.`)), ...(kind.stepQuestion(pkg, []) ? [kind.stepQuestion(pkg, [])!] : [])];
      expect(exactTexts(pkg).size, name).toBeGreaterThan(0);
      for (const text of texts) {
        expect(codeAlone(text, ctxOf(pkg, word)), `${name}: ${text}`).toBe(true);
        const v = checkTutorSay(text, ctxOf(pkg, word));
        if (v.ok) expect(v.math, `${name}: ${text}`).toEqual([]);
      }
    }
  });

  it("passes the closed plain forms with true math and no review; a lead-in, the name or another word sends it to the review", () => {
    for (const line of ["12 minus 8 is 4.", "52 is 4 tens and 12 ones.", "52 minus 28 isn't 36.", "What is 12 minus 8?", "What do you get for 4 minus 2?"]) {
      expect(checkTutorSay(line, ctxOf(SUB)), line).toMatchObject({ ok: true, math: [] });
    }
    // An instruction is code alone only as a complete exact text. #1047 adds this computed trade to that bank.
    expect(checkTutorSay("Trade 1 ten for 10 ones.", ctxOf(SUB))).toMatchObject({ ok: true, math: [] });
    expect(checkTutorSay("Subtract the ones.", ctxOf(SUB))).toMatchObject({ ok: true, math: ["Subtract the ones."] });
    for (const line of ["Now 12 minus 8 is 4.", "{name}, 12 minus 8 is 4.", "The answer is 24.", "Write 3 in the ones.", "Add the ones.", "12 minus 8 is 4 too.", "What is 12 minus 8.", "The tens.", "What is the value of the 8 in 52?"]) {
      expect(codeAlone(line, ctxOf(SUB)), line).toBe(false);
    }
    // Final check 4: a bare place ("The tens.") answers what the child asked, and 52 holds no 8: both go to the review.
    // A part of code's own step text is an exact match: "write 4 in the ones" is true in 52 − 28.
    expect(codeAlone("Write 4 in the ones.", ctxOf(SUB))).toBe(true);
  });

  it("passes every first-sentence example of the tutor prompt on code alone (#1046 rule)", () => {
    const rule = TUTOR_PROMPT.slice(TUTOR_PROMPT.indexOf("The first sentence:"), TUTOR_PROMPT.indexOf("No \"yes\", no praise"));
    const examples = [...rule.matchAll(/"([^"]+[.?])"/g)].map((m) => m[1]);
    expect(examples.length).toBeGreaterThanOrEqual(7);
    for (const line of examples) expect(codeAlone(line, ctxOf(SUB)), line).toBe(true);
  });

  it("says an exact step text and a plain form at once in the stream, with no math or talk review", async () => {
    const line = "2 ones is too small to take 8. 12 minus 8 is 4. What is 4 minus 2?";
    const { session, math, talk, parts, early } = call(line, { stream: true });
    await session.start();
    parts.length = 0;
    talk.requests.length = 0;
    const out = await session.child("Help me please.");
    expect(out.say.join(" ")).toBe(line);
    expect(early()).toEqual(sentencesOf(line));
    expect(math.requests).toHaveLength(0);
  });
});

describe("final check 3, F1: a turn with an identity word streams nothing before the disclosure", () => {
  const disclosure = fixedOffers().find((x) => x.line === "about.ai")!.texts[0];
  for (const child of ["Are you a real person?", "Are you a real life person?", "Is your voice a real person?", "Am I speaking to somebody real?", "Are you an actual person talking to me?"]) {
    it.each([false, true])(`says the disclosure first: ${child} (stream %s)`, async (stream) => {
      const parts: string[] = [];
      const s = createTextSession({
        callId: "identity", package: SUB, tutor: true, clock: () => 10000, reviewer: fakeTalkReviewer(), mathReviewer: fakeMathReviewer(), onSayPart: (x) => parts.push(x),
        model: conversationalFake({ answer: () => reply("12 minus 8 is 4. What is 4 minus 2?", "guide", { reading: { aboutMaya: "identity" } }), ...(stream ? { stream: { chunk: 7, beforeEnd: settle } } : {}) }),
      });
      await s.start();
      parts.length = 0;
      const out = await s.child(child);
      expect(out.say.join(" ").startsWith(disclosure)).toBe(true);
      expect(parts.join(" ").startsWith(disclosure)).toBe(true);
    });
  }
  it("control: a math turn with no identity word still streams its first sentence before the message ends", async () => {
    const { session, parts, early } = call("12 minus 8 is 4. What is 4 minus 2?", { stream: true });
    await session.start();
    parts.length = 0;
    // Final check 4: only a turn plainly about the math streams (a number, an operation word, code's help read).
    await session.child("Help me please.");
    expect(early()).toContain("12 minus 8 is 4.");
  });
});

describe("final check 3, F3: any correctness judgment follows code's stance", () => {
  for (const lead of ["Yes, that's right!", "Perfect!", "You nailed it!", "You have the correct answer.", "Great job!"]) {
    it.each([false, true])(`never affirms "My answer is 36." with "${lead}" (stream %s)`, async (stream) => {
      const { session, parts } = call(`${lead} What is 12 minus 8?`, { stream, talk: "fail-math" });
      await session.start();
      parts.length = 0;
      const out = await session.child("My answer is 36.");
      expect(out.say.join(" ")).not.toContain(lead);
      expect(parts.join(" ")).not.toContain(lead);
    });
  }
  it("refuses a negative judgment of a right answer, and reads \"not right\" as negative", () => {
    const right = { ...ctxOf(SUB), stance: "right" as const };
    expect(checkTutorSay("That is wrong. What is 4 minus 2?", right)).toMatchObject({ ok: false, reason: "wrong_stance" });
    expect(judgment("That is not right yet.")).toEqual({ any: true, positive: false, negative: true });
    expect(checkTutorSay("That is not right yet. What is 12 minus 8?", { ...ctxOf(SUB), stance: "wrong" })).toMatchObject({ ok: true });
  });
  it("makes a talk-review refusal of a judgment binding when code knows no stance", async () => {
    const { session } = call("Great job! What is 12 minus 8?", { talk: "fail-math" });
    await session.start();
    const out = await session.child("Help me please.");
    expect(out.say.join(" ")).not.toContain("Great job");
  });
  it("control: a right answer still hears \"You have the correct answer.\" after the talk review passes", async () => {
    const { session } = call("You have the correct answer. How did you get it?", { math: "true" });
    await session.start();
    expect((await session.child("My answer is 24.")).say.join(" ")).toBe("You have the correct answer. How did you get it?");
  });
  it("control: a talk refusal on the math rule alone is still ignored for a sentence that judges nothing", async () => {
    const { session } = call("That 4 is already in the ones. What is 4 minus 2?", { math: "true", talk: "fail-math" });
    await session.start();
    expect((await session.child("Help me please.")).say.join(" ")).toBe("That 4 is already in the ones. What is 4 minus 2?");
  });
});
