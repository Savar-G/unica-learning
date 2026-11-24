// Committed version fingerprints for workbook v2 shapes. Each shape version maps to one SHA-256 over its fixed limits,
// fixed seeds, and full outputs (item, answer, steps, difficulty, face, worstCase, count, difficultyRange).
import { canonicalJson, sha256 } from "../hash";
import type { Shape, ShapeLibrary } from "../shapes";
import { isRecord } from "../shapes/shape";

export type ShapeFingerprints = Record<string, Record<string, string>>;

export interface FingerprintSpec<L = unknown> {
  id: string;
  fingerprintLimits: readonly L[];
  fingerprintSeeds: readonly string[];
}

const VERSION_KEY = /^[1-9]\d*$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

export function isValidShapeVersion(version: unknown): version is number {
  return typeof version === "number" && Number.isSafeInteger(version) && version >= 1;
}

/**
 * Computes the SHA-256 of a shape's outputs over its fixed limits and seeds. The fixed limits and seeds are inside the
 * hashed payload so changing them without bumping shape.version changes the fingerprint and fails the test.
 */
export function computeShapeFingerprint<L, Q>(
  shape: Shape<L, Q>,
  spec: Pick<FingerprintSpec<L>, "fingerprintLimits" | "fingerprintSeeds">,
): string {
  const payload = {
    id: shape.id,
    answerKind: shape.answerKind,
    limits: spec.fingerprintLimits,
    seeds: spec.fingerprintSeeds,
    cases: spec.fingerprintLimits.map((limits) => {
      const worstCase = shape.worstCase(limits);
      return {
        limits,
        count: shape.count(limits),
        difficultyRange: shape.difficultyRange(limits),
        worstCase: {
          item: worstCase,
          answer: shape.answer(worstCase.question),
          steps: shape.steps(worstCase.question),
          difficulty: shape.difficulty(worstCase.question),
          face: shape.face(worstCase.question),
        },
        items: spec.fingerprintSeeds.map((seed) => {
          const item = shape.generate(limits, seed);
          return {
            seed,
            item,
            answer: shape.answer(item.question),
            steps: shape.steps(item.question),
            difficulty: shape.difficulty(item.question),
            face: shape.face(item.question),
          };
        }),
      };
    }),
  };
  return sha256(canonicalJson(payload));
}

function validateStoredEntries(
  shapeId: string,
  version: number,
  rawEntries: unknown,
  requireCurrent: boolean,
): { ok: true; entries: Record<string, string> } | { ok: false; problem: string } {
  let source: Record<string, unknown>;
  if (rawEntries === undefined) {
    if (requireCurrent) return { ok: false, problem: `shape "${shapeId}" has no fingerprints` };
    source = {};
  } else if (isRecord(rawEntries)) {
    source = rawEntries;
  } else {
    return { ok: false, problem: `shape "${shapeId}" fingerprints must be an object` };
  }
  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!VERSION_KEY.test(key)) {
      return { ok: false, problem: `invalid fingerprint version key "${key}"` };
    }
    if (typeof value !== "string" || !SHA256_HEX.test(value)) {
      return { ok: false, problem: `version ${key} does not hold a valid SHA-256 hex digest` };
    }
    const storedVersion = Number(key);
    if (storedVersion > version) {
      return { ok: false, problem: `stored version ${storedVersion} is not lower than current version ${version}` };
    }
    entries[key] = value;
  }
  for (let older = 1; older < version; older++) {
    if (!Object.hasOwn(entries, String(older))) {
      return { ok: false, problem: `older version ${older} was removed (versions 1 to ${version - 1} must be kept)` };
    }
  }
  if (requireCurrent && !Object.hasOwn(entries, String(version))) {
    return { ok: false, problem: `version ${version} has no fingerprint (run npm run workbook:v2:fingerprints)` };
  }
  return { ok: true, entries };
}

