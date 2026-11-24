import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { deepEqualJson } from "@/lib/reference-record";
import { checkFolders, loadLevelRecords, messageOf, readMethodFile, stopped, type CommandResult, type Folders } from "./files";
import { methodFileName, methodRef } from "./identity";
import { contentSha256, settleStatus } from "./record";
import type { MethodKey, TopicMethodRecord, TopicMethodStatus } from "./types";
import { checkAgainstRecords } from "./workflow";

export interface TopicMethodRow extends MethodKey {
  record: TopicMethodRecord;
  status: TopicMethodStatus;
  digest: string;
}

export interface ExistingMethodRow {
  record: unknown;
  status: string;
  digest: string;
  // The revision of the row: every update changes it, also when only the approvals change.
  updated_at: string;
}

export interface TopicMethodStore {
  // By methodRef.
  findExisting(keys: MethodKey[]): Promise<Map<string, ExistingMethodRow>>;
  // False when a row of this topic is already there.
  insertRow(row: TopicMethodRow): Promise<boolean>;
  // Updates only a row that still has this updated_at. False when none matched.
  updateRow(row: TopicMethodRow, updatedAt: string): Promise<boolean>;
}

export interface ImportMethodsOptions extends Folders {
  methodsDir: string;
  dryRun?: boolean;
  replace?: boolean;
  store: TopicMethodStore;
  // Prints a line at once, before the first write.
  announce: (line: string) => void;
}

// The only place that makes a table row: its key, status and digest come from the record itself.
export function methodRowOf(record: TopicMethodRecord): TopicMethodRow {
  const settled = settleStatus(record);
  const { source, level, topic, status } = settled;
  return { source, level, topic, record: settled, status, digest: contentSha256(settled) };
}

async function readMethodsFolder(methodsDir: string): Promise<{ records: TopicMethodRecord[]; problems: string[] }> {
  const records: TopicMethodRecord[] = [];
  const problems: string[] = [];
  const dir = resolve(methodsDir);
  let names: string[];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    names = entries.filter((e) => !e.isDirectory() && e.name.endsWith(".json")).map((e) => e.name);
  } catch (err) {
    return { records, problems: [`methods folder "${methodsDir}" could not be read: ${messageOf(err)}`] };
  }
  for (const name of names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
    const { record, problems: fileProblems } = await readMethodFile(join(dir, name), name);
    problems.push(...fileProblems);
    // Two files never hold one topic, because each topic has one file name.
    if (record && methodFileName(record) === name) records.push(record);
    else if (record) problems.push(`${name} is the file name of another record: "${methodRef(record)}"`);
  }
  if (names.length === 0) problems.push(`no method record in "${methodsDir}"`);
  return { records, problems };
}

// Every input of the import, checked.
async function readInputs(opts: ImportMethodsOptions): Promise<{ records: TopicMethodRecord[]; problems: string[] }> {
  const loaded = await loadLevelRecords(opts.recordsDir);
  const { records, problems } = await readMethodsFolder(opts.methodsDir);
  if (!loaded.ok) return { records, problems: [...loaded.problems, ...problems] };
  for (const record of records) {
    const checked = checkAgainstRecords(record, loaded.level);
    if (!checked.ok) problems.push(...checked.problems.map((p) => `${methodRef(record)}: ${p}`));
  }
  return { records, problems };
}

function sameRow(existing: ExistingMethodRow, row: TopicMethodRow): boolean {
  return existing.digest === row.digest && existing.status === row.status && deepEqualJson(existing.record, row.record);
}

// What the table holds after a write whose result is not known.
async function reread(store: TopicMethodStore, row: TopicMethodRow, before: ExistingMethodRow | undefined) {
  try {
    const now = (await store.findExisting([row])).get(methodRef(row));
    if (now && sameRow(now, row)) return { written: true, text: "the row is written" };
    const same = now?.updated_at === before?.updated_at;
    return { written: false, text: same ? "the row is not written" : "another run changed the row" };
  } catch (err) {
    return { written: false, text: `the row may or may not be written (it could not be read again: ${messageOf(err)})` };
  }
}

export async function importTopicMethods(opts: ImportMethodsOptions): Promise<CommandResult> {
  const folderProblems = checkFolders(opts);
  if (folderProblems.length > 0) return stopped(...folderProblems);
  const { records, problems } = await readInputs(opts);
  if (problems.length > 0) return stopped(...problems);

  const { store } = opts;
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
  const halt = (...stopProblems: string[]): CommandResult => finish("Import stopped", stopProblems);
  const skip = (row: TopicMethodRow, stored: ExistingMethodRow): void => {
    if (sameRow(stored, row)) counts.skipped += 1;
    else {
      counts.skippedDifferent += 1;
      notes.push(`skipped_different: ${methodRef(row)} (the stored row ${stored.status === "approved" ? "is approved" : "differs"})`);
    }
  };

  let existing: Map<string, ExistingMethodRow>;
  try {
    existing = await store.findExisting(rows);
  } catch (err) {
    return halt(`the stored rows could not be read: ${messageOf(err)}. Nothing was written`);
  }
  const planned: Array<{ row: TopicMethodRow; before?: ExistingMethodRow }> = [];
  for (const row of rows) {
    const before = existing.get(methodRef(row));
    if (before && (sameRow(before, row) || !opts.replace)) skip(row, before);
    else planned.push({ row, before });
  }
  if (planned.length > 0 && !opts.dryRun) {
    const again = await readInputs(opts);
    if (again.problems.length > 0 || !deepEqualJson(again.records, records)) {
      return halt("the input files changed while the import ran. Nothing was written. Run it again", ...again.problems);
    }
  }
  for (const { row, before } of planned) {
    if (before?.status === "approved" && row.status !== "approved") {
      opts.announce(`status_lowered: ${methodRef(row)} approved -> ${row.status}${opts.dryRun ? "" : " (the import replaces this row now)"}`);
    }
  }

  for (const { row, before } of planned) {
    const ref = methodRef(row);
    const done = (): void => {
      if (!before) counts.inserted += 1;
      else {
        counts.replaced += 1;
        notes.push(`replaced: ${ref}`);
      }
    };
    try {
      if (opts.dryRun || (await (before ? store.updateRow(row, before.updated_at) : store.insertRow(row)))) {
        done();
        continue;
      }
      const now = before ? undefined : (await store.findExisting([row])).get(ref);
      if (!now) return halt(`${ref}: the stored row changed while the import ran; run the command again`);
      skip(row, now);
    } catch (err) {
      const after = await reread(store, row, before);
      if (after.written) done();
      return halt(
        `write failed at ${ref}: ${messageOf(err)}; ${after.text}`,
        "rows written before the failure stay; run the command again with the same files to finish",
      );
    }
  }
  return finish(opts.dryRun ? "Dry run summary" : "Import summary");
}
