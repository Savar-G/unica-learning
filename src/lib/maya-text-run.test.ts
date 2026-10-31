import { describe, expect, it } from "vitest";
import type { LivekitTextSession } from "@/lib/maya-livekit-text";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession, type TextSession } from "@/lib/maya-text";
import { runTextSession, type TextRun } from "@/lib/maya-text-run";
import { checkTrace, ERROR_MESSAGES, type MayaTrace } from "@/lib/maya-trace";

// The run behind `npm run maya:text` (#322, review R382-1): whatever fails, the call ends and the trace is written
// with its outcome. Fake model, simulated clock, no network, no LiveKit.

function setup(clockFails: () => boolean = () => false) {
  let now = Date.UTC(2026, 9, 31, 16);
  const text = createTextSession({
    callId: "run-1", package: SAMPLE_PACKAGES["add-27-39"], model: ruleMayaModel(), random: 1,
    clock: () => {
      if (clockFails()) throw new Error("the clock broke");
      return now;
    },
  });
  const written: MayaTrace[] = [];
  const logs: string[] = [];
  const debug: string[] = [];
  const base: TextRun = {
    text,
    lines: async function* () { yield* ["I don't know how to start."]; },
    livekit: null,
    advance: (ms) => (now += ms),
    echoChild: true,
    log: (l) => logs.push(l),
    debug: (l) => debug.push(l),
    writeTrace: (t) => written.push(t),
  };
  return { text, base, written, logs, debug };
}

/** A LiveKit stand-in that drives the text session directly. */
const stand = (closeFails: boolean) => async (text: TextSession): Promise<LivekitTextSession> => ({
  open: async () => ({ output: await text.start(), carried: null }),
  say: async (line) => ({ output: await text.child(line), carried: null }),
  close: async () => {
    if (closeFails) throw new Error("LiveKit would not close");
  },
});

/** The call ended as a technical issue with code's own wording; the error's raw text is only in the debug output. */
function endedTechnical(trace: MayaTrace, detail: string, raw: string | null = null, debug: string[] = []) {
  expect(checkTrace(JSON.parse(JSON.stringify(trace)))).toMatchObject({ ok: true });
  expect(trace.outcome).toMatchObject({ reason: "technical_issue" });
  expect(trace.endedAt).not.toBeNull();
  const last = trace.turns.at(-1)!;
  expect(last).toMatchObject({ kind: "technical", detail });
  if (raw) {
    expect(last).toMatchObject({ error: { code: "local", message: ERROR_MESSAGES.local } });
    expect(JSON.stringify(trace)).not.toContain(raw);
    expect(debug.join("\n")).toContain(raw);
  }
}

describe("runTextSession", () => {
  it("ends the call and writes the trace when the script cannot be read", async () => {
    const { base, written, debug } = setup();
    const { trace, error } = await runTextSession({ ...base, lines: () => { throw new Error("ENOENT: no such file"); } });
    expect(error).toBeInstanceOf(Error);
    expect(written).toEqual([trace]);
    endedTechnical(trace, "the run failed", "ENOENT", debug);
    expect(trace.turns.map((t) => t.kind)).toEqual(["start", "maya", "technical"]);
  });

  it("ends the call and writes the trace when LiveKit does not start: the call is started, then ended", async () => {
    const { base, written, debug } = setup();
    const { trace, error } = await runTextSession({ ...base, livekit: async () => { throw new Error("native module missing"); } });
    expect(error).toBeInstanceOf(Error);
    expect(written).toHaveLength(1);
    endedTechnical(trace, "the run failed", "native module missing", debug);
    expect(trace.turns.map((t) => t.kind)).toEqual(["start", "technical"]);
    expect(trace.outcome).toMatchObject({ seconds: 0 });
  });

  it("writes the trace when LiveKit does not close", async () => {
    const { base, written, debug } = setup();
    const { trace, error } = await runTextSession({ ...base, livekit: stand(true) });
    expect(String(error)).toMatch(/would not close/);
    expect(written).toHaveLength(1);
    endedTechnical(trace, "LiveKit did not close", "would not close", debug);
    expect(trace.turns.filter((t) => t.kind === "child")).toHaveLength(1);
  });

  it("ends the call when the session itself throws, with no empty Maya turn left behind", async () => {
    let broken = false;
    const { base, written, debug } = setup(() => broken);
    const { trace, error } = await runTextSession({
      ...base,
      lines: async function* () { broken = true; yield "I got 66."; },
    });
    expect(String(error)).toMatch(/clock broke/);
    expect(written).toHaveLength(1);
    endedTechnical(trace, "the session failed", "the clock broke", debug);
  });

  it("ends a script that stops before the call ends, and returns no error", async () => {
    const { base, written, logs } = setup();
    const { trace, error } = await runTextSession(base);
    expect(error).toBeNull();
    expect(written).toHaveLength(1);
    endedTechnical(trace, "the input ended before the call ended");
    expect(logs).toContain("Child: I don't know how to start.");
  });

  it("ends the call as child_stopped on /quit, with no technical turn (#323)", async () => {
    const { base, written } = setup();
    const { trace, error } = await runTextSession({ ...base, lines: async function* () { yield* ["I don't know how to start.", "/quit", "66"]; } });
    expect(error).toBeNull();
    expect(written).toEqual([trace]);
    expect(checkTrace(JSON.parse(JSON.stringify(trace)))).toMatchObject({ ok: true });
    expect(trace.outcome?.reason).toBe("child_stopped");
    expect(trace.turns.at(-1)?.kind).toBe("hang_up");
    expect(trace.turns.filter((t) => t.kind === "child")).toHaveLength(1);
  });

  it("returns the error when the trace cannot be written", async () => {
    const { base } = setup();
    const { trace, error } = await runTextSession({ ...base, writeTrace: () => { throw new Error("disk full"); } });
    expect(String(error)).toMatch(/disk full/);
    expect(trace.outcome).not.toBeNull();
  });

  it("finishes a call that ended by itself without adding a technical turn", async () => {
    const { base, written } = setup();
    const { trace, error } = await runTextSession({ ...base, lines: async function* () { yield* ["stop", "stop"]; } });
    expect(error).toBeNull();
    expect(written).toHaveLength(1);
    expect(checkTrace(trace)).toMatchObject({ ok: true });
    expect(trace.outcome?.reason).not.toBe("technical_issue");
    expect(trace.turns.some((t) => t.kind === "technical")).toBe(false);
  });
});
