import { EventEmitter } from "node:events";
import { voice } from "@livekit/agents";
import { describe, expect, it } from "vitest";
import { attachStopTiming, type StopTiming } from "./stop-timing";

// The staging-only stop timing (#1137): when the worker heard the child, asked its output to pause or clear, and when
// the output's audio actually stopped. On LiveKit Cloud the child-side stop splits into the worker's reaction and the
// network plus playout. Times are the worker's own clock.

/** A session with the parts the record reads: its events and the audio output the SDK pauses and clears. */
function fakeSession(clock: { now: number }) {
  const calls: string[] = [];
  const audio = Object.assign(new EventEmitter(), {
    pause: () => { calls.push(`pause@${clock.now}`); },
    clearBuffer: () => { calls.push(`clear@${clock.now}`); },
    resume: () => { calls.push(`resume@${clock.now}`); },
  });
  const session = Object.assign(new EventEmitter(), { output: { audio } });
  const speaking = (at: number) => session.emit(voice.AgentSessionEventTypes.UserStateChanged, { newState: "speaking", oldState: "listening", createdAt: at });
  const progressed = (startedAt: number, duration: number) => audio.emit(voice.AudioOutput.EVENT_PLAYBACK_PROGRESSED, { startedAt, offset: 0, duration });
  return { session, audio, calls, speaking, progressed };
}

function attach(clock: { now: number }, windowMs = 3000) {
  const f = fakeSession(clock);
  const records: StopTiming[] = [];
  const timing = attachStopTiming(f.session as never, record => records.push(record), { now: () => clock.now, windowMs });
  return { ...f, records, timing };
}

describe("the staging stop timing", () => {
  it("records a pause that resumed: heard, paused, the audio's end, and the resume", () => {
    const clock = { now: 1_000 };
    const t = attach(clock);
    t.speaking(1_000);
    clock.now = 1_040; t.audio.pause();
    t.progressed(800, 260); // the room output's last run ended at 1,060 ms
    clock.now = 2_100; t.audio.resume();
    clock.now = 4_200; t.timing.flush();
    expect(t.records).toEqual([{ speakingAt: 1_000, pauseAt: 1_040, clearAt: null, outputStoppedAt: 1_060, resumeAt: 2_100, reactionMs: 40, outputMs: 20 }]);
    // The SDK's own calls still reach the output.
    expect(t.calls).toEqual(["pause@1040", "resume@2100"]);
  });

  it("records a clear after words, and closes a record when the next speech starts", () => {
    const clock = { now: 5_000 };
    const t = attach(clock);
    t.speaking(5_000);
    clock.now = 5_030; t.audio.pause();
    t.progressed(4_900, 150);
    clock.now = 5_600; t.audio.clearBuffer();
    t.speaking(9_000);
    expect(t.records).toEqual([{ speakingAt: 5_000, pauseAt: 5_030, clearAt: 5_600, outputStoppedAt: 5_050, resumeAt: null, reactionMs: 30, outputMs: 20 }]);
  });

  it("records speech that never stopped Maya, and ignores output events with no speech before them", () => {
    const clock = { now: 0 };
    const t = attach(clock, 1000);
    t.progressed(0, 500);
    clock.now = 100; t.audio.pause();
    t.speaking(200);
    clock.now = 1_300; t.timing.flush();
    expect(t.records).toEqual([{ speakingAt: 200, pauseAt: null, clearAt: null, outputStoppedAt: null, resumeAt: null, reactionMs: null, outputMs: null }]);
  });
});
