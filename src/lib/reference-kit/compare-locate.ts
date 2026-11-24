import type { PageItem, PageSection, ReferenceRecord } from "@/lib/reference-record";
import { deepEqual, type RecordDifference } from "./compare-parts";
import { normalizeNotationText, normalizeProseText } from "./normalize";

const PATH_TOKEN_RE = /([A-Za-z_]+)|\[(\d+)\]|\[n=(\d+)\]|\[b:(\d+)\]/g;
const NUMBERED_LIST_ENTRY_RE = /^(sections\[(\d+)\]\.items|topics)\[n=(\d+)\]$/;

function isStrictlyAscendingByN(entries: readonly { n: number }[]): boolean {
  for (let i = 1; i < entries.length; i += 1) {
    if (entries[i].n <= entries[i - 1].n) return false;
  }
  return true;
}

// Finds the index before which a missing numbered entry belongs in `targetEntries`.
// When `targetEntries` is in ascending number order (always true for contents topics, and the
// standard order for page items), places `missingN` before the first entry with a higher number.
// Otherwise falls back to the first following entry in `bEntries` that also exists in `targetEntries`.
export function findNumberedInsertBefore(
  targetEntries: readonly { n: number }[],
  missingN: number,
  bEntries?: readonly { n: number }[],
): number | undefined {
  if (isStrictlyAscendingByN(targetEntries)) {
    const idx = targetEntries.findIndex((entry) => entry.n > missingN);
    return idx === -1 ? undefined : idx;
  }
  if (bEntries) {
    const targetIndexByN = new Map<number, number>();
    targetEntries.forEach((entry, idx) => targetIndexByN.set(entry.n, idx));
    const bIdx = bEntries.findIndex((entry) => entry.n === missingN);
    if (bIdx !== -1) {
      for (let i = bIdx + 1; i < bEntries.length; i += 1) {
        const targetIdx = targetIndexByN.get(bEntries[i].n);
        if (targetIdx !== undefined) return targetIdx;
      }
    }
  }
  return undefined;
}

// Follows a comparison path (with "[n=3]" item and step keys and "[b:1]" reader-b-only entries)
// through a record. Returns the JSON path of the place in that record and the value there.
export function resolveDiffPath(
  record: unknown,
  path: string,
  insertBefore?: number,
): { jsonPath: string; value: unknown } {
  let node: unknown = record;
  let out = "";
  for (const m of path.matchAll(PATH_TOKEN_RE)) {
    const [, name, index, keyN, bIndex] = m;
    if (name !== undefined) {
      out += out ? `.${name}` : name;
      node = typeof node === "object" && node !== null ? (node as Record<string, unknown>)[name] : undefined;
    } else if (index !== undefined) {
      out += `[${index}]`;
      node = Array.isArray(node) ? node[Number(index)] : undefined;
    } else if (keyN !== undefined) {
      const n = Number(keyN);
      const found = Array.isArray(node)
        ? node.findIndex((e) => typeof e === "object" && e !== null && (e as { n?: unknown }).n === n)
        : -1;
      if (found !== -1) {
        out += `[${found}]`;
        node = (node as unknown[])[found];
      } else {
        out += insertBefore !== undefined ? `[${insertBefore}]` : "[]";
        node = undefined;
      }
    } else if (bIndex !== undefined) {
      out += insertBefore !== undefined ? `[${insertBefore}]` : "[]";
      node = undefined;
    }
  }
  return { jsonPath: out, value: node };
}

export function isOneSidedNumberedEntry(d: RecordDifference): boolean {
  return (
    d.kind === "value" &&
    NUMBERED_LIST_ENTRY_RE.test(d.path) &&
    (d.a === null) !== (d.b === null)
  );
}

// The final record holds reader a's content. A once-read entry says which reader has it and where
// it belongs in the final record, so that a person can copy it after a look at the photo.
export function locateOnceRead(d: RecordDifference, finalRecord: ReferenceRecord): RecordDifference {
  const reader: "a" | "b" = d.a !== null && d.a !== undefined ? "a" : "b";
  return {
    ...d,
    reader,
    final_path: resolveDiffPath(finalRecord, d.path, d.insert_before).jsonPath,
  };
}

function findEqualNode(node: unknown, target: unknown, path: string): string | null {
  if (path && deepEqual(node, target)) return path;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      const found = findEqualNode(node[i], target, `${path}[${i}]`);
      if (found !== null) return found;
    }
  } else if (typeof node === "object" && node !== null) {
    for (const [key, value] of Object.entries(node)) {
      const found = findEqualNode(value, target, path ? `${path}.${key}` : key);
      if (found !== null) return found;
    }
  }
  return null;
}

