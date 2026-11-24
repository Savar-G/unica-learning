import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  assertOutsideRepo,
  parseStrictUtf8Json,
  prepareSafeOutputDir,
  renderRecordToMarkdown,
  validateReferenceRecord,
  writeSafeOutputFile,
} from "@/lib/reference-record";
import { applyComputedAnswers, fileSlugFromRef, findEmptyAnswers } from "./answers";
import type { PageStatus } from "./compare";
import { parsePhotosManifest, PHOTOS_MANIFEST_FILE } from "./prepare";

export interface CheckPageResult {
  sourceRef: string;
  recordPath: string;
  viewPath: string;
  statusPath: string;
  notes: string[];
}

// The photo of a page: the photos manifest names it; an older work folder may name it only in the
// report. Without either, the photos folder is named.
function describePagePhoto(workDir: string, page: string): string {
  const photosDir = join(workDir, "photos");
  try {
    const manifest = parsePhotosManifest(
      parseStrictUtf8Json(readFileSync(join(photosDir, PHOTOS_MANIFEST_FILE))),
    );
    const entry = manifest.photos.find((p) => p.source_ref === page);
    if (entry) return `${join(photosDir, entry.file)} (original name ${entry.original_name})`;
  } catch {
    // No readable manifest: try the report.
  }
  try {
    const report = parseStrictUtf8Json(readFileSync(join(workDir, "final", "report.json"))) as {
      pages?: Array<{ source_ref?: unknown; photo?: unknown; original_name?: unknown }>;
    };
    const entry = report.pages?.find((p) => p.source_ref === page);
    if (entry && typeof entry.photo === "string") {
      const original = typeof entry.original_name === "string" ? ` (original name ${entry.original_name})` : "";
      return `${join(photosDir, entry.photo)}${original}`;
    }
  } catch {
    // No readable report: name the folder.
  }
  return `the photo of this page in ${photosDir}`;
}

export function checkAndMarkPage(opts: {
  workDir: string;
  page: string;
  repoRoot: string;
  // A person compared the final record with the photo of the page.
  photoCompared: boolean;
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
  if (!existsSync(statusPath)) {
    throw new Error(`Missing status.json in ${finalDir}. Run reference:compare first.`);
  }
  const statusMap = parseStrictUtf8Json(readFileSync(statusPath)) as Record<string, PageStatus>;
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
  if (!existsSync(recordPath)) {
    throw new Error(`Final record not found for "${page}" at ${recordPath}`);
  }

  let parsed: unknown;
  try {
    parsed = parseStrictUtf8Json(readFileSync(recordPath));
  } catch (err) {
    const kind = err instanceof SyntaxError ? "Invalid JSON" : "Invalid UTF-8";
    throw new Error(
      `${kind} in ${recordPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

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

  const safeFinalDir = prepareSafeOutputDir(finalDir, repoRoot);
  const safeViewDir = prepareSafeOutputDir(join(workDir, "final-view"), repoRoot);

  const finalRecordPath = join(safeFinalDir, `${slug}.json`);
  writeSafeOutputFile(finalRecordPath, `${JSON.stringify(recheck.record, null, 2)}\n`, repoRoot);

  const safeStatusPath = join(safeFinalDir, "status.json");
  statusMap[page] = "human_checked";
  writeSafeOutputFile(safeStatusPath, `${JSON.stringify(statusMap, null, 2)}\n`, repoRoot);

  const viewPath = join(safeViewDir, `${slug}.md`);
  writeSafeOutputFile(viewPath, `${renderRecordToMarkdown(recheck.record)}\n`, repoRoot);

  return {
    sourceRef: page,
    recordPath: finalRecordPath,
    viewPath,
    statusPath: safeStatusPath,
    notes,
  };
}
