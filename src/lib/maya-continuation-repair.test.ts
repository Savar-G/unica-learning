import { describe, expect, it } from "vitest";
import { mathReviewInput, type MathReviewInput, type MathReviewResult, type TalkReviewInput, type TalkReviewResult } from "@/lib/maya";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { createTextSession, REVIEW_FLOOR_MS, VOICE_REPAIR_BUDGET_MS } from "@/lib/maya-text";
import { checkTrace, type MayaTrace } from "@/lib/maya-trace";
import { askedStep, checkTutorSay, continuedSay, stepsStated, TUTOR_WORD_LIMIT, tutorKind, exactTexts } from "@/lib/maya/tutor";
import { readClaims } from "@/lib/maya/tutor-math";
import { TUTOR_PROMPT, type TutorBrief } from "@/lib/maya/tutor-prompt";
import type { OperationPackage } from "@/lib/question-package";

// 2026-11-15 (voice fallbacks, /tmp/voice-fallbacks/report.md): 7 of 30 voice tutor turns ended in code's line. In all 7
// the first sentence had streamed (about 1 s) before a later sentence was refused, and a refusal after a streamed sentence
// went straight to code's line. Now:
//  1. the repair CONTINUES the streamed sentences (fixed, never repeated or contradicted), checked with them as one message;
//  2. a step answer is judged against the step Maya asked ("It's seven." after "What do you get for 13 minus 6?");
//  3. a digit named with "the" beside "is" ("The carried 1 is a ten") is a place-value statement, never 1 = 10.
// Fake models and fake reviews; the voice budget runs on the real clock.

