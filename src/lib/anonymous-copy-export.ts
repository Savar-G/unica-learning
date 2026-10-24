// The admins' export of the copies without names (#201, spec #181 story 18, D-119): the rows of public.anonymous_tests
// as JSON (every copy, whole) or CSV (one row per question shown, with the test's columns). Test families (D-099) are
// left out unless asked. Pure: the route reads the rows with the admin's session (src/lib/admin-store.ts) and sends
// the file. The export page of the raw data (#200, D-118) lists it as one more dataset (anonymousCopiesHref).
import { BOM, csvLine } from "@/lib/admin-export";
import { COPY_FIELDS, type AnonymousTestCopy } from "@/lib/assessment";

/** One stored copy: its random id and the copy JSON. */
export interface AnonymousTestRow {
  id: string;
  copy: AnonymousTestCopy;
}

export interface ExportOptions {
  /** Keep the copies of families an admin marked as tests. */
  includeTestFamilies: boolean;
}

export const ANONYMOUS_COPIES_PATH = "/api/admin/anonymous-copies";

/** The link to one file of the copies: CSV or JSON, with the test families when asked. */
export function anonymousCopiesHref({ format, withTests }: { format: "csv" | "json"; withTests: boolean }): string {
  const q = new URLSearchParams({ format });
  if (withTests) q.set("test", "1");
  return `${ANONYMOUS_COPIES_PATH}?${q}`;
}

const kept = (rows: readonly AnonymousTestRow[], { includeTestFamilies }: ExportOptions) =>
  rows.filter((r) => includeTestFamilies || r.copy.testFamily !== true);

/** Every copy, whole, with its random id first. */
export function anonymousCopiesJson(rows: readonly AnonymousTestRow[], options: ExportOptions): string {
  return JSON.stringify(kept(rows, options).map((r) => ({ id: r.id, ...r.copy })));
}

/** The test's columns of the CSV: its scalar fields. The placement, facts, profile and questionnaire are in the JSON. */
const TEST_COLUMNS = ["copyVersion", "grade", "province", "testMonth", "testFamily", "status", "route", "help", "durationMs"] as const;

const snake = (name: string) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** One row per question shown, in each copy's order. */
export function anonymousCopiesCsv(rows: readonly AnonymousTestRow[], options: ExportOptions): string {
  const header = ["copy_id", ...TEST_COLUMNS.map(snake), ...COPY_FIELDS.question.map(snake)];
  const lines = kept(rows, options).flatMap((r) => r.copy.questions.map((q) => csvLine([
    r.id, ...TEST_COLUMNS.map((k) => r.copy[k]), ...COPY_FIELDS.question.map((k) => q[k]),
  ])));
  // The cells, the byte order mark and the formula guard of the raw data export (D-118).
  return BOM + csvLine(header) + lines.join("");
}
