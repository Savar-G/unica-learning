// The freeze of a level from the working copy (architecture spec 9.2 and 11.2, UNI-242): every item that is not retired
// must be approved at its current revision; the display codes come from the positions; freezeBank runs every check of a
// full level; and the snapshot is written as insert-only items, one per item, with its content only (never `basis`).
import { ENGINE_VERSION } from "@/lib/workbook-v2/contract";
import { freezeBank, type FreezeOptions, type SheetCapacity } from "@/lib/workbook-v2/build/freeze-bank";
import type { Renderer } from "@/lib/workbook-v2/renderer";
import { draftFromRows } from "./draft";
import { approvalProblems } from "./reviews";
import { assembleSnapshot, manifestHash, snapshotItems, withDisplayCodes } from "./snapshot-items";
import type { BankStore, SnapshotMeta } from "./types";

/** Level names are numbers from 1 to 99 (Savar, 2026-11-24). */
const LEVEL_NAME = /^[1-9]\d?$/;
const SNAPSHOT_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface FreezeLevelOptions {
  renderer: Renderer;
  /** The person who freezes the level. */
  frozenBy: string;
  /** Settings of the checks, for tests. A level is always frozen whole: 20 topics of 10 sheets. */
  checks?: Omit<FreezeOptions, "requireFullLevel">;
}

export type FreezeLevelResult =
  | { ok: true; snapshotId: string; version: number; name: string; hash: string; manifestHash: string; snapshot: Record<string, unknown>; capacity: SheetCapacity[]; warnings: string[] }
  | { ok: false; problems: string[] };

/** The name of a version of a level, which is also the id inside its snapshot. */
export const snapshotName = (levelId: string, version: number): string => `${levelId}-v${version}`;

const nextVersion = (snapshots: readonly SnapshotMeta[]): number => snapshots.reduce((top, s) => Math.max(top, s.version), 0) + 1;

/** Freezes the level, or gives every problem in plain words and writes nothing. */
export async function freezeLevel(store: BankStore, levelId: string, { renderer, frozenBy, checks = {} }: FreezeLevelOptions): Promise<FreezeLevelResult> {
  const refuse = (problems: string[]): FreezeLevelResult => ({ ok: false, problems });
  const person = frozenBy.trim();
  if (person.length === 0 || person.length > 200) return refuse(["A freeze names the person who freezes the level, in 1 to 200 characters."]);
  const rows = await store.readLevel(levelId);
  if (!rows.level || rows.version === null) return refuse([`There is no bank level "${levelId}".`]);
  const levelName = rows.level.display_name;
  if (!LEVEL_NAME.test(levelName)) return refuse([`Level "${levelId}" is named "${levelName}", and a level name must be a number from 1 to 99.`]);
  const unapproved = approvalProblems(rows, await store.readReviews(levelId));
  if (unapproved.length > 0) return refuse(unapproved);

  const version = nextVersion(await store.readSnapshots(levelId));
  const name = snapshotName(levelId, version);
  if (!SNAPSHOT_NAME.test(name)) return refuse([`The level id "${levelId}" is too long to name its snapshot "${name}" (64 characters at most).`]);
  const draft = draftFromRows(rows);
  if (!draft) return refuse([`There is no bank level "${levelId}".`]);
  const frozen = await freezeBank(withDisplayCodes({ ...draft, id: name }, levelName), renderer, { ...checks, requireFullLevel: true });
  if (!frozen.ok) return frozen;

  const items = snapshotItems(frozen.snapshot);
  const manifest = manifestHash(items);
  // The items must give back exactly the snapshot that was checked, or nothing is written.
  const meta: SnapshotMeta = {
    id: "", level_id: levelId, version, name, content_hash: frozen.hash, manifest_hash: manifest, min_engine_version: ENGINE_VERSION,
    item_count: items.length, frozen_by: person, frozen_at: "",
  };
  const again = assembleSnapshot(meta, items);
  if (!again.ok) throw new Error(`freeze ${levelId}: ${again.problem}`);

  const written = await store.writeSnapshot({
    levelId, expected: rows.version, version, name, frozenBy: person, minEngineVersion: ENGINE_VERSION, contentHash: frozen.hash, manifestHash: manifest, items,
  });
  if (!written.ok) return refuse([written.problem]);
  return {
    ok: true, snapshotId: written.snapshotId, version: written.version, name, hash: frozen.hash, manifestHash: manifest, snapshot: frozen.snapshot,
    capacity: frozen.capacity, warnings: frozen.capacity.flatMap((sheet) => sheet.warnings),
  };
}
