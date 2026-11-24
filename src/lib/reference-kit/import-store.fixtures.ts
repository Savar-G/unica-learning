import { createHash } from "node:crypto";
import type { ExistingReferenceRow, ReferenceRow, ReferenceStore } from "@/lib/reference-record";

// The import target in memory.
export class MemoryImportStore implements ReferenceStore {
  rows = new Map<string, ReferenceRow>();
  objects = new Map<string, { bytes: Uint8Array; contentType: string }>();

  async findExisting(sourceRefs: string[]): Promise<Map<string, ExistingReferenceRow>> {
    const out = new Map<string, ExistingReferenceRow>();
    for (const ref of sourceRefs) {
      const row = this.rows.get(ref);
      if (row) {
        out.set(ref, {
          transcript: structuredClone(row.transcript),
          path: row.path,
          transcript_status: row.transcript_status,
        });
      }
    }
    return out;
  }

  async insertRow(row: ReferenceRow): Promise<boolean> {
    if (this.rows.has(row.source_ref)) return false;
    this.rows.set(row.source_ref, structuredClone(row));
    return true;
  }

  async objectSha256(path: string): Promise<string | null> {
    const existing = this.objects.get(path);
    return existing ? createHash("sha256").update(existing.bytes).digest("hex") : null;
  }

  async uploadObject(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.objects.set(path, { bytes: new Uint8Array(bytes), contentType });
  }

  async replaceObject(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.objects.set(path, { bytes: new Uint8Array(bytes), contentType });
  }

  async refsByPath(paths: string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    for (const row of this.rows.values()) {
      if (row.path !== null && paths.includes(row.path)) {
        out.set(row.path, [...(out.get(row.path) ?? []), row.source_ref]);
      }
    }
    return out;
  }

  async updateRow(row: ReferenceRow): Promise<boolean> {
    const prev = this.rows.get(row.source_ref);
    if (!prev) return false;
    this.rows.set(row.source_ref, { ...structuredClone(row), note: prev.note });
    return true;
  }
}
