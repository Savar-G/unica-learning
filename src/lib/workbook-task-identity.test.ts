import { expect, it } from "vitest";
import type { QuestionPackage } from "./question-package";
import type { GeneratedPage } from "./workbook-generator";
import { workbookQuality } from "./workbook-quality";
import { storyKind, taskIdentity } from "./workbook-task-identity";

function question(text: string, value: number): QuestionPackage {
  return { id: "identity-regression", ref: { source: "workbook", workbookId: "identity-book", page: 3, question: 1 },
    templateId: null, text, textSource: "code", level: 19, difficulty: 1,
    skill: { standard: "6.4", skills: ["6.4-lcm"] }, operation: null, answer: null,
    steps: [], wrongAnswers: [], easierExample: null,
    item: { format: "write-number", scorable: true, parentChecked: false, error: null,
      regions: [{ id: "answer", kind: "box", label: null, answer: { type: "number", value } }], checks: [] } };
}

function page(pkg: QuestionPackage, number: number, day: number | null): GeneratedPage {
  return { number, day, pageOfDay: day === null ? null : 1, dayLabel: null, type: "practice", qrToken: "identity-regression",
    attempts: 0, fit: { status: "fits" }, questions: [{ number: 1, slot: "1.1", part: "practice", place: "on-your-own",
      attempts: 1, check: { status: "checked" }, package: pkg }] };
}
const repeats = (pages: GeneratedPage[]) => workbookQuality(pages).issues.filter(i => i.kind === "repeat" && /repeats pages/.test(i.reason));

