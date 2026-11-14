// #868: the marking limits live twice, in the TypeScript run and in the SQL that enforces them. This reads the migration
// that sets them and checks each number against its constant, so the two cannot drift.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MARKING_ESCALATION_CAP_MICROS, MARKING_MAX_DEFERRALS, MARKING_MAX_DISPATCHES, MARKING_MAX_TRANSPORT_DISPATCHES } from "@/lib/scan-marking";

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

// The second look (decision 2026-11-13): the database admits the escalation model only on a call that says so, and the
// price row starts disabled, so nothing changes until it is enabled after the evaluation gate.
describe("the second look in the database", () => {
  const escalation = readFileSync(join(process.cwd(), "supabase/migrations/20261114051938_scan_marking_escalation.sql"), "utf8");
  it("admits anthropic/claude-opus-5.5 only with role escalation, adds its price row disabled, and records the items it decided", () => {
    expect(escalation).toContain("not (price.model = 'anthropic/claude-opus-5.5' and p_data->>'role' = 'escalation')");
    expect(escalation).toMatch(/values \('anthropic\/claude-opus-5\.5', false,/);
    expect(escalation).toContain("model=case when j.escalation is not null and j.escalation->'items' ? m.item_id then j.escalation->>'model' else j.model end");
    // The dispatch rules are the same text as #868's: the second look is one more dispatch of the same job.
    expect(escalation).toContain("j.dispatches-(select count(*) from public.scan_marking_dispatches d where d.photo_id=p_photo and d.clean_failure='rate-limit')>=2");
  });
  it("admits a second look only within half the month's cap, after the full-cap check first reads keep (#958 review)", () => {
    const share = readFileSync(join(process.cwd(), "supabase/migrations/20261114052926_scan_marking_escalation_budget_share.sql"), "utf8");
    const full = share.indexOf("if held+price.maximum_micros>50000000 then return '\"budget\"'; end if;");
    const half = share.indexOf(`if p_data->>'role'='escalation' and held+price.maximum_micros>${MARKING_ESCALATION_CAP_MICROS} then return '"budget"'; end if;`);
    expect(full).toBeGreaterThan(0);
    expect(half).toBeGreaterThan(full);
    // Only that line differs from the function the escalation migration defined: the rest is its live definition.
    expect(share.match(/held\+price\.maximum_micros>/g)).toHaveLength(2);
  });
});
