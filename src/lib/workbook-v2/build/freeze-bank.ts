// The freeze of a level: a draft becomes a snapshot that books are made from. A draft is a snapshot in which the level, a
// topic, a sheet, a side and a row may also hold `basis`, a note about where the content came from. The freeze copies the
// content only, runs every check of a level, and gives the snapshot with its capacity, or every problem and no snapshot.
import { plainCopy } from "../bank/plain";
import { validateSnapshot, type SnapshotRow, type SnapshotSheet } from "../bank/snapshot";
import { ANSWER_KINDS, type Side } from "../contract";
import { canonicalJson, seedFrom } from "../hash";
import type { Renderer } from "../renderer";
import { SHAPES } from "../shapes";
import { isRecord, questionKey } from "../shapes/shape";
import { TEMPLATES } from "../layout/templates";
import { checkBank, type BankOptions, type BankReport } from "./check-bank";

/** The field of a note about a source. It never travels with the content. */
export const BASIS = "basis";
/** A full level: 20 topics of 10 sheets. */
export const FULL_LEVEL = { topics: 20, sheets: 10 };
/** A row can make this many attempts of its sheet before a question comes back: fewer is less than one full unseen repeat. */
export const UNSEEN_ATTEMPTS = 2;

export interface FreezeOptions extends BankOptions {
  /** A level that goes live must have all its topics and sheets. One topic can be frozen on its own to try it. */
  requireFullLevel?: boolean;
}

export interface RowCapacity {
  row: string;
  side: Side;
  /** The places that the row fills on its side. */
  items: number;
  /** The different questions that its limits allow. */
  possible: number;
  /** How many attempts of the sheet can each have questions of this row that no earlier attempt had. */
  attemptsWithoutRepeat: number;
  warnings: string[];
}
export interface SheetCapacity {
  sheet: string;
  attemptsWithoutRepeat: number;
  /** False when rows of a shape with no list have different limits whose pools were too large to compare for overlap, so `attemptsWithoutRepeat` is an upper bound. */
  exact: boolean;
  rows: RowCapacity[];
  warnings: string[];
}

export type FreezeResult =
  | { ok: true; snapshot: Record<string, unknown>; hash: string; capacity: SheetCapacity[]; checked: BankReport["checked"] }
  | { ok: false; problems: string[] };

const SIDES: readonly Side[] = ["front", "back"];

/** A copy of a record without its note. Anything else stays as it is, for the checks of the snapshot to name. */
const withoutBasis = (value: unknown): unknown => (isRecord(value) ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== BASIS)) : value);
const each = (value: unknown, change: (one: unknown) => unknown): unknown => (Array.isArray(value) ? value.map(change) : value);

const own = (value: Record<string, unknown>, key: string): boolean => Object.hasOwn(value, key);

/** The content of a draft: the same data with no note at the level, a topic, a sheet, a side or a row. */
export function contentOf(draft: Record<string, unknown>): Record<string, unknown> {
  const side = (raw: unknown) => {
    const one = withoutBasis(raw);
    return isRecord(one) ? { ...one, ...(own(one, "rows") ? { rows: each(one.rows, withoutBasis) } : {}) } : one;
  };
  const sheet = (raw: unknown) => {
    const one = withoutBasis(raw);
    return isRecord(one) ? { ...one, ...(own(one, "front") ? { front: side(one.front) } : {}), ...(own(one, "back") ? { back: side(one.back) } : {}) } : one;
  };
  const root = withoutBasis(draft) as Record<string, unknown>;
  return { ...root, ...(own(root, "topics") ? { topics: each(root.topics, withoutBasis) } : {}), ...(own(root, "sheets") ? { sheets: each(root.sheets, sheet) } : {}) };
}

/** Each place of the content that still holds a note: one in a place where a draft may not have it. */
function notesIn(value: unknown, place: string): string[] {
  if (Array.isArray(value)) return value.flatMap((one, i) => notesIn(one, `${place}[${i}]`));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, one]) => (key === BASIS ? [place] : notesIn(one, place === "" ? key : `${place}.${key}`)));
}

/** The pages of the sheets of each topic follow one another, in the order of the topic. */
function pageProblems(content: Record<string, unknown>, sheets: ReadonlyMap<string, SnapshotSheet>): string[] {
  const topics = Array.isArray(content.topics) ? content.topics.filter(isRecord) : [];
  return topics.flatMap((topic) => {
    const ids = Array.isArray(topic.sheets) ? topic.sheets.filter((id): id is string => typeof id === "string") : [];
    return ids.slice(1).flatMap((id, i) => {
      const [before, now] = [sheets.get(ids[i]), sheets.get(id)];
      const wanted = before ? before.firstPage + 2 : null;
      return before && now && now.firstPage !== wanted ? [`Topic "${String(topic.id)}": the sheet "${id}" starts on page ${now.firstPage} and must start on page ${wanted}, after the sheet "${before.id}".`] : [];
    });
  });
}

