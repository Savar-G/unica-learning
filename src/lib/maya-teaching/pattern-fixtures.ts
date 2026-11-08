// Synthetic packages for the pattern tests, gate and practice. No customer data.
import { storedQuestion } from "./samples";
import { patternText, type PatternForm } from "@/lib/maya/pattern";

export function printedPattern(form: PatternForm, s = 26, d = 7) {
  const shape = {
    missing3: ["1.3:missing", "d", "s + 2 * d", d],
    missing9: ["1.6:missing", "d", "s + 8 * d", d],
    term4: ["1.1:bare", "s + 3 * d", null, s + 3 * d],
    plant3: ["1.2:story", "s + 3 * d", null, s + 3 * d],
    pair: ["1.5:bare", "2 * s + 8 * d", null, 2 * s + 8 * d],
    days8: ["1.7:story", "s + 8 * d", null, s + 8 * d],
  }[form] as [string, string, string | null, number];
  const [template, answer, derived, key] = shape;
  return storedQuestion({
    id: `pattern-${form}-${s}-${d}`, text: patternText(form, s, d), templateId: `5.10-pattern-rule#${template}`,
    skill: "5.10-pattern-rule", level: 16, format: ["missing9", "pair", "days8"].includes(form) ? "show-work" : "write-number", key,
    source: { slots: [{ name: "s", value: { int: String(s) }, domain: { min: 1, max: 50 } },
      { name: "d", value: { int: String(d) }, domain: { min: 2, max: 12 } }], answer, derived: derived ? [["t", derived]] : [], values: null,
      check: form === "missing9" ? "t >= 100 and t <= 200" : form === "pair" ? "2 * s + 8 * d >= 100 and 2 * s + 8 * d <= 200"
        : form === "days8" ? "s + 8 * d >= 100 and s + 8 * d <= 200" : null },
  });
}
