import { ReadableStream } from "node:stream/web";
import { describe, expect, it, vi } from "vitest";
import type { AudioFrame } from "@livekit/rtc-node";
import { countedSynthesis } from "./speech-audio";

// The voice is counted where it is made (review of PR #640): at the voice provider, for every line that goes through
// the agent's ttsNode (replies, acknowledgement phrases, guidance said again), and only when audio came back.

const frame = {} as AudioFrame;
const text = (s: string) => new ReadableStream<string>({ start(c) { c.enqueue(s); c.close(); } });
const frames = (n: number, fail = false) => new ReadableStream<AudioFrame>({
  start(c) {
    for (let i = 0; i < n; i++) c.enqueue(frame);
    if (fail) c.error(new Error("the voice failed"));
    else c.close();
  },
});
const drain = async (s: ReadableStream<AudioFrame> | null) => {
  if (!s) return 0;
  let n = 0;
  for await (const f of s) { void f; n++; }
  return n;
};

describe("counted synthesis", () => {
  it("counts the text that became audio, once, and passes every frame", async () => {
    const count = vi.fn();
    const out = await countedSynthesis(text("Hello there."), async (input) => { for await (const c of input) void c; return frames(3); }, count);
    expect(await drain(out)).toBe(3);
    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith("Hello there.");
  });

  it("counts nothing when the voice returns no stream, no audio, or fails before audio", async () => {
    const count = vi.fn();
    expect(await countedSynthesis(text("One."), async () => null, count)).toBeNull();
    expect(await drain(await countedSynthesis(text("Two."), async (input) => { for await (const c of input) void c; return frames(0); }, count))).toBe(0);
    await expect(drain(await countedSynthesis(text("Three."), async (input) => { for await (const c of input) void c; return frames(0, true); }, count))).rejects.toThrow();
    await expect(countedSynthesis(text("Four."), async () => { throw new Error("no voice"); }, count)).rejects.toThrow();
    expect(count).not.toHaveBeenCalled();
  });

  it("counts audio already made when the speech is cut", async () => {
    const count = vi.fn();
    const out = await countedSynthesis(text("Cut short."), async (input) => { for await (const c of input) void c; return frames(5); }, count);
    const reader = out!.getReader();
    await reader.read();
    await reader.cancel();
    expect(count).toHaveBeenCalledTimes(1);
  });

  it("never holds the audio back for the count, even when the count fails", async () => {
    const count = vi.fn(() => { throw new Error("no ledger"); });
    const out = await countedSynthesis(text("Tell a grown-up."), async (input) => { for await (const c of input) void c; return frames(2); }, count);
    expect(await drain(out)).toBe(2);
  });
});
