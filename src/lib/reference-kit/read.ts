import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReferenceRecord, ValidationError } from "@/lib/reference-record";
import { applyComputedAnswers, KIT_REF_SEGMENT_RE, type StoredAnswerNote } from "./answers";
import { readRegularFileNoFollow } from "./prepare";
import {
  assertModelMatchesFamily,
  buildCliInvocation,
  READER_PHOTO_FILE,
  spawnCli,
  type ReaderFamily,
  type RunCli,
} from "./read-cli";
import {
  buildRetryPrompt,
  extractJsonFromModelOutput,
  validateModelAnswer,
} from "./read-parse";
import { REFERENCE_READ_PROMPT } from "./read-prompt";

export type { ReaderFamily, RunCli } from "./read-cli";
export {
  assertModelMatchesFamily,
  buildCliInvocation,
  isReaderFamily,
  READER_FAMILIES,
  READER_PHOTO_FILE,
  spawnCli,
} from "./read-cli";
export { extractJsonFromModelOutput };

export type ReaderSlot = "a" | "b";

export interface ReaderMeta {
  family: ReaderFamily;
  model: string;
}

export interface PhotoRunEntry {
  photo: string;
  original_name?: string;
  photo_sha256?: string;
  status: "ok" | "invalid" | "refused" | "cli_error";
  source_ref?: string;
  record_file?: string;
  invalid_file?: string;
  notes: string[];
  note_details?: StoredAnswerNote[];
  errors?: ValidationError[];
  reason?: string;
}

export interface ReadRunReport {
  slot: ReaderSlot;
  reader: ReaderMeta;
  source: string;
  photos: PhotoRunEntry[];
}

export type ReadPhotoResult =
  | { status: "ok"; record: ReferenceRecord; notes: string[]; noteDetails?: StoredAnswerNote[] }
  | { status: "invalid"; raw: string; errors: ValidationError[] }
  | { status: "cli_error"; reason: string };

export const DEFAULT_READ_TIMEOUT_MS = 300_000;

export function assertValidSourceKey(source: string): void {
  if (!KIT_REF_SEGMENT_RE.test(source)) {
    throw new Error(
      `Invalid --source "${source}": expected letters and digits only (^[A-Za-z0-9]+$)`,
    );
  }
}

async function invokeReaderOnce(opts: {
  family: ReaderFamily;
  model?: string;
  photoDir: string;
  prompt: string;
  timeoutMs: number;
  runCli: RunCli;
}): Promise<{ ok: true; raw: string } | { ok: false; reason: string }> {
  const metaTmpDir =
    opts.family === "codex" ? mkdtempSync(join(tmpdir(), "unica-ref-codex-out-")) : null;
  if (metaTmpDir) chmodSync(metaTmpDir, 0o700);
  const codexLastMessagePath = metaTmpDir ? join(metaTmpDir, "last-message.txt") : undefined;

  try {
    const invocation = buildCliInvocation({
      family: opts.family,
      model: opts.model,
      photoDir: opts.photoDir,
      prompt: opts.prompt,
      codexLastMessagePath,
    });
    const res = await opts.runCli(invocation.cmd, invocation.args, {
      cwd: opts.photoDir,
      stdin: invocation.stdin,
      timeoutMs: opts.timeoutMs,
    });
    if (res.code !== 0) {
      const detail = res.stderr.trim() || `CLI exited with status ${res.code}`;
      return { ok: false, reason: detail };
    }
    if (codexLastMessagePath && existsSync(codexLastMessagePath)) {
      const fileText = readFileSync(codexLastMessagePath, "utf8").trim();
      if (fileText.length > 0) {
        return { ok: true, raw: fileText };
      }
    }
    return { ok: true, raw: res.stdout };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    if (metaTmpDir) {
      rmSync(metaTmpDir, { recursive: true, force: true });
    }
  }
}

export async function readPhoto(opts: {
  photoBytes?: Uint8Array;
  photoPath?: string;
  source: string;
  reader: ReaderFamily;
  model?: string;
  timeoutMs?: number;
  runCli?: RunCli;
}): Promise<ReadPhotoResult> {
  assertValidSourceKey(opts.source);
  assertModelMatchesFamily(opts.reader, opts.model);
  const runCli = opts.runCli ?? spawnCli;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_READ_TIMEOUT_MS;
  const readerLabel = opts.model ? `${opts.reader}:${opts.model}` : opts.reader;

  let bytes: Uint8Array;
  if (opts.photoBytes) {
    bytes = opts.photoBytes;
  } else if (opts.photoPath) {
    try {
      bytes = readRegularFileNoFollow(opts.photoPath);
    } catch (err) {
      return {
        status: "cli_error",
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  } else {
    return { status: "cli_error", reason: "Either photoBytes or photoPath is required" };
  }

  const isolatedDir = mkdtempSync(join(tmpdir(), "unica-ref-read-"));
  chmodSync(isolatedDir, 0o700);
  try {
    try {
      writeFileSync(join(isolatedDir, READER_PHOTO_FILE), bytes, { mode: 0o600 });
    } catch (err) {
      return {
        status: "cli_error",
        reason: `Failed to stage photo bytes: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const first = await invokeReaderOnce({
      family: opts.reader,
      model: opts.model,
      photoDir: isolatedDir,
      prompt: REFERENCE_READ_PROMPT,
      timeoutMs,
      runCli,
    });
    if (!first.ok) {
      return { status: "cli_error", reason: first.reason };
    }

    const firstCheck = validateModelAnswer(first.raw, opts.source, readerLabel);
    if (firstCheck.ok) {
      const { record, notes, details } = applyComputedAnswers(firstCheck.record);
      return {
        status: "ok",
        record,
        notes,
        noteDetails: details.map(({ kind, path }) => ({ kind, path })),
      };
    }

    // One retry with the photo, fixed prompt, and validation errors only
    const retry = await invokeReaderOnce({
      family: opts.reader,
      model: opts.model,
      photoDir: isolatedDir,
      prompt: buildRetryPrompt(firstCheck.errors),
      timeoutMs,
      runCli,
    });
    if (!retry.ok) {
      return { status: "cli_error", reason: retry.reason };
    }

    const retryCheck = validateModelAnswer(retry.raw, opts.source, readerLabel);
    if (!retryCheck.ok) {
      return { status: "invalid", raw: retry.raw, errors: retryCheck.errors };
    }

    const { record, notes, details } = applyComputedAnswers(retryCheck.record);
    return {
      status: "ok",
      record,
      notes,
      noteDetails: details.map(({ kind, path }) => ({ kind, path })),
    };
  } finally {
    rmSync(isolatedDir, { recursive: true, force: true });
  }
}
