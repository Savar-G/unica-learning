import { lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  assertOutsideRepo,
  assertSafeOutputFile,
  CHECKED_DIGESTS_FILE,
  parseStrictUtf8Json,
  prepareSafeOutputDir,
  readCheckedDigests,
  readRegularFileIfExists,
  renderRecordToMarkdown,
  sha256Hex,
  validateReferenceRecord,
  writeCheckedDigests,
  writeSafeOutputFile,
} from "@/lib/reference-record";
import { isPlainObject } from "@/lib/reference-record/import-photos";
import { applyComputedAnswers, fileSlugFromRef, findEmptyAnswers } from "./answers";
import type { PageStatus } from "./compare";
import { parsePhotosManifest, PHOTOS_MANIFEST_FILE } from "./prepare";

export interface CheckPageResult {
  sourceRef: string;
  recordPath: string;
  viewPath: string;
  photoPath: string;
  statusPath: string;
  notes: string[];
}

// No file of a check is read or written through a link: the bytes of the record and the photo that
// the person compared must be the bytes of this work folder.
function assertPlainFolders(workDir: string): void {
  for (const name of ["final", "final-view", "photos"]) {
    const path = join(workDir, name);
    let isFolder: boolean;
    try {
      isFolder = lstatSync(path).isDirectory();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    if (!isFolder) throw new Error(`${path} is not a plain folder. Nothing was written.`);
  }
}

// Undefined only when no file is there.
function readStrictJsonIfExists(filePath: string): unknown {
  const bytes = readRegularFileIfExists(filePath);
  return bytes === null ? undefined : parseStrictJsonBytes(filePath, bytes);
}

function parseStrictJsonBytes(filePath: string, bytes: Uint8Array): unknown {
  try {
    return parseStrictUtf8Json(bytes);
  } catch (err) {
    const kind = err instanceof SyntaxError ? "Invalid JSON" : "Invalid UTF-8";
    throw new Error(
      `${kind} in ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// The photo of a page: the photos manifest names it; an older work folder may name it only in the
// report. Without either, the photos folder is named.
function describePagePhoto(workDir: string, page: string): string {
  const photosDir = join(workDir, "photos");
  const manifestPath = join(photosDir, PHOTOS_MANIFEST_FILE);
  const rawManifest = readStrictJsonIfExists(manifestPath);
  if (rawManifest !== undefined) {
    try {
      const manifest = parsePhotosManifest(rawManifest);
      const entry = manifest.photos.find((p) => p.source_ref === page);
      if (entry) return `${join(photosDir, entry.file)} (original name ${entry.original_name})`;
    } catch {
      // Unrecognized manifest shape: try the report.
    }
  }
  const rawReport = readStrictJsonIfExists(join(workDir, "final", "report.json"));
  const pages = isPlainObject(rawReport) ? rawReport.pages : undefined;
  const entry = Array.isArray(pages)
    ? pages.find((p): p is Record<string, unknown> => isPlainObject(p) && p.source_ref === page)
    : undefined;
  if (entry && typeof entry.photo === "string" && entry.photo.trim().length > 0) {
    const original =
      typeof entry.original_name === "string" && entry.original_name.trim().length > 0
        ? ` (original name ${entry.original_name})`
        : "";
    return `${join(photosDir, entry.photo)}${original}`;
  }
  return `the photo of this page in ${photosDir}`;
}

// The prepared photo that the check ties to the page: the one photo that the photo list names for
// it, which is also the photo that import sends with the record.
function readPagePhoto(workDir: string, page: string): { path: string; sha256: string } {
  const photosDir = join(workDir, "photos");
  const manifestPath = join(photosDir, PHOTOS_MANIFEST_FILE);
  const manifestBytes = readRegularFileIfExists(manifestPath);
  if (manifestBytes === null) {
    throw new Error(`Missing ${manifestPath}. Run reference:extract first. Nothing was written.`);
  }
  let manifest;
  try {
    manifest = parsePhotosManifest(parseStrictJsonBytes(manifestPath, manifestBytes));
  } catch (err) {
    throw new Error(`${manifestPath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const entries = manifest.photos.filter((p) => p.source_ref === page);
  if (entries.length !== 1) {
    throw new Error(
      `${manifestPath} names ${entries.length === 0 ? "no photo" : "more than one photo"} for ${page}. Put the photo of the page in the photos folder and run reference:extract. Nothing was written.`,
    );
  }
  const path = join(photosDir, entries[0].file);
  const bytes = readRegularFileIfExists(path);
  if (bytes === null) {
    throw new Error(
      `The photo ${path} of ${page} is missing. Put it in the photos folder and run reference:extract. Nothing was written.`,
    );
  }
  const sha256 = sha256Hex(bytes);
  if (sha256 !== entries[0].sha256) {
    throw new Error(
      `The photo ${path} of ${page} does not match the photo list. Run reference:extract again. Nothing was written.`,
    );
  }
  return { path, sha256 };
}

export function checkAndMarkPage(opts: {
  workDir: string;
  page: string;
  repoRoot: string;
  // A person compared the final record with the photo of the page.
  photoCompared: boolean;
  // Test seam: runs after the record and the photo are read and before the last look at them.
  beforeWrite?: () => void;
}): CheckPageResult {
  const page = opts.page.trim();
  if (!page || page.toLowerCase() === "all") {
    throw new Error(
      '--page all is not supported. Name each page individually (for example --page sample:M:3a).',
    );
  }

  const repoRoot = resolve(opts.repoRoot);
  const workDir = resolve(opts.workDir);
  assertOutsideRepo(workDir, repoRoot);
  assertPlainFolders(workDir);

  if (opts.photoCompared !== true) {
    throw new Error(
      [
        `A person must compare the record of ${page} with the photo first.`,
        `Photo: ${describePagePhoto(workDir, page)}`,
        `Record: ${join(workDir, "final", `${fileSlugFromRef(page)}.json`)}`,
        "After the comparison, run the command again with --photo-compared:",
        `  npm run reference:check -- --work ${opts.workDir} --page ${page} --photo-compared`,
      ].join("\n"),
    );
  }

  const finalDir = join(workDir, "final");
  const statusPath = join(finalDir, "status.json");
  const rawStatus = readStrictJsonIfExists(statusPath);
  if (rawStatus === undefined) {
    throw new Error(`Missing status.json in ${finalDir}. Run reference:compare first.`);
  }
  if (!isPlainObject(rawStatus)) {
    throw new Error(`Invalid status map in ${statusPath}: expected a JSON object`);
  }
  const statusMap = rawStatus as Record<string, PageStatus>;
  if (!Object.prototype.hasOwnProperty.call(statusMap, page)) {
    throw new Error(`Page "${page}" is not listed in ${statusPath}. Run reference:compare first.`);
  }

  const slug = fileSlugFromRef(page);
  const fileToRef = new Map<string, string>();
  for (const existingRef of Object.keys(statusMap)) {
    const fileName = `${fileSlugFromRef(existingRef)}.json`;
    const prior = fileToRef.get(fileName);
    if (prior && prior !== existingRef) {
      throw new Error(
        `Refusing to write: "${existingRef}" and "${prior}" both map to "${fileName}"`,
      );
    }
    fileToRef.set(fileName, existingRef);
  }

  const recordPath = join(finalDir, `${slug}.json`);
  const recordBytes = readRegularFileIfExists(recordPath);
  if (recordBytes === null) {
    throw new Error(`Final record not found for "${page}" at ${recordPath}`);
  }
  const parsed = parseStrictJsonBytes(recordPath, recordBytes);

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    !Array.isArray(parsed) &&
    typeof (parsed as Record<string, unknown>).source_ref === "string" &&
    (parsed as Record<string, unknown>).source_ref !== page
  ) {
    throw new Error(
      `Refusing to overwrite "${slug}.json": stored source_ref "${String((parsed as Record<string, unknown>).source_ref)}" does not match --page "${page}"`,
    );
  }

  const check = validateReferenceRecord(parsed);
  if (!check.ok) {
    const details = check.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
    throw new Error(`Validation failed for ${page}:\n${details}`);
  }
  if (check.record.source_ref !== page) {
    throw new Error(
      `Record source_ref "${check.record.source_ref}" does not match --page "${page}"`,
    );
  }

  const { record: recomputed, notes, details } = applyComputedAnswers(check.record);
  // A check never replaces a stored answer: a person may have corrected the answer and not the
  // expression. Answers that do not fit the answer places are kept as they are.
  const conflicts = details.filter((d) => d.kind === "answer_differs");
  const emptyAnswers = findEmptyAnswers(recomputed);
  if (conflicts.length > 0 || emptyAnswers.length > 0) {
    const lines = [`Not marked: ${page} has answers to correct. Nothing was written.`];
    if (conflicts.length > 0) {
      lines.push("Stored answers that the code does not compute the same way:");
      for (const c of conflicts) lines.push(`  ${c.message}`);
      lines.push(
        "Correct the expression so that it gives the right answer, or correct the answer.",
      );
    }
    if (emptyAnswers.length > 0) {
      lines.push("Answer places with no answer:");
      for (const path of emptyAnswers) lines.push(`  ${path}`);
      lines.push('Write the answer from the photo, or write "unclear".');
    }
    throw new Error(lines.join("\n"));
  }
  const checkedRecord = { ...recomputed };
  delete checkedRecord.single_read;
  const recheck = validateReferenceRecord(checkedRecord);
  if (!recheck.ok) {
    const details = recheck.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
    throw new Error(`Validation failed after recomputing answers for ${page}:\n${details}`);
  }

  const viewText = `${renderRecordToMarkdown(recheck.record)}\n`;
  const photo = readPagePhoto(workDir, page);

  opts.beforeWrite?.();
  if (!readRegularFileIfExists(recordPath)?.equals(recordBytes)) {
    throw new Error(
      `The record ${recordPath} changed while the check ran. Compare it with the photo again. Nothing was written.`,
    );
  }
  const photoNow = readPagePhoto(workDir, page);
  if (photoNow.path !== photo.path || photoNow.sha256 !== photo.sha256) {
    throw new Error(
      `The photo of ${page} changed while the check ran. Compare the record with it again. Nothing was written.`,
    );
  }
  const digests = readCheckedDigests(finalDir);
  // A report that is a link or no plain file stops the check too, like each file that it reads.
  readRegularFileIfExists(join(finalDir, "report.json"));
  // Each destination is looked at before the first write.
  for (const path of [
    recordPath,
    join(workDir, "final-view", `${slug}.md`),
    join(finalDir, CHECKED_DIGESTS_FILE),
    statusPath,
  ]) {
    assertSafeOutputFile(path, repoRoot);
  }

  const safeFinalDir = prepareSafeOutputDir(finalDir, repoRoot);
  const safeViewDir = prepareSafeOutputDir(join(workDir, "final-view"), repoRoot);

  const finalRecordPath = join(safeFinalDir, `${slug}.json`);
  const recordOut = Buffer.from(`${JSON.stringify(recheck.record, null, 2)}\n`, "utf8");
  writeSafeOutputFile(finalRecordPath, recordOut, repoRoot);

  // The digests come before the status: a stop between the two leaves a page that is not checked.
  digests.pages.set(page, { record_sha256: sha256Hex(recordOut), photo_sha256: photo.sha256 });
  digests.checkedBefore.delete(page);
  writeCheckedDigests(safeFinalDir, digests, repoRoot);

  const safeStatusPath = join(safeFinalDir, "status.json");
  statusMap[page] = "human_checked";
  writeSafeOutputFile(safeStatusPath, `${JSON.stringify(statusMap, null, 2)}\n`, repoRoot);

  const viewPath = join(safeViewDir, `${slug}.md`);
  writeSafeOutputFile(viewPath, viewText, repoRoot);

  return {
    sourceRef: page,
    recordPath: finalRecordPath,
    viewPath,
    photoPath: photo.path,
    statusPath: safeStatusPath,
    notes,
  };
}
