import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  validateReferenceRecord,
  writeSafeOutputFile,
  type ReferenceRecord,
} from "@/lib/reference-record";
import { fileExists, finalFileKey, finalFileName } from "./checked-pages";
import { pairDigest, type PairedPage } from "./compare-pairing";
import { PHOTOS_MANIFEST_FILE, type PhotosManifest } from "./prepare";

export function readStoredSourceRef(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      typeof (parsed as Record<string, unknown>).source_ref === "string"
    ) {
      return (parsed as Record<string, unknown>).source_ref as string;
    }
    return null;
  } catch {
    return null;
  }
}

export function sha256OfFile(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function loadExistingFinalRecord(filePath: string): ReferenceRecord | null {
  if (!existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    const check = validateReferenceRecord(parsed);
    return check.ok ? check.record : null;
  } catch {
    return null;
  }
}

export function assertNoFileCollisions(
  pairs: readonly PairedPage[],
  existingRefs: ReadonlySet<string>,
  finalDir: string,
): void {
  const fileToRef = new Map<string, string>();

  for (const pair of pairs) {
    const chosen = pair.recA ?? pair.recB;
    if (!chosen) continue;
    const sourceRef = chosen.source_ref;

    const fileName = finalFileName(sourceRef);
    const key = finalFileKey(sourceRef);
    const prior = fileToRef.get(key);
    if (prior && prior !== sourceRef) {
      throw new Error(
        `Refusing to write: "${sourceRef}" and "${prior}" both map to "${fileName}"`,
      );
    }
    fileToRef.set(key, sourceRef);

    const storedRef = readStoredSourceRef(join(finalDir, fileName));
    if (storedRef !== null && storedRef !== sourceRef) {
      throw new Error(
        `Refusing to overwrite "${fileName}": existing file holds source_ref "${storedRef}", not "${sourceRef}"`,
      );
    }
  }

  for (const existingRef of existingRefs) {
    const fileName = finalFileName(existingRef);
    const key = finalFileKey(existingRef);
    const prior = fileToRef.get(key);
    // In other letter case, a page whose record file is gone has nothing to lose.
    if (
      prior &&
      prior !== existingRef &&
      (finalFileName(prior) === fileName || fileExists(join(finalDir, fileName)))
    ) {
      throw new Error(
        `Refusing to write: "${prior}" collides with existing "${existingRef}" on "${fileName}"`,
      );
    }
    if (!prior) fileToRef.set(key, existingRef);
  }
}

// The manifest gives a page id only to the photo whose readings made the final record, so it holds
// at most one entry for each page id. A kept page of a person with no current readings keeps the
// page id it already has.
export function planManifestSourceRefs(
  before: PhotosManifest,
  winners: readonly PairedPage[],
  keptStaleRefs: ReadonlySet<string>,
): PhotosManifest {
  const refByDigest = new Map<string, string>();
  for (const pair of winners) {
    const digest = pairDigest(pair);
    const ref = (pair.recA ?? pair.recB)?.source_ref;
    if (digest && ref && !refByDigest.has(digest)) refByDigest.set(digest, ref);
  }
  const assigned = new Set<string>();
  const photos = before.photos.map((entry) => {
    const { source_ref: oldRef, ...rest } = entry;
    const winnerRef = refByDigest.get(entry.sha256);
    const ref = winnerRef ?? (oldRef && keptStaleRefs.has(oldRef) ? oldRef : undefined);
    if (!ref || assigned.has(ref)) return rest;
    assigned.add(ref);
    return { ...rest, source_ref: ref };
  });
  return { version: 1, photos };
}

export function writePlannedManifest(
  photosDir: string,
  before: PhotosManifest,
  after: PhotosManifest,
  repoRoot: string,
): void {
  const next = `${JSON.stringify(after, null, 2)}\n`;
  if (next !== `${JSON.stringify(before, null, 2)}\n`) {
    writeSafeOutputFile(join(photosDir, PHOTOS_MANIFEST_FILE), next, repoRoot);
  }
}