/** Verifies one shape's version and committed fingerprint. Returns null when valid, or a plain problem description. */
export function checkShapeFingerprint<L, Q>(
  shape: Shape<L, Q>,
  spec: Pick<FingerprintSpec<L>, "fingerprintLimits" | "fingerprintSeeds">,
  fingerprints: unknown,
): string | null {
  if (!isValidShapeVersion(shape.version)) {
    return `version must be a whole number of 1 or more, got ${String(shape.version)}`;
  }
  if (spec.fingerprintLimits.length === 0) return "fingerprintLimits must not be empty";
  if (spec.fingerprintSeeds.length === 0) return "fingerprintSeeds must not be empty";
  if (!isRecord(fingerprints)) return "fingerprint store must be a JSON object";
  const checked = validateStoredEntries(shape.id, shape.version, fingerprints[shape.id], true);
  if (!checked.ok) return checked.problem;
  const expected = checked.entries[String(shape.version)];
  const actual = computeShapeFingerprint(shape, spec);
  if (actual !== expected) {
    return `output changed for version ${shape.version} without bumping version (expected ${expected}, got ${actual})`;
  }
  return null;
}

export type AddFingerprintsResult =
  | { ok: true; fingerprints: ShapeFingerprints; added: string[] }
  | { ok: false; problems: string[] };

/**
 * Adds fingerprints for any new shape versions without altering or deleting any existing fingerprint.
 * Refuses if an existing version's output changed, if an older version is missing, or if the registry is out of sync.
 */
export function addShapeFingerprints(
  shapes: ShapeLibrary,
  specs: readonly FingerprintSpec[],
  existing: unknown,
): AddFingerprintsResult {
  const problems: string[] = [];
  if (!isRecord(existing)) return { ok: false, problems: ["fingerprint file must contain a JSON object"] };

  const specById = new Map<string, FingerprintSpec>();
  for (const spec of specs) {
    if (specById.has(spec.id)) problems.push(`[${spec.id}] registry: shape "${spec.id}" is registered more than once`);
    else specById.set(spec.id, spec);
  }
  for (const id of shapes.keys()) {
    if (!specById.has(id)) problems.push(`[${id}] registry: shape "${id}" is in SHAPES with no harness registration`);
  }
  for (const id of specById.keys()) {
    if (!shapes.has(id)) problems.push(`[${id}] registry: harness registration "${id}" has no shape in SHAPES`);
  }
  if (problems.length > 0) return { ok: false, problems };

  const next: ShapeFingerprints = {};
  for (const [shapeId, rawEntries] of Object.entries(existing)) {
    if (!isRecord(rawEntries)) {
      problems.push(`[${shapeId}] fingerprint: entry must be an object of version hashes`);
      continue;
    }
    const copy: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawEntries)) {
      if (!VERSION_KEY.test(key) || typeof value !== "string" || !SHA256_HEX.test(value)) {
        problems.push(`[${shapeId}] fingerprint: invalid entry "${key}"`);
        continue;
      }
      copy[key] = value;
    }
    next[shapeId] = copy;
  }

  const added: string[] = [];
  for (const [id, shape] of shapes) {
    const spec = specById.get(id)!;
    if (!isValidShapeVersion(shape.version)) {
      problems.push(`[${id}] fingerprint: version must be a whole number of 1 or more, got ${String(shape.version)}`);
      continue;
    }
    if (spec.fingerprintLimits.length === 0 || spec.fingerprintSeeds.length === 0) {
      problems.push(`[${id}] fingerprint: fingerprintLimits and fingerprintSeeds must not be empty`);
      continue;
    }
    const checked = validateStoredEntries(id, shape.version, next[id], false);
    if (!checked.ok) {
      problems.push(`[${id}] fingerprint: ${checked.problem}`);
      continue;
    }
    const hash = computeShapeFingerprint(shape, spec);
    const key = String(shape.version);
    const current = checked.entries[key];
    if (current !== undefined) {
      if (current !== hash) {
        problems.push(
          `[${id}] fingerprint: version ${shape.version} already has a fingerprint and cannot be changed. Bump shape.version to record new output.`,
        );
      }
      continue;
    }
    next[id] = { ...checked.entries, [key]: hash };
    added.push(`${id}@${shape.version}`);
  }

  if (problems.length > 0) return { ok: false, problems };

  const sorted: ShapeFingerprints = {};
  for (const shapeId of Object.keys(next).sort()) {
    const entries: Record<string, string> = {};
    for (const key of Object.keys(next[shapeId]).sort((a, b) => Number(a) - Number(b))) {
      entries[key] = next[shapeId][key];
    }
    sorted[shapeId] = entries;
  }
  return { ok: true, fingerprints: sorted, added };
}
