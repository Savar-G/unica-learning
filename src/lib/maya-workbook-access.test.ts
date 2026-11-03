import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { admin, calls, books, mint, project } = vi.hoisted(() => ({ admin: vi.fn(), calls: vi.fn(), books: vi.fn(), mint: vi.fn(), project: vi.fn() }));
vi.mock("@/lib/admin-store", () => ({ adminSession: admin }));
vi.mock("@/lib/maya-call-server", () => ({ serverMayaCalls: calls }));
vi.mock("@/lib/workbook-store", () => ({ workbookStore: books }));
vi.mock("@/lib/maya-voice-token", () => ({ mintVoiceToken: mint }));
vi.mock("@/lib/maya-voice", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/maya-voice")>(), livekitProject: project }));
import { POST } from "@/app/api/admin/maya/workbook/route";
import { mayaWorkbookFixture } from "@/lib/maya-workbook-fixture";
import { POST as referenceToken } from "@/app/api/admin/maya/workbook/reference/route";
import { TokenVerifier } from "livekit-server-sdk";
import { referenceJoiner, referenceRoomName } from "@/lib/maya-workbook-speech";

const request = (body: unknown, origin = "http://localhost") => new Request("http://localhost/api/admin/maya/workbook", {
  method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
});

beforeEach(() => { vi.clearAllMocks(); project.mockReturnValue(null); });

it.each(["signed out", "parent"])("denies %s before a workbook read or call creation", async () => {
  admin.mockResolvedValue(null);
  expect((await POST(request({ mode: "text" }))).status).toBe(404);
  expect((await referenceToken(request({}))).status).toBe(404);
  expect(books).not.toHaveBeenCalled();
  expect(calls).not.toHaveBeenCalled();
});

async function setup() {
  const f = await mayaWorkbookFixture();
  admin.mockResolvedValue({ userId: "admin", db: {
    rpc: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { parent_id: f.ids.parent, first_name: "Iris", grade: 2 }, error: null }) }) }) }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { parent_id: f.ids.parent }, error: null }) }) }) }),
  } });
  books.mockReturnValue(f.books);
  calls.mockReturnValue(f.calls);
  return { ...f, input: { mode: "text", childId: f.ids.child, workbookId: f.ids.workbook, reference: "page 4 number 3" } };
}

it("denies a foreign origin before reading content", async () => {
  const f = await setup();
  expect((await POST(request(f.input, "https://foreign.test"))).status).toBe(403);
  expect(books).not.toHaveBeenCalled();
});

it("does not create a call after an invalid reference, or trust a client package", async () => {
  const f = await setup();
  const bad = await POST(request({ ...f.input, reference: "page 4 number 33", package: {} }));
  expect(bad.status).toBe(404);
  expect(calls).not.toHaveBeenCalled();
  expect(f.store.rows()).toEqual([]);
  const good = await POST(request({ ...f.input, package: { answer: 99 }, parentId: "foreign" }));
  expect(good.status).toBe(200);
  expect(calls).toHaveBeenCalledWith("http://localhost", true);
  expect(f.store.rows()[0]).toMatchObject({ parentId: f.ids.parent, question: { source: "workbook", page: 4, question: 3 }, model: "fake" });
  expect(f.store.rows()[0].live!.text.session.confirmWorkbook).toBe(true);
});

it("rechecks the print status between selection and start", async () => {
  const f = await setup();
  expect((await POST(request({ ...f.input, mode: "select" }))).status).toBe(200);
  f.books.setStatus(f.ids.workbook, "approved");
  expect((await POST(request(f.input))).status).toBe(404);
  expect(f.store.rows()).toEqual([]);
});

it("uses the same exact speech reference for a voice call and a room ticket", async () => {
  const f = await setup();
  project.mockReturnValue({ url: "wss://fake.invalid", apiKey: "fake", apiSecret: "fake" });
  mint.mockResolvedValue({ ok: true, ticket: { token: "fake-ticket" } });
  const res = await POST(request({ ...f.input, mode: "voice", reference: "page four, number three" }));
  expect(res.status).toBe(200);
  expect(mint).toHaveBeenCalledWith(expect.objectContaining({ parentId: f.ids.parent, childId: f.ids.child, name: null }));
  expect(f.store.rows()[0]).toMatchObject({ mode: "voice", question: { source: "workbook", page: 4, question: 3 }, startedAt: null });
  expect(f.store.rows()[0].live!.text.session.confirmWorkbook).toBe(true);
});

it("requires voice setup without creating an abandoned call", async () => {
  const f = await setup();
  const res = await POST(request({ ...f.input, mode: "voice" }));
  expect(res.status).toBe(503);
  expect(f.store.rows()).toEqual([]);
});

it("admits the reference microphone to one short-lived room without reading a package or creating a call", async () => {
  const f = await setup();
  const secret = "reference-test-secret-long-enough-for-hs256-0123456789";
  project.mockReturnValue({ url: "wss://fake.invalid", apiKey: "APItest", apiSecret: secret });
  const question = vi.spyOn(f.books, "question");
  const res = await referenceToken(request(f.input));
  expect(res.status).toBe(200);
  const body = await res.json();
  const claims = await new TokenVerifier("APItest", secret).verify(body.token);
  expect(claims.video).toMatchObject({ room: referenceRoomName(body.id), roomJoin: true, canUpdateOwnMetadata: false, roomRecord: false, roomAdmin: false, canPublishSources: ["microphone"] });
  expect((claims.exp ?? 0) - (claims.nbf ?? 0)).toBeLessThanOrEqual(60);
  const job = { id: body.id, childId: f.ids.child, parentId: f.ids.parent, workbookId: f.ids.workbook };
  expect(referenceJoiner(referenceRoomName(body.id), job, claims.sub!, claims.attributes!)).toBe(true);
  expect(referenceJoiner(referenceRoomName(body.id), { ...job, parentId: "foreign" }, claims.sub!, claims.attributes!)).toBe(false);
  expect(question).not.toHaveBeenCalled();
  expect(calls).not.toHaveBeenCalled();
  expect(f.store.rows()).toEqual([]);
});

it("refuses a foreign workbook before it issues a reference token", async () => {
  const f = await setup();
  const question = vi.spyOn(f.books, "question");
  const response = await referenceToken(request({ ...f.input, childId: f.ids.sibling }));
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ ok: false, error: "reference_refused", say: "I can't find that question in this child's workbook." });
  expect(question).not.toHaveBeenCalled();
  expect(calls).not.toHaveBeenCalled();
});

it.each(["select", "text", "voice"])("returns the missing-number reason for %s without creating a call", async mode => {
  const f = await setup();
  const response = await POST(request({ ...f.input, mode, reference: "page 4 number 99" }));
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ ok: false, error: "reference_refused", say: "Page 4 has no number 99." });
  expect(calls).not.toHaveBeenCalled();
});

it("returns the print reason before it issues a reference token", async () => {
  const f = await setup();
  f.books.setStatus(f.ids.workbook, "approved");
  const response = await referenceToken(request(f.input));
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ ok: false, error: "reference_refused", say: "This workbook is not printed yet." });
  expect(calls).not.toHaveBeenCalled();
});
