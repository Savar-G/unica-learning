// The admins' export of the copies without names (#201, spec #181 story 18, D-119): the rows of public.anonymous_tests
// as JSON (every copy, whole) or CSV (one row per question shown, with the test's columns). Test families (D-099) are
// left out unless asked. Pure: the route reads the rows with the admin's session (src/lib/admin-store.ts) and sends
// the file. #200's export of the raw data can link to this one: /api/admin/anonymous-copies?format=csv|json[&test=1].
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

const kept = (rows: readonly AnonymousTestRow[], { includeTestFamilies }: ExportOptions) =>
  rows.filter((r) => includeTestFamilies || r.copy.testFamily !== true);

/** Every copy, whole, with its random id first. */
export function anonymousCopiesJson(rows: readonly AnonymousTestRow[], options: ExportOptions): string {
  return JSON.stringify(kept(rows, options).map((r) => ({ id: r.id, ...r.copy })));
}

/** The test's columns of the CSV: its scalar fields. The placement, facts, profile and questionnaire are in the JSON. */
const TEST_COLUMNS = ["copyVersion", "grade", "province", "testMonth", "testFamily", "status", "route", "help", "durationMs"] as const;

const snake = (name: string) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** A cell: empty for no value, JSON for a list or an object, quoted when it holds a comma, a quote or a line break. */
function cell(value: unknown): string {
  const text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  // A spreadsheet runs a cell that starts with = + or @ as a formula. No copy field should, but never let one.
  const safe = /^[=+@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** One row per question shown, in each copy's order. */
export function anonymousCopiesCsv(rows: readonly AnonymousTestRow[], options: ExportOptions): string {
  const header = ["copy_id", ...TEST_COLUMNS.map(snake), ...COPY_FIELDS.question.map(snake)];
  const lines = kept(rows, options).flatMap((r) => r.copy.questions.map((q) => [
    r.id, ...TEST_COLUMNS.map((k) => r.copy[k]), ...COPY_FIELDS.question.map((k) => q[k]),
  ].map(cell).join(",")));
  return [header.join(","), ...lines].map((line) => `${line}\r\n`).join("");
}
