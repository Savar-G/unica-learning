import { describe, expect, it } from "vitest";
import { fakeAiClient } from "@/lib/ai-client-fake";
import {
  freeTalkProblem,
  NEVER_SAY,
  NEVER_SAY_IDS,
  NOT_OK_TALK,
  OK_TALK,
  PHRASES,
  readTalkReview,
  TALK_REVIEW_SCHEMA,
  TALK_REVIEW_SYSTEM,
  type Proposal,
  type TalkReviewInput,
  type TalkReviewResult,
} from "@/lib/maya";
import { fakeMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { aiTalkReviewer, fakeTalkReviewer, runReview, type TalkReviewer } from "@/lib/maya-talk-review";
import { createTextSession } from "@/lib/maya-text";
import { checkTrace, type MayaTrace, type TraceTalk } from "@/lib/maya-trace";

// Free talk with its second check (D-197), through the text adapter's public interface: a fake model, a fake reviewer,
// a passed-in clock. A free-talk line reaches the child only when it passes the code guards and the review.

const PKG = SAMPLE_PACKAGES["add-27-39"];
const T0 = Date.UTC(2026, 9, 31, 16, 0, 0);
const OPEN = { version: 2, act: "open", parts: [{ line: "open.hello" }] };
const talkTurn = (talk: string, extra: Partial<Proposal> = {}) => ({ version: 2, act: "clarify", parts: [{ talk }], ...extra });
const BANK = new Set(Object.values(PHRASES).flat().map((p) => p.replace(/,? ?\{name\}/g, "")));

/** A call with free talk on: the model opens, then answers the child's first turn with `second`. */
async function freeTalkCall(second: unknown, reviewer: TalkReviewer | null, options: { freeTalk?: boolean; child?: string; reviewTimeLimitMs?: number } = {}) {
  let now = T0;
  const answers = [OPEN, second];
  const model = fakeMayaModel({ answer: (_i, n) => answers[Math.min(n, answers.length - 1)] });
  const session = createTextSession({
    callId: "free-1", package: PKG, model, clock: () => (now += 10), random: 3, freeTalk: options.freeTalk ?? true, reviewer,
    ...(options.reviewTimeLimitMs ? { reviewTimeLimitMs: options.reviewTimeLimitMs } : {}),
  });
  await session.start();
  const out = await session.child(options.child ?? "I'm sad today.");
  const trace = await session.finish();
  const read = checkTrace(JSON.parse(JSON.stringify(trace)));
  expect(read.ok, read.ok ? "" : read.reason).toBe(true);
  return { said: out.say.join(" "), trace, talk: talkOf(trace) };
}

/** The free-talk checks of the trace's accepted attempts. */
const talkOf = (t: MayaTrace): TraceTalk[] => t.turns.flatMap((x) => (x.kind === "maya" ? x.attempts.flatMap((a) => a.talk ?? []) : []));
const failWith = (rule: string): TalkReviewResult => ({ verdict: "fail", rules: [rule as never], reason: `breaks ${rule}` });

describe("the never-say list", () => {
  it("names each rule once, with examples", () => {
    expect(new Set(NEVER_SAY_IDS).size).toBe(NEVER_SAY.length);
    for (const e of NEVER_SAY) expect(e.examples.length, e.id).toBeGreaterThanOrEqual(3);
  });

  it("puts every OK line through the code guards, so the paid check measures the review alone", () => {
    for (const ok of OK_TALK) expect(freeTalkProblem(ok.line, null, [ok.childTurn]), ok.line).toBeNull();
    for (const bad of NOT_OK_TALK) expect(freeTalkProblem(bad.line, null, [bad.childTurn]), bad.line).toBeNull();
  });

  it("allows brief empathy that names what the child told, and refuses asking more about it (practice run 5)", () => {
    const privacy = NEVER_SAY.find((e) => e.id === "private_detail")!;
    expect(privacy.rule).toContain("I'm sorry your grandma is sick.");
    expect(privacy.examples).toContain("Your grandma has cancer? What kind?");
    expect(OK_TALK.map((x) => x.line)).toContain("Aw, I'm sorry your grandma is sick. That sounds really hard. Thanks for telling me how you feel.");
  });

  it("allows \"a grown-up you trust\" only for a child who is sad, worried, scared or unsafe, naming no person, in one place", () => {
    const advice = NEVER_SAY.find((e) => e.id === "advice")!;
    const outside = NEVER_SAY.find((e) => e.id === "outside")!;
    expect(advice.rule).toMatch(/sad, worried, scared or unsafe.*a grown-up they trust can help, naming no person/);
    expect(outside.rule).toContain("only to a child who says they are sad, worried, scared or unsafe");
    expect(TALK_REVIEW_SYSTEM).toContain(advice.rule);
    const ok = OK_TALK.filter((x) => /grown-up/.test(x.line));
    expect(ok.length).toBeGreaterThan(0);
    for (const x of ok) expect(x.childTurn).toMatch(/sad|worried|scared|unsafe/i);
    // The same words to a child who is not upset, or a named person to one who is, must fail.
    expect(NOT_OK_TALK.some((x) => /grown-up you trust/.test(x.line) && !/sad|worried|scared|unsafe/i.test(x.childTurn))).toBe(true);
    expect(NOT_OK_TALK.some((x) => /mom|dad|teacher/i.test(x.line) && /worried/i.test(x.childTurn))).toBe(true);
  });

  // One test per entry: the rule and its examples are in the review's instructions and schema, and each example the
  // review fails never reaches the child: the trace records the rule and the bank phrase said instead.
  it.each(NEVER_SAY.map((e) => [e.id, e] as const))("%s: the review reads it, and a line it fails is never said", async (id, entry) => {
    expect(TALK_REVIEW_SYSTEM).toContain(`- ${id}: ${entry.rule}`);
    expect(TALK_REVIEW_SCHEMA.properties.rules.items.enum).toContain(id);
    for (const example of entry.examples) {
      expect(TALK_REVIEW_SYSTEM).toContain(`"${example}"`);
      const reviewer = fakeTalkReviewer((input) => ((entry.examples as readonly string[]).includes(input.line) ? failWith(id) : { verdict: "pass" }));
      const { said, talk } = await freeTalkCall(talkTurn(example), reviewer);
      expect(said, example).not.toContain(example);
      expect(talk).toHaveLength(1);
      if (talk[0].code === null) {
        // The code guards let it through: only the review stopped it.
        expect(reviewer.requests.map((r) => r.line)).toEqual([example]);
        expect(talk[0]).toMatchObject({ proposed: example, review: "fail", rules: [id] });
      } else {
        expect(reviewer.requests).toHaveLength(0);
        expect(talk[0].review).toBe("not_run");
      }
      expect(BANK).toContain(talk[0].shown);
    }
  });
});

describe("reading the review's answer", () => {
  it.each([
    [{ verdict: "pass", rules: [], reason: "" }, { verdict: "pass" }],
    [{ verdict: "fail", rules: ["promise", "promise"], reason: "A promise." }, { verdict: "fail", rules: ["promise"], reason: "A promise." }],
  ])("reads %j", (raw, want) => expect(readTalkReview(raw)).toEqual(want));

  it.each([
    ["an unknown rule", { verdict: "fail", rules: ["rude"], reason: "x" }],
    ["a pass that names a rule", { verdict: "pass", rules: ["promise"], reason: "" }],
    ["a fail with no rule", { verdict: "fail", rules: [], reason: "x" }],
    ["a fail with no reason", { verdict: "fail", rules: ["promise"], reason: " " }],
    ["another field", { verdict: "pass", rules: [], reason: "", ok: true }],
    ["no verdict", { rules: [], reason: "" }],
    ["text", "pass"],
  ])("counts %s as an error (a fail)", (_name, raw) => expect(readTalkReview(raw).verdict).toBe("error"));

  it("sends the line, the child's turn and the transcript through the AI client, with the strict schema", async () => {
    const client = fakeAiClient({ answer: () => ({ verdict: "fail", rules: ["secrecy"], reason: "Keeps a secret." }) });
    const input: TalkReviewInput = { promptVersion: "x", line: "Your secret is safe with me.", childTurn: "Can you keep a secret?", transcript: [] };
    expect(await aiTalkReviewer(client).review(input, new AbortController().signal)).toEqual({ verdict: "fail", rules: ["secrecy"], reason: "Keeps a secret." });
    expect(client.requests[0]).toMatchObject({ name: "maya_talk_review", system: TALK_REVIEW_SYSTEM, schema: TALK_REVIEW_SCHEMA });
    expect(JSON.parse((client.requests[0].content[0] as { text: string }).text)).toEqual(input);
  });

  it("turns a throw and a time-out into an error, with fixed wording only", async () => {
    const input: TalkReviewInput = { promptVersion: "x", line: "Hi!", childTurn: null, transcript: [] };
    const thrown = await runReview({ id: "x", promptVersion: "x", review: () => Promise.reject(new Error("401 sk-secret-key")) }, input);
    expect(thrown).toEqual({ verdict: "error", reason: "the review call failed" });
    expect(await runReview(fakeTalkReviewer(() => "hang"), input, 20)).toEqual({ verdict: "error", reason: "the review did not answer in time" });
  });
});

describe("free talk through the text adapter", () => {
  const LINE = "Oh no, I'm sorry you feel sad.";

  it("says the line when the code guards and the review pass, and records both checks", async () => {
    const reviewer = fakeTalkReviewer();
    const { said, talk, trace } = await freeTalkCall(talkTurn(LINE), reviewer);
    expect(said).toBe(LINE);
    expect(talk).toEqual([{ proposed: LINE, code: null, review: "pass", shown: LINE }]);
    expect(trace.freeTalk).toBe(true);
    expect(trace.reviewer).toEqual({ id: "fake-review", promptVersion: reviewer.promptVersion });
    // The review read the line, the child's words it answers, and the call so far.
    expect(reviewer.requests).toHaveLength(1);
    expect(reviewer.requests[0]).toMatchObject({ line: LINE, childTurn: "I'm sad today." });
    expect(reviewer.requests[0].transcript.at(-1)).toEqual({ speaker: "child", text: "I'm sad today." });
  });

  it.each([
    ["fails", () => failWith("advice"), "fail"],
    ["throws", () => "throw" as const, "error"],
    ["does not answer in time", () => "hang" as const, "error"],
  ])("says a bank phrase when the review %s", async (_name, answer, review) => {
    const { said, talk } = await freeTalkCall(talkTurn(LINE), fakeTalkReviewer(answer), { reviewTimeLimitMs: 20 });
    expect(said).not.toContain(LINE);
    expect(talk[0]).toMatchObject({ proposed: LINE, code: null, review });
    expect(BANK).toContain(talk[0].shown);
  });

  it("says a bank phrase with no reviewer: no review, no free talk", async () => {
    const { said, talk, trace } = await freeTalkCall(talkTurn(LINE), null);
    expect(said).not.toContain(LINE);
    expect(talk[0]).toMatchObject({ code: null, review: "not_run" });
    expect(trace.reviewer).toBeNull();
  });

  it("never asks the review about words the code guards refuse", async () => {
    const reviewer = fakeTalkReviewer();
    const { said, talk } = await freeTalkCall(talkTurn("Keep calculating."), reviewer);
    expect(said).not.toContain("calculating");
    expect(reviewer.requests).toHaveLength(0);
    expect(talk[0]).toMatchObject({ proposed: "Keep calculating.", review: "not_run" });
    expect(talk[0].code).not.toBeNull();
  });

  it("never asks the review about a proposal the session refuses: free talk in a math turn", async () => {
    const reviewer = fakeTalkReviewer();
    const mathTurn = { version: 2, act: "clarify", parts: [{ talk: LINE }, { line: "question.problem" }] };
    const { said, trace } = await freeTalkCall(mathTurn, reviewer);
    expect(said).not.toContain(LINE);
    expect(reviewer.requests).toHaveLength(0);
    const refusals = trace.turns.flatMap((t) => (t.kind === "maya" ? t.attempts.flatMap((a) => (a.refusal ? [a.refusal.code] : [])) : []));
    expect(refusals).toContain("free_talk_in_math_turn");
  });

  it("says only code's words with free talk off, even when the review would pass", async () => {
    const reviewer = fakeTalkReviewer();
    const { said, talk, trace } = await freeTalkCall(talkTurn(LINE), reviewer, { freeTalk: false });
    expect(said).not.toContain(LINE);
    expect(reviewer.requests).toHaveLength(0);
    expect(talk[0]).toMatchObject({ code: "free talk is off", review: "not_run" });
    expect(trace.freeTalk).toBe(false);
  });

  it("reviews each line of a turn, and says only the ones that pass", async () => {
    const ok = "Thanks for telling me.";
    const bad = "I promise I'll be here tomorrow.";
    const reviewer = fakeTalkReviewer((input) => (input.line === bad ? failWith("promise") : { verdict: "pass" }));
    const { said, talk } = await freeTalkCall({ version: 2, act: "clarify", parts: [{ talk: ok }, { talk: bad }] }, reviewer);
    expect(said.startsWith(ok)).toBe(true);
    expect(said).not.toContain("promise");
    expect(talk.map((t) => t.review)).toEqual(["pass", "fail"]);
  });

  it("keeps the flag and the reviewer across a saved and resumed call", async () => {
    let now = T0;
    const answers = [OPEN, talkTurn(LINE)];
    const model = fakeMayaModel({ answer: (_i, n) => answers[Math.min(n, 1)] });
    const reviewer = fakeTalkReviewer();
    const first = createTextSession({ callId: "free-2", package: PKG, model, clock: () => (now += 10), random: 3, freeTalk: true, reviewer });
    await first.start();
    const saved = await first.saved();
    const again = createTextSession({ callId: "free-2", package: PKG, model, clock: () => (now += 10), random: 3, reviewer, resume: saved });
    expect((await again.child("I'm sad today.")).say.join(" ")).toBe(LINE);
  });
});