// Printed mathematical inputs and response contracts from the rejected U19 audit. No family data or stored ids.
const audited: [number, number, QuestionPackage, QuestionPackage][] = [
  [17, 43, { ...question("First shared multiple of 2 and 10: 2 \u00d7 ?", 0), templateId: "6.4-lcm#1.6:missing", item: {"error": null, "checks": [{"kind": "template", "region": "answer", "source": {"check": "a != b and lcm(a, b) <= 24", "slots": [{"name": "a", "value": {"int": "2"}, "domain": {"max": 10, "min": 2}}, {"name": "b", "value": {"int": "10"}, "domain": {"max": 10, "min": 3}}], "answer": "lcm(a, b) // a", "values": null, "derived": []}}], "format": "two-ways", "regions": [{"id": "method-1", "kind": "work", "label": "Method 1"}, {"id": "method-2", "kind": "work", "label": "Method 2"}, {"id": "answer", "kind": "box", "label": null, "answer": {"type": "number", "value": 5}}], "scorable": true, "parentChecked": false} }, { ...question("First shared multiple of 2 and 10: 2 \u00d7 ?", 0), templateId: "6.4-lcm#1.6:missing", item: {"error": null, "checks": [{"kind": "template", "region": "answer", "source": {"check": "a != b and lcm(a, b) <= 24", "slots": [{"name": "a", "value": {"int": "2"}, "domain": {"max": 10, "min": 2}}, {"name": "b", "value": {"int": "10"}, "domain": {"max": 10, "min": 3}}], "answer": "lcm(a, b) // a", "values": null, "derived": []}}], "format": "write-number", "regions": [{"id": "answer", "kind": "box", "label": null, "answer": {"type": "number", "value": 5}}], "scorable": true, "parentChecked": false} }],
  [25, 41, { ...question("First shared multiple of 8 and 6: 8 \u00d7 ?", 0), templateId: "6.4-lcm#1.6:missing", item: {"error": null, "checks": [{"kind": "template", "region": "answer", "source": {"check": "a != b and lcm(a, b) <= 24", "slots": [{"name": "a", "value": {"int": "8"}, "domain": {"max": 10, "min": 2}}, {"name": "b", "value": {"int": "6"}, "domain": {"max": 10, "min": 3}}], "answer": "lcm(a, b) // a", "values": null, "derived": []}}], "format": "write-number", "regions": [{"id": "answer", "kind": "box", "label": null, "answer": {"type": "number", "value": 3}}], "scorable": true, "parentChecked": false} }, { ...question("First shared multiple of 8 and 6: 8 \u00d7 ?", 0), templateId: "6.4-lcm#1.6:missing", item: {"error": null, "checks": [{"kind": "template", "region": "answer", "source": {"check": "a != b and lcm(a, b) <= 24", "slots": [{"name": "a", "value": {"int": "8"}, "domain": {"max": 10, "min": 2}}, {"name": "b", "value": {"int": "6"}, "domain": {"max": 10, "min": 3}}], "answer": "lcm(a, b) // a", "values": null, "derived": []}}], "format": "two-ways", "regions": [{"id": "method-1", "kind": "work", "label": "Method 1"}, {"id": "method-2", "kind": "work", "label": "Method 2"}, {"id": "answer", "kind": "box", "label": null, "answer": {"type": "number", "value": 3}}], "scorable": true, "parentChecked": false} }],
  [22, 31, { ...question("The smallest prime factor of 89 is ?", 0), templateId: "6.4-prime-composite#2.3:missing", item: {"error": null, "checks": [{"kind": "template-shown", "shown": "98", "region": "right", "source": {"check": null, "slots": [{"name": "n", "value": {"int": "89"}, "domain": {"max": 100, "min": 31}}], "answer": "(2 if n % 2 == 0 else (3 if n % 3 == 0 else (5 if n % 5 == 0 else (7 if n % 7 == 0 else n))))", "values": null, "derived": []}}, {"kind": "template", "region": "fix", "source": {"check": null, "slots": [{"name": "n", "value": {"int": "89"}, "domain": {"max": 100, "min": 31}}], "answer": "(2 if n % 2 == 0 else (3 if n % 3 == 0 else (5 if n % 5 == 0 else (7 if n % 7 == 0 else n))))", "values": null, "derived": []}}], "format": "spot-the-error", "regions": [{"id": "right", "kind": "choice", "mark": "tick", "label": "Is it right?", "answer": "No", "choices": ["Yes", "No"]}, {"id": "fix", "kind": "box", "label": "Fix it", "answer": {"type": "number", "value": 89}}], "scorable": true, "parentChecked": false} }, { ...question("The smallest prime factor of 89 is ?", 0), templateId: "6.4-prime-composite#2.3:missing", item: {"error": null, "checks": [{"kind": "template", "region": "answer", "source": {"check": null, "slots": [{"name": "n", "value": {"int": "89"}, "domain": {"max": 100, "min": 31}}], "answer": "(2 if n % 2 == 0 else (3 if n % 3 == 0 else (5 if n % 5 == 0 else (7 if n % 7 == 0 else n))))", "values": null, "derived": []}}], "format": "write-number", "regions": [{"id": "answer", "kind": "box", "label": null, "answer": {"type": "number", "value": 89}}], "scorable": true, "parentChecked": false} }],
  [29, 43, { ...question("Of 3 acute and 5 obtuse angles, how many are smaller than a square corner?", 0), templateId: "6.13-classify-angles#1.6:bare", item: {"error": null, "checks": [{"kind": "template-shown", "shown": "4", "region": "right", "source": {"check": null, "slots": [{"name": "k", "value": {"int": "2"}, "domain": {"max": 4, "min": 0}}, {"name": "f", "value": {"int": "1"}, "domain": {"max": 1, "min": 0}}], "answer": "a", "values": null, "derived": [["a", "k + 1"], ["b", "1 + (k + 1 + f) % 5"]]}}, {"kind": "template", "region": "fix", "source": {"check": null, "slots": [{"name": "k", "value": {"int": "2"}, "domain": {"max": 4, "min": 0}}, {"name": "f", "value": {"int": "1"}, "domain": {"max": 1, "min": 0}}], "answer": "a", "values": null, "derived": [["a", "k + 1"], ["b", "1 + (k + 1 + f) % 5"]]}}], "format": "spot-the-error", "regions": [{"id": "right", "kind": "choice", "mark": "tick", "label": "Is it right?", "answer": "No", "choices": ["Yes", "No"]}, {"id": "fix", "kind": "box", "label": "Fix it", "answer": {"type": "number", "value": 3}}], "scorable": true, "parentChecked": false} }, { ...question("Of 3 acute and 5 obtuse angles, how many are smaller than a square corner?", 0), templateId: "6.13-classify-angles#1.6:bare", item: {"error": null, "checks": [{"kind": "template", "region": "answer", "source": {"check": null, "slots": [{"name": "k", "value": {"int": "2"}, "domain": {"max": 4, "min": 0}}, {"name": "f", "value": {"int": "1"}, "domain": {"max": 1, "min": 0}}], "answer": "a", "values": null, "derived": [["a", "k + 1"], ["b", "1 + (k + 1 + f) % 5"]]}}], "format": "write-number", "regions": [{"id": "answer", "kind": "box", "label": null, "answer": {"type": "number", "value": 3}}], "scorable": true, "parentChecked": false} }],
  [41, 46, { ...question("LCM of 6 and 9 = ?", 0), templateId: "6.4-lcm#2.1:bare", item: {"error": null, "checks": [{"kind": "template", "region": "answer", "source": {"check": "lcm(a, b) <= 72", "slots": [{"name": "g0", "value": {"int": "12"}, "domain": {"max": 21, "min": 9}}, {"name": "x0", "value": {"int": "12"}, "domain": {"max": 22, "min": 12}}, {"name": "y0", "value": {"int": "14"}, "domain": {"max": 21, "min": 9}}], "answer": "lcm(a, b)", "values": null, "derived": [["g", "g0 % 2 + 3"], ["x", "x0 % 3 + 2"], ["y", "x + 1 + y0 % 2"], ["a", "g * x"], ["b", "g * y"]]}}], "format": "write-number", "regions": [{"id": "answer", "kind": "box", "label": null, "answer": {"type": "number", "value": 18}}], "scorable": true, "parentChecked": false} }, { ...question("LCM of 6 and 9 = ?", 0), templateId: "6.4-lcm#2.1:bare", item: {"error": null, "checks": [{"kind": "template-shown", "shown": "19", "region": "right", "source": {"check": "lcm(a, b) <= 72", "slots": [{"name": "g0", "value": {"int": "12"}, "domain": {"max": 21, "min": 9}}, {"name": "x0", "value": {"int": "18"}, "domain": {"max": 22, "min": 12}}, {"name": "y0", "value": {"int": "12"}, "domain": {"max": 21, "min": 9}}], "answer": "lcm(a, b)", "values": null, "derived": [["g", "g0 % 2 + 3"], ["x", "x0 % 3 + 2"], ["y", "x + 1 + y0 % 2"], ["a", "g * x"], ["b", "g * y"]]}}, {"kind": "template", "region": "fix", "source": {"check": "lcm(a, b) <= 72", "slots": [{"name": "g0", "value": {"int": "12"}, "domain": {"max": 21, "min": 9}}, {"name": "x0", "value": {"int": "18"}, "domain": {"max": 22, "min": 12}}, {"name": "y0", "value": {"int": "12"}, "domain": {"max": 21, "min": 9}}], "answer": "lcm(a, b)", "values": null, "derived": [["g", "g0 % 2 + 3"], ["x", "x0 % 3 + 2"], ["y", "x + 1 + y0 % 2"], ["a", "g * x"], ["b", "g * y"]]}}], "format": "spot-the-error", "regions": [{"id": "right", "kind": "choice", "mark": "tick", "label": "Is it right?", "answer": "No", "choices": ["Yes", "No"]}, {"id": "fix", "kind": "box", "label": "Fix it", "answer": {"type": "number", "value": 18}}], "scorable": true, "parentChecked": false} }],
];

