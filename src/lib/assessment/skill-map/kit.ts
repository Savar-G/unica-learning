// Types and the authoring helper of the BC skill map (#192). Data files import from here, never from ../skill-map.
import type { Level, Strand } from "../types";

/** A smaller skill inside one BC standard. `requires`: ids of the skills a child needs first (prerequisite edges). */
export interface BcSkill {
  /** "<standard code>-<slug>", for example "4.5-multiply-by-one-digit". Templates are tagged with these ids (#193). */
  id: string;
  text: string;
  requires: readonly string[];
}

/** The grade of a standard or placement objective. 0 is Kindergarten. */
export type SkillMapGrade = Level;

/** One BC Mathematics content standard or local placement objective, divided into skills. */
export interface BcStandard {
  /** The bank's code: "K1", "4.5", "8.13", "9.2". */
  code: string;
  /** The grade associated with the standard or objective (0 is Kindergarten). */
  grade: SkillMapGrade;
  /** Our internal strand (curriculum map, section 2.3). */
  strand: Strand;
  /** The standard or objective text. */
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
