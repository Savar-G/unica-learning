import { readdir, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  buildReferencePhotoPath,
  isPlainObject,
  readPlannedPhotos,
  readRegularFileNoFollow,
  type PlannedPhoto,
} from "./import-photos";
import type { ReferenceRecord } from "./types";
import { validateReferenceRecord } from "./validate";

export { buildReferencePhotoPath };
export { MAX_REFERENCE_PHOTO_BYTES } from "./import-photos";

export const REFERENCE_RECORD_KINDS = ["page", "contents"] as const;
export type ReferenceRecordKind = (typeof REFERENCE_RECORD_KINDS)[number];

export const TRANSCRIPT_STATUSES = [
  "machine_read",
  "double_read",
  "human_checked",
] as const;
export type TranscriptStatus = (typeof TRANSCRIPT_STATUSES)[number];

export const REFERENCE_TABLE = "bank_reference_images" as const;
export const REFERENCE_BUCKET = "curriculum-reference" as const;

const RESERVED_RECORD_FILES = new Set(["status.json", "report.json"]);
const TRANSCRIPT_STATUS_SET = new Set<string>(TRANSCRIPT_STATUSES);

export interface ReferenceRow {
  source_ref: string;
  kind: ReferenceRecordKind;
  path: string | null;
  transcript: ReferenceRecord;
  transcript_status: TranscriptStatus;
  note?: string | null;
}

export interface ExistingReferenceRow {
  transcript: unknown;
  path: string | null;
  transcript_status: string;
}

export interface ReferenceStore {
  findExisting(sourceRefs: string[]): Promise<Map<string, ExistingReferenceRow>>;
  insertRow(row: ReferenceRow): Promise<boolean>;
  objectSha256(path: string): Promise<string | null>;
  uploadObject(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
}

export interface ImportOptions {
  recordsDir: string;
  photosDir?: string;
  dryRun?: boolean;
  store: ReferenceStore;
}

export interface ImportCounts {
  recordsRead: number;
  inserted: number;
  skipped: number;
  skippedDifferent: number;
  photosUploaded: number;
}

export interface ImportResult {
  ok: boolean;
  // True when a write failed part of the way through. Rows and photos written before the failure stay.
  stopped?: boolean;
  dryRun: boolean;
  counts: ImportCounts;
  skippedDifferentRefs: string[];
  // Storage paths that hold a photo no row points to. A person must remove them by hand.
  unreferencedPhotos?: string[];
  problems: string[];
}

function isTranscriptStatus(value: unknown): value is TranscriptStatus {
  return typeof value === "string" && TRANSCRIPT_STATUS_SET.has(value);
}

export function deepEqualJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqualJson(a[i], b[i])) return false;
    }
    return true;
  }

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA).filter((k) => objA[k] !== undefined);
  const keysB = Object.keys(objB).filter((k) => objB[k] !== undefined);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.hasOwn(objB, key) || objB[key] === undefined) {
      return false;
    }
    if (!deepEqualJson(objA[key], objB[key])) return false;
  }
  return true;
}

// Path of the first string (key or value) that holds U+0000, or null. A jsonb column refuses that character.
export function findNulCharacterPath(value: unknown, path = "$"): string | null {
  if (typeof value === "string") return value.includes("\u0000") ? path : null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = findNulCharacterPath(value[i], `${path}[${i}]`);
      if (found !== null) return found;
    }
    return null;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key.includes("\u0000")) return `${path}.<key>`;
      const found = findNulCharacterPath(child, `${path}.${key}`);
      if (found !== null) return found;
    }
  }
  return null;
}

function refusedResult(recordsRead: number, dryRun: boolean, problems: string[]): ImportResult {
  return {
    ok: false,
    dryRun,
    counts: {
      recordsRead,
      inserted: 0,
      skipped: 0,
      skippedDifferent: 0,
      photosUploaded: 0,
    },
    skippedDifferentRefs: [],
    problems,
  };
}

