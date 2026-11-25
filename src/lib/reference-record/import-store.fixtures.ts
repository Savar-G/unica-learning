import type { ExistingReferenceRow, ReferenceRow, ReferenceStore } from "./import";
import { sha256Hex } from "./read-file";

// The path that a new photo of a page gets.
export function contentPath(sourceRef: string, ext: string, bytes: Uint8Array): string {
  return `${sourceRef.replaceAll(":", "/")}.${sha256Hex(bytes).slice(0, 16)}.${ext}`;
}

// A stored row also has the columns the import never sends: id, created_at and updated_at.
export type StoredRow = Omit<ReferenceRow, "transcript_status"> & {
  transcript_status: string;
  id?: string;
  created_at?: string;
  updated_at?: string;
};

// The import target in memory. Like the bucket, uploadObject never overwrites an object.
export class MemoryReferenceStore implements ReferenceStore {
  rows = new Map<string, StoredRow>();
  objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  calls: string[] = [];
  // Injected clock: each write takes the next tick as its time.
  private tick = 0;
  private now(): string {
    this.tick += 1;
    return `t${this.tick}`;
  }

  async findExisting(sourceRefs: string[]): Promise<Map<string, ExistingReferenceRow>> {
    this.calls.push(`findExisting:${sourceRefs.join(",")}`);
    const out = new Map<string, ExistingReferenceRow>();
    for (const ref of sourceRefs) {
      const row = this.rows.get(ref);
      if (row) {
        out.set(ref, {
          transcript: structuredClone(row.transcript),
          path: row.path,
          transcript_status: row.transcript_status,
          updated_at: row.updated_at ?? "",
        });
      }
    }
    return out;
  }

  async insertRow(row: ReferenceRow): Promise<boolean> {
    this.calls.push(`insertRow:${row.source_ref}`);
    if (this.rows.has(row.source_ref)) {
      return false;
    }
    const at = this.now();
    this.rows.set(row.source_ref, {
      ...structuredClone(row),
      id: `id-${row.source_ref}`,
      created_at: at,
      updated_at: at,
    });
    return true;
  }

  async updateRow(row: ReferenceRow, seen: ExistingReferenceRow): Promise<boolean> {
    this.calls.push(`updateRow:${row.source_ref}`);
    const prev = this.rows.get(row.source_ref);
    if (
      prev === undefined ||
      prev.path !== seen.path ||
      prev.transcript_status !== seen.transcript_status ||
      (prev.updated_at ?? "") !== seen.updated_at
    ) {
      return false;
    }
    this.rows.set(row.source_ref, {
      ...prev,
      kind: row.kind,
      path: row.path,
      transcript: structuredClone(row.transcript),
      transcript_status: row.transcript_status,
      updated_at: this.now(),
    });
    return true;
  }

  async refsByPath(paths: string[]): Promise<Map<string, string[]>> {
    this.calls.push(`refsByPath:${paths.join(",")}`);
    const out = new Map<string, string[]>();
    for (const row of this.rows.values()) {
      if (row.path !== null && paths.includes(row.path)) {
        out.set(row.path, [...(out.get(row.path) ?? []), row.source_ref]);
      }
    }
    return out;
  }

  async objectSha256(path: string): Promise<string | null> {
    this.calls.push(`objectSha256:${path}`);
    const existing = this.objects.get(path);
    return existing ? sha256Hex(existing.bytes) : null;
  }

  async uploadObject(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.calls.push(`uploadObject:${path}`);
    if (this.objects.has(path)) {
      throw new Error(`Unexpected overwrite of existing object ${path}`);
    }
    this.objects.set(path, { bytes: new Uint8Array(bytes), contentType });
  }
}
