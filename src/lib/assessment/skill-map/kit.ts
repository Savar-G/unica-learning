// Types and the authoring helper of the BC skill map (#192). Data files import from here, never from ../skill-map.
import type { Level, Strand } from "../types";

/** A smaller skill inside one BC standard. `requires`: ids of the skills a child needs first (prerequisite edges). */
export interface BcSkill {
  /** "<standard code>-<slug>", for example "4.5-multiply-by-one-digit". Templates are tagged with these ids (#193). */
  id: string;
  text: string;
  requires: readonly string[];
}

/**
 * The grade where BC teaches a standard of the map, K-9 (0 is Kindergarten). The map reaches one grade past the
 * assessment's K-8 Level scale: grade 9 is for the workbooks, and no bank template or test level is ever 9.
 */
export type SkillMapGrade = Level | 9;

/** One BC Mathematics content standard, with its exact official text, divided into skills. */
export interface BcStandard {
  /** The bank's code: "K1", "4.5", "8.13", "9.2". */
  code: string;
  /** The grade where BC teaches it, K-9 (0 is Kindergarten). */
  grade: SkillMapGrade;
  /** Our internal strand (curriculum map, section 2.3). */
  strand: Strand;
  /** The standard's exact text. */
  text: string;
  skills: readonly BcSkill[];
}

export interface SkillMap {
  /** "draft" until reviewers check the skills and the prerequisites (#194). */
  status: "draft" | "reviewed";
  /** Who wrote the skills and the edges, and from what. */
  drafted: string;
  standards: readonly BcStandard[];
}

/** One skill: id, text, then the ids of its prerequisites. */
export const skill = (id: string, text: string, ...requires: string[]): BcSkill => ({ id, text, requires });
