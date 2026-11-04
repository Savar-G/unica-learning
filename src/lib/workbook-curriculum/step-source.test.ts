import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { BC_SKILL_MAP } from "@/lib/assessment";
import { MISCONCEPTIONS } from "@/lib/assessment/misconceptions";
import { BC_CURRICULUM } from "./bc";
import { curriculumProblems } from "./check";
import { parseStepProgressions, stepFieldProblems } from "./step-source";
import { domainContains, domainProblems, prepareTemplate, seededRandom } from "./template";
import { compileExpression, formatValue } from "./expression";
import { auditTemplates } from "./template-audit";
const source = parseStepProgressions(JSON.parse(readFileSync("data/curriculum/step-progressions-k9.v1.json", "utf8")));
const originalBytes = readFileSync("data/curriculum/step-progressions-k9.original.json");
const original = parseStepProgressions(JSON.parse(originalBytes.toString()));
const candidate = { ...BC_CURRICULUM, steps: source.steps, contexts: source.contexts };
const baseline = JSON.parse(readFileSync("data/curriculum/template-audit.v1.json", "utf8"));
describe("staged progression import", () => {
  it("imports all source steps with no curriculum problems", () => {
    expect(source.steps).toHaveLength(1622);
    expect(new Set(source.steps.map(s => s.skill)).size).toBe(541);
    expect(BC_CURRICULUM.steps).toEqual(JSON.parse(readFileSync("data/curriculum/step-progressions-k9.json", "utf8")).steps);
    expect(BC_CURRICULUM.contexts).toEqual(source.contexts);
    expect(curriculumProblems(candidate, BC_SKILL_MAP)).toEqual([]);
  });
  it("requires steps in every level, including warm-up and activity skills", () => {
    // These cases vary step presence. The complete template fields are validated in the preceding source test.
    const required = { ...candidate, steps: source.steps.map(step => ({ ...step, templates: undefined })) };
    for (const level of candidate.levels) {
      const skill = candidate.skills.find(s => s.level === level.id)!;
      expect(curriculumProblems({ ...required, steps: required.steps.filter(s => s.skill !== skill.id) }, BC_SKILL_MAP)).toContain(`${skill.id} (${skill.level}) has no steps; every skill in every level needs them`);
    }
    for (const delivery of ["warm-up", "activity"]) {
      const skill = candidate.skills.find(s => s.delivery === delivery)!;
      expect(curriculumProblems({ ...required, steps: required.steps.filter(s => s.skill !== skill.id) }, BC_SKILL_MAP)).toContain(`${skill.id} (${skill.level}) has no steps; every skill in every level needs them`);
    }
  });
  it("reports reversed ranges, unknown domains, unknown placeholders and inline slots", () => {
    const step = source.steps[0], t = step.templates![0];
    expect(stepFieldProblems({ ...step, numbers: { count: { min: 9, max: 1 } } }, source.contexts).join("\n")).toContain("min <= max");
    expect(stepFieldProblems({ ...step, templates: [{ ...t, slots: { a: "missing" } }] }, source.contexts).join("\n")).toContain("unknown domain missing");
    expect(stepFieldProblems({ ...step, templates: [{ ...t, text: "{unknown}" }] }, source.contexts).join("\n")).toContain("unknown placeholder unknown");
    expect(stepFieldProblems({ ...step, templates: [{ ...t, slots: { a: { min: 1, max: 2 } } }] }, source.contexts).join("\n")).toContain("must name a numbers key or values list");
  });
  it("rejects invalid source shapes and object injection", () => {
    expect(() => parseStepProgressions(null)).toThrow();
    expect(() => parseStepProgressions({ ...source, steps: [null] })).toThrow();
    expect(() => parseStepProgressions({ ...source, steps: [{ ...source.steps[0], pages: -1 }] })).toThrow(/pages/);
    expect(() => parseStepProgressions({ ...source, contexts: { ...source.contexts, people: [] } })).toThrow(/people/);
    expect(() => parseStepProgressions(JSON.parse('{"__proto__": {"polluted": true}}'))).toThrow("Forbidden source key");
  });
  it("keeps the original bytes and records every corrected field without changing difficulty", () => {
    expect(createHash("sha256").update(originalBytes).digest("hex")).toBe("f22f6614a0f7013abde0b9228e1cf5ecdab4436fb99a6fbfabab73453a0726ea");
    type Patch = { skill: string; step: number; template: number | null; path: string[]; before: unknown; after: unknown; why: string };
    const patches: Patch[] = JSON.parse(readFileSync("data/curriculum/author-changes.v1.json", "utf8"));
    const reconstructed = JSON.parse(originalBytes.toString());
    for (const p of patches) {
      const step = reconstructed.steps.find((s: { skill: string; number: number }) => s.skill === p.skill && s.number === p.step);
      let target = p.template === null ? step : step.templates[p.template - 1];
      for (const key of p.path.slice(0, -1)) target = target[key];
      const key = p.path.at(-1)!;
      expect(target[key] ?? null).toEqual(p.before);
      target[key] = p.after;
      expect(p.why.length).toBeGreaterThan(0);
    }
    expect(reconstructed).toEqual(source);
    expect(patches.filter(p => p.path[0] === "slots")).toHaveLength(332);
    for (const [i, step] of source.steps.entries()) for (const [j, t] of step.templates!.entries()) {
      expect(t.difficulty).toBe(original.steps[i].templates![j].difficulty);
      expect(t.text).toBe(original.steps[i].templates![j].text);
      expect(t.format).toBe(original.steps[i].templates![j].format);
      expect(Object.values(t.slots).every(v => typeof v === "string")).toBe(true);
    }
  });
  it("keeps the 88 descriptions exact and applies only the approved page-budget increase", () => {
    const codes: { id: string; description: string }[] = JSON.parse(readFileSync("data/curriculum/new-mistake-codes.json", "utf8"));
    expect(codes).toHaveLength(88);
    for (const code of codes) expect(MISCONCEPTIONS[code.id as keyof typeof MISCONCEPTIONS]).toEqual({ description: code.description, evidence: "none" });
    expect(BC_CURRICULUM.skills.find(s => s.id === "K11-coin-attributes")!.pages).toBe(3);
    expect(BC_CURRICULUM.levels.find(l => l.id === "U3")!.skillPages).toBe(126);
    expect(BC_CURRICULUM.grades.find(g => g.schoolGrade === 0)).toEqual({ schoolGrade: 0, skillPages: 361, workbooks: 8 });
    expect(BC_CURRICULUM.levels.reduce((sum, l) => sum + l.workbooks, 0)).toBe(120);
    for (const l of BC_CURRICULUM.levels) expect(l.lead).toBe(l.number <= 3 ? "parent-led" : "child-led");
  });
  it("keeps corrected graph coordinates and answers consistent across the full accepted range", () => {
    const graph = source.steps.find(s => s.skill === "8.6-graph-relation" && s.number === 2)!;
    expect(source.steps.flatMap(s => Object.values(s.numbers ?? {}).flatMap(d => domainProblems(d)))).toEqual([]);
    for (const index of [0, 3]) {
      const prepared = prepareTemplate(graph, graph.templates![index], source.contexts);
      for (let seed = 0; seed < 100; seed++) {
        const item = prepared.fill(seededRandom(seed)), c = Number(formatValue(item.values.c)), g = Number(formatValue(item.values.g));
        expect(c).toBeGreaterThanOrEqual(1); expect(c).toBeLessThanOrEqual(4);
        expect(domainContains(graph.numbers!.x, item.values.c)).toBe(true);
        expect(domainContains(graph.numbers!.y, item.values.y)).toBe(true);
        expect(formatValue(item.values.y)).toBe(String(g * c));
        if (index === 3) expect(item.answer).toBe(item.values.flip === BigInt(0) ? "true" : "false");
        else expect(item.answer).toBe(String(c));
      }
    }
  });
  it("preserves the digit-sum and explicit-multiple meanings", () => {
    const digitStep = source.steps.find(s => s.skill === "6.4-divisibility" && s.number === 2)!;
    const sum = compileExpression(digitStep.templates![1].derived!.digit_sum);
    for (let n = 100; n <= 9999; n++) expect(formatValue(sum.evaluate({ n: BigInt(n) }))).toBe(String([...String(n)].reduce((s, c) => s + Number(c), 0)));
    const multiples = source.steps.find(s => s.skill === "4.1-multiples" && s.number === 3)!;
    const answer = compileExpression(multiples.templates![0].answer);
    for (let f = 2; f <= 9; f++) for (let t = 4; t <= 6; t++) expect(answer.evaluate({ f: BigInt(f), t: BigInt(t) })).toBe(`[${Array.from({ length: t }, (_, i) => f * (i + 1)).join(", ")}]`);
  });
  it("fills every template 30 times with no failures and preserves the original failure evidence", () => {
    const report = auditTemplates(source), expected = { ...baseline };
    delete expected.importProblems;
    expect(report).toEqual(expected);
    expect(report).toMatchObject({ templates: 7321, trials: 219630, passedFills: 219630, failedFills: 0, failedTemplates: 0 });
    const originalReport = JSON.parse(readFileSync("data/curriculum/template-audit.original.json", "utf8"));
    const originalExpected = { ...originalReport }; delete originalExpected.importProblems;
    expect(auditTemplates(original)).toEqual(originalExpected);
  }, 30000);
  it("checks the staged source without a write and rejects the uncorrected original", () => {
    const digest = () => createHash("sha256").update(readFileSync("src/lib/workbook-curriculum/bc.ts")).digest("hex");
    const before = digest();
    const run = spawnSync(process.execPath, ["scripts/import-curriculum.mjs", "--check"], { encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0); expect(digest()).toBe(before);
    const rejected = spawnSync(process.execPath, ["scripts/import-curriculum.mjs", ".design/workbooks/samples/curriculum-skeleton.xlsx", "data/curriculum/step-progressions-k9.original.json"], { encoding: "utf8" });
    expect(rejected.status).toBe(1); expect(rejected.stderr).toContain("nothing was written"); expect(digest()).toBe(before);
  }, 30000);
});
