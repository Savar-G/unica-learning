import { describe, expect, it, vi } from "vitest";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore } from "@/lib/maya";
import { mayaCalls, type CallSeams } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import type { PrepareRecord } from "@/lib/maya-prepared";
import { requestContext, withRequestContext, type RequestContext } from "@/lib/maya-request-trace";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { callSpend, createSpendLedger, spendConfig } from "@/lib/maya-spend";
import { memorySpendStore } from "@/lib/maya-spend-memory";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";

vi.mock("server-only", () => ({}));

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const PKG = { ...SAMPLE_PACKAGES["subtract-52-28"], ref: { source: "workbook" as const, workbookId: "44444444-4444-4444-8444-444444444444", page: 1, question: 1 } };
const good = () => reply("Let's look at the ones. What is 12 minus 8?", "guide", { step: "ones", level: 2 });

async function setup() {
  const now = Date.parse("2026-11-14T18:00:00Z");
  let n = 0;
  const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const store = memoryCallStore({ testFamilies: [PARENT], clock: () => now });
  const ledger = createSpendLedger({ store: memorySpendStore({ clock: () => now }), config: spendConfig({}), clock: () => now, zone: async () => "America/Vancouver" });
  const factoryIds: string[] = [];
  const sent: { id: string | undefined; context: RequestContext }[] = [];
  const seams: CallSeams = {
    store, connections: memoryConnectionLog(store, () => now), history: memoryWordingHistoryStore(),
    events: learningEvents(memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }] })),
    rebuild: async () => true,
    model: (_id, _call, how) => {
      const id = how?.prepared?.diagnosticHandleId;
      if (id) factoryIds.push(id);
      return conversationalFake({ answer: async () => { await Promise.resolve(); sent.push({ id, context: { ...requestContext() } }); return good(); } });
    },
    reviewer: () => fakeTalkReviewer(),
    isTestFamily: async () => true, canChat: async () => true,
    alerts: { send: async () => {}, list: async () => [] },
    spend: callSpend(ledger, { clock: () => now, newId }), clock: () => now, newId, seed: () => 42,
  };
  const calls = mayaCalls(seams);
  const started = await calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Ava", package: PKG, startedBy: "admin-1" });
  if (!started.ok) throw new Error(started.error);
  const opened = await calls.openVoice(started.view.id, { speechToText: "fake", voice: "fake" }, "Ava");
  if (!opened.ok) throw new Error(opened.error);
  await opened.call.start();
  return { call: opened.call, store, factoryIds, sent };
}

describe("openVoice preparation diagnostics", () => {
  it("forwards the same actual-handle getter to the request factory and copied used/discarded records", async () => {
    const t = await setup();
    const got: PrepareRecord[] = [];
    expect(t.call.onPreparation).toBeTypeOf("function");
    t.call.onPreparation!((record) => { got.push({ ...record }); record.leadMs = -1; });
    expect(t.call.prepare({ text: "6", reason: "interim" })).toBe(true);
    await t.call.child("6");
    await t.call.end({ reason: "child_stopped" });
    await t.call.settled();
    expect(got.some((r) => r.status === "used")).toBe(true);
    expect(got.some((r) => r.status === "discarded")).toBe(true);
    expect(new Set(got.map((r) => r.diagnosticHandleId)).size).toBe(got.length);
    for (const record of got) {
      expect(record.diagnosticHandleId).toBeDefined();
      expect(t.factoryIds).toContain(record.diagnosticHandleId);
      expect(t.sent.some((s) => s.id === record.diagnosticHandleId)).toBe(true);
    }
    const saved = t.store.rows()[0].trace?.preparations;
    expect(saved?.length).toBeGreaterThan(0);
    // Costs can settle after the decision. End also reports discards outside the last durable child turn.
    for (const record of saved!) {
      expect(record.leadMs).toBeGreaterThanOrEqual(0);
      expect(record).toMatchObject(got.find((r) => r.diagnosticHandleId === record.diagnosticHandleId)!);
    }
  });

  it("reports discards at end with no active child turn", async () => {
    const t = await setup();
    const got: PrepareRecord[] = [];
    t.call.onPreparation!((r) => got.push(r));
    expect(t.call.prepare({ text: "6", reason: "interim" })).toBe(true);
    await t.call.end({ reason: "child_stopped" });
    await t.call.settled();
    expect(got).toContainEqual(expect.objectContaining({ status: "discarded", reason: "ended", diagnosticHandleId: expect.any(String) }));
  });

  it("clears inherited preparation ids for an ordinary model call, keeps the worker turn, and survives observer failure", async () => {
    const t = await setup();
    t.call.onPreparation!(() => { throw new Error("diagnostic observer"); });
    expect(t.call.prepare({ text: "6", reason: "interim" })).toBe(true);
    await t.call.child("6");
    t.sent.length = 0;
    await withRequestContext({ source: "prepared_interim", turnId: "turn-9", prepareId: "old-hint", diagnosticHandleId: "old-handle" }, () => t.call.child("I need help."));
    const ordinary = t.sent.filter((s) => s.id === undefined);
    expect(ordinary.length).toBeGreaterThan(0);
    for (const { context } of ordinary) expect(context).toMatchObject({ source: "model", turnId: "turn-9", prepareId: null, diagnosticHandleId: null });
    await t.call.end({ reason: "child_stopped" });
    await t.call.settled();
  });
});
