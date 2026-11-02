import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { parentReportReader, secretKeyReportReader } from "@/lib/report-loading-server";

// The parent's reader of the report-loading module (#161) and the learner profile (#198): parents have no read access
// to public.learner_profiles (admins only, D-115), so the reader reads it with the secret key, filtered on the parent's
// own test. Through the reader's interface, against a fake PostgREST that keeps the rows and applies each request's
// eq filters, as Postgres would.
vi.mock("server-only", () => ({}));

// Use the real column grants, not a fixed successful answer for every SELECT.
const reportMigration = readFileSync("supabase/migrations/20261011_add_reports.sql", "utf8");
const assessmentMigration = readFileSync("supabase/migrations/20261010_add_assessments.sql", "utf8");
function grantedColumns(sql: string, table: string): Set<string> {
  const grant = sql.match(new RegExp(`grant select \\(([^)]+)\\)\\s+on table public\\.${table} to authenticated`, "i"));
  if (!grant) throw new Error(`Missing SELECT grant for ${table}`);
  return new Set(grant[1].split(",").map((c) => c.trim()));
}
const reportGrants = grantedColumns(reportMigration, "reports");
const assessmentGrants = grantedColumns(assessmentMigration, "assessments");

it.each(["G0G 1W0", "V1C 3H8", null])("reads the parent's own postal code %s within the database grants", async (postal) => {
  const requests: URL[] = [];
  const db = createClient("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    const select = url.searchParams.get("select") ?? "";
    if (url.pathname === "/rest/v1/parents") {
      expect(select).toBe("postal,time_zone");
      return Response.json({ postal, time_zone: "America/Vancouver" }); // Parents read their own row through RLS.
    }
    if (url.pathname === "/rest/v1/children") {
      expect(url.searchParams.get("order")).toBe("created_at.asc,id.asc");
      expect(url.searchParams.get("limit")).toBe("1");
      return Response.json({ id: OTHER, created_at: "2020-01-01", province: "ON" });
    }
    expect(url.pathname).toBe("/rest/v1/reports");
    expect(url.searchParams.get("id")).toBe(`eq.${TEST}`);
    // PostgREST needs SELECT on a join's foreign key as well as the returned columns.
    const joins: Record<string, [string, Set<string>]> = {
      "assessment:assessments": ["assessment_id", assessmentGrants],
      "child:children": ["child_id", new Set(["first_name"])],
      "parent:parents": ["parent_id", new Set(["postal"])],
    };
    let permitted = true;
    const columns = select.replace(/([^,()]+)\(([^()]*)\)/g, (_, relation: string, fields: string) => {
      const join = joins[relation];
      if (!join || !reportGrants.has(join[0]) || fields.split(",").some((c) => !join[1].has(c))) permitted = false;
      return "";
    }).split(",").filter(Boolean);
    if (columns.some((c) => !reportGrants.has(c))) permitted = false;
    if (!permitted) return Response.json({ code: "42501", message: "permission denied for table reports" }, { status: 403 });
    return Response.json({ id: TEST, assessment_id: TEST, child_id: OTHER, model: {}, questions: 36, minutes: 34,
      assessment: { completed_at: "2026-11-18T04:29:00Z", province: "BC" }, child: { first_name: "Asha" } });
  } } });
  expect(reportGrants.has("parent_id")).toBe(false);
  expect(await parentReportReader(db).report(TEST)).toMatchObject({ postal, familyProvince: "ON" });
  expect(requests.map((url) => url.pathname)).toEqual(["/rest/v1/reports", "/rest/v1/parents", "/rest/v1/children"]);
});

it("keeps the secret reader's parent join under its own access", async () => {
  const db = createClient("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/rest/v1/children") {
      expect(url.searchParams.get("order")).toBe("created_at.asc,id.asc");
      expect(url.searchParams.get("limit")).toBe("1");
      return Response.json({ id: OTHER, created_at: "2020-01-01", province: "ON" });
    }
    expect(url.pathname).toBe("/rest/v1/reports");
    expect(url.searchParams.get("select")).toContain("parent:parents(id,postal,time_zone)");
    return Response.json({ id: TEST, assessment_id: TEST, child_id: OTHER, model: {}, questions: 36, minutes: 34,
      assessment: null, child: null, parent: { id: TEST, postal: "M5V 2T6" } });
  } } });
  expect(await secretKeyReportReader(db).report(TEST)).toMatchObject({ postal: "M5V 2T6" });
});

it("does not read a postal code for an invalid or inaccessible report", async () => {
  const fetch = vi.fn(async (input) => {
    expect(new URL(String(input)).pathname).toBe("/rest/v1/reports");
    return Response.json([]);
  });
  const db = createClient("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch } });
  expect(await parentReportReader(db).report("invalid")).toBeNull();
  expect(await parentReportReader(db).report(OTHER)).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});

const TEST = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const PROFILE = { schemaVersion: 1, strengths: [] };

/** A Supabase client over a fake PostgREST with public.learner_profiles; `requests` lists the tables each request read. */
function fakeDatabase(rows: Record<string, unknown>[]) {
  const requests: URL[] = [];
  const db = createClient("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.pathname !== "/rest/v1/learner_profiles" || (init?.method ?? "GET") !== "GET") throw new Error(`unexpected request ${init?.method} ${url.pathname}`);
    const filters = [...url.searchParams].filter(([column]) => column !== "select");
    if (!filters.every(([, test]) => test.startsWith("eq."))) throw new Error(`unexpected filter ${url.search}`);
    const hit = rows.filter((r) => filters.every(([column, test]) => String(r[column]) === test.slice(3)));
    return Response.json(hit.map((r) => ({ profile: r.profile })));
  } } });
  return { db, requests };
}

describe("the parent's reader of a learner profile (#198)", () => {
  const rows = [
    { assessment_id: TEST, parent_id: "parent-1", profile: PROFILE },
    { assessment_id: OTHER, parent_id: "parent-2", profile: { ...PROFILE, strengths: ["not yours"] } },
  ];

  it("reads it with the secret key, filtered on the parent's own test, and never with the parent's session", async () => {
    const key = fakeDatabase(rows);
    const session = fakeDatabase(rows);
    expect(await parentReportReader(session.db, { admin: key.db, parentId: "parent-1" }).profile(TEST)).toEqual(PROFILE);
    // Another family's test finds nothing, though the secret key could read it.
    expect(await parentReportReader(session.db, { admin: key.db, parentId: "parent-1" }).profile(OTHER)).toBeNull();
    expect(key.requests.map((u) => [u.searchParams.get("assessment_id"), u.searchParams.get("parent_id")])).toEqual([
      [`eq.${TEST}`, "eq.parent-1"],
      [`eq.${OTHER}`, "eq.parent-1"],
    ]);
    expect(session.requests).toEqual([]);
  });

  it("reads nothing without the secret key, or for an id that is not a test id", async () => {
    const key = fakeDatabase(rows);
    const session = fakeDatabase(rows);
    expect(await parentReportReader(session.db).profile(TEST)).toBeNull();
    expect(await parentReportReader(session.db, { admin: null, parentId: "parent-1" }).profile(TEST)).toBeNull();
    expect(await parentReportReader(session.db, { admin: key.db, parentId: "parent-1" }).profile("report-1")).toBeNull();
    expect([...key.requests, ...session.requests]).toEqual([]);
  });
});
