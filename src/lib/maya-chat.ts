import { dayOf, familyWhen, localDateTime, type FamilyZone } from "@/lib/family-time";
import type { Batch } from "@/lib/board";
import { SAFETY_GUIDANCE } from "@/lib/maya";
import type { CallView, TranscriptLine } from "@/lib/maya-call";

export const CHAT_MESSAGES = 60;
export interface ChatUsage { used: number; left: number; resetsAt: number; backAt: string }
export interface ChatView {
  id: string; revision: number; ended: boolean; transcript: TranscriptLine[]; batches: Batch[];
  pending?: boolean;
  hint: number; safetyMessage: string | null;
}
export interface ChatReply { usage: ChatUsage; chat: ChatView | null; error?: string }

export function chatWindow(now: number, zone: FamilyZone) {
  const day = dayOf(now, zone);
  return { start: localDateTime(day.start, zone), end: day.resetsAt };
}
export function chatUsage(used: number, now: number, zone: FamilyZone): ChatUsage {
  const { end } = chatWindow(now, zone);
  return { used, left: Math.max(0, CHAT_MESSAGES - used), resetsAt: end, backAt: familyWhen(end, zone) };
}
/** The only new Maya line. Its time comes from the family's clock on the server. */
export const chatCapLine = (usage: ChatUsage) => `You used your 60 messages today. We can chat again at ${usage.backAt}.`;

/** Children receive the conversation and board, never model diagnostics or saved teaching state. */
export function childChatView(view: CallView): ChatView {
  return {
    id: view.id, revision: view.revision, ended: view.status === "ended",
    transcript: view.transcript.filter((t) => t.speaker !== "note"), batches: view.batches,
    hint: Math.min(3, view.outcome?.highestHint ?? 0),
    safetyMessage: view.outcome?.safetyFlag ? SAFETY_GUIDANCE[view.outcome.safetySeverity ?? "concern"] : null,
  };
}
export function chatIsEnabled(testFamily: boolean, env: Record<string, string | undefined>): boolean {
  return testFamily || env.MAYA_CHAT_ENABLED === "on";
}
