import { join } from "node:path";
import { isPlainObject, readJsonNote } from "./read-file";
import { isSourceRef } from "./validate";

export const TRANSCRIPT_STATUSES = [
  "machine_read",
  "agreement_accepted",
  "double_read",
  "human_checked",
] as const;
export type TranscriptStatus = (typeof TRANSCRIPT_STATUSES)[number];

const TRANSCRIPT_STATUS_SET = new Set<unknown>(TRANSCRIPT_STATUSES);

function isTranscriptStatus(value: unknown): value is TranscriptStatus {
  return TRANSCRIPT_STATUS_SET.has(value);
}

function parseStatusMap(raw: unknown): Map<string, TranscriptStatus> {
  if (!isPlainObject(raw)) {
    throw new Error("must be a JSON object mapping source_ref to transcript_status");
  }
  const status = new Map<string, TranscriptStatus>();
  const problems: string[] = [];
  for (const [ref, value] of Object.entries(raw)) {
    if (!isSourceRef(ref)) problems.push(`${JSON.stringify(ref)} is not a page id`);
    else if (isTranscriptStatus(value)) status.set(ref, value);
    else {
      problems.push(
        `unknown status for "${ref}": ${JSON.stringify(value)} (expected ${TRANSCRIPT_STATUSES.join(", ")})`,
      );
    }
  }
  if (problems.length > 0) throw new Error(problems.join("; "));
  return status;
}

// The status of each page, for check, compare, extract and import. Null when there is no status.json.
export function readStatusMap(finalDir: string): Map<string, TranscriptStatus> | null {
  return readJsonNote(join(finalDir, "status.json"), parseStatusMap);
}

export function formatStatusMap(status: ReadonlyMap<string, TranscriptStatus>): string {
  return `${JSON.stringify(Object.fromEntries(status), null, 2)}\n`;
}
