import { describe, expect, it } from "vitest";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession } from "@/lib/maya-text";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import type { TurnBrief } from "@/lib/maya-model";
import type { TraceTurn } from "@/lib/maya-trace";

// Round 2 of conversational Maya (D-341): the coordinator's real-model runs of 2026-11-12, as tests on a fake model.

const PKG = SAMPLE_PACKAGES["subtract-52-28"];
const T0 = Date.UTC(2026, 10, 12, 18, 0, 0);
const num = (value: number) => ({ type: "number", value });
const ans = (value: number, step: string) => ({ value: num(value), step, problem: "target", verdict: "right" });

function call(answer: (brief: TurnBrief, n: number) => unknown) {
  let now = T0;
  const model = conversationalFake({ answer });
  const session = createTextSession({ callId: "r2", package: PKG, model, clock: () => (now += 500), random: 3, childName: "Leo", reviewer: fakeTalkReviewer() });
  return { session, model };
}
const sources = (t: TraceTurn | undefined) => (t?.kind === "maya" ? t.attempts.map((a) => a.source) : []);
const lastMaya = (s: ReturnType<typeof call>["session"]) => s.trace().turns.filter((t) => t.kind === "maya").at(-1);

describe("C: a clear final answer is accepted in its turn", () => {
  it("'The tens are 4 minus 2, that's 2. 24!' is accepted, never confirmed", async () => {
    const { session } = call((b) => {
      if (/12 minus 8/.test(b.childTurn ?? "")) return reply("Yes, 12 minus 8 is 4. Now the tens: what is 4 minus 2?", "guide", { step: "tens", reading: { answers: [ans(4, "ones")] } });
      return reply("Yes, 4 minus 2 is 2, so 52 minus 28 is 24. Please write it down.", "accept_answer", { reading: { answers: [ans(2, "tens"), ans(24, "result")] } });
    });
    await session.start();
    await session.child("Oh. 12 minus 8 is 4.");
    const out = await session.child("The tens are 4 minus 2, that's 2. 24!");
    const t = lastMaya(session);
    expect(t?.kind === "maya" && t.attempts.map((a) => a.refusal?.reason ?? null)).toEqual([null]);
    expect(out.say).toEqual(["Yes, 4 minus 2 is 2, so 52 minus 28 is 24. Please write it down."]);
    expect(sources(lastMaya(session))).toEqual(["model"]);
    expect(session.session.solved).toBe("child");
  });
  it("'Okay. The ones are 12 minus 8, 4.' credits the ones", async () => {
    const { session } = call(() => reply("Yes, 12 minus 8 is 4. Now the tens: what is 4 minus 2?", "guide", { step: "tens", reading: { answers: [ans(4, "ones")] } }));
    await session.start();
    await session.child("Okay. The ones are 12 minus 8, 4.");
    expect(session.session.done).toEqual(["ones"]);
    expect(sources(lastMaya(session))).toEqual(["model"]);
  });
});

describe("B: a long reply is cut, not repaired", () => {
  it("keeps the leading sentences that fit, with no second model call", async () => {
    const { session, model } = call(() => reply("Hi Leo. Let's look at the ones. There is a 2 on top and an 8 below it in the column. What can you do there?", "guide", { step: "ones" }));
    await session.start();
    const out = await session.child("Hi");
    // The closing question takes the place of the third sentence: the child gets something to answer.
    expect(out.say).toEqual(["Hi Leo. Let's look at the ones. What can you do there?"]);
    expect(model.briefs).toHaveLength(1);
    expect(sources(lastMaya(session))).toEqual(["model"]);
  });
  it("refuses a first sentence that alone breaks a limit", async () => {
    const long = "Let's look very carefully together at the ones column where there is a 2 on top and an 8 below it right now today.";
    const { session } = call((b, n) => reply(n === 0 ? long : "Let's look at the ones.", "guide", { step: "ones" }));
    await session.start();
    await session.child("Hi");
    expect(sources(lastMaya(session))).toEqual(["model", "repair"]);
  });
});

