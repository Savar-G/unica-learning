// Types and the authoring helper of the BC skill map (#192). Data files import from here, never from ../skill-map.
import type { Level, Strand } from "../types";

/** A smaller skill inside one BC standard. `requires`: ids of the skills a child needs first (prerequisite edges). */
export interface BcSkill {
  /** "<standard code>-<slug>", for example "4.5-multiply-by-one-digit". Templates are tagged with these ids (#193). */
  id: string;
  text: string;
  requires: readonly string[];
}

/** One BC Mathematics content standard, with its exact official text, divided into skills. */
export interface BcStandard {
  /** The bank's code: "K1", "4.5", "8.13". */
  code: string;
  /** The grade where BC teaches it, on the K-8 scale (0 is Kindergarten). */
  grade: Level;
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
