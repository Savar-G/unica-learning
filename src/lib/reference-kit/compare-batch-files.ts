import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  validateReferenceRecord,
  writeSafeOutputFile,
  type ReferenceRecord,
} from "@/lib/reference-record";
import { fileSlugFromRef } from "./answers";
import type { PageStatus } from "./compare";
import { pairDigest, readJsonIfExists, type PairedPage } from "./compare-pairing";
import { parsePhotosManifest, PHOTOS_MANIFEST_FILE } from "./prepare";

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

// The hash of each final record as the last compare wrote it. Another hash on disk means that a
// person changed the file. A malformed report stops the run: without its hashes, compare would
// write over a record that a person changed.
export function loadPreviousHashes(reportPath: string): Map<string, string> {
  const hashes = new Map<string, string>();
  try {
    const pages: unknown = readJsonIfExists<{ pages?: unknown }>(reportPath)?.pages ?? [];
    if (!Array.isArray(pages)) throw new Error("pages is not a list");
    pages.forEach((page: unknown, i) => {
      const row = (page ?? {}) as { source_ref?: unknown; final_record_sha256?: unknown };
      const hash = row.final_record_sha256 ?? null;
      if (typeof row.source_ref !== "string") throw new Error(`pages[${i}] has no source_ref`);
      if (hash === null) return;
      if (typeof hash !== "string") throw new Error(`pages[${i}] has a hash that is not text`);
      if ((hashes.get(row.source_ref) ?? hash) !== hash) {
        throw new Error(`pages[${i}] gives a second hash for ${row.source_ref}`);
      }
      hashes.set(row.source_ref, hash);
    });
  } catch (err) {
    throw new Error(
      `Malformed previous report ${reportPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return hashes;
}

export function assertNoFileCollisions(
  pairs: readonly PairedPage[],
  existingStatus: Record<string, PageStatus>,
  finalDir: string,
): void {
  const fileToRef = new Map<string, string>();

  for (const pair of pairs) {
    const chosen = pair.recA ?? pair.recB;
    if (!chosen) continue;
    const sourceRef = chosen.source_ref;

    const fileName = `${fileSlugFromRef(sourceRef)}.json`;
    const prior = fileToRef.get(fileName);
    if (prior && prior !== sourceRef) {
      throw new Error(
        `Refusing to write: "${sourceRef}" and "${prior}" both map to "${fileName}"`,
      );
    }
    fileToRef.set(fileName, sourceRef);

    const storedRef = readStoredSourceRef(join(finalDir, fileName));
    if (storedRef !== null && storedRef !== sourceRef) {
      throw new Error(
        `Refusing to overwrite "${fileName}": existing file holds source_ref "${storedRef}", not "${sourceRef}"`,
      );
    }
  }

  for (const existingRef of Object.keys(existingStatus)) {
    const fileName = `${fileSlugFromRef(existingRef)}.json`;
    const prior = fileToRef.get(fileName);
    if (prior && prior !== existingRef) {
      throw new Error(
        `Refusing to write: "${prior}" collides with existing "${existingRef}" on "${fileName}"`,
      );
    }
    fileToRef.set(fileName, existingRef);
  }
}

// The manifest gives a page id only to the photo whose readings made the final record, so it holds
// at most one entry for each page id. A kept human_checked page with no current readings keeps the
// page id it already has.
export function syncManifestSourceRefs(
  workDir: string,
  winners: readonly PairedPage[],
  keptStaleRefs: ReadonlySet<string>,
  repoRoot: string,
): void {
  const manifestPath = join(workDir, "photos", PHOTOS_MANIFEST_FILE);
  if (!existsSync(manifestPath)) return;
  let manifest;
  try {
    manifest = parsePhotosManifest(JSON.parse(readFileSync(manifestPath, "utf8")) as unknown);
  } catch {
    return;
  }
  const refByDigest = new Map<string, string>();
  for (const pair of winners) {
    const digest = pairDigest(pair);
    const ref = (pair.recA ?? pair.recB)?.source_ref;
    if (digest && ref && !refByDigest.has(digest)) refByDigest.set(digest, ref);
  }
  const assigned = new Set<string>();
  const photos = manifest.photos.map((entry) => {
    const { source_ref: oldRef, ...rest } = entry;
    const winnerRef = refByDigest.get(entry.sha256);
    const ref = winnerRef ?? (oldRef && keptStaleRefs.has(oldRef) ? oldRef : undefined);
    if (!ref || assigned.has(ref)) return rest;
    assigned.add(ref);
    return { ...rest, source_ref: ref };
  });
  const next = `${JSON.stringify({ version: 1, photos }, null, 2)}\n`;
  if (next !== `${JSON.stringify(manifest, null, 2)}\n`) {
    writeSafeOutputFile(manifestPath, next, repoRoot);
  }
}
