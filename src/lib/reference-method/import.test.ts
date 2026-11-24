import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildEvidence } from "./evidence";
import { methodFileName, methodRef } from "./identity";
import { importTopicMethods, methodRowOf, type ExistingMethodRow, type TopicMethodRow, type TopicMethodStore } from "./import";
import { contentSha256, settleStatus, summarySha256 } from "./record";
import { createSupabaseTopicMethodStore } from "./store";
import { add, KEY, makeContents, makeExample, makeItem, makePage, statusesOf } from "./test-records";
import type { MethodKey, TopicMethodRecord } from "./types";

class MemoryStore implements TopicMethodStore {
  rows = new Map<string, TopicMethodRow>();
  calls: string[] = [];
  failOn: string | null = null;
  beforeUpdate: () => void = () => {};

  async findExisting(keys: MethodKey[]): Promise<Map<string, ExistingMethodRow>> {
    this.calls.push("find");
    const found = new Map<string, ExistingMethodRow>();
    for (const key of keys) {
      const row = this.rows.get(methodRef(key));
      if (row) found.set(methodRef(key), structuredClone({ record: row.record, status: row.status, digest: row.digest }));
    }
    return found;
  }

  async insertRow(row: TopicMethodRow): Promise<boolean> {
    this.write(`insert ${methodRef(row)}`);
    if (this.rows.has(methodRef(row))) return false;
    this.rows.set(methodRef(row), structuredClone(row));
    return true;
  }

  async updateRow(row: TopicMethodRow, expected: { digest: string; status: string }): Promise<boolean> {
    this.write(`update ${methodRef(row)}`);
    this.beforeUpdate();
    const stored = this.rows.get(methodRef(row));
    if (!stored || stored.digest !== expected.digest || stored.status !== expected.status) return false;
    this.rows.set(methodRef(row), structuredClone(row));
    return true;
  }

  private write(call: string): void {
    this.calls.push(call);
    if (this.failOn === call) throw new Error("no connection");
  }

  get writes(): string[] {
    return this.calls.filter((c) => c !== "find");
  }
}

let root: string;
let recordsDir: string;
let methodsDir: string;
let store: MemoryStore;

const pages = [
  makePage("11a", { examples: [makeExample(add(45, 3))], items: [makeItem(1, add(23, 4))] }),
  makePage("13a", { title: "Joining Pebbles 2", items: [makeItem(1, add(28, 4))] }),
];

function makeRecord(topic: number, text = "The page adds."): TopicMethodRecord {
  const key = { ...KEY, topic };
  const records = [...pages, makeContents()];
  const built = buildEvidence({ key, records, statusByRef: statusesOf(records), includeMachineRead: false });
  if (!built.ok) throw new Error(built.problems.join("\n"));
  const summary = [{ kind: "introduces" as const, text, cites: [topic === 1 ? "demo:Z:11a" : "demo:Z:13a"] }];
  return {
    kind: "topic_method",
    ...key,
    evidence: built.evidence,
    summary,
    summary_draft: { model: "claude", sha256: summarySha256(summary) },
    status: "drafted",
    approvals: [],
  };
}

function approved(record: TopicMethodRecord): TopicMethodRecord {
  const content_sha256 = contentSha256(record);
  const approvals = ["Ann", "Bo"].map((by) => ({ by, at: "2026-01-02T03:04:05.000Z", content_sha256 }));
  return settleStatus({ ...record, approvals });
}

function put(record: unknown, name = methodFileName(record as MethodKey)): void {
  writeFileSync(join(methodsDir, name), JSON.stringify(record));
}

