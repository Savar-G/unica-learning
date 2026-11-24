import { randomBytes } from "node:crypto";
import { closeSync, constants, lstatSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileSlugFromRef } from "@/lib/reference-kit/answers";
import {
  assertOutsideRepo,
  isPathInsideDir,
  loadReferenceRecords,
  prepareSafeOutputDir,
  writeSafeOutputFile,
  type ReferenceRecord,
  type TranscriptStatus,
} from "@/lib/reference-record";
import { parseImportJson, readRegularFileNoFollow } from "@/lib/reference-record/import-photos";
import { formatErrors } from "./draft";
import { methodFileName } from "./identity";
import { parseMethodRecord } from "./record";
import type { MethodKey, TopicMethodRecord } from "./types";

export interface CommandResult {
  ok: boolean;
  lines: string[];
  problems: string[];
}

export function stopped(...problems: string[]): CommandResult {
  return { ok: false, lines: [], problems };
}

export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface Folders {
  repoRoot: string;
  recordsDir: string;
  methodsDir?: string;
}

function symlinkIn(path: string): string | null {
  for (let at = resolve(path); ; at = dirname(at)) {
    if (lstatSync(at, { throwIfNoEntry: false })?.isSymbolicLink()) return at;
    if (dirname(at) === at) return null;
  }
}

// Private folders only, and one folder for the input and another for the output. Every command checks
// this before it reads or writes anything.
export function checkFolders({ repoRoot, recordsDir, methodsDir }: Folders): string[] {
  const problems: string[] = [];
  for (const [option, dir] of [["--records", recordsDir], ["--methods", methodsDir]]) {
    if (dir === undefined) continue;
    const link = option === "--methods" ? symlinkIn(dir) : null;
    if (link) {
      problems.push(`Refusing ${option} ${dir}: ${link} is a symlink. Give the real path`);
      continue;
    }
    try {
      assertOutsideRepo(resolve(dir), repoRoot);
    } catch {
      problems.push(`Refusing ${option} ${dir}: it must be a private folder outside every git checkout`);
    }
  }
  if (problems.length === 0 && methodsDir !== undefined) {
    if (isPathInsideDir(methodsDir, recordsDir) || isPathInsideDir(recordsDir, methodsDir)) {
      problems.push("Refusing --methods: it must not be the --records folder, inside it or around it");
    }
  }
  return problems;
}

export interface LevelRecords {
  records: ReferenceRecord[];
  statusByRef: Map<string, TranscriptStatus>;
}

// The final folder of the kit, where the file name of a record is made from its source_ref.
export async function loadLevelRecords(
  recordsDir: string,
): Promise<{ ok: true; level: LevelRecords } | { ok: false; problems: string[] }> {
  const { records, statusByRef, fileByRef, problems } = await loadReferenceRecords(recordsDir);
  for (const [ref, file] of fileByRef) {
    const expected = `${fileSlugFromRef(ref)}.json`;
    if (file !== expected) problems.push(`${file} holds "${ref}", which belongs in ${expected}`);
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, level: { records, statusByRef } };
}

// No bytes: no file, or with problems a file that cannot be read. No record: the bytes are not a valid one.
export interface MethodFile {
  bytes: Uint8Array | null;
  record: TopicMethodRecord | null;
  problems: string[];
}

export async function readMethodFile(path: string, name: string): Promise<MethodFile> {
  const read = await readRegularFileNoFollow(path);
  if (!read.ok) return { bytes: null, record: null, problems: read.kind === "missing" ? [] : [`${name}: ${read.message}`] };
  const { bytes } = read;
  const problems: string[] = [];
  const json = parseImportJson(name, bytes, problems);
  if (!json.ok) return { bytes, record: null, problems };
  const parsed = parseMethodRecord(json.value);
  return parsed.ok
    ? { bytes, record: parsed.record, problems }
    : { bytes, record: null, problems: formatErrors(parsed.errors).map((e) => `${name}: ${e}`) };
}

// Writes the record only when the file is still what the command read at its start. Call it under the lock.
export async function writeMethodFile(
  path: string,
  name: string,
  before: MethodFile,
  record: TopicMethodRecord,
  repoRoot: string,
): Promise<string | null> {
  const { bytes } = await readMethodFile(path, name);
  const same = bytes && before.bytes ? Buffer.compare(bytes, before.bytes) === 0 : bytes === before.bytes;
  if (!same) {
    return `${name} changed while the command ran. Nothing was written. Run it again`;
  }
  try {
    writeSafeOutputFile(path, `${JSON.stringify(record, null, 2)}\n`, repoRoot);
    return null;
  } catch (err) {
    return messageOf(err);
  }
}

// Runs a command that writes the record of one topic, while no other command does. The lock is a file
// beside the record. A process that is killed leaves it, so a person removes it by hand.
export async function withTopicLock(
  opts: { key: MethodKey; methodsDir: string; repoRoot: string; now: () => Date },
  command: string,
  run: () => Promise<CommandResult>,
): Promise<CommandResult> {
  const path = join(resolve(opts.methodsDir), `.${methodFileName(opts.key)}.lock`);
  const content = `${opts.now().toISOString()} ${command} (process ${process.pid}, ${randomBytes(8).toString("hex")})`;
  try {
    prepareSafeOutputDir(opts.methodsDir, opts.repoRoot);
    const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    try {
      writeFileSync(fd, content);
    } catch (err) {
      // This command made the lock and cannot hold it.
      rmSync(path, { force: true });
      throw err;
    } finally {
      closeSync(fd);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") return stopped(messageOf(err));
    return stopped(
      `another command holds this topic: ${heldBy(path)}. Run this command again when it ends. If that process does not run any more, remove the lock: rm "${path}"`,
    );
  }
  const release = (): void => {
    // Not the lock of a command that started after a person removed this one.
    if (heldBy(path) === content) rmSync(path, { force: true });
  };
  process.once("exit", release);
  try {
    return await run();
  } finally {
    process.off("exit", release);
    release();
  }
}

function heldBy(path: string): string {
  try {
    return readFileSync(path, "utf8") || `a lock of ${statSync(path).mtime.toISOString()}`;
  } catch {
    return "a lock that cannot be read";
  }
}
