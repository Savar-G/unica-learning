// Skill tags (#193, spec #181): the ids of the BC skill map skills that each question template tests, so results can
// be read per skill and the learner profile can follow prerequisites. The tags themselves are data, in
// bank/skill-tags/; this file holds the structural check and the lookup. Pure: no network, database or clock.
import type { SkillTag } from "./bank/kit";
import { SKILL_TAGS } from "./bank/skill-tags";
import { BC_SKILL_MAP } from "./skill-map";
import type { SkillMap } from "./skill-map/kit";

export type { SkillTag };
export { SKILL_TAGS };

/** One skill a template tests, with its text and the code of the standard it belongs to. */
export interface TemplateSkill {
  id: string;
  text: string;
  standard: string;
}

/** The skill ids of a tag, main skill first. */
export const tagSkills = (tag: SkillTag): readonly string[] => ("skills" in tag ? tag.skills : tag);

/**
 * The skills a template tests, main skill first; empty for a template with no tag (one removed from the bank since a
 * test was stored). Looked up by template id, so a tag corrected after review (#194) shows on tests stored before it.
 */
export function templateSkills(templateId: string, tags: Readonly<Record<string, SkillTag>> = SKILL_TAGS, map: SkillMap = BC_SKILL_MAP): TemplateSkill[] {
  const tag = tags[templateId];
  if (!tag) return [];
  const skills = new Map(map.standards.flatMap((s) => s.skills.map((k) => [k.id, { id: k.id, text: k.text, standard: s.code }] as const)));
  return tagSkills(tag).flatMap((id) => skills.get(id) ?? []);
}

/** The note of a tag, or undefined for a plain list. */
const tagNote = (tag: SkillTag): string | undefined => ("skills" in tag ? tag.note : undefined);

/**
 * What is wrong with the skill tags of these templates, one line per problem; empty when they are sound.
 * Checks: every template has a tag with at least one skill; every skill id is in the map; a tag holds a skill of the
 * template's own standard, or else only prerequisites (direct or deeper) of that standard's skills; and a tag with
 * any skill outside the template's standard has a note that says why.
 */
export function skillTagProblems(
  templates: readonly { id: string; standard: string }[],
  tags: Readonly<Record<string, SkillTag>>,
  map: SkillMap,
): string[] {
  const problems: string[] = [];
  const standardOf = new Map(map.standards.flatMap((s) => s.skills.map((k) => [k.id, s.code] as const)));
  const requires = new Map(map.standards.flatMap((s) => s.skills.map((k) => [k.id, k.requires] as const)));

  /** Every skill that the skills of a standard need, directly or deeper. */
  const prerequisitesOf = (code: string): Set<string> => {
    const found = new Set<string>();
    const stack = map.standards.filter((s) => s.code === code).flatMap((s) => s.skills.flatMap((k) => k.requires));
    while (stack.length) {
      const id = stack.pop()!;
      if (found.has(id)) continue;
      found.add(id);
      stack.push(...(requires.get(id) ?? []));
    }
    return found;
  };

  for (const t of templates) {
    const tag = tags[t.id];
    if (!tag) {
      problems.push(`Template ${t.id} has no skill tag`);
      continue;
    }
    const skills = tagSkills(tag);
    if (skills.length === 0) problems.push(`Template ${t.id} has a skill tag with no skill`);
    const unknown = skills.filter((id) => !standardOf.has(id));
    for (const id of unknown) problems.push(`Template ${t.id} is tagged with ${id}, which is not a skill in the map`);

    const known = skills.filter((id) => standardOf.has(id));
    const outside = known.filter((id) => standardOf.get(id) !== t.standard);
    if (known.length > 0 && outside.length === known.length) {
      const prerequisites = prerequisitesOf(t.standard);
      const notPrerequisite = outside.filter((id) => !prerequisites.has(id));
      if (notPrerequisite.length > 0) {
        problems.push(`Template ${t.id} (standard ${t.standard}) has no skill of its standard, and ${notPrerequisite.join(", ")} is not a prerequisite of it`);
        continue;
      }
    }
    if (outside.length > 0 && !tagNote(tag)?.trim()) problems.push(`Template ${t.id} (standard ${t.standard}) is tagged with ${outside.join(", ")} from another standard, with no note`);
  }
  return problems;
}
