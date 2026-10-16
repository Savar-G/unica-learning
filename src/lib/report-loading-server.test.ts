import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { parentReportReader } from "@/lib/report-loading-server";

// The parent's reader of the report-loading module (#161) and the learner profile (#198): parents have no read access
// to public.learner_profiles (admins only, D-115), so the reader reads it with the secret key, filtered on the parent's
// own test. Through the reader's interface, against a fake PostgREST that keeps the rows and applies each request's
// eq filters, as Postgres would.
vi.mock("server-only", () => ({}));

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
