// The admin export's reads (#200) from tables in memory: for the export's tests and the local demo. The same rules as
// the Supabase reader in src/lib/admin-store.ts: id order, only the asked-for columns, and pages no longer than asked.
import type { ExportReader, ExportRow, PagedTable, TestTable } from "@/lib/admin-export";

export type ExportData = { testFamilies: string[] } & Record<PagedTable | TestTable, ExportRow[]>;

const only = (row: ExportRow, columns: readonly string[]): ExportRow => Object.fromEntries(columns.map((c) => [c, row[c] ?? null]));
const compare = (a: unknown, b: unknown) =>
  typeof a === "number" && typeof b === "number" ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;

export function memoryExportReader(data: Partial<ExportData>): ExportReader {
  return {
    testFamilies: async () => data.testFamilies ?? [],
    page: async (name, columns, after, limit) =>
      [...(data[name] ?? [])].sort((a, b) => compare(a.id, b.id))
        .filter((r) => after === null || String(r.id) > after).slice(0, limit).map((r) => only(r, columns)),
    ofTests: async (name: TestTable, columns, order, ids) => {
      const wanted = new Set(ids);
      const keys = ["assessment_id", ...order];
      return (data[name] ?? []).filter((r) => wanted.has(String(r.assessment_id)))
        .sort((a, b) => keys.reduce((n, k) => n || compare(a[k], b[k]), 0))
        .map((r) => only(r, columns));
    },
  };
}
