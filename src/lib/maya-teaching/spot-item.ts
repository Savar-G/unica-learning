// The spot-the-error item as code reads it (Wave C, C2; design: .design/research/maya-spot-error-design.md), and the answer
// given in its easier example. Shared by the deriver (spot-error.ts) and the session (src/lib/maya/spot-error.ts). Pure
// TypeScript with no session import, so both may use it without a cycle.
import type { QuestionPackage } from "@/lib/question-package";
import type { TemplateSource } from "@/lib/question-package-template";

/** A spot-the-error item as code reads it: the shown answer, and the keys of its two regions. */
export interface SpotItem {
  /** The worked answer the page prints ("Answer given: 498."). */
  shown: number;
  /** The "Is it right?" key, as printed: "Yes" or "No". */
  right: "Yes" | "No";
  /** The "Fix it" key. */
  fix: number;
  source: TemplateSource;
}

/** The labels and choices the book prints on a spot-the-error item (workbook-step-items.ts). */
const RIGHT_LABEL = "Is it right?";
const FIX_LABEL = "Fix it";

/**
 * The spot-the-error item of a package, or null. An allow-list of one shape: two regions, "right" (a ticked choice of
 * Yes and No) and "fix" (a number box), with the printed labels; two checks, template-shown on "right" and template on
 * "fix", with the same template source; and a shown answer that is a whole number written in digits.
 */
export function readSpotItem(pkg: QuestionPackage): SpotItem | null {
  const item = pkg.item;
  if (!item || item.format !== "spot-the-error" || !item.scorable || item.parentChecked || item.error !== null || (item.figure ?? null) !== null) return null;
  if (item.regions.length !== 2 || item.checks.length !== 2) return null;
  const [right, fix] = item.regions;
  const [shownCheck, fixCheck] = item.checks;
  if (right.id !== "right" || right.kind !== "choice" || right.mark !== "tick" || right.label !== RIGHT_LABEL) return null;
  if (right.choices.length !== 2 || right.choices[0] !== "Yes" || right.choices[1] !== "No") return null;
  if (right.answer !== "Yes" && right.answer !== "No") return null;
  if (fix.id !== "fix" || fix.kind !== "box" || fix.label !== FIX_LABEL || fix.answer?.type !== "number") return null;
  if (shownCheck.kind !== "template-shown" || shownCheck.region !== "right" || fixCheck.kind !== "template" || fixCheck.region !== "fix") return null;
  if (JSON.stringify(shownCheck.source) !== JSON.stringify(fixCheck.source)) return null;
  if (!/^\d{1,9}$/.test(shownCheck.shown)) return null;
  return { shown: Number(shownCheck.shown), right: right.answer, fix: fix.answer.value, source: fixCheck.source };
}

/** A number's digits without leading zeros: 4980 and 498 both begin "498". */
const digitsOf = (n: number) => String(n).replace(/^0+/, "");

/**
 * The answer given in the easier example (lesson 11): a wrong worked answer code makes for the example's own result, one
 * zero too few, else one too many, else one more. Never the question's result or shown answer, never one whose times a
 * power of 10 is the question's result, and never the first digits of it. Null when none is safe.
 */
export function spotExampleShown(exampleValue: number, question: { value: number; shown: number }): number | null {
  const candidates = [exampleValue % 10 === 0 ? exampleValue / 10 : null, exampleValue * 10, exampleValue + 1];
  for (const shown of candidates) {
    if (shown === null || !Number.isSafeInteger(shown) || shown <= 0 || shown === exampleValue) continue;
    if (shown === question.value || shown === question.shown) continue;
    if ([0, 1, 2, 3, 4, 5, 6, 7].some((k) => shown * 10 ** k === question.value)) continue;
    if (digitsOf(question.value).startsWith(digitsOf(shown))) continue;
    return shown;
  }
  return null;
}
