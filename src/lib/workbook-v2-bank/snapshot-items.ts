// A frozen snapshot as rows of bank_snapshot_items, both ways (architecture spec 9.2): one row per item, so a book reads
// only the sheets it needs and two versions compare item by item. Display codes ("3-11", page 205) come from positions at
// the freeze. Every item carries the hash of its content, and a read checks each one.
import type { Json } from "@/lib/database";
import { BASIS } from "@/lib/workbook-v2/build/freeze-bank";
import { canonicalJson, sha256 } from "@/lib/workbook-v2/hash";
import type { JsonObject, SnapshotItemKind, SnapshotItemRow, SnapshotMeta } from "./types";

type Rec = Record<string, unknown>;
const isRec = (value: unknown): value is Rec => typeof value === "object" && value !== null && !Array.isArray(value);
const recs = (value: unknown): Rec[] => (Array.isArray(value) ? value.filter(isRec) : []);
const object = (value: Rec): JsonObject => value as JsonObject;

/** The lists of a snapshot that become items, and the kind of each. The rest of the top level is the header. */
const LISTS: readonly [string, SnapshotItemKind][] = [["topics", "topic"], ["sheets", "sheet"], ["questions", "question"], ["scenarios", "scenario"], ["regionPacks", "region_pack"]];
/** The word-problem lists: a snapshot holds them when it names a default region, and leaves them out when it has none. */
const STORY_LISTS = new Set(["questions", "scenarios", "regionPacks"]);
const KIND_ORDER = new Map<string, number>(["level", ...LISTS.map(([, kind]) => kind)].map((kind, i) => [kind, i]));

/** The display code of a topic: the level name, a dash and the place of the topic (from 1), such as "3-11". */
export const displayCode = (levelName: string, topicPosition: number): string => `${levelName}-${topicPosition}`;

/** The odd page of the front of a sheet: 1 for the first sheet of the level, then 3, 5 and so on (200 sheets end at 399). */
export const frontPage = (sheetsBefore: number): number => 1 + 2 * sheetsBefore;

/**
 * The draft with the display codes of its positions: each topic's code from its place, and each sheet's first page from
 * its place in the level, topic by topic. The draft lists topics and sheets in position order (draftFromRows).
 */
export function withDisplayCodes(draft: Rec, levelName: string): Rec {
  const pages = new Map<string, number>();
  const topics = recs(draft.topics).map((topic, i) => {
    for (const id of Array.isArray(topic.sheets) ? topic.sheets : []) pages.set(String(id), frontPage(pages.size));
    return { ...topic, code: displayCode(levelName, i + 1) };
  });
  const sheets = recs(draft.sheets).map((sheet) => ({ ...sheet, firstPage: pages.get(String(sheet.id)) ?? sheet.firstPage }));
  return { ...draft, topics, sheets };
}

const hashOf = (content: unknown): string => sha256(canonicalJson(content));

/** The items of a frozen snapshot. Refuses (throws) a snapshot that still holds a note: the freeze copies content only. */
export function snapshotItems(snapshot: Rec): SnapshotItemRow[] {
  if (JSON.stringify(snapshot).includes(`"${BASIS}"`)) throw new Error(`A frozen snapshot may not hold "${BASIS}".`);
  const level = snapshot.level as Rec;
  const header = Object.fromEntries(Object.entries(snapshot).filter(([key]) => !LISTS.some(([list]) => list === key)));
  const items: SnapshotItemRow[] = [{ kind: "level", key: String(level.id), position: 0, content: object(header), hash: hashOf(header) }];
  for (const [list, kind] of LISTS) {
    recs(snapshot[list]).forEach((content, position) => items.push({ kind, key: String(content.id), position, content: object(content), hash: hashOf(content) }));
  }
  return items;
}

const inOrder = (items: readonly SnapshotItemRow[]): SnapshotItemRow[] =>
  [...items].sort((a, b) => (KIND_ORDER.get(a.kind) ?? 9) - (KIND_ORDER.get(b.kind) ?? 9) || a.position - b.position);

/** The hash of the list of items: each kind, key, position and hash, in order. */
export const manifestHash = (items: readonly SnapshotItemRow[]): string =>
  hashOf(inOrder(items).map(({ kind, key, position, hash }) => ({ kind, key, position, hash })));

export type Assembled = { ok: true; snapshot: Rec } | { ok: false; problem: string };

/**
 * The snapshot that items hold. With no `sheetIds` it is the whole snapshot, checked against the manifest hash and the
 * content hash of `meta`. With `sheetIds` it holds only those sheets, in level order, and the topics that name them.
 * Every item's content must still match its hash.
 */
export function assembleSnapshot(meta: SnapshotMeta, given: readonly SnapshotItemRow[], sheetIds?: readonly string[]): Assembled {
  const changed = given.filter((item) => hashOf(item.content) !== item.hash).map((item) => `${item.kind} "${item.key}"`);
  if (changed.length > 0) return { ok: false, problem: `Snapshot ${meta.name}: the content of ${changed.join(", ")} does not match its hash.` };
  const items = inOrder(given);
  const [header, ...more] = items.filter((item) => item.kind === "level");
  if (!header || more.length > 0) return { ok: false, problem: `Snapshot ${meta.name}: it must have one level header.` };
  const listOf = (kind: SnapshotItemKind): Json[] => items.filter((item) => item.kind === kind).map((item) => item.content);
  const hasStories = Object.hasOwn(header.content, "defaultRegion");
  const lists = Object.fromEntries(LISTS.filter(([list]) => !STORY_LISTS.has(list) || hasStories).map(([list, kind]) => [list, listOf(kind)]));
  const snapshot: Rec = { ...header.content, ...lists };
  if (!sheetIds) {
    if (items.length !== meta.item_count || manifestHash(items) !== meta.manifest_hash) return { ok: false, problem: `Snapshot ${meta.name}: its items do not match its manifest.` };
    if (hashOf(snapshot) !== meta.content_hash) return { ok: false, problem: `Snapshot ${meta.name}: the snapshot does not match its hash.` };
    return { ok: true, snapshot };
  }
  const wanted = new Set(sheetIds);
  const found = new Set(recs(snapshot.sheets).map((sheet) => String(sheet.id)));
  const missing = [...wanted].filter((id) => !found.has(id));
  if (missing.length > 0) return { ok: false, problem: `Snapshot ${meta.name} has no sheet ${missing.map((id) => `"${id}"`).join(", ")}.` };
  const topics = recs(snapshot.topics)
    .map((topic) => ({ ...topic, sheets: (Array.isArray(topic.sheets) ? topic.sheets : []).filter((id) => wanted.has(String(id))) }))
    .filter((topic) => topic.sheets.length > 0);
  return { ok: true, snapshot: { ...snapshot, topics, sheets: recs(snapshot.sheets).filter((sheet) => wanted.has(String(sheet.id))) } };
}
