import { dayOf, familyWhen, localDateTime, type FamilyZone } from "@/lib/family-time";
import type { Batch } from "@/lib/board";
import { SAFETY_GUIDANCE } from "@/lib/maya";
import type { CallView, TranscriptLine } from "@/lib/maya-call";
import { childSpendLine, type SpendState } from "@/lib/maya-spend";

export const CHAT_MESSAGES = 60;
export interface ChatUsage {
  used: number; left: number; resetsAt: number; backAt: string;
  /** Maya's spending cap this week (D-290): its state, the 80% notice, and when the week resets in the family's zone. */
  spend?: ChatSpend | null;
}
export interface ChatSpend { state: SpendState; notice: boolean; resetsAt: number; zone: FamilyZone }
/** What the desk shows the child when Maya's week is used or Maya is paused; null while she is open. */
export const chatSpendLine = (usage: ChatUsage | null): string | null =>
  usage?.spend ? childSpendLine(usage.spend.state, usage.spend.resetsAt, usage.spend.zone) : null;
export interface ChatView {
  id: string; revision: number; ended: boolean; transcript: TranscriptLine[]; batches: Batch[];
  pending?: boolean;
  hint: number; safetyMessage: string | null;
}
export interface ChatReply { usage: ChatUsage; chat: ChatView | null; error?: string; admission?: "accepted" | "refused" }

export function chatWindow(now: number, zone: FamilyZone) {
  const day = dayOf(now, zone);
  return { start: localDateTime(day.start, zone), end: day.resetsAt };
}
export function chatUsage(used: number, now: number, zone: FamilyZone): ChatUsage {
  const { end } = chatWindow(now, zone);
  return { used, left: Math.max(0, CHAT_MESSAGES - used), resetsAt: end, backAt: familyWhen(end, zone) };
}
/** The only new Maya line. Its time comes from the family's clock on the server. */
export const chatCapLine = () => "You used all your messages for today. We can chat again tomorrow.";

/** Children receive the conversation and board, never model diagnostics or saved teaching state. */
export function childChatView(view: CallView): ChatView {
  return {
    id: view.id, revision: view.revision, ended: view.status === "ended",
    transcript: view.transcript.filter((t) => t.speaker !== "note"), batches: view.batches,
    hint: Math.min(3, view.outcome?.highestHint ?? 0),
    safetyMessage: view.outcome?.safetyFlag ? SAFETY_GUIDANCE[view.outcome.safetySeverity ?? "concern"] : null,
  };
}
/** Chat needs typing, so it starts at Grade 3 (D-241, #530). Kindergarten is grade 0. */
export const CHAT_MIN_GRADE = 3;
export const chatServesGrade = (grade: number | null | undefined): boolean => typeof grade === "number" && grade >= CHAT_MIN_GRADE;
/** The chat limit in the desk header: messages left today, the grade for a younger child (`note`), else the limit. */
export function chatLimitLabel(usage: ChatUsage | null, note: string | null): string {
  if (usage) return `${usage.left} left today`;
  return note ? "Grade 3 and up" : `${CHAT_MESSAGES} messages a day`;
}
/** What the desk says when a younger child's family has chat. */
export const chatGradeLine = () => "Chat with Maya is for Grade 3 and up, because it needs typing. Calls with Maya start soon.";

/**
 * Who may chat before the plan check (#530). A test family always may, on the fake path. Any other family needs the
 * switch on and a place on the admin list (public.maya_chat_families), then a running plan ("plan").
 */
export function chatFamilyGate(family: { test: boolean; listed: boolean }, env: Record<string, string | undefined>): "test" | "plan" | "closed" {
  if (family.test) return "test";
  return family.listed && env.MAYA_CHAT_ENABLED === "on" ? "plan" : "closed";
}

/** Test families get no parent note and no weekly recap, except the one rehearsal family (#530). */
export const getsNoParentNotes = (family: { test: boolean; rehearsal: boolean }): boolean => family.test && !family.rehearsal;

/** Why an admin cannot make a family the rehearsal family, or null when it can. */
export function rehearsalRefusal(family: { test: boolean; listed: boolean }): "not_test_family" | "not_listed" | null {
  if (!family.test) return "not_test_family";
  return family.listed ? null : "not_listed";
}
