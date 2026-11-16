import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { aiClient, type AiJsonRequest } from "@/lib/ai-client";
import { AI_FEATURE_PRODUCTS, AI_PRODUCTS, featureProduct, productKey } from "@/lib/ai-product-keys";
import { configureAiUsage, flushAiUsage, type AiFeature, type AiUsageRow } from "@/lib/ai-usage";
import { AI_KEY_ALIASES, keyAlias, keyIdentity } from "@/lib/ai-usage-context";
import { decisionClient } from "@/lib/decision-client";
import { mayaAiClient } from "@/lib/maya-ai-route";
import { markingAiClient, markingClientReady } from "@/lib/scan-marking-ai";
import { explanationAiClient } from "@/lib/parent-problem-explanation-ai";
import { childProfileAiClient } from "@/lib/child-profile-ai";
import { profileAiClient } from "@/lib/learner-profile-ai";
import { aiReviewer } from "@/lib/work-review";
import { photoCheckClient } from "@/lib/scan-photo-check-store";
import { workbookAi } from "@/lib/workbook-ai";
import { configuredSecrets, redactText } from "@/lib/maya-trace";
import { memoryChildProfiles } from "@/lib/child-profile-memory";
import { rebuildChildProfile } from "@/lib/child-profile";
import { learningEvents } from "@/lib/learning-events";

