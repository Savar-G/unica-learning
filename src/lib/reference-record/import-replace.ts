// The --replace part of the reference import: decide whether an existing row is the same as the
// planned row, and when it is not, write the photo (overwrite) and update the row in place.
// Nothing here deletes a row or an object.
import type { PlannedPhoto } from "./import-photos";
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

export interface ReplaceDecision {
  same: boolean;
  // Path the row gets: the planned photo path, or the stored path when no photo is planned.
  path: string | null;
  writePhoto: boolean;
  // Stored path that the row no longer points to after the replace. The object stays in the bucket.
  leftoverPath: string | null;
  lowered: StatusLowered | null;
}

export interface ReplaceInput {
  record: ReferenceRecord;
  prev: ExistingReferenceRow;
  plannedStatus: TranscriptStatus;
  photo: PlannedPhoto | undefined;
  // sha256 of the object now at the planned photo path (null when absent or no photo is planned).
  storedSha: string | null;
}

function statusRank(status: string): number {
  return (TRANSCRIPT_STATUSES as readonly string[]).indexOf(status);
}

function isKnownStatus(status: string): status is TranscriptStatus {
  return statusRank(status) >= 0;
}

export function decideReplace(input: ReplaceInput): ReplaceDecision {
  const { record, prev, plannedStatus, photo, storedSha } = input;
  const path = photo ? photo.storagePath : prev.path;
  const photoSame = photo ? storedSha !== null && storedSha.toLowerCase() === photo.sha256 : true;
  const same =
    deepEqualJson(prev.transcript, record) &&
    prev.transcript_status === plannedStatus &&
    prev.path === path &&
    photoSame;

  const from = prev.transcript_status;
  const lowered =
    !same && isKnownStatus(from) && statusRank(from) > statusRank(plannedStatus)
      ? { ref: record.source_ref, from, to: plannedStatus }
      : null;

  return {
    same,
    path,
    writePhoto: !same && photo !== undefined && !photoSame,
    leftoverPath: !same && prev.path !== null && prev.path !== path ? prev.path : null,
    lowered,
  };
}

// One record of the run: its planned photo path, and its decision when it already has a row.
export interface PathPlan {
  ref: string;
  plannedPhotoPath: string | null;
  decision: ReplaceDecision | null;
}

export interface PathOwnershipCheck {
  problems: string[];
  // Old path -> refs of this run that move away from it. Only paths that no row uses after the run.
  leftoverWaits: Map<string, Set<string>>;
}

// Paths whose users must be known before a replace: each path a replace overwrites, and each old path.
export function pathsToCheck(plans: PathPlan[]): string[] {
  const paths = new Set<string>();
  for (const p of plans) {
    if (p.decision?.writePhoto && p.plannedPhotoPath !== null) paths.add(p.plannedPhotoPath);
    if (p.decision?.leftoverPath) paths.add(p.decision.leftoverPath);
  }
  return [...paths];
}

export function checkPathOwnership(
  plans: PathPlan[],
  refsByPath: Map<string, string[]>,
): PathOwnershipCheck {
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

  for (const p of plans) {
    if (!p.decision?.writePhoto || p.plannedPhotoPath === null) continue;
    const others = (refsByPath.get(p.plannedPhotoPath) ?? []).filter((ref) => ref !== p.ref);
    if (others.length > 0) {
      problems.push(
        `storage: ${p.ref} (${quoted(p.plannedPhotoPath)}): the replace would overwrite the photo that the row ${others.map(quoted).join(", ")} also uses; nothing was written`,
      );
    }
  }

  // Path of each ref of this run after the run (the stored path for a row that stays the same).
  const finalPath = new Map<string, string | null>();
  for (const p of plans) finalPath.set(p.ref, p.decision ? p.decision.path : p.plannedPhotoPath);
  const usedAfterRun = (path: string): boolean =>
    [...finalPath.values()].includes(path) ||
    (refsByPath.get(path) ?? []).some((ref) => !finalPath.has(ref));

  const leftoverWaits = new Map<string, Set<string>>();
  for (const p of plans) {
    const old = p.decision?.leftoverPath;
    if (!old || usedAfterRun(old)) continue;
    const waits = leftoverWaits.get(old) ?? new Set<string>();
    waits.add(p.ref);
    leftoverWaits.set(old, waits);
  }
  return { problems, leftoverWaits };
}

// The text of a page: single_read only says how it was read.
function withoutSingleRead(transcript: unknown): unknown {
  return isPlainObject(transcript) ? { ...transcript, single_read: undefined } : transcript;
}

// A row that keeps its stored photo keeps its text too: the new text may belong to another photo.
function keepsPhotoOfOtherText(
  record: ReferenceRecord,
  prev: ExistingReferenceRow,
  photo: PlannedPhoto | undefined,
): boolean {
  return (
    photo === undefined &&
    prev.path !== null &&
    !deepEqualJson(withoutSingleRead(prev.transcript), withoutSingleRead(record))
  );
}

