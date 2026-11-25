// The --replace part of the reference import: decide whether an existing row is the same as the
// planned row, and when it is not, put the photo at its own path and update the row in place.
// The row gets its path, its text and its status in one update, and only when it is still the row
// that the plan saw. Nothing here deletes a row or an object, or writes over an object.
import { ensurePhotoObject, type PhotoTarget, type PlannedPhoto } from "./import-photos";
import { deepEqualJson, type ExistingReferenceRow, type ReferenceStore } from "./import";
import { isPlainObject } from "./read-file";
import { TRANSCRIPT_STATUSES, type TranscriptStatus } from "./status-file";
import type { ReferenceRecord } from "./types";

export interface StatusLowered {
  ref: string;
  // Always a known status: an unknown stored status has no level, so it is never lowered.
  from: TranscriptStatus;
  to: TranscriptStatus;
}

// A replaced row whose photo changed, and the path that it gets.
export interface NewPhotoPath {
  ref: string;
  path: string;
}

export interface ReplaceDecision {
  same: boolean;
  // Path the row gets: that of its photo, or the stored path when no photo is planned.
  path: string | null;
  // Stored path that the row no longer points to after the replace. The object stays in the bucket.
  leftoverPath: string | null;
  lowered: StatusLowered | null;
}

export interface ReplaceInput {
  record: ReferenceRecord;
  prev: ExistingReferenceRow;
  plannedStatus: TranscriptStatus;
  // Where the planned photo is or goes (undefined when no photo is planned).
  target: PhotoTarget | undefined;
}

function statusRank(status: string): number {
  return (TRANSCRIPT_STATUSES as readonly string[]).indexOf(status);
}

function isKnownStatus(status: string): status is TranscriptStatus {
  return statusRank(status) >= 0;
}

export function decideReplace(input: ReplaceInput): ReplaceDecision {
  const { record, prev, plannedStatus, target } = input;
  const path = target ? target.path : prev.path;
  const same =
    deepEqualJson(prev.transcript, record) &&
    prev.transcript_status === plannedStatus &&
    prev.path === path &&
    !target?.upload;

  const from = prev.transcript_status;
  const lowered =
    !same && isKnownStatus(from) && statusRank(from) > statusRank(plannedStatus)
      ? { ref: record.source_ref, from, to: plannedStatus }
      : null;

  return {
    same,
    path,
    leftoverPath: prev.path !== path ? prev.path : null,
    lowered,
  };
}

// One record of the run: its planned photo path, and its decision when it already has a row.
export interface PathPlan {
  ref: string;
  plannedPhotoPath: string | null;
  decision: ReplaceDecision | null;
}

export function findSharedPhotoPaths(plans: PathPlan[]): string[] {
  const problems: string[] = [];
  const plannedOwner = new Map<string, string>();
  for (const p of plans) {
    if (p.plannedPhotoPath === null) continue;
    const owner = plannedOwner.get(p.plannedPhotoPath);
    if (owner !== undefined) {
      problems.push(
        `storage: ${owner} and ${p.ref} plan the same photo path ${quoted(p.plannedPhotoPath)}; nothing was written`,
      );
    } else {
      plannedOwner.set(p.plannedPhotoPath, p.ref);
    }
  }
  return problems;
}

// A path is free only when no row of another page uses it, also when no object is there now: that
// row would get the photo of this page. Checks each path that this run uploads to or gives to a row.
export async function findTakenPaths(store: ReferenceStore, pathByRef: ReadonlyMap<string, string>): Promise<string[]> {
  if (pathByRef.size === 0) return [];
  const refsByPath = await store.refsByPath([...new Set(pathByRef.values())]);
  return [...pathByRef].flatMap(([ref, path]) => {
    const others = (refsByPath.get(path) ?? []).filter((other) => other !== ref);
    return others.length === 0
      ? []
      : [`storage: ${ref} (${quoted(path)}): the row ${others.map(quoted).join(", ")} uses this photo path too; nothing was written`];
  });
}

// The old paths of a dry run that no row would use after the run, with an object there.
async function expectedLeftovers(store: ReferenceStore, plans: PathPlan[]): Promise<string[]> {
  const oldPaths = new Set(plans.flatMap((p) => p.decision?.leftoverPath ?? []));
  if (oldPaths.size === 0) return [];
  const refsByPath = await store.refsByPath([...oldPaths]);
  // Path of each ref of this run after the run (the stored path for a row that stays the same).
  const finalPath = new Map(plans.map((p) => [p.ref, p.decision ? p.decision.path : p.plannedPhotoPath]));
  const usedByRun = new Set(finalPath.values());
  return withObject(
    store,
    [...oldPaths].filter(
      (path) => !usedByRun.has(path) && (refsByPath.get(path) ?? []).every((ref) => finalPath.has(ref)),
    ),
  );
}