describe("A: the first sentence streams as it arrives", () => {
  function streamed(answer: (b: TurnBrief, n: number) => unknown) {
    let now = T0;
    const parts: [string, number][] = [];
    const atEnd: [string, number][][] = [];
    const model = conversationalFake({ answer, stream: { chunk: 5, beforeEnd: async () => { atEnd.push([...parts]); } } });
    const session = createTextSession({ callId: "r2s", package: PKG, model, clock: () => (now += 100), random: 3, childName: "Leo", reviewer: fakeTalkReviewer(), onSayPart: (x, i) => parts.push([x, i]) });
    return { session, parts, atEnd };
  }
  it("sends each checked sentence before the reply ends, and never again at delivery", async () => {
    const say = "2 minus 8 isn't 6; 6 is 8 minus 2. 2 is smaller than 8, so we take a ten. What is 12 minus 8?";
    const { session, parts, atEnd } = streamed(() => reply(say, "guide", { step: "ones", level: 2 }));
    await session.start();
    parts.length = 0;
    const out = await session.child("Is 2 minus 8, 6?");
    expect(atEnd[0].map(([x]) => x)).toEqual(["2 minus 8 isn't 6; 6 is 8 minus 2.", "2 is smaller than 8, so we take a ten.", "What is 12 minus 8?"]);
    expect(parts.map(([, i]) => i)).toEqual([0, 1, 2]);
    expect(out.say).toEqual([say]);
    const t = lastMaya(session);
    expect(t?.kind === "maya" && typeof t.attempts[0].firstSayMs).toBe("number");
  });
  it("holds back a sentence that fails, drops the rest, and keeps what was sent", async () => {
    const { session, atEnd, parts } = streamed(() => reply("Let's look at the ones. The answer is 24. What is on top?", "guide", { step: "ones" }));
    await session.start();
    parts.length = 0;
    const out = await session.child("Okay.");
    expect(atEnd[0].map(([x]) => x)).toEqual(["Let's look at the ones."]);
    // The failing middle sentence is never said; the closing question still follows what was sent.
    expect(out.say).toEqual(["Let's look at the ones. What is on top?"]);
  });
  it("after a refused act, code's line follows the streamed sentence, with no repair", async () => {
    const { session, atEnd, parts } = streamed(() => reply("Let's look at the ones together.", "accept_answer"));
    await session.start();
    parts.length = 0;
    const out = await session.child("Okay.");
    expect(atEnd[0].map(([x]) => x)).toEqual(["Let's look at the ones together."]);
    expect(out.say[0].startsWith("Let's look at the ones together. ")).toBe(true);
    expect(sources(lastMaya(session))).toEqual(["model", "fallback"]);
  });
  it("does not stream a turn that is not plain math talk", async () => {
    const { session, atEnd } = streamed(() => reply("A dog sounds fun. Let's look at the ones now.", "redirect", { reading: { offTopic: true } }));
    await session.start();
    await session.child("I have a dog.");
    expect(atEnd).toEqual([]);
  });
});

