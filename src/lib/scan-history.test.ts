import { expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { DEFERRAL_FRESH_MS, historyCosts, historyPage, readScanHistory, type HistoryRecord, type HistoryStore } from "./scan-history";
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
/** A mark the AI has not read yet: no model, no reading. */
const unread = (r: HistoryRecord) => { r.marks[0].model = null; Object.assign(r.marks[0].observation, { certainty: "not-read", readAnswerText: null, regions: [] }); return r; };
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
  unread(pending); pending.jobs[0].state = "running"; pending.photos[0].state = "saved"; pending.photos[0].expiresAt = "2027-01-01"; failed.jobs[0].state = "queued"; failed.jobs[0].blocked = "attempts"; unread(failed); empty.marks = []; empty.photos = []; empty.jobs = [];
  expect([blank, unscored, pending, failed, empty, record(6)].map((r) => historyPage(r, now).status)).toEqual(["blank", "unscored", "pending", "failed", "never-scanned", "ready"]);
});
it("a job waiting as pending for a later run is still being marked, never Could not mark (#868)", () => {
  const waiting = unread(record(1, null)); waiting.jobs[0].state = "queued"; waiting.jobs[0].blocked = "pending";
  waiting.photos[0].state = "saved"; waiting.photos[0].expiresAt = "2027-01-01";
  expect(historyPage(waiting, now)).toMatchObject({ status: "pending", label: "Not marked yet", failedJob: false });
});
it("a waiting job whose photo expired can no longer be marked: Could not mark, and in the failed filter (#868)", async () => {
  const expired = (n: number, state: string, expiresAt: string) => {
    const r = unread(record(n, null)); r.jobs[0].state = "queued"; r.jobs[0].blocked = "pending";
    r.photos[0].state = state; r.photos[0].expiresAt = expiresAt; return r;
  };
  const pages = [expired(1, "saved", "2026-11-05T00:00:00Z"), expired(2, "expired", "2026-11-05T00:00:00Z"), expired(3, "saved", "2026-11-06T00:00:00Z")];
  for (const r of pages) expect(historyPage(r, now)).toMatchObject({ status: "failed", label: "Could not mark", failedJob: true });
  expect((await readScanHistory(source(pages, 100), { status: "failed" }, now))!.pages.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
  // A job still running on an expired photo cannot finish either.
  const running = expired(4, "saved", "2026-11-05T00:00:00Z"); running.jobs[0].state = "running"; running.jobs[0].blocked = null;
  expect(historyPage(running, now).status).toBe("failed");
  // A live retake of the same page can still mark it: Not marked yet.
  const retake = expired(5, "expired", "2026-11-05T00:00:00Z");
  retake.photos.push({ ...retake.photos[0], id: id(990), state: "saved", expiresAt: "2027-01-01T00:00:00Z" });
  expect(historyPage(retake, now)).toMatchObject({ status: "pending", failedJob: false });
});
it("a never-sent retake cannot mark the page: the stranded job still reads Could not mark", () => {
  const r = unread(record(6, null)); r.jobs[0].state = "queued"; r.jobs[0].blocked = "pending";
  r.photos[0].state = "expired";
  r.photos.push({ ...r.photos[0], id: id(991), state: "saved", expiresAt: "2027-01-01T00:00:00Z", sentAt: null });
  expect(historyPage(r, now)).toMatchObject({ status: "failed", failedJob: true });
  // Once sent (or claimed by a job) the retake can still mark it.
  r.photos[1].sentAt = "2026-11-05T23:00:00Z";
  expect(historyPage(r, now)).toMatchObject({ status: "pending", failedJob: false });
});
it("admins see a waiting job in the failed filter unless its own latest dispatch is a recent clean 429; parents never do", async () => {
  const at = (ms: number) => new Date(ms).toISOString();
  const waiting = (n: number, blocked: string, last: HistoryRecord["jobs"][number]["lastDispatch"]) => {
    const r = unread(record(n, null)); r.jobs[0].state = "queued"; r.jobs[0].blocked = blocked; r.jobs[0].lastDispatch = last;
    r.photos[0].state = "saved"; r.photos[0].expiresAt = "2027-01-01T00:00:00Z";
    return r;
  };
  const deferred = waiting(1, "pending", { cleanFailure: "rate-limit", settledAt: at(now - 60_000) });
  const old = waiting(2, "pending", { cleanFailure: "rate-limit", settledAt: at(now - DEFERRAL_FRESH_MS - 1) });
  const timedOut = waiting(3, "pending", { cleanFailure: null, settledAt: null });
  const neverCalled = waiting(4, "pending", null);
  // A closed plan is no failure, as before #868.
  const closed = waiting(5, "off", null);
  // Freshness is the job's own: a fresh clean 429 on another job of the page does not cover a stuck one.
  const mixed = waiting(6, "pending", { cleanFailure: null, settledAt: null });
  mixed.photos.push({ ...mixed.photos[0], id: id(992) });
  mixed.jobs.push({ ...mixed.jobs[0], photo: id(992), lastDispatch: { cleanFailure: "rate-limit", settledAt: at(now - 60_000) } });
  const all = [deferred, old, timedOut, neverCalled, closed, mixed];
  for (const r of all) expect(historyPage(r, now, "admin"), r.day).toMatchObject({ status: "pending", label: "Not marked yet" });
  expect(all.map((r) => historyPage(r, now, "admin").failedJob)).toEqual([false, true, true, true, false, true]);
  const admin: HistoryStore = { read: async (f) => ({ pages: all.filter((r) => !f.after || r.id > f.after), budget: null, admin: true }) };
  expect((await readScanHistory(admin, { status: "failed" }, now))!.pages.map((p) => p.pageNumber)).toEqual([2, 3, 4, 6]);
  // The parent scope has no dispatch data: a waiting job on a live sent photo is never in its "could not mark" filter.
  expect(all.map((r) => historyPage(r, now).failedJob)).toEqual([false, false, false, false, false, false]);
  expect((await readScanHistory(source(all, 100), { status: "failed" }, now))!.pages).toEqual([]);
});
it("an unsure page says our team is checking it; a page not read yet says Not marked yet; neither asks the parent (#715)", () => {
  const unsure = record(1, null), notRead = unread(record(2, null));
  notRead.jobs = []; notRead.photos[0].state = "saved"; notRead.photos[0].expiresAt = "2027-01-01";
  expect(historyPage(unsure, now)).toMatchObject({ status: "review", label: "Our team is checking", counts: { teamChecks: 1, pending: 0 } });
  expect(historyPage(notRead, now)).toMatchObject({ status: "pending", label: "Not marked yet", counts: { teamChecks: 0, pending: 1 } });
  // Some answers marked and others not read yet: the page says so, as the results page does.
  const partly = record(3);
  partly.marks.push({ ...structuredClone(unread(record(3, null)).marks[0]), expected: { ...partly.marks[0].expected, identity: { ...partly.marks[0].expected.identity, itemId: "q2" }, number: 2 } });
  partly.marks[1].observation.identity = partly.marks[1].expected.identity;
  partly.jobs = []; partly.photos[0].state = "saved"; partly.photos[0].expiresAt = "2027-01-01";
  expect(historyPage(partly, now)).toMatchObject({ status: "pending", label: "Some answers not marked yet", counts: { scored: 1, pending: 1 } });
  // One rule with the results page and the team list: an answer our team is checking wins, even while a job waits.
  const queued = record(4, null); queued.jobs[0].state = "queued"; queued.jobs[0].blocked = null;
  expect(historyPage(queued, now)).toMatchObject({ status: "review", label: "Our team is checking" });
  // Photo gone and never read: still not marked, never a team claim.
  notRead.photos[0].expiresAt = "2026-01-01";
  expect(historyPage(notRead, now)).toMatchObject({ status: "pending", label: "Not marked yet" });
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

it("lists every photographed page of a book in printed order, however the stored page ids sort (#920)", async () => {
  // 60 printed pages whose ids run against page order; pages 3 to 22 have photos and marks.
  const book = Array.from({ length: 60 }, (_, n) => {
    const r = record(n + 1); r.id = id(1000 - n);
    if (n + 1 < 3 || n + 1 > 22) { r.marks = []; r.photos = []; r.jobs = []; r.spend = []; }
    return r;
  }).sort((a, b) => a.id.localeCompare(b.id));
  const all = (await readScanHistory(source(book, 100), { child: C, workbook: W, scannedOnly: true }, now))!;
  expect(all.pages.map((p) => p.pageNumber)).toEqual(Array.from({ length: 20 }, (_, n) => n + 3));
  expect(all.pages.every((p) => p.status === "ready")).toBe(true); expect(all.after).toBeNull();
  // Without the photo filter the first 25 are the first 25 printed pages, not the first 25 ids, and the cursor continues in page order.
  const first = (await readScanHistory(source(book), { child: C, workbook: W }, now))!;
  expect(first.pages.map((p) => p.pageNumber)).toEqual(Array.from({ length: 25 }, (_, n) => n + 1));
  const second = (await readScanHistory(source(book), { child: C, workbook: W, after: first.after! }, now))!;
  expect(second.pages.map((p) => p.pageNumber)).toEqual(Array.from({ length: 25 }, (_, n) => n + 26));
});

it.each(["review", "failed", "scanned"] as const)("keeps the printed cursor when its page leaves the %s filter", async (kind) => {
  const book = Array.from({ length: 60 }, (_, n) => {
    const r = kind === "failed" ? unread(record(n + 1, null)) : record(n + 1, kind === "review" ? null : "right");
    if (kind === "failed") r.jobs[0].blocked = "attempts";
    return r;
  });
  const filter = { child: C, workbook: W, ...(kind === "scanned" ? { scannedOnly: true } : { status: kind }) };
  const first = (await readScanHistory(source(book), filter, now))!;
  expect(first.after).toBe(id(25));
  // A team mark or a removed last photo changes the cursor page, while its printed position stays the same.
  book[24] = record(25);
  if (kind === "scanned") { book[24].marks = []; book[24].photos = []; book[24].jobs = []; }
  const second = (await readScanHistory(source(book), { ...filter, after: first.after! }, now))!;
  expect(second.pages.map((p) => p.pageNumber)).toEqual(Array.from({ length: 25 }, (_, n) => n + 26));
  expect(second.counted).toBe(25);
  expect(second.costs.reported).toBe(50_000);
});
it("the RPC adapter reads each job's latest dispatch and the monitor's deferred 429s, and marks the monitor read as admin (#868)", async () => {
  const r = unread(record(1, null)), at = new Date(now - 60_000).toISOString();
  r.jobs[0] = { ...r.jobs[0], state: "queued", blocked: "pending", lastDispatch: { cleanFailure: "rate-limit", settledAt: at } };
  r.photos[0] = { ...r.photos[0], state: "saved", expiresAt: "2027-01-01T00:00:00Z" };
  r.spend = [{ ...r.spend[0], charged: 0, outcome: "deferred", cleanFailure: "rate-limit" }];
  const raw = { ...r, marks: r.marks.map((m) => ({ expected: m.expected, observation: m.observation, original_event: m.originalEvent, event_id: m.eventId, evidence_at: m.at, model: m.model, prompt: m.prompt })) };
  const old = structuredClone(raw) as typeof raw & { jobs: Record<string, unknown>[]; spend: Record<string, unknown>[] };
  delete old.jobs[0].lastDispatch; delete old.spend[0].cleanFailure;
  let answer: unknown = raw;
  const db = createClient<Database>("https://synthetic.invalid", "fake", { global: { fetch: async (_url, init) => Response.json({ pages: JSON.parse(String(init?.body)).p_data.after ? [] : [answer], budget: null }) } });
  const admin = (await readScanHistory(scanHistoryStore(db, { admin: P }), { status: "failed" }, now))!;
  expect(admin.pages).toEqual([]);
  const all = (await readScanHistory(scanHistoryStore(db, { admin: P }), {}, now))!;
  expect(all.costs.split).toEqual([expect.objectContaining({ outcome: "deferred", reported: 0, reserved: 0 })]);
  // An older database (no lastDispatch): admins see the waiting job in the failed filter; the parent never does.
  answer = old;
  expect((await readScanHistory(scanHistoryStore(db, { admin: P }), { status: "failed" }, now))!.pages).toHaveLength(1);
  expect((await readScanHistory(scanHistoryStore(db, { parent: P }), { child: C, status: "failed" }, now))!.pages).toEqual([]);
});
