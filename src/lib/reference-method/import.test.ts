import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalSha256 } from "./canonical";
import { buildEvidence } from "./evidence";
import { methodFileName, methodRef } from "./identity";
import { importTopicMethods, methodRowOf, type ExistingMethodRow, type TopicMethodRow, type TopicMethodStore } from "./import";
import { contentSha256, settleStatus } from "./record";
import { createSupabaseTopicMethodStore } from "./store";
import { add, KEY, makeContents, makeExample, makeItem, makePage, statusesOf } from "./test-records";
import type { MethodKey, TopicMethodRecord } from "./types";

// Runs after the methods folder is listed, and after a method file is read.
const listed = vi.hoisted(() => ({ after: (): void => undefined, file: ((): void => undefined) as (path: string) => void }));
vi.mock("node:fs/promises", async (original) => {
  const real = await original<typeof import("node:fs/promises")>();
  const readdir = async (...args: Parameters<typeof real.readdir>) => {
    const entries = await real.readdir(...args);
    if (String(args[0]).endsWith("methods")) listed.after();
    return entries;
  };
  const open = async (...args: Parameters<typeof real.open>) => {
    const file = await real.open(...args);
    listed.file(String(args[0]));
    return file;
  };
  return { ...real, readdir, open };
});

class MemoryStore implements TopicMethodStore {
  rows = new Map<string, TopicMethodRow & { updated_at: string }>();
  calls: string[] = [];
  // The write that fails, and whether the table took it before the answer was lost.
  failOn: { call: string; after: boolean } | null = null;
  failReread = false;
  afterFind: () => void = () => {};
  private revision = 0;

  put(row: TopicMethodRow): void {
    this.revision += 1;
    this.rows.set(methodRef(row), structuredClone({ ...row, updated_at: `revision ${this.revision}` }));
  }

  async findExisting(keys: MethodKey[]): Promise<Map<string, ExistingMethodRow>> {
    if (this.failReread && this.calls.length > 1) throw new Error("no connection");
    this.calls.push("find");
    const found = new Map<string, ExistingMethodRow>();
    for (const key of keys) {
      const row = this.rows.get(methodRef(key));
      if (row) found.set(methodRef(key), structuredClone({ record: row.record, status: row.status, digest: row.digest, updated_at: row.updated_at }));
    }
    this.afterFind();
    return found;
  }

  async insertRow(row: TopicMethodRow): Promise<boolean> {
    return this.write(`insert ${methodRef(row)}`, row, !this.rows.has(methodRef(row)));
  }

  async updateRow(row: TopicMethodRow, updatedAt: string): Promise<boolean> {
    return this.write(`update ${methodRef(row)}`, row, this.rows.get(methodRef(row))?.updated_at === updatedAt);
  }

  private write(call: string, row: TopicMethodRow, allowed: boolean): boolean {
    this.calls.push(call);
    const fails = this.failOn?.call === call;
    if (allowed && (!fails || this.failOn?.after)) this.put(row);
    if (fails) throw new Error("connection lost");
    return allowed;
  }

  get writes(): string[] {
    return this.calls.filter((c) => c !== "find");
  }
}

let root: string;
let recordsDir: string;
let methodsDir: string;
let store: MemoryStore;
let announced: string[];

const pages = [
  makePage("11a", { examples: [makeExample(add(45, 3))], items: [makeItem(1, add(23, 4))] }),
  makePage("13a", { title: "Joining Pebbles 2", items: [makeItem(1, add(28, 4))] }),
];

// The text of a sentence about the page of the topic.
const on = (topic: number, words: string): string => `[${topic === 1 ? "11a" : "13a"}] ${words}`;

function makeRecord(topic: number, words = "adds."): TopicMethodRecord {
  const key = { ...KEY, topic };
  const records = [...pages, makeContents()];
  const built = buildEvidence({ key, records, statusByRef: statusesOf(records), includeMachineRead: false });
  if (!built.ok) throw new Error(built.problems.join("\n"));
  const summary = [{ kind: "introduces" as const, text: on(topic, words), cites: [topic === 1 ? "demo:Z:11a" : "demo:Z:13a"] }];
  return {
    kind: "topic_method",
    ...key,
    evidence: built.evidence,
    summary,
    summary_draft: { model: "claude", sha256: canonicalSha256(summary) },
    status: "drafted",
    approvals: [],
  };
}

function approved(record: TopicMethodRecord, ...more: string[]): TopicMethodRecord {
  const content_sha256 = contentSha256(record);
  const approvals = ["Ann", "Bo", ...more].map((by) => ({ by, at: "2026-01-02T03:04:05.000Z", content_sha256 }));
  return settleStatus({ ...record, approvals });
}

function put(record: unknown, name = methodFileName(record as MethodKey)): void {
  writeFileSync(join(methodsDir, name), JSON.stringify(record));
}

