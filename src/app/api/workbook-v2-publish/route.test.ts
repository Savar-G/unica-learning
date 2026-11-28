import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CHILD, REAL_CHILD, deps, memory } from "@/lib/workbook-v2-publish/publish.fixtures";
import type { JobDeps } from "@/lib/workbook-v2-publish/job";
import { workbookV2TraceFiles } from "@/lib/workbook-v2/render/vercel";

const f = vi.hoisted(() => ({ deps: null as JobDeps | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/workbook-v2-publish/server", () => ({ serverDeps: () => f.deps }));
import { POST } from "./route";

// The v2 publish check (V1): the secret, the production switch, the body, one book at a time, test families only, and
// the timing record whose parts add up.

const call = (body: unknown, authorization: string | null = "Bearer test-secret") =>
  POST(new Request("https://unica.test/api/workbook-v2-publish", { method: "POST", headers: authorization ? { authorization } : {}, body: typeof body === "string" ? body : JSON.stringify(body) }));
const BODY = { childId: CHILD, requestKey: "route-test-0001", sheets: 2 };

let m: ReturnType<typeof memory>;
beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.stubEnv("VERCEL_ENV", "preview");
  m = memory();
  f.deps = deps(m.store, m.files);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("answers 503 with no secret, and 401 for a missing or wrong header, before reading the body", async () => {
  vi.stubEnv("CRON_SECRET", "");
  expect((await call(BODY)).status).toBe(503);
  vi.stubEnv("CRON_SECRET", "test-secret");
  expect((await call(BODY, null)).status).toBe(401);
  expect((await call(BODY, "Bearer test-secre")).status).toBe(401);
  expect((await call(BODY, "Bearer test-secretx")).status).toBe(401);
  expect(m.store.tables.allocations).toHaveLength(0);
});

it("is off in production unless the switch is on", async () => {
  vi.stubEnv("VERCEL_ENV", "production");
  expect((await call(BODY)).status).toBe(404);
  vi.stubEnv("WORKBOOK_V2_TEST_PUBLISH", "on");
  expect((await call(BODY)).status).toBe(201);
});

it.each([
  ["no JSON", "not json"],
  ["no child id", { requestKey: "route-test-0001" }],
  ["a short request key", { ...BODY, requestKey: "short" }],
  ["an odd count of sheets", { ...BODY, sheets: 3 }],
  ["a count of sheets that splits a day", { ...BODY, sheets: 8 }],
  ["an unknown field", { ...BODY, snapshot: {} }],
])("answers 400 for %s", async (_case, body) => {
  expect((await call(body)).status).toBe(400);
  expect(m.store.tables.allocations).toHaveLength(0);
});

it("answers 403 for a child of a family that is not a test family, and writes nothing", async () => {
  const res = await call({ ...BODY, childId: REAL_CHILD });
  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({ error: "v2 books are only for test families", reason: "not-test-family" });
  expect(m.store.tables.allocations).toHaveLength(0);
  expect(m.files.files.size).toBe(0);
});

it("publishes the book with its timing record, then gives back the same book for the same request key", async () => {
  const first = await call(BODY);
  expect(first.status).toBe(201);
  const record = await first.json();
  expect(record).toMatchObject({ httpStatus: 201, status: "published", counts: { pages: 4, sheets: 2, timeLogs: 1 } });
  expect(record.bytes.pdf + record.bytes.images + record.bytes.input).toBe(record.bytes.total);
  const t = record.timingMs;
  expect(t.allocate + t.build + t.upload + t.publish + t.overhead).toBe(t.total);
  const again = await call(BODY);
  expect(again.status).toBe(200);
  expect(await again.json()).toMatchObject({ status: "existing", workbookId: record.workbookId, printedRevision: record.printedRevision });
  expect(m.store.tables.books).toHaveLength(1);
});

it("answers 429 while this instance builds a book", async () => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const base = f.deps!;
  f.deps = { ...base, renderer: async () => { await held; return base.renderer(); } };
  const first = call(BODY);
  await vi.waitFor(() => expect(m.store.tables.allocations).toHaveLength(1));
  expect((await call({ ...BODY, requestKey: "route-test-0002" })).status).toBe(429);
  release();
  expect((await first).status).toBe(201);
});

it("bundles the pinned Typst with this route and the book checks timing route only, and the build stages it first", async () => {
  const { default: config } = await import("../../../../next.config");
  const includes = config.outputFileTracingIncludes ?? {};
  const withTypst = Object.entries(includes).filter(([, files]) => files.some((file) => file.includes(".workbook-v2/typst/"))).map(([route]) => route);
  expect(withTypst).toEqual(["/api/workbook-v2-publish", "/api/workbook-v2-book-checks"]);
  for (const route of withTypst) expect(includes[route]).toEqual([...workbookV2TraceFiles()]);
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { buildCommand?: string };
  expect(vercel.buildCommand).toBe("npm run typst:stage && npm run build");
  expect(readFileSync(".gitignore", "utf8").split("\n")).toContain("/.workbook-v2/");
});
