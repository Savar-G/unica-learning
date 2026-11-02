import { describe, expect, it } from "vitest";
import { approvedQuestionTypes, buildPlannedItem, itemContractProblem, itemExamples, planItem } from "./workbook-item-plan";
import { toSolve } from "./workbook-solve-check";

const make = (skill = "1.1-one-more-less-20", story = false) => planItem({ skill, story, slot: "1.1", level: 4, day: 2, ordinal: 31, range: { min: 1, max: 10, pictures: true, help: "full" } })!;
const place = (skill: string) => ({ id: "q", workbookId: "00000000-0000-4000-8000-0000000000a1", page: 3, question: 1, level: 4, skills: [skill] });

describe("binding item plans", () => {
  it("fails closed for unknown skills and has only circle-word tasks for likelihood", () => {
    expect(approvedQuestionTypes("new-skill")).toEqual([]);
    expect(planItem({ skill: "new-skill", slot: "1", level: 4, day: 1, ordinal: 1, range: { min: 1, max: 10, pictures: true, help: "full" } })).toBeNull();
    const p = make("1.10-likelihood-words");
    const b = buildPlannedItem(p, p.item, place(p.item.skill));
    expect(b.package?.item?.regions[0]).toMatchObject({ kind: "choice", mark: "circle", choices: ["never", "maybe", "always"] });
    expect(b.package?.text).not.toMatch(/draw|trace/i);
  });
  it("builds sound drills from code and makes no solve request", () => {
    for (let ordinal = 1; ordinal < 100; ordinal++) {
      const p = planItem({ skill: "1.1-one-more-less-20", slot: "1.1", level: 4, day: 1, ordinal, range: { min: 1, max: 8, pictures: true, help: "full" } })!;
      const b = buildPlannedItem(p, p.item, place(p.item.skill));
      expect(b.check, p.item.text).toEqual({ status: "checked" });
      expect(toSolve(b.package!).questions).toEqual([]);
    }
  });
  it("rejects a different format, operand, missing number, extra number, and duplicated number", () => {
    const p = make("1.1-one-more-less-20", true);
    expect(itemContractProblem(p.item, p)).toBeNull();
    for (const raw of [{ ...p.item, format: "draw" }, { ...p.item, operation: null }, { ...p.item, text: "Mia has shells." }, { ...p.item, text: `${p.item.text} She has 18 cats.` }, { ...p.item, text: `${p.item.text} ${p.numbers[0]}` }]) {
      expect(itemContractProblem(raw, p)).not.toBeNull();
    }
  });
  it("keeps the story words for an independent solve check", () => {
    const p = make("1.1-one-more-less-20", true);
    const b = buildPlannedItem(p, p.item, { ...place(p.item.skill), story: true });
    expect(b.check).toEqual({ status: "checked" });
    expect(b.package?.text).toBe(p.item.text);
    expect(toSolve(b.package!).questions.length).toBeGreaterThan(0);
  });
  it("prints a row to colour or an empty ten-frame for counting", () => {
    const p = make("1.1-count-objects-20");
    const b = buildPlannedItem(p, p.item, place(p.item.skill));
    expect(b.check.status).toBe("not-checked");
    expect(b.package?.item?.figure).toBeTruthy();
    expect(b.package?.text).toMatch(/Colour|Fill a ten-frame/);
  });
  it("supplies examples for each approved type and grade band", () => {
    for (const level of [4, 14, 26]) for (const source of ["story", "explain"] as const) {
      expect(itemExamples("add", level, source).items.length).toBeGreaterThanOrEqual(2);
    }
  });
});
