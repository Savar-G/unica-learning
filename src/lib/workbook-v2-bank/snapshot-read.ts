// Reading a frozen snapshot back from a store: the whole snapshot (readSnapshot), or what one book needs
// (readBookSnapshot: the header, topics, word problems and only the book's sheets). `timedBookRead` is the same read with
// the timing record of the Vercel to Supabase round trip (architecture spec 9.1).
import { assembleSnapshot } from "./snapshot-items";
import type { BankStore, SnapshotMeta } from "./types";

/**
 * `whole` is the id and hash of the whole stored snapshot. Pass it to buildBook with a book's part, so the book records
 * the same snapshot and input hash as a book built from the whole snapshot.
 */
export type SnapshotRead =
  | { ok: true; meta: SnapshotMeta; snapshot: Record<string, unknown>; hash: string; whole: { id: string; hash: string } }
  | { ok: false; problem: string; notFound?: true };

const found = (meta: SnapshotMeta, snapshot: Record<string, unknown>): SnapshotRead =>
  ({ ok: true, meta, snapshot, hash: meta.content_hash, whole: { id: meta.name, hash: meta.content_hash } });

const missing = (snapshotId: string): SnapshotRead => ({ ok: false, problem: `There is no snapshot "${snapshotId}".`, notFound: true });

/** The whole snapshot, checked against its manifest and content hashes. */
export async function readSnapshot(store: BankStore, snapshotId: string): Promise<SnapshotRead> {
  const meta = await store.readSnapshotMeta(snapshotId);
  if (!meta) return missing(snapshotId);
  const assembled = assembleSnapshot(meta, await store.readSnapshotItems(snapshotId));
  return assembled.ok ? found(meta, assembled.snapshot) : assembled;
}

/**
 * The part of a snapshot that one book reads: its sheets, in level order, with the topics that name them and all word
 * problems. `hash` is the hash of the whole snapshot that the items came from; build the book with `whole`.
 */
export async function readBookSnapshot(store: BankStore, snapshotId: string, sheetIds: readonly string[]): Promise<SnapshotRead> {
  const meta = await store.readSnapshotMeta(snapshotId);
  if (!meta) return missing(snapshotId);
  const assembled = assembleSnapshot(meta, await store.readSnapshotItems(snapshotId, sheetIds), sheetIds);
  return assembled.ok ? found(meta, assembled.snapshot) : assembled;
}

/** The record of one timed read. The parts add up to `totalMs`: each rounds down, the total up, and `overheadMs` is the rest. */
export interface BookReadRecord {
  httpStatus: number;
  snapshotId: string;
  sheetCount: number;
  rowCount: number;
  payloadBytes: number;
  totalMs: number;
  parts: { snapshotMetaMs: number; itemsReadMs: number; assembleMs: number; overheadMs: number };
}

export type TimedBookRead =
  | { ok: true; record: BookReadRecord; snapshot: Record<string, unknown> }
  | { ok: false; httpStatus: 404 | 422; problem: string };

/** readBookSnapshot with a clock read between its steps. */
export async function timedBookRead(store: BankStore, snapshotId: string, sheetIds: readonly string[], clock: () => number): Promise<TimedBookRead> {
  const started = clock();
  const meta = await store.readSnapshotMeta(snapshotId);
  if (!meta) return { ok: false, httpStatus: 404, problem: `There is no snapshot "${snapshotId}".` };
  const metaRead = clock();
  const items = await store.readSnapshotItems(snapshotId, sheetIds);
  const itemsRead = clock();
  const payloadBytes = Buffer.byteLength(JSON.stringify(items));
  const assembled = assembleSnapshot(meta, items, sheetIds);
  if (!assembled.ok) return { ok: false, httpStatus: 422, problem: assembled.problem };
  const done = clock();
  const totalMs = Math.max(0, Math.ceil(done - started));
  const steps = { snapshotMetaMs: Math.floor(metaRead - started), itemsReadMs: Math.floor(itemsRead - metaRead), assembleMs: Math.floor(done - itemsRead) };
  const overheadMs = totalMs - steps.snapshotMetaMs - steps.itemsReadMs - steps.assembleMs;
  return {
    ok: true,
    snapshot: assembled.snapshot,
    record: { httpStatus: 200, snapshotId, sheetCount: sheetIds.length, rowCount: items.length, payloadBytes, totalMs, parts: { ...steps, overheadMs } },
  };
}
