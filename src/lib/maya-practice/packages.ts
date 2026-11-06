import { createSession } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { packageHash } from "@/lib/maya-trace";
import { checkQuestionPackage, type QuestionPackage } from "@/lib/question-package";
import type { PracticeCase } from "./cases";

/** Resolve the package without changing the shared fixtures. Refuse incomplete generated provenance. */
export function practicePackage(c: PracticeCase): QuestionPackage {
  if (!c.package && !c.generated) return FIXTURES[c.fixture];
  const pkg = c.package, g = c.generated;
  if (!pkg || !g || g.source !== "real-generator-synthetic-v1" || !["U4", "U16"].includes(g.level)
    || !Number.isInteger(g.day) || g.day < 1 || g.day > 10 || c.persona.question !== pkg.text
    || !checkQuestionPackage(pkg).ok || pkg.ref.source !== "workbook"
    || pkg.ref.page !== g.page || pkg.ref.question !== g.question || pkg.level !== Number(g.level.slice(1))
    || g.packageHash !== packageHash(pkg) || ![g.planHash, g.draftHash].every(h => /^sha256:[a-f0-9]{64}$/.test(h)))
    throw new Error("practice: invalid generated package or provenance");
  const held = createSession({ callId: "practice-package-check", package: pkg, random: 1 }).contentProblem !== null;
  if (g.support !== (held ? "held" : "teachable")) throw new Error("practice: generated support does not match the checked package");
  return pkg;
}