const run = (extra: Partial<Parameters<typeof importTopicMethods>[0]> = {}): ReturnType<typeof importTopicMethods> =>
  importTopicMethods({ recordsDir, methodsDir, repoRoot: join(root, "repo"), store, announce: (line) => announced.push(line), ...extra });

beforeEach(() => {
  announced = [];
  root = realpathSync(mkdtempSync(join(tmpdir(), "unica-method-import-")));
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

afterEach(() => {
  listed.file = () => undefined;
  listed.after = () => undefined;
  rmSync(root, { recursive: true, force: true });
});

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
    put(makeRecord(1, "shows another sum."));
    const kept = await run();
    expect(kept.lines.join("\n")).toContain("skipped_different: demo:Z:topic-1");
    expect(store.rows.get("demo:Z:topic-1")?.record.summary[0].text).toBe("[11a] adds.");
    const dry = await run({ replace: true, dryRun: true });
    expect(dry.lines.join("\n")).toContain("replaced: demo:Z:topic-1");
    expect(store.writes).toHaveLength(2);
    const replaced = await run({ replace: true });
    expect(replaced.lines[0]).toContain("replaced=1 skipped=1");
    expect(store.rows.get("demo:Z:topic-1")?.record.summary[0].text).toBe("[11a] shows another sum.");
  });

  it("imports an approval as a change, and says before the write when an approved row is drafted again", async () => {
    await run();
    put(approved(makeRecord(1)));
    await run({ replace: true });
    expect(announced).toEqual([]);
    expect(store.rows.get("demo:Z:topic-1")?.status).toBe("approved");
    put(makeRecord(1, "shows another sum."));
    expect((await run()).lines.join("\n")).toContain("skipped_different: demo:Z:topic-1 (the stored row is approved)");
    expect(store.rows.get("demo:Z:topic-1")?.status).toBe("approved");
    expect(announced).toEqual([]);
    const writesBefore: number[] = [];
    for (const dryRun of [true, false]) {
      const announce = (line: string): void => {
        writesBefore.push(store.writes.length);
        announced.push(line);
      };
      await run({ replace: true, dryRun, announce });
    }
    expect(announced).toEqual([
      "status_lowered: demo:Z:topic-1 approved -> drafted",
      "status_lowered: demo:Z:topic-1 approved -> drafted (planned: see the replaced lines for what was written)",
    ]);
    expect(new Set(writesBefore)).toEqual(new Set([store.writes.length - 1]));
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
    put(makeRecord(1, "shows another sum."));
    store.afterFind = () => store.put(methodRowOf(approved(makeRecord(1))));
    const result = await run({ replace: true });
    expect(result.ok).toBe(false);
    expect(result.problems.join()).toContain("changed while the import ran");
    expect(store.rows.get("demo:Z:topic-1")?.status).toBe("approved");
  });

  it("lets one of two imports that differ only in an approval win, and tells the other one", async () => {
    put(approved(makeRecord(1)));
    await run();
    const other = join(root, "methods-b");
    mkdirSync(other);
    put(approved(makeRecord(1), "Cy"));
    writeFileSync(join(other, "demo-Z-topic-1.json"), JSON.stringify(approved(makeRecord(1), "Dee")));
    const readBoth = Promise.withResolvers<void>();
    let reads = 0;
    const findExisting = store.findExisting.bind(store);
    store.findExisting = async (keys) => {
      const found = await findExisting(keys);
      reads += 1;
      if (reads === 2) readBoth.resolve();
      await readBoth.promise;
      return found;
    };
    const results = await Promise.all([run({ replace: true }), run({ replace: true, methodsDir: other })]);
    expect(results.map((r) => r.ok).sort()).toEqual([false, true]);
    expect(results.find((r) => !r.ok)?.problems.join()).toContain("changed while the import ran");
    const winner = results[0].ok ? "Cy" : "Dee";
    expect(store.rows.get("demo:Z:topic-1")?.record.approvals.map((a) => a.by)).toEqual(["Ann", "Bo", winner]);
  });

  it.each<[string, () => void]>([
    ["a page record", () => writeFileSync(join(recordsDir, "demo-Z-13a.json"), JSON.stringify({ ...pages[1], readers: ["x"] }))],
    ["a status", () => writeFileSync(join(recordsDir, "status.json"), JSON.stringify({ "demo:Z:11a": "human_checked", "demo:Z:13a": "double_read", "demo:Z:contents": "double_read" }))],
    ["a method record", () => put(makeRecord(2, "shows another sum."))],
    ["an approval", () => put(approved(makeRecord(2)))],
    ["a file less", () => rmSync(join(methodsDir, "demo-Z-topic-2.json"))],
  ])("writes nothing when %s changes after the check and before the first write", async (_name, change) => {
    put(approved(makeRecord(1)));
    await run();
    put(makeRecord(1, "shows another sum."));
    store.calls = [];
    store.afterFind = change;
    const result = await run({ replace: true });
    expect(announced).toEqual([]);
    expect([result.ok, result.problems[0]]).toEqual([false, expect.stringContaining("input files changed")]);
    expect(store.writes).toEqual([]);
  });

  it.each([
    [true, false, "the table holds the wanted row, but this run cannot say that it wrote it", 0],
    [false, false, "the row is not written", 0],
    [true, true, "may or may not be written", 0],
  ])("reads the row again after a lost answer (written %j, database gone %j)", async (after, failReread, text, replaced) => {
    put(approved(makeRecord(1)));
    await run();
    put(makeRecord(1, "shows another sum."));
    store.calls = [];
    store.failOn = { call: "update demo:Z:topic-1", after };
    store.failReread = failReread;
    const result = await run({ replace: true });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain(`write failed at demo:Z:topic-1: connection lost; `);
    expect(result.problems[0]).toContain(text);
    expect(result.lines[0]).toContain(`replaced=${replaced}`);
    expect(announced).toHaveLength(1);
    expect(store.rows.get("demo:Z:topic-1")?.status).toBe(after ? "drafted" : "approved");
    store.failOn = null;
    store.failReread = false;
    expect((await run({ replace: true })).lines[0]).toContain(after ? "replaced=0 skipped=2" : "replaced=1 skipped=1");
  });

  it("says when another run changed the row of a lost answer", async () => {
    store.failOn = { call: "insert demo:Z:topic-1", after: false };
    const findExisting = store.findExisting.bind(store);
    store.findExisting = async (keys) => {
      if (store.writes.length > 0) store.put(methodRowOf(approved(makeRecord(1))));
      return findExisting(keys);
    };
    expect((await run()).problems[0]).toContain("another run changed the row");
  });

  it("stops when the stored rows cannot be read", async () => {
    store.findExisting = () => Promise.reject(new Error("no connection"));
    expect((await run()).problems.join()).toContain("could not be read: no connection");
    expect(store.writes).toEqual([]);
  });

  it("says when another run wrote the row first", async () => {
    const insertRow = store.insertRow.bind(store);
    store.insertRow = async (row) => {
      store.put(methodRowOf(approved(makeRecord(row.topic))));
      return insertRow(row);
    };
    const result = await run();
    expect(result.lines[0]).toContain("inserted=0 replaced=0 skipped=0 skipped_different=2");
  });

  it("stops with --replace when another run wrote another row first, and skips the same row", async () => {
    const insertRow = store.insertRow.bind(store);
    store.insertRow = async (row) => {
      store.put(row.topic === 1 ? row : methodRowOf(approved(makeRecord(row.topic))));
      return insertRow(row);
    };
    const result = await run({ replace: true });
    expect([result.ok, result.problems[0]]).toEqual([false, expect.stringContaining("demo:Z:topic-2: the stored row changed while the import ran")]);
    expect(result.lines[0]).toContain("inserted=0 replaced=0 skipped=1 skipped_different=0");
  });

  it("checks the records against the pages as they are after the records were read", async () => {
    // The second pass reads the last method record, and then the page changes.
    listed.file = (path) => {
      if (path.endsWith("demo-Z-topic-2.json") && store.calls.length > 0) {
        writeFileSync(join(recordsDir, "demo-Z-13a.json"), JSON.stringify({ ...pages[1], readers: ["x"] }));
      }
    };
    const result = await run();
    expect(result.problems.join()).toContain("demo:Z:13a changed");
    expect(store.writes).toEqual([]);
  });

  it("stops when a method file disappears after the folder was read", async () => {
    listed.after = () => {
      listed.after = () => undefined;
      for (const n of [1, 2]) rmSync(join(methodsDir, `demo-Z-topic-${n}.json`));
    };
    const result = await run();
    expect(result.problems).toEqual([1, 2].map((n) => `demo-Z-topic-${n}.json disappeared while the import read the folder`));
    expect(store.calls).toEqual([]);
  });

  it("stops at a write error, says what is written, and finishes when it runs again", async () => {
    store.failOn = { call: "insert demo:Z:topic-2", after: false };
    const result = await run();
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("connection lost; the row is not written");
    expect(result.lines[0]).toContain("inserted=1");
    store.failOn = null;
    expect((await run()).lines[0]).toContain("inserted=1 replaced=0 skipped=1");
  });

  it.each<[string, () => void, string]>([
    ["a method file that is not JSON", () => writeFileSync(join(methodsDir, "demo-Z-topic-2.json"), "{"), "invalid JSON"],
    ["a method file with invalid UTF-8", () => writeFileSync(join(methodsDir, "demo-Z-topic-2.json"), Buffer.from([0x22, 0xff, 0x22])), "invalid UTF-8"],
    ["the replacement character", () => put(makeRecord(2, "adds \uFFFD.")), "replacement character"],
    ["a null character", () => put(makeRecord(2, "adds \u0000.")), "null character"],
    ["half of a character", () => put(makeRecord(2, "adds \uD800.")), "split character"],
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
    ["a page record in the file of another page", () => writeFileSync(join(recordsDir, "demo-Z-13a.json"), JSON.stringify({ ...pages[1], source_ref: "demo:Z:14a" })), "belongs in demo-Z-14a.json"],
    ["an approval with a bad time", () => { const r = approved(makeRecord(2)); r.approvals[0].at = "yesterday"; put(r); }, "instant in UTC"],
    ["a methods folder that is a symlink", () => { rmSync(methodsDir, { recursive: true }); mkdirSync(join(root, "real")); symlinkSync(join(root, "real"), methodsDir); }, "is a symlink"],
    ["an approval with a bad digest", () => put({ ...makeRecord(2), approvals: [{ by: "Ann", at: "2026-01-02T03:04:05.000Z", content_sha256: "x" }] }), "SHA-256"],
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
      createClient<Database>("http://db.invalid", "key", {
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
            const body = typeof reply.body === "function" ? (reply.body as (url: URL) => unknown)(url) : reply.body;
            return new Response(JSON.stringify(body), { status: reply.status, headers: { "content-type": "application/json" } });
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
    const columns = { record: { a: 1 }, status: "drafted", digest: "d", updated_at: "2026-01-02T03:04:05.123456+00:00" };
    reply.body = (url: URL) => (url.searchParams.get("level") === "eq.Z" ? [{ source: "demo", level: "Z", topic_number: 2, ...columns }] : []);
    const found = await supabaseStore().findExisting([{ ...KEY }, { ...KEY, topic: 2 }, { source: "demo", level: "Y", topic: 1 }]);
    expect([...found]).toEqual([["demo:Z:topic-2", columns]]);
    expect(sent.map((s) => [s.path, s.params.get("source"), s.params.get("level"), s.params.get("topic_number")])).toEqual([
      ["/rest/v1/bank_reference_topic_methods", "eq.demo", "eq.Z", "in.(1,2)"],
      ["/rest/v1/bank_reference_topic_methods", "eq.demo", "eq.Y", "in.(1)"],
    ]);
  });

  it("reads every row of every part of many topics", async () => {
    reply.body = (url: URL) =>
      (url.searchParams.get("topic_number") ?? "").slice(4, -1).split(",").map((n) => ({
        source: "demo", level: "Z", topic_number: Number(n), record: { n }, status: "drafted", digest: n, updated_at: n,
      }));
    const keys = Array.from({ length: 1201 }, (_, i) => ({ ...KEY, topic: i + 1 }));
    const found = await supabaseStore().findExisting(keys);
    expect([...found.keys()]).toEqual(keys.map(methodRef));
    expect([...found.values()].map((row) => row.digest)).toEqual(keys.map((key) => String(key.topic)));
    expect(sent.length).toBeGreaterThan(1);
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

  it("updates only the row that still has the updated_at that was read", async () => {
    const row = methodRowOf(makeRecord(1));
    const read = "2026-01-01T00:00:00.123456+00:00";
    expect(await supabaseStore().updateRow(row, read)).toBe(false);
    reply.body = [{ topic_number: 1 }];
    expect(await supabaseStore().updateRow(row, read)).toBe(true);
    expect(sent[0].method).toBe("PATCH");
    expect(Object.fromEntries(sent[0].params)).toMatchObject({
      source: "eq.demo", level: "eq.Z", topic_number: "eq.1", updated_at: `eq.${read}`,
    });
    const { topic, ...columns } = row;
    expect(sent[0].body).toEqual({ ...columns, topic_number: topic, updated_at: "2026-01-02T03:04:05.000Z" });
  });

  it.each(["2026-01-02T03:04:05+00:00", "2026-01-02T03:04:05.000999+00:00", "2030-05-06T07:08:09.123456+00:00"])(
    "gives an update a later updated_at than %s, also when the clock does not",
    async (read) => {
      await supabaseStore().updateRow(methodRowOf(makeRecord(1)), read);
      const { updated_at } = sent[0].body as { updated_at: string };
      expect(Date.parse(updated_at)).toBeGreaterThan(Date.parse(read));
    },
  );

  it("reports a database error", async () => {
    reply = { status: 400, body: { message: "bad row" } };
    const row = methodRowOf(makeRecord(1));
    await expect(supabaseStore().findExisting([KEY])).rejects.toThrow("bad row");
    await expect(supabaseStore().insertRow(row)).rejects.toThrow("bad row");
    await expect(supabaseStore().updateRow(row, "2026-01-01T00:00:00+00:00")).rejects.toThrow("bad row");
  });
});
