import { describe, expect, it, vi } from "vitest";
import type { AiJsonRequest } from "@/lib/ai-client";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { costingFetch, openRouterClient } from "@/lib/ai-openrouter";
import { createSession, NEVER_SAY } from "@/lib/maya";
import { aiMayaModel, modelInput, PROMPT_VERSION } from "@/lib/maya-model";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { aiChildSimulator, aiJudge, aiValidityJudge, DIMENSION_IDS, DIMENSIONS, PRACTICE_CASES, readJudgement, readValidity } from "@/lib/maya-practice";
import { readSimulatorTurn } from "@/lib/maya-practice/simulator";
import { aiTalkReviewer } from "@/lib/maya-talk-review";
import { createTextSession } from "@/lib/maya-text";
import { readFromFence } from "@/lib/ai-fenced";
import { checkTrace, fencedReplies } from "@/lib/maya-trace";

const MODEL = "anthropic/claude-sonnet-5.5";
const signal = () => new AbortController().signal;
const input = () => modelInput(createSession({ callId: "schema", package: FIXTURES.A, random: 3 }));
const open = { version: 2, act: "open", parts: [{ line: "open.hello" }] };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, required, properties });
const request = (schema: Record<string, unknown>): AiJsonRequest => ({ name: "schema_control", system: "Trusted instructions.", content: [{ type: "text", text: "Untrusted data." }], schema });

// Independent fake-provider rules. Counts schema occurrences, including repeated judge dimensions.
function audit(schema: unknown): { unions: number; optional: number; constraints: string[] } {
  const result = { unions: 0, optional: 0, constraints: [] as string[] };
  function visit(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const s = value as Record<string, unknown>;
    if ((Array.isArray(s.anyOf) && s.anyOf.length > 1) || (Array.isArray(s.type) && s.type.length > 1)) result.unions++;
    const required = Array.isArray(s.required) ? s.required : [];
    if (s.properties) result.optional += Object.keys(s.properties).filter((k) => !required.includes(k)).length;
    for (const key of ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "maxItems", "uniqueItems"]) {
      if (key in s) result.constraints.push(key);
    }
    if (s.minItems !== undefined && s.minItems !== 0 && s.minItems !== 1) result.constraints.push("minItems");
    for (const [key, child] of Object.entries(s)) {
      if (["properties", "$defs", "definitions", "patternProperties"].includes(key)) Object.values(child as object).forEach(visit);
      else if (["anyOf", "allOf", "oneOf", "prefixItems"].includes(key)) (child as unknown[]).forEach(visit);
      else if (["items", "additionalProperties"].includes(key)) visit(child);
    }
  }
  visit(schema);
  return result;
}

type Wire = { model: string; messages: { role: string; content: unknown }[]; response_format?: { type: string; json_schema?: { name: string; strict: boolean; schema: Record<string, unknown> } }; [key: string]: unknown };

function provider(answer: unknown = open, options: { raw?: string; status?: number } = {}) {
  const sent: { body: Wire; init: RequestInit }[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as Wire;
    sent.push({ body, init: init! });
    const schema = body.response_format?.json_schema?.schema;
    const shape = audit(schema);
    if (schema && (shape.unions > 16 || shape.optional > 24 || shape.constraints.length)) {
      return new Response(JSON.stringify({ error: { message: `Schema rejected: ${shape.unions} union fields; limit 16; constraints ${shape.constraints.join(",")}` } }), { status: 400 });
    }
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: options.raw ?? JSON.stringify(answer) } }], usage: { cost: 0.002 } }), { status: options.status ?? 200 });
  });
  return { sent, fetch, client: openRouterClient({ apiKey: "fake-key", model: MODEL, fetch }) };
}

async function practiceRequests() {
  const fake = fakeAiClient({ answer: () => null });
  await aiMayaModel(fake).propose(input(), signal());
  await aiChildSimulator(fake).next({ promptVersion: "test", persona: PRACTICE_CASES[0].persona, maxWords: 25, transcript: [] }, signal());
  await aiValidityJudge(fake).check({ promptVersion: "test", persona: PRACTICE_CASES[0].persona, childTurns: [{ id: 1, text: "Hello." }], call: [{ speaker: "child", text: "Hello.", childTurn: 1 }] }, signal());
  await aiJudge(fake).judge({ promptVersion: "test", channel: "chat", question: { text: "27 + 39 = ?", answer: "66", steps: [], easierExample: null }, child: { age: 7 }, expected: "test", rubric: DIMENSION_IDS.map((id) => ({ id, ...DIMENSIONS[id] })), turns: [], outcome: null }, signal());
  await aiTalkReviewer(fake).review({ promptVersion: "test", line: "Hello.", childTurn: null, transcript: [] }, signal());
  return fake.requests;
}

