import { join, resolve } from "node:path";
import type { RunCli } from "@/lib/reference-kit/read-cli";
import { deepEqualJson } from "@/lib/reference-record";
import { canonicalSha256 } from "./canonical";
import { draftSummary, formatErrors } from "./draft";
import { buildEvidence, type BuiltEvidence } from "./evidence";
import { checkFolders, loadLevelRecords, readMethodFile, stopped, withTopicLock, writeMethodFile } from "./files";
import type { CommandResult, Folders, LevelRecords, MethodFile } from "./files";
import { contentsRefOf, methodFileName, methodRef } from "./identity";
import { approverId, cleanApproverName, contentSha256, isEditedByPerson, settleStatus } from "./record";
import { count, showLines, topicLines } from "./show";
import { checkSummary } from "./summary";
import type { MethodKey, MethodSentence, TopicEvidence, TopicMethodRecord } from "./types";

// What is different between the facts in a record and the facts that code computes now.
function evidenceChanges(stored: TopicEvidence, current: TopicEvidence): string[] {
  const entriesOf = (e: TopicEvidence) => new Map([...(Array.isArray(e.pages) ? e.pages : []), e.contents].map((p) => [p?.ref, p]));
  const before = entriesOf(stored);
  const after = entriesOf(current);
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter((ref) => !deepEqualJson(before.get(ref), after.get(ref)));
  const how = (ref: string): string => (!before.has(ref) ? "was added" : after.has(ref) ? "changed" : "was removed");
  return changed.length > 0
    ? changed.map((ref) => `page record ${ref} ${how(ref)}`)
    : ["its facts are not what code computes from the page records"];
}

// A record against the page records of now: facts that are out of date or changed by hand, and sentences
// that break a rule.
export function checkAgainstRecords(record: TopicMethodRecord, level: LevelRecords): BuiltEvidence {
  const built = buildEvidence({ key: record, ...level, includeMachineRead: record.evidence.include_machine_read });
  if (!built.ok) return built;
  if (!deepEqualJson(record.evidence, built.evidence)) {
    return { ok: false, problems: evidenceChanges(record.evidence, built.evidence) };
  }
  const check = checkSummary(record.summary, { key: record, evidence: built.evidence, views: built.views });
  return check.ok ? built : { ok: false, problems: formatErrors(check.errors) };
}

interface TopicOptions extends Folders {
  key: MethodKey;
  methodsDir: string;
  now: () => Date;
}

// missing: there is no file. problems: no command may use or replace this file.
async function readTopicFile(opts: TopicOptions) {
  const name = methodFileName(opts.key);
  const path = join(resolve(opts.methodsDir), name);
  const file = await readMethodFile(path, name);
  const problems = file.bytes ? [] : [...file.problems];
  if (file.record && methodRef(file.record) !== methodRef(opts.key)) {
    problems.push(`${name} holds "${methodRef(file.record)}", not "${methodRef(opts.key)}"`);
  }
  return { path, name, file, problems, missing: !file.bytes && problems.length === 0 };
}

// The valid and current record of a topic, for a person to read or approve.
async function openRecord(opts: TopicOptions) {
  const { path, name, file, problems, missing } = await readTopicFile(opts);
  const { record } = file;
  if (problems.length > 0) return { ok: false as const, problems };
  if (!record) return { ok: false as const, problems: missing ? [`${name}: there is no method record`] : file.problems };
  const loaded = await loadLevelRecords(opts.recordsDir);
  if (!loaded.ok) return loaded;
  const checked = checkAgainstRecords(record, loaded.level);
  if (!checked.ok) {
    const ref = methodRef(opts.key);
    const next = `${ref} is drafted. Correct its summary, or run draft with --keep-summary (new facts) or --replace (new summary)`;
    return { ok: false as const, problems: [...checked.problems.map((p) => `${ref}: ${p}`), next] };
  }
  return { ok: true as const, path, name, file, record, views: checked.views };
}

export interface DraftOptions extends TopicOptions {
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
  if (!file.record) return file.bytes ? `it is not a valid method record (${file.problems[0]})` : null;
  if (isEditedByPerson(file.record)) return "its summary was changed by a person";
  const { approvals } = settleStatus(file.record);
  return approvals.length > 0 ? `it is approved by ${approvals.map((a) => a.by).join(" and ")}` : null;
}

export async function draftTopicMethod(opts: DraftOptions): Promise<CommandResult> {
  if (opts.keepSummary && opts.replace) return stopped("use --keep-summary or --replace, not the two together");
  const folderProblems = checkFolders(opts);
  if (folderProblems.length > 0) return stopped(...folderProblems);
  return withTopicLock(opts, "draft", () => draftUnderLock(opts));
}

