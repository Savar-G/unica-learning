// A child's voice call with Maya from the family desk: the rules the server and the desk screen share. Pure: no network,
// no clock, no database, no LiveKit packages (the server part is src/lib/maya-voice-desk-server.ts).
//
// - The switch: `MAYA_VOICE_ENABLED`. A test family always has voice; any other family only when the value is exactly
//   `on` (and then chat must be open to the child, which the server checks).
// - The weekly limit: 30 minutes of voice per child in each family week (Monday 00:00 in the family's zone, the same week
//   as Maya's spending cap, src/lib/family-time.ts `weekOf`). The time counts the call's connected seconds. A call that is
//   still live counts as fully used, so a second call cannot start on its time.
// - A new call is refused when less than a minute is left, and its own time limit is the time left when that is under the
//   normal 10 minutes (the session's own limits: closing a minute before the end, `shorterLimits` in src/lib/maya/session.ts).
import { weekOf, type FamilyZone } from "@/lib/family-time";
import { TIME_LIMITS } from "@/lib/maya";
import { childChatView, type ChatView } from "@/lib/maya-chat";
import type { CallStatus, CallView } from "@/lib/maya-call";
import type { VoiceTicket } from "@/lib/maya-voice";
export type { VoiceTicket };
import type { WorkbookQuestionRef } from "@/lib/question-package";

/** The most voice time one child has in a family week (seconds). */
export const VOICE_WEEK_SECONDS = 1800;
/** A new call needs at least this much of the week left (seconds). */
export const VOICE_MIN_START_SECONDS = 60;
/** The normal longest call (seconds): a call counts as this long while it is live and its own limit is not known. */
export const VOICE_CALL_SECONDS = TIME_LIMITS.endAtMs / 1000;

/** What a child has used of the voice week, for the desk. `resetsAt` is an ISO time in the family's week; `zone` its zone. */
export interface VoiceUsage {
  usedSeconds: number;
  leftSeconds: number;
  /** The most seconds one new call would get now: the time left, or 10 minutes when more is left. */
  limitSeconds: number;
  resetsAt: string;
  zone: FamilyZone;
}

/** Seconds of the week left after `usedSeconds`, never below 0. */
export const voiceWeekLeft = (usedSeconds: number): number => Math.max(0, VOICE_WEEK_SECONDS - Math.max(0, Math.floor(usedSeconds)));

/**
 * The time limit of a new call (ms) when `leftSeconds` of the week are left: the time left, but never more than the
 * normal call. Null when less than VOICE_MIN_START_SECONDS is left: no call starts.
 */
export function voiceCallLimitMs(leftSeconds: number): number | null {
  if (!(leftSeconds >= VOICE_MIN_START_SECONDS)) return null;
  return Math.min(TIME_LIMITS.endAtMs, Math.floor(leftSeconds) * 1000);
}

/** One of the child's family calls of this week, as the usage needs it. */
export interface VoiceCallUse {
  status: CallStatus;
  connectedSeconds: number | null;
  /** A live call's own end (ms from its start), when it has one shorter than the normal 10 minutes. */
  endAtMs?: number | null;
}

/** The week's used seconds: an ended call's connected time, and a live call's whole limit. */
export function voiceUsedSeconds(calls: readonly VoiceCallUse[]): number {
  let used = 0;
  for (const c of calls) {
    if (c.status === "live") {
      const own = typeof c.endAtMs === "number" && Number.isFinite(c.endAtMs) && c.endAtMs > 0 ? Math.ceil(c.endAtMs / 1000) : VOICE_CALL_SECONDS;
      used += Math.min(VOICE_CALL_SECONDS, own);
    } else used += Math.max(0, Math.floor(c.connectedSeconds ?? 0));
  }
  return used;
}

/** The usage for the desk: the used time, what is left, and when the week resets. */
export function voiceUsage(usedSeconds: number, now: number, zone: FamilyZone): VoiceUsage {
  const used = Math.max(0, Math.floor(usedSeconds));
  const left = voiceWeekLeft(used);
  return {
    usedSeconds: used,
    leftSeconds: left,
    limitSeconds: Math.min(VOICE_CALL_SECONDS, left),
    resetsAt: new Date(weekOf(now, zone).resetsAt).toISOString(),
    zone,
  };
}

/**
 * Whether the voice switch is open for a family. A test family always passes. Any other family passes only when
 * `MAYA_VOICE_ENABLED` is exactly `on`; chat access (`MAYA_CHAT_ENABLED=off` included) and the grade are separate checks.
 */
export function voiceSwitchOpen(family: { test: boolean }, env: Readonly<Record<string, string | undefined>>): boolean {
  return family.test || env.MAYA_VOICE_ENABLED === "on";
}

/** One request from the desk's call screen. The server takes the parent and the child from the desk, never from this. */
export type VoiceAction =
  | { type: "start"; id: string; question: WorkbookQuestionRef }
  | { type: "token"; id: string }
  | { type: "read"; id: string }
  | { type: "cancel"; id: string };

/** The call as the child's screen sees it: the chat's child-safe transcript and board, and the state of the call. */
export type DeskVoiceCall = ChatView & { mode: "voice"; started: boolean; status: CallStatus };

/** The child-safe view of a family voice call. Never the model, the saved session or any diagnostics. */
export function deskVoiceCall(view: CallView): DeskVoiceCall {
  return { ...childChatView(view), mode: "voice", started: view.startedAt !== null, status: view.status };
}

/**
 * Every answer of `/api/desk/voice`. `error` is one of: `not_found`, `notice_required`, `invalid_question`,
 * `voice_week_used` (the child's 30 minutes are used, or less than a minute is left), `week_used` and `paused` (Maya's
 * spending cap), `model_unavailable`, `ended`, `already_started` (a cancel after Maya joined), `conflict`, `unavailable`.
 */
export interface DeskVoiceReply {
  call: DeskVoiceCall | null;
  ticket?: VoiceTicket;
  usage: VoiceUsage | null;
  error?: string;
}
