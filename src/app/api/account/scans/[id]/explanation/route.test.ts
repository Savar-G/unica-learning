import { beforeEach, expect, it, vi } from "vitest";
const seams = vi.hoisted(() => ({ signedIn: true, active: true, released: true, cookie: undefined as string | undefined, result: { status: "ready", correctAnswer: "42", context: "hash", explanation: { steps: ["Add the ones."], say: "Start here." } }, run: vi.fn() }));
const parent = "11111111-1111-4111-8111-111111111111", photo = "22222222-2222-4222-8222-222222222222";
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => seams.cookie ? { value: seams.cookie } : undefined }) }));
vi.mock("@/lib/scan-photo-server", () => ({ scanSession: async () => { if (!seams.signedIn) throw Error("NEXT_NOT_FOUND"); return { parent, admin: {}, active: async () => seams.active }; }, scanJson: (v: unknown, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } }) }));
vi.mock("@/lib/scan-marking-server", () => ({ markingAccess: async () => seams.released }));
vi.mock("@/lib/parent-problem-explanation-server", () => ({ parentProblemExplanation: (...args: unknown[]) => seams.run(...args) }));
import { POST } from "./route";
const request = (body: unknown = { itemId: "original", version: 2 }, origin = "https://synthetic.invalid", signal?: AbortSignal) => new Request(`https://synthetic.invalid/api/account/scans/${photo}/explanation`, { method: "POST", headers: { origin }, body: typeof body === "string" ? body : JSON.stringify(body), signal });
const context = { params: Promise.resolve({ id: photo }) };
beforeEach(() => { seams.signedIn = true; seams.active = true; seams.released = true; seams.cookie = undefined; seams.run.mockReset().mockImplementation(async () => seams.result); });
it("binds family identity to the session and uses private no-store responses", async () => {
  const r = await POST(request(), context); expect(r.status).toBe(200); expect(await r.json()).toEqual(seams.result);
  expect(r.headers.get("cache-control")).toContain("no-store"); expect(seams.run.mock.calls[0][1]).toEqual({ parent, photo, itemId: "original", version: 2 });
});
it("signed-out calls never reach the feature", async () => { seams.signedIn = false; await expect(POST(request(), context)).rejects.toThrow("NEXT_NOT_FOUND"); expect(seams.run).not.toHaveBeenCalled(); });
it("Desk mode is refused in the handler as well as the site proxy", async () => { seams.cookie = `${parent}.${photo}`; expect((await POST(request(), context)).status).toBe(423); expect(seams.run).not.toHaveBeenCalled(); });
it.each(["release", "session", "origin"])("%s refusal has no AI action", async kind => {
  if (kind === "release") seams.released = false; if (kind === "session") seams.active = false;
  expect((await POST(request(undefined, kind === "origin" ? "https://other.invalid" : undefined), context)).status).toBe(kind === "origin" ? 403 : 404); expect(seams.run).not.toHaveBeenCalled();
});
it.each([{ itemId: "original", version: 2, parent }, { itemId: "original", version: 2, correctAnswer: "99" }, { itemId: "original", version: 2, price: 0 }, { itemId: "original", version: 0 }, { itemId: "original", version: 2, model: "cheap" }, "not json", "x".repeat(1025)])("rejects caller authority or malformed references %j", async input => {
  expect((await POST(request(input), context)).status).toBe(400); expect(seams.run).not.toHaveBeenCalled();
});
it("sign-out during the blocking feature call returns no cached content", async () => { seams.run.mockImplementation(async () => { seams.active = false; return seams.result; }); const r = await POST(request(), context); expect(r.status).toBe(404); expect(await r.json()).toEqual({ status: "refused" }); });
it("an aborted request returns no private content", async () => { const c = new AbortController(); seams.run.mockImplementation(async () => { c.abort(); return seams.result; }); const r = await POST(request(undefined, undefined, c.signal), context); expect(r.status).toBe(404); });
it("provider exceptions return only a plain retry state", async () => { seams.run.mockRejectedValue(Error("private provider data")); const r = await POST(request(), context); expect(r.status).toBe(503); expect(await r.json()).toEqual({ status: "retry" }); });
