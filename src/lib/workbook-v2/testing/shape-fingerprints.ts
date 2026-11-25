// The committed fingerprint of each shape version: one SHA-256 of all that the shape gives for the registered limits.
// Each shape lives in its own JSON file under testing/fingerprints/ so parallel shape branches merge without conflict.
// scripts/shape-fingerprint-base.mjs compares the folder with the base of the branch.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, seedFrom, sha256 } from "../hash";
import type { Item, Shape, ShapeLibrary } from "../shapes";
import { isRecord } from "../shapes/shape";
import { registryProblems, type LargeSpace, type Rows, type ShapeRegistration } from "./shape-registration";

export type ShapeFingerprints = Record<string, Record<string, string>>;

export const FINGERPRINTS_DIR = "src/lib/workbook-v2/testing/fingerprints";
/** The id itself, so that two ids never share a file. */
export const fingerprintFileName = (id: string): string => `${id}.json`;

/** A space that can be listed is covered by its list, so a few seeds prove which question a seed picks. */
const SEEDS_OF_A_LISTED_SPACE = 100;
const SEEDS_OF_A_LARGE_SPACE = 1000;

/** The seeds have the form that the build makes. */
const seeds = (count: number): string[] => Array.from({ length: count }, (_, i) => seedFrom("fingerprint", i));

export function shapeFingerprint(shape: Shape, registration: ShapeRegistration): string {
  const { space, smallSpaces } = registration;
  const listed = Array.isArray(space);
  const questions = new Map<string, unknown>();
  const add = ({ question, answer }: Item<unknown>): string => {
    const key = canonicalJson(question);
    if (!questions.has(key)) questions.set(key, { question, answer: shape.answer(question), steps: shape.steps(question), difficulty: shape.difficulty(question), face: shape.face(question) });
    return `${key} ${canonicalJson(answer)}`;
  };
  const lines: string[] = [];
  const all = [...registration.cases, ...smallSpaces].map((c) => c.limits);
  const perCase = Math.ceil((listed ? SEEDS_OF_A_LISTED_SPACE : SEEDS_OF_A_LARGE_SPACE) / all.length);
  for (const limits of all) {
    lines.push(canonicalJson([limits, shape.count(limits), shape.difficultyRange(limits)]), add(shape.worstCase(limits)));
    for (const seed of seeds(perCase)) lines.push(add(shape.generate(limits, seed)));
  }
  // A large space covers its small spaces and every `listed` question in full; the rest of the large space has sampled coverage via the seeds above.
  const rows: readonly Rows[] = listed
    ? (space as readonly Rows[])
    : [...smallSpaces.flatMap((s) => s.questions), ...((space as LargeSpace).listed ?? [])];
  for (const row of rows) {
    const read = shape.solveAgain(row);
    lines.push(read ? add(read) : `no question: ${row.join(" ")}`);
  }
  return sha256([shape.id, shape.answerKind, ...lines, ...[...questions.values()].map((q) => canonicalJson(q))].join("\n"));
}

const VERSION_KEY = /^[1-9]\d*$/;
const HASH = /^[0-9a-f]{64}$/;

/** The stored fingerprints of one shape, or what is wrong with them. A shape keeps the fingerprint of each version. */
function entriesOf(id: string, version: number, store: unknown): Record<string, string> | string {
  if (!isRecord(store)) return "the fingerprint file must hold an object";
  const raw = Object.hasOwn(store, id) ? store[id] : {};
  if (!isRecord(raw)) return "the fingerprints of a shape must be an object";
  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!VERSION_KEY.test(key) || typeof value !== "string" || !HASH.test(value)) return `the stored entry "${key}" is not a version with a SHA-256`;
    if (Number(key) > version) return `the stored version ${key} is higher than the version ${version} of the shape`;
    entries[key] = value;
  }
  for (let older = 1; older < version; older++) if (!Object.hasOwn(entries, String(older))) return `the fingerprint of version ${older} is gone`;
  return entries;
}

const isVersion = (version: unknown): boolean => Number.isSafeInteger(version) && (version as number) >= 1;

/** What is wrong with the version and the stored fingerprint of a shape, or null. */
export function fingerprintProblem(shape: Shape, registration: ShapeRegistration, store: unknown): string | null {
  if (!isVersion(shape.version)) return `the version must be a whole number of 1 or more, not ${shape.version}`;
  const entries = entriesOf(shape.id, shape.version, store);
  if (typeof entries === "string") return entries;
  const stored = entries[shape.version];
  if (stored === undefined) return `version ${shape.version} has no fingerprint (run npm run workbook:v2:fingerprints)`;
  const now = shapeFingerprint(shape, registration);
  return now === stored ? null : `the output changed and the version is still ${shape.version} (stored ${stored}, now ${now})`;
}

export type AddFingerprintsResult = { ok: true; fingerprints: ShapeFingerprints; added: string[] } | { ok: false; problems: string[] };

/** Adds the fingerprint of each new version. A stored fingerprint never changes. */
export function addShapeFingerprints(shapes: ShapeLibrary, registrations: readonly ShapeRegistration[], store: unknown): AddFingerprintsResult {
  const problems = registryProblems(shapes, registrations);
  if (!isRecord(store)) problems.push("the fingerprint file must hold an object");
  if (problems.length > 0 || !isRecord(store)) return { ok: false, problems };
  const next = { ...store } as ShapeFingerprints;
  const added: string[] = [];
  for (const registration of registrations) {
    const shape = shapes.get(registration.id);
    if (!shape) continue;
    const problem = (text: string) => problems.push(`[${shape.id}] fingerprint: ${text}`);
    if (!isVersion(shape.version)) problem(`the version must be a whole number of 1 or more, not ${shape.version}`);
    const entries = entriesOf(shape.id, shape.version, store);
    if (typeof entries === "string") problem(entries);
    else if (entries[shape.version] === undefined) {
      next[shape.id] = { ...entries, [shape.version]: shapeFingerprint(shape, registration) };
      added.push(`${shape.id}@${shape.version}`);
    } else {
      const changed = fingerprintProblem(shape, registration, store);
      if (changed) problem(`${changed}. Give the shape a new version; a stored fingerprint never changes`);
    }
  }
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, added, fingerprints: Object.fromEntries(Object.entries(next).sort(([a], [b]) => (a < b ? -1 : 1))) };
}

/** The text of one shape's fingerprint file. */
export function fingerprintFileText(id: string, versions: Readonly<Record<string, string>>): string {
  const entries = Object.entries(versions)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([version, hash]) => `${JSON.stringify(version)}: ${JSON.stringify(hash)}`);
  return `{\n  ${JSON.stringify(id)}: { ${entries.join(", ")} }\n}\n`;
}

/** Reads every per-shape JSON file in the fingerprints folder into one map. */
export function readShapeFingerprints(dir = FINGERPRINTS_DIR): ShapeFingerprints {
  const files = readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
  const merged: ShapeFingerprints = {};
  for (const file of files) {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, file), "utf8"));
    if (!isRecord(parsed)) throw new Error(`${file} must hold an object`);
    const ids = Object.keys(parsed);
    if (ids.length !== 1) throw new Error(`${file} must hold exactly one shape`);
    const [id] = ids;
    if (fingerprintFileName(id) !== file) throw new Error(`${file} holds "${id}" and must be named "${fingerprintFileName(id)}"`);
    if (Object.hasOwn(merged, id)) throw new Error(`duplicate fingerprint entry for "${id}"`);
    merged[id] = parsed[id] as Record<string, string>;
  }
  return merged;
}
