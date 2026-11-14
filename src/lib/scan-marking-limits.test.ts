// #868: the marking limits live twice, in the TypeScript run and in the SQL that enforces them. This reads the migration
// that sets them and checks each number against its constant, so the two cannot drift.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { MARKING_MAX_DEFERRALS, MARKING_MAX_DISPATCHES, MARKING_MAX_TRANSPORT_DISPATCHES } from "@/lib/scan-marking";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261114023202_scan_marking_clean_failures.sql"), "utf8");
const one = (pattern: RegExp) => { const all = [...sql.matchAll(new RegExp(pattern, "g"))]; expect(all, String(pattern)).toHaveLength(1); return Number(all[0][1]); };

it("the SQL checks and rules use the run's limits", () => {
  expect(one(/check \(dispatches between 0 and (\d+)\)/)).toBe(MARKING_MAX_TRANSPORT_DISPATCHES);
  expect(one(/check \(attempt between 1 and (\d+)\)/)).toBe(MARKING_MAX_TRANSPORT_DISPATCHES);
  expect(one(/check \(deferrals between 0 and (\d+)\)/)).toBe(MARKING_MAX_DEFERRALS);
  expect(one(/d\.clean_failure='rate-limit'\)>=(\d+)/)).toBe(MARKING_MAX_DISPATCHES);
  expect(one(/or j\.dispatches>=(\d+) then return '"attempts"'/)).toBe(MARKING_MAX_TRANSPORT_DISPATCHES);
  expect(one(/elsif j\.deferrals>=(\d+) then st := 'attempts'/)).toBe(MARKING_MAX_DEFERRALS);
});
