import { expect, it } from "vitest";
import { templateMethod } from "./workbook-book";
import type { TemplateSource } from "./question-package-template";

const source: TemplateSource = {
  answer: "'true' if flip == 0 else 'false'", check: null, values: null,
  slots: [
    { name: "b", value: { int: "10" }, domain: { min: 8, max: 20 } },
    { name: "flip", value: { int: "0" }, domain: { min: 0, max: 1 } },
  ],
  derived: [["bad", "b * 10"]],
};

it("does not teach a sensible estimate with its distractor's calculation", () => {
  expect(templateMethod(source, "True or false: about 10 pencils fit in a pencil case.")).toBeNull();
});

it("keeps a calculation that the true-or-false question actually prints", () => {
  expect(templateMethod(source, "True or false: 10 × 10 = 100.")).toBe("Work it out: 10 × 10 = 100.");
});

it("does not match a printed calculation by a fragment of its operands", () => {
  expect(templateMethod(source, "True or false: 110 × 100 = 11,000.")).toBeNull();
});

it("uses the printed operation rather than a different derived calculation", () => {
  expect(templateMethod({ ...source, derived: [["bad", "b * 10"], ["sum", "b + 10"]] }, "True or false: 10 + 10 = 20.")).toBe("Work it out: 10 + 10 = 20.");
});
