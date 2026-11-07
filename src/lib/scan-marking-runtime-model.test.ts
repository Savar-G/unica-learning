import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => null }));
// Supply complete source-record evidence through the module seam. This does not
// change the real record, environment, release mode or family admission.
vi.mock("@/lib/scan-marking-launch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scan-marking-launch")>();
  const { MARKING_PROMPT_VERSION } = await import("@/lib/scan-marking");
  const candidate = {
    model: "anthropic/claude-sonnet-5.5", prompt: MARKING_PROMPT_VERSION,
    photoSetSha256: "a".repeat(64), printedRevision: "synthetic-print-v1",
  };
  const evidence = {
    candidate,
    items: Object.fromEntries(actual.MARKING_LAUNCH_ITEMS.map(id => [id, {
      owner: "Savar", status: "approved", proof: `synthetic://proof/${id}`, candidate,
      recordedAt: id === "evaluation-bar" ? "2026-11-06T16:00:00.000Z" : "2026-11-06T19:00:00.000Z",
    }])),
    evaluation: {
      barSetAt: "2026-11-06T16:00:00.000Z", startedAt: "2026-11-06T17:00:00.000Z", completedAt: "2026-11-06T18:00:00.000Z",
      maxWrongDefiniteRate: 0.01, maxWrongAsRight: 0, maxClearUnsureRate: 0.05,
      definite: 100, wrongDefinite: 1, wrongAsRight: 0, clear: 100, clearUnsure: 5, plainUnsureReasons: true,
    },
    limits: { sharedUtcMonthUsd: 50, keyTotalUsd: 50, keyReset: "never", comparisonProjectionStopUsd: 15 },
  };
  return { ...actual, SCAN_MARKING_LAUNCH_EVIDENCE: evidence };
});

import { scanMarkingServerReadiness } from "@/lib/scan-marking-server";
import { SCAN_MARKING_LAUNCH_EVIDENCE, scanMarkingLaunchReadiness } from "@/lib/scan-marking-launch";
import { markingAiClient } from "@/lib/scan-marking-ai";

const now = "2026-11-06T20:00:00.000Z";
const unexpectedFetch: typeof fetch = async () => { throw Error("No network is permitted"); };

it("keeps family release held with complete source evidence for the default model", () => {
  expect(scanMarkingServerReadiness({ SCAN_MARKING_ENABLED: "test-only" }, now)).toEqual({
    mode: "test-only", familyReady: false, blockers: ["family-release-held"],
  });
});

it("invalidates source proof when the supported runtime override selects a different model and host", () => {
  const env = {
    SCAN_MARKING_ENABLED: "test-only", SCAN_MARKING_OPENROUTER_API_KEY: "synthetic-key",
    SCAN_MARKING_MODEL: "z-ai/glm-5.3-flash",
  };
  const transport = markingAiClient(env, unexpectedFetch)(async () => { throw Error("No dispatch is permitted"); });
  expect(transport?.client.model).toBe("z-ai/glm-5.3-flash");
  const actualCandidate = { ...SCAN_MARKING_LAUNCH_EVIDENCE.candidate!, model: transport!.client.model };
  expect(scanMarkingLaunchReadiness(actualCandidate, SCAN_MARKING_LAUNCH_EVIDENCE, now).blockers)
    .toContain("candidate-missing-or-stale");
  expect(scanMarkingServerReadiness(env, now).blockers).toContain("candidate-missing-or-stale");
});
