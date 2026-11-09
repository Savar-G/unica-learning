import { describe, expect, it } from "vitest";
import { BC_CURRICULUM, curriculumStructure, curriculumStructureOf, curriculumVersion, structureDifference } from ".";
import { nextBookCurriculumCompat, type CurriculumCompatSource } from "./compat";
import { archivedCurriculumStructure, archivedStructureIn } from "./history";
import { CURRICULUM_STRUCTURE_FORMAT, readCurriculumStructureRecord, structureOfRecord } from "./structure";
import type { CurriculumData } from "./types";

const FROZEN = "0c03a54a51742c070ffff230599f";
const DIGEST = "a".repeat(28), COMMIT = "b".repeat(40), BLOB = "c".repeat(40);
const recordOf = (data: CurriculumData = BC_CURRICULUM) =>
  ({ format: CURRICULUM_STRUCTURE_FORMAT, key: "bc", digest: DIGEST, source: { commit: COMMIT, path: "src/lib/workbook-curriculum/bc.ts", blob: BLOB },
    levels: curriculumStructureOf(data).levels });

/** BC with unit 5.16 moved before 5.2 in U18, renumbered and recoded as a valid import would be. */
function reordered(): CurriculumData {
  const changed = structuredClone(BC_CURRICULUM) as { -readonly [K in keyof CurriculumData]: CurriculumData[K] } & CurriculumData;
  const level = changed.levels.find(l => l.id === "U18")! as unknown as { units: string[] };
  level.units = ["5.16", ...level.units.filter(u => u !== "5.16")];
  let order = 0;
  level.units.forEach((unit, unitIndex) => {
    changed.skills.filter(s => s.unit === unit).sort((a, b) => a.order - b.order).forEach((skill, skillIndex) => {
      const s = skill as { order: number; position: string };
      s.order = ++order; s.position = `U18.${unitIndex + 1}.${skillIndex + 1}`;
      for (const step of changed.steps.filter(x => x.skill === skill.id)) (step as { position: string }).position = `${s.position}.${step.number}`;
    });
  });
  return changed;
}

