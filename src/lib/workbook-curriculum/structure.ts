// The structure of a curriculum: its levels in order, each level's units in order, each unit's skills in order and each
// skill's steps. Identity and order only: no templates, practice, number ranges or question wording. New-book planning compares the
// structure Book 1 was planned on (from the history archive, ./history) with today's, so a change to templates alone
// does not stop the next book, and a change to a level, unit, skill or step does. Pure TypeScript.
import type { CurriculumData, CurriculumKey } from "./types";

export const CURRICULUM_STRUCTURE_FORMAT = "curriculum-structure/1";

/** A step is its number, position code and name (the name is its identity: house-templates.ts checks it the same way). */
export interface StructureStep { number: number; position: string; name: string }
export interface StructureSkill { id: string; order: number; position: string; level: string; steps: StructureStep[] }
export interface StructureUnit { code: string; skills: StructureSkill[] }
export interface StructureLevel { id: string; number: number; units: StructureUnit[] }
export interface CurriculumStructure { format: typeof CURRICULUM_STRUCTURE_FORMAT; key: CurriculumKey; levels: StructureLevel[] }

/** One archive file: the structure of the curriculum whose curriculumVersion was `digest`, and where it came from. */
export interface CurriculumStructureRecord {
  format: typeof CURRICULUM_STRUCTURE_FORMAT;
  key: CurriculumKey;
  digest: string;
  /** The commit whose curriculum data gave `digest`, and the Git blob of its bc.ts. */
  source: { commit: string; path: string; blob: string };
  levels: StructureLevel[];
}

/**
 * The structure of curriculum data. Levels by number; a level's units in its `units` order (each unit's skills are its
 * skills in level order); a skill's steps by number. A skill whose unit is not in its level's list, or a step whose
 * skill is unknown, still shows: it is put where the difference check sees it, never dropped.
 */
export function curriculumStructureOf(data: CurriculumData): CurriculumStructure {
  const byNumber = (a: { number: number }, b: { number: number }) => a.number - b.number;
  const stepsOf = new Map<string, StructureStep[]>();
  for (const s of data.steps) {
    const list = stepsOf.get(s.skill) ?? [];
    list.push({ number: s.number, position: s.position, name: s.name });
    stepsOf.set(s.skill, list);
  }
  const skillOf = (s: CurriculumData["skills"][number]): StructureSkill =>
    ({ id: s.id, order: s.order, position: s.position, level: s.level, steps: [...(stepsOf.get(s.id) ?? [])].sort(byNumber) });
  const levels = [...data.levels].sort(byNumber).map((level): StructureLevel => {
    const skills = data.skills.filter(s => s.level === level.id).sort((a, b) => a.order - b.order);
    const codes = [...level.units, ...new Set(skills.map(s => s.unit).filter(u => !level.units.includes(u)))];
    return { id: level.id, number: level.number,
      units: codes.map(code => ({ code, skills: skills.filter(s => s.unit === code).map(skillOf) })) };
  });
  const placed = new Set(levels.flatMap(l => l.units.flatMap(u => u.skills.map(s => s.id))));
  const lost = data.skills.filter(s => !placed.has(s.id));
  if (lost.length) levels.push({ id: "", number: 0, units: [{ code: "", skills: lost.map(skillOf) }] });
  const known = new Set(data.skills.map(s => s.id));
  const orphans = data.steps.filter(s => !known.has(s.skill));
  if (orphans.length) levels.push({ id: "", number: 0, units: [{ code: "", skills: [...new Set(orphans.map(s => s.skill))]
    .map(id => ({ id, order: 0, position: "", level: "", steps: [...stepsOf.get(id)!].sort(byNumber) })) }] });
  return { format: CURRICULUM_STRUCTURE_FORMAT, key: data.key, levels };
}

const at = (v: unknown, keys: string[]): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 1;

