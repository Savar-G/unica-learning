import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  assertOutsideRepo,
  prepareSafeOutputDir,
  writeSafeOutputFile,
} from "@/lib/reference-record";
import { isCheckedForPhoto, loadCheckedPages, type CheckedPages } from "./checked-pages";
import { compareWorkFolder, type CompareWorkReport } from "./compare-batch";
import { killActiveReaders } from "./read-cli";
import { openPageShelter, type PageShelter, type ShelterCategory } from "./extract-shelter";
import {
  isValidReading,
  loadRunEntries,
  mergeRunEntries,
  persistSlotResult,
  pruneRemovedPhotos,
  readJsonIfExists,
  refsForDigest,
} from "./extract-state";
import {
  createEmptyManifest,
  formatTooSmallReason,
  isPhotoTooSmall,
  isSupportedPhotoFile,
  parsePhotosManifest,
  PHOTOS_MANIFEST_FILE,
  PREPARE_REPORT_FILE,
  preparedFileNameForHash,
  preparePhoto,
  readRegularFileNoFollow,
  resolveSafeChildPath,
  sha256Hex,
  upsertManifestPhoto,
  type DuplicatePhotoReport,
  type PhotosManifest,
  type PrepareReportFile,
  type RemovedPhotoReport,
} from "./prepare";
import {
  assertModelMatchesFamily,
  assertValidSourceKey,
  isReaderFamily,
  readPhoto,
  type PhotoRunEntry,
  type ReaderFamily,
  type ReaderMeta,
  type ReadPhotoResult,
  type ReadRunReport,
  type RunCli,
} from "./read";