function levelProblems(content: Record<string, unknown>): string[] {
  const topics = Array.isArray(content.topics) ? content.topics.filter(isRecord) : [];
  const problems = topics.length === FULL_LEVEL.topics ? [] : [`The level has ${topics.length} ${topics.length === 1 ? "topic" : "topics"} and a full level has ${FULL_LEVEL.topics}.`];
  for (const topic of topics) {
    const count = Array.isArray(topic.sheets) ? topic.sheets.length : 0;
    if (count !== FULL_LEVEL.sheets) problems.push(`Topic "${String(topic.id)}" has ${count} ${count === 1 ? "sheet" : "sheets"} and a topic of a full level has ${FULL_LEVEL.sheets}.`);
  }
  return problems;
}

/** Marking reads only the kinds of answer that it knows: a row of another kind could print a question that nobody can mark. */
function kindProblems(sheets: ReadonlyMap<string, SnapshotSheet>): string[] {
  return [...sheets.values()].flatMap((sheet) => SIDES.flatMap((side) => sheet[side].rows.flatMap(({ id, shape }) =>
    ((ANSWER_KINDS as readonly string[]).includes(shape.answerKind) ? [] : [`Sheet "${sheet.id}", ${side} side, row "${id}": the shape "${shape.id}" has the answer kind "${shape.answerKind}", which marking cannot read.`]))));
}

function rowCapacity(sheet: SnapshotSheet, side: Side, { id, shape, limits, items }: SnapshotRow): RowCapacity {
  const possible = shape.count(limits);
  const attempts = Math.floor(possible / items);
  const warnings = attempts < UNSEEN_ATTEMPTS ? [`Sheet "${sheet.id}", ${side} side, row "${id}": its limits allow ${possible} ${possible === 1 ? "question" : "questions"} for ${items} ${items === 1 ? "place" : "places"}, so the next attempt of the sheet repeats ${attempts === 0 ? "a question" : "questions"} of this row.`] : [];
  return { row: id, side, items, possible, attemptsWithoutRepeat: attempts, warnings };
}

/** Largest pool of a shape with no list that we draw in full to check overlap across different limits (covers all of figure.bar, max 490). */
const OVERLAP_ENUM_LIMIT = 500;

interface SharedLimit { rows: { id: string; attempts: number }[]; items: number; possible: number; attempts: number }
interface RowEntry { side: Side; row: SnapshotRow; capacity: RowCapacity; limitKey: string }
interface KeyGroup { entries: RowEntry[]; items: number; keys: Set<string> }

/** Exact question keys of a row: from its list, or by drawing all of a bounded space of a shape with no list. */
function rowKeys(sheetId: string, { side, row, capacity }: RowEntry): Set<string> | null {
  const { shape, limits } = row;
  if (shape.list) return new Set(shape.list(limits).map((q) => questionKey(shape, q)));
  if (capacity.possible > OVERLAP_ENUM_LIMIT) return null;
  const keys = new Set<string>();
  const tries = Math.max(64, capacity.possible * 30);
  for (let i = 0; i < tries && keys.size < capacity.possible; i++) {
    keys.add(questionKey(shape, shape.generate(limits, seedFrom("capacity", sheetId, side, row.id, i)).question));
  }
  return keys.size === capacity.possible ? keys : null;
}

/**
 * Tests whether `attempts` repeat-free builds are achievable across `groups` (each needing `attempts * g.items` distinct
 * questions) via bipartite max-flow (Hopcroft-Karp). Returns null if achievable, or the Hall-violating subset otherwise.
 */
