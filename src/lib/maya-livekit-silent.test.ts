import { describe, expect, it } from "vitest";
import { livekitTextSession } from "@/lib/maya-livekit-text";
import { ruleConversationalModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession } from "@/lib/maya-text";
import { runTextSession } from "@/lib/maya-text-run";

// D-341, round 3: a silent "thinking" turn leaves the session ready for the next child turn, on both runners.

const SLOW = ["um", "wait", "I'm thinking", "um 2 minus 8", "I can't do 2 minus 8"];

describe.each(["plain", "livekit"] as const)("the slow script on the %s runner", (runner) => {
  it("answers the turn after the silent one", async () => {
    let now = Date.UTC(2026, 10, 12, 16);
    const text = createTextSession({ callId: `slow-${runner}`, package: SAMPLE_PACKAGES["subtract-52-28"], model: ruleConversationalModel(), clock: () => (now += 1000), random: 1, childName: "Leo", runner: runner === "livekit" ? "livekit-text" : "text" });
    const lines: string[] = [];
    const { trace } = await runTextSession({
      text, lines: () => (async function* () { yield* SLOW; })(), livekit: runner === "livekit" ? livekitTextSession : null,
      advance: () => {}, echoChild: true, log: (l) => lines.push(l), debug: (l) => lines.push(`DEBUG ${l}`), writeTrace: () => {},
    });
    const after = lines.slice(lines.indexOf("Child: um 2 minus 8") + 1);
    expect(after.join("\n")).toMatch(/^Maya: /);
    expect(trace.turns.filter((t) => t.kind === "maya").length).toBeGreaterThanOrEqual(5);
  }, 30_000);
});
