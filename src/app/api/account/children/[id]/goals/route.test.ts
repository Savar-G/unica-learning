import { beforeEach, describe, expect, it, vi } from "vitest";

// A parent saves the three goal answers for one child (D-325). The fake client keeps the rows as the database does: the
// session sees only the parent's own children (row-level security; an admin's session would see all, so the route
// filters by parent too), and the family write fence refuses a family being deleted.
vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const store = vi.hoisted(() => ({
  parent: "parent-1" as string | null,
  /** The session reads like an admin's: every family's children. */
  adminSession: false,
  noKey: false,
  fenced: new Set<string>(),
  children: [] as Record<string, unknown>[],
}));

function client(kind: "session" | "admin") {
  return {
    from: () => {
      const filters: [string, unknown][] = [];
      let change: Row | null = null;
      const visible = () => store.children.filter((c) => kind === "admin" || store.adminSession || c.parent_id === store.parent);
      const run = () => {
        const found = visible().filter((row) => filters.every(([k, v]) => row[k] === v));
        if (!change) return { data: found, error: null };
        if (found.some((row) => store.fenced.has(row.parent_id as string))) return { data: null, error: { code: "55000", message: "family_unavailable" } };
        for (const row of found) Object.assign(row, change);
        return { data: found.map((r) => ({ id: r.id })), error: null };
      };
      const query = {
        select: () => query,
        update: (row: Row) => { change = row; return query; },
        eq: (k: string, v: unknown) => { filters.push([k, v]); return query; },
        maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
        then: (resolve: (r: ReturnType<typeof run>) => unknown) => resolve(run()),
      };
      return query;
    },
  };
}

vi.mock("@/lib/supabase-auth", () => ({
  sessionClient: async () => client("session"),
  parentId: async () => store.parent,
  adminClient: () => (store.noKey ? null : client("admin")),
}));

import { POST } from "./route";

const MINE = "7f1c2a4e-1b2c-4d3e-8f90-123456789abc";
const THEIRS = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const GOOD = { goal: "catch_up", feeling: "finds_hard", help: "tutor" };
const send = (id: string, body: unknown, headers: Record<string, string> = {}) => POST(new Request(`https://unica.test/api/account/children/${id}/goals`, {
  method: "POST",
  headers: { origin: "https://unica.test", "content-type": "application/json", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body),
}), { params: Promise.resolve({ id }) });
const child = (id: string) => store.children.find((c) => c.id === id)!;

beforeEach(() => {
  store.parent = "parent-1";
  store.adminSession = false;
  store.noKey = false;
  store.fenced = new Set();
  store.children = [
    { id: MINE, parent_id: "parent-1", first_name: "Asha", learning_goal: null, math_feeling: null, math_help: null },
    { id: THEIRS, parent_id: "parent-2", first_name: "Omar", learning_goal: null, math_feeling: null, math_help: null },
  ];
});

describe("saving the parent goals", () => {
  it("stores the three answers on the parent's own child", async () => {
    const res = await send(MINE, GOOD);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(child(MINE)).toMatchObject({ learning_goal: "catch_up", math_feeling: "finds_hard", math_help: "tutor" });
  });

  it("refuses another site, a form post, a signed-out parent and a body that is too large", async () => {
    expect((await send(MINE, GOOD, { origin: "https://other.test" })).status).toBe(403);
    expect((await send(MINE, GOOD, { "content-type": "text/plain" })).status).toBe(415);
    expect((await send(MINE, JSON.stringify({ ...GOOD, pad: "x".repeat(2000) }))).status).toBe(413);
    store.parent = null;
    expect((await send(MINE, GOOD)).status).toBe(401);
    expect(child(MINE).learning_goal).toBeNull();
  });

  it("refuses a missing or unknown answer and keep_up, and writes nothing", async () => {
    expect((await send(MINE, { goal: "catch_up", feeling: "okay" })).status).toBe(400);
    expect((await send(MINE, { ...GOOD, help: "robot" })).status).toBe(400);
    expect((await send(MINE, { ...GOOD, goal: "keep_up" })).status).toBe(400);
    expect((await send(MINE, "{not json")).status).toBe(400);
    expect(child(MINE).learning_goal).toBeNull();
  });

  it("answers not found for another family's child, also when the session reads every family", async () => {
    expect((await send(THEIRS, GOOD)).status).toBe(404);
    store.adminSession = true;
    expect((await send(THEIRS, GOOD)).status).toBe(404);
    expect((await send("not-a-uuid", GOOD)).status).toBe(404);
    expect(child(THEIRS).learning_goal).toBeNull();
  });

  it("fails when the family is being deleted or the server has no key", async () => {
    store.fenced.add("parent-1");
    expect((await send(MINE, GOOD)).status).toBe(502);
    store.fenced.clear();
    store.noKey = true;
    expect((await send(MINE, GOOD)).status).toBe(503);
    expect(child(MINE).learning_goal).toBeNull();
  });
});
