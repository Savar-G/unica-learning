import { existsSync, lstatSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import {
  validateReferenceRecord,
  writeSafeOutputFile,
} from "@/lib/reference-record";
import { fileSlugFromRef } from "./answers";
import {
  preparedFileNameForHash,
  resolveSafeChildPath,
  type PhotosManifest,
  type RemovedPhotoReport,
} from "./prepare";
import type {
  PhotoRunEntry,
  ReaderFamily,
  ReaderMeta,
  ReadPhotoResult,
  ReadRunReport,
} from "./read";

// The saved state of a work folder between runs: the run.json entries of each reader, the
// record files they name, and the cleanup of photos that left the photos folder.

const PREPARED_FILE_RE = /^[0-9a-f]{12}\.jpg$/;

export function readJsonIfExists<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function pathExists(filePath: string): boolean {
  try {
    lstatSync(filePath);
    return true;
  } catch {
    return false;
  }
}

// Removes a plain file name inside dir. A name that is not a plain child name is ignored.
export function unlinkChild(dir: string, name: string | undefined): void {
  if (!name) return;
  const path = resolveSafeChildPath(dir, name);
  if (path && pathExists(path)) unlinkSync(path);
}

// Loads the run.json entries of one reader folder. A folder that holds readings of another
// model family is refused, because the two families must not mix in one reader folder.
export function loadRunEntries(slotDir: string, expectedFamily: ReaderFamily): PhotoRunEntry[] {
  const run = readJsonIfExists<Partial<ReadRunReport>>(join(slotDir, "run.json"));
  const entries = Array.isArray(run?.photos)
    ? run.photos.filter(
        (e): e is PhotoRunEntry =>
          typeof e === "object" && e !== null && typeof e.photo_sha256 === "string",
      )
    : [];
  const meta = readJsonIfExists<Partial<ReaderMeta>>(join(slotDir, "reader.json"));
  if (meta?.family && meta.family !== expectedFamily && entries.length > 0) {
    throw new Error(
      `${slotDir} holds readings from "${meta.family}", not "${expectedFamily}". Use the same reader or a new --out folder.`,
    );
  }
  return entries;
}

// True when the entry is "ok" and its record file holds a valid record with the same source_ref.
export function isValidReading(slotDir: string, entry: PhotoRunEntry | undefined): boolean {
  if (
    !entry ||
    entry.status !== "ok" ||
    typeof entry.record_file !== "string" ||
    typeof entry.source_ref !== "string"
  ) {
    return false;
  }
  const recordPath = resolveSafeChildPath(slotDir, entry.record_file);
  if (!recordPath) return false;
  const check = validateReferenceRecord(readJsonIfExists<unknown>(recordPath));
  return check.ok && check.record.source_ref === entry.source_ref;
}

// Replaces entries by photo digest and keeps every entry of another digest in its place.
export function mergeRunEntries(
  existing: readonly PhotoRunEntry[],
  updated: readonly PhotoRunEntry[],
): PhotoRunEntry[] {
  const updates = new Map(updated.map((e) => [e.photo_sha256, e]));
  const placed = new Set<string | undefined>();
  const merged = existing.flatMap((entry) => {
    const next = updates.get(entry.photo_sha256);
    if (!next) return [entry];
    if (placed.has(entry.photo_sha256)) return [];
    placed.add(entry.photo_sha256);
    return [next];
  });
  for (const entry of updated) {
    if (placed.has(entry.photo_sha256)) continue;
    placed.add(entry.photo_sha256);
    merged.push(entry);
  }
  return merged;
}

// Every page id that the manifest or a reader gives for one photo digest.
export function refsForDigest(
  sha256: string,
  manifest: PhotosManifest,
  entriesA: readonly PhotoRunEntry[],
  entriesB: readonly PhotoRunEntry[],
): string[] {
  const refs = new Set<string>();
  const manifestRef = manifest.photos.find((p) => p.sha256 === sha256)?.source_ref;
  if (manifestRef) refs.add(manifestRef);
  for (const entry of [...entriesA, ...entriesB]) {
    if (entry.photo_sha256 === sha256 && entry.source_ref) refs.add(entry.source_ref);
  }
  return [...refs];
}

export interface PruneRemovedPhotosOptions {
  presentDigests: ReadonlySet<string>;
  manifest: PhotosManifest;
  entriesA: readonly PhotoRunEntry[];
  entriesB: readonly PhotoRunEntry[];
  // Every page that a person checked, also one whose check does not count now.
  humanCheckedRefs: ReadonlySet<string>;
  workDir: string;
  preparedPhotosDir: string;
  slotDirA: string;
  slotDirB: string;
  repoRoot: string;
}

export interface PruneRemovedPhotosResult {
  manifest: PhotosManifest;
  entriesA: PhotoRunEntry[];
  entriesB: PhotoRunEntry[];
  removedPhotos: RemovedPhotoReport[];
}

function removeFinalPages(workDir: string, refs: Iterable<string>, repoRoot: string): void {
  const finalDir = join(workDir, "final");
  const statusPath = join(finalDir, "status.json");
  const status = readJsonIfExists<Record<string, unknown>>(statusPath);
  let statusChanged = false;
  for (const ref of refs) {
    const slug = fileSlugFromRef(ref);
    unlinkChild(finalDir, `${slug}.json`);
    unlinkChild(join(workDir, "final-view"), `${slug}.md`);
    if (status && Object.prototype.hasOwnProperty.call(status, ref)) {
      delete status[ref];
      statusChanged = true;
    }
  }
  if (status && statusChanged) {
    writeSafeOutputFile(statusPath, `${JSON.stringify(status, null, 2)}\n`, repoRoot);
  }
}

// The photos folder is the truth: a digest that has readings or a manifest entry but is no longer
// in the photos folder is a removed photo. Its prepared file, manifest entry, readings, and final
// record and view are deleted. A photo of a page that a person checked is kept with its readings.
export function pruneRemovedPhotos(opts: PruneRemovedPhotosOptions): PruneRemovedPhotosResult {
  const { presentDigests, manifest, entriesA, entriesB, humanCheckedRefs } = opts;
  const removedDigests: string[] = [];
  const seen = new Set<string>();
  for (const sha of [
    ...manifest.photos.map((p) => p.sha256),
    ...[...entriesA, ...entriesB].map((e) => e.photo_sha256 ?? ""),
  ]) {
    if (!sha || presentDigests.has(sha) || seen.has(sha)) continue;
    seen.add(sha);
    removedDigests.push(sha);
  }

  const removedPhotos: RemovedPhotoReport[] = [];
  const dropped = new Set<string>();
  const droppedRefs = new Set<string>();
  for (const sha of removedDigests) {
    const refs = refsForDigest(sha, manifest, entriesA, entriesB);
    const manifestEntry = manifest.photos.find((p) => p.sha256 === sha);
    const anyEntry = [...entriesA, ...entriesB].find((e) => e.photo_sha256 === sha);
    const photo = manifestEntry?.file ?? anyEntry?.photo ?? preparedFileNameForHash(sha);
    const keep = refs.some((ref) => humanCheckedRefs.has(ref));
    removedPhotos.push({
      original_name: manifestEntry?.original_name ?? anyEntry?.original_name ?? photo,
      photo,
      photo_sha256: sha,
      ...(refs.length > 0 ? { source_ref: refs[0] } : {}),
      kept_human_checked: keep,
    });
    if (keep) continue;
    dropped.add(sha);
    for (const ref of refs) droppedRefs.add(ref);
    unlinkChild(opts.preparedPhotosDir, photo);
  }

  const keepEntries = (slotDir: string, entries: readonly PhotoRunEntry[]): PhotoRunEntry[] =>
    entries.filter((entry) => {
      if (!entry.photo_sha256 || !dropped.has(entry.photo_sha256)) return true;
      unlinkChild(slotDir, entry.record_file);
      unlinkChild(slotDir, entry.invalid_file);
      return false;
    });
  const nextA = keepEntries(opts.slotDirA, entriesA);
  const nextB = keepEntries(opts.slotDirB, entriesB);
  const nextManifest: PhotosManifest = {
    version: 1,
    photos: manifest.photos.filter((p) => !dropped.has(p.sha256)),
  };

  // A page id that a remaining photo still claims keeps its final record; the compare step rewrites it.
  const stillClaimed = new Set<string>();
  for (const entry of [...nextA, ...nextB]) if (entry.source_ref) stillClaimed.add(entry.source_ref);
  for (const p of nextManifest.photos) if (p.source_ref) stillClaimed.add(p.source_ref);
  removeFinalPages(
    opts.workDir,
    [...droppedRefs].filter((ref) => !stillClaimed.has(ref) && !humanCheckedRefs.has(ref)),
    opts.repoRoot,
  );

  // Prepared files that no photo of the folder and no kept manifest entry names are left over.
  const keptFiles = new Set(nextManifest.photos.map((p) => p.file));
  for (const sha of presentDigests) keptFiles.add(preparedFileNameForHash(sha));
  if (existsSync(opts.preparedPhotosDir)) {
    for (const name of readdirSync(opts.preparedPhotosDir)) {
      if (PREPARED_FILE_RE.test(name) && !keptFiles.has(name)) unlinkChild(opts.preparedPhotosDir, name);
    }
  }

  return { manifest: nextManifest, entriesA: nextA, entriesB: nextB, removedPhotos };
}

// Two photos can claim the same page id in one reader. Each keeps its own record file: the first
// gets "<slug>.json" and a later one "<slug>-<first 12 hex of its digest>.json".
function chooseRecordFileName(
  slotDir: string,
  sourceRef: string,
  sha256: string,
  existingEntries: readonly PhotoRunEntry[],
): string {
  const slug = fileSlugFromRef(sourceRef);
  const base = `${slug}.json`;
  const taken = existingEntries.some((e) => e.photo_sha256 !== sha256 && e.record_file === base);
  if (!taken && !pathExists(join(slotDir, base))) return base;
  return `${slug}-${sha256.slice(0, 12)}.json`;
}

export function persistSlotResult(opts: {
  slotDir: string;
  preparedFile: string;
  originalName: string;
  sha256: string;
  result: ReadPhotoResult;
  existingEntries: readonly PhotoRunEntry[];
  repoRoot: string;
}): PhotoRunEntry {
  const { slotDir, preparedFile, originalName, sha256, result, repoRoot } = opts;
  const base = { photo: preparedFile, original_name: originalName, photo_sha256: sha256 };

  if (result.status === "cli_error") {
    return { ...base, status: "cli_error", reason: result.reason, notes: [] };
  }

  if (result.status === "invalid") {
    const invalidFile = `${sha256.slice(0, 12)}.invalid.json`;
    writeSafeOutputFile(
      join(slotDir, invalidFile),
      `${JSON.stringify({ photo: preparedFile, original_name: originalName, errors: result.errors, raw: result.raw }, null, 2)}\n`,
      repoRoot,
    );
    return { ...base, status: "invalid", invalid_file: invalidFile, errors: result.errors, notes: [] };
  }

  const sourceRef = result.record.source_ref;
  const recordFile = chooseRecordFileName(slotDir, sourceRef, sha256, opts.existingEntries);
  writeSafeOutputFile(join(slotDir, recordFile), `${JSON.stringify(result.record, null, 2)}\n`, repoRoot);
  return {
    ...base,
    status: "ok",
    source_ref: sourceRef,
    record_file: recordFile,
    notes: result.notes,
    ...(result.noteDetails !== undefined ? { note_details: result.noteDetails } : {}),
  };
}
