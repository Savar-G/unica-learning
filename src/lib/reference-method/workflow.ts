import { join, resolve } from "node:path";
import type { RunCli } from "@/lib/reference-kit/read-cli";
import {
  assertOutsideRepo,
  deepEqualJson,
  findUnstorableTextPath,
  loadReferenceRecords,
  NOT_STATED,
  prepareSafeOutputDir,
  writeSafeOutputFile,
  type ReferenceRecord,
  type TranscriptStatus,
} from "@/lib/reference-record";
import { parseImportJson, readRegularFileNoFollow } from "@/lib/reference-record/import-photos";
import { draftSummary, formatErrors } from "./draft";
import { buildEvidence, type BuiltEvidence } from "./evidence";
import { contentsRefOf, methodFileName, methodRef } from "./identity";
import {
  cleanApproverName,
  contentSha256,
  isEditedByPerson,
  parseMethodRecord,
  settleStatus,
  summarySha256,
} from "./record";
import { checkSummary } from "./summary";
import type { MethodKey, MethodSentence, TopicEvidence, TopicMethodRecord } from "./types";

export interface CommandResult {
  ok: boolean;
  lines: string[];
  problems: string[];
}

export function stopped(...problems: string[]): CommandResult {
  return { ok: false, lines: [], problems };
}

