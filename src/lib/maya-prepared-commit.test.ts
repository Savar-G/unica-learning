// C2 key and interim commit (980571e0 voice audit): anonymized from the captured 52 − 28 calls (no names, ids or
// transcripts beyond the exact math words). Public interfaces only: createTextSession, preparedKeys, sameTurn.
import { describe, expect, it } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { memorySpendSeam } from "@/lib/maya-spend-seam";
import * as prepared from "@/lib/maya-prepared";
import type { MayaModel, TurnBrief } from "@/lib/maya-model";

const pkg = SAMPLE_PACKAGES["subtract-52-28"];
const askTwelveMinusEight = () => reply("2 minus 8 isn't 6; 6 is 8 minus 2. Since 2 is smaller than 8, we take a ten. What is 12 minus 8?", "guide", { step: "ones", level: 2, reading: { answers: [{ value: { type: "number", value: 6 }, step: "ones", problem: "target", verdict: "wrong" }] } });
const rightFour = () => reply("Yes, 12 minus 8 is 4. Now the tens are 4, since we took one ten. What is 4 minus 2?", "guide", { step: "tens", reading: { answers: [{ value: { type: "number", value: 4 }, step: "ones", problem: "target", verdict: "right" }] } });
const answer = (brief: TurnBrief) => /2 minus 8, 6/.test(brief.childTurn ?? "") ? askTwelveMinusEight()
  : /\b4\b|four/i.test(brief.childTurn ?? "") ? rightFour()
  : reply("Let's look at the ones: 2 on top and 8 below. Which number is bigger, 2 or 8?", "guide", { step: "ones", level: 1 });

/** The captured context: the opening, a hello, the wrong "2 minus 8, 6?", and Maya's "What is 12 minus 8?". */
async function captured(more: { prepareExpected?: boolean; model?: MayaModel & { briefs?: TurnBrief[] }; spend?: ReturnType<typeof memorySpendSeam> } = {}) {
  let t = 1_000;
  const model = more.model ?? conversationalFake({ answer });
  const spend = more.spend ?? memorySpendSeam(100);
  const session = createTextSession({ callId: "c2-key-commit", package: pkg, clock: () => t, model, spend, prepareExpected: more.prepareExpected ?? false, reviewer: fakeTalkReviewer() });
  await session.start(); t += 5_000;
  await session.child("Hi Maya."); t += 5_000;
  await session.child("Is 2 minus 8, 6?"); t += 1_000;
  return { session, model, spend, tick: (ms: number) => { t += ms; } };
}

describe("C2 key: an expected value binds the real turn that says it in the same context", () => {
  it("binds the captured expected 4 to the final '12 minus 8 is 4.' and credits once at commit", async () => {
    const { session, model, spend } = await captured({ prepareExpected: true });
    const before = (model as { briefs: TurnBrief[] }).briefs.length;
    const recorded = session.trace().preparations?.length ?? 0;
    const out = await session.child("12 minus 8 is 4.");
    // This turn: the expected 4 is used; the known-wrong 6 is discarded: code's facts for 6 differ (its key).
    expect(session.trace().preparations?.slice(recorded).map((p) => [p.kind, p.status, p.reason ?? null])).toEqual([["expected", "used", null], ["expected", "discarded", "key"]]);
    expect(out).toMatchObject({ prepared: "hit", preparedKind: "expected" });
    // No live request for the real turn (later briefs are the next step's own preparations).
    expect((model as { briefs: TurnBrief[] }).briefs.slice(before).map((b) => b.childTurn)).not.toContain("12 minus 8 is 4.");
    expect(session.session.done).toEqual(["ones"]);
    await session.finish();
    expect(spend.settled.length + spend.givenBack.length).toBe(spend.taken.length);
  });
  it("keeps the strict key: a prepared brief offering confirm never serves a turn without it, and confirm-only is never relaxed", () => {
    const keys = (prepared as unknown as { preparedKeys: (s: unknown, b: TurnBrief) => string[] }).preparedKeys;
    expect(typeof keys).toBe("function");
    const session = { turns: [], package: null } as unknown as Parameters<typeof prepared.preparedKey>[0];
    const base = { acts: ["accept_answer", "guide"], transcript: [], childTurn: "4" } as unknown as TurnBrief;
    expect(keys(session, base)).toEqual([prepared.preparedKey(session, base)]);
    const withConfirm = { ...base, acts: ["accept_answer", "guide", "confirm"] } as unknown as TurnBrief;
    expect(keys(session, withConfirm)).toEqual([prepared.preparedKey(session, withConfirm), prepared.preparedKey(session, base)]);
    const confirmOnly = { ...base, acts: ["confirm"] } as unknown as TurnBrief;
    expect(keys(session, confirmOnly)).toEqual([prepared.preparedKey(session, confirmOnly)]);
  });
    it("binds the known-wrong expected 6 to '12 minus 8 is 6.' (the same wrong value, same context)", async () => {
    const { session } = await captured({ prepareExpected: true });
    expect(await session.child("12 minus 8 is 6.")).toMatchObject({ prepared: "hit", preparedKind: "expected" });
    expect(session.session.done).toEqual([]);
  });
  it.each(["12 minus 8 is 5.", "I think 12 minus 8 is 4.", "12 minus 8 is 4?", "Stop.", "12 minus 8 is 4, help."])("does not bind the expected 4 to %s", async (text) => {
    const { session } = await captured({ prepareExpected: true });
    const out = await session.child(text);
    expect(out.preparedKind === "expected" && out.prepared === "hit" ? text : "no expected hit").toBe("no expected hit");
  });
});