describe("curriculum structure", () => {
  it("is the same for the generator's data and the raw import, and round-trips through an archive file", () => {
    const now = curriculumStructure("bc")!;
    expect(now).toEqual(curriculumStructureOf(BC_CURRICULUM));
    expect(curriculumStructure("on")).toBeNull();
    expect(now.levels.map(l => l.id)).toEqual(Array.from({ length: 30 }, (_, i) => `U${i + 1}`));
    const text = JSON.stringify(recordOf());
    const read = readCurriculumStructureRecord(JSON.parse(text), "bc", DIGEST);
    expect(read).not.toBeNull();
    expect(structureOfRecord(read!)).toEqual(now);
    expect(archivedStructureIn([JSON.parse(text)], "bc", DIGEST)).toEqual(now);
  });

  it("ignores templates, practice, number ranges and question wording", () => {
    const changed = structuredClone(BC_CURRICULUM);
    const steps = changed.steps as CurriculumData["steps"][number][];
    steps.forEach((s, i) => {
      steps[i] = { ...s, templates: [], practice: [], numbers: {}, rules: "other", change: "other", example: { problem: "1 + 1", answer: "2" }, mistakes: [] };
    });
    expect(structureDifference(curriculumStructureOf(BC_CURRICULUM), curriculumStructureOf(changed))).toBeNull();
  });

  it("names the first structural difference", () => {
    const before = curriculumStructureOf(BC_CURRICULUM);
    expect(structureDifference(before, curriculumStructureOf(reordered()))).toMatch(/^level U18 has units \[5\.16, 5\.2,/);
    const removed = structuredClone(BC_CURRICULUM);
    (removed as unknown as { skills: unknown[] }).skills = removed.skills.filter(s => s.id !== "4.1-expanded-form");
    (removed as unknown as { steps: unknown[] }).steps = removed.steps.filter(s => s.skill !== "4.1-expanded-form");
    expect(structureDifference(before, curriculumStructureOf(removed))).toMatch(/^unit 4\.1 has skills \[/);
    const renumbered = structuredClone(BC_CURRICULUM);
    const step = renumbered.steps.find(s => s.skill === "4.1-expanded-form" && s.number === 2)! as { number: number };
    step.number = 9;
    expect(structureDifference(before, curriculumStructureOf(renumbered))).toMatch(/^skill 4\.1-expanded-form has steps \[1 /);
    const renamed = structuredClone(BC_CURRICULUM);
    (renamed.steps.find(s => s.skill === "4.1-expanded-form" && s.number === 2)! as { name: string }).name = "Another step";
    expect(structureDifference(before, curriculumStructureOf(renamed))).toContain("Another step");
    const moved = structuredClone(BC_CURRICULUM);
    (moved.skills.find(s => s.id === "4.1-expanded-form")! as { position: string }).position = "U16.9.9";
    expect(structureDifference(before, curriculumStructureOf(moved))).toBe("skill 4.1-expanded-form has position U16.9.9, not U13.1.3");
  });

  it("refuses a malformed archive file", () => {
    const good = () => JSON.parse(JSON.stringify(recordOf()));
    expect(readCurriculumStructureRecord(good(), "bc", DIGEST)).not.toBeNull();
    const bad: [string, (r: ReturnType<typeof good>) => unknown][] = [
      ["another digest", r => { r.digest = "d".repeat(28); }],
      ["another key", r => { r.key = "on"; }],
      ["another format", r => { r.format = "curriculum-structure/2"; }],
      ["an extra field", r => { r.templates = []; }],
      ["no source commit", r => { r.source.commit = "abc"; }],
      ["no levels", r => { r.levels = []; }],
      ["levels out of order", r => { r.levels.reverse(); }],
      ["a unit twice", r => { r.levels[1].units.push(r.levels[0].units[0]); }],
      ["skills out of order", r => { r.levels[0].units[0].skills.reverse(); }],
      ["a skill in another level", r => { r.levels[0].units[0].skills[0].level = "U2"; }],
      ["steps out of order", r => { r.levels[0].units[0].skills[0].steps.reverse(); }],
      ["a step with no name", r => { delete r.levels[0].units[0].skills[0].steps[0].name; }],
      ["a step with a template", r => { r.levels[0].units[0].skills[0].steps[0].templates = []; }],
    ];
    for (const [name, change] of bad) {
      const r = good();
      change(r);
      expect(readCurriculumStructureRecord(r, "bc", DIGEST), name).toBeNull();
      expect(archivedStructureIn([r], "bc", DIGEST), name).toBeNull();
    }
    expect(readCurriculumStructureRecord(null, "bc", DIGEST)).toBeNull();
    expect(readCurriculumStructureRecord("{}", "bc", DIGEST)).toBeNull();
    // Two files for one version: neither is trusted.
    expect(archivedStructureIn([good(), good()], "bc", DIGEST)).toBeNull();
  });

  it("holds the first customer's Book 1 curriculum, whose structure is today's", () => {
    // A structural change to BC fails this: the customer's next book would then be refused as curriculum-incompatible.
    const frozen = archivedCurriculumStructure("bc", FROZEN);
    expect(frozen).not.toBeNull();
    expect(structureDifference(frozen!, curriculumStructure("bc")!),
      "This structural change to the BC curriculum refuses the first customer's next book (baseline d018b981) as curriculum-incompatible. "
      + "Do not edit src/lib/workbook-curriculum/history/*.json to make this pass: it is the frozen curriculum, made by scripts/curriculum-history.mjs. "
      + "See docs/next-book-curriculum-history.md and ask the Workbook Generator lead.").toBeNull();
    expect(archivedCurriculumStructure("bc", "e".repeat(28))).toBeNull();
    expect(archivedCurriculumStructure("on", FROZEN)).toBeNull();
  });
});

describe("next-book curriculum compatibility", () => {
  const now = curriculumVersion("bc")!;
  const source = (o: Partial<CurriculumCompatSource>): CurriculumCompatSource =>
    ({ version: curriculumVersion, structure: curriculumStructure, frozen: () => null, ...o });

  it("keeps the same version, and follows a structure-equal version", () => {
    expect(nextBookCurriculumCompat("bc", now)).toEqual({ ok: true, same: true });
    expect(nextBookCurriculumCompat("bc", now, source({ frozen: () => { throw Error("not read"); } }))).toEqual({ ok: true, same: true });
    expect(nextBookCurriculumCompat("bc", FROZEN)).toEqual(now === FROZEN ? { ok: true, same: true } : { ok: true, same: false });
    expect(nextBookCurriculumCompat("bc", DIGEST, source({ frozen: (k, v) => (v === DIGEST ? curriculumStructure(k) : null) }))).toEqual({ ok: true, same: false });
  });

  it("refuses a version not in the archive, a changed structure and an unknown curriculum", () => {
    expect(nextBookCurriculumCompat("bc", DIGEST)).toEqual({ ok: false, reason: "curriculum-history-missing" });
    const changed = nextBookCurriculumCompat("bc", DIGEST, source({ frozen: () => curriculumStructure("bc"), structure: () => curriculumStructureOf(reordered()) }));
    expect(changed).toMatchObject({ ok: false, reason: "curriculum-incompatible", difference: expect.stringMatching(/^level U18 has units/) });
    expect(nextBookCurriculumCompat("bc", DIGEST, source({ frozen: () => curriculumStructure("bc"), structure: () => null })))
      .toMatchObject({ ok: false, reason: "curriculum-incompatible" });
    expect(nextBookCurriculumCompat("bc", DIGEST, source({ frozen: () => { throw Error("bad"); } }))).toMatchObject({ ok: false, reason: "curriculum-incompatible" });
    expect(nextBookCurriculumCompat("on", DIGEST)).toEqual({ ok: false, reason: "curriculum-version-changed" });
  });
});