const run = (extra: Partial<Parameters<typeof importTopicMethods>[0]> = {}): ReturnType<typeof importTopicMethods> =>
  importTopicMethods({ recordsDir, methodsDir, repoRoot: join(root, "repo"), store, ...extra });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "unica-method-import-"));
  recordsDir = join(root, "final");
  methodsDir = join(root, "methods");
  for (const dir of [recordsDir, methodsDir, join(root, "repo")]) mkdirSync(dir);
  const records = [...pages, makeContents()];
  for (const r of records) writeFileSync(join(recordsDir, `${r.source_ref.replaceAll(":", "-")}.json`), JSON.stringify(r));
  writeFileSync(join(recordsDir, "status.json"), JSON.stringify(Object.fromEntries(statusesOf(records))));
  store = new MemoryStore();
  put(makeRecord(1));
  put(makeRecord(2));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("import (M8)", () => {
  it("writes one row for each topic, and nothing when it runs again", async () => {
    expect((await run()).lines[0]).toBe("Import summary: records_read=2 inserted=2 replaced=0 skipped=0 skipped_different=0");
    expect([...store.rows.keys()]).toEqual(["demo:Z:topic-1", "demo:Z:topic-2"]);
    const row = store.rows.get("demo:Z:topic-1");
    expect(row).toMatchObject({ source: "demo", level: "Z", topic: 1, status: "drafted", digest: contentSha256(makeRecord(1)) });
    expect((await run({ replace: true })).lines[0]).toContain("inserted=0 replaced=0 skipped=2");
    expect(store.writes).toHaveLength(2);
  });

  it("calls no write method in a dry run and reports the same counts", async () => {
    const dry = await run({ dryRun: true });
    expect([store.writes, store.rows.size]).toEqual([[], 0]);
    const real = await run();
    expect(dry.lines[0].replace("Dry run", "Import")).toBe(real.lines[0]);
  });

  it("changes a stored row only with --replace", async () => {
    await run();
    put(makeRecord(1, "Another sentence."));
    const kept = await run();
    expect(kept.lines.join("\n")).toContain("skipped_different: demo:Z:topic-1");
    expect(store.rows.get("demo:Z:topic-1")?.record.summary[0].text).toBe("The page adds.");
    const dry = await run({ replace: true, dryRun: true });
    expect(dry.lines.join("\n")).toContain("replaced: demo:Z:topic-1");
    expect(store.writes).toHaveLength(2);
    const replaced = await run({ replace: true });
    expect(replaced.lines[0]).toContain("replaced=1 skipped=1");
    expect(store.rows.get("demo:Z:topic-1")?.record.summary[0].text).toBe("Another sentence.");
  });

  it("imports an approval as a change, and says when an approved row is drafted again", async () => {
    await run();
    put(approved(makeRecord(1)));
    expect((await run({ replace: true })).lines.join()).not.toContain("status_lowered");
    expect(store.rows.get("demo:Z:topic-1")?.status).toBe("approved");
    put(makeRecord(1, "Another sentence."));
    expect((await run()).lines.join("\n")).toContain("skipped_different: demo:Z:topic-1 (the stored row is approved)");
    expect(store.rows.get("demo:Z:topic-1")?.status).toBe("approved");
    for (const dryRun of [true, false]) {
      expect((await run({ replace: true, dryRun })).lines.join("\n")).toContain(
        "status_lowered: demo:Z:topic-1 approved -> drafted",
      );
    }
    expect(store.rows.get("demo:Z:topic-1")?.status).toBe("drafted");
  });

  it("never imports a status that the approvals do not give, and says so", async () => {
    put({ ...makeRecord(1), status: "approved" });
    const result = await run();
    expect(result.lines.join("\n")).toContain("status_in_file: demo:Z:topic-1 says approved, but its approvals give drafted");
    expect(store.rows.get("demo:Z:topic-1")).toMatchObject({ status: "drafted", record: { status: "drafted" } });
  });

  it("does not write over a row that changed after it was read", async () => {
    await run();
    put(makeRecord(1, "Another sentence."));
    store.beforeUpdate = () => {
      const other = methodRowOf(approved(makeRecord(1)));
      store.rows.set("demo:Z:topic-1", other);
    };
    const result = await run({ replace: true });
    expect(result.ok).toBe(false);
    expect(result.problems.join()).toContain("changed while the import ran");
    expect(store.rows.get("demo:Z:topic-1")?.status).toBe("approved");
  });

  it("says when another run wrote the row first", async () => {
    const insertRow = store.insertRow.bind(store);
    store.insertRow = async (row) => {
      store.rows.set(methodRef(row), methodRowOf(approved(makeRecord(row.topic))));
      return insertRow(row);
    };
    const result = await run();
    expect(result.lines[0]).toContain("inserted=0 replaced=0 skipped=0 skipped_different=2");
  });

  it("stops at a write error, says what is written, and finishes when it runs again", async () => {
    store.failOn = "insert demo:Z:topic-2";
    const result = await run();
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("no connection");
    expect(result.lines[0]).toContain("inserted=1");
    store.failOn = null;
    expect((await run()).lines[0]).toContain("inserted=1 replaced=0 skipped=1");
  });

  it.each<[string, () => void, string]>([
    ["a method file that is not JSON", () => writeFileSync(join(methodsDir, "demo-Z-topic-2.json"), "{"), "invalid JSON"],
    ["a method file with invalid UTF-8", () => writeFileSync(join(methodsDir, "demo-Z-topic-2.json"), Buffer.from([0x22, 0xff, 0x22])), "invalid UTF-8"],
    ["the replacement character", () => put(makeRecord(2, "Adds \uFFFD.")), "replacement character"],
    ["a null character", () => put(makeRecord(2, "Adds \u0000.")), "null character"],
    ["half of a character", () => put(makeRecord(2, "Adds \uD800.")), "split character"],
    ["a symlink", () => { rmSync(join(methodsDir, "demo-Z-topic-2.json")); symlinkSync(join(recordsDir, "status.json"), join(methodsDir, "demo-Z-topic-2.json")); }, "symlink"],
    ["an unknown field", () => put({ ...makeRecord(2), note: "x" }), "unknown field"],
    ["an unknown status", () => put({ ...makeRecord(2), status: "done" }), "must be one of drafted, approved"],
    ["a level in lower case", () => put({ ...makeRecord(2), level: "z" }, "demo-Z-topic-2.json"), "upper case"],
    ["a topic number that is text", () => put({ ...makeRecord(2), topic: "2" }), "must be a number"],
    ["a file name that is another topic's", () => put(makeRecord(2), "demo-Z-topic-3.json"), 'is the file name of another record: "demo:Z:topic-2"'],
    ["facts of another topic", () => put({ ...makeRecord(2), evidence: makeRecord(1).evidence }), "demo:Z:topic-2"],
    ["facts that code does not compute", () => { const r = makeRecord(2); r.evidence.gaps = []; put(r); }, "facts are not what code computes"],
    ["a summary that breaks a rule", () => { const r = makeRecord(2); r.summary[0].cites = []; put(r); }, "needs a citation"],
    ["a page record that is not valid", () => writeFileSync(join(recordsDir, "demo-Z-13a.json"), "{}"), "demo-Z-13a.json"],
    ["a page record that changed", () => writeFileSync(join(recordsDir, "demo-Z-13a.json"), JSON.stringify({ ...pages[1], readers: ["x"] })), "demo:Z:13a changed"],
    ["an approval with a bad digest", () => put({ ...makeRecord(2), approvals: [{ by: "Ann", at: "t", content_sha256: "x" }] }), "SHA-256"],
    ["an empty methods folder", () => { for (const n of [1, 2]) rmSync(join(methodsDir, `demo-Z-topic-${n}.json`)); }, "no method record"],
    ["a methods folder that does not exist", () => rmSync(methodsDir, { recursive: true }), "could not be read"],
  ])("refuses %s before the first write", async (_name, prepare, text) => {
    prepare();
    const result = await run({ replace: true });
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain(text);
    expect(store.calls).toEqual([]);
  });

  it("refuses folders inside the repository", async () => {
    const inside = join(root, "repo", "methods");
    mkdirSync(inside);
    expect((await run({ methodsDir: inside })).problems.join()).toContain("Refusing");
    expect(store.calls).toEqual([]);
  });

  it("takes the columns of a row from the record only", () => {
    const record = approved(makeRecord(2));
    expect(methodRowOf(record)).toEqual({
      source: "demo", level: "Z", topic: 2, record, status: "approved", digest: contentSha256(record),
    });
    expect(methodRowOf({ ...record, approvals: [] })).toMatchObject({ status: "drafted", record: { status: "drafted" } });
  });
});

