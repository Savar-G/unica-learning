import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanChild } from "@/lib/account";

// A parent changes a child's first name (#555). The real release check runs against a fake server client that keeps the
// rows and answers as the database does: the family write fence refuses a family being deleted.
vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const store = vi.hoisted(() => ({
  parent: "parent-1" as string | null,
  noKey: false,
  tables: {} as Record<string, Record<string, unknown>[]>,
  fenced: new Set<string>(),
  failing: new Set<string>(),
  writes: [] as Record<string, unknown>[],
}));

function table(name: string) {
  const filters: [string, unknown][] = [];
  let change: Row | null = null;
  const rows = () => (store.tables[name] ?? []).filter((row) => filters.every(([k, v]) => (Array.isArray(v) ? v.includes(row[k]) : row[k] === v)));
  const run = () => {
    if (store.failing.has(name)) return { data: null, error: { code: "XX000", message: "read or write failed" } };
    const found = rows();
    if (!change) return { data: found, error: null };
    if (found.some((row) => store.fenced.has(row.parent_id as string))) return { data: null, error: { code: "55000", message: "family_unavailable" } };
    for (const row of found) { store.writes.push(change); Object.assign(row, change); }
    return { data: found, error: null };
  };
  const query = {
    select: () => query,
    update: (row: Row) => { change = row; return query; },
    eq: (k: string, v: unknown) => { filters.push([k, v]); return query; },
    in: (k: string, v: unknown[]) => { filters.push([k, v]); return query; },
    limit: () => query,
    maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
    then: (resolve: (r: ReturnType<typeof run>) => unknown) => resolve(run()),
  };
  return query;
}

vi.mock("@/lib/supabase-auth", () => ({
  sessionClient: async () => ({}),
  parentId: async () => store.parent,
  adminClient: () => (store.noKey ? null : { from: table }),
}));

import { PATCH } from "./route";

const MINE = "7f1c2a4e-1b2c-4d3e-8f90-123456789abc";
const THEIRS = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const url = (id: string) => `https://unica.test/api/account/children/${id}`;
const send = (id: string, body: unknown, headers: Record<string, string> = {}) => PATCH(new Request(url(id), {
  method: "PATCH",
  headers: { origin: "https://unica.test", "content-type": "application/json", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body),
}), { params: Promise.resolve({ id }) });
const nameOf = (id: string) => store.tables.children.find((c) => c.id === id)?.first_name;

