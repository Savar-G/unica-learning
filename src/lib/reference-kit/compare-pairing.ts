import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateReferenceRecord, type ReferenceRecord } from "@/lib/reference-record";
import type { StoredAnswerNote } from "./answers";
import type { DigestMismatchInfo, FailedPhotoReport, SamePageIdConflict } from "./compare-report";
import {
  PHOTOS_MANIFEST_FILE,
  PREPARE_REPORT_FILE,
  type DuplicatePhotoReport,
  type PhotosManifest,
  type PrepareReportFile,
  type RemovedPhotoReport,
  type TooSmallPhotoReport,
  type UnreadablePhotoReport,
} from "./prepare";
import type { PhotoRunEntry, ReaderMeta, ReadRunReport } from "./read";

export interface LoadedSlot {
  meta: ReaderMeta | null;
  run: ReadRunReport | null;
  recordsByFile: Map<string, ReferenceRecord>;
  recordsByRef: Map<string, ReferenceRecord>;
}

interface OkSlotReading {
  photo: string | null;
  originalName: string | null;
  notes: string[];
  noteDetails?: StoredAnswerNote[];
  record: ReferenceRecord;
  sha256: string | null;
}

export interface PairedPage {
  photo: string | null;
  originalName: string | null;
  photoSha256: string | null;
  sameDigest: boolean;
  digestMismatch: DigestMismatchInfo | null;
  recA: ReferenceRecord | null;
  recB: ReferenceRecord | null;
  notesA: string[];
  notesB: string[];
  noteDetailsA?: StoredAnswerNote[];
  noteDetailsB?: StoredAnswerNote[];
}

const SKIP_JSON_FILES = new Set(["reader.json", "run.json"]);

export function readJsonIfExists<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

export function loadOriginalNamesByDigest(workDir: string): Map<string, string> {
  const map = new Map<string, string>();
  const manifestPath = join(workDir, "photos", PHOTOS_MANIFEST_FILE);
  const raw = readJsonIfExists<Partial<PhotosManifest>>(manifestPath);
  if (raw && Array.isArray(raw.photos)) {
    for (const p of raw.photos) {
      if (typeof p.sha256 === "string" && typeof p.original_name === "string") {
        map.set(p.sha256, p.original_name);
      }
    }
  }
  return map;
}

export function loadPrepareReport(workDir: string): {
  tooSmall: TooSmallPhotoReport[];
  unreadable: UnreadablePhotoReport[];
  duplicates: DuplicatePhotoReport[];
  removedPhotos: RemovedPhotoReport[];
} {
  const raw = readJsonIfExists<Partial<PrepareReportFile>>(join(workDir, PREPARE_REPORT_FILE));
  return {
    tooSmall: Array.isArray(raw?.too_small) ? raw.too_small : [],
    unreadable: Array.isArray(raw?.unreadable) ? raw.unreadable : [],
    duplicates: Array.isArray(raw?.duplicates) ? raw.duplicates : [],
    removedPhotos: Array.isArray(raw?.removed_photos) ? raw.removed_photos : [],
  };
}

export function loadSlot(slotDir: string): LoadedSlot {
  if (!existsSync(slotDir)) {
    return { meta: null, run: null, recordsByFile: new Map(), recordsByRef: new Map() };
  }
  const meta = readJsonIfExists<ReaderMeta>(join(slotDir, "reader.json"));
  const run = readJsonIfExists<ReadRunReport>(join(slotDir, "run.json"));
  const recordsByFile = new Map<string, ReferenceRecord>();
  const recordsByRef = new Map<string, ReferenceRecord>();

  for (const name of readdirSync(slotDir)) {
    if (!name.endsWith(".json") || name.endsWith(".invalid.json") || SKIP_JSON_FILES.has(name)) {
      continue;
    }
    const raw = JSON.parse(readFileSync(join(slotDir, name), "utf8")) as unknown;
    const check = validateReferenceRecord(raw);
    if (!check.ok) {
      throw new Error(
        `Invalid record ${join(slotDir, name)}: ${check.errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`,
      );
    }
    recordsByFile.set(name, check.record);
    recordsByRef.set(check.record.source_ref, check.record);
  }

  return { meta, run, recordsByFile, recordsByRef };
}

function resolveOriginalName(
  entry: PhotoRunEntry,
  originalNamesByDigest: Map<string, string>,
): string | null {
  if (typeof entry.original_name === "string" && entry.original_name.length > 0) {
    return entry.original_name;
  }
  if (typeof entry.photo_sha256 === "string") {
    return originalNamesByDigest.get(entry.photo_sha256) ?? null;
  }
  return null;
}