const SUB52 = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const SUB83 = SAMPLE_PACKAGES["subtract-83-46"] as OperationPackage;
const ADD = SAMPLE_PACKAGES["add-27-39"] as OperationPackage;
const TRUE: MathReviewResult = { verdict: "true", reason: "all true" };
const FALSE: MathReviewResult = { verdict: "false", reason: "it is not true" };
const PASS: TalkReviewResult = { verdict: "pass" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A turn of the scripted dialogue: the child's words, then Maya's outputs for it in order (the first, then the repair). */
type Step = [child: string, ...says: (string | Record<string, unknown>)[]];

/**
 * One tutor session, as voice (onSayPart, streamed model, modelRepair false) or as chat. `steps` gives the dialogue: each
 * child turn and the model's outputs for it. The model call `n` of a child turn returns its `n`th output.
 */
function session(pkg: OperationPackage, steps: Step[], opts: { voice?: boolean; math?: (i: MathReviewInput) => MathReviewResult; talk?: (i: TalkReviewInput) => TalkReviewResult; slowRepairMs?: number } = {}) {
  const voice = opts.voice !== false;
  const heard: string[] = [];
  let asked = 0;
  const calls = new Map<string, number>();
  const math = fakeMathReviewer((i) => (opts.math ?? (() => TRUE))(i));
  const talk = fakeTalkReviewer((i) => (opts.talk ?? (() => PASS))(i));
  const model = conversationalFake({
    answer: async (brief) => {
      const child = (brief as unknown as TutorBrief).childTurn ?? "";
      const step = steps.find((s) => s[0] === child);
      const n = calls.get(child) ?? 0;
      calls.set(child, n + 1);
      const out = step?.[1 + n] ?? step?.at(-1) ?? "Let's look at the ones. What is 12 minus 8?";
      if (n > 0 && opts.slowRepairMs) await sleep(opts.slowRepairMs);
      return typeof out === "string" ? reply(out, "guide") : out;
    },
    ...(voice ? { stream: { chunk: 9 } } : {}),
  });
  const s = createTextSession({
    callId: "continuation", package: pkg, model, clock: () => Date.now(), random: 3, tutor: true, reviewTimeLimitMs: 10_000,
    reviewer: talk, mathReviewer: math, onRepairStart: () => { asked++; return null; },
    ...(voice ? { modelRepair: false, onSayPart: (text: string) => heard.push(text) } : { channel: "chat" as const }),
  });
  return { s, heard, model, math, talk, asked: () => asked, briefs: () => model.briefs as unknown as TutorBrief[] };
}

/** Plays the dialogue up to (not including) the last child turn, then that turn; returns what the child heard on it. */
async function play(c: ReturnType<typeof session>, steps: Step[]) {
  await c.s.start();
  for (const [child] of steps.slice(0, -1)) await c.s.child(child);
  c.heard.length = 0;
  const out = await c.s.child(steps.at(-1)![0]);
  return { out, said: out.say.join(" ") };
}

const attempts = (trace: MayaTrace) => trace.turns.flatMap((t) => (t.kind === "maya" ? t.attempts : []));
const lastAttempts = (trace: MayaTrace) => [...trace.turns].reverse().find((t) => t.kind === "maya")!.attempts as { source: string; refusal: unknown }[];
const count = (text: string, part: string) => text.split(part).length - 1;

describe("a voice repair continues the sentences already streamed", () => {
  const FIRST = "12 minus 8 is 4.";
  const BAD = "Try again: what is 2 minus 8 in the ones?";
  const steps: Step[] = [["Is it 36?", `${FIRST} ${BAD}`, "What do you get for 4 minus 2 in the tens?"]];
  const math = (i: MathReviewInput) => (i.sentence === BAD ? FALSE : TRUE);

  it("streams the first sentence, refuses the later one, and the repair says only the rest: no code line, nothing twice", async () => {
    const c = session(SUB52, steps, { math });
    const { said } = await play(c, steps);
    expect(c.heard[0]).toBe(FIRST);
    expect(said).toBe(`${FIRST} What do you get for 4 minus 2 in the tens?`);
    expect(count(c.heard.join(" "), FIRST)).toBe(1);
    expect(c.heard.join(" ")).not.toContain(BAD);
    // The repair brief names the fixed sentences and asks only for the rest.
    const repair = c.briefs().at(-1)!.repair!;
    expect(repair.alreadySaid).toEqual([FIRST]);
    const trace = await c.s.finish({ reason: "child_stopped" });
    expect(checkTrace(trace)).toMatchObject({ ok: true });
    expect(lastAttempts(trace).map((a) => a.source)).toEqual(["model", "repair"]);
    expect(lastAttempts(trace).at(-1)!.refusal).toBeNull();
  });

  it("a repair that says the fixed sentences again first has them left out once (they are never repeated)", async () => {
    const echo: Step[] = [["Is it 36?", `${FIRST} ${BAD}`, `${FIRST} What do you get for 4 minus 2 in the tens?`]];
    const c = session(SUB52, echo, { math });
    const { said } = await play(c, echo);
    expect(said).toBe(`${FIRST} What do you get for 4 minus 2 in the tens?`);
    expect(count(said, FIRST)).toBe(1);
  });

  it("a repair that says a fixed sentence again later is refused: code's line follows the fixed sentences", async () => {
    const again: Step[] = [["Is it 36?", `${FIRST} ${BAD}`, `What is 4 minus 2? ${FIRST}`]];
    const c = session(SUB52, again, { math });
    const { said } = await play(c, again);
    expect(count(said, FIRST)).toBe(1);
    expect(said.startsWith(FIRST)).toBe(true);
    expect(said).not.toContain("Let me say that another way");
    const trace = await c.s.finish({ reason: "child_stopped" });
    expect(lastAttempts(trace).map((a) => a.source)).toEqual(["model", "repair", "fallback"]);
  });

  it("a repair that disagrees with the fixed sentences is refused by the check of the whole message", async () => {
    const wrong: Step[] = [["Is it 36?", `${FIRST} ${BAD}`, "So 12 minus 8 is 5. What is 4 minus 2?"]];
    const c = session(SUB52, wrong, { math });
    const { said } = await play(c, wrong);
    expect(said).not.toContain("is 5");
    expect(said.startsWith(FIRST)).toBe(true);
    const trace = await c.s.finish({ reason: "child_stopped" });
    expect(lastAttempts(trace).map((a) => a.source)).toEqual(["model", "repair", "fallback"]);
  });

  it("the word limit counts the whole message: the fixed sentences and the rest", async () => {
    const words = TUTOR_WORD_LIMIT - FIRST.split(" ").length + 1;
    const long = `${Array.from({ length: words - 1 }, () => "we").join(" ")} go?`;
    expect(checkTutorSay(long, { stance: "none" }).ok).toBe(true);
    const over: Step[] = [["Is it 36?", `${FIRST} ${BAD}`, long]];
    const c = session(SUB52, over, { math });
    const { said } = await play(c, over);
    expect(said).not.toContain(long);
  });

  it("the math review reads each continued sentence after the fixed sentences and the earlier continued ones", async () => {
    const REST1 = "We traded 1 ten away, so 4 tens are left in 52.";
    const REST2 = "What do you get for 4 minus 2 in the tens?";
    const two: Step[] = [["Is it 36?", `${FIRST} ${BAD}`, `${REST1} ${REST2}`]];
    const c = session(SUB52, two, { math });
    await play(c, two);
    const of = (x: string) => c.math.requests.filter((r) => r.sentence === x).at(-1);
    expect(of(REST1)?.before).toEqual([FIRST]);
    if (of(REST2)) expect(of(REST2)?.before).toEqual([FIRST, REST1]);
    // The fixed sentence is not reviewed again by the continuation.
    expect(c.math.requests.filter((r) => r.sentence === FIRST).length).toBeLessThanOrEqual(1);
  });

  it("a terminal review result of the first attempt stays final: the same sentence in the continuation is refused, with no new review", async () => {
    const same: Step[] = [["Is it 36?", `${FIRST} ${BAD}`, `${BAD}`]];
    const c = session(SUB52, same, { math });
    const { said } = await play(c, same);
    expect(said).not.toContain(BAD);
    expect(c.math.requests.filter((r) => r.sentence === BAD)).toHaveLength(1);
    const trace = await c.s.finish({ reason: "child_stopped" });
    expect(lastAttempts(trace).map((a) => a.source)).toEqual(["model", "repair", "fallback"]);
  });

  it("asks for the worker's thinking phrase at the continuation's start, and ends in code's line when the repair runs past the voice budget", async () => {
    const c = session(SUB52, steps, { math, slowRepairMs: VOICE_REPAIR_BUDGET_MS - REVIEW_FLOOR_MS + 300 });
    const t0 = Date.now();
    const { said } = await play(c, steps);
    expect(c.asked()).toBe(1);
    expect(said.startsWith(FIRST)).toBe(true);
    expect(said).not.toContain("tens?");
    expect(Date.now() - t0).toBeLessThan(VOICE_REPAIR_BUDGET_MS + 2_500);
  });

  it("chat (nothing streams) keeps its repair as before: the whole message is the repair's own", async () => {
    const c = session(SUB52, [["Is it 36?", `${FIRST} ${BAD}`, `${FIRST} What do you get for 4 minus 2 in the tens?`]], { math, voice: false });
    const { said } = await play(c, [["Is it 36?"]]);
    expect(said).toBe(`${FIRST} What do you get for 4 minus 2 in the tens?`);
    expect(c.briefs().at(-1)!.repair!.alreadySaid).toBeUndefined();
  });

  it("the prompt's repair rule says the fixed sentences stay said and only the rest comes", () => {
    expect(TUTOR_PROMPT).toContain(`If "repair.alreadySaid" is set, the child already heard those sentences: they stay said.`);
  });
});

describe("the AI disclosure, safety and a stop never get a continuation", () => {
  it.each([
    ["Are you a real person?", { gate: "identity", reading: { aboutMaya: "identity" } }],
    ["Someone at home hurts me.", { gate: "safety", reading: { safety: "concern" } }],
    ["I want to stop now.", { gate: "stop", reading: { stop: true } }],
  ] as const)("%s: nothing streams, no repair brief names fixed sentences", async (child, extra) => {
    const out = reply("12 minus 8 is 4. Let's keep going with the ones.", "guide", extra as never);
    const c = session(SUB52, [[child, out, out]], { math: () => FALSE });
    await play(c, [[child]]);
    expect(c.heard.filter((x) => x === "12 minus 8 is 4.")).toHaveLength(0);
    expect(c.briefs().every((b) => !b.repair?.alreadySaid)).toBe(true);
  });
});

describe("code's line after streamed words asks the current step", () => {
  it("report turn 7: \"13 minus 6 is 7.\" streamed, then code's line asks the tens, never 13 minus 6 again", async () => {
    const steps: Step[] = [
      ["Three minus six, I can't do that.", "3 ones is too small to take 6 ones. So we trade 1 ten for 10 ones. What is 13 minus 6?"],
      ["Thirteen minus six is eight.", "13 minus 6 isn't 8. What do you get for 13 minus 6?"],
      ["Wait, that's wrong. It's seven.", "13 minus 6 is 7. You fixed it yourself. Now how many tens are left in 83?", "13 minus 6 is 7. You fixed it yourself, so how many tens?"],
    ];
    const c = session(SUB83, steps, { math: (i) => (/fixed it yourself/.test(i.sentence) ? FALSE : TRUE) });
    const { said } = await play(c, steps);
    expect(said.startsWith("13 minus 6 is 7.")).toBe(true);
    expect(said).not.toMatch(/13 minus 6\?/);
    expect(said).toMatch(/7 minus 4/);
  });

  it("the stated-step rule alone: the streamed sentence tells a step the child did not do; code's line asks the next", () => {
    expect(stepsStated(SUB83, ["13 minus 6 is 7."])).toEqual(["ones"]);
    expect(stepsStated(ADD, ["7 plus 9 is 16."])).toEqual(["ones"]);
    expect(stepsStated(SUB83, ["13 minus 6 isn't 8."])).toEqual([]);
    expect(stepsStated(SUB83, ["Let's look at the ones."])).toEqual([]);
  });
});

describe("one verdict for a step answer: the step Maya asked", () => {
  const asked83: Step[] = [
    ["Three minus six, I can't do that.", "3 ones is too small to take 6 ones. So we trade 1 ten for 10 ones. Now take away the 6 ones: what is 13 minus 6?"],
  ];
  /** The review input and the brief for a child turn after "what is 13 minus 6?". */
  async function inputs(child: string) {
    const steps: Step[] = [...asked83, [child, "Let's look at the ones together. Which number is on top in the ones?"]];
    const c = session(SUB83, steps, { voice: false });
    await play(c, steps);
    const brief = c.briefs().at(-1)!;
    const review = c.math.requests.at(-1)!;
    return { brief, review, done: c.s.session.done };
  }

  it.each([
    ["Wait, that's wrong. It's seven.", "right", 7, ["ones"]],
    ["It's seven.", "right", 7, ["ones"]],
    ["7.", "right", 7, ["ones"]],
    ["Is it seven?", "unknown", null, []],
    ["Maybe seven.", "unknown", null, []],
    ["My answer is 7.", "wrong", 7, []],
    ["It's 8.", null, null, []],
  ] as const)("%s: %s, the same in the brief and in the math review", async (child, verdict, value, done) => {
    const { brief, review, done: d } = await inputs(child);
    expect(brief.childAnswer?.verdict ?? null).toBe(verdict === null ? (brief.childAnswer?.verdict ?? null) : verdict);
    expect(review.childAnswer?.verdict ?? null).toBe(brief.childAnswer?.verdict ?? null);
    if (value !== null) expect(review.childAnswer?.value).toBe(value);
    expect(d).toEqual(done);
    expect(review.childFacts).toEqual(brief.facts);
    // Never both: a fact that calls the number right beside a verdict that is not "right" says code's verdict in it.
    const v = review.childAnswer;
    if (v && v.verdict !== "right") for (const f of review.childFacts.filter((x) => x.startsWith(`The child said ${v.value ?? 7}:`))) expect(f).toContain(`childAnswer "${v.verdict}"`);
  });

  it("report turn 1: \"2.\" after \"How many tens are left?\" with the ones done is right for the tens in both inputs", async () => {
    const steps: Step[] = [
      ["Four.", "12 minus 8 is 4. So we write 4 in the ones. What is 4 tens minus 2 tens?"],
      ["Huh, that didn't make sense.", "We traded 1 ten for 10 ones, so 4 tens are left. Picture 4 tens, and take away 2 tens. How many tens are left?"],
      ["2.", "Let's look at the tens together. Which number is on top in the tens?"],
    ];
    const c = session(SUB52, steps, { voice: false });
    await play(c, steps);
    const review = c.math.requests.at(-1)!;
    expect(review.childAnswer).toMatchObject({ value: 2, verdict: "right" });
    expect(c.briefs().at(-1)!.childAnswer).toMatchObject({ value: 2, verdict: "right" });
  });

  it("the asked step is read only in full, from Maya's question", () => {
    expect(askedStep(SUB83, "What do you get for 13 minus 6?")).toEqual({ step: "ones", value: 7 });
    expect(askedStep(SUB83, "Now take away the 6 ones: what is 13 minus 6?")).toEqual({ step: "ones", value: 7 });
    expect(askedStep(SUB52, "What is 4 tens minus 2 tens?")).toEqual({ step: "tens", value: 2 });
    expect(askedStep(ADD, "What is 7 plus 9?")).toEqual({ step: "ones", value: 16 });
    expect(askedStep(ADD, "What is 1 plus 2 plus 3?")).toEqual({ step: "tens", value: 6 });
    // No question, another problem's expression, two expressions, or a statement: no asked step.
    expect(askedStep(SUB83, "13 minus 6 is 7.")).toBeNull();
    expect(askedStep(SUB83, "What is 12 minus 8?")).toBeNull();
    expect(askedStep(SUB83, "Is 13 minus 6 the same as 12 minus 5?")).toBeNull();
    expect(askedStep(SUB83, "How many tens are left?")).toBeNull();
  });

  it("the review input built straight from a session agrees with the brief (one source)", async () => {
    const steps: Step[] = [...asked83, ["It's seven.", "Let's look at the ones together. Which number is on top in the ones?"]];
    const c = session(SUB83, steps, { voice: false });
    await play(c, steps);
    const s = c.s.session;
    // After the turn the session waits; the last review input is the one the turn used.
    expect(c.math.requests.at(-1)!.childAnswer).toMatchObject({ value: 7, verdict: "right" });
    expect(mathReviewInput(s, "x").childAnswer).toBeNull();
  });
});

describe("a digit named with \"the\" says what it stands for (report turn 4)", () => {
  const kind = tutorKind(ADD);
  const check = (x: string) => checkTutorSay(x, { stance: "none", claims: (y) => kind.claimProblems(ADD, y), trades: kind.workValues(ADD), exact: exactTexts(ADD), op: "add" });
  it.each([
    "The carried 1 is a ten, so it goes in the tens column with the other tens.",
    "The carried 1 is a ten.",
    "The 1 is 10.",
    "The 4 is 4 tens.",
    "The top 3 is 3 tens.",
  ])("%s: never 1 = 10; unread, so the math review reads it", (x) => {
    expect(readClaims(x, "add").problems).toEqual([]);
    const v = check(x);
    expect(v.ok).toBe(true);
    expect(v.ok && v.math.length).toBe(1);
  });

  it.each(["4 is 4 tens.", "12 is 4.", "1 ten is 100 ones."])("%s: bare numbers are still read, and refused", (x) => {
    expect(check(x).ok).toBe(false);
  });

  it("a trade with a named digit is still read as a trade", () => {
    expect(readClaims("The 2 becomes 12.", "subtract").problems).toEqual([]);
    expect(readClaims("The 2 becomes 12.", "add").problems.length).toBeGreaterThan(0);
  });

  it("report turn 4 in a voice session: the sentence goes to the math review and the message is said", async () => {
    const SAY = "16 is 1 ten and 6 ones. The carried 1 is a ten, so it goes in the tens column with the other tens. What is 1 plus 2 plus 3?";
    const steps: Step[] = [["What do I do with the ten?", SAY]];
    const c = session(ADD, steps);
    const { said } = await play(c, steps);
    expect(said).toBe(SAY);
    expect(c.math.requests.some((r) => r.sentence.startsWith("The carried 1 is a ten"))).toBe(true);
  });
});

describe("continuedSay (shared by voice and a streaming chat)", () => {
  it("keeps the fixed sentences first and adds only the rest", () => {
    expect(continuedSay(["A is 1."], "B is 2. What is 3?")).toEqual({ text: "A is 1. B is 2. What is 3?", echoed: 0 });
    expect(continuedSay(["A is 1."], "A is 1! B is 2.")).toEqual({ text: "A is 1. B is 2.", echoed: 1 });
    expect(continuedSay(["A is 1.", "B is 2."], "A is 1. C is 3.")).toEqual({ text: "A is 1. B is 2. C is 3.", echoed: 1 });
  });
  it("is null when nothing new comes, or a fixed sentence comes again", () => {
    expect(continuedSay(["A is 1."], "A is 1.")).toBeNull();
    expect(continuedSay(["A is 1."], "")).toBeNull();
    expect(continuedSay(["A is 1."], "B is 2. a is 1.")).toBeNull();
  });
});

describe("the 7 report turns, as continuation repairs", () => {
  // Each: the question, the turns before, the child's turn, the model's message and the sentence refused (by the math or
  // the safety review), and a repair that continues after the streamed first sentence.
  const cases: { name: string; pkg: OperationPackage; before: Step[]; child: string; first: string; refused: string; by: "math" | "talk"; rest: string }[] = [
    { name: "1", pkg: SUB52, before: [["Four.", "12 minus 8 is 4. What is 4 tens minus 2 tens?"]], child: "2.", first: "4 tens minus 2 tens is 2 tens. Yes, 2 is right for the tens, and you worked it out step by step. What number do we get for 52 minus 28?", refused: "Yes, 2 is right for the tens, and you worked it out step by step.", by: "math", rest: "What number do we get for 52 minus 28?" },
    { name: "2", pkg: SUB83, before: [], child: "So it's 37.", first: "83 minus 46 is 37. How did you get 37? Tell me your steps.", refused: "How did you get 37?", by: "talk", rest: "Tell me how you got it, one step at a time." },
    { name: "3", pkg: ADD, before: [], child: "Seven plus nine is fifteen.", first: "7 plus 9 isn't 15. Count up from 9 by 7: 10, 11, 12, 13, 14, 15, 16. Where do you land after 7 steps?", refused: "Count up from 9 by 7: 10, 11, 12, 13, 14, 15, 16.", by: "math", rest: "Start at 9 and count up 7 more. What do you get?" },
    { name: "5", pkg: SUB52, before: [], child: "Is it 36?", first: "52 minus 28 isn't 36. Try again: what is 2 minus 8 in the ones?", refused: "Try again: what is 2 minus 8 in the ones?", by: "math", rest: "We trade 1 ten for 10 ones. What is 12 minus 8?" },
    { name: "6", pkg: SUB83, before: [], child: "Thirteen minus six is eight.", first: "13 minus 6 isn't 8. Maybe you counted back one too many. What number do you land on?", refused: "Maybe you counted back one too many.", by: "math", rest: "Count back 6 from 13. Where do you land?" },
    { name: "7", pkg: SUB83, before: [["Three minus six, I can't do that.", "3 ones is too small to take 6 ones. So we trade 1 ten for 10 ones. What is 13 minus 6?"]], child: "Wait, that's wrong. It's seven.", first: "13 minus 6 is 7. You fixed it yourself. So we write 7 in the ones. How many tens are left in 83?", refused: "You fixed it yourself.", by: "math", rest: "So we write 7 in the ones. We traded 1 ten, so how many tens are left in 83?" },
  ];
  it.each(cases)("report turn $name: the first sentence streams, the repair continues it, no code line", async ({ pkg, before, child, first, refused, by, rest }) => {
    const steps: Step[] = [...before, [child, first, rest]];
    const c = session(pkg, steps, {
      math: (i) => (by === "math" && i.sentence === refused ? FALSE : TRUE),
      talk: (i) => (by === "talk" && i.line === refused ? { verdict: "fail", rules: ["held_limit"], reason: "no" } : PASS),
    });
    const { said } = await play(c, steps);
    const lead = first.split(/(?<=[.?!])\s+/)[0];
    expect(c.heard[0]).toBe(lead);
    expect(said).toBe(`${lead} ${rest}`);
    expect(said).not.toContain(refused);
    expect(said).not.toContain("Let me say that another way");
  });
});

describe("the trace keeps the continuation", () => {
  it("as a repair attempt after a streamed model attempt, with a valid trace", async () => {
    const FIRST = "12 minus 8 is 4.";
    const BAD = "Try again: what is 2 minus 8 in the ones?";
    const steps: Step[] = [["Is it 36?", `${FIRST} ${BAD}`, "What is 4 minus 2 in the tens?"]];
    const c = session(SUB52, steps, { math: (i) => (i.sentence === BAD ? FALSE : TRUE) });
    await play(c, steps);
    const trace = await c.s.finish({ reason: "child_stopped" });
    expect(checkTrace(trace)).toMatchObject({ ok: true });
    const a = attempts(trace);
    const model = a.findLast((x) => x.source === "model")!;
    expect(model.firstSayMs).toBeGreaterThanOrEqual(0);
    expect(a.at(-1)!.source).toBe("repair");
    expect(trace.counts).toMatchObject({ fallbacks: 0 });
  });
});