beforeEach(() => {
  store.parent = "parent-1";
  store.noKey = false;
  store.fenced = new Set();
  store.failing = new Set();
  store.writes = [];
  store.tables = {
    test_accounts: [{ parent_id: "parent-1" }],
    admin_users: [{ user_id: "admin-1" }],
    children: [
      { id: MINE, parent_id: "parent-1", first_name: "Asha", grade: 3 },
      { id: THEIRS, parent_id: "parent-2", first_name: "Omar", grade: 5 },
    ],
    workbook_runs: [],
  };
  vi.stubEnv("PARENT_DASHBOARD_ENABLED", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("what the route refuses before any read", () => {
  it("refuses another site, a form post and a signed-out parent", async () => {
    expect((await send(MINE, { firstName: "Zoe" }, { origin: "https://other.test" })).status).toBe(403);
    expect((await send(MINE, { firstName: "Zoe" }, { "content-type": "text/plain" })).status).toBe(415);
    store.parent = null;
    expect((await send(MINE, { firstName: "Zoe" })).status).toBe(401);
    expect(store.writes).toEqual([]);
  });

  it("refuses a large body, by its header and by its real size", async () => {
    expect((await send(MINE, { firstName: "Zoe" }, { "content-length": "5000" })).status).toBe(413);
    expect((await send(MINE, { firstName: "Z".repeat(5000) })).status).toBe(413);
    expect(store.writes).toEqual([]);
  });

  it("refuses bad JSON and an id that is not a UUID", async () => {
    expect((await send(MINE, "{not json")).status).toBe(400);
    expect((await send("not-a-uuid", { firstName: "Zoe" })).status).toBe(404);
    expect(store.writes).toEqual([]);
  });

  it("answers 503 with no secret key", async () => {
    vi.stubEnv("PARENT_DASHBOARD_ENABLED", "on");
    store.noKey = true;
    expect((await send(MINE, { firstName: "Zoe" })).status).toBe(503);
  });
});

describe("who the switch opens to", () => {
  it("answers not found to a normal family for its own child, and changes nothing", async () => {
    store.parent = "parent-2";
    const response = await send(THEIRS, { firstName: "Zoe" });
    expect(response.status).toBe(404);
    expect(nameOf(THEIRS)).toBe("Omar");
    expect(store.writes).toEqual([]);
  });

  it("answers not found when the switch has any value other than on", async () => {
    vi.stubEnv("PARENT_DASHBOARD_ENABLED", "true");
    store.parent = "parent-2";
    expect((await send(THEIRS, { firstName: "Zoe" })).status).toBe(404);
  });

  it("opens to a normal family when the switch is on", async () => {
    vi.stubEnv("PARENT_DASHBOARD_ENABLED", "on");
    store.parent = "parent-2";
    expect((await send(THEIRS, { firstName: "Zoe" })).status).toBe(200);
    expect(nameOf(THEIRS)).toBe("Zoe");
  });

  it("opens to an admin's own family", async () => {
    store.parent = "admin-1";
    store.tables.children.push({ id: "11111111-1111-4111-8111-111111111111", parent_id: "admin-1", first_name: "Ira" });
    expect((await send("11111111-1111-4111-8111-111111111111", { firstName: "Zoe" })).status).toBe(200);
  });
});

describe("changing the name", () => {
  it("saves the name for the parent's own child, and only the name", async () => {
    const response = await send(MINE, { firstName: "  Zoë  ", grade: 9, parent_id: "parent-2", id: THEIRS });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(store.writes).toEqual([{ first_name: "Zoë" }]);
    expect(store.tables.children.find((c) => c.id === MINE)).toMatchObject({ first_name: "Zoë", grade: 3, parent_id: "parent-1" });
  });

  it("refuses another family's child, whatever the body says", async () => {
    const response = await send(THEIRS, { firstName: "Zoe", parent_id: "parent-1" });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: "not_found" });
    expect(nameOf(THEIRS)).toBe("Omar");
    expect(store.writes).toEqual([]);
  });

  it("tells nothing about another family's workbook run", async () => {
    store.tables.workbook_runs.push({ id: "r2", parent_id: "parent-2", child_id: THEIRS, status: "running" });
    expect((await send(THEIRS, { firstName: "Zoe" })).status).toBe(404);
  });

  it.each([[""], ["   "], [7], [null], [undefined], [["Zoe"]]])("refuses %j as signup does", async (firstName) => {
    expect(cleanChild({ firstName, grade: 4, province: "BC" })).toBeNull();
    const response = await send(MINE, { firstName });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "invalid" });
    expect(nameOf(MINE)).toBe("Asha");
  });

  it.each([["Zoë Anne"], ["  Leah\t"], ["L".repeat(80)], ["<b>Asha</b>"], ["{child}"]])("stores %j exactly as signup would", async (firstName) => {
    expect((await send(MINE, { firstName })).status).toBe(200);
    expect(nameOf(MINE)).toBe(cleanChild({ firstName, grade: 4, province: "BC" })?.firstName);
  });

  it("refuses a family being deleted, through the family write fence", async () => {
    store.fenced.add("parent-1");
    const response = await send(MINE, { firstName: "Zoe" });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: "unavailable" });
    expect(nameOf(MINE)).toBe("Asha");
  });

  it("answers 502 and keeps the name out of the log when the save fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    store.failing.add("children");
    expect((await send(MINE, { firstName: "Zoe" })).status).toBe(502);
    expect(JSON.stringify(log.mock.calls)).not.toContain("Zoe");
    log.mockRestore();
  });
});

// A kept page prints the name in its id, and the generator refuses a resume when the name changed (workbook-generator.ts).
describe("a workbook being made", () => {
  it.each(["queued", "running"])("refuses while the child's run is %s, as the run could not resume", async (status) => {
    store.tables.workbook_runs.push({ id: "r1", parent_id: "parent-1", child_id: MINE, status });
    const response = await send(MINE, { firstName: "Zoe" });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: "book_in_progress" });
    expect(nameOf(MINE)).toBe("Asha");
  });

  it.each(["done", "failed", "stale"])("saves when the child's last run is %s", async (status) => {
    store.tables.workbook_runs.push({ id: "r1", parent_id: "parent-1", child_id: MINE, status });
    expect((await send(MINE, { firstName: "Zoe" })).status).toBe(200);
  });

  it("does not save when it cannot read the runs", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    store.failing.add("workbook_runs");
    expect((await send(MINE, { firstName: "Zoe" })).status).toBe(502);
    expect(nameOf(MINE)).toBe("Asha");
    log.mockRestore();
  });
});
