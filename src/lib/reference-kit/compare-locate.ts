import type { ReferenceRecord } from "@/lib/reference-record";
import type { RecordDifference } from "./compare-parts";

const PATH_TOKEN_RE = /([A-Za-z_]+)|\[(\d+)\]|\[n=(\d+)\]|\[b:(\d+)\]/g;
const NUMBERED_LIST_ENTRY_RE = /^(sections\[(\d+)\]\.items|topics)\[n=(\d+)\]$/;

// Neighbour numbers of a reader-B-only numbered entry in reader B's own list (null at list ends).
export function findReaderBNeighbours(
  bEntries: readonly { n: number }[],
  n: number,
): { reader_b_after: number | null; reader_b_before: number | null } {
  const idx = bEntries.findIndex((entry) => entry.n === n);
  if (idx === -1) return { reader_b_after: null, reader_b_before: null };
  return {
    reader_b_after: idx > 0 ? bEntries[idx - 1].n : null,
    reader_b_before: idx + 1 < bEntries.length ? bEntries[idx + 1].n : null,
  };
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
      node =
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[name]
          : undefined;
    } else if (index !== undefined) {
      out += `[${index}]`;
      node = Array.isArray(node) ? node[Number(index)] : undefined;
    } else if (keyN !== undefined) {
      const n = Number(keyN);
      const found = Array.isArray(node)
        ? node.findIndex(
            (e) => typeof e === "object" && e !== null && (e as { n?: unknown }).n === n,
          )
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

// On a fresh final record (= reader A's record):
// - a numbered entry reader A has gets its exact final_path;
// - a numbered entry only reader B has gets no final_path or insert_before (it keeps its
//   reader_b_after / reader_b_before neighbours from reader B's own list).
export function locateNumberedDiff(
  d: RecordDifference,
  finalRecord: ReferenceRecord,
): RecordDifference {
  if (d.a !== null && d.a !== undefined) {
    return {
      ...d,
      reader: "a",
      final_path: resolveDiffPath(finalRecord, d.path).jsonPath,
    };
  }
  return {
    ...d,
    reader: "b",
  };
}

// The final record holds reader a's content. A once-read entry says which reader has it and where
// it belongs in the fresh final record, so that a person can copy it after a look at the photo.
export function locateOnceRead(d: RecordDifference, finalRecord: ReferenceRecord): RecordDifference {
  const reader: "a" | "b" = d.a !== null && d.a !== undefined ? "a" : "b";
  // Reader B's neighbours stand for a place that is not sure.
  if (d.reader_b_after !== undefined || d.reader_b_before !== undefined) return { ...d, reader };
  return {
    ...d,
    reader,
    final_path: resolveDiffPath(finalRecord, d.path, d.insert_before).jsonPath,
  };
}

// For any kept record on disk (person-edited, human_checked, or invalid), give no location at all
// (no final_path and no insert_before). Reader B's own neighbour numbers stay untouched.
export function stripKeptRecordLocations(diffs: readonly RecordDifference[]): RecordDifference[] {
  return diffs.map((d) => {
    if (d.final_path === undefined && d.insert_before === undefined) return d;
    const next: RecordDifference = { ...d };
    delete next.final_path;
    delete next.insert_before;
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
        ? node.findIndex(
            (e) => typeof e === "object" && e !== null && (e as { n?: unknown }).n === n,
          )
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
