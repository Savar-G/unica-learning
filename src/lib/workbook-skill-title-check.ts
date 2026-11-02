// Pure checks shared by the offline writer, tests and page titles. No title may silently fall back to its unit.
import { BC_SKILL_MAP } from "@/lib/assessment/skill-map";
import { titleProblem } from "@/lib/workbook-title-rules";

export function skillTitleProblems(titles: Readonly<Record<string, string>>): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const unit of BC_SKILL_MAP.standards) {
    const seen = new Map<string, string>();
    for (const skill of unit.skills) {
      ids.add(skill.id);
      const title = titles[skill.id];
      if (typeof title !== "string") {
        problems.push(`${skill.id}: missing title`);
        continue;
      }
      const problem = titleProblem(title);
      if (problem) problems.push(`${skill.id}: ${problem}`);
      const key = title.toLowerCase();
      if (seen.has(key)) problems.push(`${skill.id}: title "${title}" repeats ${seen.get(key)} within unit ${unit.code}`);
      seen.set(key, skill.id);
    }
  }
  for (const id of Object.keys(titles)) if (!ids.has(id)) problems.push(`${id}: not a skill in the BC map`);
  return problems;
}
