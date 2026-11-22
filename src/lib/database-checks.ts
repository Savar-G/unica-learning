// Reads the database's check constraints (src/lib/database.checks.ts, written by npm run db:checks) so a test can
// prove that a state list in the code equals the values the database allows. Pure: no network, no file reads.
import { DATABASE_CHECKS } from "@/lib/database.checks";

export interface DatabaseCheck { table: string; name: string; definition: string }

const ENUM = /^CHECK \(\(([a-z_][a-z0-9_]*) = ANY \(ARRAY\[(.+)\]\)\)\)$/;
const SINGLE = /^CHECK \(\(([a-z_][a-z0-9_]*) = ('(?:[^']|'')*'::[a-z ]+)\)\)$/;
const EQ_CLAUSE = /^([a-z_][a-z0-9_]*) = '((?:[^']|'')*)'::[a-z ]+$/;
const VALUE = /'((?:[^']|'')*)'::[a-z ]+/g;

function unwrapParens(expr: string): string {
  let s = expr.trim();
  while (s.startsWith("(") && s.endsWith(")")) {
    let depth = 0;
    let inQuote = false;
    let wrapsWhole = true;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inQuote) {
        if (ch === "'" && s[i + 1] === "'") i++;
        else if (ch === "'") inQuote = false;
        continue;
      }
      if (ch === "'") inQuote = true;
      else if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0 && i < s.length - 1) {
          wrapsWhole = false;
          break;
        }
      }
    }
    if (!wrapsWhole) break;
    s = s.slice(1, -1).trim();
  }
  return s;
}

function splitTopLevelOr(expr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inQuote = false;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (inQuote) {
      if (ch === "'" && expr[i + 1] === "'") i++;
      else if (ch === "'") inQuote = false;
      continue;
    }
    if (ch === "'") inQuote = true;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (depth === 0 && expr.slice(i, i + 4) === " OR ") {
      parts.push(expr.slice(start, i));
      start = i + 4;
      i += 3;
    }
  }
  parts.push(expr.slice(start));
  return parts;
}

function parseOrEqualityChain(definition: string): { column: string; values: string[] } | null {
  if (!definition.startsWith("CHECK (") || !definition.endsWith(")")) return null;
  const root = unwrapParens(definition.slice("CHECK ".length));
  const clauses: string[] = [];
  const collect = (expr: string): boolean => {
    const inner = unwrapParens(expr);
    const parts = splitTopLevelOr(inner);
    if (parts.length > 1) return parts.every(collect);
    clauses.push(inner);
    return true;
  };
  collect(root);
  if (clauses.length < 2) return null;

  let column: string | null = null;
  const values: string[] = [];
  for (const clause of clauses) {
    const match = EQ_CLAUSE.exec(clause);
    if (!match) return null;
    if (column === null) column = match[1];
    else if (column !== match[1]) return null;
    values.push(match[2].replaceAll("''", "'"));
  }
  return column ? { column, values: [...new Set(values)] } : null;
}

/**
 * The column and its allowed values when a check is exactly "column is one of these values", as Postgres prints
 * `check (column in (...))`, `check (column = 'x')`, or an OR chain of same-column equalities; null for every other
 * check (ranges, two-column rules, jsonb paths).
 */
export function enumCheck(definition: string): { column: string; values: string[] } | null {
  const m = ENUM.exec(definition) ?? SINGLE.exec(definition);
  if (m) {
    const values = [...m[2].matchAll(VALUE)].map((v) => v[1].replaceAll("''", "'"));
    return values.length > 0 ? { column: m[1], values } : null;
  }
  return parseOrEqualityChain(definition);
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