export interface LevelRecords {
  records: ReferenceRecord[];
  statusByRef: Map<string, TranscriptStatus>;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Private folders only: each command checks every folder before it reads or writes anything.
export function checkPrivateFolders(repoRoot: string, ...dirs: string[]): string[] {
  return dirs.flatMap((dir) => {
    try {
      assertOutsideRepo(resolve(dir), repoRoot);
      return [];
    } catch (err) {
      return [messageOf(err)];
    }
  });
}

export async function loadLevelRecords(
  recordsDir: string,
): Promise<{ ok: true; level: LevelRecords } | { ok: false; problems: string[] }> {
  const { records, statusByRef, problems } = await loadReferenceRecords(recordsDir);
  return problems.length > 0 ? { ok: false, problems } : { ok: true, level: { records, statusByRef } };
}

type MethodFile =
  | { kind: "missing" }
  | { kind: "unreadable"; problem: string }
  // Bytes that are not a valid method record.
  | { kind: "invalid"; bytes: Uint8Array; problems: string[] }
  | { kind: "ok"; bytes: Uint8Array; record: TopicMethodRecord };

export async function readMethodFile(path: string, name: string): Promise<MethodFile> {
  const read = await readRegularFileNoFollow(path);
  if (!read.ok) {
    return read.kind === "missing" ? { kind: "missing" } : { kind: "unreadable", problem: `${name}: ${read.message}` };
  }
  const problems: string[] = [];
  const json = parseImportJson(name, read.bytes, problems);
  if (!json.ok) return { kind: "invalid", bytes: read.bytes, problems };
  const parsed = parseMethodRecord(json.value);
  if (!parsed.ok) {
    return { kind: "invalid", bytes: read.bytes, problems: formatErrors(parsed.errors).map((e) => `${name}: ${e}`) };
  }
  return { kind: "ok", bytes: read.bytes, record: parsed.record };
}

function evidenceOf(key: MethodKey, level: LevelRecords, includeMachineRead: boolean): BuiltEvidence {
  return buildEvidence({ key, ...level, includeMachineRead });
}

// What is different between the facts in a record and the facts that code computes now.
function evidenceChanges(stored: TopicEvidence, current: TopicEvidence): string[] {
  const listOf = (e: TopicEvidence): Map<string, unknown> =>
    new Map([...(Array.isArray(e.pages) ? e.pages : []), e.contents].map((p) => [p?.ref, p]));
  const before = listOf(stored);
  const after = listOf(current);
  const changes: string[] = [];
  for (const [ref, page] of after) {
    if (!before.has(ref)) changes.push(`page record ${ref} was added`);
    else if (!deepEqualJson(before.get(ref), page)) changes.push(`page record ${ref} changed`);
  }
  for (const ref of before.keys()) if (!after.has(ref)) changes.push(`page record ${ref} was removed`);
  return changes.length > 0 ? changes : ["its facts are not what code computes from the page records"];
}

// The problems of a record against the page records: facts that are out of date or changed by hand, and
// sentences that break a rule.
export function checkAgainstRecords(record: TopicMethodRecord, level: LevelRecords): string[] {
  const ref = methodRef(record);
  const built = evidenceOf(record, level, record.evidence.include_machine_read);
  if (!built.ok) return built.problems.map((p) => `${ref}: ${p}`);
  if (!deepEqualJson(record.evidence, built.evidence)) {
    return evidenceChanges(record.evidence, built.evidence).map(
      (change) => `${ref}: ${change}. It is drafted again: run draft with --keep-summary (or --replace)`,
    );
  }
  const check = checkSummary(record.summary, { topic: record.topic, evidence: built.evidence, views: built.views });
  return check.ok ? [] : formatErrors(check.errors).map((e) => `${ref}: ${e}`);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return Buffer.compare(a, b) === 0;
}

// Writes the record only when the file is still what the command read at its start.
async function writeMethodFile(
  path: string,
  name: string,
  before: MethodFile,
  record: TopicMethodRecord,
  repoRoot: string,
): Promise<string | null> {
  const current = await readMethodFile(path, name);
  const beforeBytes = "bytes" in before ? before.bytes : null;
  const currentBytes = "bytes" in current ? current.bytes : null;
  const same =
    beforeBytes && currentBytes ? sameBytes(beforeBytes, currentBytes) : before.kind === "missing" && current.kind === "missing";
  if (!same) return `${name} changed while the command ran. Nothing was written. Run it again`;
  try {
    prepareSafeOutputDir(resolve(path, ".."), repoRoot);
    writeSafeOutputFile(path, `${JSON.stringify(record, null, 2)}\n`, repoRoot);
    return null;
  } catch (err) {
    return messageOf(err);
  }
}

export interface DraftOptions {
  key: MethodKey;
  recordsDir: string;
  methodsDir: string;
  repoRoot: string;
  includeMachineRead?: boolean;
  // Compute the facts again and keep the summary. No model runs.
  keepSummary?: boolean;
  // Write over a summary that a person changed or approved.
  replace?: boolean;
  model?: string;
  runCli?: RunCli;
}

// Why a draft may not write over the file, or null.
function keptWork(file: MethodFile): string | null {
  if (file.kind === "invalid") return `it is not a valid method record (${file.problems[0]})`;
  if (file.kind !== "ok") return null;
  if (isEditedByPerson(file.record)) return "its summary was changed by a person";
  const { approvals } = settleStatus(file.record);
  return approvals.length > 0 ? `it is approved by ${approvals.map((a) => a.by).join(" and ")}` : null;
}

export async function draftTopicMethod(opts: DraftOptions): Promise<CommandResult> {
  const { key, repoRoot } = opts;
  if (opts.keepSummary && opts.replace) return stopped("use --keep-summary or --replace, not the two together");
  const folderProblems = checkPrivateFolders(repoRoot, opts.recordsDir, opts.methodsDir);
  if (folderProblems.length > 0) return stopped(...folderProblems);

  const name = methodFileName(key);
  const path = join(resolve(opts.methodsDir), name);
  const file = await readMethodFile(path, name);
  if (file.kind === "unreadable") return stopped(file.problem);
  if (file.kind === "ok" && methodRef(file.record) !== methodRef(key)) {
    return stopped(`${name} holds "${methodRef(file.record)}", not "${methodRef(key)}". Move it away first`);
  }
  if (opts.keepSummary && file.kind === "missing") return stopped(`${name}: there is no method record to keep`);
  if (opts.keepSummary && file.kind === "invalid") return stopped(...file.problems);
  const kept = opts.replace || opts.keepSummary ? null : keptWork(file);
  if (kept) {
    return stopped(
      `${name}: ${kept}. Nothing was written. Use --keep-summary to compute only the facts again, or --replace to write a new draft over it`,
    );
  }

  const loaded = await loadLevelRecords(opts.recordsDir);
  if (!loaded.ok) return stopped(...loaded.problems);
  const built = evidenceOf(key, loaded.level, opts.includeMachineRead ?? false);
  if (!built.ok) return stopped(...built.problems);
  const ctx = { topic: key.topic, evidence: built.evidence, views: built.views };

  let summary: MethodSentence[];
  let summaryDraft: TopicMethodRecord["summary_draft"];
  if (opts.keepSummary && file.kind === "ok") {
    const check = checkSummary(file.record.summary, ctx);
    if (!check.ok) return stopped(...formatErrors(check.errors));
    summary = check.summary;
    summaryDraft = file.record.summary_draft;
  } else {
    const drafted = await draftSummary({ ctx, model: opts.model, runCli: opts.runCli });
    if (!drafted.ok) return stopped(...drafted.problems);
    summary = drafted.summary;
    summaryDraft = drafted.model === null ? null : { model: drafted.model, sha256: summarySha256(summary) };
  }

  const previous = file.kind === "ok" ? settleStatus(file.record) : null;
  const record = settleStatus({
    kind: "topic_method",
    ...key,
    evidence: built.evidence,
    summary,
    summary_draft: summaryDraft,
    status: "drafted",
    approvals: previous?.approvals ?? [],
  });
  const problem = await writeMethodFile(path, name, file, record, repoRoot);
  if (problem) return stopped(problem);
  const lines = [`Wrote ${path} (${record.status}, ${count(summary.length, "sentence", "sentences")}, ${count(built.evidence.gaps.length, "gap", "gaps")}).`];
  if (previous && previous.approvals.length > record.approvals.length) {
    lines.push(`Approvals removed, because the content changed: ${previous.approvals.map((a) => a.by).join(", ")}.`);
  }
  if (previous && previous.status !== record.status) lines.push(`status: ${previous.status} -> ${record.status}`);
  return { ok: true, lines, problems: [] };
}

export interface ApproveOptions {
  key: MethodKey;
  recordsDir: string;
  methodsDir: string;
  repoRoot: string;
  by: string[];
  now: () => Date;
}

export async function approveTopicMethod(opts: ApproveOptions): Promise<CommandResult> {
  const folderProblems = checkPrivateFolders(opts.repoRoot, opts.recordsDir, opts.methodsDir);
  if (folderProblems.length > 0) return stopped(...folderProblems);
  const names = opts.by.map((by) => (findUnstorableTextPath(by) === null ? cleanApproverName(by) : null));
  if (names.length === 0 || names.includes(null)) return stopped("give the name of each approver with --by");

  const name = methodFileName(opts.key);
  const path = join(resolve(opts.methodsDir), name);
  const file = await readMethodFile(path, name);
  if (file.kind === "missing") return stopped(`${name}: there is no method record to approve`);
  if (file.kind === "unreadable") return stopped(file.problem);
  if (file.kind === "invalid") return stopped(...file.problems);
  if (methodRef(file.record) !== methodRef(opts.key)) {
    return stopped(`${name} holds "${methodRef(file.record)}", not "${methodRef(opts.key)}"`);
  }
  const loaded = await loadLevelRecords(opts.recordsDir);
  if (!loaded.ok) return stopped(...loaded.problems);
  const problems = checkAgainstRecords(file.record, loaded.level);
  if (problems.length > 0) return stopped(...problems);

  const settled = settleStatus(file.record);
  const sha256 = contentSha256(settled);
  const added = names.flatMap((by) => (by === null ? [] : [{ by, at: opts.now().toISOString(), content_sha256: sha256 }]));
  // An approval that is already there keeps its time.
  const record = settleStatus({ ...settled, approvals: [...settled.approvals, ...added] });
  if (!deepEqualJson(record, file.record)) {
    const problem = await writeMethodFile(path, name, file, record, opts.repoRoot);
    if (problem) return stopped(problem);
  }
  const people = record.approvals.map((a) => a.by).join(", ");
  const missing = record.status === "approved" ? "" : " It needs two different names.";
  return {
    ok: true,
    lines: [`${methodRef(opts.key)}: ${record.status}. Approved by ${people}.${missing}`, `content sha256: ${sha256}`],
    problems: [],
  };
}

export interface GapsOptions {
  source: string;
  level: string;
  recordsDir: string;
  // Also give the status of each method record in this folder.
  methodsDir?: string;
  repoRoot: string;
  includeMachineRead: boolean;
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function gapLines(key: MethodKey, evidence: TopicEvidence): string[] {
  const lines = [`topic ${key.topic}: ${evidence.topic.title}`];
  for (const gap of evidence.gaps) {
    const check = gap.check_pages.length > 0 ? ` [look at the example or scaffold on ${gap.check_pages.join(", ")}]` : "";
    const marked = gap.machine_read ? " [machine_read]" : "";
    lines.push(
      gap.kind === "no_method"
        ? `  no method: ${gap.step} (${gap.pages.join(", ")})${check}${marked}`
        : `  step not known: ${gap.step}${check}${marked}`,
    );
  }
  if (evidence.sheets.length === 0) lines.push("  no pages with facts");
  else if (evidence.gaps.length === 0) lines.push("  no gaps in the pages with facts");
  const withheld = evidence.pages.filter((p) => p.facts === "withheld").map((p) => p.ref);
  if (withheld.length > 0) lines.push(`  no facts (machine_read): ${withheld.join(", ")}`);
  if (evidence.pages_without_photo === NOT_STATED) {
    lines.push("  no photo: not stated (the chart has no sheet range)");
  } else if (evidence.pages_without_photo.length > 0) {
    lines.push(`  no photo: ${evidence.pages_without_photo.join(", ")}`);
  }
  if (evidence.unplaced_pages.length > 0) lines.push(`  in no topic: ${evidence.unplaced_pages.join(", ")}`);
  return lines;
}

// The status of a method record against the page records of now: a record that is out of date is drafted.
async function statusLine(key: MethodKey, methodsDir: string, level: LevelRecords): Promise<string> {
  const name = methodFileName(key);
  const file = await readMethodFile(join(resolve(methodsDir), name), name);
  if (file.kind === "missing") return "  method record: none";
  if (file.kind !== "ok") return `  method record: not valid (${file.kind === "invalid" ? file.problems[0] : file.problem})`;
  if (methodRef(file.record) !== methodRef(key)) return `  method record: not valid (it holds "${methodRef(file.record)}")`;
  const built = evidenceOf(key, level, file.record.evidence.include_machine_read);
  if (built.ok && deepEqualJson(file.record.evidence, built.evidence)) {
    return `  method record: ${settleStatus(file.record).status}`;
  }
  const why = built.ok ? evidenceChanges(file.record.evidence, built.evidence) : built.problems;
  return `  method record: drafted (out of date: ${why.join("; ")})`;
}

// The steps with no method, for each topic of a level, from the page records as they are now.
export async function listGaps(opts: GapsOptions): Promise<CommandResult> {
  const folderProblems = checkPrivateFolders(opts.repoRoot, opts.recordsDir, ...(opts.methodsDir ? [opts.methodsDir] : []));
  if (folderProblems.length > 0) return stopped(...folderProblems);
  const loaded = await loadLevelRecords(opts.recordsDir);
  if (!loaded.ok) return stopped(...loaded.problems);
  const contentsRef = contentsRefOf(opts);
  const contents = loaded.level.records.find((r) => r.source_ref === contentsRef);
  if (contents?.kind !== "contents") return stopped(`no contents record "${contentsRef}" in the records folder`);

  const lines: string[] = [];
  const problems: string[] = [];
  const kinds: string[] = [];
  for (const topic of contents.topics) {
    const key = { source: opts.source, level: opts.level, topic: topic.n };
    const built = evidenceOf(key, loaded.level, opts.includeMachineRead);
    if (!built.ok) {
      problems.push(...built.problems.map((p) => `topic ${topic.n}: ${p}`));
      continue;
    }
    lines.push(...gapLines(key, built.evidence));
    if (opts.methodsDir) lines.push(await statusLine(key, opts.methodsDir, loaded.level));
    kinds.push(...built.evidence.gaps.map((g) => g.kind));
  }
  const noMethod = kinds.filter((k) => k === "no_method").length;
  lines.push(
    `${count(contents.topics.length, "topic", "topics")}, ${count(noMethod, "step with no method", "steps with no method")}, ${count(kinds.length - noMethod, "page with a step that is not known", "pages with a step that is not known")}`,
  );
  return { ok: problems.length === 0, lines, problems };
}