describe("OpenRouter schema compatibility through public callers and fake HTTP", () => {
  it("dispatches the actual Maya 35-union schema once and keeps the complete schema in trusted instructions", async () => {
    const [actual] = await practiceRequests();
    expect(audit(actual.schema)).toMatchObject({ unions: 35, optional: 0 });
    const p = provider();
    await expect(aiMayaModel(p.client).propose(input(), signal())).resolves.toEqual(open);
    expect(p.sent).toHaveLength(1);
    const wire = p.sent[0].body;
    expect(wire).not.toHaveProperty("response_format");
    expect(wire.messages[0].role).toBe("system");
    expect(wire.messages[0].content).toContain(actual.system);
    expect(wire.messages[0].content).toContain(JSON.stringify(actual.schema));
    expect(wire.messages[1]).toEqual({ role: "user", content: [{ type: "text", text: JSON.stringify(input()) }] });
    expect(wire).toMatchObject({ model: MODEL, stream: false, max_tokens: 4000, provider: { require_parameters: true }, reasoning: { effort: "low", exclude: true } });
    expect(PROMPT_VERSION).toBe("maya-text-chat-30");
  });

  it("keeps feature routing and admission hooks when the shared schema adapter uses instructions", async () => {
    const p = provider(), events: string[] = [];
    const route = { only: ["google-vertex/global"], order: ["google-vertex/global"],
      allow_fallbacks: false as const, require_parameters: true as const };
    const client = openRouterClient({ apiKey: "fake-key", model: MODEL, fetch: p.fetch, provider: route,
      onRequest: async () => { events.push("admitted"); }, onDispatch: () => { events.push("dispatched"); } });
    await expect(aiMayaModel(client).propose(input(), signal())).resolves.toEqual(open);
    expect(events).toEqual(["admitted", "dispatched"]);
    expect(p.sent).toHaveLength(1);
    expect(p.sent[0].body.provider).toEqual(route);
    expect(p.sent[0].body).not.toHaveProperty("response_format");
    const [actual] = await practiceRequests();
    expect(p.sent[0].body.messages[0].content).toContain(JSON.stringify(actual.schema));
  });

  it("inventories and dispatches every practice role, with supported roles still structured", async () => {
    const requests = await practiceRequests();
    const inventory = requests.map((r) => ({ name: r.name, ...audit(r.schema) }));
    expect(inventory.map(({ name, unions, optional }) => ({ name, unions, optional }))).toEqual([
      { name: "maya_proposal", unions: 35, optional: 0 },
      { name: "practice_child", unions: 2, optional: 0 },
      { name: "practice_validity", unions: 0, optional: 0 },
      { name: "practice_judgement", unions: 8, optional: 0 },
      { name: "maya_talk_review", unions: 0, optional: 0 },
    ]);
    expect([...new Set(inventory[0].constraints)].sort()).toEqual(["maxItems", "maxLength", "minItems", "minimum"]);
    expect(inventory.slice(1).map((r) => r.constraints)).toEqual([[], [], [], ["maxLength"]]);
    for (const r of requests) {
      const p = provider();
      await p.client.json(r, signal());
      expect(p.sent).toHaveLength(1);
      if (r.name === "maya_proposal" || r.name === "maya_talk_review") {
        expect(p.sent[0].body).not.toHaveProperty("response_format");
        expect(p.sent[0].body.messages[0].content).toContain(JSON.stringify(r.schema));
      } else {
        expect(p.sent[0].body.response_format).toEqual({ type: "json_schema", json_schema: { name: r.name, strict: true, schema: r.schema } });
        expect(p.sent[0].body.messages[0].content).toBe(r.system);
      }
    }
  });

  it.each([
    [16, 24, false], [17, 24, true], [16, 25, true],
  ])("handles %i unions and %i optional fields at the documented boundary", async (unions, optional, instructions) => {
    const properties = Object.fromEntries(Array.from({ length: unions + optional }, (_, i) => [`p${i}`, i < unions ? { anyOf: [{ type: "string" }, { type: "null" }] } : { type: "string" }]));
    const r = request(object(properties, Object.keys(properties).slice(0, unions)));
    const p = provider();
    await p.client.json(r, signal());
    expect(!!p.sent[0].body.response_format).toBe(!instructions);
    if (instructions) expect(p.sent[0].body.messages[0].content).toContain(JSON.stringify(r.schema));
  });

  it("counts nested type-array unions and optional fields across branches", async () => {
    const branch = object({ nested: object(Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`p${i}`, { type: ["string", "null"] }]))) });
    const r = request(object({ result: { anyOf: [branch, { type: "null" }] } }));
    const p = provider();
    await p.client.json(r, signal());
    expect(p.sent[0].body).not.toHaveProperty("response_format");
    const optional = request(object({ result: { anyOf: [object(Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`p${i}`, { type: "string" }])), []), { type: "null" }] } }));
    await p.client.json(optional, signal());
    expect(p.sent[1].body).not.toHaveProperty("response_format");
  });

  it.each([
    { type: "string", maxLength: 300 }, { type: "string", minLength: 1 },
    { type: "integer", minimum: 0 }, { type: "number", maximum: 3 },
    { type: "number", exclusiveMinimum: 0 }, { type: "number", exclusiveMaximum: 4 }, { type: "number", multipleOf: 2 },
    { type: "array", items: { type: "string" }, maxItems: 4 },
    { type: "array", items: { type: "string" }, minItems: 2 },
    { type: "array", items: { type: "string" }, uniqueItems: true },
  ])("keeps the full unsupported constraint in instructions: %j", async (field) => {
    const r = request(object({ result: { anyOf: [field, { type: "null" }] } }));
    const p = provider();
    await p.client.json(r, signal());
    expect(p.sent[0].body).not.toHaveProperty("response_format");
    expect(p.sent[0].body.messages[0].content).toContain(JSON.stringify(r.schema));
  });

  it("preserves the marking v6 shape with two nullable anyOf fields and length only in a description", async () => {
    const schema = object({ text: { anyOf: [{ type: "string", description: "At most 300 characters." }, { type: "null" }] }, issue: { anyOf: [{ type: "string" }, { type: "null" }] } });
    const r = request(schema);
    const p = provider();
    await p.client.json(r, signal());
    expect(p.sent[0].body.response_format).toEqual({ type: "json_schema", json_schema: { name: r.name, strict: true, schema } });
    expect(p.sent[0].body.messages[0].content).toBe(r.system);
  });

  it.each([0, 1])("keeps supported minItems %i and schema keyword property names structured", async (minItems) => {
    const schema = object({ minLength: { type: "string", description: "maxLength minimum anyOf" }, anyOf: { type: "array", minItems, items: { type: "string" } } });
    const p = provider();
    await p.client.json(request(schema), signal());
    expect(p.sent[0].body.response_format?.json_schema?.schema).toEqual(schema);
  });

  it("does not change another model's structured request", async () => {
    const [actual] = await practiceRequests();
    // This fetch records without the Claude-only fake-provider rejection.
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: "openai/gpt-5.4", response_format: { type: "json_schema", json_schema: { schema: actual.schema } }, messages: [{ role: "system", content: actual.system }, { role: "user" }] });
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "{}" } }] }));
    });
    await openRouterClient({ apiKey: "fake-key", model: "openai/gpt-5.4", fetch }).json(actual, signal());
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps dispatch, cost, headers and cancellation hooks, with no hidden retry on 400", async () => {
    const [actual] = await practiceRequests();
    const p = provider();
    const onCost = vi.fn(); const onRequest = vi.fn(); const onDispatch = vi.fn();
    const client = openRouterClient({ apiKey: "fake-key", model: MODEL, fetch: costingFetch(onCost, p.fetch), onRequest, onDispatch });
    await client.json(actual, signal());
    expect(onCost).toHaveBeenCalledExactlyOnceWith(0.002);
    expect(onRequest).toHaveBeenCalledTimes(1); expect(onDispatch).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries(new Headers(p.sent[0].init.headers))).toEqual({ authorization: "Bearer fake-key", "content-type": "application/json", "x-openrouter-title": "Unica Learning" });
    expect(p.sent[0].body.usage).toEqual({ include: true });
    const controller = new AbortController(); controller.abort();
    await expect(client.json(actual, controller.signal)).rejects.toThrow("time is up");
    expect(p.sent).toHaveLength(1);
    const failing = provider(open, { status: 400 });
    await expect(failing.client.json(actual, signal())).rejects.toThrow("400");
    expect(failing.sent).toHaveLength(1);
  });

  it.each(["not JSON", '{"version":'])("still rejects malformed output: %s", async (raw) => {
    const p = provider(open, { raw });
    await expect(aiMayaModel(p.client).propose(input(), signal())).rejects.toThrow("not valid JSON");
    expect(p.sent).toHaveLength(1);
  });

  // First-ship practice at 6de7e777: 9 of 319 Maya calls failed as bad_json once her request went out without
  // response_format. Exactly one outer fence is read for such a request, and noted; a request with response_format is not.
  const fence = (body: string, tag = "json") => `\`\`\`${tag}\n${body}\n\`\`\``;
  it.each([
    ["a ```json fence", fence(JSON.stringify(open))],
    ["a bare ``` fence", fence(JSON.stringify(open), "")],
    ["a fence with spaces and new lines around it", `\n  ${fence(JSON.stringify(open, null, 2))}  \n`],
  ])("reads %s on a request sent without response_format, and notes it", async (_name, raw) => {
    const p = provider(open, { raw });
    const out = await aiMayaModel(p.client).propose(input(), signal());
    expect(out).toEqual(open);
    expect(readFromFence(out)).toBe(true);
    expect(p.sent[0].body.response_format).toBeUndefined();
    const plain = provider(open);
    expect(readFromFence(await aiMayaModel(plain.client).propose(input(), signal()))).toBe(false);
  });

  it.each([
    ["prose before the block", `Here is my proposal:\n${fence(JSON.stringify(open))}`],
    ["prose after the block", `${fence(JSON.stringify(open))}\nI hope this helps.`],
    ["two blocks", `${fence(JSON.stringify(open))}\n${fence(JSON.stringify(open))}`],
    ["an unclosed fence", `\`\`\`json\n${JSON.stringify(open)}`],
    ["a nested fence", fence(`\`\`\`json\n${JSON.stringify(open)}\n\`\`\``)],
    ["another language", fence(JSON.stringify(open), "js")],
    ["no JSON inside", fence("not JSON")],
    ["cut-off JSON inside", fence('{"version":')],
  ])("still rejects %s as not JSON on a request sent without response_format", async (_name, raw) => {
    const p = provider(open, { raw });
    await expect(aiMayaModel(p.client).propose(input(), signal())).rejects.toThrow("not valid JSON");
    expect(p.sent).toHaveLength(1);
  });

  it("keeps the strict reading for a request that sent response_format: a fenced output is still not JSON", async () => {
    const turn = { action: "say", text: "Hi.", seconds: null, stop: false };
    const p = provider(turn, { raw: fence(JSON.stringify(turn)) });
    const child = aiChildSimulator(p.client);
    await expect(child.next({ promptVersion: "test", persona: PRACTICE_CASES[0].persona, maxWords: 25, transcript: [] }, signal())).rejects.toThrow("not valid JSON");
    expect(p.sent[0].body.response_format).toMatchObject({ type: "json_schema" });
    const plain = provider(turn);
    await expect(aiChildSimulator(plain.client).next({ promptVersion: "test", persona: PRACTICE_CASES[0].persona, maxWords: 25, transcript: [] }, signal())).resolves.toEqual(turn);
    expect(plain.sent[0].body.response_format).toMatchObject({ type: "json_schema" });
  });

  it("checks a fenced proposal against the same schema and rules, and counts it in the trace", async () => {
    const bad = { version: 99, act: "open", parts: [] };
    const p = provider(bad, { raw: fence(JSON.stringify(bad)) });
    const session = createTextSession({ callId: "schema-fenced-bad", package: FIXTURES.A, model: aiMayaModel(p.client), clock: () => 1000, random: 3, channel: "chat", freeTalk: false });
    await session.start();
    const trace = session.trace();
    // Refused as an unfenced one would be: the model, its repair, then code's fallback.
    expect(trace.counts).toMatchObject({ refusals: 2, fallbacks: 1 });
    const attempts = trace.turns.flatMap((t) => (t.kind === "maya" ? t.attempts : []));
    expect(attempts.filter((a) => a.fenced === true).map((a) => a.source)).toEqual(["model", "repair"]);
    expect(fencedReplies(trace.turns)).toEqual({ calls: 2, fenced: 2 });
    expect(checkTrace(JSON.parse(JSON.stringify(trace)))).toMatchObject({ ok: true });

    const good = provider(open, { raw: fence(JSON.stringify(open)) });
    const accepted = createTextSession({ callId: "schema-fenced-good", package: FIXTURES.A, model: aiMayaModel(good.client), clock: () => 1000, random: 3, channel: "chat", freeTalk: false });
    expect((await accepted.start()).say.join(" ")).toContain("Maya");
    expect(fencedReplies(accepted.trace().turns)).toEqual({ calls: 1, fenced: 1 });
    const plain = provider(open);
    const unfenced = createTextSession({ callId: "schema-plain", package: FIXTURES.A, model: aiMayaModel(plain.client), clock: () => 1000, random: 3, channel: "chat", freeTalk: false });
    await unfenced.start();
    expect(fencedReplies(unfenced.trace().turns)).toEqual({ calls: 1, fenced: 0 });
    expect(JSON.stringify(unfenced.trace())).not.toContain("fenced");
  });

  it.each([
    { version: 99, act: "open", parts: [] },
    { version: 2, act: "open", parts: [{ talk: "Keep this secret from your parents." }] },
  ])("keeps malformed and unsafe proposals out of child output", async (bad) => {
    const p = provider(bad);
    const session = createTextSession({ callId: "schema-unsafe", package: FIXTURES.A, model: aiMayaModel(p.client), clock: () => 1000, random: 3, channel: "chat", freeTalk: false });
    const out = await session.start();
    expect(out.say.join(" ")).not.toContain("Keep this secret");
    expect(session.trace().counts).toMatchObject({ refusals: 2, fallbacks: 1 });
    // These two requests are the existing caller repair, not transport retries.
    expect(p.sent).toHaveLength(2);
    expect(p.sent.every((s) => !s.body.response_format)).toBe(true);
  });

  it("keeps invalid free-talk reviews failed and a real fail verdict failed", async () => {
    for (const answer of [{ verdict: "pass", rules: [], reason: "x".repeat(301) }, { verdict: "pass", rules: ["invented"], reason: "" }, { verdict: "pass", rules: [], reason: "this is unsafe" }]) {
      const p = provider(answer);
      const result = await aiTalkReviewer(p.client).review({ promptVersion: "test", line: "Hello.", childTurn: null, transcript: [] }, signal());
      expect(result.verdict).toBe("error");
      expect(p.sent).toHaveLength(1);
    }
    const p = provider({ verdict: "pass", rules: [], reason: "" });
    await expect(aiTalkReviewer(p.client).review({ promptVersion: "test", line: "Hello.", childTurn: null, transcript: [] }, signal())).resolves.toEqual({ verdict: "pass" });
    const fail = { verdict: "fail", rules: [NEVER_SAY[0].id], reason: "The line breaks the rule." };
    const failed = provider(fail);
    await expect(aiTalkReviewer(failed.client).review({ promptVersion: "test", line: "Unsafe line.", childTurn: null, transcript: [] }, signal())).resolves.toEqual(fail);
  });

  it("keeps practice validators rejecting invalid simulator and judge outputs after transport parsing", async () => {
    const requests = await practiceRequests();
    const simulator = provider({ action: "say", text: "Hello", seconds: 999, stop: false });
    expect(readSimulatorTurn(await simulator.client.json(requests[1], signal())).ok).toBe(false);
    const validity = provider({ persona_ok: true, knows_too_much: false, reasons: [], turns: [99] });
    expect(readValidity(await validity.client.json(requests[2], signal()), 1).ok).toBe(false);
    const judge = provider({ J01: { status: "scored", score: 4, turns: [1], reason: "Invalid score." } });
    expect(readJudgement(await judge.client.json(requests[3], signal()), ["J01"], 1).ok).toBe(false);
  });
});
