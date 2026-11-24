// The --replace part of the reference import: decide whether an existing row is the same as the
// planned row, and when it is not, write the photo (overwrite) and update the row in place.
// Nothing here deletes a row or an object.
import type { PlannedPhoto } from "./import-photos";
import {
  deepEqualJson,
  TRANSCRIPT_STATUSES,
  type ExistingReferenceRow,
  type ReferenceStore,
  type TranscriptStatus,
} from "./import";
import type { ReferenceRecord } from "./types";

export interface StatusLowered {
  ref: string;
  from: string;
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

export function decideReplace(input: ReplaceInput): ReplaceDecision {
  const { record, prev, plannedStatus, photo, storedSha } = input;
  const path = photo ? photo.storagePath : prev.path;
  const photoSame = photo ? storedSha !== null && storedSha.toLowerCase() === photo.sha256 : true;
  const same =
    deepEqualJson(prev.transcript, record) &&
    prev.transcript_status === plannedStatus &&
    prev.path === path &&
    photoSame;

  const fromRank = statusRank(prev.transcript_status);
  const lowered =
    !same && fromRank > statusRank(plannedStatus)
      ? { ref: record.source_ref, from: prev.transcript_status, to: plannedStatus }
      : null;

  return {
    same,
    path,
    writePhoto: !same && photo !== undefined && !photoSame,
    leftoverPath: !same && prev.path !== null && prev.path !== path ? prev.path : null,
    lowered,
  };
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

// Text that came from the database (a stored path or status) is shown with control characters escaped.
const UNSAFE_OUTPUT_CHAR_RE = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u2028-\u202e\u2066-\u2069]/g;

export function printable(text: string): string {
  return text.replace(
    UNSAFE_OUTPUT_CHAR_RE,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
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
    lines.push(`status_lowered: ${s.ref} (${printable(s.from)} -> ${s.to})`);
  }
  for (const path of result.leftoverPhotos) {
    lines.push(
      `leftover_photo: "${printable(path)}" is no longer used by its row and stays in the bucket; a person can remove it by hand`,
    );
  }
  return lines;
}
