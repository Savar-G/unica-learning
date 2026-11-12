// Reads the database's check constraints (src/lib/database.checks.ts, written by npm run db:checks) so a test can
// prove that a state list in the code equals the values the database allows. Pure: no network, no file reads.
import { DATABASE_CHECKS } from "@/lib/database.checks";

export interface DatabaseCheck { table: string; name: string; definition: string }

const ENUM = /^CHECK \(\(([a-z_][a-z0-9_]*) = ANY \(ARRAY\[(.+)\]\)\)\)$/;
const SINGLE = /^CHECK \(\(([a-z_][a-z0-9_]*) = ('(?:[^']|'')*'::[a-z ]+)\)\)$/;
const VALUE = /'((?:[^']|'')*)'::[a-z ]+/g;

/**
 * The column and its allowed values when a check is exactly "column is one of these values", as Postgres prints
 * `check (column in (...))`; null for every other check (ranges, two-column rules, jsonb paths).
 */
export function enumCheck(definition: string): { column: string; values: string[] } | null {
  const m = ENUM.exec(definition) ?? SINGLE.exec(definition);
  if (!m) return null;
  const values = [...m[2].matchAll(VALUE)].map((v) => v[1].replaceAll("''", "'"));
  return values.length > 0 ? { column: m[1], values } : null;
}

/**
 * The values the database allows in `table.column`, from its "one of these values" check; null when the column has no
 * such check. Two such checks on one column must agree, or this throws, since then no single list is the truth.
 */
export function allowedValues(table: string, column: string, checks: readonly DatabaseCheck[] = DATABASE_CHECKS): readonly string[] | null {
  const found = checks.filter((c) => c.table === table).map((c) => enumCheck(c.definition)).filter((e) => e?.column === column);
  if (found.length === 0) return null;
  const [first, ...rest] = found.map((e) => [...e!.values].sort());
  if (rest.some((r) => r.join("\u0000") !== first.join("\u0000"))) throw new Error(`${table}.${column} has checks that disagree`);
  return first;
}