async function withObject(store: ReferenceStore, paths: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const path of paths) if ((await store.objectSha256(path)) !== null) found.push(path);
  return found;
}

// The paths with an object that no row uses now. The rows are read last.
export async function unusedPaths(store: ReferenceStore, paths: Iterable<string>): Promise<string[]> {
  const list = await withObject(store, [...paths]);
  if (list.length === 0) return [];
  const refsByPath = await store.refsByPath(list);
  return list.filter((path) => (refsByPath.get(path) ?? []).length === 0);
}

// The text of a page: single_read only says how it was read.
function withoutSingleRead(transcript: unknown): unknown {
  return isPlainObject(transcript) ? { ...transcript, single_read: undefined } : transcript;
}

// A row that keeps its stored photo keeps its text too: the new text may belong to another photo.
function keepsPhotoOfOtherText(
  record: ReferenceRecord,
  prev: ExistingReferenceRow,
  target: PhotoTarget | undefined,
): boolean {
  return (
    target === undefined &&
    prev.path !== null &&
    !deepEqualJson(withoutSingleRead(prev.transcript), withoutSingleRead(record))
  );
}

// Without a planned photo, a row with a stored photo may keep or lower its status, never raise it.
// An unknown stored status has rank -1, so any valid planned status counts as a raise.
function raisesStatusWithoutPhoto(
  prev: ExistingReferenceRow,
  plannedStatus: TranscriptStatus,
  target: PhotoTarget | undefined,
): boolean {
  return (
    target === undefined &&
    prev.path !== null &&
    statusRank(prev.transcript_status) < statusRank(plannedStatus)
  );
}

// Decides every existing row of the run. Reads only.
export async function planReplaces(args: {
  store: ReferenceStore;
  records: ReferenceRecord[];
  existing: Map<string, ExistingReferenceRow>;
  targets: Map<string, PhotoTarget>;
  statusByRef: ReadonlyMap<string, TranscriptStatus>;
  dryRun: boolean;
}): Promise<{ decisions: Map<string, ReplaceDecision>; leftovers: string[]; problems: string[] }> {
  const decisions = new Map<string, ReplaceDecision>();
  const plans: PathPlan[] = [];
  const problems: string[] = [];
  for (const record of args.records) {
    const ref = record.source_ref;
    const target = args.targets.get(ref);
    const prev = args.existing.get(ref);
    let decision: ReplaceDecision | null = null;
    if (prev !== undefined) {
      const plannedStatus = args.statusByRef.get(ref) ?? "machine_read";
      decision = decideReplace({ record, prev, plannedStatus, target });
      decisions.set(ref, decision);
      if (keepsPhotoOfOtherText(record, prev, target)) {
        problems.push(
          `${ref}: the replace would change the text and keep the stored photo, which may not belong to it; give the photo of this page with --photos`,
        );
      } else if (raisesStatusWithoutPhoto(prev, plannedStatus, target)) {
        const fromLabel = isKnownStatus(prev.transcript_status)
          ? prev.transcript_status
          : quoted(prev.transcript_status);
        problems.push(
          `${ref}: the replace would raise the status (${fromLabel} -> ${plannedStatus}) and keep the stored photo, which may not belong to it; give the photo of this page with --photos`,
        );
      }
    }
    plans.push({ ref, plannedPhotoPath: target?.path ?? null, decision });
  }
  problems.push(...findSharedPhotoPaths(plans));
  const leftovers = args.dryRun ? await expectedLeftovers(args.store, plans) : [];
  return { decisions, leftovers, problems };
}

export type ReplaceOutcome =
  | { ok: true; photoWritten: boolean }
  | {
      ok: false;
      photoWritten: boolean;
      // The row is not the one that the plan saw: the update did not match it.
      rowChanged: boolean;
      // The row holds the planned values (also when another run gave them), so it left its old path.
      rowWritten: boolean;
      problems: string[];
    };

// Every column that the plan used. The text too: a person can change a row by hand and leave its updated_at.
function isSeenRow(now: ExistingReferenceRow | undefined, seen: ExistingReferenceRow): boolean {
  return (
    now !== undefined &&
    now.updated_at === seen.updated_at &&
    now.path === seen.path &&
    now.transcript_status === seen.transcript_status &&
    deepEqualJson(now.transcript, seen.transcript)
  );
}