describe("A: the OpenRouter client streams", () => {
  it("sends stream: true when asked, calls onText as the text grows, and returns the parsed JSON", async () => {
    const { openRouterClient } = await import("@/lib/ai-openrouter");
    const text = JSON.stringify({ say: "Hi. What is 12 minus 8?", act: "guide" });
    const chunks = [text.slice(0, 12), text.slice(12, 30), text.slice(30)];
    const events = [...chunks.map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`), `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { cost: 0.001 } })}\n\n`, "data: [DONE]\n\n"];
    let sentBody: Record<string, unknown> = {};
    const fetch = (async (_url: unknown, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body));
      const body = new ReadableStream({ start(c) { for (const e of events) c.enqueue(new TextEncoder().encode(e)); c.close(); } });
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
    }) as typeof globalThis.fetch;
    const seen: string[] = [];
    const out = await openRouterClient({ apiKey: "k", model: "anthropic/claude-sonnet-5.5", fetch }).json({ name: "maya_reply", system: "s", content: [], schema: { type: "object" }, onText: (x) => seen.push(x) }, new AbortController().signal);
    expect(sentBody.stream).toBe(true);
    expect(seen).toEqual([chunks[0], chunks[0] + chunks[1], text]);
    expect(out).toEqual({ say: "Hi. What is 12 minus 8?", act: "guide" });
  });
  it("sends no reasoning field with effort none (the model default: Sonnet 5.5 refuses reasoning off)", async () => {
    const { openRouterClient } = await import("@/lib/ai-openrouter");
    let sentBody: Record<string, unknown> = {};
    const fetch = (async (_url: unknown, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "{}" } }] }), { status: 200 });
    }) as typeof globalThis.fetch;
    await openRouterClient({ apiKey: "k", model: "m", fetch }).json({ name: "x", system: "s", content: [], schema: { type: "object" }, effort: "none" }, new AbortController().signal);
    expect(sentBody.reasoning).toBeUndefined();
    expect(sentBody.stream).toBe(false);
  });
});

describe("D: off-topic and about-Maya turns are answered in the model's own words", () => {
  it("says the model's honest reply to a dog and a food question, then credits the ones", async () => {
    const { session } = call((b) => {
      const t = b.childTurn ?? "";
      if (/dog/.test(t)) return reply("Max is a nice name. I'm an AI, so I have no pet. What can you do with the 2 and the 8?", "redirect", { reading: { offTopic: true } });
      if (/food/.test(t)) return reply("I'm an AI, so I don't eat. Let's get back to the ones. What can you do there?", "redirect", { reading: { aboutMaya: "identity" } });
      return reply("Yes, 12 minus 8 is 4. Now the tens: what is 4 minus 2?", "guide", { step: "tens", reading: { answers: [ans(4, "ones")] } });
    });
    await session.start();
    expect((await session.child("Do you like dogs? I have a dog named Max.")).say).toEqual(["Max is a nice name. I'm an AI, so I have no pet. What can you do with the 2 and the 8?"]);
    expect((await session.child("What's your favourite food?")).say.join(" ")).toContain("I'm an AI, so I don't eat.");
    await session.child("Okay. The ones are 12 minus 8, 4.");
    expect(session.session.done).toEqual(["ones"]);
  });
});

describe("E: a child who is thinking", () => {
  it("gets one patient line from code, at most twice, with no model call and no help counted", async () => {
    const { session, model } = call(() => reply("Let's look at the ones. What can you do there?", "guide", { step: "ones" }));
    await session.start();
    const a = await session.child("um");
    const b = await session.child("wait");
    const c = await session.child("I'm thinking");
    expect(model.briefs).toHaveLength(0);
    expect(a.say).toEqual(["Take your time, Leo."]);
    expect(b.say).toEqual(["No rush. I'm here when you're ready."]);
    expect(c.say).toEqual([]);
    expect([a.wait, b.wait, c.wait]).toEqual([true, true, true]);
    expect(session.session.hints).toBe(0);
    expect(session.session.prompt).toBeUndefined();
    await session.child("um 2 minus 8");
    expect(model.briefs).toHaveLength(1);
    expect(model.briefs[0].notes.join(" ")).not.toContain("took time to think");
    const trace = await session.finish({ reason: "child_stopped" });
    const { checkTrace } = await import("@/lib/maya-trace");
    expect(checkTrace(trace).ok).toBe(true);
  });
});

describe("F and G: the fallback and the close", () => {
  it("a fallback after two refusals is the step's neutral help, never a confirm", async () => {
    const { session } = call(() => reply("The answer is 24.", "guide", { step: "ones" }));
    await session.start();
    const out = await session.child("12 minus 8 is 4?");
    expect(out.say.join(" ")).not.toMatch(/did you say|heard|was that/i);
  });
  it("after the answer stands, 'I wrote it.' closes warmly with no question", async () => {
    const { session } = call((b) => (/24/.test(b.childTurn ?? "") && !/wrote/.test(b.childTurn ?? "")
      ? reply("Yes, 52 minus 28 is 24. Please write it down.", "accept_answer", { reading: { answers: [ans(24, "result")] } })
      : reply("Good, Leo. Did you write the 4 in the ones place?", "ask_write")));
    await session.start();
    await session.child("Then 4 minus 2 is 2. So it's 24.");
    const out = await session.child("Okay I wrote 24.");
    expect(out.ended?.reason).toBe("solved");
    expect(out.say.join(" ")).not.toContain("?");
  });
});

describe("A: a request for help does not stream", () => {
  it("waits for the whole reply when the child asks for help", async () => {
    let now = T0;
    const atEnd: number[] = [];
    const model = conversationalFake({ answer: () => reply("Sure. Let's look at the ones.", "guide", { step: "ones" }), stream: { beforeEnd: async () => { atEnd.push(parts.length); } } });
    const parts: string[] = [];
    const session = createTextSession({ callId: "r2h", package: PKG, model, clock: () => (now += 100), onSayPart: (x) => parts.push(x) });
    await session.start();
    parts.length = 0;
    await session.child("I don't get it. Can you help me?");
    expect(atEnd).toEqual([]);
    expect(parts).toEqual(["Sure.", "Let's look at the ones."]);
  });
});
