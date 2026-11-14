import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { scanMaintenanceRelease, scanProgressAccess } from "@/lib/workbook-scan-access";
vi.mock("server-only", () => ({}));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const env = { WORKBOOK_SCAN_PROGRESS_ENABLED: "families", WORKBOOK_SCAN_TEST_PARENT_IDS: id(1), WORKBOOK_SCAN_REMINDERS_ENABLED: "test-only" };
function fixture(kind: string | null, marked: readonly string[] = [id(1)]) {
  const db = createClient<Database>("https://synthetic.invalid", "test", { auth: { persistSession: false }, global: { fetch: async input => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const parent = url.searchParams.get("parent_id")?.slice(3);
    const table = url.pathname.split("/").at(-1);
    const data = table === "test_accounts" ? marked.includes(parent ?? "") ? [{ parent_id: parent }] : []
      : kind ? [{ kind, next_charge_at: "2099-01-01T00:00:00Z", ends_at: "2099-01-01T00:00:00Z", monthly_cents: 1000, ending_free: false }] : [];
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  } } });
  return scanProgressAccess(db, scanMaintenanceRelease(env)!);
}
describe("scan progress release access", () => {
  it.each(["paying", "free_month", "ending"])("admits a real family with an open %s plan", async kind => {
    expect(await fixture(kind).allowed(id(2), id(3))).toBe(true);
  });
  it.each([null, "paused", "ended", "payment_failed", "not_started"])("refuses a real family with plan %s", async kind => {
    expect(await fixture(kind).allowed(id(2), id(3))).toBe(false);
  });
  it("preserves the listed marked test path and refuses an unlisted test family", async () => {
    const access = fixture(null, [id(1), id(2)]);
    expect(await access.allowed(id(1), id(3))).toBe(true);
    expect(await access.allowed(id(2), id(3))).toBe(false);
    expect(await access.testParent(id(2))).toBe(false);
    expect(await fixture("paying", []).allowed(id(1), id(3))).toBe(false);
  });
  it.each(["", "family", "on", "Families", "families "])("fails closed for malformed mode %j", mode => {
    expect(scanMaintenanceRelease({ ...env, WORKBOOK_SCAN_PROGRESS_ENABLED: mode })).toBeNull();
  });
  it("enables reminder families mode only with families progress (#475)", () => {
    expect(scanMaintenanceRelease({ ...env, WORKBOOK_SCAN_PROGRESS_ENABLED: "test-only", WORKBOOK_SCAN_REMINDERS_ENABLED: "families" })).toBeNull();
    expect(scanMaintenanceRelease({ ...env, WORKBOOK_SCAN_PROGRESS_ENABLED: "families", WORKBOOK_SCAN_REMINDERS_ENABLED: "families" })).toMatchObject({ mode: "families", reminders: "families", delivery: true });
  });
});