// Writes one replace. In a dry run it calls no write method and reports what it would write.
export async function applyReplace(args: {
  store: ReferenceStore;
  record: ReferenceRecord;
  prev: ExistingReferenceRow;
  plannedStatus: TranscriptStatus;
  photo: PlannedPhoto | undefined;
  target: PhotoTarget | undefined;
  decision: ReplaceDecision;
  dryRun: boolean;
}): Promise<ReplaceOutcome> {
  const { store, record, prev, plannedStatus, photo, target, decision, dryRun } = args;
  const ref = record.source_ref;
  if (dryRun) return { ok: true, photoWritten: target?.upload ?? false };

  const readRow = async () => (await store.findExisting([ref])).get(ref);
  const holdsPlan = (now: ExistingReferenceRow | undefined): boolean =>
    now !== undefined &&
    now.path === decision.path &&
    now.transcript_status === plannedStatus &&
    deepEqualJson(now.transcript, record);
  let photoWritten = false;
  const rowChanged = (now: ExistingReferenceRow | undefined): ReplaceOutcome => ({
    ok: false,
    photoWritten,
    rowChanged: true,
    rowWritten: holdsPlan(now),
    problems: [
      `${ref}: the row changed or was removed after this run read it (another run or a person); this run did not write the row`,
    ],
  });
  try {
    // So that a row that changed since the plan gets no upload. The filter of the update decides.
    const now = await readRow();
    if (!isSeenRow(now, prev)) return rowChanged(now);
    if (photo && target) {
      await ensurePhotoObject(store, photo, target, () => {
        photoWritten = true;
      });
    }
    const updated = await store.updateRow(
      {
        source_ref: ref,
        kind: record.kind,
        path: decision.path,
        transcript: record,
        transcript_status: plannedStatus,
      },
      prev,
    );
    return updated ? { ok: true, photoWritten } : rowChanged(await readRow());
  } catch (err) {
    const problems = [`write failed at ${ref}: ${messageOf(err)}`];
    // The answer may be lost after the row was written, so the row is read again.
    let rowWritten = false;
    try {
      rowWritten = holdsPlan(await readRow());
    } catch {
      if (decision.leftoverPath !== null) {
        problems.push(
          `${ref}: the row could not be read again; its old photo at ${quoted(decision.leftoverPath)} is a leftover only when no row uses it`,
        );
      }
    }
    if (target?.upload && !photoWritten && !rowWritten) problems.push(photoMayBeStored(ref, target.path));
    return { ok: false, photoWritten, rowChanged: false, rowWritten, problems };
  }
}

export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function photoMayBeStored(ref: string, path: string): string {
  return `the photo for ${ref} may be in storage at ${quoted(path)} (the upload has no answer); run the command again with the same files and it reuses that photo`;
}

// Database text (a stored path or source_ref) in an output line: one quoted form, with backslash,
// double quote, control characters, and direction or format marks (such as U+061C, U+200E, U+202A
// to U+202E, U+2066 to U+2069, U+FEFF) written as \u{...}.
const UNSAFE_OUTPUT_CHAR_RE = /[\\"\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/gu;

export function quoted(text: string): string {
  const body = text.replace(UNSAFE_OUTPUT_CHAR_RE, (ch) =>
    ch === "\\" ? "\\\\" : ch === '"' ? '\\"' : `\\u{${(ch.codePointAt(0) ?? 0).toString(16)}}`,
  );
  return `"${body}"`;
}

export const REMOVE_BY_HAND = "a person can remove it by hand when no import runs and still no row uses it";

export function formatReplaceLines(result: {
  replacedRefs: string[];
  newPhotoPaths: NewPhotoPath[];
  statusLowered: StatusLowered[];
  leftoverPhotos: string[];
}): string[] {
  const lines: string[] = [];
  for (const ref of result.replacedRefs) {
    lines.push(`replaced: ${ref} (stored row differed from the files)`);
  }
  for (const p of result.newPhotoPaths) {
    lines.push(`new_photo_path: ${p.ref} -> ${quoted(p.path)}`);
  }
  for (const s of result.statusLowered) {
    lines.push(`status_lowered: ${s.ref} (${s.from} -> ${s.to})`);
  }
  for (const path of result.leftoverPhotos) {
    lines.push(
      `leftover_photo: ${quoted(path)} is no longer used by any row and stays in the bucket; ${REMOVE_BY_HAND}`,
    );
  }
  return lines;
}
