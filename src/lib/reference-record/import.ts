import { readdir, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { checkCheckedPages } from "./checked-digests";
import {
  buildReferencePhotoPath,
  ensurePhotoObject,
  findPhotoTarget,
  findUnstorableTextPath,
  parseImportJson,
  readPlannedPhotos,
  readRegularFileNoFollow,
  storedKeyProblem,
  type PhotoTarget,
  type PlannedPhoto,
} from "./import-photos";
import {
  applyReplace,
  findTakenPaths,
  formatReplaceLines,
  messageOf,
  photoMayBeStored,
  planReplaces,
  quoted,
  REMOVE_BY_HAND,
  unusedPaths,
  type NewPhotoPath,
  type ReplaceDecision,
  type StatusLowered,
} from "./import-replace";
import { isPlainObject, sha256Hex } from "./read-file";
import { checkStatusSingleRead } from "./record-path";
import { checkMachineDigests, loadReportSummary, type ReportSummary } from "./report-hashes";
import { readStatusMap, type TranscriptStatus } from "./status-file";
import type { ReferenceRecord } from "./types";
import { validateReferenceRecord } from "./validate";

export { buildReferencePhotoPath, findUnstorableTextPath };
export type { NewPhotoPath, StatusLowered, TranscriptStatus };
export { TRANSCRIPT_STATUSES } from "./status-file";
export { MAX_REFERENCE_PHOTO_BYTES } from "./import-photos";

export const REFERENCE_RECORD_KINDS = ["page", "contents"] as const;
export type ReferenceRecordKind = (typeof REFERENCE_RECORD_KINDS)[number];

export const REFERENCE_TABLE = "bank_reference_images" as const;
export const REFERENCE_BUCKET = "curriculum-reference" as const;

const RESERVED_RECORD_FILES = new Set(["status.json", "report.json"]);

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
  // The revision of the row: every update gives another one.
  updated_at: string;
}

