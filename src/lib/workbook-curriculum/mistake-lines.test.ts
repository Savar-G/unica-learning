import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MISCONCEPTIONS } from "@/lib/assessment/misconceptions";
import { BC_CURRICULUM, curriculumFor } from "./index";
import { parseStepProgressions, stepFieldProblems } from "./step-source";
import type { ExpectedMistake } from "./types";
import { mistakeContext, MISTAKE_VERIFIER_MODEL, verifiedWatchOut, watchOutProblems } from "./watch-out";
import type { WatchOutPair } from "./types";

const source = JSON.parse(readFileSync("data/curriculum/step-progressions-k9.json", "utf8"));
const active = parseStepProgressions(source);
const codedSteps = active.steps.filter(s => s.mistakes.some(m => m.misconception !== null));
const coded = codedSteps.flatMap(s => s.mistakes.filter(m => m.misconception !== null).map(m => ({ step: s, mistake: m })));
const report = JSON.parse(readFileSync("data/curriculum/mistake-verification.json", "utf8")) as {
  coverage: { verified: number; dropped: number; pairsWritten: number; candidateVersionsWritten: number; rejected: number };
  records: { id: string; context: unknown; attempts: { round: number; pair: WatchOutPair | null; verified: boolean; reason: string; verifierModel: string }[] }[];
};

describe("C2 mistake lines", () => {
  it("accounts for every coded mistake and exposes only independently verified pairs", () => {
    expect(codedSteps).toHaveLength(1417);
    expect(coded).toHaveLength(1503);
    expect(new Set(coded.map(x => x.mistake.misconception)).size).toBe(327);
    expect(active.steps).toEqual(BC_CURRICULUM.steps);
    expect(report.records).toHaveLength(coded.length);
    expect(new Set(report.records.map(r => r.id)).size).toBe(coded.length);
    let verified = 0;
    for (const { step, mistake } of coded) {
      const at = `${step.skill}#${step.number} ${mistake.misconception}`;
      expect(Object.hasOwn(MISCONCEPTIONS, mistake.misconception!), at).toBe(true);
      const index = step.mistakes.indexOf(mistake);
      const record = report.records.find(r => r.id === `${step.skill}#${step.number}:${index}`)!;
      expect(record.context, at).toEqual(mistakeContext(step, mistake));
      expect(record.attempts.length, at).toBeGreaterThan(0);
      expect(record.attempts.length, at).toBeLessThanOrEqual(3);
      record.attempts.forEach((a, round) => {
        expect(a.round, at).toBe(round);
        expect(typeof a.verified, at).toBe("boolean");
        expect(a.reason.trim(), at).not.toBe("");
      });
      const accepted = record.attempts.find(a => a.verified);
      if (accepted) {
        verified++;
        expect(accepted.verifierModel, at).toBe(MISTAKE_VERIFIER_MODEL);
        expect(verifiedWatchOut(step, mistake), at).toBe(mistake.watchOut);
        expect(mistake.watchOut, at).toMatchObject({ ...accepted.pair, verified: true, verifierModel: MISTAKE_VERIFIER_MODEL });
        expect(watchOutProblems(mistake.watchOut!), at).toEqual([]);
      } else {
        expect(record.attempts, at).toHaveLength(3);
        expect(mistake.watchOut, at).toBeUndefined();
      }
      expect(curriculumFor("bc")!.skillSteps(step.skill)!.find(s => s.number === step.number)!.mistakes, at).toContainEqual(mistake);
    }
    expect(verified).toBe(report.coverage.verified);
    expect(coded.length - verified).toBe(report.coverage.dropped);
    expect(report.coverage.pairsWritten).toBe(report.records.filter(r => r.attempts.some(a => a.pair)).length);
    expect(report.coverage.rejected).toBe(report.records.filter(r => r.attempts.some(a => a.pair && !a.verified)).length);
  });

  it("logs every new line and changes only the added pair inside each mistake", () => {
    const patches = JSON.parse(readFileSync("data/curriculum/author-changes.json", "utf8")) as {
      skill: string; step: number; path: string[]; before: ExpectedMistake[]; after: ExpectedMistake[]; why: string;
    }[];
    const changes = patches.filter(p => p.why.startsWith("C2-R2:"));
    const markdown = readFileSync("data/curriculum/author-changes.md", "utf8");
    expect(changes).toHaveLength(codedSteps.length);
    expect(new Set(changes.map(p => `${p.skill}#${p.step}`)).size).toBe(changes.length);
    for (const step of codedSteps) {
      const change = changes.find(p => p.skill === step.skill && p.step === step.number)!;
      expect(change.path).toEqual(["mistakes"]);
      expect(change.after).toEqual(step.mistakes);
      const withoutPairs = (mistakes: readonly ExpectedMistake[]) => mistakes.map(mistake => {
        const original = { ...mistake };
        delete original.watchOut;
        return original;
      });
      expect(withoutPairs(change.after)).toEqual(withoutPairs(change.before));
      for (const [index, mistake] of step.mistakes.entries()) if (mistake.misconception !== null) {
        expect(markdown).toContain(`| ${step.skill} | ${step.number} | ${index + 1} |`);
        if (mistake.watchOut) expect(markdown).toContain(`${mistake.watchOut.wrong} / ${mistake.watchOut.fix}`);
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

  it("keeps all retained numbers printable without relying on a shared misconception pair", () => {
    const all = coded.flatMap(x => x.mistake.watchOut ? [x.mistake.watchOut] : []);
    expect(all.length).toBe(report.coverage.verified);
    expect(all.length).toBeGreaterThan(0);
    expect(all.some(p => p.fix.includes("1,000"))).toBe(true);
    expect(all.flatMap(watchOutProblems)).toEqual([]);
  });
});