async function readRecords(
  recordsDir: string,
  problems: string[],
): Promise<{
  realRecordsDir: string | null;
  recordsRead: number;
  records: ReferenceRecord[];
  seenRefs: Map<string, string>;
}> {
  let realRecordsDir: string;
  let entries;
  try {
    realRecordsDir = await realpath(recordsDir);
    entries = await readdir(realRecordsDir, { withFileTypes: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    problems.push(`records folder "${recordsDir}" could not be read: ${msg}`);
    return { realRecordsDir: null, recordsRead: 0, records: [], seenRefs: new Map() };
  }

  const recordFiles = entries
    .filter(
      (entry) =>
        !entry.isDirectory() &&
        entry.name.endsWith(".json") &&
        !RESERVED_RECORD_FILES.has(entry.name),
    )
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const records: ReferenceRecord[] = [];
  const seenRefs = new Map<string, string>();

  for (const fileName of recordFiles) {
    const filePath = join(realRecordsDir, fileName);
    const fileRead = await readRegularFileNoFollow(filePath);
    if (!fileRead.ok) {
      const detail =
        fileRead.kind === "symlink"
          ? "refusing symlink"
          : fileRead.kind === "not_file"
            ? "not a regular file"
            : `could not be read (${fileRead.message})`;
      problems.push(`${fileName}: ${detail}`);
      continue;
    }

    let parsed: unknown;
    try {
      const raw = Buffer.from(fileRead.bytes).toString("utf8");
      parsed = JSON.parse(raw) as unknown;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      problems.push(`${fileName}: invalid JSON (${msg})`);
      continue;
    }

    const check = validateReferenceRecord(parsed);
    if (!check.ok) {
      for (const e of check.errors) {
        problems.push(`${fileName}: ${e.path}: ${e.message}`);
      }
      continue;
    }

    const nulPath = findNulCharacterPath(parsed);
    if (nulPath !== null) {
      problems.push(
        `${fileName}: ${nulPath}: text holds a null character, which the database cannot store`,
      );
      continue;
    }

    const ref = check.record.source_ref;
    const prevFile = seenRefs.get(ref);
    if (prevFile !== undefined) {
      problems.push(`duplicate source_ref "${ref}" in ${prevFile} and ${fileName}`);
      continue;
    }

    seenRefs.set(ref, fileName);
    records.push(check.record);
  }

  return { realRecordsDir, recordsRead: recordFiles.length, records, seenRefs };
}

async function readStatusMap(
  recordsDir: string,
  seenRefs: Map<string, string>,
  problems: string[],
): Promise<Map<string, TranscriptStatus>> {
  const statusByRef = new Map<string, TranscriptStatus>();
  const statusPath = join(recordsDir, "status.json");

  const statusRead = await readRegularFileNoFollow(statusPath);
  if (!statusRead.ok) {
    if (statusRead.kind === "missing") {
      return statusByRef;
    }
    const detail =
      statusRead.kind === "symlink"
        ? "refusing symlink"
        : statusRead.kind === "not_file"
          ? "not a regular file"
          : `could not be read (${statusRead.message})`;
    problems.push(`status.json: ${detail}`);
    return statusByRef;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(statusRead.bytes).toString("utf8")) as unknown;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    problems.push(`status.json: invalid JSON (${msg})`);
    return statusByRef;
  }

  if (!isPlainObject(parsed)) {
    problems.push("status.json: must be a JSON object mapping source_ref to transcript_status");
    return statusByRef;
  }

  for (const [ref, value] of Object.entries(parsed)) {
    if (!isTranscriptStatus(value)) {
      problems.push(
        `status.json: unknown status for "${ref}": ${JSON.stringify(value)} (expected ${TRANSCRIPT_STATUSES.join(", ")})`,
      );
    }
    if (!seenRefs.has(ref)) {
      problems.push(`status.json: "${ref}" has no matching record file`);
    }
    if (isTranscriptStatus(value) && seenRefs.has(ref)) {
      statusByRef.set(ref, value);
    }
  }

  return statusByRef;
}

export async function importReferenceRecords(options: ImportOptions): Promise<ImportResult> {
  const dryRun = options.dryRun ?? false;
  const problems: string[] = [];
  const resolvedRecordsDir = resolve(options.recordsDir);

  const { realRecordsDir, recordsRead, records, seenRefs } = await readRecords(
    resolvedRecordsDir,
    problems,
  );
  const statusByRef = realRecordsDir
    ? await readStatusMap(realRecordsDir, seenRefs, problems)
    : new Map<string, TranscriptStatus>();
  const plannedPhotos = options.photosDir
    ? await readPlannedPhotos(options.photosDir, records, problems)
    : new Map<string, PlannedPhoto>();

  if (problems.length > 0) {
    return refusedResult(recordsRead, dryRun, problems);
  }

  const existing = await options.store.findExisting(records.map((r) => r.source_ref));

  const reusablePhotoPaths = new Set<string>();
  for (const record of records) {
    if (existing.has(record.source_ref)) continue;
    const photo = plannedPhotos.get(record.source_ref);
    if (!photo) continue;

    const storedSha = await options.store.objectSha256(photo.storagePath);
    if (storedSha === null) continue;
    if (storedSha.toLowerCase() === photo.sha256) {
      reusablePhotoPaths.add(photo.storagePath);
    } else {
      problems.push(
        `storage: ${record.source_ref} (${photo.storagePath}): existing object sha256 (${storedSha}) does not match planned photo (${photo.sha256}); a person must remove the old object at "${photo.storagePath}" by hand before retrying`,
      );
    }
  }

  if (problems.length > 0) {
    return refusedResult(recordsRead, dryRun, problems);
  }

  let inserted = 0;
  let skipped = 0;
  let skippedDifferent = 0;
  let photosUploaded = 0;
  const skippedDifferentRefs: string[] = [];
  // Photos this run uploaded for a row that another run wrote first with a different photo path.
  const unreferencedPhotos: string[] = [];

  for (const record of records) {
    const prev = existing.get(record.source_ref);
    if (prev !== undefined) {
      if (deepEqualJson(prev.transcript, record)) {
        skipped += 1;
      } else {
        skippedDifferent += 1;
        skippedDifferentRefs.push(record.source_ref);
      }
      continue;
    }

    const photo = plannedPhotos.get(record.source_ref);
    let storagePath: string | null = null;
    let uploadedNow = false;
    let wasInserted: boolean;
    try {
      if (photo) {
        storagePath = photo.storagePath;
        if (!reusablePhotoPaths.has(photo.storagePath)) {
          if (!dryRun) {
            await options.store.uploadObject(photo.storagePath, photo.bytes, photo.contentType);
            uploadedNow = true;
          }
          photosUploaded += 1;
        }
      }

      if (dryRun) {
        inserted += 1;
        continue;
      }

      wasInserted = await options.store.insertRow({
        source_ref: record.source_ref,
        kind: record.kind,
        path: storagePath,
        transcript: record,
        transcript_status: statusByRef.get(record.source_ref) ?? "machine_read",
      });
    } catch (err) {
      // A write failed after validation. Say what is already written and that a second run is safe.
      const message = err instanceof Error ? err.message : String(err);
      const stopProblems = [`write failed at ${record.source_ref}: ${message}`];
      if (uploadedNow && storagePath) {
        stopProblems.push(
          `the photo for ${record.source_ref} is in storage at "${storagePath}" and its row may not be written; run the command again with the same files and it reuses that photo`,
        );
      }
      stopProblems.push(
        `rows written before the failure stay (${inserted}); the row for ${record.source_ref} may or may not be written; run the command again with the same files to finish`,
      );
      return {
        ok: false,
        stopped: true,
        dryRun,
        counts: { recordsRead, inserted, skipped, skippedDifferent, photosUploaded },
        skippedDifferentRefs,
        unreferencedPhotos,
        problems: stopProblems,
      };
    }
    if (wasInserted) {
      inserted += 1;
    } else {
      const reread = await options.store.findExisting([record.source_ref]);
      const concurrent = reread.get(record.source_ref);
      if (uploadedNow && storagePath && concurrent?.path !== storagePath) {
        unreferencedPhotos.push(storagePath);
      }
      if (concurrent !== undefined && deepEqualJson(concurrent.transcript, record)) {
        skipped += 1;
      } else {
        skippedDifferent += 1;
        skippedDifferentRefs.push(record.source_ref);
      }
    }
  }

  return {
    ok: true,
    dryRun,
    counts: {
      recordsRead,
      inserted,
      skipped,
      skippedDifferent,
      photosUploaded,
    },
    skippedDifferentRefs,
    unreferencedPhotos,
    problems: [],
  };
}

export function formatImportResult(result: ImportResult): string {
  const { recordsRead, inserted, skipped, skippedDifferent, photosUploaded } = result.counts;
  const prefix = result.stopped
    ? "Import stopped after a write error"
    : !result.ok
      ? "Import refused"
    : result.dryRun
      ? "Dry run summary"
      : "Import summary";
  const lines = [
    `${prefix}: records_read=${recordsRead} inserted=${inserted} skipped=${skipped} skipped_different=${skippedDifferent} photos_uploaded=${photosUploaded}`,
  ];
  for (const ref of result.skippedDifferentRefs) {
    lines.push(`skipped_different: ${ref} (stored transcript differs from file)`);
  }
  for (const path of result.unreferencedPhotos ?? []) {
    lines.push(
      `unreferenced_photo: "${path}" was uploaded, but another run wrote the row first; remove this object by hand`,
    );
  }
  for (const problem of result.problems) {
    lines.push(`problem: ${problem}`);
  }
  return lines.join("\n");
}
