import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { BOOK, CHILD, IDS, PARENT, PROJECT_URL, TABLE, probeClient, type Timing } from "./adapter";
import { buildWorker, runProbe } from "./run.mjs";

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

/** A local HTTP stand-in for only this table. It proves transport and process behavior, not hosted SQL or grants. */
async function fakeDatabase(corruptPending = false) {
  const rows = new Map<string, Record<string, unknown>>();
  const requests: { path: string; method: string; ids: string[] }[] = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url!, "http://127.0.0.1");
      if (url.pathname !== `/rest/v1/${TABLE}`) throw Error("Foreign table");
      const method = request.method!;
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
      const matches = (row: Record<string, unknown>) => [...url.searchParams].every(([key, value]) => {
        if (["select", "limit", "order"].includes(key)) return true;
        if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
        if (value.startsWith("in.(")) return value.slice(4, -1).split(",").includes(String(row[key]));
        if (value === "not.is.null") return row[key] !== null;
        throw Error("Unexpected test filter");
      });
      let selected = [...rows.values()].filter(matches);
      if (method === "POST") {
        if (!IDS.includes(body.id) || rows.has(body.id) || body.parent_id !== PARENT || body.child_id !== CHILD || body.workbook_id !== BOOK || body.model !== "fake") throw Error("Synthetic identity or duplicate refused");
        const nullable = Object.fromEntries(["started_at", "ended_at", "trace", "maya_turns", "child_turns", "fallbacks", "board_history", "child_ink", "learning_event_id", "profile_rebuilt_at", "note_pending", "speech_to_text", "voice", "connected_seconds", "flag", "flagged_at", "assessment_id", "assessment_question_id"].map(k => [k, null]));
        const row = { ...nullable, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...body };
        rows.set(body.id, row); selected = [row];
      } else if (method === "PATCH") {
        for (const row of selected) {
          Object.assign(row, body);
          // Red control: a server that incorrectly promotes pending words must fail the recovery assertions.
          if (corruptPending && body.live?.text?.log?.some((e: { kind: string }) => e.kind === "part_pending")) {
            row.live = structuredClone(body.live);
            const live = row.live as typeof body.live;
            live.text.log = live.text.log.map((e: { kind: string }) => e.kind === "part_pending" ? { ...e, kind: "part" } : e);
          }
        }
      } else if (method === "DELETE") for (const row of selected) rows.delete(String(row.id));
      else if (method !== "GET") throw Error("Unexpected method");
      requests.push({ path: url.pathname, method, ids: selected.map(r => String(r.id)) });
      selected = selected.slice(0, Number(url.searchParams.get("limit") ?? IDS.length));
      const data = url.searchParams.get("select") === "id" ? selected.map(r => ({ id: r.id })) : selected;
      response.writeHead(method === "POST" ? 201 : 200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(data));
    } catch {
      response.writeHead(409, { "Content-Type": "application/json" }); response.end(JSON.stringify({ message: "Fake database refused request" }));
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Fake transport did not start");
  return { rows, requests, port: address.port, close: () => new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())) };
}

it("default CLI sends no request and does not read a key file", () => {
  // Falsifier: a configured invalid key file causes a read, or a hosted option is not required.
  const output = execFileSync(process.execPath, ["scripts/maya-stream-probe/run.mjs"], { env: { SUPABASE_SECRET_KEY_FILE: "/missing/do-not-read", SUPABASE_URL: "https://wrong.invalid" }, encoding: "utf8" });
  expect(output).toContain("Dry run: no request or credential read");
  expect(() => execFileSync(process.execPath, ["scripts/maya-stream-probe/run.mjs", "--cleanup"], { env: {}, stdio: "pipe" })).toThrow();
});

it("excludes real provider and service adapters from the worker", async () => {
  const built = await buildWorker();
  try {
    expect(built.files).toContain("src/lib/maya-call-store.ts");
    expect(built.files).toContain("src/lib/maya-call.ts");
    expect(built.files.some(p => /ai-openrouter|ai-usage|maya-call-seams|maya-chat-server/.test(p))).toBe(false);
    const code = await readFile(built.entry, "utf8");
    expect(code).not.toContain("function aiClient(");
    expect(code).not.toContain("function openRouterClient(");
  } finally { await rm(built.directory, { recursive: true, force: true }); }
});

