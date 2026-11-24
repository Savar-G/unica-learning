import { readdir, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { deepEqualJson } from "@/lib/reference-record";
import { methodFileName, methodRef } from "./identity";
import { contentSha256, settleStatus } from "./record";
import type { MethodKey, TopicMethodRecord, TopicMethodStatus } from "./types";
import { checkAgainstRecords, checkPrivateFolders, loadLevelRecords, readMethodFile, stopped, type CommandResult } from "./workflow";

export interface TopicMethodRow extends MethodKey {
  record: TopicMethodRecord;
  status: TopicMethodStatus;
  digest: string;
}

export interface ExistingMethodRow {
  record: unknown;
  status: string;
  digest: string;
}

export interface TopicMethodStore {
  // By methodRef.
  findExisting(keys: MethodKey[]): Promise<Map<string, ExistingMethodRow>>;
  // False when a row of this topic is already there.
  insertRow(row: TopicMethodRow): Promise<boolean>;
  // Updates only a row that still has the expected digest and status. False when none matched.
  updateRow(row: TopicMethodRow, expected: { digest: string; status: string }): Promise<boolean>;
}

export interface ImportMethodsOptions {
  recordsDir: string;
  methodsDir: string;
  repoRoot: string;
  dryRun?: boolean;
  replace?: boolean;
  store: TopicMethodStore;
}

// The only place that makes a table row: its key, status and digest come from the record itself.
export function methodRowOf(record: TopicMethodRecord): TopicMethodRow {
  const settled = settleStatus(record);
  return {
    source: settled.source,
    level: settled.level,
    topic: settled.topic,
    record: settled,
    status: settled.status,
    digest: contentSha256(settled),
  };
}

async function readMethodsFolder(methodsDir: string): Promise<{ records: TopicMethodRecord[]; problems: string[] }> {
  const records: TopicMethodRecord[] = [];
  const problems: string[] = [];
  let dir: string;
  let names: string[];
  try {
    dir = await realpath(methodsDir);
    const entries = await readdir(dir, { withFileTypes: true });
    names = entries.filter((e) => !e.isDirectory() && e.name.endsWith(".json")).map((e) => e.name);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { records, problems: [`methods folder "${methodsDir}" could not be read: ${message}`] };
  }
  for (const name of names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
    const file = await readMethodFile(join(dir, name), name);
    if (file.kind === "ok") {
      const ref = methodRef(file.record);
      // Two files never hold one topic, because each topic has one file name.
      if (methodFileName(file.record) !== name) problems.push(`${name} is the file name of another record: "${ref}"`);
      else records.push(file.record);
    } else if (file.kind === "invalid") {
      problems.push(...file.problems);
    } else {
      problems.push(file.kind === "missing" ? `${name}: missing file` : file.problem);
    }
  }
  if (names.length === 0) problems.push(`no method record in "${methodsDir}"`);
  return { records, problems };
}

function sameRow(existing: ExistingMethodRow, row: TopicMethodRow): boolean {
  return existing.digest === row.digest && existing.status === row.status && deepEqualJson(existing.record, row.record);
}

export async function importTopicMethods(opts: ImportMethodsOptions): Promise<CommandResult> {
  const folderProblems = checkPrivateFolders(opts.repoRoot, opts.recordsDir, opts.methodsDir);
  if (folderProblems.length > 0) return stopped(...folderProblems);
  const loaded = await loadLevelRecords(opts.recordsDir);
  const { records, problems } = await readMethodsFolder(resolve(opts.methodsDir));
  if (!loaded.ok) problems.unshift(...loaded.problems);
  else for (const record of records) problems.push(...checkAgainstRecords(record, loaded.level));
  if (problems.length > 0) return stopped(...problems);

  const rows = records.map(methodRowOf);
  const counts = { inserted: 0, replaced: 0, skipped: 0, skippedDifferent: 0 };
  const notes = records.flatMap((record, i) =>
    record.status === rows[i].status
      ? []
      : [`status_in_file: ${methodRef(record)} says ${record.status}, but its approvals give ${rows[i].status}`],
  );
  const finish = (label: string, stopProblems: string[] = []): CommandResult => ({
    ok: stopProblems.length === 0,
    lines: [
      `${label}: records_read=${rows.length} inserted=${counts.inserted} replaced=${counts.replaced} skipped=${counts.skipped} skipped_different=${counts.skippedDifferent}`,
      ...notes,
    ],
    problems: stopProblems,
  });
  const keepStored = (ref: string, existing: ExistingMethodRow): void => {
    counts.skippedDifferent += 1;
    notes.push(`skipped_different: ${ref} (${existing.status === "approved" ? "the stored row is approved" : "the stored row differs"})`);
  };

  let ref = "";
  try {
    const existingRows = await opts.store.findExisting(rows);
    for (const row of rows) {
      ref = methodRef(row);
      const existing = existingRows.get(ref);
      if (!existing) {
        if (opts.dryRun || (await opts.store.insertRow(row))) {
          counts.inserted += 1;
          continue;
        }
        const other = (await opts.store.findExisting([row])).get(ref);
        if (other && sameRow(other, row)) counts.skipped += 1;
        else keepStored(ref, other ?? { record: null, status: "unknown", digest: "" });
      } else if (sameRow(existing, row)) {
        counts.skipped += 1;
      } else if (!opts.replace) {
        keepStored(ref, existing);
      } else {
        if (!opts.dryRun && !(await opts.store.updateRow(row, existing))) {
          return finish("Import stopped", [`${ref}: the stored row changed while the import ran; run the command again`]);
        }
        counts.replaced += 1;
        notes.push(`replaced: ${ref}`);
        if (existing.status === "approved" && row.status !== "approved") {
          notes.push(`status_lowered: ${ref} approved -> ${row.status}`);
        }
      }
    }
  } catch (err) {
    return finish("Import stopped", [
      `failed${ref ? ` at ${ref}` : ""}: ${err instanceof Error ? err.message : String(err)}`,
      "rows written before the failure stay; run the command again with the same files to finish",
    ]);
  }
  return finish(opts.dryRun ? "Dry run summary" : "Import summary");
}
