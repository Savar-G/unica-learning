// The checks of a curriculum's data (#361), the skeleton's own validation in code. The import script runs them before
// it writes the data, and the tests run them on the data in the repo. Pure.
import type { SkillMap } from "@/lib/assessment";
import type { CurriculumData } from "./types";

/** 1st, 2nd, 3rd, 4th, 11th, 21st. */
function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
}

const gradeName = (grade: number) => (grade === 0 ? "Kindergarten" : `Grade ${grade}`);

/** Skill ids in a fixed order, for comparing and printing prerequisite lists. */
const idList = (ids: readonly string[]) => [...ids].sort().join(", ") || "nothing";

function sumBy<T, K>(items: readonly T[], key: (item: T) => K, value: (item: T) => number): Map<K, number> {
  const sums = new Map<K, number>();
  for (const item of items) sums.set(key(item), (sums.get(key(item)) ?? 0) + value(item));
  return sums;
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

/** A problem when the numbers are not exactly 1 to n. */
function oneToN(what: string, numbers: number[]): string[] {
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted.every((n, i) => n === i + 1) ? [] : [`${what} runs ${sorted.join(", ")}, not 1 to ${sorted.length}`];
}

/** What is wrong with a curriculum's data, checked against its skill map, one line per problem; empty when sound. */
export function curriculumProblems(data: CurriculumData, map: SkillMap): string[] {
  const problems: string[] = [];
  const mapSkills = new Map(map.standards.flatMap((s) => s.skills.map((k) => [k.id, k] as const)));
  const levelNumber = new Map<string, number>(data.levels.map((l) => [l.id, l.number]));

  const count = sumBy(data.skills, (s) => s.id, () => 1);
  for (const [id, n] of count) if (n > 1) problems.push(`${id} appears ${n} times`);
  for (const id of mapSkills.keys()) if (!count.has(id)) problems.push(`${id} is in the skill map but in no level`);

  const standards = new Map(map.standards.map((s) => [s.code, s]));
  for (const u of data.units) {
    const standard = standards.get(u.code);
    if (!standard) problems.push(`Unit ${u.code} is not a standard in the skill map`);
    else {
      if (u.text !== standard.text) problems.push(`Unit ${u.code} text "${u.text}" differs from the skill map: "${standard.text}"`);
      if (u.strand !== standard.strand) problems.push(`Unit ${u.code} strand ${u.strand} differs from the skill map: ${standard.strand}`);
    }
  }

  const skills = new Map(data.skills.map((s) => [s.id, s]));
  const unitLevel = new Map(data.units.map((u) => [u.code, u.level]));
  for (const s of data.skills) {
    const at = levelNumber.get(s.level);
    if (at === undefined) problems.push(`${s.id} is in ${s.level}, which is not a level`);
    if (unitLevel.get(s.unit) !== s.level) problems.push(`${s.id} is in ${s.level}, but its unit ${s.unit} is in ${unitLevel.get(s.unit) ?? "no level"}`);
    const inMap = mapSkills.get(s.id);
    if (!inMap) problems.push(`${s.id} is not a skill in the BC skill map`);
    else if (idList(s.requires) !== idList(inMap.requires)) {
      problems.push(`${s.id} requires ${idList(s.requires)}, but the skill map says ${idList(inMap.requires)}`);
    }
    for (const id of s.requires) {
      const req = skills.get(id);
      const reqAt = req && levelNumber.get(req.level);
      if (!req || reqAt === undefined) problems.push(`${s.id} requires ${id}, which is in no level`);
      else if (at === undefined) continue;
      else if (reqAt > at) problems.push(`${s.id} (${s.level}) requires ${id}, taught later (${req.level})`);
      else if (reqAt === at && req.order >= s.order) {
        problems.push(`${s.id} (${s.level}, ${ordinal(s.order)}) requires ${id}, taught after it (${req.level}, ${ordinal(req.order)})`);
      }
    }
  }
  const skillsOf = groupBy(data.skills, (s) => s.level);
  for (const l of data.levels) {
    problems.push(...oneToN(`${l.id} skill order`, (skillsOf.get(l.id) ?? []).map((s) => s.order)));
  }

  const levelPages = sumBy(data.skills, (s) => s.level, (s) => s.pages);
  for (const l of data.levels) {
    const sum = levelPages.get(l.id) ?? 0;
    if (sum !== l.skillPages) problems.push(`${l.id} skill pages add up to ${sum}, but the level says ${l.skillPages}`);
  }
  const gradePages = sumBy(data.levels, (l) => l.schoolGrade, (l) => levelPages.get(l.id) ?? 0);
  const gradeWorkbooks = sumBy(data.levels, (l) => l.schoolGrade, (l) => l.workbooks);
  for (const g of data.grades) {
    const [pages, workbooks] = [gradePages.get(g.schoolGrade) ?? 0, gradeWorkbooks.get(g.schoolGrade) ?? 0];
    if (pages !== g.skillPages) problems.push(`${gradeName(g.schoolGrade)} skill pages add up to ${pages}, but the budget is ${g.skillPages}`);
    if (workbooks !== g.workbooks) problems.push(`${gradeName(g.schoolGrade)} workbooks add up to ${workbooks}, but the budget is ${g.workbooks}`);
  }
  for (const grade of gradePages.keys()) {
    if (!data.grades.some((g) => g.schoolGrade === grade)) problems.push(`${gradeName(grade)} has levels but no budget`);
  }

  for (const [id, steps] of groupBy(data.steps, (s) => s.skill)) {
    const s = skills.get(id);
    const pages = steps.reduce((sum, step) => sum + step.pages, 0);
    if (!s) problems.push(`Steps of ${id}, which is in no level`);
    else if (pages !== s.pages) problems.push(`${id} step pages add up to ${pages}, but the skill has ${s.pages}`);
    problems.push(...oneToN(`${id} step numbering`, steps.map((step) => step.number)));
  }
  return problems;
}
