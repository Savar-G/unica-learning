import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RenderError } from "@/lib/workbook-v2/renderer";

const typst = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@/lib/workbook-v2/render/typst", async (original) => ({ ...(await original<typeof import("@/lib/workbook-v2/render/typst")>()), openRenderer: typst.open }));
import { POST } from "./route";

// The timing check of the three checks of each book (UNI-259): the secret, the production switch, the body, one check at
// a time, and a timing record of a good 120-page book whose parts add up.

const call = (body: string, authorization: string | null = "Bearer test-secret") =>
  POST(new Request("https://unica.test/api/workbook-v2-book-checks", { method: "POST", headers: authorization ? { authorization } : {}, body }));
const FAKE = JSON.stringify({ renderer: "fake" });

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.stubEnv("VERCEL_ENV", "preview");
  typst.open.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("answers 503 with no secret, and 401 for a missing or wrong header, before it draws", async () => {
  vi.stubEnv("CRON_SECRET", "");
  expect((await call(FAKE)).status).toBe(503);
  vi.stubEnv("CRON_SECRET", "test-secret");
  expect((await call(FAKE, null)).status).toBe(401);
  expect((await call(FAKE, "Bearer test-secre")).status).toBe(401);
  expect((await call(FAKE, "Bearer test-secretx")).status).toBe(401);
  expect(typst.open).not.toHaveBeenCalled();
});

it("is off in production unless the switch is on", async () => {
  vi.stubEnv("VERCEL_ENV", "production");
  expect((await call(FAKE)).status).toBe(404);
  vi.stubEnv("WORKBOOK_V2_TEST_PUBLISH", "on");
  expect((await call(FAKE)).status).toBe(200);
}, 60_000);

it.each([
  ["no JSON", "not json"],
  ["a list", "[]"],
  ["an unknown renderer", JSON.stringify({ renderer: "chromium" })],
  ["an unknown field", JSON.stringify({ renderer: "fake", sheets: 2 })],
])("answers 400 for %s", async (_case, body) => {
  expect((await call(body)).status).toBe(400);
  expect(typst.open).not.toHaveBeenCalled();
});

it("checks the 120-page book and answers with the time of each check, which add up to the total", async () => {
  const res = await call(FAKE);
  expect(res.status).toBe(200);
  const record = await res.json();
  expect(record).toMatchObject({ ok: true, renderer: "fake", totalPages: 120, interiorPages: 116, findings: 0, problems: [] });
  expect(record.itemCount).toBeGreaterThan(1000);
  const { sourceMs, layoutMs, levelMs } = record.checks;
  for (const ms of [sourceMs, layoutMs, levelMs, record.totalMs, record.drawMs]) expect(Number.isInteger(ms) && ms >= 0).toBe(true);
  expect(record.totalMs).toBe(sourceMs + layoutMs + levelMs);
  expect(record.underBudget).toBe(record.totalMs < 5000);
  expect(typst.open).not.toHaveBeenCalled();
}, 60_000);

it("draws with the pinned Typst by default, and answers 500 when it cannot draw", async () => {
  typst.open.mockRejectedValue(new RenderError("Typst is not installed"));
  const res = await call("");
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: "The book could not be drawn.", detail: "Typst is not installed" });
  expect(typst.open).toHaveBeenCalledTimes(1);
});

it("checks one book at a time", async () => {
  let release = () => {};
  typst.open.mockReturnValue(new Promise((_resolve, reject) => { release = () => reject(new RenderError("stopped")); }));
  const first = call("");
  await vi.waitFor(() => expect(typst.open).toHaveBeenCalledTimes(1));
  expect((await call(FAKE)).status).toBe(429);
  release();
  expect((await first).status).toBe(500);
});
