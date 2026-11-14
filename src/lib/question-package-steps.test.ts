import { expect, it } from "vitest";
import { MOST_TEMPLATE_STEPS, templateSolvingSteps, templateSourceSteps } from "@/lib/question-package-steps";
import type { QuestionPackage } from "@/lib/question-package";
import type { TemplateSource } from "@/lib/question-package-template";
// One stored question per template form and format the generator has printed (live workbooks, 2026-11-14): text, answer
// regions and template checks only.
import forms from "@/lib/question-package-steps.fixtures.json";

const packages = forms as unknown as QuestionPackage[];
function stored(pkg: QuestionPackage): string {
  const region = pkg.item!.checks.find(c => c.kind === "template" || c.kind === "template-choice")!.region;
  const r = pkg.item!.regions.find(x => x.id === region)!;
  if (r.kind === "choice") return r.answer as string;
  const a = (r as { answer: { type: string; value?: unknown; numerator?: number; denominator?: number; whole?: number } }).answer;
  return a.type === "fraction" ? `${a.numerator}/${a.denominator}` : a.type === "mixed" ? `${a.whole} ${a.numerator}/${a.denominator}` : String(a.value);
}
const endsAt = (steps: string[], answer: string) => steps.at(-1) === `So the answer is ${answer}.` || steps.at(-1)!.endsWith(`= ${answer}`);

it.each(packages.map(p => [p.templateId, p] as const))("%s: steps, when code writes them, end at the stored answer", (_id, pkg) => {
  const steps = templateSolvingSteps(pkg);
  if (steps === null) return;
  expect(steps.length).toBeGreaterThan(0); expect(steps.length).toBeLessThanOrEqual(MOST_TEMPLATE_STEPS);
  expect(endsAt(steps, stored(pkg))).toBe(true);
  for (const s of steps) expect(s.length).toBeLessThanOrEqual(240);
});
it("writes steps for most template forms, and the forms with none are the known ones", () => {
  const none = packages.filter(p => !templateSolvingSteps(p)).map(p => `${p.templateId!.replace(/#[^:]*/, "")} ${p.item!.format}`);
  expect(packages.length - none.length).toBeGreaterThanOrEqual(107);
  expect(none.sort()).toEqual([
    "2.1-place-value-tens-ones:true-false circle", "2.2-benchmarks-25-50-100:choose circle", "2.4-word-problems-100:choose circle",
    "3.1-estimate-quantity:choose write-number", "3.1-estimate-quantity:story circle", "3.1-place-value-1000:bare write-words",
    "3.1-place-value-1000:choose circle", "3.1-place-value-1000:choose write-number", "3.1-place-value-1000:true-false circle",
    "3.13-independent-trials:true-false circle", "4.12-read-analog:bare write-words", "4.18-money-notation:true-false circle",
    "4.6-add-decimals:true-false circle", "5.9-distributive:true-false circle", "5.9-multiply-tens:true-false circle",
    "5.9-recall-facts:story circle", "5.9-recall-facts:true-false circle",
  ]);
});

const source = (answer: string, derived: [string, string][], slots: [string, number, { min: number; max: number }?][]): TemplateSource => ({
  answer, check: null, derived, values: null, slots: slots.map(([name, v, domain]) => ({ name, value: { int: String(v) }, domain: domain ?? { min: 0, max: 1000 } })),
});
it("a pattern's missing term: one line per operation, innermost first, never the sampling rule", () => {
  expect(templateSourceSteps(source("a + 2 * d", [["a", "2 + a0 % 20"], ["b", "a + d"]], [["a0", 17], ["d", 10]]), "19, 29, ?, 49"))
    .toEqual(["2 × 10 = 20", "19 + 20 = 39"]);
});
it("a missing number is found by undoing the operation it came from", () => {
  expect(templateSourceSteps(source("b", [["a", "a0"], ["b", "b0"], ["c", "a * b"]], [["a0", 173], ["b0", 5]]), "173 × ? = 865")).toEqual(["865 ÷ 173 = 5"]);
  expect(templateSourceSteps(source("b", [["a", "a0"], ["b", "b0"], ["c", "a - b"]], [["a0", 13], ["b0", 3]]), "13 − ? = 10")).toEqual(["13 − 10 = 3"]);
  // A number the question prints is chosen, not found: no steps that undo a value to reach it.
  expect(templateSourceSteps(source("str(b)", [["t", "b * 10"]], [["b", 28]]), "Which guess is sensible: 280 or 28?")).toBeNull();
});
it("place value names the digit's place", () => {
  expect(templateSourceSteps(source("n // 1000 % 10", [["n", "n0"]], [["n0", 13187, { min: 10000, max: 99999 }]]), "In 13187, which digit is in the thousands place?"))
    .toEqual(["The thousands digit of 13187 is 3.", "So the answer is 3."]);
  expect(templateSourceSteps(source("nt", [["nh", "n0 // 100"], ["nt", "n0 // 10 % 10"], ["no", "n0 % 10"], ["n", "100 * nh + 10 * nt + no"]], [["n0", 648]]), "Ethan's score is 648 points. Which digit is in the tens place?"))
    .toEqual(["The tens digit of 648 is 4.", "So the answer is 4."]);
});
it("a true or false answer sets the right number beside the shown one", () => {
  const src = source("'true' if flip == 0 else 'false'", [["a", "a0"], ["shown", "(a + (n - 1) * d) + flip * (1 + (a % 7))"]], [["a0", 52], ["d", 2], ["n", 4], ["flip", 1, { min: 0, max: 1 }]]);
  expect(templateSourceSteps(src, "Number 1 is 52. Add 2 each time. True or false: number 4 is 62."))
    .toEqual(["4 − 1 = 3", "3 × 2 = 6", "52 + 6 = 58", "The right number is 58, not 62.", "So the answer is false."]);
  const fact = source("'true' if flip == 0 else 'false'", [["shown", "a * b if flip == 0 else a * b + 1"]], [["a", 6], ["b", 6], ["flip", 1, { min: 0, max: 1 }]]);
  expect(templateSourceSteps(fact, "True or false: 6 × 6 = 37.")).toEqual(["6 × 6 = 36", "The right number is 36, not 37.", "So the answer is false."]);
});
it("a comparison that chooses the answer is shown with its numbers", () => {
  expect(templateSourceSteps(source("'<' if a < b else '>'", [], [["a", 157], ["b", 721]]), "Write < or >: 157 ? 721")).toEqual(["157 < 721 is true.", "So the answer is <."]);
});
it("words joined together and a source that cannot run give no steps", () => {
  expect(templateSourceSteps(source("str(h) + ':' + str(m)", [], [["h", 9], ["m", 40]]))).toBeNull();
  expect(templateSourceSteps(source("a + b", [], [["a", 3]]))).toBeNull();
  expect(templateSourceSteps({ ...source("a", [], [["a", 2000, { min: 0, max: 10 }]]) })).toBeNull();
});
it("steps that would disagree with the stored answer are never given", () => {
  const pkg = structuredClone(packages.find(p => p.templateId?.startsWith("3.6-increasing-pattern") && p.item!.format === "write-number")!);
  expect(templateSolvingSteps(pkg)).not.toBeNull();
  const box = pkg.item!.regions.find(r => r.id === "answer") as { answer: { value: number } };
  box.answer.value += 1;
  expect(templateSolvingSteps(pkg)).toBeNull();
});