const VARIANTS = ["Twelve minus eight is four.", "12 minus 8 equals 4.", "So 12 minus 8 is 4.", "Then 12 minus 8 is 4.", "12 minus 8 is 4!", "12 minus 8 equal 4."];
/** Harmless to the text rule, but an earlier fence keeps them live: code reads them another way (key), or not plain. */
const FENCED = [["key", "12 - 8 is 4."], ["key", "12 minus 8, is 4."], ["not_plain", "Um, 12 minus 8 is 4."], ["not_plain", "It's 12 minus 8 is 4."], ["key or not_plain", "So, 12 minus 8 is 4."]] as const;
const NEGATIVES = [
  ["order", "8 minus 12 is 4."], ["number", "12 minus 8 is 5."], ["extra number", "12 minus 8 is 4 4."], ["act", "12 plus 8 is 4."],
  ["question", "12 minus 8 is 4?"], ["help", "12 minus 8 is 4, help."], ["stop", "Stop, 12 minus 8 is 4."], ["hedge", "I think 12 minus 8 is 4."],
  ["negation", "Not 12 minus 8 is 4."], ["source", "My teacher said 12 minus 8 is 4."], ["ownership", "I got 12 minus 8 is 4."],
  ["paper act", "I wrote 12 minus 8 is 4."], ["correction", "12 minus 8 is 4 no 5."], ["safety", "12 minus 8 is 4 I want to die."], ["range", "12 minus 8 is 4-5."],
] as const;

