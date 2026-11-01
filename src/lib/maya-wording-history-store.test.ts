import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { MAX_WORDINGS, memoryWordingHistoryStore, type WordingHistory, type WordingHistoryStore } from "@/lib/maya";
import { wordingHistoryStore } from "@/lib/maya-wording-history-store";

// The wording history store's two adapters (#375, D-196) keep the same rules, through the store's interface: a child
// with no history reads an empty one; a record adds the call's wordings, each keeping its newest time; only the newest
// MAX_WORDINGS are kept; children are apart; two records that run together both keep their wordings. The Supabase
// adapter talks to a fake PostgREST that keeps the rows and answers as the database does: the table is read with a
// select, and every write goes through record_maya_wordings (its own merge here, written apart from mergeHistory, as
// the SQL is), which records nothing for a child that is gone and refuses a family being deleted (55000).

const PARENT = "00000000-0000-4000-8000-0000000000a1";
const CHILD = "00000000-0000-4000-8000-0000000000c1";
const SIBLING = "00000000-0000-4000-8000-0000000000c2";
const FENCED_PARENT = "00000000-0000-4000-8000-0000000000a2";
const FENCED_CHILD = "00000000-0000-4000-8000-0000000000c3";
const GONE_CHILD = "00000000-0000-4000-8000-0000000000c9";

function fakePostgrest() {
  const children: Record<string, string> = { [CHILD]: PARENT, [SIBLING]: PARENT, [FENCED_CHILD]: FENCED_PARENT };
  const rows = new Map<string, { parent_id: string; heard: Record<string, number> }>();
  const sent: { p_child: string; p_heard: Record<string, unknown>; p_max: number }[] = [];
  const db = createClient("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/rest/v1/maya_wording_history" && (!init?.method || init.method === "GET")) {
      const child = url.searchParams.get("child_id")?.replace(/^eq\./, "");
      const row = child ? rows.get(child) : undefined;
      const one = new Headers(init?.headers).get("accept") === "application/vnd.pgrst.object+json";
      if (one) return row ? Response.json({ heard: row.heard }) : Response.json({ code: "PGRST116", message: "0 rows" }, { status: 406 });
      return Response.json(row ? [{ heard: row.heard }] : []);
    }
    if (url.pathname === "/rest/v1/rpc/record_maya_wordings" && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      sent.push(body);
      const { p_child, p_heard, p_max } = body as { p_child: string; p_heard: Record<string, unknown>; p_max: number };
      if (Object.values(p_heard).some((v) => typeof v !== "number")) return Response.json({ code: "22023", message: "maya_wordings_invalid" }, { status: 400 });
      const parent = children[p_child];
      if (!parent) return Response.json(null);
      if (parent === FENCED_PARENT) return Response.json({ code: "55000", message: "family_unavailable" }, { status: 400 });
      const all = new Map(Object.entries(rows.get(p_child)?.heard ?? {}));
      for (const [id, at] of Object.entries(p_heard as Record<string, number>)) if (!(all.get(id)! >= at)) all.set(id, at);
      const kept = [...all].sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0)).slice(0, p_max);
      rows.set(p_child, { parent_id: parent, heard: Object.fromEntries(kept) });
      return Response.json(kept.length);
    }
    throw new Error(`unexpected request ${init?.method ?? "GET"} ${url.pathname}`);
  } } });
  return { store: wordingHistoryStore(db), sent, rows };
}

/** `n` wordings `w#<i>` heard at `t0 + i`. */
const many = (n: number, t0: number, prefix = "w"): WordingHistory => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}#${i}`, t0 + i]));

describe.each([
  ["Supabase", (): WordingHistoryStore => fakePostgrest().store],
  ["in-memory", (): WordingHistoryStore => memoryWordingHistoryStore()],
] as const)("the %s wording history store", (_, open) => {
  it("reads an empty history for a child with none", async () => {
    expect(await open().read(CHILD)).toEqual({});
  });

  it("adds a call's wordings, and a wording keeps its newest time", async () => {
    const store = open();
    await store.record(CHILD, { "add.open#0": 1_000, "phrase:praise.2": 2_000 });
    expect(await store.read(CHILD)).toEqual({ "add.open#0": 1_000, "phrase:praise.2": 2_000 });
    await store.record(CHILD, { "add.open#0": 500, "phrase:praise.2": 3_000, "add.close#1": 2_500 });
    expect(await store.read(CHILD)).toEqual({ "add.open#0": 1_000, "phrase:praise.2": 3_000, "add.close#1": 2_500 });
  });

  it("keeps only the newest MAX_WORDINGS wordings", async () => {
    const store = open();
    await store.record(CHILD, many(MAX_WORDINGS, 10_000, "old"));
    await store.record(CHILD, many(5, 20_000, "new"));
    const history = await store.read(CHILD);
    expect(Object.keys(history)).toHaveLength(MAX_WORDINGS);
    expect(history["new#0"]).toBe(20_000);
    for (let i = 0; i < 5; i++) expect(history).not.toHaveProperty(`old#${i}`);
    expect(history[`old#${MAX_WORDINGS - 1}`]).toBe(10_000 + MAX_WORDINGS - 1);
  });

  it("keeps each child's history apart", async () => {
    const store = open();
    await store.record(CHILD, { "a#0": 1 });
    await store.record(SIBLING, { "b#0": 2 });
    expect(await store.read(CHILD)).toEqual({ "a#0": 1 });
    expect(await store.read(SIBLING)).toEqual({ "b#0": 2 });
  });

  it("loses no wording when two calls of the same child record together", async () => {
    const store = open();
    await Promise.all([store.record(CHILD, { "a#0": 1, "shared#0": 5 }), store.record(CHILD, { "b#0": 2, "shared#0": 7 })]);
    expect(await store.read(CHILD)).toEqual({ "a#0": 1, "b#0": 2, "shared#0": 7 });
  });

  it("leaves out times that are not finite numbers", async () => {
    const store = open();
    await store.record(CHILD, { "a#0": 1, "b#0": Number.NaN, "c#0": Infinity });
    expect(await store.read(CHILD)).toEqual({ "a#0": 1 });
  });
});

describe("the Supabase wording history store", () => {
  it("sends the newest MAX_WORDINGS with finite times, and nothing for an empty call", async () => {
    const { store, sent } = fakePostgrest();
    await store.record(CHILD, {});
    await store.record(CHILD, { "b#0": Number.NaN });
    expect(sent).toEqual([]);
    await store.record(CHILD, { ...many(MAX_WORDINGS + 3, 0), "b#0": Number.NaN });
    expect(sent).toHaveLength(1);
    expect(sent[0].p_max).toBe(MAX_WORDINGS);
    expect(Object.keys(sent[0].p_heard)).toHaveLength(MAX_WORDINGS);
    expect(sent[0].p_heard).not.toHaveProperty("w#0");
  });

  it("records nothing for a child that is gone, and throws for a family being deleted", async () => {
    const { store, rows } = fakePostgrest();
    await store.record(GONE_CHILD, { "a#0": 1 });
    expect(rows.size).toBe(0);
    expect(await store.read(GONE_CHILD)).toEqual({});
    await expect(store.record(FENCED_CHILD, { "a#0": 1 })).rejects.toThrow(/55000/);
    expect(rows.size).toBe(0);
  });
});
