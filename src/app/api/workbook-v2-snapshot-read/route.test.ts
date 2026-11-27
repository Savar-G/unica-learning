import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { contentOf } from "@/lib/workbook-v2/build/freeze-bank";
import { inventedDraft } from "@/lib/workbook-v2/testing/sample";
import { memoryBankStore, type MemoryBankStore } from "@/lib/workbook-v2-bank/memory-store";
import { manifestHash, snapshotItems } from "@/lib/workbook-v2-bank/snapshot-items";
import { timedBookRead } from "@/lib/workbook-v2-bank/snapshot-read";
import { canonicalJson, sha256 } from "@/lib/workbook-v2/hash";
import type { BankStore } from "@/lib/workbook-v2-bank/types";

const f = vi.hoisted(() => ({ store: null as BankStore | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/workbook-v2-bank/server", () => ({ bankServerStore: () => f.store }));
import { POST } from "./route";

// The snapshot read check: the secret, the production switch, the body, and the timing record whose parts add up.

const SNAPSHOT_ID = "00000000-0000-4000-8000-000000000242";
const SHEETS = ["column-multiplication-1", "story-problems-1"];
const BODY = { snapshotId: SNAPSHOT_ID, sheetIds: SHEETS };
const call = (body: unknown, authorization: string | null = "Bearer test-secret") =>
  POST(new Request("https://unica.test/api/workbook-v2-snapshot-read", { method: "POST", headers: authorization ? { authorization } : {}, body: typeof body === "string" ? body : JSON.stringify(body) }));

/** A memory store that holds the invented topic as a frozen snapshot, put straight into its tables. */
function storeWithSnapshot(): MemoryBankStore {
  const store = memoryBankStore();
  const snapshot = contentOf(inventedDraft());
  const items = snapshotItems(snapshot);
  store.tables.snapshots.set(SNAPSHOT_ID, {
    id: SNAPSHOT_ID, level_id: "level-3", version: 1, name: "level-3-v1", content_hash: sha256(canonicalJson(snapshot)), manifest_hash: manifestHash(items),
    min_engine_version: "test", item_count: items.length, frozen_by: "Test admin", frozen_at: "2026-11-27T00:00:00.000Z",
  });
  store.tables.snapshotItems.set(SNAPSHOT_ID, items);
  return store;
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.stubEnv("VERCEL_ENV", "preview");
  f.store = storeWithSnapshot();
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("answers 503 with no secret or no store, and 401 for a missing or wrong header", async () => {
  vi.stubEnv("CRON_SECRET", "");
  expect((await call(BODY)).status).toBe(503);
  vi.stubEnv("CRON_SECRET", "test-secret");
  expect((await call(BODY, null)).status).toBe(401);
  expect((await call(BODY, "Bearer test-secre")).status).toBe(401);
  expect((await call(BODY, "Bearer test-secretx")).status).toBe(401);
  f.store = null;
  expect((await call(BODY)).status).toBe(503);
});

it("is off in production unless the switch is on", async () => {
  vi.stubEnv("VERCEL_ENV", "production");
  expect((await call(BODY)).status).toBe(404);
  vi.stubEnv("WORKBOOK_V2_TEST_PUBLISH", "on");
  expect((await call(BODY)).status).toBe(200);
});

it.each([
  ["no JSON", "not json"],
  ["no snapshot id", { sheetIds: SHEETS }],
  ["a snapshot id that is not a UUID", { ...BODY, snapshotId: "level-3-v1" }],
  ["no sheets", { ...BODY, sheetIds: [] }],
  ["more than 60 sheets", { ...BODY, sheetIds: Array.from({ length: 61 }, (_, i) => `s-${i}`) }],
  ["a sheet id with a capital letter", { ...BODY, sheetIds: ["Sheet-1"] }],
  ["the same sheet twice", { ...BODY, sheetIds: [SHEETS[0], SHEETS[0]] }],
  ["an unknown field", { ...BODY, levelId: "level-3" }],
])("answers 400 for %s", async (_case, body) => {
  expect((await call(body)).status).toBe(400);
});

it("answers 404 for a snapshot that is not there, and 422 for a sheet that the snapshot does not have", async () => {
  expect((await call({ ...BODY, snapshotId: "00000000-0000-4000-8000-000000000000" })).status).toBe(404);
  const res = await call({ ...BODY, sheetIds: ["no-such-sheet"] });
  expect(res.status).toBe(422);
  expect(await res.json()).toEqual({ error: 'Snapshot level-3-v1 has no sheet "no-such-sheet".' });
});

it("reads one book's rows and answers with the timing record, whose parts add up to the total", async () => {
  const res = await call(BODY);
  expect(res.status).toBe(200);
  const record = await res.json();
  const draft = inventedDraft() as Record<string, unknown[]>;
  // The header, the topic, the questions, scenarios and region packs, and the two sheets.
  const rows = 1 + 1 + draft.questions.length + draft.scenarios.length + draft.regionPacks.length + SHEETS.length;
  expect(record).toMatchObject({ httpStatus: 200, snapshotId: SNAPSHOT_ID, sheetCount: 2, rowCount: rows });
  expect(record.payloadBytes).toBeGreaterThan(1000);
  expect(Object.keys(record.parts).sort()).toEqual(["assembleMs", "itemsReadMs", "overheadMs", "snapshotMetaMs"]);
  const { snapshotMetaMs, itemsReadMs, assembleMs, overheadMs } = record.parts;
  expect(snapshotMetaMs + itemsReadMs + assembleMs + overheadMs).toBe(record.totalMs);
  expect(Object.values(record.parts).every((ms) => Number.isInteger(ms) && (ms as number) >= 0)).toBe(true);
});

it("rounds each part down and the total up, so the parts always add up with an overhead of 0 or more", async () => {
  const ticks = [10.2, 13.9, 21.4, 21.45];
  let i = 0;
  const read = await timedBookRead(storeWithSnapshot(), SNAPSHOT_ID, SHEETS, () => ticks[i++]);
  if (!read.ok) throw new Error(read.problem);
  expect(read.record.parts).toEqual({ snapshotMetaMs: 3, itemsReadMs: 7, assembleMs: 0, overheadMs: 2 });
  expect(read.record.totalMs).toBe(12);
  expect(i).toBe(4);
});