it.each(audited)("preserves distinct response tasks on audited pages %i/%i", (a, b, first, second) => {
  expect(taskIdentity(first)).not.toBe(taskIdentity(second));
  expect(repeats([page(first, a, 1), page(second, b, 2)])).toEqual([]);
});

it("ignores unused sampling slots, derived provenance, template ids and region ids for the same LCM task", () => {
  const original = audited[4][2];
  const changed = structuredClone(original);
  changed.templateId = "different-source#1.1:bare";
  for (const check of changed.item?.checks ?? []) if (check.kind === "template") {
    check.source.slots.push({ name: "unused", value: { int: "999" }, domain: { min: 0, max: 999 } });
    check.source.derived.push(["irrelevant", "unused + 1"]);
    check.source.check = "True";
    check.region = "renamed";
  }
  for (const region of changed.item?.regions ?? []) region.id = "renamed";
  expect(taskIdentity(changed)).toBe(taskIdentity(original));
  expect(repeats([page(original, 3, 1), page(changed, 4, 1)])).toHaveLength(1);
});

it("distinguishes displayed wrong answers, but not sampling noise behind the same error task", () => {
  const first = audited[4][3];
  const changed = structuredClone(first);
  for (const check of changed.item?.checks ?? []) if (check.kind === "template-shown") check.shown = "20";
  expect(taskIdentity(first)).not.toBe(taskIdentity(changed));
  const noise = structuredClone(first);
  for (const check of noise.item?.checks ?? []) if (check.kind === "template" || check.kind === "template-shown") {
    check.source.slots.push({ name: "unused", value: { int: "1" }, domain: [1] });
  }
  expect(taskIdentity(first)).toBe(taskIdentity(noise));
});

