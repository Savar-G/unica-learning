import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { familyProvince, familyZone } from "@/lib/family-time";
import { familyRetryTime, loadFamilyProvince, loadFamilyZone } from "@/lib/family-time-server";
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