/** The record in an archive file, checked field by field, or null when it is malformed or not about `key` and `digest`. */
export function readCurriculumStructureRecord(v: unknown, key: string, digest: string): CurriculumStructureRecord | null {
  if (!at(v, ["format", "key", "digest", "source", "levels"]) || v.format !== CURRICULUM_STRUCTURE_FORMAT || v.key !== key || v.digest !== digest
    || !/^[0-9a-f]{28}$/.test(digest)) return null;
  const s = v.source;
  if (!at(s, ["commit", "path", "blob"]) || !/^[0-9a-f]{40}$/.test(String(s.commit)) || !text(s.path) || !/^[0-9a-f]{40}$/.test(String(s.blob))) return null;
  if (!Array.isArray(v.levels) || !v.levels.length) return null;
  const levelIds = new Set<string>(), units = new Set<string>(), skills = new Set<string>();
  let previous = 0;
  for (const level of v.levels) {
    if (!at(level, ["id", "number", "units"]) || !text(level.id) || !count(level.number) || level.number <= previous || levelIds.has(level.id)
      || !Array.isArray(level.units)) return null;
    previous = level.number; levelIds.add(level.id);
    for (const unit of level.units) {
      if (!at(unit, ["code", "skills"]) || !text(unit.code) || units.has(unit.code) || !Array.isArray(unit.skills)) return null;
      units.add(unit.code);
      let order = 0;
      for (const skill of unit.skills) {
        if (!at(skill, ["id", "order", "position", "level", "steps"]) || !text(skill.id) || skills.has(skill.id) || !count(skill.order)
          || skill.order <= order || !text(skill.position) || skill.level !== level.id || !Array.isArray(skill.steps)) return null;
        skills.add(skill.id); order = skill.order;
        let step = 0;
        for (const x of skill.steps) {
          if (!at(x, ["number", "position", "name"]) || !count(x.number) || x.number <= step || !text(x.position) || !text(x.name)) return null;
          step = x.number;
        }
      }
    }
  }
  return v as unknown as CurriculumStructureRecord;
}

/** The structure an archive record holds. */
export const structureOfRecord = (r: CurriculumStructureRecord): CurriculumStructure =>
  ({ format: CURRICULUM_STRUCTURE_FORMAT, key: r.key, levels: r.levels });

/**
 * The first difference between two structures, in plain words, or null when they are equal: the level list, then level
 * by level its units in order, each unit's skills in order (id, order, position, level), and each skill's steps.
 */
export function structureDifference(frozen: CurriculumStructure, now: CurriculumStructure): string | null {
  if (frozen.key !== now.key) return `the curriculum is ${now.key}, not ${frozen.key}`;
  const list = (xs: readonly { id?: string; code?: string; number?: number }[]) => xs.map(x => x.id ?? x.code ?? String(x.number)).join(", ");
  if (list(frozen.levels) !== list(now.levels)) return `the levels changed from [${list(frozen.levels)}] to [${list(now.levels)}]`;
  for (const [i, a] of frozen.levels.entries()) {
    const b = now.levels[i];
    if (a.number !== b.number) return `level ${a.id} is number ${b.number}, not ${a.number}`;
    if (list(a.units) !== list(b.units)) return `level ${a.id} has units [${list(b.units)}], not [${list(a.units)}]`;
    for (const [j, u] of a.units.entries()) {
      const v = b.units[j];
      const ids = (s: StructureUnit) => s.skills.map(k => k.id).join(", ");
      if (ids(u) !== ids(v)) return `unit ${u.code} has skills [${ids(v)}], not [${ids(u)}]`;
      for (const [k, s] of u.skills.entries()) {
        const t = v.skills[k];
        for (const field of ["order", "position", "level"] as const) {
          if (s[field] !== t[field]) return `skill ${s.id} has ${field} ${t[field]}, not ${s[field]}`;
        }
        const steps = (x: StructureSkill) => x.steps.map(n => `${n.number} ${n.position} "${n.name}"`).join(", ");
        if (steps(s) !== steps(t)) return `skill ${s.id} has steps [${steps(t)}], not [${steps(s)}]`;
      }
    }
  }
  return null;
}
