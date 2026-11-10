// One stored workbook on its admin page (D-313, D-315): its place on the Production stage track and its print and ship
// steps. Pure: no network, database or clock. The stage words are Production's (src/lib/admin-production.ts).
import { STAGES, type Stage } from "@/lib/admin-production";
import type { WorkbookStatus } from "@/lib/workbook-content";

/** A stored workbook's Production stage: a draft was taken back for changes (Ready to review); shipped with a delivery
 * receipt is Delivered. */
export function workbookStage(status: WorkbookStatus, delivered: boolean): Stage {
  if (status === "draft") return "review";
  if (status === "shipped") return delivered ? "delivered" : "shipped";
  return status;
}

export type StepState = "done" | "now" | "later";

/** Each stage of the track for one book: the stages before its stage are done, its own is now. A delivered book is done. */
export function stageTrack(stage: Stage): { stage: Stage; state: StepState }[] {
  const at = STAGES.indexOf(stage);
  return STAGES.map((s, i) => ({ stage: s, state: i < at || (stage === "delivered" && i === at) ? "done" : i === at ? "now" : "later" }));
}

export type PrintStep = "approve" | "print" | "ship" | "deliver";

/** The print and ship steps of one workbook, in order, with the one to do now. */
export function printSteps(status: WorkbookStatus, delivered: boolean): { step: PrintStep; state: StepState }[] {
  const next: PrintStep | null = status === "draft" ? "approve" : status === "approved" ? "print" : status === "printed" ? "ship" : delivered ? null : "deliver";
  const order: PrintStep[] = ["approve", "print", "ship", "deliver"];
  const at = next === null ? order.length : order.indexOf(next);
  return order.map((step, i) => ({ step, state: i < at ? "done" : i === at ? "now" : "later" }));
}
