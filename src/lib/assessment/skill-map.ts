// The BC skill map (#192, spec #181): the BC Mathematics content standards from Kindergarten to grade 9 (every one the
// bank uses, and grade 9 for the workbooks), divided into smaller skills, with prerequisite edges between the skills.
// Pure data and pure checks: no network, database or clock.
import type { Level, Strand } from "./types";
import type { BcSkill, BcStandard, SkillMap, SkillMapGrade } from "./skill-map/kit";
import { BC_GRADES_K_2 } from "./skill-map/grades-k-2";
import { BC_GRADES_3_5 } from "./skill-map/grades-3-5";
import { BC_GRADES_6_8 } from "./skill-map/grades-6-8";
import { BC_GRADE_9 } from "./skill-map/grade-9";

export type { BcSkill, BcStandard, SkillMap, SkillMapGrade };

/** The BC skill map. The skills and the edges are an AI draft until reviewers check them (#194). */
export const BC_SKILL_MAP: SkillMap = {
  status: "draft",
  drafted: "AI first draft (2026-10-16), from the BC elaborations in .design/research/assessment-audit-2026-10-15/; grade 9 (2026-10-27) from the BC Mathematics 9 elaborations on curriculum.gov.bc.ca",
  standards: [...BC_GRADES_K_2, ...BC_GRADES_3_5, ...BC_GRADES_6_8, ...BC_GRADE_9],
};

/** A standard of the map on the assessment's K-8 Level scale. */
export type LevelStandard = BcStandard & { grade: Level };

/**
 * The map's standards on the K-8 Level scale: what the assessment core reads (the learner profile, the AI's next
 * challenges and workbook plan, the report's findings). Grade 9 is in the map for the workbooks only: no template or test
 * level is 9, so a grade 9 standard is never a next challenge or a report topic.
 *
 * Rule (D-153): keep this guard. A strong grade 7 or 8 child reaches grade 9 content only through the workbook level
 * progression, after passing the level test for the grade 8 skills that the grade 9 skill requires (its prerequisite
 * edges), never as a next challenge from one placement test. BC grade 9 is the first year of high school, and one test
 * is too thin evidence for that jump. Do not widen this filter to grade 9 without a new decision.
 */
export const BC_LEVEL_STANDARDS: readonly LevelStandard[] = BC_SKILL_MAP.standards.filter((s): s is LevelStandard => s.grade !== 9);

/**
 * What is wrong with a skill map's structure, one line per problem; empty when it is sound.
 * Checks: each standard is listed once and has skills; each skill id is unique and starts with its standard's code;
 * each prerequisite is a skill in the map, taught in the same grade or earlier; no prerequisite cycle.
 */
export function skillMapProblems(map: SkillMap): string[] {
  const problems: string[] = [];
  const codes = new Set<string>();
  const ids = new Set<string>();
  for (const s of map.standards) {
    if (codes.has(s.code)) problems.push(`Standard ${s.code} is listed twice`);
    codes.add(s.code);
    if (s.skills.length === 0) problems.push(`Standard ${s.code} has no skills`);
    for (const k of s.skills) {
      if (ids.has(k.id)) problems.push(`Skill id ${k.id} is used twice`);
      ids.add(k.id);
      if (!k.id.startsWith(`${s.code}-`)) problems.push(`Skill ${k.id} is in standard ${s.code}, but its id does not start with "${s.code}-"`);
    }
  }
  const skills = new Map(map.standards.flatMap((s) => s.skills.map((k) => [k.id, k] as const)));
  const grade = new Map(map.standards.flatMap((s) => s.skills.map((k) => [k.id, s.grade] as const)));

  for (const [id, k] of skills) {
    for (const req of k.requires) {
      if (!skills.has(req)) problems.push(`${id} requires ${req}, which is not a skill in the map`);
      else if (grade.get(req)! > grade.get(id)!) problems.push(`${id} (grade ${grade.get(id)}) requires ${req}, taught later (grade ${grade.get(req)})`);
    }
  }

  // Depth-first search; a prerequisite that is still on the path closes a cycle.
  const done = new Set<string>();
  const path: string[] = [];
  const visit = (id: string) => {
    if (done.has(id)) return;
    const at = path.indexOf(id);
    if (at >= 0) {
      problems.push(`Prerequisite cycle: ${[...path.slice(at), id].join(" requires ")}`);
      return;
    }
    path.push(id);
    for (const next of skills.get(id)?.requires ?? []) if (skills.has(next)) visit(next);
    path.pop();
    done.add(id);
  };
  for (const id of skills.keys()) visit(id);
  return problems;
}

/** Names of the internal strands, for the reviewers' view (curriculum map, section 2.1). */
export const STRAND_NAMES: Record<Strand, string> = {
  N: "Number sense and place value",
  O: "Operations",
  F: "Fractions, decimals, ratio and percent",
  A: "Patterns and algebra",
  MG: "Measurement and geometry",
  DP: "Data and probability",
};