export interface ExtractCounts {
  double_read: number;
  agreement_accepted: number;
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

interface SizedPhoto {
  name: string;
  sha256: string;
  width: number;
  height: number;
}

type ReadyPhoto = SizedPhoto & { kind: "ready" };

type ScannedPhoto =
  | { name: string; kind: "unreadable"; reason: string }
  | (SizedPhoto & { kind: "too_small" })
  | ReadyPhoto
  | { name: string; kind: "duplicate"; sha256: string; duplicateOf: string };

interface SlotOutcome {
  entry: PhotoRunEntry | undefined;
  label: string;
}

interface RunContext {
  opts: ExtractFolderOptions;
  readerA: ReaderFamily;
  readerB: ReaderFamily;
  repoRoot: string;
  workDir: string;
  preparedPhotosDir: string;
  slotDirA: string;
  slotDirB: string;
  manifest: PhotosManifest;
  entriesA: PhotoRunEntry[];
  entriesB: PhotoRunEntry[];
  checked: CheckedPages;
}

function formatPhotoProgress(prefix: string, a: SlotOutcome, b: SlotOutcome): string {
  const refA = a.entry?.status === "ok" ? a.entry.source_ref : undefined;
  const refB = b.entry?.status === "ok" ? b.entry.source_ref : undefined;
  if (refA && refB && refA !== refB) {
    return `${prefix} a ${a.label} (${refA}), b ${b.label} (${refB})`;
  }
  const ref = refA ?? refB;
  return `${prefix} a ${a.label}, b ${b.label}${ref ? ` -> ${ref}` : ""}`;
}

function validateExtractOptions(opts: ExtractFolderOptions): {
  readerA: ReaderFamily;
  readerB: ReaderFamily;
} {
  assertValidSourceKey(opts.source);
  const readerA: ReaderFamily = opts.readerA ?? "codex";
  const readerB: ReaderFamily = opts.readerB ?? "claude";
  if (!isReaderFamily(readerA)) {
    throw new Error(`Invalid --reader-a "${String(readerA)}": expected "claude" or "codex"`);
  }
  if (!isReaderFamily(readerB)) {
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

// Prepares every photo of the folder to learn its digest (the photos folder is the truth, also
// with --limit). Only the selected photos (the first selectedCount) are written to photos/.
async function scanPhotoFolder(opts: {
  photosDir: string;
  names: string[];
  selectedCount: number;
  allowSmall: boolean;
  preparedPhotosDir: string;
  repoRoot: string;
}): Promise<ScannedPhoto[]> {
  const firstNameByDigest = new Map<string, string>();
  const scanned: ScannedPhoto[] = [];
  for (let i = 0; i < opts.names.length; i += 1) {
    const name = opts.names[i];
    const candidatePath = resolveSafeChildPath(opts.photosDir, name);
    if (!candidatePath) {
      scanned.push({ name, kind: "unreadable", reason: `unreadable_image: invalid file name "${name}"` });
      continue;
    }
    let prepared;
    try {
      prepared = await preparePhoto(readRegularFileNoFollow(candidatePath));
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      scanned.push({ name, kind: "unreadable", reason: `unreadable_image: ${detail}` });
      continue;
    }
    const { sha256, width, height } = prepared;
    const duplicateOf = firstNameByDigest.get(sha256);
    if (duplicateOf !== undefined) {
      scanned.push({ name, kind: "duplicate", sha256, duplicateOf });
      continue;
    }
    firstNameByDigest.set(sha256, name);
    if (isPhotoTooSmall(width, height) && !opts.allowSmall) {
      scanned.push({ name, kind: "too_small", sha256, width, height });
      continue;
    }
    scanned.push({ name, kind: "ready", sha256, width, height });
    if (i < opts.selectedCount) {
      const file = join(opts.preparedPhotosDir, preparedFileNameForHash(sha256));
      writeSafeOutputFile(file, prepared.bytes, opts.repoRoot);
    }
  }
  return scanned;
}

function withPhotoName(
  entry: PhotoRunEntry | undefined,
  photo: string,
  originalName: string,
): PhotoRunEntry | undefined {
  return entry ? { ...entry, photo, original_name: originalName } : undefined;
}

// Decides the run.json entry of one reader after its read. A failed read never replaces an older
// valid reading; any other new result replaces the reader's old files of this digest.
function settleSlot(opts: {
  ctx: RunContext;
  category: ShelterCategory;
  shelter: PageShelter;
  result: ReadPhotoResult | null;
  old: PhotoRunEntry | undefined;
  oldValid: boolean;
  photo: ReadyPhoto;
}): SlotOutcome {
  const { ctx, category, result, photo } = opts;
  const preparedFile = preparedFileNameForHash(photo.sha256);
  const old = withPhotoName(opts.old, preparedFile, photo.name);
  if (!result) return { entry: old, label: "kept" };
  if (result.status !== "ok" && opts.oldValid) {
    return { entry: old, label: `${result.status} (older reading kept)` };
  }
  const slotDir = category === "slotA" ? ctx.slotDirA : ctx.slotDirB;
  const entry = persistSlotResult({
    slotDir,
    preparedFile,
    originalName: photo.name,
    sha256: photo.sha256,
    result,
    existingEntries: category === "slotA" ? ctx.entriesA : ctx.entriesB,
    repoRoot: ctx.repoRoot,
  });
  const written = entry.record_file ?? entry.invalid_file;
  opts.shelter.markReplaced(category, written ? [join(slotDir, written)] : []);
  return { entry, label: entry.status };
}

function readerCall(ctx: RunContext, family: ReaderFamily, model: string | undefined, bytes: Buffer) {
  return readPhoto({
    photoBytes: bytes,
    source: ctx.opts.source,
    reader: family,
    model,
    timeoutMs: ctx.opts.timeoutMs,
    runCli: ctx.opts.runCli,
  });
}

// Reads one photo. A reader with a valid reading for this digest is not run again unless --force,
// and a page checked by a person is never read again without --force. While any reader runs, the
// page's old files wait in a private shelter folder.
async function readOnePhoto(ctx: RunContext, photo: ReadyPhoto, prefix: string): Promise<string> {
  const { sha256 } = photo;
  const force = ctx.opts.force ?? false;
  const preparedFile = preparedFileNameForHash(sha256);
  const manifestEntry = {
    file: preparedFile,
    sha256,
    original_name: photo.name,
    width: photo.width,
    height: photo.height,
  };
  ctx.manifest = upsertManifestPhoto(ctx.manifest, manifestEntry);
  const oldA = ctx.entriesA.find((e) => e.photo_sha256 === sha256);
  const oldB = ctx.entriesB.find((e) => e.photo_sha256 === sha256);
  const refs = refsForDigest(sha256, ctx.manifest, ctx.entriesA, ctx.entriesB);
  const keepAsIs = (): void => {
    const renamedA = withPhotoName(oldA, preparedFile, photo.name);
    const renamedB = withPhotoName(oldB, preparedFile, photo.name);
    if (renamedA) ctx.entriesA = mergeRunEntries(ctx.entriesA, [renamedA]);
    if (renamedB) ctx.entriesB = mergeRunEntries(ctx.entriesB, [renamedB]);
  };

  const checkedRef = refs.find((ref) => ctx.checked.refs.has(ref));
  if (checkedRef && !force) {
    keepAsIs();
    const counts = isCheckedForPhoto({
      finalDir: join(ctx.workDir, "final"),
      checked: ctx.checked,
      ref: checkedRef,
      photoSha256: sha256,
    });
    return `${prefix} kept: ${counts ? "checked by a person" : "a person must check this page again"} -> ${checkedRef}`;
  }

  const validA = isValidReading(ctx.slotDirA, oldA);
  const validB = isValidReading(ctx.slotDirB, oldB);
  const runA = force || !validA;
  const runB = force || !validB;
  if (!runA && !runB) {
    keepAsIs();
    const ref = oldA?.source_ref ?? oldB?.source_ref;
    if (ref && !ctx.manifest.photos.find((p) => p.sha256 === sha256)?.source_ref) {
      ctx.manifest = upsertManifestPhoto(ctx.manifest, { ...manifestEntry, source_ref: ref });
    }
    return `${prefix} skipped (cached) -> ${ref}`;
  }

  const bytes = readRegularFileNoFollow(join(ctx.preparedPhotosDir, preparedFile));
  if (sha256Hex(bytes) !== sha256) {
    throw new Error(`Prepared photo ${preparedFile} changed during the run; run the command again.`);
  }
  const filesOf = (entry: PhotoRunEntry | undefined): string[] =>
    [entry?.record_file, entry?.invalid_file].filter((f): f is string => typeof f === "string");
  const shelter = openPageShelter({
    workDir: ctx.workDir,
    slotDirA: ctx.slotDirA,
    slotDirB: ctx.slotDirB,
    repoRoot: ctx.repoRoot,
    sha256,
    slotAFiles: filesOf(oldA),
    slotBFiles: filesOf(oldB),
    finalSourceRefs: refs,
  });
  let outcomeA: SlotOutcome;
  let outcomeB: SlotOutcome;
  // Ctrl-C or a stop signal while a reader runs: put the old files of this page back, then stop.
  const onSignal = (signal: NodeJS.Signals): void => {
    try {
      // First stop the readers, then put the files back: a reader must not see a restored record.
      killActiveReaders();
      shelter.close();
    } finally {
      process.exit(signal === "SIGINT" ? 130 : 143);
    }
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    // Isolation rule: the readers run at the same time; results are written only after both finish.
    const [resA, resB] = await Promise.all([
      runA ? readerCall(ctx, ctx.readerA, ctx.opts.modelA, bytes) : Promise.resolve(null),
      runB ? readerCall(ctx, ctx.readerB, ctx.opts.modelB, bytes) : Promise.resolve(null),
    ]);
    const common = { ctx, shelter, photo };
    outcomeA = settleSlot({ ...common, category: "slotA", result: resA, old: oldA, oldValid: validA });
    outcomeB = settleSlot({ ...common, category: "slotB", result: resB, old: oldB, oldValid: validB });
    shelter.markCommitted();
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    shelter.close();
  }

  if (outcomeA.entry) ctx.entriesA = mergeRunEntries(ctx.entriesA, [outcomeA.entry]);
  if (outcomeB.entry) ctx.entriesB = mergeRunEntries(ctx.entriesB, [outcomeB.entry]);
  const okRef = [outcomeA.entry, outcomeB.entry].find((e) => e?.status === "ok")?.source_ref;
  if (okRef) {
    ctx.manifest = upsertManifestPhoto(ctx.manifest, { ...manifestEntry, source_ref: okRef });
  }
  return formatPhotoProgress(prefix, outcomeA, outcomeB);
}

function writeRunState(ctx: RunContext, metaA: ReaderMeta, metaB: ReaderMeta): void {
  const runA: ReadRunReport = { slot: "a", reader: metaA, source: ctx.opts.source, photos: ctx.entriesA };
  const runB: ReadRunReport = { slot: "b", reader: metaB, source: ctx.opts.source, photos: ctx.entriesB };
  writeSafeOutputFile(join(ctx.slotDirA, "run.json"), `${JSON.stringify(runA, null, 2)}\n`, ctx.repoRoot);
  writeSafeOutputFile(join(ctx.slotDirB, "run.json"), `${JSON.stringify(runB, null, 2)}\n`, ctx.repoRoot);
  writeSafeOutputFile(
    join(ctx.preparedPhotosDir, PHOTOS_MANIFEST_FILE),
    `${JSON.stringify(ctx.manifest, null, 2)}\n`,
    ctx.repoRoot,
  );
}

function loadManifest(manifestPath: string): PhotosManifest {
  const raw = readJsonIfExists<unknown>(manifestPath);
  if (!raw) return createEmptyManifest();
  try {
    return parsePhotosManifest(raw);
  } catch {
    return createEmptyManifest();
  }
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
  const selectedCount = Math.min(opts.limit ?? allPhotoNames.length, allPhotoNames.length);

  const workDir = prepareSafeOutputDir(opts.outDir, repoRoot);
  const preparedPhotosDir = prepareSafeOutputDir(join(workDir, "photos"), repoRoot);
  const slotDirA = prepareSafeOutputDir(join(workDir, "reader-a"), repoRoot);
  const slotDirB = prepareSafeOutputDir(join(workDir, "reader-b"), repoRoot);

  const ctx: RunContext = {
    opts,
    readerA,
    readerB,
    repoRoot,
    workDir,
    preparedPhotosDir,
    slotDirA,
    slotDirB,
    manifest: loadManifest(join(preparedPhotosDir, PHOTOS_MANIFEST_FILE)),
    entriesA: loadRunEntries(slotDirA, readerA),
    entriesB: loadRunEntries(slotDirB, readerB),
    checked: loadCheckedPages(join(workDir, "final")),
  };
  // A work folder belongs to one source key. Old readings under another key would stay as they are.
  const foreign = [...ctx.entriesA, ...ctx.entriesB].find(
    (e) => typeof e.source_ref === "string" && !e.source_ref.startsWith(`${opts.source}:`),
  );
  if (foreign?.source_ref) {
    throw new Error(
      `The work folder holds readings with the source key "${foreign.source_ref.split(":")[0]}", not "${opts.source}". Use the same --source or a new --out folder.`,
    );
  }
  const metaA: ReaderMeta = { family: readerA, model: opts.modelA ?? "default" };
  const metaB: ReaderMeta = { family: readerB, model: opts.modelB ?? "default" };
  writeSafeOutputFile(join(slotDirA, "reader.json"), `${JSON.stringify(metaA, null, 2)}\n`, repoRoot);
  writeSafeOutputFile(join(slotDirB, "reader.json"), `${JSON.stringify(metaB, null, 2)}\n`, repoRoot);

  const scanned = await scanPhotoFolder({
    photosDir,
    names: allPhotoNames,
    selectedCount,
    allowSmall: opts.allowSmall ?? false,
    preparedPhotosDir,
    repoRoot,
  });

  // An empty or unreadable photos folder (a wrong --photos path) never deletes earlier work.
  const presentDigests = new Set(scanned.flatMap((p) => ("sha256" in p ? [p.sha256] : [])));
  let removedPhotos: RemovedPhotoReport[] = [];
  if (presentDigests.size > 0) {
    const pruned = pruneRemovedPhotos({ ...ctx, humanCheckedRefs: ctx.checked.refs, presentDigests });
    ctx.manifest = pruned.manifest;
    ctx.entriesA = pruned.entriesA;
    ctx.entriesB = pruned.entriesB;
    removedPhotos = pruned.removedPhotos;
    writeRunState(ctx, metaA, metaB);
  }

  const log = opts.onProgress ?? (() => {});
  let preparedCount = 0;
  for (let i = 0; i < selectedCount; i += 1) {
    const photo = scanned[i];
    const prefix = `[${i + 1}/${selectedCount}] ${photo.name}:`;
    if (photo.kind === "unreadable") {
      log(`${prefix} ${photo.reason}`);
    } else if (photo.kind === "too_small") {
      log(`${prefix} ${formatTooSmallReason(photo.width, photo.height)}`);
    } else if (photo.kind === "duplicate") {
      log(`${prefix} duplicate_photo (same as ${photo.duplicateOf}), not read`);
    } else {
      preparedCount += 1;
      const line = await readOnePhoto(ctx, photo, prefix);
      writeRunState(ctx, metaA, metaB);
      log(line);
    }
  }
  writeRunState(ctx, metaA, metaB);

  const duplicates: DuplicatePhotoReport[] = scanned.flatMap((p) =>
    p.kind === "duplicate"
      ? [{ original_name: p.name, duplicate_of: p.duplicateOf, photo_sha256: p.sha256 }]
      : [],
  );
  const prepareData: PrepareReportFile = {
    version: 1,
    too_small: scanned.flatMap((p) =>
      p.kind === "too_small" ? [{ original_name: p.name, width: p.width, height: p.height }] : [],
    ),
    unreadable: scanned.flatMap((p) =>
      p.kind === "unreadable" ? [{ original_name: p.name, reason: p.reason }] : [],
    ),
    duplicates,
    removed_photos: removedPhotos,
  };
  writeSafeOutputFile(
    join(workDir, PREPARE_REPORT_FILE),
    `${JSON.stringify(prepareData, null, 2)}\n`,
    repoRoot,
  );

  const report = compareWorkFolder({ workDir, repoRoot });
  const counts: ExtractCounts = {
    double_read: report.pages.filter((p) => p.status === "double_read").length,
    agreement_accepted: report.pages.filter((p) => p.status === "agreement_accepted").length,
    machine_read: report.pages.filter((p) => p.status === "machine_read").length,
    failed: report.could_not_read_photos.length,
    too_small: report.too_small_photos.length,
  };

  return {
    exitCode: preparedCount === 0 ? 1 : 0,
    preparedCount,
    counts,
    reportPath: join(workDir, "final", "report.md"),
    report,
  };
}
