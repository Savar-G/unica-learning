import { join } from "node:path";
import {
  isPlainObject,
  parseStrictUtf8Json,
  readJsonNote,
  readRegularFileIfExists,
} from "@/lib/reference-record";
import { isValidPreparedFileName, preparedFileNameForHash, resolveSafeChildPath } from "./prepare";
import type { PhotoRunEntry, ReaderMeta, ReadRunReport } from "./read";

// The two notes of a reader folder, for extract and compare: reader.json (which reader it is) and
// run.json (which photo gave which page id and which reading file). Null only when no file is there.

const READER_FILE = "reader.json";
const RUN_FILE = "run.json";
export const READER_NOTE_FILES: ReadonlySet<string> = new Set([READER_FILE, RUN_FILE]);

const RUN_HELP = "It holds machine readings only: remove the file to read the photos again";
const READER_HELP = "It says which reader made the readings of this folder: restore the file, or use a new --out folder";

const RUN_STATUSES: ReadonlySet<unknown> = new Set(["ok", "invalid", "refused", "cli_error"] satisfies PhotoRunEntry["status"][]);
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const PREPARED_NAME_RE = /^[0-9a-f]{12}\.jpg$/;

// A family that this kit does not know stays: compare sends its pages to a person, and extract refuses it.
function parseReaderMeta(raw: unknown): ReaderMeta {
  if (!isPlainObject(raw) || typeof raw.family !== "string" || raw.family === "") {
    throw new Error("the reader has no model family");
  }
  return raw as unknown as ReaderMeta;
}

function isTextOrAbsent(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

// The notes of a reading can stop a page, so notes in a wrong form never count as no notes.
function hasNotes(raw: Record<string, unknown>): boolean {
  const { notes = [], note_details: details = [] } = raw;
  return (
    Array.isArray(notes) &&
    notes.every((note) => typeof note === "string") &&
    Array.isArray(details) &&
    details.every((d: unknown) => isPlainObject(d) && typeof d.kind === "string" && typeof d.path === "string")
  );
}

// A .json file of the reader folder that is not one of its notes.
function isReadingFileName(slotDir: string, name: string): boolean {
  return (
    resolveSafeChildPath(slotDir, name) !== null && name.endsWith(".json") && !READER_NOTE_FILES.has(name.toLowerCase())
  );
}

function parseRunEntry(raw: unknown, index: number): PhotoRunEntry {
  const where = `photos[${index}]`;
  if (!isPlainObject(raw)) throw new Error(`${where} is not an object`);
  const badKey = ["original_name", "photo_sha256", "source_ref", "record_file", "invalid_file"].find((key) => !isTextOrAbsent(raw[key]));
  if (badKey !== undefined) throw new Error(`${where}.${badKey} is not text`);
  if (typeof raw.photo !== "string") throw new Error(`${where}.photo is not text`);
  if (!RUN_STATUSES.has(raw.status)) throw new Error(`${where}.status is not known`);
  if (!hasNotes(raw)) throw new Error(`${where} has notes in a wrong form`);
  const entry = raw as unknown as PhotoRunEntry;
  const { photo, photo_sha256: sha } = entry;
  if (sha !== undefined && !SHA256_HEX_RE.test(sha)) throw new Error(`${where}.photo_sha256 is not a SHA-256`);
  if (sha !== undefined && PREPARED_NAME_RE.test(photo) && !isValidPreparedFileName(photo, sha)) {
    throw new Error(`${where}: "${photo}" is not the photo of its photo_sha256 (${preparedFileNameForHash(sha)})`);
  }
  return entry;
}

function parseRunReport(raw: unknown): ReadRunReport {
  if (!isPlainObject(raw)) throw new Error("expected an object");
  if (!Array.isArray(raw.photos)) throw new Error("photos is not a list");
  if (raw.reader !== undefined) parseReaderMeta(raw.reader);
  raw.photos.forEach(parseRunEntry);
  return raw as unknown as ReadRunReport;
}

// The page id in a reading file. Null when the file is missing or holds no page id: extract reads
// the photo again, and compare stops on a reading that is not a record.
function readingRef(filePath: string): string | null {
  const bytes = readRegularFileIfExists(filePath);
  if (bytes === null) return null;
  try {
    const raw = parseStrictUtf8Json(bytes);
    return isPlainObject(raw) && typeof raw.source_ref === "string" ? raw.source_ref : null;
  } catch {
    return null;
  }
}

// Each entry has files of its own (some disks see one file in names that differ only in letter
// case), and the page id of its reading.
function checkRunLinks(slotDir: string, photos: readonly PhotoRunEntry[]): void {
  const owners = new Map<string, number>();
  photos.forEach((entry, index) => {
    for (const name of [entry.record_file, entry.invalid_file]) {
      if (name === undefined) continue;
      if (!isReadingFileName(slotDir, name)) throw new Error(`photos[${index}] names the file "${name}", which is no reading file`);
      const owner = owners.get(name.toLowerCase());
      if (owner !== undefined) throw new Error(`photos[${owner}] and photos[${index}] name one file "${name}"`);
      owners.set(name.toLowerCase(), index);
    }
    if (entry.record_file === undefined || entry.source_ref === undefined) return;
    const ref = readingRef(join(slotDir, entry.record_file));
    if (ref !== null && ref !== entry.source_ref) {
      throw new Error(`photos[${index}] gives the page ${entry.source_ref}, but its reading "${entry.record_file}" is of ${ref}`);
    }
  });
}

function withHelp<T>(help: string, read: () => T): T {
  try {
    return read();
  } catch (err) {
    throw new Error(`${err instanceof Error ? err.message : String(err)}. ${help}`);
  }
}

export interface ReaderNotes {
  meta: ReaderMeta | null;
  run: ReadRunReport | null;
}

// A damaged note, or one with wrong links, is an error that names the file: the run would pair a
// reading with another photo, remove the file of another entry, or write over the note.
export function loadReaderNotes(slotDir: string): ReaderNotes {
  const runPath = join(slotDir, RUN_FILE);
  const metaPath = join(slotDir, READER_FILE);
  const run = withHelp(RUN_HELP, () => readJsonNote(runPath, parseRunReport));
  const meta = withHelp(READER_HELP, () => readJsonNote(metaPath, parseReaderMeta));
  if (run?.reader && meta && run.reader.family !== meta.family) {
    throw new Error(
      `${runPath} holds readings from "${run.reader.family}", but ${metaPath} says "${meta.family}". Restore the files, or use a new --out folder`,
    );
  }
  if (run) {
    try {
      checkRunLinks(slotDir, run.photos);
    } catch (err) {
      throw new Error(`Wrong links in ${runPath}: ${err instanceof Error ? err.message : String(err)}. ${RUN_HELP}`);
    }
  }
  return { meta, run };
}
