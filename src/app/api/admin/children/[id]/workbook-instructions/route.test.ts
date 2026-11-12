import { beforeEach, expect, it, vi } from "vitest";

// The route and the store (src/lib/workbook-instructions-store.ts) together, on a service client in memory.
const fake = vi.hoisted(() => ({
  admin: true as boolean, fail: false,
  children: new Map<string, { parent_id: string }>(),
  rows: new Map<string, Record<string, unknown>>(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-store", () => ({ adminSession: async () => fake.admin ? { db: "admin-db", userId: "00000000-0000-4000-8000-0000000000ad", email: "admin@example.invalid" } : null }));
vi.mock("@/lib/supabase-auth", () => ({
  adminClient: () => ({
    from(table: string) {
      const filter: Record<string, string> = {};
      const chain = {
        select: () => chain,
        eq: (k: string, v: string) => { filter[k] = v; return chain; },
        maybeSingle: async () => ({ data: table === "children" ? fake.children.get(filter.id) ?? null : fake.rows.get(filter.child_id) ?? null, error: null }),
        upsert: async (row: Record<string, unknown>) => {
          if (fake.fail) return { error: { message: "down" } };
          fake.rows.set(row.child_id as string, row);
          return { error: null };
        },
        delete: () => ({ eq: async (_k: string, v: string) => { fake.rows.delete(v); return { error: null }; } }),
      };
      return chain;
    },
  }),
}));
import { DELETE, PUT } from "./route";

const CHILD = "11111111-1111-4111-8111-111111111111";
const ctx = (id = CHILD) => ({ params: Promise.resolve({ id }) }) as never;
const put = (body: unknown, origin = "https://test.invalid") => new Request(`https://test.invalid/api/admin/children/${CHILD}/workbook-instructions`, { method: "PUT", headers: { origin }, body: JSON.stringify(body) });
const del = () => new Request(`https://test.invalid/api/admin/children/${CHILD}/workbook-instructions`, { method: "DELETE", headers: { origin: "https://test.invalid" } });
const SET = { version: 1, startLevel: "U19", teachMore: ["6.1"], teachLess: [], addReview: ["5.5"], difficulty: "harder" };

beforeEach(() => {
  Object.assign(fake, { admin: true, fail: false });
  fake.children = new Map([[CHILD, { parent_id: "22222222-2222-4222-8222-222222222222" }]]);
  fake.rows = new Map();
});

it("an admin saves a child's instructions with the parent, version and who saved them", async () => {
  const r = await PUT(put(SET), ctx());
  expect(r.status).toBe(200);
  expect(fake.rows.get(CHILD)).toMatchObject({ parent_id: "22222222-2222-4222-8222-222222222222", schema_version: 1, instructions: SET, updated_by_email: "admin@example.invalid" });
});

it("an empty set and DELETE clear the row", async () => {
  await PUT(put(SET), ctx());
  expect((await PUT(put({ version: 1, startLevel: null, teachMore: [], teachLess: [], addReview: [], difficulty: null }), ctx())).status).toBe(200);
  expect(fake.rows.has(CHILD)).toBe(false);
  await PUT(put(SET), ctx());
  expect((await DELETE(del(), ctx())).status).toBe(200);
  expect(fake.rows.has(CHILD)).toBe(false);
});

it("refuses a non-admin, another origin, a bad body and a set that cannot apply, before any write", async () => {
  fake.admin = false;
  expect((await PUT(put(SET), ctx())).status).toBe(404);
  expect((await DELETE(del(), ctx())).status).toBe(404);
  fake.admin = true;
  expect((await PUT(put(SET, "https://other.invalid"), ctx())).status).toBe(403);
  for (const body of [null, { ...SET, startLevel: "U31" }, { ...SET, teachMore: ["nope"] }, { ...SET, difficulty: "easy" }]) expect((await PUT(put(body), ctx())).status).toBe(400);
  const ceiling = await PUT(put({ ...SET, startLevel: "U28" }), ctx());
  expect(ceiling.status).toBe(400);
  expect(await ceiling.json()).toMatchObject({ error: expect.stringMatching(/U27/) });
  expect((await PUT(put({ ...SET, teachLess: ["6.1"] }), ctx())).status).toBe(400);
  expect((await PUT(put(SET), ctx("not-a-uuid"))).status).toBe(404);
  expect(fake.rows.size).toBe(0);
});

it("answers 404 for an unknown child and 503 when the store fails", async () => {
  fake.children.clear();
  expect((await PUT(put(SET), ctx())).status).toBe(404);
  fake.children.set(CHILD, { parent_id: "22222222-2222-4222-8222-222222222222" });
  fake.fail = true;
  expect((await PUT(put(SET), ctx())).status).toBe(503);
});
