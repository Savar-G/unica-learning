// The registry of the tutor core's kinds (D-345, Phase 2): the first kind that fits a question teaches it. A builder of
// a family adds its kind's file in this folder and one line here, before the kinds it must win over.
import type { OperationPackage } from "@/lib/question-package";
import type { TutorKind } from "../tutor-kind";
import { columnKind } from "./column";
import { multiplyKind } from "./multiply";

export const TUTOR_KINDS: readonly TutorKind[] = [columnKind, multiplyKind];

/** Kinds a test puts first (testKind); never used by the site. */
const testKinds: TutorKind[] = [];

/** The kind that teaches this question, or null: the controller keeps it. */
export function tutorKindOf(pkg: OperationPackage): TutorKind | null {
  return testKinds.find((k) => k.fits(pkg)) ?? TUTOR_KINDS.find((k) => k.fits(pkg)) ?? null;
}

/** Tests only: puts `kind` before the registry until the returned function is called. */
export function testKind(kind: TutorKind): () => void {
  testKinds.unshift(kind);
  return () => { const i = testKinds.indexOf(kind); if (i !== -1) testKinds.splice(i, 1); };
}
