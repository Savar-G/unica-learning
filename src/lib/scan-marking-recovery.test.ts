import { createClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { RECOVERY_MAX_PHOTOS, RECOVERY_START_MS, recoverScanMarking, type ChildPlanAccess } from "./scan-marking-server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => null }));

// #726: one recovery run drains several waiting photos. The list is a fake of `recover_scan_marking_oldest`: the same
// keyset cursor over (sent_at, id), shared by every run, which answers [] at the end of the list and goes back to the
// start. `mark` is a fake of `processScanMarking` that keeps the rules of the claim in `scan_marking_command`: one lease
// per photo, the family's one processing slot, and one budget charge per claim.
type Photo = { id: string; parent: string; sentAt: number; finished: boolean };
const list = { photos: [] as Photo[], cursor: null as { sentAt: number; id: string } | null, calls: 0, failNext: false };
const claims = { leased: new Set<string>(), slots: new Set<string>(), sendHolds: new Set<string>(), charges: 0, marked: new Map<string, number>(),
  ai: 0, answers: new Map<string, string[]>() };
const clock = { t: 0, perPhoto: 0 };
const after = (p: Photo, c: { sentAt: number; id: string }) => p.sentAt > c.sentAt || (p.sentAt === c.sentAt && p.id > c.id);
function nextWaiting() {
  list.calls++;
  const next = list.photos.filter((p) => !p.finished && (!list.cursor || after(p, list.cursor)))
    .sort((a, b) => a.sentAt - b.sentAt || a.id.localeCompare(b.id))[0];
  list.cursor = next ? { sentAt: next.sentAt, id: next.id } : null;
  return next ? [{ photo: next.id, parent: next.parent, child: "child" }] : [];
}
const db = createClient<Database>("https://marking-recovery.example.test", "synthetic-service-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/rpc/recover_scan_marking_oldest")) {
      if (list.failNext) { list.failNext = false; return Response.json({ message: "read failed" }, { status: 503 }); }
      return Response.json(nextWaiting());
    }
    throw Error(`Unexpected request: ${url.pathname}`);
  } },
});
const open: ChildPlanAccess = async () => ({ open: true, reason: "open" });
const env = { SCAN_MARKING_ENABLED: "families" };
const tick = () => new Promise<void>((r) => setTimeout(r, 1));
/** The claim, the AI call and the commit of one photo, by the claim's rules. */
const mark = async (_db: unknown, parent: string, photo: string) => {
  const p = list.photos.find((x) => x.id === photo)!;
  const answer = (a: string) => { claims.answers.set(photo, [...(claims.answers.get(photo) ?? []), a]); return a as "finished"; };
  if (claims.sendHolds.has("throw:" + photo)) { claims.sendHolds.delete("throw:" + photo); answer("error"); throw Error("synthetic failure"); }
  if (p.finished) return answer("terminal");
  if (claims.leased.has(photo) || claims.slots.has(parent) || claims.sendHolds.has(parent)) return answer("busy");
  claims.leased.add(photo); claims.slots.add(parent); claims.charges++; claims.ai++;
  await tick();
  clock.t += clock.perPhoto;
  claims.marked.set(photo, (claims.marked.get(photo) ?? 0) + 1);
  p.finished = true; claims.leased.delete(photo); claims.slots.delete(parent);
  return answer("finished");
};
const deps = () => ({ now: () => clock.t, startedAt: 0, mark: mark as never });
function photos(n: number, parent = (i: number) => `family-${i}`) {
  list.photos = Array.from({ length: n }, (_, i) => ({ id: `photo-${String(i).padStart(2, "0")}`, parent: parent(i), sentAt: 1000 + i, finished: false }));
}

beforeEach(() => {
  Object.assign(list, { photos: [], cursor: null, calls: 0, failNext: false });
  Object.assign(claims, { leased: new Set(), slots: new Set(), sendHolds: new Set(), charges: 0, marked: new Map(), ai: 0, answers: new Map() });
  Object.assign(clock, { t: 0, perPhoto: 0 });
});

it("marks several waiting photos in one run, the oldest sent first", async () => {
  photos(6);
  // Sent in another order than the ids: the run follows sent_at.
  list.photos[0].sentAt = 2000;
  const run = await recoverScanMarking(db, env, open, deps());
  expect(run).toEqual({ status: "processed", results: Array(6).fill("finished") });
  expect([...claims.marked.keys()]).toEqual(["photo-01", "photo-02", "photo-03", "photo-04", "photo-05", "photo-00"]);
  expect(list.photos.every((p) => p.finished)).toBe(true);
});

