import { expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { historyCosts, historyPage, readScanHistory, type HistoryRecord, type HistoryStore } from "./scan-history";
import { scanHistoryStore } from "./scan-history-reader";
vi.mock("server-only", () => ({}));
const P = "11111111-1111-4111-8111-111111111111", C = "22222222-2222-4222-8222-222222222222", W = "33333333-3333-4333-8333-333333333333";
const now = Date.parse("2026-11-06T00:00:00Z");
const id = (n: number) => `44444444-4444-4444-8444-${String(n).padStart(12, "0")}`;
export function record(n = 1, result: "right" | "wrong" | "blank" | null = "right"): HistoryRecord {
  const identity = { workbookId: W, printedRevision: "immutable", pageId: id(n), itemId: "q1" };
  return { id: id(n), childId: C, childName: "Synthetic child", workbookId: W, book: 1, revision: "immutable", day: `Day ${n}`, pageNumber: n,
    photos: [{ id: id(500 + n), state: "deleted", expiresAt: "2026-10-01T00:00:00Z", sentAt: "2026-07-01T00:00:00Z", at: "2026-07-01T00:00:00Z" }],
    jobs: [{ photo: id(500 + n), state: "finished", dispatches: 2, blocked: null }],
    spend: [{ id: id(700 + n), model: "synthetic-model", at: "2026-11-05T00:00:00Z", reserved: 10000, charged: 2000, outcome: "finished" }],
    marks: [{ expected: { identity, number: 1, method: "code", scoredRegions: ["a"], mastery: { eligible: false, reason: "no-teaching-context" }, teaching: null },
      observation: { version: 1, identity, evidence: { photoRevision: id(500 + n) }, readAnswerText: "56", regions: [{ regionId: "a", text: "56", value: "56", certainty: "certain" }], certainty: "certain", state: result === null ? "pending" : "parent-checked", method: result === null ? "code" : "parent", result, teaching: null, mastery: { eligible: false, reason: "no-teaching-context" }, help: "none", actor: result === null ? "system" : "parent", resultVersion: 3 },
      originalEvent: { key: "marking:original", parentId: P, childId: C, source: "marking", question: { source: "workbook", workbookId: W, page: n, question: 1 }, skill: { standard: "2.4", skills: [] }, result: "wrong", stuckStep: "tens", mistake: "O3", hints: 0, timeMs: null, occurredAt: "2026-07-01T00:00:00Z", evidence: { kind: "scan", id: id(500 + n) } },
      eventId: id(900 + n), at: "2026-11-05T00:00:00Z", model: "synthetic-model", prompt: "synthetic-v1" }] };
}
const source = (records: HistoryRecord[], batch = 2): HistoryStore => ({ read: async (f) => ({ pages: records.filter((r) => !f.after || r.id > f.after).slice(0, batch), budget: null }) });
it("uses canonical parent-corrected results after expiry and does not count retakes", async () => {
  const r = record(); r.photos.push({ ...r.photos[0], id: id(999), state: "saved", expiresAt: "2027-01-01T00:00:00Z" });
  const out = await readScanHistory(source([r]), { child: C }, now);
  expect(out?.pages).toHaveLength(1); expect(out?.pages[0]).toMatchObject({ right: 1, wrong: 0, status: "ready", photo: r.photos[0].id, photoAvailable: false });
  expect(r.marks[0].originalEvent?.result).toBe("wrong"); expect(r.marks[0].observation.readAnswerText).toBe("56");
});
it("keeps blank, unscored, pending, failed, never scanned and ready separate", () => {
  const blank = record(1, "blank"), unscored = record(2), pending = record(3, null), failed = record(4, null), empty = record(5);
  unscored.marks[0].expected.method = "unscored"; Object.assign(unscored.marks[0].observation, { state: "unscored", method: "unscored", result: null });
  pending.jobs[0].state = "running"; pending.photos[0].state = "saved"; pending.photos[0].expiresAt = "2027-01-01"; failed.jobs[0].state = "queued"; failed.jobs[0].blocked = "attempts"; empty.marks = []; empty.photos = []; empty.jobs = [];
  expect([blank, unscored, pending, failed, empty, record(6)].map((r) => historyPage(r, now).status)).toEqual(["blank", "unscored", "pending", "failed", "never-scanned", "ready"]);
});
it("advances across every cursor page and filters before counting or costing the displayed set", async () => {
  const data = Array.from({ length: 108 }, (_, n) => record(n + 1, n % 3 === 0 ? null : "right"));
  const first = (await readScanHistory(source(data), { status: "review" }, now, 25))!;
  const second = (await readScanHistory(source(data), { status: "review", after: first.after! }, now, 25))!;
  const all = [...first.pages, ...second.pages]; expect(all).toHaveLength(36); expect(new Set(all.map((p) => p.id)).size).toBe(36);
  expect(first.counts.review).toBe(25); expect(first.costs.reported).toBe(50000); expect(second.counts.review).toBe(11); expect(second.costs.reported).toBe(22000); expect(second.after).toBeNull();
});
it("includes failed/uncertain costs and leaves unknown reservations unknown", () => {
  const ready = record(), failed = record(2, null); failed.jobs[0].blocked = "pending"; failed.jobs[0].state = "queued";
  failed.spend[0].charged = null; failed.spend[0].outcome = "failed";
  ready.spend.push({ ...ready.spend[0], id: id(1000), charged: 3000, outcome: "uncertain" });
  const costs = historyCosts([ready, failed], [historyPage(ready, now), historyPage(failed, now)]);
  expect(costs).toMatchObject({ reported: 5000, reserved: 10000, unknown: 1, accepted: 1, attempts: 3, logicalCalls: 2, perAccepted: null });
  expect(costs.split.map((r) => r.outcome)).toEqual(["failed / unknown cost", "finished", "uncertain"]);
  failed.spend[0].charged = 2000;
  expect(historyCosts([ready, failed], [historyPage(ready, now), historyPage(failed, now)]).perAccepted).toBe(7000);
});
it("both devices read one canonical page while a correction finishes out of order", async () => {
  let current = record(1, null); let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0; const store: HistoryStore = { read: async (f) => { if (f.after) return { pages: [], budget: null }; const snapshot = structuredClone(current); if (++calls === 1) await held; return { pages: [snapshot], budget: null }; } };
  const old = readScanHistory(store, {}, now); current = record(); const newer = await readScanHistory(store, {}, now); release(); const older = await old;
  expect(newer?.pages[0].right).toBe(1); expect(older?.pages[0].status).toBe("review"); expect(newer?.pages).toHaveLength(1); expect((await readScanHistory(store, {}, now))?.pages[0].right).toBe(1);
});
it("the real RPC adapter uses parent/Admin scopes and shared persisted-mark validation", async () => {
  const r = record(), raw = { ...r, marks: r.marks.map((m) => ({ expected: m.expected, observation: m.observation, original_event: m.originalEvent, event_id: m.eventId, evidence_at: m.at, model: m.model, prompt: m.prompt })) };
  const calls: Record<string, unknown>[] = []; const db = createClient<Database>("https://synthetic.invalid", "fake", { global: { fetch: async (_url, init) => { const args = JSON.parse(String(init?.body)); calls.push(args); return Response.json({ pages: args.p_data.after ? [] : [raw], budget: null }); } } });
  expect((await readScanHistory(scanHistoryStore(db, { parent: P }), { child: C }, now))?.pages[0].right).toBe(1);
  await readScanHistory(scanHistoryStore(db, { admin: P }), {}, now);
  expect(calls[0]).toMatchObject({ p_action: "history", p_parent: P, p_data: { child: C } });
  expect(calls.find((c) => c.p_action === "monitor")).toMatchObject({ p_parent: null, p_data: { admin: P } });
  raw.marks[0].observation.resultVersion = 0;
  await expect(readScanHistory(scanHistoryStore(db, { parent: P }), { child: C }, now)).rejects.toThrow("marking_observation");
});
