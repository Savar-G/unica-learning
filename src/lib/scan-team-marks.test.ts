import { createClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { readScanTeamQueue, setScanTeamMark, teamMarkChoice } from "./scan-team-marks";

vi.mock("server-only", () => ({}));
const after = vi.hoisted(() => ({ calls: [] as string[][], pending: false }));
vi.mock("@/lib/scan-marking-server", () => ({ publishMarkChange: async (_db: unknown, parent: string, child: string) => { after.calls.push([parent, child]); return after.pending; } }));

const ITEM = "33333333-3333-4333-8333-333333333333", P = "11111111-1111-4111-8111-111111111111", C = "22222222-2222-4222-8222-222222222222";
const state = { rpc: [] as { name: string; body: Record<string, unknown> }[], answer: null as unknown, status: 200 };
const client = (label: string) => createClient<Database>("https://team.example.test", label, { auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (input, init) => {
    const url = new URL(String(input)), name = url.pathname.split("/rpc/")[1];
    if (!name || label !== "admin-session") throw Error(`Unexpected request with ${label}: ${url.pathname}`);
    state.rpc.push({ name, body: JSON.parse(String(init?.body)) });
    return Response.json(state.answer, { status: state.status });
  } } });
const adminDb = client("admin-session"), serviceDb = client("service-key");
beforeEach(() => { Object.assign(state, { rpc: [], answer: null, status: 200 }); Object.assign(after, { calls: [], pending: false }); });

it("accepts only an item row, a version and right, wrong or blank", () => {
  expect(teamMarkChoice({ item: ITEM, version: 2, result: "wrong" })).toEqual({ item: ITEM, version: 2, result: "wrong" });
  for (const bad of [null, [], { item: "q2", version: 2, result: "right" }, { item: ITEM, version: 0, result: "right" }, { item: ITEM, version: 1.5, result: "right" },
    { item: ITEM, version: 2, result: "maybe" }, { item: ITEM, version: 2, result: "right", actor: "parent" }]) expect(teamMarkChoice(bad)).toBeNull();
});
it("sets the mark with the admin's own session, then publishes and rebuilds with the server key", async () => {
  state.answer = { status: "saved", version: 3, parent: P, child: C };
  expect(await setScanTeamMark(adminDb, serviceDb, { item: ITEM, version: 2, result: "wrong" })).toEqual({ status: "saved", version: 3, recoveryPending: false });
  expect(state.rpc).toEqual([{ name: "admin_set_scan_mark", body: { p_item: ITEM, p_version: 2, p_result: "wrong" } }]);
  expect(after.calls).toEqual([[P, C]]);
  after.pending = true;
  expect(await setScanTeamMark(adminDb, serviceDb, { item: ITEM, version: 2, result: "wrong" })).toMatchObject({ recoveryPending: true });
});
it.each([["conflict", 5], ["not_waiting", 3]] as const)("answers %s without publishing", async (status, version) => {
  state.answer = { status, version };
  expect(await setScanTeamMark(adminDb, serviceDb, { item: ITEM, version: 2, result: "right" })).toEqual({ status, version });
  expect(after.calls).toEqual([]);
});
it("a refused item, a store error (not an admin) or a strange answer saves nothing it can claim", async () => {
  state.answer = "refused";
  expect(await setScanTeamMark(adminDb, serviceDb, { item: ITEM, version: 2, result: "right" })).toEqual({ status: "refused" });
  state.answer = { message: "not_admin", code: "42501" }; state.status = 403;
  await expect(setScanTeamMark(adminDb, serviceDb, { item: ITEM, version: 2, result: "right" })).rejects.toThrow("team_mark_store");
  state.answer = { status: "saved" }; state.status = 200;
  await expect(setScanTeamMark(adminDb, serviceDb, { item: ITEM, version: 2, result: "right" })).rejects.toThrow("team_mark_shape");
  expect(after.calls).toEqual([]);
});
it("reads the team list with nullable reading, reason and photo, and its total", async () => {
  const row = { item_id: ITEM, parent_id: P, child_id: C, child_name: "Iris", workbook_id: "w", book: 1, page_number: 9, question_number: 2,
    photo_id: null, issue: null, read_text: null, waiting_since: "2026-11-07T12:00:00Z", test_family: true, total: 140 };
  state.answer = [row, { ...row, item_id: "44444444-4444-4444-8444-444444444444", photo_id: "p", issue: "answer-form", read_text: "42", test_family: false }];
  const q = await readScanTeamQueue(adminDb, 2);
  expect(state.rpc[0]).toEqual({ name: "admin_scan_team_queue", body: { p_limit: 2 } });
  expect(q.total).toBe(140);
  expect(q.items[0]).toEqual({ item: ITEM, parent: P, child: C, childName: "Iris", book: 1, page: 9, question: 2, photo: null, issue: null, read: null, since: "2026-11-07T12:00:00Z", testFamily: true });
  expect(q.items[1]).toMatchObject({ photo: "p", issue: "answer-form", read: "42", testFamily: false });
  state.answer = [];
  expect(await readScanTeamQueue(adminDb)).toEqual({ items: [], total: 0 });
  state.answer = [{ ...row, question_number: "2" }];
  await expect(readScanTeamQueue(adminDb)).rejects.toThrow("team_queue_shape");
});
