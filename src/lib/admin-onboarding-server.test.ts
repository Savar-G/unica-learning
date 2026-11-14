import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { loadOnboardingCheckIns } from "@/lib/admin-onboarding-server";
vi.mock("server-only", () => ({}));

const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const now = Date.parse("2026-11-12T18:00:00Z");
function fixture(fail = "", families = 1) {
  const reads: URL[] = [];
  const records = Array.from({ length: families }, (_, i) => ({ parent: id(i + 1), child: id(i + 2001), card: id(i + 4001) }));
  const tables: Record<string, Record<string, unknown>[]> = {
    plan_starts: records.flatMap((r) => [
      { parent_id: r.parent, card_setup_id: r.card, state: "started", purpose: "initial", finished_at: "2026-11-10T20:00:00Z" },
      { parent_id: r.parent, card_setup_id: id(9999), state: "started", purpose: "restart", finished_at: "2026-11-10T20:00:00Z" },
      { parent_id: r.parent, card_setup_id: id(9998), state: "open", purpose: "initial", finished_at: "2026-11-10T20:00:00Z" },
    ]),
    admin_parents: records.map((r) => ({ id: r.parent, name: "Priya", email: "p@example.invalid", postal: null, time_zone: null })),
    // The oldest sibling, not the enrolment's child, defines province when postal and zone are missing.
    admin_children: records.flatMap((r) => [
      { id: id(Number(r.parent.slice(-12)) + 6001), parent_id: r.parent, first_name: "Oldest", province: "ON", created_at: "2026-01-01T00:00:00Z" },
      { id: r.child, parent_id: r.parent, first_name: "Leah", province: "BC", created_at: "2026-02-01T00:00:00Z" },
    ]),
    admin_card_setups: records.map((r) => ({ id: r.card, child_id: r.child, parent_id: r.parent })),
  };
  const db = createClient<Database>("https://fixture.invalid", "synthetic", { auth: { persistSession: false }, global: { fetch: async (input) => {
    const url = new URL(String(input)); reads.push(url);
    const table = url.pathname.split("/").at(-1)!;
    if (table === fail) return Response.json({ message: "fixture unavailable" }, { status: 500 });
    let rows = tables[table];
    if (!rows) throw Error(`Unexpected read ${table}`);
    for (const [key, value] of url.searchParams) {
      if (["select", "order", "offset", "limit"].includes(key)) continue;
      if (value.startsWith("eq.")) rows = rows.filter((r) => r[key] === value.slice(3));
      else if (value.startsWith("in.(")) rows = rows.filter((r) => value.slice(4, -1).split(",").includes(String(r[key])));
      else if (value.startsWith("not.in.(")) rows = rows.filter((r) => !value.slice(8, -1).split(",").includes(String(r[key])));
      else if (value.startsWith("gte.")) rows = rows.filter((r) => String(r[key]) >= value.slice(4));
      else if (value.startsWith("lte.")) rows = rows.filter((r) => String(r[key]) <= value.slice(4));
      else throw Error(`Unexpected filter ${key}=${value}`);
    }
    const offset = Number(url.searchParams.get("offset") ?? 0), limit = Number(url.searchParams.get("limit") ?? 1000);
    return Response.json(rows.slice(offset, offset + limit));
  } } });
  return { admin: { db, userId: id(999), email: "admin@example.invalid" }, reads };
}

it("uses completed initial starts and family location, with one contact per family", async () => {
  const f = fixture();
  const load = await loadOnboardingCheckIns(f.admin, { hidden: [] }, now);
  expect(load.unavailable).toBe(false);
  expect(load.rows).toHaveLength(1);
  expect(load.rows[0]).toMatchObject({ parentName: "Priya", childName: "Leah", location: { province: "ON" } });
  expect(f.reads[0].searchParams.get("purpose")).toBe("eq.initial");
  expect(f.reads[0].searchParams.get("state")).toBe("eq.started");
});
it("leaves hidden families out before paging and never reads their contact details", async () => {
  const f = fixture();
  expect(await loadOnboardingCheckIns(f.admin, { hidden: [id(1)] }, now)).toEqual({ rows: [], unavailable: false });
  expect(f.reads).toHaveLength(1);
  expect(f.reads[0].searchParams.get("parent_id")).toBe(`not.in.(${id(1)})`);
});
it("paginates starts and related children without losing follow-ups", async () => {
  const f = fixture("", 105);
  expect((await loadOnboardingCheckIns(f.admin, { hidden: [] }, now)).rows).toHaveLength(105);
  expect(f.reads.some((u) => u.pathname.endsWith("/plan_starts") && u.searchParams.get("offset") === "100")).toBe(true);
  expect(f.reads.some((u) => u.pathname.endsWith("/admin_children") && u.searchParams.get("offset") === "100")).toBe(true);
});
it.each(["plan_starts", "admin_parents", "admin_children", "admin_card_setups"])("shows an unavailable warning instead of a false empty queue when %s fails", async (table) => {
  expect(await loadOnboardingCheckIns(fixture(table).admin, { hidden: [] }, now)).toEqual({ rows: [], unavailable: true });
});
