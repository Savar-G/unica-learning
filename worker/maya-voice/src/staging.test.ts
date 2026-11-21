import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { inference, initializeLogger } from "@livekit/agents";
import { BackgroundVoiceCancellation, NoiseCancellation } from "@livekit/noise-cancellation-node";
import type { Database } from "@/lib/database";
import { voiceProviders } from "@/lib/maya-voice";
import { voiceSession, type TurnTuning } from "./agent";
import { makeProviders } from "./providers";
import { authorizedStagingCall, labInput, stagingLab, type StagingLab } from "./staging";

// The lab settings of a non-production deployment (docs/maya-voice-deploy.md): a staging worker reads them from the
// job of an admin test call; production (LIVEKIT_AGENT_DEPLOYMENT empty) never does, whatever the job says.
initializeLogger({ pretty: false, level: "warn" });
const job = (lab: unknown) => JSON.stringify({ callId: "c", deployment: "staging", lab });
const all = { interruption: "adaptive", turnDetection: "multimodal", noise: "krisp-bvc" };

describe("a deployment's lab settings", () => {
  it("are none in production, whatever the job asks", () => {
    expect(stagingLab({ LIVEKIT_AGENT_DEPLOYMENT: "" }, job(all))).toBeNull();
    expect(stagingLab({}, job(all))).toBeNull();
    expect(stagingLab({ LIVEKIT_AGENT_DEPLOYMENT: "production" }, job(all))).toBeNull();
  });

  it("are the job's known settings on a named deployment", () => {
    expect(stagingLab({ LIVEKIT_AGENT_DEPLOYMENT: "staging" }, job(all))).toEqual({ deployment: "staging", lab: all });
    expect(stagingLab({ LIVEKIT_AGENT_DEPLOYMENT: "staging" }, job({ interruption: "vad", turnDetection: "stt", noise: "krisp-nc" })))
      .toEqual({ deployment: "staging", lab: { interruption: "vad", turnDetection: "stt", noise: "krisp-nc" } });
  });

  it("read the resume wait from a fixed list only", () => {
    expect(stagingLab({ LIVEKIT_AGENT_DEPLOYMENT: "staging" }, job({ falseInterruptionMs: "700" }))).toEqual({ deployment: "staging", lab: { falseInterruptionMs: "700" } });
    expect(stagingLab({ LIVEKIT_AGENT_DEPLOYMENT: "staging" }, job({ falseInterruptionMs: "650" }))).toEqual({ deployment: "staging", lab: {} });
    expect(stagingLab({ LIVEKIT_AGENT_DEPLOYMENT: "" }, job({ falseInterruptionMs: "700" }))).toBeNull();
  });

  it("keep production's behaviour for a setting the job leaves out or names wrongly", () => {
    expect(stagingLab({ LIVEKIT_AGENT_DEPLOYMENT: "staging" }, job({ interruption: "loud", turnDetection: 3, extra: "x" }))).toEqual({ deployment: "staging", lab: {} });
    expect(stagingLab({ LIVEKIT_AGENT_DEPLOYMENT: "staging" }, "not json")).toBe(false);
    expect(stagingLab({ LIVEKIT_AGENT_DEPLOYMENT: "staging" }, JSON.stringify({ callId: "c" }))).toBe(false);
    expect(stagingLab({ LIVEKIT_AGENT_DEPLOYMENT: "different" }, job(all))).toBe(false);
  });
});

