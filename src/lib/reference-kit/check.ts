import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  assertOutsideRepo,
  prepareSafeOutputDir,
  renderRecordToMarkdown,
  validateReferenceRecord,
  writeSafeOutputFile,
} from "@/lib/reference-record";
import { applyComputedAnswers, fileSlugFromRef } from "./answers";
import type { PageStatus } from "./compare";

export interface CheckPageResult {
  sourceRef: string;
  recordPath: string;
  viewPath: string;
  statusPath: string;
  notes: string[];
}

export function checkAndMarkPage(opts: {
  workDir: string;
  page: string;
  repoRoot: string;
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

  const finalDir = join(workDir, "final");
  const statusPath = join(finalDir, "status.json");
  if (!existsSync(statusPath)) {
    throw new Error(`Missing status.json in ${finalDir}. Run reference:compare first.`);
  }
  const statusMap = JSON.parse(readFileSync(statusPath, "utf8")) as Record<string, PageStatus>;
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
    parsed = JSON.parse(readFileSync(recordPath, "utf8")) as unknown;
  } catch (err) {
    throw new Error(
      `Invalid JSON in ${recordPath}: ${err instanceof Error ? err.message : String(err)}`,
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

  const { record: recomputed, notes } = applyComputedAnswers(check.record);
  const recheck = validateReferenceRecord(recomputed);
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