const env = {
  MAYA_OPENROUTER_API_KEY: "synthetic-maya-key",
  SCAN_MARKING_OPENROUTER_API_KEY: "synthetic-marking-key",
  PARENT_EXPLANATION_API_KEY: "synthetic-explanations-key",
  WORKBOOK_OPENROUTER_API_KEY: "synthetic-workbook-key",
  ASSESSMENT_OPENROUTER_API_KEY: "synthetic-assessments-key",
  PROFILE_OPENROUTER_API_KEY: "synthetic-profiles-key",
  OPENROUTER_API_KEY: "old-mixed-key",
  DECISIONS_OPENROUTER_API_KEY: "old-decisions-key",
};
// Expected ownership is independent of the production map.
const expectedProducts = {
  maya: "maya", maya_review: "maya", maya_note: "maya", maya_speech: "maya",
  marking: "marking", photo_check: "marking", explain: "explanations",
  workbook: "workbook", solve_check: "workbook", workbook_gate: "workbook",
  report: "assessments", work_review: "assessments", child_profile: "profiles", learner_profile: "profiles",
} as const;
const expectedKeys = {
  maya: "MAYA_OPENROUTER_API_KEY", marking: "SCAN_MARKING_OPENROUTER_API_KEY", explanations: "PARENT_EXPLANATION_API_KEY",
  workbook: "WORKBOOK_OPENROUTER_API_KEY", assessments: "ASSESSMENT_OPENROUTER_API_KEY", profiles: "PROFILE_OPENROUTER_API_KEY",
} as const;
const features = Object.keys(expectedProducts) as (keyof typeof expectedProducts)[];
const request: AiJsonRequest = { name: "fake", system: "private instructions", content: [{ type: "text", text: "private answer" }], schema: { type: "object" } };
const signal = () => new AbortController().signal;
const response = (id: string, cost: number | undefined = 0.1) => new Response(JSON.stringify({ id, choices: [{ finish_reason: "stop", message: { content: "{}" } }], usage: { prompt_tokens: 4, completion_tokens: 2, cost } }));
let dir: string;
const rows = (): AiUsageRow[] => readFileSync(join(dir, "receipts.jsonl"), "utf8").trim().split("\n").map((s) => JSON.parse(s));
beforeEach(() => {
  vi.clearAllMocks();
  dir = mkdtempSync(join(tmpdir(), "product-keys-"));
  vi.stubEnv("VITEST", ""); vi.stubEnv("VERCEL", ""); vi.stubEnv("SUPABASE_SECRET_KEY", "");
  vi.stubEnv("AI_USAGE_RECEIPT_FILE", join(dir, "receipts.jsonl"));
  vi.stubEnv("AI_USAGE_CONTEXT", "production");
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Unexpected network call"); }));
  configureAiUsage(null);
});
afterEach(async () => {
  await flushAiUsage(); configureAiUsage(null);
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

describe("product credentials", () => {
  it("sends each feature on its exact product key and records one exact generation/cost with the source ids", async () => {
    const sent = new Map<string, string>();
    await Promise.all(features.map(async (feature) => {
      const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
        sent.set(feature, new Headers(init?.headers).get("authorization")!);
        return response(`gen-${feature}`);
      });
      await aiClient(env, "pinned-model", { fetch, usage: { feature, parentId: "p1", childId: "c1", source: { kind: "source", id: `source-${feature}` } } })!.json(request, signal());
      expect(fetch).toHaveBeenCalledTimes(1);
    }));
    const recorded = rows();
    expect(recorded).toHaveLength(features.length);
    const credentials = new Set<string>();
    for (const feature of features) {
      const product = expectedProducts[feature], key = env[expectedKeys[product]];
      expect(sent.get(feature)).toBe(`Bearer ${key}`);
      credentials.add(sent.get(feature)!);
      expect(recorded.filter((r) => r.generation_id === `gen-${feature}`)).toEqual([expect.objectContaining({
        feature, model: "pinned-model", key_alias: product, key_id: keyIdentity(key), cost_usd: 0.1,
        calls: 1, parent_id: "p1", child_id: "c1", source_kind: "source", source_id: `source-${feature}`, usage_context: "production",
      })]);
    }
    expect(credentials.size).toBe(6);
    const receipt = readFileSync(join(dir, "receipts.jsonl"), "utf8");
    expect(receipt).not.toMatch(/private instructions|private answer|synthetic-|old-mixed-key|old-decisions-key/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each(features)("does not enable %s with either old generic key or another product's key", (feature) => {
    const unassigned = { ...env, [expectedKeys[expectedProducts[feature]]]: "  " };
    expect(aiClient(unassigned, undefined, { usage: { feature } })).toBeNull();
    expect(decisionClient(unassigned, undefined, { usage: { feature } })).toBeNull();
    expect(productKey(feature, { OPENROUTER_API_KEY: "shared", DECISIONS_OPENROUTER_API_KEY: "shared-decision" })).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  const names = Object.values(AI_PRODUCTS);
  const pairs = names.flatMap((a, i) => names.slice(i + 1).map((b) => [a, b] as const));
  it.each(pairs)("refuses all clients when %s and %s bind the same trimmed credential", (a, b) => {
    const duplicate = { ...env, [a]: " same-private-key ", [b]: "same-private-key" };
    for (const feature of features) {
      expect(aiClient(duplicate, undefined, { usage: { feature } })).toBeNull();
      expect(decisionClient(duplicate, undefined, { usage: { feature } })).toBeNull();
    }
    expect(markingClientReady(duplicate)).toBe(false);
    expect(markingAiClient(duplicate)(async () => {})).toBeNull();
    expect(explanationAiClient(duplicate)(async () => {})).toBeNull();
    expect(workbookAi(duplicate, { subscription: false })).toMatchObject({ ai: null, solve: null });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("refuses missing, unknown, historical-other and prototype feature names without a request", () => {
    expect(aiClient(env)).toBeNull(); expect(decisionClient(env)).toBeNull();
    for (const feature of ["other", "unknown", "constructor", "toString", "__proto__"]) {
      expect(featureProduct(feature)).toBeNull();
      expect(aiClient(env, undefined, { usage: { feature: feature as AiFeature } })).toBeNull();
      expect(decisionClient(env, undefined, { usage: { feature: feature as AiFeature } })).toBeNull();
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("uses known ownership loaded later without changing the product, context or existing source", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response("gen-profile"));
    const original = aiClient(env, "m", { fetch, usage: { feature: "child_profile", context: "test", source: { kind: "maya_call", id: "call-1" } } })!;
    await original.withUsage!({ parentId: "p", childId: "c", source: { kind: "child_profile", id: "c" } }).json(request, signal());
    expect(rows()).toEqual([expect.objectContaining({ feature: "child_profile", key_alias: "profiles", parent_id: "p", child_id: "c", source_kind: "maya_call", source_id: "call-1", usage_context: "test" })]);
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get("authorization")).toBe(`Bearer ${env.PROFILE_OPENROUTER_API_KEY}`);
  });

  it("keeps practice, evaluation and test separate from production, with unowned calls unassigned", async () => {
    await Promise.all((["practice", "evaluation", "test"] as const).map((context) => aiClient(env, "m", {
      usage: { feature: "maya", context }, fetch: async () => response(`gen-${context}`),
    })!.json(request, signal())));
    await aiClient(env, "m", { usage: { feature: "maya" }, fetch: async () => response("gen-production") })!.json(request, signal());
    expect(rows().map((r) => r.usage_context).sort()).toEqual(["evaluation", "practice", "production", "test"]);
    expect(rows().every((r) => r.parent_id === null && r.child_id === null && r.source_id === null)).toBe(true);
  });

  it("records the family loaded by a real profile rebuild on the profiles key", async () => {
    const parentId = "00000000-0000-4000-8000-0000000000a1", childId = "00000000-0000-4000-8000-0000000000c1";
    const memory = memoryChildProfiles({ children: [{ id: childId, parentId, grade: 3 }], tests: [] });
    const added = await learningEvents(memory.events).append({ key: "profile-test", parentId, childId, source: "call",
      question: { source: "workbook", workbookId: "00000000-0000-4000-8000-0000000000b1", page: 1, question: 1 },
      skill: { standard: "3.3", skills: [] }, result: "right_with_help", stuckStep: null, mistake: null, hints: 1, timeMs: 1000,
      occurredAt: "2026-11-16T12:00:00Z", evidence: { kind: "call", id: "call-1" },
    });
    expect(added.ok).toBe(true);
    const sent: string[] = [];
    vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      sent.push(new Headers(init?.headers).get("authorization")!);
      return new Response(JSON.stringify({ id: "gen-rebuild", choices: [{ finish_reason: "stop", message: { content: '{"findings":[]}' } }], usage: { cost: 0.02 } }));
    }));
    const result = await rebuildChildProfile(childId, { ...memory, ai: childProfileAiClient(env) });
    expect(result).toMatchObject({ built: true, findings: { outcome: "none" } });
    expect(sent).toEqual([`Bearer ${env.PROFILE_OPENROUTER_API_KEY}`]);
    expect(rows()).toEqual([expect.objectContaining({ feature: "child_profile", parent_id: parentId, child_id: childId,
      source_kind: "child_profile", source_id: childId, key_alias: "profiles", cost_usd: 0.02, generation_id: "gen-rebuild" })]);
  });

  it("gives shared Decisions helpers their owning key and preserves every charged retry's generation", async () => {
    for (const [feature, product] of [["photo_check", "marking"], ["workbook_gate", "workbook"]] as const) {
      let attempt = 0;
      const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
        expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${env[AI_PRODUCTS[product]]}`);
        attempt++;
        return new Response(JSON.stringify({ id: `gen-${feature}-${attempt}`, usage: { cost: attempt * 0.01 },
          ...(attempt === 1 ? { error: { message: "retry" } } : { answers: { q: { type: "noul", noul: 0.9 } } }),
        }), { status: attempt === 1 ? 503 : 200 });
      });
      const client = decisionClient(env, undefined, { fetch, priceGuard: async () => {}, usage: { feature, context: "evaluation", parentId: "p", childId: "c", source: { kind: "scan_or_run", id: feature } } })!;
      const result = await client.decide({ input: [{ type: "text", text: "private question" }], questions: { q: { type: "noul", instructions: "test" } }, signal: signal() });
      expect(result.usd).toBeCloseTo(0.03); expect(fetch).toHaveBeenCalledTimes(2);
      const recorded = rows().filter((r) => r.feature === feature);
      expect(recorded).toHaveLength(2);
      expect(recorded.map((r) => [r.generation_id, r.cost_usd])).toEqual([[`gen-${feature}-1`, 0.01], [`gen-${feature}-2`, 0.02]]);
      expect(recorded.every((r) => r.key_alias === product && r.parent_id === "p" && r.child_id === "c" && r.source_id === feature && r.usage_context === "evaluation")).toBe(true);
    }
  });

  it("keeps concrete helpers off without their product key, and keeps Maya's route within Maya", () => {
    const generic = { OPENROUTER_API_KEY: "old", DECISIONS_OPENROUTER_API_KEY: "old-decisions" };
    expect(mayaAiClient(generic)).toBeNull(); expect(aiReviewer(generic)).toBeNull();
    expect(childProfileAiClient(generic)).toBeNull(); expect(profileAiClient(generic)).toBeNull();
    expect(photoCheckClient(generic)).toBeNull(); expect(explanationAiClient(generic)(async () => {})).toBeNull();
    expect(workbookAi(generic, { subscription: false })).toMatchObject({ ai: null, solve: null });
    expect(mayaAiClient(env, undefined, { usage: { feature: "child_profile" } })).toBeNull();
    const wrong = { feature: "other" as const };
    expect(aiReviewer(env, wrong)).toBeNull(); expect(childProfileAiClient(env, wrong)).toBeNull();
    expect(profileAiClient(env, wrong)).toBeNull(); expect(photoCheckClient(env, wrong)).toBeNull();
    expect(markingAiClient(env, undefined, undefined, wrong)(async () => {})).toBeNull();
    expect(explanationAiClient(env, undefined, wrong)(async () => {})).toBeNull();
  });

  it("retains Decisions generation ids on rejected answers and keeps a missing price unknown", async () => {
    const client = decisionClient(env, undefined, { priceGuard: async () => {}, usage: { feature: "photo_check" },
      fetch: async () => new Response(JSON.stringify({ id: "gen-refused", usage: { cost: 0.02 }, error: { message: "blocked" } })),
    })!;
    await expect(client.decide({ input: [], questions: { q: { type: "noul", instructions: "test" } }, signal: signal() })).rejects.toThrow();
    const unpriced = decisionClient(env, undefined, { priceGuard: async () => {}, usage: { feature: "workbook_gate" },
      fetch: async () => new Response(JSON.stringify({ id: "gen-unpriced", answers: { q: { type: "noul", noul: 0.9 } } })),
    })!;
    await unpriced.decide({ input: [], questions: { q: { type: "noul", instructions: "test" } }, signal: signal() });
    expect(rows()).toEqual([
      expect.objectContaining({ generation_id: "gen-refused", cost_usd: 0.02, key_alias: "marking", cost_basis: "provider" }),
      expect.objectContaining({ generation_id: "gen-unpriced", cost_usd: null, key_alias: "workbook", cost_basis: "unknown" }),
    ]);
  });

  it("retains historical aliases and redacts every configured product key", () => {
    expect(AI_FEATURE_PRODUCTS).toEqual(expectedProducts);
    expect(AI_KEY_ALIASES).toEqual(expect.arrayContaining(["main", "decisions", "maya", "workbook", "assessments", "profiles"]));
    expect(keyAlias("old-mixed-key", env)).toBe("main");
    expect(keyAlias("old-decisions-key", env)).toBe("decisions");
    for (const [product, name] of Object.entries(AI_PRODUCTS)) expect(keyAlias(env[name], env)).toBe(product);
    const secrets = configuredSecrets(env);
    for (const name of Object.values(AI_PRODUCTS)) expect(redactText(env[name], null, secrets)).toBe("[secret]");
  });
});
