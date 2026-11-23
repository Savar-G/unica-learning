import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import {
  assertOutsideRepo,
  prepareSafeOutputDir,
  validateReferenceRecord,
  writeSafeOutputFile,
  type ValidationError,
} from "@/lib/reference-record";
import { fileSlugFromRef } from "./answers";
import { compareWorkFolder, type CompareWorkReport } from "./compare-batch";
import {
  createEmptyManifest,
  isSupportedPhotoFile,
  MIN_LONG_SIDE_PX,
  parsePhotosManifest,
  PHOTOS_MANIFEST_FILE,
  PREPARE_REPORT_FILE,
  preparedFileNameForHash,
  preparePhoto,
  readRegularFileNoFollow,
  resolveSafeChildPath,
  upsertManifestPhoto,
  type PhotosManifest,
  type PrepareReportFile,
  type TooSmallPhotoReport,
  type UnreadablePhotoReport,
} from "./prepare";
import {
  assertModelMatchesFamily,
  assertValidSourceKey,
  readPhoto,
  type PhotoRunEntry,
  type ReaderFamily,
  type ReaderMeta,
  type ReaderSlot,
  type ReadPhotoResult,
  type ReadRunReport,
  type RunCli,
} from "./read";

export interface ExtractCounts {
  double_read: number;
  machine_read: number;
  failed: number;
  too_small: number;
}

export interface ExtractFolderOptions {
  photosDir: string;
  outDir: string;
  source: string;
  readerA?: ReaderFamily;
  readerB?: ReaderFamily;
  modelA?: string;
  modelB?: string;
  allowSmall?: boolean;
  force?: boolean;
  limit?: number;
  repoRoot: string;
  timeoutMs?: number;
  runCli?: RunCli;
  onProgress?: (line: string) => void;
}

export interface ExtractFolderResult {
  exitCode: 0 | 1;
  preparedCount: number;
  counts: ExtractCounts;
  reportPath: string;
  report: CompareWorkReport;
}