// Every valid reading in the reader folder: the "ok" entries of run.json, then each valid record
// file that no run.json entry names (it is paired by page id, as it has no photo digest).
function collectOkReadings(
  slot: LoadedSlot,
  slotLabel: "a" | "b",
  originalNamesByDigest: Map<string, string>,
  failedPhotos: FailedPhotoReport[],
): OkSlotReading[] {
  const ok: OkSlotReading[] = [];
  const namedFiles = new Set<string>();
  for (const p of slot.run?.photos ?? []) {
    if (p.record_file) namedFiles.add(p.record_file);
    if (p.status !== "ok") {
      failedPhotos.push({
        slot: slotLabel,
        photo: p.photo,
        original_name: resolveOriginalName(p, originalNamesByDigest),
        status: p.status,
        reason: p.reason,
      });
      continue;
    }
    const rec = p.record_file ? (slot.recordsByFile.get(p.record_file) ?? null) : null;
    if (!rec) continue;
    const sha = typeof p.photo_sha256 === "string" && p.photo_sha256.length > 0 ? p.photo_sha256 : null;
    ok.push({
      photo: p.photo,
      originalName: resolveOriginalName(p, originalNamesByDigest),
      notes: p.notes ?? [],
      ...(Array.isArray(p.note_details) ? { noteDetails: p.note_details } : {}),
      record: rec,
      sha256: sha,
    });
  }
  for (const [file, rec] of slot.recordsByFile) {
    if (namedFiles.has(file)) continue;
    ok.push({ photo: null, originalName: null, notes: [], record: rec, sha256: null });
  }
  return ok;
}

function collectBothFailedPhotos(
  slotA: LoadedSlot,
  slotB: LoadedSlot,
  pairedDigests: Set<string>,
  originalNamesByDigest: Map<string, string>,
): UnreadablePhotoReport[] {
  const out: UnreadablePhotoReport[] = [];
  const failedA = new Map<string, PhotoRunEntry>();
  const failedB = new Map<string, PhotoRunEntry>();

  for (const p of slotA.run?.photos ?? []) {
    if (p.status !== "ok") failedA.set(p.photo_sha256 ?? p.photo, p);
  }
  for (const p of slotB.run?.photos ?? []) {
    if (p.status !== "ok") failedB.set(p.photo_sha256 ?? p.photo, p);
  }

  const seenKeys = new Set<string>([...failedA.keys(), ...failedB.keys()]);
  for (const key of seenKeys) {
    if (pairedDigests.has(key)) continue;
    const a = failedA.get(key);
    const b = failedB.get(key);
    const refEntry = a ?? b;
    if (!refEntry) continue;
    if (a && !b && slotB.run?.photos.some((p) => p.status === "ok" && (p.photo_sha256 ?? p.photo) === key)) {
      continue;
    }
    if (b && !a && slotA.run?.photos.some((p) => p.status === "ok" && (p.photo_sha256 ?? p.photo) === key)) {
      continue;
    }
    const name = resolveOriginalName(refEntry, originalNamesByDigest) ?? refEntry.photo;
    const parts: string[] = [];
    if (a) parts.push(`reader a: ${a.status}${a.reason ? ` (${a.reason})` : ""}`);
    if (b) parts.push(`reader b: ${b.status}${b.reason ? ` (${b.reason})` : ""}`);
    out.push({ original_name: name, reason: parts.join("; ") });
  }
  return out;
}