// Without a planned photo, a row with a stored photo may keep or lower its status, never raise it.
// An unknown stored status has rank -1, so any valid planned status counts as a raise.
function raisesStatusWithoutPhoto(
  prev: ExistingReferenceRow,
  plannedStatus: TranscriptStatus,
  photo: PlannedPhoto | undefined,
): boolean {
  return (
    photo === undefined &&
    prev.path !== null &&
    statusRank(prev.transcript_status) < statusRank(plannedStatus)
  );
}

// Decides every existing row of the run and checks which rows use the paths it touches. Reads only.
export async function planReplaces(args: {
  store: ReferenceStore;
  records: ReferenceRecord[];
  existing: Map<string, ExistingReferenceRow>;
  plannedPhotos: Map<string, PlannedPhoto>;
  statusByRef: ReadonlyMap<string, TranscriptStatus>;
  storedShaByRef: Map<string, string | null>;
}): Promise<PathOwnershipCheck & { decisions: Map<string, ReplaceDecision> }> {
  const decisions = new Map<string, ReplaceDecision>();
  const plans: PathPlan[] = [];
  const textProblems: string[] = [];
  for (const record of args.records) {
    const ref = record.source_ref;
    const photo = args.plannedPhotos.get(ref);
    const prev = args.existing.get(ref);
    let decision: ReplaceDecision | null = null;
    if (prev !== undefined) {
      const plannedStatus = args.statusByRef.get(ref) ?? "machine_read";
      decision = decideReplace({
        record,
        prev,
        plannedStatus,
        photo,
        storedSha: args.storedShaByRef.get(ref) ?? null,
      });
      decisions.set(ref, decision);
      if (keepsPhotoOfOtherText(record, prev, photo)) {
        textProblems.push(
          `${ref}: the replace would change the text and keep the stored photo, which may not belong to it; give the photo of this page with --photos`,
        );
      } else if (raisesStatusWithoutPhoto(prev, plannedStatus, photo)) {
        const fromLabel = isKnownStatus(prev.transcript_status)
          ? prev.transcript_status
          : quoted(prev.transcript_status);
        textProblems.push(
          `${ref}: the replace would raise the status (${fromLabel} -> ${plannedStatus}) and keep the stored photo, which may not belong to it; give the photo of this page with --photos`,
        );
      }
    }
    plans.push({ ref, plannedPhotoPath: photo?.storagePath ?? null, decision });
  }
  const paths = pathsToCheck(plans);
  const refsByPath = paths.length > 0 ? await args.store.refsByPath(paths) : new Map();
  const ownership = checkPathOwnership(plans, refsByPath);
  return { ...ownership, decisions, problems: [...textProblems, ...ownership.problems] };
}

export type ReplaceOutcome =
  | { ok: true; photoWritten: boolean }
  | { ok: false; photoWritten: boolean; problems: string[] };

// Writes one replace. In a dry run it calls no write method and reports what it would write.
export async function applyReplace(args: {
  store: ReferenceStore;
  record: ReferenceRecord;
  plannedStatus: TranscriptStatus;
  photo: PlannedPhoto | undefined;
  decision: ReplaceDecision;
  dryRun: boolean;
}): Promise<ReplaceOutcome> {
  const { store, record, plannedStatus, photo, decision, dryRun } = args;
  const ref = record.source_ref;
  if (dryRun) return { ok: true, photoWritten: decision.writePhoto };

  let photoWritten = false;
  const photoNote = (): string[] =>
    photoWritten && photo
      ? [
          `the photo for ${ref} at "${photo.storagePath}" is already the new one, but its row is not updated; run the command again with the same files and it finishes the row`,
        ]
      : [];
  try {
    if (decision.writePhoto && photo) {
      await store.replaceObject(photo.storagePath, photo.bytes, photo.contentType);
      photoWritten = true;
    }
    const updated = await store.updateRow({
      source_ref: ref,
      kind: record.kind,
      path: decision.path,
      transcript: record,
      transcript_status: plannedStatus,
    });
    if (!updated) {
      return {
        ok: false,
        photoWritten,
        problems: [
          `write failed at ${ref}: no row with this source_ref was found to update (it was removed after the run read it)`,
          ...photoNote(),
        ],
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      photoWritten,
      problems: [`write failed at ${ref}: ${message}`, ...photoNote()],
    };
  }
  return { ok: true, photoWritten };
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

export function formatReplaceLines(result: {
  replacedRefs: string[];
  statusLowered: StatusLowered[];
  leftoverPhotos: string[];
}): string[] {
  const lines: string[] = [];
  for (const ref of result.replacedRefs) {
    lines.push(`replaced: ${ref} (stored row differed from the files)`);
  }
  for (const s of result.statusLowered) {
    lines.push(`status_lowered: ${s.ref} (${s.from} -> ${s.to})`);
  }
  for (const path of result.leftoverPhotos) {
    lines.push(
      `leftover_photo: ${quoted(path)} is no longer used by any row and stays in the bucket; a person can remove it by hand`,
    );
  }
  return lines;
}