describe("staging call grants", () => {
  const live = { kind: "admin_test", mode: "voice", status: "live", startedBy: "admin", parentId: "test" } as const;
  const db = (grants: { admin?: boolean; family?: boolean; error?: boolean } = {}) => createClient<Database>("https://example.invalid", "fake-key", {
    global: { fetch: async input => {
      const url = new URL(String(input));
      if (grants.error) return Response.json({ message: "lookup failed" }, { status: 500 });
      if (url.pathname.endsWith("/admin_users") && url.searchParams.get("user_id") === "eq.admin" && grants.admin) return Response.json([{ user_id: "admin" }]);
      if (url.pathname.endsWith("/test_accounts") && url.searchParams.get("parent_id") === "eq.test" && grants.family) return Response.json([{ parent_id: "test" }]);
      return Response.json([]);
    } },
  });

  it("allows the two dispatches of an authorized call to check grants independently", async () => {
    const saved = db({ admin: true, family: true });
    expect(await Promise.all([authorizedStagingCall(saved, live), authorizedStagingCall(saved, live)])).toEqual([true, true]);
  });

  it("refuses missing grants, failed lookups, and calls other than a live admin voice test", async () => {
    const allowed = db({ admin: true, family: true });
    const results = await Promise.all([
      authorizedStagingCall(allowed, { ...live, kind: "family" }),
      authorizedStagingCall(allowed, { ...live, kind: "chat" }),
      authorizedStagingCall(allowed, { ...live, mode: "text" }),
      authorizedStagingCall(allowed, { ...live, status: "ended" }),
      authorizedStagingCall(allowed, { ...live, startedBy: null }),
      authorizedStagingCall(db({ family: true }), live),
      authorizedStagingCall(db({ admin: true }), live),
      authorizedStagingCall(db({ error: true }), live),
    ]);
    expect(results).toEqual(Array(8).fill(false));
  });
});

describe("a voice session on a lab deployment", () => {
  const session = async (lab?: StagingLab, turn?: TurnTuning) => {
    const config = voiceProviders({});
    if (!config.ok) throw new Error("fake providers");
    return voiceSession(await makeProviders(config, { fakeMsPerChar: 1 }), { lab, turn });
  };

  it("is production's without lab settings: the speech-to-text ends the turn and no interruption mode is set", async () => {
    const s = await session();
    expect(s.turnDetection).toBe("stt");
    expect(s.interruptionDetection).toBeUndefined();
    expect(await labInput(undefined)).toEqual({});
    expect(await labInput({})).toEqual({});
  });

  it("uses the lab's interruption mode and LiveKit's multimodal turn detector", async () => {
    expect((await session({ interruption: "adaptive" })).interruptionDetection).toBe("adaptive");
    expect((await session({ interruption: "vad" })).interruptionDetection).toBe("vad");
    expect((await session({ turnDetection: "multimodal" })).turnDetection).toBeInstanceOf(inference.TurnDetector);
    expect((await session({ turnDetection: "stt" })).turnDetection).toBe("stt");
  });

  it("keeps a real call's interruption mode, and lets the lab's mode win over it", async () => {
    const turn = { turnMinDelayMs: 100, interruptMinMs: 300, interruptMinWords: 0, interruptMode: "adaptive" as const };
    expect((await session(undefined, turn)).interruptionDetection).toBe("adaptive");
    expect((await session({ interruption: "vad" }, turn)).interruptionDetection).toBe("vad");
  });

  it("keeps a real call's resume wait, and lets the lab's wait win over it", async () => {
    const turn = { turnMinDelayMs: 100, interruptMinMs: 30, interruptMinWords: 0, interruptMode: "vad" as const, falseInterruptionMs: 1000 };
    const wait = (s: Awaited<ReturnType<typeof session>>) => s.sessionOptions.turnHandling.interruption.falseInterruptionTimeout;
    expect(wait(await session(undefined, turn))).toBe(1000);
    expect(wait(await session({ falseInterruptionMs: "700" }, turn))).toBe(700);
  });

  it("filters the child's audio with the lab's Krisp model", async () => {
    expect((await labInput({ noise: "krisp-nc" })).noiseCancellation).toEqual(NoiseCancellation());
    expect((await labInput({ noise: "krisp-bvc" })).noiseCancellation).toEqual(BackgroundVoiceCancellation());
    expect(NoiseCancellation()).not.toEqual(BackgroundVoiceCancellation());
  });
});