function findViolation(groups: readonly KeyGroup[], adj: readonly number[][], keyCount: number, attempts: number): { groups: KeyGroup[]; unionSize: number } | null {
  if (attempts <= 0) return null;
  const n = groups.length;
  const cap = groups.map((g) => attempts * g.items);
  const matched = new Int32Array(n);
  const owner = new Int32Array(keyCount).fill(-1);
  const dist = new Int32Array(n);
  const iter = new Int32Array(n);

  const bfs = (): boolean => {
    dist.fill(-1);
    const queue: number[] = [];
    for (let g = 0; g < n; g++) if (matched[g] < cap[g]) { dist[g] = 0; queue.push(g); }
    let found = false;
    for (let head = 0; head < queue.length; head++) {
      const g = queue[head];
      for (const q of adj[g]) {
        const who = owner[q];
        if (who === -1) found = true;
        else if (dist[who] === -1) { dist[who] = dist[g] + 1; queue.push(who); }
      }
    }
    return found;
  };

  const dfs = (g: number): boolean => {
    while (iter[g] < adj[g].length) {
      const q = adj[g][iter[g]++];
      const who = owner[q];
      if (who === -1 || (dist[who] === dist[g] + 1 && dfs(who))) { owner[q] = g; return true; }
    }
    return false;
  };

  while (bfs()) {
    iter.fill(0);
    for (let g = 0; g < n; g++) while (matched[g] < cap[g] && dfs(g)) matched[g]++;
  }
  const picked = groups.filter((_, g) => dist[g] !== -1);
  if (picked.length === 0) return null;
  const union = new Set<string>();
  for (const g of picked) for (const key of g.keys) union.add(key);
  return { groups: picked, unionSize: union.size };
}

/** Splits groups into connected components that share at least one question key. */
function connectedComponents(groups: readonly KeyGroup[]): KeyGroup[][] {
  const byKey = new Map<string, number[]>();
  groups.forEach((g, i) => {
    for (const key of g.keys) {
      const list = byKey.get(key) ?? [];
      list.push(i);
      byKey.set(key, list);
    }
  });
  const seen = new Uint8Array(groups.length);
  const components: KeyGroup[][] = [];
  for (let start = 0; start < groups.length; start++) {
    if (seen[start]) continue;
    const queue = [start];
    seen[start] = 1;
    for (let head = 0; head < queue.length; head++) {
      for (const key of groups[queue[head]].keys) {
        for (const next of byKey.get(key) ?? []) {
          if (!seen[next]) { seen[next] = 1; queue.push(next); }
        }
      }
    }
    components.push(queue.sort((a, b) => a - b).map((i) => groups[i]));
  }
  return components;
}

/** Exact repeat-free capacity and limiting subset of one connected component of groups. */
function componentCapacity(component: readonly KeyGroup[]): SharedLimit {
  const keyIndex = new Map<string, number>();
  const adj = component.map((g) => [...g.keys].map((key) => {
    const existing = keyIndex.get(key);
    if (existing !== undefined) return existing;
    const id = keyIndex.size;
    keyIndex.set(key, id);
    return id;
  }));
  const totalItems = component.reduce((sum, g) => sum + g.items, 0);
  let lo = 0;
  let hi = Math.min(Math.floor(keyIndex.size / totalItems), ...component.map((g) => Math.floor(g.keys.size / g.items)));
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (findViolation(component, adj, keyIndex.size, mid) === null) lo = mid;
    else hi = mid - 1;
  }
  const violation = findViolation(component, adj, keyIndex.size, lo + 1);
  const chosen = violation ? violation.groups : component;
  const rows = chosen.flatMap((g) => g.entries.map((e) => ({ id: e.row.id, attempts: e.capacity.attemptsWithoutRepeat })));
  const items = chosen.reduce((sum, g) => sum + g.items, 0);
  const possible = violation ? violation.unionSize : keyIndex.size;
  return { rows, items, possible, attempts: lo };
}

/** Shared-question limits across rows of one shape on a sheet, and whether overlap analysis was exact. */
function shapeSharedCapacity(sheet: SnapshotSheet, entries: readonly RowEntry[]): { limits: SharedLimit[]; exact: boolean } {
  if (entries.length < 2) return { limits: [], exact: true };
  const byLimits = new Map<string, RowEntry[]>();
  for (const entry of entries) {
    const group = byLimits.get(entry.limitKey) ?? [];
    group.push(entry);
    byLimits.set(entry.limitKey, group);
  }
  const limits: SharedLimit[] = [];
  const identicalLimit = (group: readonly RowEntry[]): SharedLimit => {
    const items = group.reduce((sum, e) => sum + e.row.items, 0);
    const possible = group[0].capacity.possible;
    return { rows: group.map((e) => ({ id: e.row.id, attempts: e.capacity.attemptsWithoutRepeat })), items, possible, attempts: Math.floor(possible / items) };
  };
  if (byLimits.size < 2) {
    for (const group of byLimits.values()) if (group.length >= 2) limits.push(identicalLimit(group));
    return { limits, exact: true };
  }
  const enumerated: KeyGroup[] = [];
  const unenumerated: RowEntry[][] = [];
  for (const group of byLimits.values()) {
    const keys = rowKeys(sheet.id, group[0]);
    if (keys) enumerated.push({ entries: group, items: group.reduce((sum, e) => sum + e.row.items, 0), keys });
    else {
      unenumerated.push(group);
      if (group.length >= 2) limits.push(identicalLimit(group));
    }
  }
  for (const component of connectedComponents(enumerated)) {
    if (component.length === 1 && component[0].entries.length < 2) continue;
    limits.push(componentCapacity(component));
  }
  const totalItems = entries.reduce((sum, e) => sum + e.row.items, 0);
  const knownMin = Math.min(...entries.map((e) => e.capacity.attemptsWithoutRepeat), ...limits.map((l) => l.attempts));
  const exact = unenumerated.every((group) => group[0].capacity.possible >= (knownMin + 1) * totalItems);
  return { limits, exact };
}

