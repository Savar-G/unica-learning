import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MISCONCEPTIONS } from "@/lib/assessment/misconceptions";
import { SAM_MISTAKES, samWork, type SamMistake } from "@/lib/workbook-book";
import { samMistakeFor } from "@/lib/workbook-mistake-map";
import type { Operation } from "@/lib/question-package";
import { BC_CURRICULUM, curriculumFor } from "./index";
import { parseStepProgressions, stepFieldProblems } from "./step-source";
import type { ExpectedMistake } from "./types";
import { watchOutProblems } from "./watch-out";

const source = JSON.parse(readFileSync("data/curriculum/step-progressions-k9.json", "utf8"));
const active = parseStepProgressions(source);
const codedSteps = active.steps.filter(s => s.mistakes.some(m => m.misconception !== null));
const coded = codedSteps.flatMap(s => s.mistakes.filter(m => m.misconception !== null).map(m => ({ step: s, mistake: m })));

describe("C2 mistake lines", () => {
  it("covers every coded mistake in the source and the public curriculum", () => {
    expect(codedSteps).toHaveLength(1417);
    expect(coded).toHaveLength(1503);
    expect(new Set(coded.map(x => x.mistake.misconception)).size).toBe(327);
    expect(active.steps).toEqual(BC_CURRICULUM.steps);
    for (const { step, mistake } of coded) {
      const at = `${step.skill}#${step.number} ${mistake.misconception}`;
      expect(Object.hasOwn(MISCONCEPTIONS, mistake.misconception!), at).toBe(true);
      expect(mistake.watchOut, at).toBeDefined();
      expect(watchOutProblems(mistake.watchOut!), at).toEqual([]);
      expect(curriculumFor("bc")!.skillSteps(step.skill)!.find(s => s.number === step.number)!.mistakes, at).toContainEqual(mistake);
    }
  });

  it("logs every new line and changes only the added pair inside each mistake", () => {
    const patches = JSON.parse(readFileSync("data/curriculum/author-changes.json", "utf8")) as {
      skill: string; step: number; path: string[]; before: ExpectedMistake[]; after: ExpectedMistake[]; why: string;
    }[];
    const changes = patches.filter(p => p.why.startsWith("C2:"));
    const markdown = readFileSync("data/curriculum/author-changes.md", "utf8");
    expect(changes).toHaveLength(codedSteps.length);
    expect(new Set(changes.map(p => `${p.skill}#${p.step}`)).size).toBe(changes.length);
    for (const step of codedSteps) {
      const change = changes.find(p => p.skill === step.skill && p.step === step.number)!;
      expect(change.path).toEqual(["mistakes"]);
      expect(change.after).toEqual(step.mistakes);
      expect(change.after.map(mistake => {
        const original = { ...mistake };
        delete original.watchOut;
        return original;
      })).toEqual(change.before);
      for (const mistake of step.mistakes.filter(m => m.misconception !== null)) {
        expect(markdown).toContain(`| ${step.skill} | ${step.number} | ${mistake.misconception} | ${mistake.watchOut!.wrong} | ${mistake.watchOut!.fix} |`);
      }
    }
  });

  it.each(["picture", "shade", "shaded", "colour", "color", "draw", "trace", "dots", "counter", "ten-frame", "chart", "graph", "bar", "certain", "unlikely"])("rejects unprintable text containing %s", word => {
    expect(watchOutProblems({ wrong: `Use a ${word}.`, fix: "Check the value." })).toContain("wrong is not printable");
    expect(watchOutProblems({ wrong: "Use the wrong value.", fix: `Use a ${word}.` })).toContain("fix is not printable");
  });

  it("enforces the joining space in the 150-character limit", () => {
    expect(watchOutProblems({ wrong: "a".repeat(74), fix: "b".repeat(75) })).toEqual([]);
    expect(watchOutProblems({ wrong: "a".repeat(75), fix: "b".repeat(75) })).toContain("pair exceeds 150 characters");
    expect(watchOutProblems({ wrong: " ", fix: "Check." })).toContain("wrong is not printable");
  });

  it.each(["1000", "10 000", "1\u00a0000", "1\u202f000", "1000.25", "1,0000"])("rejects an unformatted number %s", number => {
    expect(watchOutProblems({ wrong: `Write ${number}.`, fix: "Check the places." })).toContain("wrong needs commas for thousands");
    expect(watchOutProblems({ wrong: "Mix up the places.", fix: `Write ${number}.` })).toContain("fix needs commas for thousands");
    expect(watchOutProblems({ wrong: "Write 1,000 as 100.", fix: "Keep all the places: 1,000." })).toEqual([]);
  });

  it.each(["1,000", "10,000.25", "1,000,000", "0.0001", "12,345.6789"])("accepts a correctly written number %s", number => {
    expect(watchOutProblems({ wrong: "Mix up the places.", fix: `Write ${number}.` })).toEqual([]);
  });

  it("rejects malformed pairs and reports invalid ids and unprintable pairs through the import checks", () => {
    const step = active.steps[0];
    for (const watchOut of [null, "text", { wrong: "Check." }, { wrong: 12, fix: "Check." }]) {
      expect(() => parseStepProgressions({ ...source, steps: [{ ...step, mistakes: [{ ...step.mistakes[0], watchOut }] }] })).toThrow(/mistakes/);
    }
    const changed = { ...step, mistakes: [{ ...step.mistakes[0], misconception: "constructor", watchOut: { wrong: "Use a picture.", fix: "Check." } }] };
    const problems = stepFieldProblems(changed, active.contexts).join("\n");
    expect(problems).toContain("unknown misconception");
    expect(problems).toContain("wrong is not printable");
  });

  it("keeps legacy data readable and leaves uncoded mistakes without a guessed pair", () => {
    expect(() => parseStepProgressions(JSON.parse(readFileSync("data/curriculum/step-progressions-k9.v1.json", "utf8")))).not.toThrow();
    for (const step of active.steps) for (const mistake of step.mistakes) {
      if (mistake.misconception === null) expect(mistake.watchOut).toBeUndefined();
    }
  });

  it("keeps plain examples available for early steps and large place values", () => {
    const pair = (skill: string, number: number) => active.steps.find(s => s.skill === skill && s.number === number)!.mistakes[0].watchOut!;
    expect(pair("K1-rote-count-10", 1)).toEqual({ wrong: "Skip or repeat a number.", fix: "Say each number once, in order." });
    expect(pair("2.1-read-write-100", 2)).toEqual({ wrong: "Write forty-six as 406.", fix: "Four tens and six ones is 46." });
    expect(pair("2.1-read-write-100", 3).fix).toContain("sixty-seven");
    expect(pair("4.1-expanded-form", 1).fix).toContain("4,325");
    const all = coded.map(x => x.mistake.watchOut!);
    expect(all.some(p => p.fix.includes("1,000"))).toBe(true);
    expect(all.some(p => /\b\d{4,}\b/.test(`${p.wrong} ${p.fix}`))).toBe(false);
  });
});

