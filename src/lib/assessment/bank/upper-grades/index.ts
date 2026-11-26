import { LEVEL_10 } from "./level-10";
import { LEVEL_11 } from "./level-11";
import { LEVEL_12 } from "./level-12";

const families = [...LEVEL_10, ...LEVEL_11, ...LEVEL_12];

export const UPPER_TEMPLATES = families.flatMap(family => family.templates);
// Local placement objectives for the approved items.
export const UPPER_STANDARDS = families.map(family => family.standard);
export const UPPER_TAGS = Object.fromEntries(families.flatMap(({ mainSkill, templates }) =>
  templates.map(({ id }) => [id, [mainSkill.id]] as const)));
export const UPPER_WORDING = Object.fromEntries(families.flatMap(({ wording, templates }) =>
  templates.map(({ id }) => [id, wording] as const)));
export const UPPER_DIFFICULTY = Object.fromEntries(UPPER_TEMPLATES.map(({ id }) => [id, "medium"] as const));
