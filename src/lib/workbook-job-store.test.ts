import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { runAiCallLog, runFromRow, workbookJobSource, type RunAiCall } from "@/lib/workbook-job-store";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { fallbackAiClient, type AiCallRecord } from "@/lib/ai-fallback";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

it("bundles the standalone worker without cookie-based auth or next/headers", async () => {
  // Match scripts/workbook-worker.mjs. Build only: never start the worker or read a live row.
  const result = await build({
    absWorkingDir: fileURLToPath(new URL("../../", import.meta.url)),
    entryPoints: ["scripts/workbook-worker.ts"], outfile: "worker.mjs",
    bundle: true, platform: "node", target: "node22", format: "esm", packages: "external", write: false, metafile: true,
    plugins: [{ name: "server-only", setup(b) {
      b.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty" }));
      b.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "", loader: "js" }));
    } }],
  });
  expect(Object.keys(result.metafile.inputs)).not.toContain("src/lib/supabase-auth.ts");
  expect(Object.keys(result.metafile.inputs)).toContain("src/lib/child-profile-server.ts");
  const imports = Object.values(result.metafile.outputs).flatMap((o) => o.imports.map((i) => i.path));
  expect(imports.some((p) => /^next\/headers(?:\.js)?$/.test(p))).toBe(false);
});

const call = (provider: AiCallRecord["provider"], ms = 1234.6): AiCallRecord => ({ name: "workbook_page", provider, model: "m", outcome: "answered", ms, usd: provider === "api" ? 0.1 : 0, note: null });
const request = { name: "workbook_page", system: "s", schema: {}, content: [{ type: "text" as const, text: "t" }] };

it("reads only the selected assessment's code recommendation, duration and device for the plan", async () => {
  const reads: { table: string; columns?: string; filter?: string[] }[] = [];
  const device = { deviceClass: "desktop", input: "mouse", screenWidth: 1440, screenHeight: 900, browser: "chrome" };
  const client = { from(table: string) {
    const read = { table } as (typeof reads)[number];
    reads.push(read);
    const chain = {
      select(columns: string) { read.columns = columns; return chain; },
      eq(column: string, value: string) { read.filter = [column, value]; return chain; },
      async maybeSingle() { return { data: table === "assessments" ? { device } : { minutes: 55, recommendation: "behind" }, error: null }; },
    };
    return chain;
  } };
  const source = workbookJobSource(client as unknown as SupabaseClient<Database>, async () => ({ ok: false }));
  expect(await source.planningMetadata!("test-id")).toEqual({ device, report: { howWeHelp: "behind", minutes: 55 } });
  expect(reads).toEqual([
    { table: "assessments", columns: "device", filter: ["id", "test-id"] },
    { table: "reports", columns: "minutes, recommendation:model->>howWeHelp", filter: ["assessment_id", "test-id"] },
  ]);
});

it("reads a next-book run's saved plan from its snapshot row, and maps the run's snapshot id (#476)", async () => {
  const reads: string[] = [];
  const client = { from(table: string) {
    const chain = { select: () => chain, eq: (column: string, value: string) => { reads.push(`${table}.${column}=${value}`); return chain; },
      async maybeSingle() { return { data: null, error: null }; } };
    return chain;
  } } as unknown as SupabaseClient<Database>;
  const source = workbookJobSource(client, async () => ({ ok: true, profile: null }));
  expect(await source.nextBookPlan!("snap-1")).toEqual({ ok: false, reason: "not-found" });
  expect(reads).toEqual(["next_book_snapshots.id=snap-1"]);
  const row = { id: "r", created_at: "t", parent_id: "p", child_id: "c", number: 2, status: "queued", step: null, attempts: 0, max_attempts: 2,
    done_pages: null, total_pages: null, heartbeat_at: null, started_at: null, finished_at: null, error: null, errors: [], draft_id: null,
    draft_key: "k", resumes: 0, started_by: null, started_by_email: null, runner: "mac", stopped_by_email: null } as const;
  expect(runFromRow({ ...row, errors: [], snapshot_id: "snap-1" }).snapshotId).toBe("snap-1");
  expect(runFromRow({ ...row, errors: [] }).snapshotId).toBeNull();
});

describe("runAiCallLog", () => {
  it("R404-6 saves every completed call before returning, including fewer than ten calls", async () => {
    const writes: RunAiCall[][] = [];
    const log = runAiCallLog(async (calls) => { writes.push(calls); });
    for (let i = 0; i < 9; i++) await log.add("write", call("api"));
    expect(writes.flat()).toHaveLength(9);
    expect(new Set(writes.flat().map((r) => r.id)).size).toBe(9);
    expect(writes[0][0]).toMatchObject({ kind: "write", ms: 1235, usd: 0.1 });
  });

  it("R404-6 keeps a failed batch and retries the same durable ids after an uncertain save", async () => {
    const rows = new Map<string, RunAiCall>();
    const attempts: RunAiCall[][] = [];
    const log = runAiCallLog(async (calls) => {
      attempts.push(structuredClone(calls));
      for (const r of calls) rows.set(r.id!, r);
      if (attempts.length === 1) throw new Error("response lost after commit");
    });
    await expect(log.add("write", call("api"))).rejects.toThrow("response lost");
    await log.flush();
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(rows.size).toBe(1);
    expect([...rows.values()][0].usd).toBe(0.1);
  });

  it("R404-6 saves intent before the provider and saves accounting before returning its result", async () => {
    const rows = new Map<string, RunAiCall>();
    let release!: () => void;
    let completed!: () => void;
    const completing = new Promise<void>((r) => { completed = r; });
    const log = runAiCallLog(async (calls) => {
      if (calls.some((r) => r.outcome === "answered")) {
        completed();
        await new Promise<void>((r) => { release = r; });
      }
      for (const r of calls) rows.set(r.id!, r);
    });
    const client = fallbackAiClient({
      model: "m", primary: "subscription", api: null,
      subscription: { model: "m", json: async () => {
        expect([...rows.values()].map((r) => r.outcome)).toEqual(["started"]);
        return { items: [] };
      } },
      onStart: (r) => log.add("write", r), onCall: (r) => log.add("write", r),
    });
    let returned = false;
    const running = client.json(request, new AbortController().signal).then((r) => { returned = true; return r; });
    await completing;
    expect(returned).toBe(false);
    expect([...rows.values()].map((r) => r.outcome)).toEqual(["started"]);
    release();
    expect(await running).toEqual({ items: [] });
    expect(rows.size).toBe(1);
    expect([...rows.values()][0].outcome).toBe("answered");
  });

  it("R404-6 does not start a provider when the intent cannot be saved", async () => {
    const json = vi.fn(async () => ({}));
    const log = runAiCallLog(async () => { throw new Error("offline"); });
    const client = fallbackAiClient({ model: "m", primary: "subscription", subscription: { model: "m", json }, api: null, onStart: (r) => log.add("write", r) });
    await expect(client.json(request, new AbortController().signal)).rejects.toThrow("offline");
    expect(json).not.toHaveBeenCalled();
  });
});