it("skips a busy photo without losing it, and a later run marks it", async () => {
  photos(3, (i) => (i === 1 ? "family-busy" : `family-${i}`));
  claims.sendHolds.add("family-busy"); // Send holds this family's one slot.
  const first = await recoverScanMarking(db, env, open, deps());
  expect(first.results).toEqual(["finished", "busy", "finished"]);
  expect(list.photos[1].finished).toBe(false);
  claims.sendHolds.delete("family-busy");
  const second = await recoverScanMarking(db, env, open, deps());
  expect(second.results).toEqual(["finished"]);
  expect(claims.marked.get("photo-01")).toBe(1);
});

it("a failed or refused photo does not end the run", async () => {
  photos(3);
  claims.sendHolds.add("throw:photo-00");
  const refusing = vi.fn(async (...args: Parameters<typeof mark>) => args[2] === "photo-01" ? "off" as const : mark(...args));
  const run = await recoverScanMarking(db, env, open, { ...deps(), mark: refusing as never });
  expect(run.results).toEqual(["error", "off", "finished"]);
  // Both stay in the list for a later run.
  expect(list.photos.map((p) => p.finished)).toEqual([false, false, true]);
});

it("two runs at once never mark or charge a photo twice", async () => {
  photos(8, (i) => `family-${i % 3}`);
  const [a, b] = await Promise.all([recoverScanMarking(db, env, open, deps()), recoverScanMarking(db, env, open, deps())]);
  const finished = [...a.results!, ...b.results!].filter((r) => r === "finished").length;
  // Both runs worked: the cursor gave them different photos.
  expect(a.results!.length).toBeGreaterThan(0); expect(b.results!.length).toBeGreaterThan(0);
  expect([...claims.marked.values()].every((n) => n === 1)).toBe(true);
  expect(claims.charges).toBe(finished);
  // A photo one run found busy (the other run held its family's slot) stays waiting; the next run marks it.
  await recoverScanMarking(db, env, open, deps());
  expect(list.photos.every((p) => p.finished)).toBe(true);
  expect([...claims.marked.values()]).toEqual(Array(8).fill(1));
  expect(claims.charges).toBe(8);
});

it("restarts the list once when it ends, so the restart does not waste the run", async () => {
  photos(4);
  // A run before this one ended in the middle of the list (or at its end).
  list.cursor = { sentAt: 1002, id: "photo-02" };
  const run = await recoverScanMarking(db, env, open, deps());
  expect(run.results).toEqual(["finished", "finished", "finished", "finished"]);
  expect([...claims.marked.keys()]).toEqual(["photo-03", "photo-00", "photo-01", "photo-02"]);
});

it("a run that starts at the end of the list still marks", async () => {
  photos(2);
  list.cursor = { sentAt: 1001, id: "photo-01" };
  expect((await recoverScanMarking(db, env, open, deps())).results).toEqual(["finished", "finished"]);
});

it("restarts only once, and stops when the list wraps to a photo it already had", async () => {
  photos(2);
  claims.sendHolds.add("family-0"); claims.sendHolds.add("family-1");
  const run = await recoverScanMarking(db, env, open, deps());
  expect(run.results).toEqual(["busy", "busy"]);
  // photo-00, photo-01, the end, then photo-00 again: stop.
  expect(list.calls).toBe(4);
  list.photos = []; list.calls = 0;
  expect((await recoverScanMarking(db, env, open, deps())).results).toEqual([]);
  expect(list.calls).toBe(2);
});

it("starts a new photo only inside the time budget", async () => {
  photos(10);
  clock.perPhoto = 15_000;
  const run = await recoverScanMarking(db, env, open, deps());
  // Starts at 0, 15 and 30 s; at 45 s no photo starts.
  expect(run.results).toEqual(["finished", "finished", "finished"]);
  expect(clock.t).toBe(45_000);
  expect(list.calls).toBe(3);
});

it("counts the budget from the request start", async () => {
  photos(3);
  clock.t = RECOVERY_START_MS - 1;
  expect((await recoverScanMarking(db, env, open, deps())).results).toEqual(["finished", "finished", "finished"]);
  clock.t = RECOVERY_START_MS; photos(3);
  expect((await recoverScanMarking(db, env, open, deps())).results).toEqual([]);
  expect(claims.ai).toBe(3);
});

it("asks for at most RECOVERY_MAX_PHOTOS photos in one run", async () => {
  photos(RECOVERY_MAX_PHOTOS + 5);
  const refusing = async () => "off" as const;
  const run = await recoverScanMarking(db, env, open, { ...deps(), mark: refusing as never });
  expect(run.results).toHaveLength(RECOVERY_MAX_PHOTOS);
});

it("test-only follows the same budget as families", async () => {
  photos(3);
  expect((await recoverScanMarking(db, { SCAN_MARKING_ENABLED: "test-only" }, open, deps())).results).toEqual(["finished", "finished", "finished"]);
});

it("a failed list read ends the run as unavailable", async () => {
  photos(1);
  list.failNext = true;
  await expect(recoverScanMarking(db, env, open, deps())).rejects.toThrow("marking_recovery");
});