describe("C2 interim commit: harmless phrasing binds, meaning never does", () => {
  it.each(VARIANTS)("commits the interim '12 minus 8 is 4' for the final %s, with full validation", async (final) => {
    const { session, model, spend } = await captured();
    const before = (model as { briefs: TurnBrief[] }).briefs.length;
    expect(session.prepare({ text: "12 minus 8 is 4", reason: "interim" })).toBe(true);
    const out = await session.child(final);
    expect(out).toMatchObject({ prepared: "hit", preparedKind: "interim" });
    expect((model as { briefs: TurnBrief[] }).briefs.length).toBe(before + 1);
    expect(session.session.done).toEqual(["ones"]);
    await session.finish();
    expect(spend.settled).toHaveLength(1);
    expect(spend.givenBack).toEqual([]);
  });
  it.each(FENCED)("keeps the %s fence for %s, whatever the text rule says", async (reason, final) => {
    const { session } = await captured();
    session.prepare({ text: "12 minus 8 is 4", reason: "interim" });
    expect((await session.child(final)).prepared).toBe("miss");
    const last = session.trace().preparations?.at(-1);
    expect(last?.status).toBe("discarded");
    expect(reason.split(" or ")).toContain(last?.reason);
  });
  it.each(NEGATIVES)("never commits the interim for a different %s: %s", async (_why, final) => {
    const { session, spend } = await captured();
    session.prepare({ text: "12 minus 8 is 4", reason: "interim" });
    const out = await session.child(final);
    expect(out.prepared).not.toBe("hit");
    expect(session.trace().preparations?.some((p) => p.status === "used")).toBe(false);
    await session.finish();
    expect(spend.settled.length + spend.givenBack.length).toBe(spend.taken.length);
  });
  it.each(NEGATIVES)("sameTurn refuses %s both ways", (_why, final) => {
    const same = (prepared as unknown as { sameTurn: (a: string, b: string) => boolean }).sameTurn;
    expect(same("12 minus 8 is 4", final)).toBe(false);
    expect(same(final, "12 minus 8 is 4")).toBe(false);
  });
  it("sameTurn keeps every meaning-bearing form apart", () => {
    const same = (prepared as unknown as { sameTurn: (a: string, b: string) => boolean }).sameTurn;
    for (const v of [...VARIANTS, ...FENCED.map((x) => x[1])]) expect(same("12 minus 8 is 4", v)).toBe(true);
    for (const text of ["-4", "4.5", "four no six", "not four", "four?", "wait four", "like four", "4=", "4%", "4/", "(4)", "40", "4 4", "it", "so", ""]) expect(same("four", text)).toBe(false);
    expect(same("four", "4.")).toBe(true);
    expect(same("twenty-one", "21")).toBe(true);
    expect(same("12-8 is 4", "12 minus 8 is 4")).toBe(false); // unspaced hyphen stays apart (ranges)
  });
  it("never binds the same words in a later context or after the stop fence", async () => {
    const { session } = await captured();
    session.prepare({ text: "12 minus 8 is 4", reason: "interim" });
    session.cancelPending();
    expect((await session.child("12 minus 8 is 4.")).prepared).not.toBe("hit");
    expect((await session.child("12 minus 8 is 4.")).prepared).not.toBe("hit");
  });
  it("binds while the prepared request is still in flight and settles it once as used", async () => {
    let complete!: (v: unknown) => void;
    const fake = conversationalFake({ answer });
    let n = 0;
    const settledHow: { used?: boolean }[] = [];
    const spend = memorySpendSeam(100);
    const seam = { ...spend, settle: (h: Parameters<typeof spend.settle>[0], usd: number, how?: { used?: boolean }) => { spend.settle(h, usd); settledHow.push(how ?? {}); } };
    const model: MayaModel & { briefs: TurnBrief[] } = { ...fake, propose: (brief, signal, onText, onCost) => {
      if ((brief as unknown as TurnBrief).childTurn === "12 minus 8 is 4" && n++ === 0) { fake.briefs.push(brief as unknown as TurnBrief); return new Promise((resolve) => { complete = resolve; }); }
      return fake.propose(brief, signal, onText, onCost);
    } };
    const { session } = await captured({ model, spend: seam as unknown as ReturnType<typeof memorySpendSeam> });
    expect(session.prepare({ text: "12 minus 8 is 4", reason: "interim" })).toBe(true);
    const pending = session.child("So 12 minus 8 is 4.");
    await Promise.resolve(); await Promise.resolve();
    complete(rightFour());
    const out = await pending;
    expect(out).toMatchObject({ prepared: "hit", preparedKind: "interim" });
    await session.finish();
    expect(settledHow).toEqual([{ used: true }]);
  });
  it("still validates a committed interim reply: a leak is refused and repaired", async () => {
    const leak = conversationalFake({ answer: (brief) => brief.childTurn === "12 minus 8 is 4" ? reply("The answer is 24.", "guide", { step: "tens", reading: { answers: [{ value: { type: "number", value: 4 }, step: "ones", problem: "target", verdict: "right" }] } }) : answer(brief) });
    const { session } = await captured({ model: leak });
    session.prepare({ text: "12 minus 8 is 4", reason: "interim" });
    const out = await session.child("So 12 minus 8 is 4.");
    expect(out.prepared).toBe("hit");
    expect(out.say.join(" ")).not.toContain("24");
    expect(session.trace().counts.sayRefusals?.reveals_answer).toBe(1);
  });
});
