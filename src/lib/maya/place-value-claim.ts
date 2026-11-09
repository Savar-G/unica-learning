// A place-value compare question (B1b) as a claim, for A4's word reader (claim.ts): "True or false: in 16466, the digit
// in the thousands place is bigger than the digit in the hundreds place." The circled word is read, said back and judged
// by A4's code exactly as for any other claim; this file only says what the claim is, from the checked package: its two
// printed words, the two digits (the first is "value", the second "shown") and whether the first is bigger.
// Pure TypeScript; no runtime import of claim.ts.
import type { OperationPackage } from "@/lib/question-package";
import type { SessionClaim } from "./claim";
import { digitAt, placeIndex } from "@/lib/question-package-place-value";

/** The claim of a place-value compare package, or null for any other package. */
export function placeClaim(pkg: OperationPackage): SessionClaim | null {
  const op = pkg.operation;
  if (op.kind !== "place-value" || op.ask !== "compare") return null;
  const region = pkg.item?.regions.find((r) => r.kind === "choice");
  if (region?.kind !== "choice" || region.choices.length !== 2 || region.choices[0] !== "true" || region.choices[1] !== "false" || pkg.answer.value.type !== "choice") return null;
  const a = digitAt(op.operands[0], placeIndex(op.place));
  const b = digitAt(op.operands[0], placeIndex(op.second));
  const holds = a > b;
  const word = pkg.answer.value.value;
  if (word !== (holds ? "true" : "false")) return null;
  return { choices: ["true", "false"], relation: "greater", value: a, shown: b, holds, word, other: holds ? "false" : "true" };
}