function readJsonIfExists<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function safeUnlink(filePath: string): void {
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

function loadCachedSlotEntries(
  slotDir: string,
  expectedFamily: ReaderFamily,
): Map<string, PhotoRunEntry> {
  const validByDigest = new Map<string, PhotoRunEntry>();
  const meta = readJsonIfExists<Partial<ReaderMeta>>(join(slotDir, "reader.json"));
  if (!meta || meta.family !== expectedFamily) return validByDigest;

  const run = readJsonIfExists<Partial<ReadRunReport>>(join(slotDir, "run.json"));
  if (!run || !Array.isArray(run.photos)) return validByDigest;

  for (const entry of run.photos) {
    if (
      entry.status !== "ok" ||
      typeof entry.photo_sha256 !== "string" ||
      typeof entry.record_file !== "string" ||
      typeof entry.source_ref !== "string"
    ) {
      continue;
    }
    const recordPath = join(slotDir, entry.record_file);
    if (!existsSync(recordPath)) continue;
    const raw = readJsonIfExists<unknown>(recordPath);
    const check = validateReferenceRecord(raw);
    if (!check.ok || check.record.source_ref !== entry.source_ref) continue;
    validByDigest.set(entry.photo_sha256, entry);
  }
  return validByDigest;
}

function deleteOldFilesForDigest(opts: {
  workDir: string;
  slotDirA: string;
  slotDirB: string;
  sha256: string;
  manifest: PhotosManifest;
  deleteFinal: boolean;
  repoRoot: string;
}): void {
  const oldRefs = new Set<string>();
  const manifestEntry = opts.manifest.photos.find((p) => p.sha256 === opts.sha256);
  if (manifestEntry?.source_ref) {
    oldRefs.add(manifestEntry.source_ref);
  }

  for (const slotDir of [opts.slotDirA, opts.slotDirB]) {
    const runPath = join(slotDir, "run.json");
    const run = readJsonIfExists<ReadRunReport>(runPath);
    if (!run || !Array.isArray(run.photos)) continue;

    const kept: PhotoRunEntry[] = [];
    let changed = false;
    for (const entry of run.photos) {
      if (entry.photo_sha256 === opts.sha256) {
        changed = true;
        if (entry.source_ref) oldRefs.add(entry.source_ref);
        if (entry.record_file) safeUnlink(join(slotDir, entry.record_file));
        if (entry.invalid_file) safeUnlink(join(slotDir, entry.invalid_file));
      } else {
        kept.push(entry);
      }
    }
    if (changed) {
      writeSafeOutputFile(
        runPath,
        `${JSON.stringify({ ...run, photos: kept }, null, 2)}\n`,
        opts.repoRoot,
      );
    }
  }

  if (!opts.deleteFinal) return;

  const finalDir = join(opts.workDir, "final");
  const viewDir = join(opts.workDir, "final-view");
  const statusPath = join(finalDir, "status.json");
  const statusMap = readJsonIfExists<Record<string, string>>(statusPath);
  let statusChanged = false;

  for (const ref of oldRefs) {
    const slug = fileSlugFromRef(ref);
    safeUnlink(join(finalDir, `${slug}.json`));
    safeUnlink(join(viewDir, `${slug}.md`));
    if (statusMap && Object.prototype.hasOwnProperty.call(statusMap, ref)) {
      delete statusMap[ref];
      statusChanged = true;
    }
  }
  if (statusChanged && statusMap) {
    writeSafeOutputFile(statusPath, `${JSON.stringify(statusMap, null, 2)}\n`, opts.repoRoot);
  }
}

function persistSlotResult(opts: {
  slot: ReaderSlot;
  slotDir: string;
  preparedFile: string;
  originalName: string;
  sha256: string;
  result: ReadPhotoResult;
  writtenSourceRefs: Set<string>;
  repoRoot: string;
}): PhotoRunEntry {
  const { slot, slotDir, preparedFile, originalName, sha256, result, writtenSourceRefs, repoRoot } = opts;

  if (result.status === "cli_error") {
    return {
      photo: preparedFile,
      original_name: originalName,
      photo_sha256: sha256,
      status: "cli_error",
      reason: result.reason,
      notes: [],
    };
  }

  if (result.status === "invalid") {
    const photoBase = basename(preparedFile, extname(preparedFile));
    const invalidFile = `${photoBase}.invalid.json`;
    writeSafeOutputFile(
      join(slotDir, invalidFile),
      `${JSON.stringify({ photo: preparedFile, original_name: originalName, errors: result.errors, raw: result.raw }, null, 2)}\n`,
      repoRoot,
    );
    return {
      photo: preparedFile,
      original_name: originalName,
      photo_sha256: sha256,
      status: "invalid",
      invalid_file: invalidFile,
      errors: result.errors,
      notes: [],
    };
  }

  const sourceRef = result.record.source_ref;
  if (writtenSourceRefs.has(sourceRef)) {
    const photoBase = basename(preparedFile, extname(preparedFile));
    const invalidFile = `${photoBase}.invalid.json`;
    const dupErr: ValidationError = {
      path: "source_ref",
      message: `duplicate source_ref "${sourceRef}" in slot ${slot}`,
    };
    writeSafeOutputFile(
      join(slotDir, invalidFile),
      `${JSON.stringify({ photo: preparedFile, original_name: originalName, errors: [dupErr], raw: JSON.stringify(result.record) }, null, 2)}\n`,
      repoRoot,
    );
    return {
      photo: preparedFile,
      original_name: originalName,
      photo_sha256: sha256,
      status: "invalid",
      invalid_file: invalidFile,
      errors: [dupErr],
      notes: [],
    };
  }

  writtenSourceRefs.add(sourceRef);
  const recordFile = `${fileSlugFromRef(sourceRef)}.json`;
  writeSafeOutputFile(
    join(slotDir, recordFile),
    `${JSON.stringify(result.record, null, 2)}\n`,
    repoRoot,
  );
  return {
    photo: preparedFile,
    original_name: originalName,
    photo_sha256: sha256,
    status: "ok",
    source_ref: sourceRef,
    record_file: recordFile,
    notes: result.notes,
  };
}

function formatPhotoProgress(
  index: number,
  total: number,
  originalName: string,
  entryA: PhotoRunEntry,
  entryB: PhotoRunEntry,
): string {
  const prefix = `[${index}/${total}] ${originalName}:`;
  if (entryA.status === "ok" && entryB.status === "ok") {
    if (entryA.source_ref === entryB.source_ref) {
      return `${prefix} a ok, b ok -> ${entryA.source_ref}`;
    }
    return `${prefix} a ok (${entryA.source_ref}), b ok (${entryB.source_ref})`;
  }
  const ref = entryA.source_ref ?? entryB.source_ref;
  const tail = ref ? ` -> ${ref}` : "";
  return `${prefix} a ${entryA.status}, b ${entryB.status}${tail}`;
}

function validateExtractOptions(opts: ExtractFolderOptions): {
  readerA: ReaderFamily;
  readerB: ReaderFamily;
} {
  assertValidSourceKey(opts.source);
  const readerA: ReaderFamily = opts.readerA ?? "codex";
  const readerB: ReaderFamily = opts.readerB ?? "claude";
  if (readerA !== "claude" && readerA !== "codex") {
    throw new Error(`Invalid --reader-a "${String(readerA)}": expected "claude" or "codex"`);
  }
  if (readerB !== "claude" && readerB !== "codex") {
    throw new Error(`Invalid --reader-b "${String(readerB)}": expected "claude" or "codex"`);
  }
  if (readerA === readerB) {
    throw new Error(
      `--reader-a and --reader-b must be different model families (both were "${readerA}").`,
    );
  }
  assertModelMatchesFamily(readerA, opts.modelA);
  assertModelMatchesFamily(readerB, opts.modelB);
  if (opts.limit !== undefined && (!Number.isInteger(opts.limit) || opts.limit < 1)) {
    throw new Error(`Invalid --limit "${String(opts.limit)}": expected a positive integer`);
  }
  return { readerA, readerB };
}

export async function extractFolder(opts: ExtractFolderOptions): Promise<ExtractFolderResult> {
  const { readerA, readerB } = validateExtractOptions(opts);
  const repoRoot = resolve(opts.repoRoot);
  const photosDir = resolve(opts.photosDir);
  assertOutsideRepo(opts.outDir, repoRoot);

  if (!existsSync(photosDir) || !statSync(photosDir).isDirectory()) {
    throw new Error(`Photos folder does not exist or is not a directory: ${photosDir}`);
  }

  const allPhotoNames = readdirSync(photosDir, { withFileTypes: true })
    .filter((entry) => !entry.isDirectory() && isSupportedPhotoFile(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const photoNames =
    opts.limit !== undefined ? allPhotoNames.slice(0, opts.limit) : allPhotoNames;

  const workDir = prepareSafeOutputDir(opts.outDir, repoRoot);
  const preparedPhotosDir = prepareSafeOutputDir(join(workDir, "photos"), repoRoot);
  const slotDirA = prepareSafeOutputDir(join(workDir, "reader-a"), repoRoot);
  const slotDirB = prepareSafeOutputDir(join(workDir, "reader-b"), repoRoot);

  const metaA: ReaderMeta = { family: readerA, model: opts.modelA ?? "default" };
  const metaB: ReaderMeta = { family: readerB, model: opts.modelB ?? "default" };

  const manifestPath = join(preparedPhotosDir, PHOTOS_MANIFEST_FILE);
  let manifest: PhotosManifest = createEmptyManifest();
  const existingManifestRaw = readJsonIfExists<unknown>(manifestPath);
  if (existingManifestRaw) {
    try {
      manifest = parsePhotosManifest(existingManifestRaw);
    } catch {
      manifest = createEmptyManifest();
    }
  }

  const cachedA = loadCachedSlotEntries(slotDirA, readerA);
  const cachedB = loadCachedSlotEntries(slotDirB, readerB);

  writeSafeOutputFile(join(slotDirA, "reader.json"), `${JSON.stringify(metaA, null, 2)}\n`, repoRoot);
  writeSafeOutputFile(join(slotDirB, "reader.json"), `${JSON.stringify(metaB, null, 2)}\n`, repoRoot);

  const entriesA: PhotoRunEntry[] = [];
  const entriesB: PhotoRunEntry[] = [];
  const writtenRefsA = new Set<string>();
  const writtenRefsB = new Set<string>();
  const tooSmall: TooSmallPhotoReport[] = [];
  const unreadable: UnreadablePhotoReport[] = [];

  const allowSmall = opts.allowSmall ?? false;
  const force = opts.force ?? false;
  const log = opts.onProgress ?? (() => {});
  let preparedCount = 0;

  const writeSlotRuns = (): void => {
    const runA: ReadRunReport = { slot: "a", reader: metaA, source: opts.source, photos: entriesA };
    const runB: ReadRunReport = { slot: "b", reader: metaB, source: opts.source, photos: entriesB };
    writeSafeOutputFile(join(slotDirA, "run.json"), `${JSON.stringify(runA, null, 2)}\n`, repoRoot);
    writeSafeOutputFile(join(slotDirB, "run.json"), `${JSON.stringify(runB, null, 2)}\n`, repoRoot);
    writeSafeOutputFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, repoRoot);
  };

  for (let i = 0; i < photoNames.length; i += 1) {
    const originalName = photoNames[i];
    const index = i + 1;
    const total = photoNames.length;
    const candidatePath = resolveSafeChildPath(photosDir, originalName);
    if (!candidatePath) {
      const reason = `unreadable_image: invalid file name "${originalName}"`;
      unreadable.push({ original_name: originalName, reason });
      log(`[${index}/${total}] ${originalName}: ${reason}`);
      continue;
    }

    let rawBytes: Buffer;
    try {
      rawBytes = readRegularFileNoFollow(candidatePath);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const reason = `unreadable_image: ${detail}`;
      unreadable.push({ original_name: originalName, reason });
      log(`[${index}/${total}] ${originalName}: ${reason}`);
      continue;
    }

    let prepared;
    try {
      prepared = await preparePhoto(rawBytes);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const reason = `unreadable_image: ${detail}`;
      unreadable.push({ original_name: originalName, reason });
      log(`[${index}/${total}] ${originalName}: ${reason}`);
      continue;
    }

    const longSide = Math.max(prepared.width, prepared.height);
    if (longSide < MIN_LONG_SIDE_PX && !allowSmall) {
      tooSmall.push({ original_name: originalName, width: prepared.width, height: prepared.height });
      log(`[${index}/${total}] ${originalName}: too_small (${prepared.width}x${prepared.height})`);
      continue;
    }

    preparedCount += 1;
    const preparedFile = preparedFileNameForHash(prepared.sha256);
    writeSafeOutputFile(join(preparedPhotosDir, preparedFile), prepared.bytes, repoRoot);

    const prevA = cachedA.get(prepared.sha256);
    const prevB = cachedB.get(prepared.sha256);
    if (
      !force &&
      prevA?.source_ref &&
      prevB?.source_ref &&
      !writtenRefsA.has(prevA.source_ref) &&
      !writtenRefsB.has(prevB.source_ref)
    ) {
      writtenRefsA.add(prevA.source_ref);
      writtenRefsB.add(prevB.source_ref);
      entriesA.push({ ...prevA, photo: preparedFile, original_name: originalName });
      entriesB.push({ ...prevB, photo: preparedFile, original_name: originalName });
      manifest = upsertManifestPhoto(manifest, {
        file: preparedFile,
        sha256: prepared.sha256,
        original_name: originalName,
        width: prepared.width,
        height: prepared.height,
        source_ref: prevA.source_ref,
      });
      writeSlotRuns();
      log(`[${index}/${total}] ${originalName}: skipped (cached) -> ${prevA.source_ref}`);
      continue;
    }

    deleteOldFilesForDigest({
      workDir,
      slotDirA,
      slotDirB,
      sha256: prepared.sha256,
      manifest,
      deleteFinal: force,
      repoRoot,
    });
    cachedA.delete(prepared.sha256);
    cachedB.delete(prepared.sha256);

    manifest = upsertManifestPhoto(
      manifest,
      {
        file: preparedFile,
        sha256: prepared.sha256,
        original_name: originalName,
        width: prepared.width,
        height: prepared.height,
      },
      { clearSourceRef: force },
    );

    // Isolation rule: run both readers in parallel, keep results in memory, write only after BOTH finish.
    const [resA, resB] = await Promise.all([
      readPhoto({
        photoBytes: prepared.bytes,
        source: opts.source,
        reader: readerA,
        model: opts.modelA,
        timeoutMs: opts.timeoutMs,
        runCli: opts.runCli,
      }),
      readPhoto({
        photoBytes: prepared.bytes,
        source: opts.source,
        reader: readerB,
        model: opts.modelB,
        timeoutMs: opts.timeoutMs,
        runCli: opts.runCli,
      }),
    ]);

    const entryA = persistSlotResult({
      slot: "a",
      slotDir: slotDirA,
      preparedFile,
      originalName,
      sha256: prepared.sha256,
      result: resA,
      writtenSourceRefs: writtenRefsA,
      repoRoot,
    });
    const entryB = persistSlotResult({
      slot: "b",
      slotDir: slotDirB,
      preparedFile,
      originalName,
      sha256: prepared.sha256,
      result: resB,
      writtenSourceRefs: writtenRefsB,
      repoRoot,
    });

    entriesA.push(entryA);
    entriesB.push(entryB);

    const identifiedRef = entryA.source_ref ?? entryB.source_ref;
    if (identifiedRef) {
      manifest = upsertManifestPhoto(manifest, {
        file: preparedFile,
        sha256: prepared.sha256,
        original_name: originalName,
        width: prepared.width,
        height: prepared.height,
        source_ref: identifiedRef,
      });
    }

    writeSlotRuns();
    log(formatPhotoProgress(index, total, originalName, entryA, entryB));
  }

  writeSlotRuns();

  const prepareData: PrepareReportFile = {
    version: 1,
    too_small: tooSmall,
    unreadable,
  };
  writeSafeOutputFile(
    join(workDir, PREPARE_REPORT_FILE),
    `${JSON.stringify(prepareData, null, 2)}\n`,
    repoRoot,
  );

  const report = compareWorkFolder({ workDir, repoRoot });
  const reportPath = join(workDir, "final", "report.md");

  const counts: ExtractCounts = {
    double_read: report.pages.filter((p) => p.status === "double_read").length,
    machine_read: report.pages.filter((p) => p.status === "machine_read").length,
    failed: report.could_not_read_photos.length,
    too_small: report.too_small_photos.length,
  };

  return {
    exitCode: preparedCount === 0 ? 1 : 0,
    preparedCount,
    counts,
    reportPath,
    report,
  };
}
