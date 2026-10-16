// The BC skill map (#192, spec #181): every BC Mathematics content standard that the bank uses, divided into smaller
// skills, with prerequisite edges between the skills. Pure data and pure checks: no network, database or clock.
import type { Strand } from "./types";
import type { BcSkill, BcStandard, SkillMap } from "./skill-map/kit";
import { BC_GRADES_K_2 } from "./skill-map/grades-k-2";
import { BC_GRADES_3_5 } from "./skill-map/grades-3-5";
import { BC_GRADES_6_8 } from "./skill-map/grades-6-8";

export type { BcSkill, BcStandard, SkillMap };

/** The BC skill map. The skills and the edges are an AI draft until reviewers check them (#194). */
export const BC_SKILL_MAP: SkillMap = {
  status: "draft",
  drafted: "AI first draft (2026-10-16), from the BC elaborations in .design/research/assessment-audit-2026-10-15/",
  standards: [...BC_GRADES_K_2, ...BC_GRADES_3_5, ...BC_GRADES_6_8],
};

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