/** How many attempts each sheet allows before a row or shared group repeats a question, with warnings under two. */
export function capacityOf(sheets: ReadonlyMap<string, SnapshotSheet>): SheetCapacity[] {
  return [...sheets.values()].map((sheet) => {
    const entries: RowEntry[] = SIDES.flatMap((side) =>
      sheet[side].rows.map((row) => ({ side, row, capacity: rowCapacity(sheet, side, row), limitKey: canonicalJson(row.limits) })),
    );
    const byShape = new Map<string, RowEntry[]>();
    for (const entry of entries) {
      const list = byShape.get(entry.row.shape.id) ?? [];
      list.push(entry);
      byShape.set(entry.row.shape.id, list);
    }
    const rows = entries.map((e) => e.capacity);
    const warnings = rows.flatMap((r) => r.warnings);
    let attemptsWithoutRepeat = Math.min(...rows.map((r) => r.attemptsWithoutRepeat));
    let exact = true;
    for (const group of byShape.values()) {
      const shared = shapeSharedCapacity(sheet, group);
      if (!shared.exact) exact = false;
      for (const limit of shared.limits) {
        if (limit.attempts < attemptsWithoutRepeat) attemptsWithoutRepeat = limit.attempts;
        const singleMin = Math.min(...limit.rows.map((r) => r.attempts));
        if (limit.rows.length >= 2 && limit.attempts < UNSEEN_ATTEMPTS && limit.attempts < singleMin) {
          const names = limit.rows.map((r) => `"${r.id}"`).join(", ");
          const { possible, items, attempts } = limit;
          warnings.push(`Sheet "${sheet.id}", rows ${names}: together their limits allow ${possible} ${possible === 1 ? "question" : "questions"} for ${items} ${items === 1 ? "place" : "places"}, so ${attempts === 0 ? "one attempt of the sheet repeats a question" : "the next attempt of the sheet repeats questions"} across these rows.`);
        }
      }
    }
    return { sheet: sheet.id, attemptsWithoutRepeat, exact, rows, warnings };
  });
}

/** The frozen snapshot of a draft, or every problem of it. It changes nothing, and the same draft gives the same result. */
export async function freezeBank(draft: unknown, renderer: Renderer, options: FreezeOptions = {}): Promise<FreezeResult> {
  const { requireFullLevel = false, shapes = SHAPES, templates = TEMPLATES } = options;
  if (!isRecord(draft)) return { ok: false, problems: ["The draft must be an object."] };
  const plain = plainCopy("The draft", draft);
  if (!plain.ok) return plain;
  const content = contentOf(plain.value as Record<string, unknown>);
  const left = notesIn(content, "");
  if (left.length > 0) return { ok: false, problems: left.map((place) => `The draft has a note "${BASIS}" at ${place}, where a draft may not have one: only the level, a topic, a sheet, a side and a row may.`) };
  const bank = validateSnapshot(content, shapes, templates);
  if (!bank.ok) return bank;
  const { sheets } = bank.snapshot;
  // The drawings take most of the time of a freeze, so they wait until the content is whole.
  const problems = [...kindProblems(sheets), ...pageProblems(content, sheets), ...(requireFullLevel ? levelProblems(content) : [])];
  if (problems.length > 0) return { ok: false, problems };
  const report = await checkBank(content, renderer, options);
  if (report.problems.length > 0) return { ok: false, problems: report.problems };
  return { ok: true, snapshot: content, hash: bank.hash, capacity: capacityOf(sheets), checked: report.checked };
}
