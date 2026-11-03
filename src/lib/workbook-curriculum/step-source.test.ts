import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { BC_SKILL_MAP } from "@/lib/assessment";
import { MISCONCEPTIONS } from "@/lib/assessment/misconceptions";
import { BC_CURRICULUM } from "./bc";
import { curriculumProblems } from "./check";
import { parseStepProgressions, stepFieldProblems } from "./step-source";
import { domainContains, domainProblems, fillTemplate, seededRandom } from "./template";
import { formatValue } from "./expression";
import { auditTemplates } from "./template-audit";
const raw: unknown = JSON.parse(readFileSync("data/curriculum/step-progressions-k9.json", "utf8"));
const source = parseStepProgressions(raw);
const candidate = { ...BC_CURRICULUM, steps: source.steps, contexts: source.contexts };
const baseline = JSON.parse(readFileSync("data/curriculum/template-audit.json", "utf8"));
describe("staged progression import", () => {
  it("holds all source steps but refuses activation while author data has errors", () => {
    expect(source.steps).toHaveLength(1622);
    expect(new Set(source.steps.map(s => s.skill)).size).toBe(541);
    expect(curriculumProblems(candidate, BC_SKILL_MAP)).toEqual(baseline.importProblems);
    expect(baseline.importProblems).toContain("K11-coin-attributes step pages add up to 3, but the skill has 2");
    expect(BC_CURRICULUM.steps).toHaveLength(155);
  });
  it("requires steps in every level, including warm-up and activity skills", () => {
    for (const level of candidate.levels) {
      const skill = candidate.skills.find(s => s.level === level.id)!;
      const steps = source.steps.filter(s => s.skill !== skill.id);
      expect(curriculumProblems({ ...candidate, steps }, BC_SKILL_MAP)).toContain(`${skill.id} (${level.id}) has no steps; every skill in every level needs them`);
    }
    for (const delivery of ["warm-up", "activity"]) {
      const skill = candidate.skills.find(s => s.delivery === delivery)!;
      expect(curriculumProblems({ ...candidate, steps: source.steps.filter(s => s.skill !== skill.id) }, BC_SKILL_MAP)).toContain(`${skill.id} (${skill.level}) has no steps; every skill in every level needs them`);
    }
  });
  it("reports reversed ranges, unknown domain names, unknown placeholders, and inline slots", () => {
    const step = source.steps[0];
    expect(stepFieldProblems({ ...step, numbers: { count: { min: 9, max: 1 } } }, source.contexts).join("\n")).toContain("min <= max");
    const t = step.templates![0];
    expect(stepFieldProblems({ ...step, templates: [{ ...t, slots: { a: "missing" }, text: "{unknown}" }] }, source.contexts).join("\n")).toMatch(/unknown domain missing/);
    expect(stepFieldProblems({ ...step, templates: [{ ...t, text: "{unknown}" }] }, source.contexts).join("\n")).toMatch(/unknown placeholder unknown/);
    expect(stepFieldProblems({ ...step, templates: [{ ...t, slots: { a: { min: 1, max: 2 } } }] }, source.contexts).join("\n")).toContain("must name a numbers key or values list");
  });
  it("reads only validated JSON shapes and rejects object injection", () => {
    expect(() => parseStepProgressions(null)).toThrow();
    expect(() => parseStepProgressions({ ...source, steps: [null] })).toThrow();
    expect(() => parseStepProgressions({ ...source, steps: [{ ...source.steps[0], pages: -1 }] })).toThrow(/pages/);
    expect(() => parseStepProgressions({ ...source, contexts: { ...source.contexts, people: [] } })).toThrow(/people/);
    expect(() => parseStepProgressions(JSON.parse('{"__proto__": {"polluted": true}}'))).toThrow("Forbidden source key");
  });
  it("adds every author misconception with its exact description and no research claim", () => {
    const codes: { id: string; description: string }[] = JSON.parse(readFileSync("data/curriculum/new-mistake-codes.json", "utf8"));
    expect(codes).toHaveLength(88);
    for (const code of codes) expect(MISCONCEPTIONS[code.id as keyof typeof MISCONCEPTIONS]).toEqual({ description: code.description, evidence: "none" });
  });
  it("confirms the remaining price and graph range problems against the source", () => {
    const priceSteps = source.steps.filter(s => Object.entries(s.numbers ?? {}).some(([key, domain]) => key === "price" && domainProblems(domain).some(p => p.includes("within min and max"))));
    expect(priceSteps.map(s => `${s.skill}/${s.number}`)).toEqual(["7.13-sale-price/3", "7.13-total-cost/1", "7.13-total-cost/2", "7.13-total-cost/3"]);
    for (const s of priceSteps) {
      expect(s.numbers!.price).toMatchObject({ min: 20, values: expect.arrayContaining([10]) });
    }
    expect(source.steps.flatMap(s => Object.values(s.numbers ?? {}).flatMap(domainProblems)).filter(p => p.includes("no value on its decimal grid"))).toEqual([]);
    const graph = source.steps.find(s => s.skill === "8.6-graph-relation" && s.number === 2)!;
    for (const [index, seed] of [[0, 666305181], [3, 39677870]]) {
      const t = graph.templates![index], item = fillTemplate(graph, t, source.contexts, seededRandom(seed));
      expect(domainContains(graph.numbers!.x, item.values.c)).toBe(false);
      expect(["5", "6"]).toContain(formatValue(item.values.c));
    }
  });
  it("uses parent-led only in Kindergarten, and child-led from U4", () => {
    for (const l of BC_CURRICULUM.levels) expect(l.lead).toBe(l.number <= 3 ? "parent-led" : "child-led");
  });
  it("reports all 7321 templates over 30 fixed seeds without hiding the data failures", () => {
    const report = auditTemplates(source);
    expect(report.templates).toBe(7321);
    expect(report.trials).toBe(7321 * 30);
    expect(report.passedFills + report.failedFills).toBe(report.trials);
    const expected = { ...baseline };
    delete expected.importProblems;
    expect(report).toEqual(expected);
    expect(report.failedFills).toBeGreaterThan(0);
  }, 30000);
  it("stops the actual importer before writing any active curriculum bytes", () => {
    const digest = () => createHash("sha256").update(readFileSync("src/lib/workbook-curriculum/bc.ts")).digest("hex");
    const before = digest();
    const run = spawnSync(process.execPath, ["scripts/import-curriculum.mjs"], { encoding: "utf8" });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("nothing was written");
    expect(run.stderr).toContain("K11-coin-attributes step pages add up to 3, but the skill has 2");
    expect(digest()).toBe(before);
  }, 30000);
});
