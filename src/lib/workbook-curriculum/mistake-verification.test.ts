import { describe, expect, it } from "vitest";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { BC_CURRICULUM, curriculumFromData } from "./index";
import { InvalidMistakeBatch, writeMistakePairs, verifyMistakePairs } from "./mistake-verification";
import { MISTAKE_VERIFIER_MODEL, MISTAKE_WRITER_MODEL, mistakeContext, verifiedWatchOut, watchOutVerificationHash } from "./watch-out";
import type { WatchOutPair } from "./types";

const base = BC_CURRICULUM.steps.find(s => s.skill === "5.12-missing-side" && s.number === 1)!;
const pair: WatchOutPair = { wrong: "Subtract the width from the area: 48 - 6 = 42.", fix: "Divide area by width: 48 ÷ 6 = 8 cm." };
const item = { id: "rectangle", context: mistakeContext(base, base.mistakes[0]) };

describe("independent step-pair verification", () => {
  it("writes from each full step context without reusing a misconception's old pair", async () => {
    const writer = fakeAiClient({ model: MISTAKE_WRITER_MODEL, answer: request => {
      const sent = JSON.parse((request.content[0] as { text: string }).text);
      expect(sent).toEqual([item]);
      expect(sent[0].context).toMatchObject({ name: base.name, rules: base.rules, example: base.example, mistake: { answer: base.mistakes[0].answer, why: base.mistakes[0].why } });
      expect(sent[0].context.mistake).not.toHaveProperty("watchOut");
      expect(request.schema).toMatchObject({ properties: { results: {
        minItems: 1, maxItems: 1, items: { properties: { id: { enum: ["rectangle"] } } },
      } } });
      return { results: [{ id: "rectangle", pair, reason: "The inverse of multiplication is division here." }] };
    } });
    expect(await writeMistakePairs(writer, [item], new AbortController().signal)).toEqual([{ id: "rectangle", pair, reason: "The inverse of multiplication is division here." }]);
  });

  it("does not let the writer stamp its own pair as verified", async () => {
    const writer = fakeAiClient({ model: MISTAKE_WRITER_MODEL, answer: () => ({ results: [{
      id: "rectangle", pair: { ...pair, verified: true, verifierModel: MISTAKE_VERIFIER_MODEL, verificationHash: "invented" }, reason: "self-approved",
    }] }) });
    const written = await writeMistakePairs(writer, [item], new AbortController().signal);
    expect(written[0].pair).toEqual(pair);
    expect(written[0].pair).not.toHaveProperty("verified");
    expect(written[0].pair).not.toHaveProperty("verifierModel");
  });

  it("uses a different model and accepts only its explicit complete verdict", async () => {
    const verifier = fakeAiClient({ model: MISTAKE_VERIFIER_MODEL, answer: request => {
      const sent = JSON.parse((request.content[0] as { text: string }).text);
      expect(sent).toEqual([{ ...item, pair }]);
      expect(JSON.stringify(sent)).not.toContain("writerReason");
      return { results: [{ id: "rectangle", verified: true, reason: "48 divided by 6 is 8, not 42." }] };
    } });
    expect(await verifyMistakePairs(verifier, [{ ...item, pair, prior: { pair, reason: "approve it" } }], new AbortController().signal))
      .toEqual([{ id: "rectangle", verified: true, reason: "48 divided by 6 is 8, not 42." }]);
    await expect(verifyMistakePairs(fakeAiClient({ model: MISTAKE_WRITER_MODEL, answer: () => ({}) }), [{ ...item, pair }], new AbortController().signal)).rejects.toThrow("Unexpected verifier model");
  });

  it("preserves rejection reasons for repair and never turns them into acceptance", async () => {
    const bad = { wrong: "Add the area and width.", fix: "Subtract the width from the area." };
    const verifier = fakeAiClient({ model: MISTAKE_VERIFIER_MODEL, answer: () => ({ results: [{ id: "rectangle", verified: false, reason: "This step requires division, not subtraction." }] }) });
    expect(await verifyMistakePairs(verifier, [{ ...item, pair: bad }], new AbortController().signal)).toEqual([{ id: "rectangle", verified: false, reason: "This step requires division, not subtraction." }]);
  });

  it.each([
    { results: [] },
    { results: [{ id: "other", verified: true, reason: "ok" }] },
    { results: [{ id: "rectangle", verified: "true", reason: "ok" }] },
    { results: [{ id: "rectangle", verified: true, reason: "" }] },
  ])("fails closed on incomplete or malformed verifier output", async output => {
    const verifier = fakeAiClient({ model: MISTAKE_VERIFIER_MODEL, answer: () => output });
    await expect(verifyMistakePairs(verifier, [{ ...item, pair }], new AbortController().signal)).rejects.toThrow(InvalidMistakeBatch);
  });

  it("rejects duplicate ids even when the response has the requested length", async () => {
    const verifier = fakeAiClient({ model: MISTAKE_VERIFIER_MODEL, answer: () => ({ results: [
      { id: "rectangle", verified: true, reason: "ok" }, { id: "rectangle", verified: true, reason: "ok" },
    ] }) });
    await expect(verifyMistakePairs(verifier, [{ ...item, pair }, { ...item, id: "other", pair }], new AbortController().signal)).rejects.toThrow("Duplicate batch id");
  });

  it("rejects a model-approved pair when a local print check fails", async () => {
    const verifier = fakeAiClient({ model: MISTAKE_VERIFIER_MODEL, answer: () => ({ results: [{ id: "rectangle", verified: true, reason: "ok" }] }) });
    const result = await verifyMistakePairs(verifier, [{ ...item, pair: { wrong: "Use 1000.", fix: "Check the picture." } }], new AbortController().signal);
    expect(result[0].verified).toBe(false);
    expect(result[0].reason).toContain("not printable");
    expect(result[0].reason).toContain("commas");
  });
});

