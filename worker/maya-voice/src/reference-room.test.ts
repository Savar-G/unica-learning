import { initializeLogger, type JobContext } from "@livekit/agents";
import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { referenceRoomName, REFERENCE_RPC, REFERENCE_TOPIC } from "@/lib/maya-workbook-speech";
import { FakeSpeech, FakeSTT, FakeTTS } from "./fake-providers";
const { providers } = vi.hoisted(() => ({ providers: vi.fn() }));
vi.mock("./providers", () => ({ makeProviders: providers }));
import { runWorkbookReference } from "./workbook-reference";

initializeLogger({ pretty: false, level: "silent" });
const job = { id: "00000000-0000-4000-8000-000000000335", parentId: "11111111-1111-4111-8111-111111111111", childId: "22222222-2222-4222-8222-222222222222", workbookId: "33333333-3333-4333-8333-333333333333" };

function fixture(foreign = false) {
  // The fakes by name: with nothing set the worker would use LiveKit Inference (D-285).
  vi.stubEnv("MAYA_STT", "fake");
  vi.stubEnv("MAYA_TTS", "fake");
  const reads: string[] = [];
  const db = createClient<Database>("https://fake.invalid", "fake-key", { global: { fetch: async url => {
    const table = new URL(String(url)).pathname.split("/").at(-1)!;
    reads.push(table);
    const data = table === "workbooks" ? { parent_id: foreign ? "foreign" : job.parentId, child_id: job.childId, status: "printed", printed_at: "2026-11-02T16:00:00Z" }
      : table === "children" || table === "test_accounts" ? { parent_id: job.parentId } : null;
    return Response.json(data);
  } } });
  const rpc = new Map<string, (data: { callerIdentity: string; payload: string }) => Promise<string>>();
  const attributes = { "maya.reference": job.id, "maya.parent": job.parentId, "maya.child": job.childId, "maya.workbook": job.workbookId };
  const identity = `child-${job.childId}`;
  const publish = vi.fn(async () => {});
  let ready!: () => void;
  const listening = new Promise<void>(resolve => { ready = resolve; });
  const connect = vi.fn(async () => {}), shutdown = vi.fn(async () => {});
  // The SDK context is a boundary fake. The public worker function owns all behavior under test.
  const context = {
    room: { name: referenceRoomName(job.id), remoteParticipants: new Map([[identity, { identity, attributes, trackPublications: new Map() }]]),
      on: vi.fn(), localParticipant: { publishData: publish, setAttributes: async () => { ready(); }, registerRpcMethod: (name: string, handler: (data: { callerIdentity: string; payload: string }) => Promise<string>) => { rpc.set(name, handler); } } },
    connect, shutdown, addShutdownCallback: vi.fn(),
  } as unknown as JobContext;
  const speech = new FakeSpeech();
  providers.mockResolvedValue({ stt: new FakeSTT(speech), tts: new FakeTTS(), fake: true, fakeSpeech: speech });
  return { db, reads, context, connect, shutdown, publish, listening, rpc, identity };
}

it("accepts test speech immediately when ready, delivers it only to the bound child, and closes without reading any package", async () => {
  const f = fixture();
  const run = runWorkbookReference(f.context, job, f.db);
  await f.listening;
  expect(await f.rpc.get(REFERENCE_RPC)!({ callerIdentity: f.identity, payload: JSON.stringify({ text: "page four number three" }) })).toBe("heard");
  await run;
  expect(f.connect).toHaveBeenCalledOnce();
  expect(f.shutdown).toHaveBeenCalledOnce();
  expect(f.publish).toHaveBeenCalledOnce();
  const [bytes, options] = f.publish.mock.calls[0] as unknown as [Uint8Array, { topic: string; destination_identities: string[] }];
  expect(JSON.parse(new TextDecoder().decode(bytes))).toEqual({ text: "page four number three" });
  expect(options).toMatchObject({ topic: REFERENCE_TOPIC, destination_identities: [f.identity] });
  expect([...f.reads].sort()).toEqual(["children", "test_accounts", "workbooks"]);
});

it("refuses a changed family before connecting or listening", async () => {
  const f = fixture(true);
  providers.mockClear();
  await runWorkbookReference(f.context, job, f.db);
  expect(f.connect).not.toHaveBeenCalled();
  expect(providers).not.toHaveBeenCalled();
  expect(f.shutdown).toHaveBeenCalledWith("reference refused");
});
