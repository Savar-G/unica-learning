import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateReferenceRecord, type ReferenceRecord } from "@/lib/reference-record";
import type { DigestMismatchInfo, FailedPhotoReport } from "./compare-report";
import {
  PHOTOS_MANIFEST_FILE,
  PREPARE_REPORT_FILE,
  type PhotosManifest,
  type PrepareReportFile,
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
  entry: PhotoRunEntry;
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
} {
  const raw = readJsonIfExists<Partial<PrepareReportFile>>(join(workDir, PREPARE_REPORT_FILE));
  return {
    tooSmall: Array.isArray(raw?.too_small) ? raw.too_small : [],
    unreadable: Array.isArray(raw?.unreadable) ? raw.unreadable : [],
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

function collectOkReadings(
  slot: LoadedSlot,
  slotLabel: "a" | "b",
  originalNamesByDigest: Map<string, string>,
  failedPhotos: FailedPhotoReport[],
): OkSlotReading[] {
  const ok: OkSlotReading[] = [];
  for (const p of slot.run?.photos ?? []) {
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
    ok.push({ entry: p, record: rec, sha256: sha });
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
          photo: itemA.entry.photo,
          originalName:
            resolveOriginalName(itemA.entry, originalNamesByDigest) ??
            resolveOriginalName(itemB.entry, originalNamesByDigest),
          photoSha256: itemA.sha256,
          sameDigest: true,
          digestMismatch: null,
          recA: itemA.record,
          recB: itemB.record,
          notesA: itemA.entry.notes ?? [],
          notesB: itemB.entry.notes ?? [],
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
          photo: itemA.entry.photo,
          originalName: resolveOriginalName(itemA.entry, originalNamesByDigest),
          photoSha256: null,
          sameDigest: false,
          digestMismatch: { a: itemA.sha256, b: itemB.sha256 },
          recA: itemA.record,
          recB: itemB.record,
          notesA: itemA.entry.notes ?? [],
          notesB: itemB.entry.notes ?? [],
        });
      } else {
        pairs.push({
          photo: itemA.entry.photo,
          originalName: resolveOriginalName(itemA.entry, originalNamesByDigest),
          photoSha256: itemA.sha256,
          sameDigest: false,
          digestMismatch: null,
          recA: itemA.record,
          recB: null,
          notesA: itemA.entry.notes ?? [],
          notesB: [],
        });
      }
    }

    unmatchedB.forEach((itemB, idx) => {
      if (usedUnmatchedB.has(idx)) return;
      pairs.push({
        photo: itemB.entry.photo,
        originalName: resolveOriginalName(itemB.entry, originalNamesByDigest),
        photoSha256: itemB.sha256,
        sameDigest: false,
        digestMismatch: null,
        recA: null,
        recB: itemB.record,
        notesA: [],
        notesB: itemB.entry.notes ?? [],
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
