// Skill tags for every bank template (#193): template id -> the BC skill map skills it tests, main skill first. One
// file per bank part, in the order of the bank files, so a reviewer's correction (#194) is a one-line edit. The
// structural test (skill-tags.test.ts) fails on an untagged template or an unknown skill id.
import type { SkillTag } from "../kit";
import { TAGS_GRADES_1_2 } from "./grades-1-2";
import { TAGS_GRADES_3_5_LEVELS_3_4 } from "./grades-3-5-levels-3-4";
import { TAGS_GRADES_3_5_LEVELS_5_6 } from "./grades-3-5-levels-5-6";
import { TAGS_GRADES_6_7_LEVELS_5_6 } from "./grades-6-7-levels-5-6";
import { TAGS_GRADES_6_7_LEVELS_7_8 } from "./grades-6-7-levels-7-8";

const PARTS = [TAGS_GRADES_1_2, TAGS_GRADES_3_5_LEVELS_3_4, TAGS_GRADES_3_5_LEVELS_5_6, TAGS_GRADES_6_7_LEVELS_5_6, TAGS_GRADES_6_7_LEVELS_7_8];

/** Every template's skill tag. A template id tagged in two files is an error, not a silent override. */
export const SKILL_TAGS: Readonly<Record<string, SkillTag>> = Object.fromEntries(
  PARTS.flatMap((part) => Object.entries(part)).map(([id, tag], i, all) => {
    if (all.findIndex(([other]) => other === id) !== i) throw new Error(`Template ${id} is tagged twice in bank/skill-tags`);
    return [id, tag];
  }),
);
