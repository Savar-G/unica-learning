import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isPlainObject,
  parseStrictUtf8Json,
  readRegularFileIfExists,
  writeSafeOutputFile,
} from "@/lib/reference-record";
import { fileExists, finalFileKey, finalFileName, isDamagedFinalRecord, loadCheckedPages } from "./checked-pages";
import { pairDigest, pairSourceRef, type PairedPage } from "./compare-pairing";
import { PHOTOS_MANIFEST_FILE, type PhotosManifest } from "./prepare";

export { loadExistingFinalRecord } from "./checked-pages";

function readStoredSourceRef(filePath: string): string | null {
  const bytes = readRegularFileIfExists(filePath);
  if (bytes === null) return null;
  try {
    const parsed = parseStrictUtf8Json(bytes);
    return isPlainObject(parsed) && typeof parsed.source_ref === "string" ? parsed.source_ref : null;
  } catch {
    return null;
  }
}

export function sha256OfFile(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

const FINAL_META_FILES: ReadonlySet<string> = new Set(["status.json", "report.json"]);

// A damaged final record stays when its page is checked, or is in this run as an edited page. Else
// compare would write over it or remove it as a file of no page, so it stops.
function assertNoLostRecords(pairs: readonly PairedPage[], finalDir: string): void {
  const { refs, reported } = loadCheckedPages(finalDir);
  const inRun = pairs.map(pairSourceRef).filter((ref) => ref !== null);
  const keptFiles = new Set([...refs, ...inRun.filter((ref) => typeof reported.get(ref)?.record === "string")].map(finalFileKey));
  for (const name of readdirSync(finalDir)) {
    if (!name.endsWith(".json") || FINAL_META_FILES.has(name) || keptFiles.has(name.toLowerCase())) continue;
    const filePath = join(finalDir, name);
    if (isDamagedFinalRecord(filePath)) {
      throw new Error(
        `Damaged final record ${filePath}: correct the file, or remove it when its page can be written again. Nothing was written`,
      );
    }
  }
}

export function assertNoFileCollisions(
  pairs: readonly PairedPage[],
  existingRefs: ReadonlySet<string>,
  finalDir: string,
): void {
  assertNoLostRecords(pairs, finalDir);
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
