import type { ReferenceRecord } from "./types";

const RECORD_JSON_PATH_RE =
  /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[(?:0|[1-9]\d*)\])*$/;
const RECORD_JSON_PATH_TOKEN_RE = /([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\]/g;

// True when a JSON path (like "topic.title" or "sections[0].items[1].printed") is well-formed
// and resolves to an existing content node of the record (never metadata like "single_read").
export function recordPathResolves(record: ReferenceRecord, path: string): boolean {
  if (!RECORD_JSON_PATH_RE.test(path)) return false;
  let node: unknown = record;
  let isFirst = true;
  for (const m of path.matchAll(RECORD_JSON_PATH_TOKEN_RE)) {
    const [, name, index] = m;
    if (name !== undefined) {
      if (isFirst && name === "single_read") return false;
      if (
        typeof node !== "object" ||
        node === null ||
        Array.isArray(node) ||
        !Object.hasOwn(node, name)
      ) {
        return false;
      }
      const next = (node as Record<string, unknown>)[name];
      if (next === undefined) return false;
      node = next;
    } else if (index !== undefined) {
      const idx = Number(index);
      if (!Array.isArray(node) || idx < 0 || idx >= node.length || node[idx] === undefined) {
        return false;
      }
      node = node[idx];
    }
    isFirst = false;
  }
  return !isFirst;
}

export function checkStatusSingleRead(
  records: readonly ReferenceRecord[],
  statusByRef: ReadonlyMap<string, string>,
  problems: string[],
): void {
  for (const record of records) {
    const status = statusByRef.get(record.source_ref) ?? "machine_read";
    const sr = record.single_read;
    if (status === "agreement_accepted") {
      if (!sr || sr.length === 0) {
        problems.push(
          `${record.source_ref}: status "agreement_accepted" requires a non-empty single_read list`,
        );
        continue;
      }
    } else if (sr !== undefined) {
      problems.push(
        `${record.source_ref}: single_read is only allowed when status is "agreement_accepted" (got "${status}")`,
      );
    }
    if (sr !== undefined) {
      for (const path of sr) {
        if (!recordPathResolves(record, path)) {
          problems.push(
            `${record.source_ref}: single_read path "${path}" does not resolve in the record`,
          );
        }
      }
    }
  }
}