export interface ReferenceStore {
  findExisting(sourceRefs: string[]): Promise<Map<string, ExistingReferenceRow>>;
  // False when a row with this source_ref is already there.
  insertRow(row: ReferenceRow): Promise<boolean>;
  objectSha256(path: string): Promise<string | null>;
  // Never writes over an object: one that is already at the path is an error.
  uploadObject(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  // Updates kind, path, transcript, transcript_status and updated_at of the row with this source_ref
  // in one call, and only while its path, status and updated_at are those of seen. id, created_at and
  // note stay. Returns false when no row matched.
  updateRow(row: ReferenceRow, seen: ExistingReferenceRow): Promise<boolean>;
  // The source_refs of every row whose path is one of these paths.
  refsByPath(paths: string[]): Promise<Map<string, string[]>>;
}

export interface ImportOptions {
  recordsDir: string;
  photosDir?: string;
  dryRun?: boolean;
  // Replace an existing row (and its photo) that differs from the files. Never deletes anything.
  replace?: boolean;
  store: ReferenceStore;
}

export interface ImportCounts {
  recordsRead: number;
  inserted: number;
  replaced: number;
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
  // Photos this run uploaded for a row that was not written, and that no row uses.
  unreferencedPhotos?: string[];
  // --replace only: rows replaced, the paths of the photos that changed, statuses that went down, and
  // old photos that no row uses.
  replacedRefs: string[];
  newPhotoPaths: NewPhotoPath[];
  statusLowered: StatusLowered[];
  leftoverPhotos: string[];
  problems: string[];
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

function refusedResult(recordsRead: number, dryRun: boolean, problems: string[]): ImportResult {
  return {
    ok: false,
    dryRun,
    counts: {
      recordsRead,
      inserted: 0,
      replaced: 0,
      skipped: 0,
      skippedDifferent: 0,
      photosUploaded: 0,
    },
    skippedDifferentRefs: [],
    replacedRefs: [],
    newPhotoPaths: [],
    statusLowered: [],
    leftoverPhotos: [],
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
  // SHA-256 of the file bytes of each record.
  recordSha256ByRef: Map<string, string>;
}> {
  let realRecordsDir: string;
  let entries;
  try {
    realRecordsDir = await realpath(recordsDir);
    entries = await readdir(realRecordsDir, { withFileTypes: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    problems.push(`records folder "${recordsDir}" could not be read: ${msg}`);
    return {
      realRecordsDir: null,
      recordsRead: 0,
      records: [],
      seenRefs: new Map(),
      recordSha256ByRef: new Map(),
    };
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
  const recordSha256ByRef = new Map<string, string>();

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

    const parsedResult = parseImportJson(fileName, fileRead.bytes, problems);
    if (!parsedResult.ok) {
      continue;
    }
    const parsed = parsedResult.value;

    const check = validateReferenceRecord(parsed);
    if (!check.ok) {
      const refHint =
        isPlainObject(parsed) && typeof parsed.source_ref === "string"
          ? ` (${parsed.source_ref})`
          : "";
      for (const e of check.errors) {
        problems.push(`${fileName}${refHint}: ${e.path}: ${e.message}`);
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
    recordSha256ByRef.set(ref, sha256Hex(fileRead.bytes));
    records.push(check.record);
  }

  return { realRecordsDir, recordsRead: recordFiles.length, records, seenRefs, recordSha256ByRef };
}

export interface LoadedReferenceRecords {
  recordsRead: number;
  records: ReferenceRecord[];
  statusByRef: ReadonlyMap<string, TranscriptStatus>;
  // The file name of each source_ref.
  fileByRef: Map<string, string>;
  // Null when the folder cannot be read.
  realRecordsDir: string | null;
  // The bytes that were read.
  recordSha256ByRef: Map<string, string>;
  // False when status.json has a problem.
  statusIsUsable: boolean;
  problems: string[];
}

// Reads a folder of final records and its status.json with every check that an import needs: strict
// text, valid records, one file for each source_ref, known statuses, and single_read lists that resolve.
export async function loadReferenceRecords(recordsDir: string): Promise<LoadedReferenceRecords> {
  const problems: string[] = [];
  const { realRecordsDir, recordsRead, records, seenRefs, recordSha256ByRef } = await readRecords(
    resolve(recordsDir),
    problems,
  );
  const problemsBeforeStatus = problems.length;
  let statusByRef: ReadonlyMap<string, TranscriptStatus> = new Map();
  try {
    if (realRecordsDir) statusByRef = readStatusMap(realRecordsDir) ?? statusByRef;
  } catch (err) {
    problems.push(err instanceof Error ? err.message : String(err));
  }
  for (const ref of statusByRef.keys()) {
    if (!seenRefs.has(ref)) problems.push(`status.json: "${ref}" has no matching record file`);
  }
  const statusIsUsable = problems.length === problemsBeforeStatus;
  if (realRecordsDir && statusIsUsable) checkStatusSingleRead(records, statusByRef, problems);
  return { recordsRead, records, statusByRef, fileByRef: seenRefs, realRecordsDir, recordSha256ByRef, statusIsUsable, problems };
}

export async function importReferenceRecords(options: ImportOptions): Promise<ImportResult> {
  const dryRun = options.dryRun ?? false;
  const replace = options.replace ?? false;
  const loaded = await loadReferenceRecords(options.recordsDir);
  const { recordsRead, records, statusByRef, realRecordsDir, recordSha256ByRef, statusIsUsable, problems } = loaded;
  for (const { source_ref: ref } of records) {
    const keyProblem = storedKeyProblem(ref);
    if (keyProblem !== null) problems.push(`${ref}: the source_ref is too long: ${keyProblem}`);
  }
  const plannedPhotos = options.photosDir
    ? await readPlannedPhotos(options.photosDir, records, problems)
    : new Map<string, PlannedPhoto>();
  if (realRecordsDir) {
    const finalDir = realRecordsDir;
    let report: ReportSummary | undefined;
    try {
      report = loadReportSummary(finalDir);
    } catch (err) {
      problems.push(err instanceof Error ? err.message : String(err));
    }
    if (statusIsUsable && report) {
      checkMachineDigests({ statusByRef, recordSha256ByRef, plannedPhotos, problems, report });
    }
    checkCheckedPages({
      finalDir,
      statusByRef,
      recordSha256ByRef,
      plannedPhotos,
      problems,
      reportCheckedRefs: report?.checkedRefs ?? new Set(),
    });
  }

  if (problems.length > 0) {
    return refusedResult(recordsRead, dryRun, problems);
  }

  const existing = await options.store.findExisting(records.map((r) => r.source_ref));

  // The photo of each row that this run can write.
  const targets = new Map<string, PhotoTarget>();
  for (const record of records) {
    const ref = record.source_ref;
    const photo = plannedPhotos.get(ref);
    const prev = existing.get(ref);
    if (!photo || (prev && !replace)) continue;
    const found = await findPhotoTarget(options.store, photo, prev?.path ?? null);
    if (found.ok) targets.set(ref, found.target);
    else problems.push(`storage: ${ref}: ${found.problem}`);
  }

  if (problems.length > 0) {
    return refusedResult(recordsRead, dryRun, problems);
  }

  // --replace only: a decision for each existing row, and (dry run) the old paths that become unused.
  let decisions = new Map<string, ReplaceDecision>();
  let dryRunLeftovers: string[] = [];
  if (replace) {
    const plan = await planReplaces({ store: options.store, records, existing, targets, statusByRef, dryRun });
    if (plan.problems.length > 0) {
      return refusedResult(recordsRead, dryRun, plan.problems);
    }
    decisions = plan.decisions;
    dryRunLeftovers = plan.leftovers;
  }
  const givenPaths = new Map([...targets].filter(([ref]) => !decisions.get(ref)?.same).map(([ref, t]) => [ref, t.path]));
  const takenProblems = await findTakenPaths(options.store, givenPaths);
  if (takenProblems.length > 0) return refusedResult(recordsRead, dryRun, takenProblems);

  let inserted = 0;
  let replaced = 0;
  let skipped = 0;
  let skippedDifferent = 0;
  let photosUploaded = 0;
  const skippedDifferentRefs: string[] = [];
  const replacedRefs: string[] = [];
  const newPhotoPaths: NewPhotoPath[] = [];
  const statusLowered: StatusLowered[] = [];
  // Paths that a row of this run left, and photos this run uploaded for a row that it did not write.
  const oldPaths = new Set<string>();
  const looseUploads = new Set<string>();

  // Every end of the run after its first write. A path is named only when no row uses it now.
  const finish = async (stopProblems: string[] = []): Promise<ImportResult> => {
    let unused: string[] = dryRunLeftovers;
    const problemsNow = [...stopProblems];
    if (!dryRun) {
      const candidates = new Set([...oldPaths, ...looseUploads]);
      try {
        unused = await unusedPaths(options.store, candidates);
      } catch (err) {
        unused = [];
        problemsNow.push(
          `the rows that use these photos could not be read (${messageOf(err)}); each is a leftover only when no row uses it: ${[...candidates].map(quoted).join(", ")}`,
        );
      }
    }
    return {
      ok: problemsNow.length === 0,
      ...(problemsNow.length > 0 ? { stopped: true } : {}),
      dryRun,
      counts: { recordsRead, inserted, replaced, skipped, skippedDifferent, photosUploaded },
      skippedDifferentRefs,
      unreferencedPhotos: unused.filter((path) => looseUploads.has(path)),
      replacedRefs,
      newPhotoPaths,
      statusLowered,
      leftoverPhotos: unused.filter((path) => !looseUploads.has(path)),
      problems: problemsNow,
    };
  };
  const writtenSoFar = (): string => `rows written before the failure stay (${replace ? `inserted ${inserted}, replaced ${replaced}` : inserted})`;
  const rowChangedHelp = (): string =>
    `${writtenSoFar()}; wait until no other import runs, then run the same command with --dry-run, read its output, and run it again`;

  for (const record of records) {
    const ref = record.source_ref;
    const prev = existing.get(ref);
    const plannedStatus = statusByRef.get(ref) ?? "machine_read";
    const decision = decisions.get(ref);
    const photo = plannedPhotos.get(ref);
    const target = targets.get(ref);
    if (prev !== undefined && decision !== undefined) {
      if (decision.same) {
        skipped += 1;
        continue;
      }
      const store = options.store;
      const outcome = await applyReplace({ store, record, prev, plannedStatus, photo, target, decision, dryRun });
      if (outcome.photoWritten) photosUploaded += 1;
      // Also when the update failed, because its answer can be lost. A path that a row uses is not named.
      if (decision.leftoverPath !== null) oldPaths.add(decision.leftoverPath);
      if (!outcome.ok) {
        if (outcome.photoWritten && !outcome.rowWritten && target) looseUploads.add(target.path);
        return finish([
          ...outcome.problems,
          outcome.rowChanged
            ? rowChangedHelp()
            : `${writtenSoFar()}; the row for ${ref} ${outcome.rowWritten ? "holds the new values" : "may or may not be replaced"}; run the command again with the same files to finish`,
        ]);
      }
      replaced += 1;
      replacedRefs.push(ref);
      if (target && (target.upload || target.path !== prev.path)) newPhotoPaths.push({ ref, path: target.path });
      if (decision.lowered) statusLowered.push(decision.lowered);
      continue;
    }
    if (prev !== undefined) {
      if (deepEqualJson(prev.transcript, record)) {
        skipped += 1;
      } else {
        skippedDifferent += 1;
        skippedDifferentRefs.push(ref);
      }
      continue;
    }

    const storagePath = target?.path ?? null;
    if (dryRun) {
      if (target?.upload) photosUploaded += 1;
      inserted += 1;
      continue;
    }
    let uploadedNow = false;
    try {
      if (photo && target) {
        await ensurePhotoObject(options.store, photo, target, () => {
          uploadedNow = true;
          photosUploaded += 1;
          looseUploads.add(target.path);
        });
      }
      const wasInserted = await options.store.insertRow({
        source_ref: ref,
        kind: record.kind,
        path: storagePath,
        transcript: record,
        transcript_status: plannedStatus,
      });
      if (wasInserted) {
        if (storagePath !== null) looseUploads.delete(storagePath);
        inserted += 1;
        continue;
      }
      // Another run wrote the row first. It stays as it is.
      const concurrent = (await options.store.findExisting([ref])).get(ref);
      const sameText = concurrent !== undefined && deepEqualJson(concurrent.transcript, record);
      const sameRow =
        sameText &&
        concurrent.transcript_status === plannedStatus &&
        (storagePath === null || concurrent.path === storagePath);
      if (replace && !sameRow) {
        return finish([`${ref}: another run wrote this row first and it differs; this run did not write the row`, rowChangedHelp()]);
      }
      if (sameText) {
        skipped += 1;
      } else {
        skippedDifferent += 1;
        skippedDifferentRefs.push(ref);
      }
    } catch (err) {
      // A call failed after validation. Say what is already written and that a second run is safe.
      const stopProblems = [`write failed at ${ref}: ${messageOf(err)}`];
      if (target?.upload && !uploadedNow) stopProblems.push(photoMayBeStored(ref, target.path));
      stopProblems.push(
        `${writtenSoFar()}; the row for ${ref} may or may not be written; run the command again with the same files to finish`,
      );
      return finish(stopProblems);
    }
  }

  return finish();
}

export function formatImportResult(result: ImportResult): string {
  const { recordsRead, inserted, replaced, skipped, skippedDifferent, photosUploaded } =
    result.counts;
  const prefix = result.stopped
    ? "Import stopped after a write error"
    : !result.ok
      ? "Import refused"
    : result.dryRun
      ? "Dry run summary"
      : "Import summary";
  const lines = [
    `${prefix}: records_read=${recordsRead} inserted=${inserted} replaced=${replaced} skipped=${skipped} skipped_different=${skippedDifferent} photos_uploaded=${photosUploaded}`,
  ];
  for (const ref of result.skippedDifferentRefs) {
    lines.push(`skipped_different: ${ref} (stored transcript differs from file)`);
  }
  for (const path of result.unreferencedPhotos ?? []) {
    lines.push(
      `unreferenced_photo: "${path}" was uploaded, but its row was not written; run the command again first (it uses this photo when it writes the row with the same files; when the row of another run stays, look at that row and at --replace), else ${REMOVE_BY_HAND}`,
    );
  }
  lines.push(...formatReplaceLines(result));
  for (const problem of result.problems) {
    lines.push(`problem: ${problem}`);
  }
  return lines.join("\n");
}