describe("the Supabase store", () => {
  interface Sent { method: string; path: string; params: URLSearchParams; body: unknown; prefer: string }
  let sent: Sent[];
  let reply: { status: number; body: unknown };
  const supabaseStore = (): TopicMethodStore =>
    createSupabaseTopicMethodStore(
      createClient("http://db.invalid", "key", {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: async (input, init) => {
            const url = new URL(String(input));
            sent.push({
              method: init?.method ?? "GET",
              path: url.pathname,
              params: url.searchParams,
              body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
              prefer: new Headers(init?.headers).get("prefer") ?? "",
            });
            return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json" } });
          },
        },
      }),
      () => new Date("2026-01-02T03:04:05.000Z"),
    );

  beforeEach(() => {
    sent = [];
    reply = { status: 200, body: [] };
  });

  it("reads the rows of exactly these topics", async () => {
    reply.body = [{ source: "demo", level: "Z", topic_number: 2, record: { a: 1 }, status: "drafted", digest: "d" }];
    const found = await supabaseStore().findExisting([{ ...KEY }, { ...KEY, topic: 2 }, { source: "demo", level: "Y", topic: 1 }]);
    expect([...found]).toEqual([["demo:Z:topic-2", { record: { a: 1 }, status: "drafted", digest: "d" }]]);
    expect(sent.map((s) => [s.path, s.params.get("source"), s.params.get("level"), s.params.get("topic_number")])).toEqual([
      ["/rest/v1/bank_reference_topic_methods", "eq.demo", "eq.Z", "in.(1,2)"],
      ["/rest/v1/bank_reference_topic_methods", "eq.demo", "eq.Y", "in.(1)"],
    ]);
  });

  it("reads many topics in parts", async () => {
    await supabaseStore().findExisting(Array.from({ length: 250 }, (_, i) => ({ ...KEY, topic: i + 1 })));
    expect(sent).toHaveLength(3);
  });

  it("inserts a row and ignores one that is there", async () => {
    const row = methodRowOf(makeRecord(1));
    expect(await supabaseStore().insertRow(row)).toBe(false);
    reply.body = [{ topic_number: 1 }];
    expect(await supabaseStore().insertRow(row)).toBe(true);
    expect(sent[0].method).toBe("POST");
    expect(sent[0].params.get("on_conflict")).toBe("source,level,topic_number");
    expect(sent[0].prefer).toContain("resolution=ignore-duplicates");
    const { topic, ...columns } = row;
    expect(sent[0].body).toEqual({ ...columns, topic_number: topic });
  });

  it("updates only the row that still has the digest and status that were read", async () => {
    const row = methodRowOf(makeRecord(1));
    expect(await supabaseStore().updateRow(row, { digest: "old", status: "approved" })).toBe(false);
    reply.body = [{ topic_number: 1 }];
    expect(await supabaseStore().updateRow(row, { digest: "old", status: "approved" })).toBe(true);
    expect(sent[0].method).toBe("PATCH");
    expect(Object.fromEntries(sent[0].params)).toMatchObject({
      source: "eq.demo", level: "eq.Z", topic_number: "eq.1", digest: "eq.old", status: "eq.approved",
    });
    expect(sent[0].body).toEqual({ record: row.record, status: row.status, digest: row.digest, updated_at: "2026-01-02T03:04:05.000Z" });
  });

  it("reports a database error", async () => {
    reply = { status: 400, body: { message: "bad row" } };
    const row = methodRowOf(makeRecord(1));
    await expect(supabaseStore().findExisting([KEY])).rejects.toThrow("bad row");
    await expect(supabaseStore().insertRow(row)).rejects.toThrow("bad row");
    await expect(supabaseStore().updateRow(row, { digest: "d", status: "drafted" })).rejects.toThrow("bad row");
  });
});
