// The registry of the tutor core's kinds (D-345, Phase 2): the first kind that fits a question teaches it. A builder of
// a family adds its kind's file in this folder and one line here, before the kinds it must win over.
import type { OperationPackage } from "@/lib/question-package";
import type { TutorKind } from "../tutor-kind";
import { columnKind } from "./column";

export const TUTOR_KINDS: readonly TutorKind[] = [columnKind];

/** The kind that teaches this question, or null: the controller keeps it. */
export function tutorKindOf(pkg: OperationPackage): TutorKind | null {
  return TUTOR_KINDS.find((k) => k.fits(pkg)) ?? null;
}
