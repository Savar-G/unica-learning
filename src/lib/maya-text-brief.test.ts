import { describe, expect, it } from "vitest";
import type { AiClient, AiJsonRequest } from "@/lib/ai-client";
import { createSession, step } from "@/lib/maya";
import { briefParts, conversationalMayaModel, CONVERSATION_PROMPT, STABLE_BRIEF_KEYS, turnBrief, type ModelInput } from "@/lib/maya-model";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";

// C1 (prompt caching): the brief's key order and the shape of the conversational request.

const PKG = SAMPLE_PACKAGES["subtract-52-28"];
const T0 = Date.UTC(2026, 10, 13, 16, 0, 0);

function sessionAfter(...turns: string[]) {
  let s = createSession({ callId: "brief", package: PKG, random: 3, childName: "Ava", conversational: true });
  s = step(s, { type: "start", at: T0 }).session;
  let at = T0;
  for (const text of turns) s = step(s, { type: "child_turn", at: (at += 4000), text }).session;
  return s;
}

describe("C1: the turn brief's key order", () => {
  it("has the stable keys first and the child's turn last of all", () => {
    const keys = Object.keys(turnBrief(sessionAfter("Is 2 minus 8, 6?")));
    expect(keys.slice(0, STABLE_BRIEF_KEYS.length)).toEqual([...STABLE_BRIEF_KEYS]);
    expect(keys).toEqual(["promptVersion", "child", "question", "scopeSkills", "state", "steps", "wordLimit", "noBoard", "transcript", "acts", "help", "draw", "notes", "numbers", "facts", "repair", "childTurn"]);
  });
  it("the stable part is the same bytes for two different child turns, and holds no state of the call", () => {
    const a = turnBrief(sessionAfter("Is 2 minus 8, 6?"));
    const b = turnBrief(sessionAfter("12 minus 8 is 4."));
    const [stableA, turnA] = briefParts(a);
    const [stableB, turnB] = briefParts(b);
    expect(stableA).toBe(stableB);
    expect(stableA.length).toBeGreaterThan(100);
    expect(stableA).not.toMatch(/"state"|transcript|childTurn|Ava/);
    expect(turnA).not.toBe(turnB);
    expect(JSON.parse(stableA + turnA)).toEqual(a);
    expect(stableA + turnA).toBe(JSON.stringify(a));
    expect(a.question?.steps.every((x) => !("state" in x))).toBe(true);
    expect(a.steps.map((x) => x.state)).toContain("now");
  });
});

describe("C1: the conversational request", () => {
  it("sends the prompt with a cache breakpoint, the brief in two parts with a breakpoint after the stable part, strict output and effort low", async () => {
    const sent: AiJsonRequest[] = [];
    const client: AiClient = { model: "anthropic/claude-sonnet-5.5", json: async (request) => { sent.push(request); return {}; } };
    const brief = turnBrief(sessionAfter("Is 2 minus 8, 6?"));
    await conversationalMayaModel(client).propose(brief as unknown as ModelInput, new AbortController().signal);
    const [request] = sent;
    expect(request.system).toBe(CONVERSATION_PROMPT);
    expect(request.cacheSystem).toBe(true);
    expect(request.effort).toBe("low");
    expect(request.content).toHaveLength(2);
    expect(request.content[0]).toMatchObject({ type: "text", cache: true });
    expect(request.content[1]).not.toHaveProperty("cache");
    const text = request.content.map((p) => (p.type === "text" ? p.text : "")).join("");
    expect(text).toBe(JSON.stringify(brief));
    expect(text.trimEnd().endsWith(`"childTurn":"Is 2 minus 8, 6?"}`)).toBe(true);
    expect(request.schema).toMatchObject({ type: "object", additionalProperties: false });
  });
});
