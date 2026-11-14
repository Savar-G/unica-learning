import { EventEmitter } from "node:events";
import { RoomEvent, TrackSource } from "@livekit/rtc-node";
import { describe, expect, it } from "vitest";
import { ATTR, childIdentity, JOIN_WAIT_MS, MIC_WAIT_MS, voiceRoom, type VoiceCallFacts } from "@/lib/maya-voice";
import { waitForChild, type PresenceParticipant, type PresenceRoom } from "./child-wait";

// When the worker counts the call's child as here (docs/maya-voice.md, "The child joins the room before the Connect
// tap"): the child's microphone is published. A fake room with rtc-node's event names and timers the test moves. It
// proves the rule and the waits; it does not prove what a real LiveKit room sends.

const CALL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const call: VoiceCallFacts = { id: CALL, parentId: PARENT, childId: CHILD, mode: "voice", status: "live" };

class FakeRoom extends EventEmitter {
  name = voiceRoom(CALL);
  remoteParticipants = new Map<string, PresenceParticipant>();
  join(p: PresenceParticipant) { this.remoteParticipants.set(p.identity, p); this.emit(RoomEvent.ParticipantConnected, p); }
  leave(p: PresenceParticipant) { this.remoteParticipants.delete(p.identity); this.emit(RoomEvent.ParticipantDisconnected, p); }
  publish(p: PresenceParticipant, source: TrackSource, event: RoomEvent = RoomEvent.TrackPublished) {
    const publication = { source };
    p.trackPublications.set(`TR_${p.trackPublications.size}`, publication);
    if (event === RoomEvent.TrackPublished) this.emit(event, publication, p);
    else this.emit(event, {}, publication, p);
  }
}
const child = (): PresenceParticipant => ({ identity: childIdentity(CHILD), attributes: { [ATTR.call]: CALL, [ATTR.parent]: PARENT, [ATTR.child]: CHILD }, trackPublications: new Map() });
const stranger = (): PresenceParticipant => ({ identity: "child-somebody", attributes: {}, trackPublications: new Map([["TR_x", { source: TrackSource.SOURCE_MICROPHONE }]]) });

/** Timers the test moves by hand. */
function handTimers() {
  let now = 0;
  const due = new Map<number, { at: number; run: () => void }>();
  let next = 0;
  return {
    set: (ms: number, run: () => void) => { due.set(++next, { at: now + ms, run }); return next; },
    clear: (h: unknown) => void due.delete(h as number),
    advance(ms: number) {
      now += ms;
      for (const [h, t] of [...due]) if (t.at <= now) { due.delete(h); t.run(); }
    },
    pending: () => due.size,
  };
}

const settle = () => new Promise((r) => setImmediate(r));
function watch(room: FakeRoom, timers = handTimers()) {
  let result: Awaited<ReturnType<typeof waitForChild<PresenceParticipant>>> | undefined;
  const logs: string[] = [];
  void waitForChild(room as unknown as PresenceRoom<PresenceParticipant>, call, { timers, log: (m) => logs.push(m) }).then((r) => { result = r; });
  return { timers, logs, result: async () => { await settle(); return result; } };
}

describe("the child is here for the worker", () => {
  it("not at the join: only when the microphone is published, then at once", async () => {
    const room = new FakeRoom();
    const w = watch(room);
    const c = child();
    room.join(c);
    expect(await w.result()).toBeUndefined();
    room.publish(c, TrackSource.SOURCE_CAMERA);
    expect(await w.result()).toBeUndefined();
    room.publish(c, TrackSource.SOURCE_MICROPHONE);
    expect(await w.result()).toEqual({ child: c });
    // The wait is over: no timer and no listener is left behind.
    expect(w.timers.pending()).toBe(0);
    expect(room.listenerCount(RoomEvent.TrackPublished) + room.listenerCount(RoomEvent.ParticipantConnected)).toBe(0);
  });

  it("from a subscription too, and at once for a child already here when the wait starts (the old screen)", async () => {
    const room = new FakeRoom();
    const w = watch(room);
    const c = child();
    room.join(c);
    room.publish(c, TrackSource.SOURCE_MICROPHONE, RoomEvent.TrackSubscribed);
    expect(await w.result()).toEqual({ child: c });

    const there = new FakeRoom();
    const d = child();
    d.trackPublications.set("TR_mic", { source: TrackSource.SOURCE_MICROPHONE });
    there.remoteParticipants.set(d.identity, d);
    expect(await watch(there).result()).toEqual({ child: d });
  });

  it("never for another joiner, even with a microphone; the joiner is logged and ignored", async () => {
    const room = new FakeRoom();
    const w = watch(room);
    room.join(stranger());
    expect(await w.result()).toBeUndefined();
    expect(w.logs).toEqual(["ignored a joiner that is not the call's child"]);
    w.timers.advance(JOIN_WAIT_MS);
    expect(await w.result()).toEqual({ child: null, why: "no_join" });
  });
});

describe("the worker's waits", () => {
  it("gives up after JOIN_WAIT_MS when the child never joins", async () => {
    const w = watch(new FakeRoom());
    w.timers.advance(JOIN_WAIT_MS - 1);
    expect(await w.result()).toBeUndefined();
    w.timers.advance(1);
    expect(await w.result()).toEqual({ child: null, why: "no_join" });
  });

  it("waits the ticket's life for the microphone of a child in the room, from the join", async () => {
    const room = new FakeRoom();
    const w = watch(room);
    w.timers.advance(JOIN_WAIT_MS - 1000);
    room.join(child());
    // Past the join wait: the child is in the room, so the longer wait runs.
    w.timers.advance(MIC_WAIT_MS - 1);
    expect(await w.result()).toBeUndefined();
    w.timers.advance(1);
    expect(await w.result()).toEqual({ child: null, why: "no_microphone" });
  });

  it("goes back to the join wait when the child leaves before the microphone, and still takes them when they are back", async () => {
    const room = new FakeRoom();
    const w = watch(room);
    const c = child();
    room.join(c);
    w.timers.advance(MIC_WAIT_MS - 10);
    room.leave(c);
    // The microphone wait is over; the join wait runs from the leave.
    w.timers.advance(JOIN_WAIT_MS - 1);
    expect(await w.result()).toBeUndefined();
    const again = child();
    room.join(again);
    room.publish(again, TrackSource.SOURCE_MICROPHONE);
    expect(await w.result()).toEqual({ child: again });
  });
});