it.each([
  ["8 × 6 = ?", "? = 8 × 6", 48],
  ["8 × 6 = ?", "6 × 8 = ?", 48],
  ["6 is 1 and ?", "? and 1 make 6", 5],
  ["Mia has 8 shells and gets 6 more. How many shells now?", "Kai has 6 blocks and gets 8 more. How many blocks now?", 14],
])("recognizes equivalent printed forms: %s / %s", (a, b, value) => {
  expect(taskIdentity(question(a, value))).toBe(taskIdentity(question(b, value)));
});

it("uses the printed question before optional operation metadata, regardless of teaching provenance", () => {
  const first = question("8 × 6 = ?", 48);
  const second: QuestionPackage = { ...first, operation: { kind: "multiply", operands: [8, 6] } };
  expect(taskIdentity(first)).toBe(taskIdentity(second));
  expect(taskIdentity({ ...second, operationSource: "maya" })).toBe(taskIdentity(first));
});

it.each([
  ["2 + 2 = ?", "2 × 2 = ?", 4],
  ["Of 3 acute and 3 obtuse angles, how many are smaller than a square corner?", "Of 3 acute and 3 obtuse angles, how many are larger than a square corner?", 3],
  ["In 111, what is the hundreds digit?", "In 111, what is the ones digit?", 1],
  ["Of 3 red and 5 blue counters, how many are red?", "Of 5 red and 3 blue counters, how many are blue?", 3],
])("keeps different relationships or asked quantities distinct: %s / %s", (a, b, value) => {
  expect(taskIdentity(question(a, value))).not.toBe(taskIdentity(question(b, value)));
});

it("preserves the one spaced extra-practice repeat only at U4–U9 and at least 40 pages later", () => {
  for (const level of [4, 9, 10, 19]) {
    const pkg = { ...question("2 + 1 = ?", 3), level };
    expect(repeats([page(pkg, 3, 1), page(pkg, 43, null)])).toHaveLength(level <= 9 ? 0 : 1);
    expect(repeats([page(pkg, 3, 1), page(pkg, 42, null)])).toHaveLength(1);
    expect(repeats([page(pkg, 3, 1), page(pkg, 43, 8)])).toHaveLength(1);
    expect(repeats([page(pkg, 3, 1), page(pkg, 43, null), page(pkg, 83, null)])).toHaveLength(level <= 9 ? 1 : 2);
  }
});

it("includes a hand-built error's displayed claim without depending on its internal step id", () => {
  const base = question("8 × 6 = ?", 48);
  if (!base.item) throw new Error("fixture needs an item");
  const first: QuestionPackage = { ...base, item: { ...base.item, format: "spot-the-error",
    error: { answer: { type: "number", value: 46 }, step: "multiply" } } };
  const second: QuestionPackage = { ...base, item: { ...base.item, format: "spot-the-error",
    error: { answer: { type: "number", value: 47 }, step: "multiply" } } };
  const renamed: QuestionPackage = { ...base, item: { ...base.item, format: "spot-the-error",
    error: { answer: { type: "number", value: 46 }, step: "different-internal-id" } } };
  expect(taskIdentity(first)).not.toBe(taskIdentity(second));
  expect(taskIdentity(first)).toBe(taskIdentity(renamed));
});

// The U19 sweep's Day 2 (Luis, 2026-11-19): an estimated total read as no story at all, so the page counted two groups
// stories and failed "one kind". A total of two amounts is a join; groups, compare and take-away keep their kinds.
it("reads a total of two amounts as a join, and keeps the stronger kinds first", () => {
  expect(storyKind("Amara picked 31.327 kg of apples in the morning and 48.991 kg in the afternoon. Estimate the total kg by rounding to whole numbers.")).toBe("join");
  expect(storyKind("Ana buys 3 notebooks at $2.50 each. What is the total?")).toBe("groups");
  expect(storyKind("The total of two bars is 80. One bar shows 30. How many fewer does it show than the other bar?")).toBe("compare");
  expect(storyKind("Jin buys 29 packs of 653 toy drums. How many toy drums is that?")).toBe("groups");
});
