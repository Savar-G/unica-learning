import { dayOf, familyWhen, formatInZone, localDateTime, type FamilyZone } from "@/lib/family-time";
import type { Batch } from "@/lib/board";
import { SAFETY_GUIDANCE } from "@/lib/maya";
import type { CallView, TranscriptLine } from "@/lib/maya-call";
import type { WorkbookQuestionRef } from "@/lib/question-package";
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
  question?: WorkbookQuestionRef;
  pending?: boolean;
  hint: number; safetyMessage: string | null;
}
export interface ChatReply { usage: ChatUsage; chat: ChatView | null; error?: string; errorLine?: string; admission?: "accepted" | "refused" }

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
    ...(view.question.source === "workbook" ? { question: view.question } : {}),
    transcript: view.transcript.filter((t) => t.speaker !== "note"), batches: view.batches,
    hint: Math.min(3, view.outcome?.highestHint ?? 0),
    safetyMessage: view.outcome?.safetyFlag ? SAFETY_GUIDANCE[view.outcome.safetySeverity ?? "concern"] : null,
  };
}
/** Chat needs typing, so it starts at Grade 3 (D-241, #530). Kindergarten is grade 0. */
export const CHAT_MIN_GRADE = 3;
export const chatServesGrade = (grade: number | null | undefined): boolean => typeof grade === "number" && grade >= CHAT_MIN_GRADE;
/** The chat limit in the desk header: messages left today, the grade for a younger child (`note`), else the limit. */
export function chatLimitLabel(usage: ChatUsage | null, note: string | null, planClosed = false): string {
  if (usage) return `${usage.left} left today`;
  if (planClosed) return "Closed";
  return note ? "Grade 3 and up" : `${CHAT_MESSAGES} messages a day`;
}
/**
 * Why chat is closed, on the child's desk, from the desk child's own plan (childPlanRead): it names the reason (D-304, Savar:
 * "explicitly say why Maya is paused / not working"; for chat it replaces D-280's "no payment words" on the desk). Words
 * approved by Savar on 2026-11-08. Null, so the desk keeps "Chat and calls with Maya start soon.", for a child with no plan and
 * for an open plan. A paused plan gives its resume day only when the stored date parses and is still ahead, as a day in the
 * family's time zone in the plan page's style (planDay). A failed read, or a state with no usable kind, gives the not-running line.
 */
export function chatPlanClosedLine(closed: { reason: string; resumesOn?: string | null }, zone: FamilyZone, now: number): string | null {
  switch (closed.reason) {
    case "no_plan":
    case "open":
    case "ending_until_end": return null;
    case "ended": return "Chat with Maya is closed because your family's plan has ended. Ask a grown-up.";
    case "payment_failed": return "Chat with Maya is paused because the last payment did not go through. Ask a grown-up.";
    case "paused": {
      const at = closed.resumesOn ? Date.parse(closed.resumesOn) : Number.NaN;
      if (Number.isFinite(at) && at > now) return `Chat with Maya is paused because your family paused the plan. It starts again on ${formatInZone(closed.resumesOn!, zone, { year: "numeric", month: "long", day: "numeric" })}.`;
      return "Chat with Maya is paused because your family paused the plan. Ask a grown-up.";
    }
    default: return "Chat with Maya is closed because your family's plan is not running. Ask a grown-up.";
  }
}
/** What the desk says when a younger child's family has chat. */
export const chatGradeLine = () => "Chat and calls with Maya are for Grade 3 and up.";

/**
 * Who may chat. A test family always may, on the fake path (#530). `MAYA_CHAT_ENABLED=off` is the emergency stop for
 * every other family. A child with an open plan (src/lib/plan-access.ts) may, with no list row and no switch ("open_plan").
 * Any other family needs the switch on and a place on the admin list (public.maya_chat_families), then a running plan
 * read from Stripe ("plan"). The grade and the parent's notice agreement are separate checks, and every path needs them.
 */
export function chatFamilyGate(family: { test: boolean; listed: boolean; planOpen?: boolean }, env: Record<string, string | undefined>): "test" | "open_plan" | "plan" | "closed" {
  if (family.test) return "test";
  if (env.MAYA_CHAT_ENABLED === "off") return "closed";
  if (family.planOpen) return "open_plan";
  return family.listed && env.MAYA_CHAT_ENABLED === "on" ? "plan" : "closed";
}

/** Test families get no parent note and no weekly recap, except the one rehearsal family (#530). */
export const getsNoParentNotes = (family: { test: boolean; rehearsal: boolean }): boolean => family.test && !family.rehearsal;

/** Why an admin cannot make a family the rehearsal family, or null when it can. */
export function rehearsalRefusal(family: { test: boolean; listed: boolean }): "not_test_family" | "not_listed" | null {
  if (!family.test) return "not_test_family";
  return family.listed ? null : "not_listed";
}