// The part of a record that a once-read path belongs to: the same section or example index (or
// the whole list, for a whole section or example). Null when the path names no such part.
function onceReadParent(record: ReferenceRecord, path: string): { path: string; node: unknown } | null {
  const m = /^(sections|examples)(?:\[(\d+)\](?=[.[]))?/.exec(path);
  if (!m) return null;
  const list = (record as unknown as Record<string, unknown>)[m[1]];
  if (!Array.isArray(list)) return null;
  if (m[2] === undefined) return { path: m[1], node: list };
  const index = Number(m[2]);
  return index < list.length ? { path: `${m[1]}[${index}]`, node: list[index] } : null;
}

function normalizeSectionInstruction(instruction: unknown): unknown {
  return typeof instruction === "string" ? normalizeProseText(instruction) : instruction;
}

function sectionsShareShape(a: PageSection, b: PageSection): boolean {
  if (normalizeSectionInstruction(a.instruction) !== normalizeSectionInstruction(b.instruction)) {
    return false;
  }
  if (a.items.length === 0 || b.items.length === 0) return true;
  const bNs = new Set(b.items.map((item) => item.n));
  return a.items.some((item) => bNs.has(item.n));
}

function itemsMatchPrinted(a: PageItem, b: PageItem): boolean {
  if (a.n !== b.n) return false;
  if (a.expr === null && b.expr === null) {
    return normalizeProseText(a.printed) === normalizeProseText(b.printed);
  }
  return normalizeNotationText(a.printed) === normalizeNotationText(b.printed);
}

// True when section `sectionIndex` in the kept record can be matched to reader A's section at the
// same index with certainty: same section count, and for multi-section pages every section keeps
// its normalized instruction and shares at least one item number when both have items. If another
// section in reader A cannot be told from the target by that test, the kept section must also keep
// at least one item (same n and normalized printed text) from reader A's target that is absent from
// every look-alike section.
function sectionsMatchPosition(
  kept: ReferenceRecord,
  readerA: ReferenceRecord | null | undefined,
  sectionIndex: number,
): boolean {
  if (kept.kind !== "page") return false;
  if (sectionIndex < 0 || sectionIndex >= kept.sections.length) return false;
  if (readerA === undefined) return true;
  if (readerA === null || readerA.kind !== "page") return false;
  if (kept.sections.length !== readerA.sections.length) return false;
  if (kept.sections.length > 1) {
    for (let i = 0; i < kept.sections.length; i += 1) {
      if (!sectionsShareShape(kept.sections[i], readerA.sections[i])) return false;
    }
    const targetA = readerA.sections[sectionIndex];
    const lookAlikes = readerA.sections.filter(
      (sec, idx) => idx !== sectionIndex && sectionsShareShape(sec, targetA),
    );
    if (lookAlikes.length > 0) {
      const keptTarget = kept.sections[sectionIndex];
      const hasUniqueTargetItem = keptTarget.items.some(
        (keptItem) =>
          targetA.items.some((aItem) => itemsMatchPrinted(keptItem, aItem)) &&
          !lookAlikes.some((other) => other.items.some((oItem) => itemsMatchPrinted(keptItem, oItem))),
      );
      if (!hasUniqueTargetItem) return false;
    }
  }
  return true;
}

// The final record on disk is one that a person edited or checked, so reader a's indexes may not
// fit it. A once-read entry keeps a final_path only when the entry is in that record with equal
// content, inside the same section or example; otherwise the person finds the place.
export function locateOnceReadInKeptRecord(
  onceRead: readonly RecordDifference[],
  kept: ReferenceRecord | null,
  readerA?: ReferenceRecord | null,
): RecordDifference[] {
  return onceRead.map((d) => {
    const next: RecordDifference = { path: d.path, a: d.a, b: d.b, kind: d.kind };
    if (d.reader) next.reader = d.reader;
    if (!kept || !d.reader) {
      if (d.missing_step) next.missing_step = true;
      return next;
    }
    const secMatch = /^sections\[(\d+)\](?=[.[])/.exec(d.path);
    if (secMatch && !sectionsMatchPosition(kept, readerA, Number(secMatch[1]))) {
      next.location_unknown = true;
      if (d.missing_step) next.missing_step = true;
      return next;
    }
    const entry = d.reader === "a" ? d.a : d.b;
    const parent = onceReadParent(kept, d.path);
    if (!parent) {
      if (d.missing_step) next.missing_step = true;
      return next;
    }
    const at = resolveDiffPath(kept, d.path);
    if (at.value !== undefined && deepEqual(at.value, entry)) {
      next.final_path = at.jsonPath;
    } else if (typeof entry === "object" && entry !== null) {
      const found = findEqualNode(parent.node, entry, parent.path);
      if (found !== null) next.final_path = found;
    }
    if (d.missing_step && next.final_path === undefined) next.missing_step = true;
    return next;
  });
}

function resolveNumberedList(
  record: ReferenceRecord,
  listPath: string,
  sectionIndex: string | undefined,
): readonly { n: number }[] | null {
  if (listPath === "topics") {
    return record.kind === "contents" ? record.topics : null;
  }
  if (sectionIndex !== undefined && record.kind === "page") {
    const si = Number(sectionIndex);
    return si >= 0 && si < record.sections.length ? record.sections[si].items : null;
  }
  return null;
}

// Re-resolves numbered list difference locations against the kept record on disk (edited or checked),
// so final_path and insert_before reflect the kept record's actual indexes and order, not reader A's.
// When a section cannot be matched with certainty against reader A, omits final_path and marks
// location_unknown so the report does not point at the wrong section.
export function locateDifferencesInKeptRecord(
  diffs: readonly RecordDifference[],
  kept: ReferenceRecord | null,
  readerB?: ReferenceRecord | null,
  readerA?: ReferenceRecord | null,
): RecordDifference[] {
  return diffs.map((d) => {
    if (!isOneSidedNumberedEntry(d)) return d;
    const reader: "a" | "b" = d.reader ?? (d.a !== null && d.a !== undefined ? "a" : "b");
    const next: RecordDifference = { path: d.path, a: d.a, b: d.b, kind: d.kind, reader };
    if (!kept) {
      next.location_unknown = true;
      return next;
    }
    const match = NUMBERED_LIST_ENTRY_RE.exec(d.path);
    if (!match) return next;
    const [, listPath, sectionIndex, keyN] = match;
    if (sectionIndex !== undefined && !sectionsMatchPosition(kept, readerA, Number(sectionIndex))) {
      next.location_unknown = true;
      return next;
    }
    const keptList = resolveNumberedList(kept, listPath, sectionIndex);
    if (!keptList) {
      next.location_unknown = true;
      return next;
    }
    const n = Number(keyN);
    const foundIdx = keptList.findIndex((entry) => entry.n === n);
    if (foundIdx !== -1) {
      next.final_path = `${listPath}[${foundIdx}]`;
      return next;
    }
    if (reader === "b") {
      const bList = readerB
        ? (resolveNumberedList(readerB, listPath, sectionIndex) ?? undefined)
        : undefined;
      const insertBefore = findNumberedInsertBefore(keptList, n, bList);
      if (insertBefore !== undefined) {
        next.insert_before = insertBefore;
        next.final_path = `${listPath}[${insertBefore}]`;
      } else {
        next.final_path = `${listPath}[]`;
      }
    }
    return next;
  });
}

// Resolves a comparison path to the deepest existing JSON path in `record`.
// When a differing entry is absent from `record` (reader-B-only "[b:k]", missing "[n=k]",
// out-of-range index, or omitted optional key), stops at the existing containing list or object.
function resolveExistingRecordPath(record: unknown, path: string): string {
  let node: unknown = record;
  let out = "";
  for (const m of path.matchAll(PATH_TOKEN_RE)) {
    const [, name, index, keyN, bIndex] = m;
    if (name !== undefined) {
      if (
        typeof node !== "object" ||
        node === null ||
        Array.isArray(node) ||
        !Object.hasOwn(node, name) ||
        (node as Record<string, unknown>)[name] === undefined
      ) {
        break;
      }
      out += out ? `.${name}` : name;
      node = (node as Record<string, unknown>)[name];
    } else if (index !== undefined) {
      const idx = Number(index);
      if (!Array.isArray(node) || idx < 0 || idx >= node.length || node[idx] === undefined) {
        break;
      }
      out += `[${idx}]`;
      node = node[idx];
    } else if (keyN !== undefined) {
      const n = Number(keyN);
      const found = Array.isArray(node)
        ? node.findIndex((e) => typeof e === "object" && e !== null && (e as { n?: unknown }).n === n)
        : -1;
      if (found === -1) break;
      out += `[${found}]`;
      node = (node as unknown[])[found];
    } else if (bIndex !== undefined) {
      break;
    }
  }
  return out;
}

export function resolveSingleReadPaths(
  finalRecord: ReferenceRecord,
  diffs: readonly RecordDifference[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const d of diffs) {
    if (d.kind === "wording" || d.kind === "empty_answer") continue;
    const jsonPath = resolveExistingRecordPath(finalRecord, d.path);
    if (jsonPath && !seen.has(jsonPath)) {
      seen.add(jsonPath);
      out.push(jsonPath);
    }
  }
  return out;
}