const mappings: { id: keyof typeof MISCONCEPTIONS; mistake: SamMistake; operation: Operation; wrong: number }[] = [
  { id: "O3", mistake: "forgot-carry", operation: { kind: "add", operands: [268, 157] }, wrong: 315 },
  { id: "carry-dropped", mistake: "forgot-carry", operation: { kind: "add", operands: [268, 157] }, wrong: 315 },
  { id: "O1", mistake: "smaller-from-larger", operation: { kind: "subtract", operands: [52, 18] }, wrong: 46 },
  { id: "O2", mistake: "smaller-from-larger", operation: { kind: "subtract", operands: [302, 18] }, wrong: 316 },
  { id: "smaller-from-larger", mistake: "smaller-from-larger", operation: { kind: "subtract", operands: [52, 18] }, wrong: 46 },
  { id: "regroup-forget", mistake: "regroup-not-taken", operation: { kind: "subtract", operands: [52, 18] }, wrong: 44 },
  { id: "count-start", mistake: "wrong-start", operation: { kind: "add", operands: [8, 3] }, wrong: 10 },
  { id: "operation", mistake: "wrong-operation", operation: { kind: "add", operands: [8, 3] }, wrong: 5 },
  { id: "operation-swap", mistake: "wrong-operation", operation: { kind: "subtract", operands: [8, 3] }, wrong: 11 },
  { id: "digit-reversal", mistake: "swapped-digits", operation: { kind: "add", operands: [18, 5] }, wrong: 32 },
];

describe("closed misconception to Sam mapping", () => {
  it.each(mappings)("demonstrates $id as $mistake with fresh numbers", ({ id, mistake, operation, wrong }) => {
    expect(Object.hasOwn(MISCONCEPTIONS, id)).toBe(true);
    expect(SAM_MISTAKES).toContain(mistake);
    expect(samMistakeFor(id)).toBe(mistake);
    expect(samWork(operation, { type: "number", value: wrong }, samMistakeFor(id))).toMatchObject({ mistake, answer: wrong });
  });

  it("has exactly the tested entries and no guessed match for any other known id", () => {
    const mapped = Object.keys(MISCONCEPTIONS).filter(id => samMistakeFor(id) !== null);
    expect(mapped.sort()).toEqual(mappings.map(m => m.id).sort());
    expect(mapped).toHaveLength(10);
    for (const id of Object.keys(MISCONCEPTIONS)) {
      if (!mappings.some(m => m.id === id)) expect(samMistakeFor(id), id).toBeNull();
    }
  });

  it.each(["", "unknown", "forgot-carry", "regroup-not-taken", "counted-one-extra", "O3-extra", "o3", " O3", "constructor", "toString", "__proto__"])("returns no mapping for %j", id => {
    expect(samMistakeFor(id)).toBeNull();
  });

  it("requires the planned sum to allow the mapped mistake", () => {
    expect(samWork({ kind: "add", operands: [12, 3] }, { type: "number", value: 15 }, samMistakeFor("O3"))).toBeNull();
    expect(samWork({ kind: "multiply", operands: [268, 3] }, { type: "number", value: 604 }, samMistakeFor("carry-dropped"))).toBeNull();
  });
});
