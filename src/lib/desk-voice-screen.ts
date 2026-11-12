import { applyBatch, boardView, createScene } from "@/lib/board";
import type { BoardSnapshot } from "@/lib/board-protocol";
import { fitView, type PlayStep } from "@/lib/board-svg";
import { formatInZone } from "@/lib/family-time";
import { MAYA_NOTICE_DESK_LINE } from "@/lib/maya-notice";
import type { VoiceUsage } from "@/lib/maya-voice-desk";

// What the child's desk shows for a voice call with Maya: which screen, the minutes left this week, and the words for
// each refusal. Pure: no network, no clock, no browser. The call itself (the room, the microphone) is in
// src/components/maya-voice-room.ts, and the screen in src/components/desk-voice.tsx. The lines a child reads are in
// this file and in desk-voice.tsx, so they can be read and approved in one place.

/** Where the child is in a call: nothing, checking the microphone, asking the server to start, in the call, or after it. */
export type VoiceFlow = "idle" | "mic" | "starting" | "call" | "after";
/** The room's phase, as src/components/maya-voice-room.ts reports it. */
export type RoomPhase = "ready" | "connecting" | "waiting" | "live" | "ending" | "ended" | "failed";
export type VoiceScreen = "idle" | "mic" | "starting" | "connecting" | "joining" | "live" | "ending" | "retry" | "after";

/**
 * The one screen to show. In a call, the room's phase decides, except that a call the saved record or the worker says
 * is over is "after", a call the child hung up shows "ending" until the record says so, and a dropped room is a
 * "retry". The ticket error "ended" means the call is already over.
 */
export function voiceScreen(i: { flow: VoiceFlow; phase: RoomPhase; callEnded: boolean; hungUp: boolean; error: string | null }): VoiceScreen {
  if (i.flow !== "call") return i.flow;
  if (i.callEnded || i.phase === "ended" || i.error === "ended") return "after";
  if (i.hungUp) return "ending";
  switch (i.phase) {
    case "ready":
    case "connecting": return "connecting";
    case "waiting": return "joining";
    case "live": return "live";
    case "ending": return "ending";
    case "failed": return "retry";
  }
}

// ---------- minutes ----------

/** Whole minutes in a number of seconds, never below 0. */
export const wholeMinutes = (seconds: number): number => Math.floor(Math.max(0, seconds) / 60);

/** "12 minutes left this week". Null below one minute: the desk then says the week is used. */
export function voiceLeftLine(leftSeconds: number): string | null {
  const m = wholeMinutes(leftSeconds);
  return m < 1 ? null : `${m} ${m === 1 ? "minute" : "minutes"} left this week`;
}

/** The seconds left while a call is live: the week's time at the start, less the call's own time. */
export const leftWhileLive = (usage: Pick<VoiceUsage, "leftSeconds">, liveSeconds: number): number => Math.max(0, usage.leftSeconds - Math.max(0, liveSeconds));

/** A voice week is used up when less than a minute is left. */
export const voiceWeekUsed = (usage: Pick<VoiceUsage, "leftSeconds"> | null): boolean => !!usage && usage.leftSeconds < 60;

/** The weekday Maya's week starts again, in the family's zone (the wording of the chat's week lines, src/lib/maya-spend.ts). */
function backOn(usage: Pick<VoiceUsage, "resetsAt" | "zone">): string {
  const at = Date.parse(usage.resetsAt);
  if (!Number.isFinite(at)) return "next week";
  try { return `on ${formatInZone(at, usage.zone, { weekday: "long" })}`; } catch { return "next week"; }
}
/** What the child reads when the voice week is used: the chat's week line, for calls. */
export const voiceWeekUsedLine = (usage: Pick<VoiceUsage, "resetsAt" | "zone">): string =>
  `You've used Maya's call time for this week. She'll be back ${backOn(usage)}.`;

// ---------- words ----------

export type MicKind = "idle" | "asking" | "working" | "blocked" | "none" | "failed";
export const MIC_LINE: Record<MicKind, string> = {
  idle: "Check your microphone first.",
  asking: "Your browser will ask to use the microphone. Tap Allow.",
  working: "Your microphone works. Say hello. The bar moves when it hears you.",
  blocked: "The microphone is turned off for this page. Tap the lock or microphone icon near the address bar. Choose Allow. Then tap Check again.",
  none: "We cannot find a microphone. Plug one in. Then tap Check again.",
  failed: "The microphone did not start. Close other apps that use it. Then tap Check again.",
};

const UNAVAILABLE = "Calls with Maya do not work right now. Try again in a moment.";
/** Why a call did not start, from the route's error code. A code with no words gets a general line. */
export function startErrorLine(code: string | undefined, usage: Pick<VoiceUsage, "resetsAt" | "zone"> | null): string {
  switch (code) {
    case "notice_required": return MAYA_NOTICE_DESK_LINE;
    case "voice_week_used": return usage ? voiceWeekUsedLine(usage) : "You've used Maya's call time for this week.";
    case "not_found":
    case "invalid_question": return "Maya cannot call about this question. Pick another question.";
    case "cap":
    case "busy": return "Maya cannot take a call right now. Try again later.";
    case "unavailable": return UNAVAILABLE;
    default: return "The call did not start. Try again in a moment.";
  }
}

/** Why a call stopped, from the room's code. Any code with no words is a connection problem. */
export function roomErrorLine(code: string | null): string | null {
  switch (code) {
    case null: return null;
    case "voice_unavailable": return UNAVAILABLE;
    case "ended": return "This call is over.";
    case "technical_issue": return "The call stopped working. Tap Try again.";
    case "disconnected": return "The call was cut off. Tap Try again.";
    case "no_maya": return "Maya did not join. Wait a minute. Then tap Try again.";
    case "failed": return "Something went wrong. Tap Try again.";
    default: return "We could not connect. Check the internet. Then tap Try again.";
  }
}

/** The line after a call: the call's safety message first; otherwise a plain close. */
export const afterCallLine = (call: { safetyMessage: string | null } | null): string =>
  call?.safetyMessage ?? "The call is over. Look at our board. Then write your answer on your paper.";

// ---------- Maya's board in a call ----------

/**
 * The board of a call, from what the browser received over the board RPC (the same rule as the admin call screen):
 * Maya's batches in order, each with the board's view after it. Null when a batch does not apply (the receiver and the
 * board core disagree), so the screen keeps what it shows.
 */
export function boardOfSnapshot(snapshot: BoardSnapshot): { steps: PlayStep[]; viewBox: string } | null {
  let scene = createScene();
  const steps: PlayStep[] = [];
  for (const event of snapshot.events) {
    if (event.kind !== "batch") continue;
    const r = applyBatch(scene, { transactionId: event.batchId, commands: event.commands });
    if (!r.ok) return null;
    scene = r.scene;
    steps.push({ drawn: r.drawn, erased: r.erased, view: boardView(scene) });
  }
  return { steps, viewBox: fitView(steps.flatMap((s) => s.drawn), 0.03) };
}
