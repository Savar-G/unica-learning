import { expect, it } from "vitest";
import { templateMethod } from "./workbook-book";
import type { TemplateSource } from "./question-package-template";

function expanded(h: number, o: number): TemplateSource {
  return { answer: "str(h * 100) + ' + ' + str(o)", check: null, values: null,
    slots: [{ name: "h", value: { int: String(h) }, domain: { min: 1, max: 9 } },
      { name: "o", value: { int: String(o) }, domain: { min: 1, max: 9 } }],
    derived: [["n", "100 * h + o"]] };
}

it.each([[3, 5], [7, 9]])("explains the hundreds, empty tens and ones of %i hundreds and %i ones", (h, o) => {
  const number = 100 * h + o;
  const method = templateMethod(expanded(h, o), `Write ${number} in expanded form.`);
  expect(method).toContain(`${h} hundreds`);
  expect(method).toContain("0 tens");
  expect(method).toContain(`${o} ones`);
  expect(method).toContain(`${100 * h} + ${o} = ${number}`);
});

it("does not explain hundreds when the source multiplies its digit by ten", () => {
  expect(templateMethod({ ...expanded(3, 5), answer: "str(h * 10) + ' + ' + str(o)" }, "Write 35 in expanded form.")).toBeNull();
});

it("does not explain an expanded form whose number differs from its structured places", () => {
  expect(templateMethod({ ...expanded(3, 5), derived: [["n", "100 * h + o + 10"]] }, "Write 315 in expanded form.")).toBeNull();
});

it.each([0, 1, 2])("explains zero-place digit and value examples for place selector %i", sv => {
  const source: TemplateSource = { ...expanded(3, 5),
    slots: [...expanded(3, 5).slots, { name: "sv", value: { int: String(sv) }, domain: { min: 0, max: 2 } }] };
  const place = ["tens", "ones", "hundreds"][sv];
  const digit = [0, 5, 3][sv];
  const plain = templateMethod({ ...source, answer: "0 if sv == 0 else (o if sv == 1 else h)" }, `What digit is in the ${place} place of 305?`);
  expect(plain).toContain(`The ${place} digit is ${digit}`);
  expect(plain).toContain("0 tens");
  const value = templateMethod({ ...source, answer: "0 if sv == 0 else (o if sv == 1 else h * 100)" }, `What is the value of the digit in the ${place} place of 305?`);
  expect(value).toContain(`worth ${[0, 5, 300][sv]}`);
});
