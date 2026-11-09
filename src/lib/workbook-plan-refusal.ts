const PLAN_STATE: Record<string, string> = {
  plan_cancelled: "This family's plan is cancelled",
  plan_control_pending: "A pause, cancellation or restart for this family is still in progress",
  pause_previous_book_required: "This family's pause requires the previous workbook to be shipped first",
  plan_paused: "This family's plan is paused",
};
const ACTION = {
  prepare: ", so no new workbook can be prepared.",
  approve: ". Approval must wait.",
  printed: ". This workbook cannot be marked printed.",
  shipped: ". This workbook cannot be marked shipped.",
  draft: ", so this workbook draft cannot be saved.",
  state: ".",
};

/** Only the four plan fences change the existing meaning of a 55000 refusal. */
export function workbookPlanRefusal(message: string, action: keyof typeof ACTION): string {
  return Object.hasOwn(PLAN_STATE, message) ? `${PLAN_STATE[message]}${ACTION[action]}` : "the family is being deleted";
}
