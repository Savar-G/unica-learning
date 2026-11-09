import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { familyProvince, familyZone } from "@/lib/family-time";
import { familyRetryTime, loadFamilyProvince, loadFamilyZone, loadFamilyZones } from "@/lib/family-time-server";
vi.mock("server-only", () => ({}));

const children = [
  { id: "z", created_at: "2021-01-01", province: "BC" },
  { id: "b", created_at: "2020-01-01", province: "AB" },
  { id: "a", created_at: "2020-01-01", province: "ON" },
];

describe("R425M-3 one family province", () => {
  it.each([[children], [[...children].reverse()]])("uses creation time, then child ID, regardless of activity", (rows) => {
    expect(familyZone({ province: familyProvince(rows) })).toBe("America/Toronto");
    expect(familyZone({ province: familyProvince(rows.filter((c) => c.id !== "a")) })).toBe("America/Edmonton");
  });

  it.each([false, true])("uses the same fallback for session and admin reads, admin=%s", async (admin) => {
    const requests: URL[] = [];
    const db = createClient<Database>("https://fixture.invalid", "key", { auth: { persistSession: false }, global: { fetch: async (input) => {
      const url = new URL(String(input)); requests.push(url);
      if (url.pathname.endsWith("parents")) return Response.json({ postal: null, time_zone: null });
      const rows = [...children].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
      return Response.json(rows[0]);
    } } });
    expect(await loadFamilyProvince(db, "parent", admin)).toBe("ON");
    expect(requests[0].pathname).toBe(admin ? "/rest/v1/rpc/admin_children" : "/rest/v1/children");
    expect(requests[0].searchParams.get("parent_id")).toBe("eq.parent");
    expect(requests[0].searchParams.get("order")).toBe("created_at.asc,id.asc");
    expect(requests[0].searchParams.get("limit")).toBe("1");
    expect(await familyRetryTime(db, Date.parse("2026-11-09T06:30:00Z"))).toEqual({
      retryWhen: "1:30 a.m. on Monday, November 9", retryTime: "1:30 a.m.",
    });
  });
});

describe("one family's zone for the scan results page (#715)", () => {
  const client = (parent: Record<string, unknown> | null) => {
    const requests: URL[] = [];
    const db = createClient<Database>("https://fixture.invalid", "key", { auth: { persistSession: false }, global: { fetch: async (input) => {
      const url = new URL(String(input)); requests.push(url);
      if (url.pathname.endsWith("parents")) return Response.json(parent);
      return Response.json(children[2]);
    } } });
    return { db, requests };
  };
  it("reads that parent's own zone, then postal code, then the oldest child's province", async () => {
    const valid = client({ postal: "V3S 1A1", time_zone: "America/Halifax" });
    expect(await loadFamilyZone(valid.db, "parent")).toBe("America/Halifax");
    expect(valid.requests.every((u) => u.searchParams.get(u.pathname.endsWith("parents") ? "id" : "parent_id") === "eq.parent")).toBe(true);
    expect(familyZone({ postal: "M5V 2T6" })).toEqual(await loadFamilyZone(client({ postal: "M5V 2T6", time_zone: null }).db, "parent"));
    expect(await loadFamilyZone(client({ postal: null, time_zone: "Not/AZone" }).db, "parent")).toBe("America/Toronto");
  });
});


describe("batched family zones", () => {
  it("matches individual reads and uses two queries for several families", async () => {
    const parents = [
      { id: "zone", postal: "V3S 1A1", time_zone: "America/Halifax" },
      { id: "postal", postal: "M5V 2T6", time_zone: null },
      { id: "province", postal: null, time_zone: null },
    ];
    const kids = [
      { id: "a", parent_id: "province", first_name: "A", created_at: "2020-01-01", province: "AB" },
      { id: "b", parent_id: "province", first_name: "B", created_at: "2021-01-01", province: "ON" },
    ];
    const requests: URL[] = [];
    const db = createClient<Database>("https://fixture.invalid", "key", { auth: { persistSession: false }, global: { fetch: async (input) => {
      const url = new URL(String(input)); requests.push(url);
      const isParent = url.pathname.endsWith("parents"), param = url.searchParams.get(isParent ? "id" : "parent_id")!;
      const rows = isParent ? parents : kids;
      if (param.startsWith("eq.")) {
        const id = param.slice(3);
        const matches = rows.filter((r) => ("parent_id" in r ? r.parent_id : r.id) === id);
        return Response.json(matches[0] ?? null);
      }
      return Response.json(rows);
    } } });
    const ids = ["zone", "postal", "province", "missing"];
    expect(await loadFamilyZones(db, [])).toEqual(new Map());
    expect(requests).toHaveLength(0);
    const batched = await loadFamilyZones(db, ids);
    expect(requests).toHaveLength(2);
    for (const id of ids) expect(batched.get(id)).toBe(await loadFamilyZone(db, id));
    expect([...batched.values()]).toEqual(["America/Halifax", "America/Toronto", "America/Edmonton", "America/Vancouver"]);
  });
});