it("refuses other tables, RPCs, IDs and family identities before transport", async () => {
  // Falsifier: any rejected operation reaches fetch, including a mutation without exact IDs.
  const send = vi.fn<typeof fetch>(async () => Response.json([]));
  const adapter = probeClient({ url: PROJECT_URL, key: "local-fake", ids: [IDS[0]], fetch: send, timing: () => {} });
  expect(() => adapter.db.from("learning_events")).toThrow("table refused");
  expect(() => adapter.db.from("maya_stream_probe_calls" as "maya_calls")).toThrow("table refused");
  expect(() => adapter.db.rpc("append_maya_call_ink", {} as never)).toThrow("operation refused");
  expect(() => probeClient({ url: "https://wrong.invalid", key: "fake", ids: IDS, fetch: send, timing: () => {} })).toThrow();
  for (const query of [
    adapter.db.from("maya_calls").delete(),
    adapter.db.from("maya_calls").update({ revision: 2 }),
    adapter.db.from("maya_calls").select("*").eq("id", IDS[1]),
    adapter.db.from("maya_calls").select("*").eq("child_id", PARENT),
    adapter.db.from("maya_calls").update({ parent_id: CHILD }).eq("id", IDS[0]),
  ]) expect((await query).error).not.toBeNull();
  expect(send).not.toHaveBeenCalled();
});

it("proves six process controls and rejects the two existing sweep settlement failures", async () => {
  // Falsifier: pending words or drawings survive, confirmed help disappears, recovery asks a model,
  // a child/event/note duplicates, a stale owner writes, or the new process does not see persisted rows.
  const fake = await fakeDatabase();
  const output: { timings: Timing[]; dispatches?: { index: number; afterOwnerResponseMs: number }[] }[] = [];
  const config = { url: PROJECT_URL, key: "local-fake", fakePort: fake.port };
  try {
    const proof = await runProbe(config, (r: { timings?: Timing[]; dispatches?: { index: number; afterOwnerResponseMs: number }[] }) => { if (r.timings) output.push({ timings: r.timings, dispatches: r.dispatches }); }).then(() => { throw Error("The pinned core unexpectedly passed the known sweep blocker. Remove this characterization after its repair."); }, error => error as { failures: { index: number; error: string }[]; results: { writer: { pid: number; stopped: boolean }; reader: null | { pid: number; notes: number; appended: number; proposals: number; reviewCalls: number }; verified: { id: string; pid: number; stopped: boolean; proposals: number; reviewCalls: number; appended: number; notes: number; rebuilt: number } }[] });
    // The runner keeps its required technical_issue assertion. A time_limit result never becomes a pass.
    expect(proof.failures).toEqual([
      { index: 2, error: expect.stringContaining("confirmed prefix only (time_limit)") },
      { index: 5, error: expect.stringContaining("confirmed prefix only (time_limit)") },
    ]);
    expect(proof.results).toHaveLength(6);
    expect(fake.rows.size).toBe(8);
    expect(proof.results?.map(r => r.verified.id)).toEqual(IDS.filter((_, i) => i !== 2 && i !== 5));
    expect(proof.results?.every(r => r.writer.stopped && r.verified.stopped && r.writer.pid !== r.verified.pid)).toBe(true);
    for (const row of proof.results ?? []) {
      expect(row.verified.proposals + row.verified.reviewCalls + row.verified.appended + row.verified.notes + row.verified.rebuilt).toBe(0);
      if (row.reader) {
        expect(row.reader.proposals + row.reader.reviewCalls).toBe(0);
        expect(row.reader.notes).toBe(1); expect(row.reader.appended).toBe(1);
      }
    }
    const timings = output.flatMap(o => o.timings);
    const dispatches = output.flatMap(o => o.dispatches ?? []);
    expect(dispatches).toHaveLength(6); // Three held confirmed prefixes and three normally completed sentences.
    expect(dispatches.every(d => d.afterOwnerResponseMs >= 0)).toBe(true);
    for (const phase of ["pending_write", "confirmation_write", "owner_reread"]) {
      const samples = timings.filter(t => t.phase === phase);
      expect(samples.length).toBeGreaterThan(0);
      expect(samples.every(t => t.status === 200 && t.rows === 1 && t.ms >= 0)).toBe(true);
    }
    for (const phase of ["old_owner_checkpoint", "old_owner_final_save"]) {
      expect(timings.filter(t => t.phase === phase)).toHaveLength(4);
      expect(timings.filter(t => t.phase === phase).every(t => t.status === 200 && t.rows === 0)).toBe(true);
    }
    expect(fake.requests.every(r => r.path === `/rest/v1/${TABLE}` && r.ids.every(id => IDS.includes(id)))).toBe(true);
    await expect(runProbe(config)).rejects.toThrow(); // Occupied fixtures cannot be overwritten.
    const cleaned = await runProbe({ ...config, cleanup: true });
    expect(cleaned.cleanup?.rows).toBe(8); expect(fake.rows.size).toBe(0);
    expect(fake.requests.filter(r => r.method === "DELETE")).toEqual([{ path: `/rest/v1/${TABLE}`, method: "DELETE", ids: IDS }]);
  } finally { await fake.close(); }
});

it("fails the red control when pending records are incorrectly promoted", async () => {
  const fake = await fakeDatabase(true);
  try { await expect(runProbe({ url: PROJECT_URL, key: "local-fake", fakePort: fake.port })).rejects.toThrow(); }
  finally { await fake.close(); }
});
