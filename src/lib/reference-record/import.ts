import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, resolve } from "node:path";
import { isPathInsideDir } from "./output-guard";
import type { ReferenceRecord } from "./types";
import { validateReferenceRecord } from "./validate";

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
const PATH_SEGMENT_RE = /^[A-Za-z0-9_-]+$/;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/i;

const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

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
  insertRow(row: ReferenceRow): Promise<void>;
  objectExists(path: string): Promise<boolean>;
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
  dryRun: boolean;
  counts: ImportCounts;
  skippedDifferentRefs: string[];
  problems: string[];
}

interface PlannedPhoto {
  storagePath: string;
  contentType: string;
  bytes: Uint8Array;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTranscriptStatus(value: unknown): value is TranscriptStatus {
  return (
    typeof value === "string" &&
    (TRANSCRIPT_STATUSES as readonly string[]).includes(value)
  );
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
    if (!Object.prototype.hasOwnProperty.call(objB, key) || objB[key] === undefined) {
      return false;
    }
    if (!deepEqualJson(objA[key], objB[key])) return false;
  }
  return true;
}

export function buildReferencePhotoPath(
  sourceRef: string,
  fileName: string,
): { ok: true; path: string; contentType: string } | { ok: false; error: string } {
  const segments = sourceRef.split(":");
  if (segments.length === 0 || !segments.every((seg) => PATH_SEGMENT_RE.test(seg))) {
    return {
      ok: false,
      error: `invalid storage path segment in source_ref "${sourceRef}" (each segment must match [A-Za-z0-9_-]+)`,
    };
  }

  const rawExt = extname(fileName).toLowerCase();
  const ext = rawExt.startsWith(".") ? rawExt.slice(1) : "";
  const contentType = EXT_TO_CONTENT_TYPE[ext];
  if (!contentType) {
    return {
      ok: false,
      error: `unsupported photo extension "${rawExt || "(none)"}" for "${fileName}" (expected jpg, jpeg, png, or webp)`,
    };
  }

  return {
    ok: true,
    path: `${segments.join("/")}.${ext}`,
    contentType,
  };
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
): Promise<{ recordsRead: number; records: ReferenceRecord[]; seenRefs: Map<string, string> }> {
  let entries;
  try {
    entries = await readdir(recordsDir, { withFileTypes: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    problems.push(`records folder "${recordsDir}" could not be read: ${msg}`);
    return { recordsRead: 0, records: [], seenRefs: new Map() };
  }

  const recordFiles = entries
    .filter(
      (entry) =>
        (entry.isFile() || entry.isSymbolicLink()) &&
        entry.name.endsWith(".json") &&
        !RESERVED_RECORD_FILES.has(entry.name),
    )
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const records: ReferenceRecord[] = [];
  const seenRefs = new Map<string, string>();

  for (const fileName of recordFiles) {
    const filePath = join(recordsDir, fileName);
    let parsed: unknown;
    try {
      const raw = await readFile(filePath, "utf8");
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

    const ref = check.record.source_ref;
    const prevFile = seenRefs.get(ref);
    if (prevFile !== undefined) {
      problems.push(`duplicate source_ref "${ref}" in ${prevFile} and ${fileName}`);
      continue;
    }

    seenRefs.set(ref, fileName);
    records.push(check.record);
  }

  return { recordsRead: recordFiles.length, records, seenRefs };
}

async function readStatusMap(
  recordsDir: string,
  seenRefs: Map<string, string>,
  problems: string[],
): Promise<Map<string, TranscriptStatus>> {
  const statusByRef = new Map<string, TranscriptStatus>();
  const statusPath = join(recordsDir, "status.json");

  let rawText: string;
  try {
    rawText = await readFile(statusPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return statusByRef;
    }
    const msg = err instanceof Error ? err.message : String(err);
    problems.push(`status.json: could not be read (${msg})`);
    return statusByRef;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
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

async function readPlannedPhotos(
  photosDir: string,
  records: ReferenceRecord[],
  problems: string[],
): Promise<Map<string, PlannedPhoto>> {
  const planned = new Map<string, PlannedPhoto>();
  const resolvedPhotosDir = resolve(photosDir);

  let realPhotosDir: string;
  try {
    const dirStat = await stat(resolvedPhotosDir);
    if (!dirStat.isDirectory()) {
      problems.push(`photos path "${photosDir}" is not a directory`);
      return planned;
    }
    realPhotosDir = await realpath(resolvedPhotosDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    problems.push(`photos folder "${photosDir}" could not be read: ${msg}`);
    return planned;
  }

  const manifestPath = join(realPhotosDir, "masked-manifest.json");
  let parsedManifest: unknown;
  try {
    parsedManifest = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    problems.push(`masked-manifest.json: could not be read or parsed (${msg})`);
    return planned;
  }

  if (
    !isPlainObject(parsedManifest) ||
    parsedManifest.version !== 1 ||
    !Array.isArray(parsedManifest.photos)
  ) {
    problems.push("masked-manifest.json: must be an object with version: 1 and a photos array");
    return planned;
  }

  const entriesByRef = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < parsedManifest.photos.length; i += 1) {
    const entry = parsedManifest.photos[i];
    if (!isPlainObject(entry)) {
      problems.push(`masked-manifest.json: photos[${i}] must be an object`);
      continue;
    }
    if (entry.source_ref === undefined || entry.source_ref === null) {
      continue;
    }
    if (typeof entry.source_ref !== "string" || entry.source_ref.trim() === "") {
      problems.push(`masked-manifest.json: photos[${i}].source_ref must be a non-empty string`);
      continue;
    }
    if (entriesByRef.has(entry.source_ref)) {
      problems.push(`masked-manifest.json: duplicate source_ref "${entry.source_ref}"`);
      continue;
    }
    entriesByRef.set(entry.source_ref, entry);
  }

  for (const record of records) {
    const entry = entriesByRef.get(record.source_ref);
    if (!entry) continue;

    let entryValid = true;
    const fileLabel = typeof entry.file === "string" ? entry.file : "(missing file)";

    if (entry.confirmed !== true) {
      problems.push(
        `masked-manifest.json: ${record.source_ref} (${fileLabel}): confirmed must be strictly true`,
      );
      entryValid = false;
    }

    if (typeof entry.file !== "string" || entry.file.trim() === "" || isAbsolute(entry.file)) {
      problems.push(
        `masked-manifest.json: ${record.source_ref}: file must be a relative path inside the photos folder`,
      );
      continue;
    }

    const candidateFile = resolve(realPhotosDir, entry.file);
    if (!isPathInsideDir(candidateFile, realPhotosDir)) {
      problems.push(
        `masked-manifest.json: ${record.source_ref} (${entry.file}): file resolves outside the photos folder`,
      );
      continue;
    }

    const pathCheck = buildReferencePhotoPath(record.source_ref, entry.file);
    if (!pathCheck.ok) {
      problems.push(`masked-manifest.json: ${record.source_ref}: ${pathCheck.error}`);
      entryValid = false;
    }

    const expectedSha =
      typeof entry.sha256 === "string" && SHA256_HEX_RE.test(entry.sha256)
        ? entry.sha256.toLowerCase()
        : null;
    if (!expectedSha) {
      problems.push(
        `masked-manifest.json: ${record.source_ref} (${entry.file}): sha256 must be a 64-character hex string`,
      );
      entryValid = false;
    }

    let bytes: Uint8Array;
    try {
      const fileLstat = await lstat(candidateFile);
      if (fileLstat.isSymbolicLink() && !isPathInsideDir(candidateFile, realPhotosDir)) {
        problems.push(
          `photos: ${record.source_ref} (${entry.file}): symlink target is outside the photos folder`,
        );
        continue;
      }
      const fileStat = await stat(candidateFile);
      if (!fileStat.isFile()) {
        problems.push(`photos: ${record.source_ref} (${entry.file}): not a regular file`);
        continue;
      }
      bytes = new Uint8Array(await readFile(candidateFile));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const reason = code === "ENOENT" ? "missing file" : `could not read file (${String(err)})`;
      problems.push(`photos: ${record.source_ref} (${entry.file}): ${reason}`);
      continue;
    }

    if (expectedSha) {
      const actualSha = createHash("sha256").update(bytes).digest("hex");
      if (actualSha !== expectedSha) {
        problems.push(
          `photos: ${record.source_ref} (${entry.file}): sha256 mismatch (expected ${expectedSha}, got ${actualSha})`,
        );
        entryValid = false;
      }
    }

    if (entryValid && pathCheck.ok) {
      planned.set(record.source_ref, {
        storagePath: pathCheck.path,
        contentType: pathCheck.contentType,
        bytes,
      });
    }
  }

  return planned;
}

export async function importReferenceRecords(options: ImportOptions): Promise<ImportResult> {
  const dryRun = options.dryRun ?? false;
  const problems: string[] = [];

  const { recordsRead, records, seenRefs } = await readRecords(
    resolve(options.recordsDir),
    problems,
  );
  const statusByRef = await readStatusMap(resolve(options.recordsDir), seenRefs, problems);
  const plannedPhotos = options.photosDir
    ? await readPlannedPhotos(options.photosDir, records, problems)
    : new Map<string, PlannedPhoto>();

  if (problems.length > 0) {
    return refusedResult(recordsRead, dryRun, problems);
  }

  const existing = await options.store.findExisting(records.map((r) => r.source_ref));

  let inserted = 0;
  let skipped = 0;
  let skippedDifferent = 0;
  let photosUploaded = 0;
  const skippedDifferentRefs: string[] = [];

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
    if (photo) {
      storagePath = photo.storagePath;
      const alreadyStored = await options.store.objectExists(photo.storagePath);
      if (!alreadyStored) {
        if (!dryRun) {
          await options.store.uploadObject(photo.storagePath, photo.bytes, photo.contentType);
        }
        photosUploaded += 1;
      }
    }

    if (!dryRun) {
      await options.store.insertRow({
        source_ref: record.source_ref,
        kind: record.kind,
        path: storagePath,
        transcript: record,
        transcript_status: statusByRef.get(record.source_ref) ?? "machine_read",
      });
    }
    inserted += 1;
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
    problems: [],
  };
}

export function formatImportResult(result: ImportResult): string {
  const { recordsRead, inserted, skipped, skippedDifferent, photosUploaded } = result.counts;
  const prefix = !result.ok
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
  for (const problem of result.problems) {
    lines.push(`problem: ${problem}`);
  }
  return lines.join("\n");
}
