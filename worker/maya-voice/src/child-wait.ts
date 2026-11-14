// When the call's child is here for Maya's worker (main.ts): in the room with their microphone published. The child's
// screen joins the room before the Connect tap, with the microphone off, and turns it on at the tap (docs/maya-voice.md,
// "The child joins the room before the Connect tap"). So a join alone is not the child: nothing of the call (the
// connection rows, the minutes, the call's start, the opening) may start before the microphone is there.
import { RoomEvent, TrackSource } from "@livekit/rtc-node";
import { childPresence, JOIN_WAIT_MS, MIC_WAIT_MS, type ChildPresence, type VoiceCallFacts } from "@/lib/maya-voice";

/** The parts of a participant the rule reads (rtc-node's RemoteParticipant has them). */
export interface PresenceParticipant {
  identity: string;
  attributes: Record<string, string>;
  trackPublications: Map<string, { source?: unknown }>;
}

/** The parts of a room the wait uses (rtc-node's Room has them). */
export interface PresenceRoom<P extends PresenceParticipant> {
  name?: string;
  remoteParticipants: Map<string, P>;
  on(event: RoomEvent, listener: (...args: never[]) => void): unknown;
  off(event: RoomEvent, listener: (...args: never[]) => void): unknown;
}

export type ChildWait<P> = { child: P } | { child: null; why: "no_join" | "no_microphone" };

/** Where this participant is for the call: another joiner, the child with no microphone yet, or the child here. */
export function presenceOf(room: { name?: string }, call: VoiceCallFacts, p: PresenceParticipant): ChildPresence {
  return childPresence({ room: room.name ?? "", call, identity: p.identity, attributes: p.attributes, tracks: p.trackPublications.values(), microphone: TrackSource.SOURCE_MICROPHONE });
}

/** The room events after which a participant's presence can change: a join, a leave, a track published or subscribed. */
export const PRESENCE_EVENTS = [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackPublished, RoomEvent.TrackSubscribed] as const;

/**
 * The call's child once they are here (`childPresence`). Any other joiner is ignored. Null when the child did not join
 * within JOIN_WAIT_MS ("no_join"), or stayed in the room with no microphone for MIC_WAIT_MS, the ticket's life
 * ("no_microphone"). A child who leaves before the microphone starts the join wait again.
 */
export function waitForChild<P extends PresenceParticipant>(
  room: PresenceRoom<P>, call: VoiceCallFacts, options: { log?(message: string): void; timers?: { set(ms: number, run: () => void): unknown; clear(handle: unknown): void } } = {},
): Promise<ChildWait<P>> {
  const timers = options.timers ?? { set: (ms: number, run: () => void) => setTimeout(run, ms), clear: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
  return new Promise((resolve) => {
    let waiting: "join" | "microphone" | null = null;
    let timer: unknown = null;
    let settled = false;
    const done = (result: ChildWait<P>) => {
      settled = true;
      if (timer !== null) timers.clear(timer);
      for (const event of PRESENCE_EVENTS) room.off(event, look);
      room.off(RoomEvent.ParticipantConnected, ignored);
      resolve(result);
    };
    const wait = (kind: "join" | "microphone") => {
      if (waiting === kind) return;
      waiting = kind;
      if (timer !== null) timers.clear(timer);
      timer = timers.set(kind === "join" ? JOIN_WAIT_MS : MIC_WAIT_MS, () => done({ child: null, why: kind === "join" ? "no_join" : "no_microphone" }));
    };
    function look() {
      if (settled) return;
      let joined = false;
      for (const p of room.remoteParticipants.values()) {
        const presence = presenceOf(room, call, p);
        if (presence === "here") return done({ child: p });
        joined ||= presence === "joined";
      }
      wait(joined ? "microphone" : "join");
    }
    function ignored(p: P) {
      if (presenceOf(room, call, p) === "other") options.log?.("ignored a joiner that is not the call's child");
    }
    room.on(RoomEvent.ParticipantConnected, ignored);
    for (const event of PRESENCE_EVENTS) room.on(event, look);
    look();
  });
}
