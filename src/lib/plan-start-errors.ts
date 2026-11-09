import type { StartPlanOutcome } from "@/lib/stripe";

/** The JSON error codes of the admin's initial plan start route. */
export type StartPlanError = Extract<StartPlanOutcome, { ok: false }>["error"]
  | "delivery_confirmation_required" | "invalid" | "delivery_receipt_required"
  | "family_unavailable" | "family_plan_upgrade_required" | "unavailable" | "failed";

/** The start route's answer when the child's workbook 1 has no delivery receipt. The admin card shows it in place of the start button. */
export const DELIVERY_RECEIPT_TEXT = "Open this child's workbook 1 and confirm its delivery. Then return here to start the free month.";
