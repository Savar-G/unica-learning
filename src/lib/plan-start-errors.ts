import type { StartPlanOutcome } from "@/lib/stripe";

/** The JSON error codes of the admin's initial plan start route. */
export type StartPlanError = Extract<StartPlanOutcome, { ok: false }>["error"]
  | "delivery_confirmation_required" | "invalid" | "delivery_receipt_required"
  | "family_unavailable" | "unavailable" | "failed";