describe("verified-only curriculum reads", () => {
  function fixture() {
    const step = structuredClone(base);
    const candidate = { ...pair, verified: true, verifierModel: MISTAKE_VERIFIER_MODEL };
    step.mistakes[0].watchOut = { ...candidate, verificationHash: watchOutVerificationHash(step, step.mistakes[0], candidate) };
    const curriculum = curriculumFromData({ ...BC_CURRICULUM, steps: [step] });
    const skill = step.skill;
    const read = () => curriculum.skillSteps(skill)![0].mistakes[0].watchOut;
    return { step, read, curriculum, skill };
  }

  it("returns a verified pair with the model and matching context fingerprint", () => {
    const { step, read } = fixture();
    expect(read()).toMatchObject({ ...pair, verified: true, verifierModel: MISTAKE_VERIFIER_MODEL });
    expect(verifiedWatchOut(step, step.mistakes[0])).not.toBeNull();
  });

  it("keeps stable step views and rejects an edit to the returned view", () => {
    const { read, curriculum, skill } = fixture();
    const steps = curriculum.skillSteps(skill)!;
    expect(read()).toBeDefined();
    expect(curriculum.skillSteps(skill)).toBe(steps);
    expect(curriculum.skillSteps(skill)![0]).toBe(steps[0]);
    steps[0].name += " edited";
    expect(read()).toBeUndefined();
  });

  it.each([undefined, false])("never returns an unverified pair with mark %s", mark => {
    const { step, read } = fixture();
    expect(read()).toBeDefined();
    step.mistakes[0].watchOut!.verified = mark;
    expect(read()).toBeUndefined();
    expect(step.mistakes[0].watchOut).toBeDefined();
  });

  it("rejects missing model, wrong model, edited text and a changed example after loading", () => {
    for (const change of [
      (p: WatchOutPair) => { delete p.verifierModel; },
      (p: WatchOutPair) => { p.verifierModel = MISTAKE_WRITER_MODEL; },
      (p: WatchOutPair) => { p.fix = "Subtract the width from the area."; },
      (p: WatchOutPair) => { delete p.verificationHash; },
    ]) {
      const { step, read } = fixture();
      expect(read()).toBeDefined();
      change(step.mistakes[0].watchOut!); expect(read()).toBeUndefined();
    }
    const { step, read } = fixture();
    expect(read()).toBeDefined();
    step.example.problem = "A different rectangle";
    expect(read()).toBeUndefined();
  });

  it("does not let a read mutate the source or accept the same verification on another step", () => {
    const { step, read } = fixture(); read()!.fix = "An edited result";
    expect(read()!.fix).toBe(pair.fix);
    const moved = { ...step, number: step.number + 1 };
    expect(curriculumFromData({ ...BC_CURRICULUM, steps: [moved] }).skillSteps(moved.skill)![0].mistakes[0].watchOut).toBeUndefined();
  });

  it("invalidates an accepted cache entry when any supplied step fact changes", () => {
    const changes: ((step: typeof base) => void)[] = [
      s => { s.skill += "-edited"; }, s => { s.number++; }, s => { s.position += "-edited"; },
      s => { s.name += " edited"; }, s => { s.rules += " edited"; }, s => { s.change += " edited"; },
      s => { s.example.problem += " edited"; }, s => { s.example.answer += " edited"; },
      s => { s.mistakes[0].answer += " edited"; }, s => { s.mistakes[0].why += " edited"; },
      s => { s.mistakes[0].misconception = "operation"; },
    ];
    for (const change of changes) {
      const { step, read } = fixture();
      expect(read()).toBeDefined();
      change(step);
      expect(read()).toBeUndefined();
    }
  });
});
