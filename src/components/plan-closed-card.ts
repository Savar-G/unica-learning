import type { ClosedPlan } from "@/lib/plan-access";

/**
 * Whether the closed plan note on this page already gives this card's reason, so the card can leave out "Your last payment did not go
 * through." Only when the note shows, says that a payment failed, and names this child or no child. With no note, a note about something
 * else, or a note about another child, the card keeps the sentence, so the parent always sees the reason.
 *
 * In its own file because the plan views also render in the admin preview, a client component, and the note's file reads the plan gate.
 */
export const noteGivesCardReason = (closed: ClosedPlan | null | undefined, childName: string): boolean =>
  closed?.reason === "payment_failed" && (closed.child === null || closed.child === childName);