export function pairSlotPages(
  slotA: LoadedSlot,
  slotB: LoadedSlot,
  originalNamesByDigest: Map<string, string>,
): {
  pairs: PairedPage[];
  failedPhotos: FailedPhotoReport[];
  bothFailedPhotos: UnreadablePhotoReport[];
} {
  const failedPhotos: FailedPhotoReport[] = [];
  const pairs: PairedPage[] = [];

  if (slotA.run || slotB.run) {
    const okA = collectOkReadings(slotA, "a", originalNamesByDigest, failedPhotos);
    const okB = collectOkReadings(slotB, "b", originalNamesByDigest, failedPhotos);

    const bByDigest = new Map<string, number>();
    okB.forEach((item, idx) => {
      if (item.sha256 && !bByDigest.has(item.sha256)) {
        bByDigest.set(item.sha256, idx);
      }
    });

    const usedB = new Set<number>();
    const unmatchedA: OkSlotReading[] = [];

    for (const itemA of okA) {
      const bIdx = itemA.sha256 ? bByDigest.get(itemA.sha256) : undefined;
      if (bIdx !== undefined && !usedB.has(bIdx)) {
        const itemB = okB[bIdx];
        usedB.add(bIdx);
        pairs.push({
          photo: itemA.photo,
          originalName: itemA.originalName ?? itemB.originalName,
          photoSha256: itemA.sha256,
          sameDigest: true,
          digestMismatch: null,
          recA: itemA.record,
          recB: itemB.record,
          notesA: itemA.notes,
          notesB: itemB.notes,
          noteDetailsA: itemA.noteDetails,
          noteDetailsB: itemB.noteDetails,
        });
      } else {
        unmatchedA.push(itemA);
      }
    }

    const unmatchedB = okB.filter((_, idx) => !usedB.has(idx));
    const bUnmatchedByRef = new Map<string, number>();
    unmatchedB.forEach((item, idx) => {
      if (!bUnmatchedByRef.has(item.record.source_ref)) {
        bUnmatchedByRef.set(item.record.source_ref, idx);
      }
    });
    const usedUnmatchedB = new Set<number>();

    for (const itemA of unmatchedA) {
      const bIdx = bUnmatchedByRef.get(itemA.record.source_ref);
      if (bIdx !== undefined && !usedUnmatchedB.has(bIdx)) {
        const itemB = unmatchedB[bIdx];
        usedUnmatchedB.add(bIdx);
        pairs.push({
          photo: itemA.photo ?? itemB.photo,
          originalName: itemA.originalName ?? itemB.originalName,
          photoSha256: null,
          sameDigest: false,
          digestMismatch: { a: itemA.sha256, b: itemB.sha256 },
          recA: itemA.record,
          recB: itemB.record,
          notesA: itemA.notes,
          notesB: itemB.notes,
          noteDetailsA: itemA.noteDetails,
          noteDetailsB: itemB.noteDetails,
        });
      } else {
        pairs.push({
          photo: itemA.photo,
          originalName: itemA.originalName,
          photoSha256: itemA.sha256,
          sameDigest: false,
          digestMismatch: null,
          recA: itemA.record,
          recB: null,
          notesA: itemA.notes,
          notesB: [],
          noteDetailsA: itemA.noteDetails,
        });
      }
    }

    unmatchedB.forEach((itemB, idx) => {
      if (usedUnmatchedB.has(idx)) return;
      pairs.push({
        photo: itemB.photo,
        originalName: itemB.originalName,
        photoSha256: itemB.sha256,
        sameDigest: false,
        digestMismatch: null,
        recA: null,
        recB: itemB.record,
        notesA: [],
        notesB: itemB.notes,
        noteDetailsB: itemB.noteDetails,
      });
    });

    const pairedDigests = new Set<string>();
    for (const pair of pairs) {
      if (pair.photoSha256) pairedDigests.add(pair.photoSha256);
      if (pair.photo) pairedDigests.add(pair.photo);
    }
    const bothFailedPhotos = collectBothFailedPhotos(
      slotA,
      slotB,
      pairedDigests,
      originalNamesByDigest,
    );

    return { pairs, failedPhotos, bothFailedPhotos };
  }

  const refOrder: string[] = [];
  for (const ref of slotA.recordsByRef.keys()) refOrder.push(ref);
  for (const ref of slotB.recordsByRef.keys()) {
    if (!slotA.recordsByRef.has(ref)) refOrder.push(ref);
  }
  refOrder.sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));

  for (const ref of refOrder) {
    pairs.push({
      photo: null,
      originalName: null,
      photoSha256: null,
      sameDigest: false,
      digestMismatch: null,
      recA: slotA.recordsByRef.get(ref) ?? null,
      recB: slotB.recordsByRef.get(ref) ?? null,
      notesA: [],
      notesB: [],
    });
  }
  return { pairs, failedPhotos, bothFailedPhotos: [] };
}

// The page id of a pair: reader A's id, or reader B's when reader A has no reading.
export function pairSourceRef(pair: PairedPage): string | null {
  return (pair.recA ?? pair.recB)?.source_ref ?? null;
}

// The photo digest that a pair's final record belongs to.
export function pairDigest(pair: PairedPage): string | null {
  return pair.photoSha256 ?? pair.digestMismatch?.a ?? pair.digestMismatch?.b ?? null;
}

function compareByOriginalName(x: PairedPage, y: PairedPage): number {
  const nx = x.originalName ?? x.photo;
  const ny = y.originalName ?? y.photo;
  if (nx === null || ny === null) return nx === ny ? 0 : nx === null ? 1 : -1;
  return nx.localeCompare(ny, undefined, { numeric: true });
}

// Among the photos that claim one page id, the photo where both readers give that id wins; when
// several such photos exist (or none), the first by original name wins. Every other photo is a
// conflict: it gets no final record and keeps its readings.
export function pickPageWinners(pairs: readonly PairedPage[]): {
  winners: PairedPage[];
  conflicts: SamePageIdConflict[];
} {
  const byRef = new Map<string, PairedPage[]>();
  for (const pair of pairs) {
    const ref = pairSourceRef(pair);
    if (!ref) continue;
    const group = byRef.get(ref) ?? [];
    group.push(pair);
    byRef.set(ref, group);
  }
  const losers = new Set<PairedPage>();
  const conflicts: SamePageIdConflict[] = [];
  for (const [ref, group] of byRef) {
    if (group.length < 2) continue;
    // Agreement counts only when both readings come from the same photo.
    const agreeing = group.filter(
      (p) => !p.digestMismatch && p.recA?.source_ref === ref && p.recB?.source_ref === ref,
    );
    const winner = [...(agreeing.length > 0 ? agreeing : group)].sort(compareByOriginalName)[0];
    for (const pair of [...group].sort(compareByOriginalName)) {
      if (pair === winner) continue;
      losers.add(pair);
      conflicts.push({
        source_ref: ref,
        winner_original_name: winner.originalName,
        winner_photo: winner.photo,
        photo: pair.photo,
        original_name: pair.originalName,
        photo_sha256: pairDigest(pair),
        reader_a_source_ref: pair.recA?.source_ref ?? null,
        reader_b_source_ref: pair.recB?.source_ref ?? null,
      });
    }
  }
  return { winners: pairs.filter((p) => !losers.has(p)), conflicts };
}