async function draftUnderLock(opts: DraftOptions): Promise<CommandResult> {
  const { key } = opts;
  const { path, name, file, problems, missing } = await readTopicFile(opts);
  if (problems.length > 0) return stopped(...problems);
  if (opts.keepSummary && missing) return stopped(`${name}: there is no method record to keep`);
  if (opts.keepSummary && !file.record) return stopped(...file.problems);
  const kept = opts.replace || opts.keepSummary ? null : keptWork(file);
  if (kept) {
    return stopped(
      `${name}: ${kept}. Nothing was written. Use --keep-summary to compute only the facts again, or --replace to write a new draft over it`,
    );
  }
  const build = async (): Promise<BuiltEvidence> => {
    const loaded = await loadLevelRecords(opts.recordsDir);
    return loaded.ok ? buildEvidence({ key, ...loaded.level, includeMachineRead: opts.includeMachineRead ?? false }) : loaded;
  };
  const built = await build();
  if (!built.ok) return stopped(...built.problems);
  const { evidence, views } = built;
  const ctx = { key, evidence, views };

  let summary: MethodSentence[];
  let summaryDraft: TopicMethodRecord["summary_draft"];
  if (opts.keepSummary && file.record) {
    const check = checkSummary(file.record.summary, ctx);
    if (!check.ok) return stopped(...formatErrors(check.errors));
    summary = check.summary;
    summaryDraft = file.record.summary_draft;
  } else {
    const drafted = await draftSummary({ ctx, model: opts.model, runCli: opts.runCli });
    if (!drafted.ok) return stopped(...drafted.problems);
    summary = drafted.summary;
    summaryDraft = drafted.model === null ? null : { model: drafted.model, sha256: canonicalSha256(summary) };
    const now = await build();
    if (!now.ok || !deepEqualJson(now.evidence, evidence)) {
      return stopped("the page records changed while the model ran. Nothing was written. Run it again");
    }
  }

  const previous = file.record && settleStatus(file.record);
  const record = settleStatus({
    kind: "topic_method",
    ...key,
    evidence,
    summary,
    summary_draft: summaryDraft,
    status: "drafted",
    approvals: previous?.approvals ?? [],
  });
  const problem = await writeMethodFile(path, name, file, record, opts.repoRoot);
  if (problem) return stopped(problem);
  const lines = [
    `Wrote ${path} (${record.status}, ${count(summary.length, "sentence", "sentences")}, ${count(evidence.gaps.length, "gap", "gaps")}). Read it with show.`,
  ];
  if (previous && previous.approvals.length > record.approvals.length) {
    lines.push(`Approvals removed, because the content changed: ${previous.approvals.map((a) => a.by).join(", ")}.`);
  }
  if (previous && previous.status !== record.status) lines.push(`status: ${previous.status} -> ${record.status}`);
  return { ok: true, lines, problems: [] };
}

// The whole record in plain words, with the digest that approve needs.
export async function showTopicMethod(opts: TopicOptions): Promise<CommandResult> {
  const folderProblems = checkFolders(opts);
  if (folderProblems.length > 0) return stopped(...folderProblems);
  const opened = await openRecord(opts);
  return opened.ok ? { ok: true, lines: showLines(opened.record, opened.views), problems: [] } : stopped(...opened.problems);
}

export interface ApproveOptions extends TopicOptions {
  by: string;
  // The digest that show printed for the content that the person read.
  digest: string;
}

export async function approveTopicMethod(opts: ApproveOptions): Promise<CommandResult> {
  const folderProblems = checkFolders(opts);
  if (folderProblems.length > 0) return stopped(...folderProblems);
  const by = cleanApproverName(opts.by);
  if (by === null) return stopped("give the name of the approver with --by");
  // Before the lock, so a wrong folder or topic is not made.
  const { name, missing } = await readTopicFile(opts);
  if (missing) return stopped(`${name}: there is no method record`);
  return withTopicLock(opts, "approve", async () => {
    const opened = await openRecord(opts);
    if (!opened.ok) return stopped(...opened.problems);
    const settled = settleStatus(opened.record);
    const sha256 = contentSha256(settled);
    if (opts.digest !== sha256) {
      return stopped("--digest is not the digest of this record. Nothing was approved. Read the record with show: its last line is the digest");
    }
    // An approval that is already there keeps its time.
    const added = { by, at: opts.now().toISOString(), content_sha256: sha256 };
    const record = settleStatus({ ...settled, approvals: [...settled.approvals, added] });
    if (!deepEqualJson(record, opened.record)) {
      const problem = await writeMethodFile(opened.path, opened.name, opened.file, record, opts.repoRoot);
      if (problem) return stopped(problem);
    }
    const needs = record.status === "approved" ? "" : " It needs two different people.";
    const again = settled.approvals.some((a) => approverId(a.by) === approverId(by)) ? ` ${by} approved it before.` : "";
    return {
      ok: true,
      lines: [`${methodRef(opts.key)}: ${record.status}. Approved by ${record.approvals.map((a) => a.by).join(", ")}.${again}${needs}`],
      problems: [],
    };
  });
}

export interface GapsOptions extends Omit<Folders, "methodsDir"> {
  source: string;
  level: string;
  includeMachineRead: boolean;
}

// The steps with no method, for each topic of a level, from the page records as they are now.
export async function listGaps(opts: GapsOptions): Promise<CommandResult> {
  const folderProblems = checkFolders(opts);
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
    const built = buildEvidence({ key, ...loaded.level, includeMachineRead: opts.includeMachineRead });
    if (!built.ok) {
      problems.push(...built.problems.map((p) => `topic ${topic.n}: ${p}`));
      continue;
    }
    lines.push(...topicLines(topic.n, built.evidence));
    kinds.push(...built.evidence.gaps.map((g) => g.kind));
  }
  const noMethod = kinds.filter((k) => k === "no_method").length;
  lines.push(
    `${count(contents.topics.length, "topic", "topics")}, ${count(noMethod, "step with no method", "steps with no method")}, ${count(kinds.length - noMethod, "page with a step that is not known", "pages with a step that is not known")}`,
  );
  return { ok: problems.length === 0, lines, problems };
}
