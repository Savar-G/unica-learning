import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { setProductObserver } from "@/lib/product-monitoring";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));

// The next-book cron route (#476): its secret, its dry run, the step's budget, and no email. The step itself is tested in
// src/lib/next-book-step.test.ts; here it is a fake, except in the stalled-read case, which runs the real step server.
const h = vi.hoisted(() => ({
  real: false,
  stalledRequests: 0,
  create: vi.fn(),
  run: vi.fn(),
  send: vi.fn(),
  admin: vi.fn(),
  after: vi.fn<(work: () => Promise<unknown>) => void>(),
  claimAlerts: vi.fn(),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/server")>(),
  after: h.after,
}));
vi.mock("@/lib/supabase-auth", () => ({
  adminClient: (signal?: AbortSignal, options?: { retry?: boolean }) => {
    h.admin(signal, options);
    if (process.env.VERCEL_ENV === "production") return { rpc: h.claimAlerts };
    if (!(h.real && signal && options?.retry === false)) return null;
    // Every request stalls until its signal aborts, as a database that does not answer.
    return createClient<Database>("https://fixture.invalid", "synthetic-key", {
      auth: { persistSession: false }, db: { retry: false },
      global: { fetch: (_input, init) => {
        h.stalledRequests++;
        const stop = AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])]);
        return new Promise<Response>((_, reject) => stop.addEventListener("abort", () => reject(stop.reason), { once: true }));
      } },
    });
  },
}));
vi.mock("@/lib/next-book-planner", () => ({
  nextBookPlanner: () => h.real ? { plan: async () => ({ ok: false, reason: "unused" }) } : null,
  nextBookWiring: (planner: unknown) => planner ? { planner, testOnly: true } : null,
  NEXT_BOOK_REAL_FAMILIES: false,
}));
vi.mock("@/lib/next-book-step-server", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/next-book-step-server")>();
  return { createNextBookStepServer: (env: Parameters<typeof real.createNextBookStepServer>[0]) => h.real ? real.createNextBookStepServer(env) : h.create(env) };
});
vi.mock("@/lib/email-resend", () => ({ resendTransport: h.send }));
import { POST } from "./route";

const post = (query = "", auth: string | null = "Bearer cron") =>
  POST(new Request(`https://unicalearning.com/api/next-book-prepare${query}`, { method: "POST", headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "cron");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("SLACK_PRODUCT_ALERTS_WEBHOOK_URL", "");
  h.real = false;
  h.stalledRequests = 0;
});
afterEach(() => { setProductObserver(null); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("the next-book cron route", () => {
  it("refuses a request without the secret, and does not run without one configured", async () => {
    expect((await post("", null)).status).toBe(401);
    expect((await post("", "Bearer wrong")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await post()).status).toBe(503);
    expect(h.create).not.toHaveBeenCalled();
    expect(h.admin).not.toHaveBeenCalled();
  });

  it("?dry=1 answers before any client or step is made, and writes nothing", async () => {
    vi.stubEnv("NEXT_BOOK_PREPARE_ENABLED", "families");
    const res = await post("?dry=1");
    expect(await res.json()).toEqual({ ok: true, dry: true });
    expect(h.create).not.toHaveBeenCalled();
    expect(h.run).not.toHaveBeenCalled();
    expect(h.admin).not.toHaveBeenCalled();
  });

  it("with the secret runs the step with its switch and a 55-second budget, and sends no email", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.UTC(2026, 10, 9, 18) });
    vi.stubEnv("NEXT_BOOK_PREPARE_ENABLED", "test-only");
    vi.stubEnv("WORKBOOK_SCAN_TEST_PARENT_IDS", "00000000-0000-4000-8000-000000000001");
    const answer = { status: "ran", due: 1, prepared: 1, skipped: 0, errors: 0, outOfTime: false, timedOut: false, readFailed: false, outcomes: { queued: 1 } };
    h.run.mockResolvedValue(answer);
    h.create.mockReturnValue({ run: h.run });
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ...answer });
    expect(h.create).toHaveBeenCalledWith({ NEXT_BOOK_PREPARE_ENABLED: "test-only", WORKBOOK_SCAN_TEST_PARENT_IDS: "00000000-0000-4000-8000-000000000001" });
    expect(h.run.mock.calls[0][0].endAt).toBe(Date.UTC(2026, 10, 9, 18) + 55_000);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("answers off when the switch is off, and hides a stopped step's details", async () => {
    h.create.mockReturnValue(null);
    expect(await (await post()).json()).toEqual({ ok: true, status: "off" });
    h.create.mockReturnValue({ run: async () => { throw new Error("private family diagnostic"); } });
    const res = await post();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("private family diagnostic");
  });

  it("answers before its 60-second limit when the real step's candidate read stalls, with no request sent again", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], now: Date.UTC(2026, 10, 9, 18) });
    h.real = true;
    vi.stubEnv("NEXT_BOOK_PREPARE_ENABLED", "families");
    const started = Date.now();
    let answeredAt = 0;
    const answer = post().then(async (res) => { answeredAt = Date.now(); return res.json(); });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await answer).toMatchObject({ ok: true, status: "ran", timedOut: true, prepared: 0 });
    expect(answeredAt - started).toBeLessThan(55_000);
    expect(h.stalledRequests).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.stalledRequests).toBe(1);
    expect(h.send).not.toHaveBeenCalled();
  });
});

describe("workbook job alerts on the cron route", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SLACK_PRODUCT_ALERTS_WEBHOOK_URL", "https://hooks.slack.com/services/test/alerts/example");
    h.create.mockReturnValue(null);
  });

  const finishRequest = async () => {
    for (const [work] of h.after.mock.calls) await work();
  };

  it("reports only the new job counts even when next-book preparation is off", async () => {
    const observe = vi.fn();
    setProductObserver(observe);
    h.claimAlerts.mockResolvedValueOnce({ data: [
      { reason: "failed", job_count: 2 },
      { reason: "stalled", job_count: 1 },
      { reason: "waiting", job_count: 3 },
    ], error: null }).mockResolvedValueOnce({ data: [], error: null });
    expect(await (await post()).json()).toEqual({ ok: true, status: "off" });
    await finishRequest();
    h.after.mockClear();
    await post();
    await finishRequest();
    expect(h.claimAlerts).toHaveBeenCalledTimes(2);
    expect(observe.mock.calls).toEqual([
      [{ code: "workbook.job_failed", attributes: { count: 2 } }],
      [{ code: "workbook.job_stalled", attributes: { count: 1 } }],
      [{ code: "workbook.job_waiting", attributes: { count: 3 } }],
    ]);
  });

  it("does not claim alerts for an unauthorized or dry request, a preview, or an invalid webhook", async () => {
    await post("", null);
    await post("?dry=1");
    vi.stubEnv("VERCEL_ENV", "preview");
    await post();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SLACK_PRODUCT_ALERTS_WEBHOOK_URL", "https://example.test/services/test/alerts/example");
    await post();
    await finishRequest();
    expect(h.claimAlerts).not.toHaveBeenCalled();
  });

  it("reports a check failure without sending database details or changing the cron response", async () => {
    const observe = vi.fn();
    setProductObserver(observe);
    h.claimAlerts.mockResolvedValueOnce({ error: { message: "private error" }, data: null });
    expect(await (await post()).json()).toEqual({ ok: true, status: "off" });
    await finishRequest();
    expect(observe.mock.calls).toEqual([[{ code: "workbook.alert_check_failed", attributes: {} }]]);
  });
});

// The route must not reach email delivery through any code import, so it never counts as a sender for the plan-gate guard.
// `import type` carries no code (database.ts takes types from reminders.ts), so it is not followed, as in that guard.
function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.posix.join("src", spec.slice(2)) : spec.startsWith(".") ? path.posix.join(path.posix.dirname(from), spec) : null;
  if (!base) return null;
  return [`${base}.ts`, `${base}.tsx`, path.posix.join(base, "index.ts"), base].find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}
function reached(start: string): Set<string> {
  const seen = new Set([start]), queue = [start];
  while (queue.length) {
    const file = queue.shift()!;
    const source = readFileSync(file, "utf8");
    const specs = [
      ...[...source.matchAll(/(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^;'"]*?\s+from\s+)?["']([^"']+)["']/g)].filter((m) => !m[1]).map((m) => m[2]),
      ...[...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]),
    ];
    for (const spec of specs) {
      const to = resolve(file, spec);
      if (to && !seen.has(to)) { seen.add(to); queue.push(to); }
    }
  }
  return seen;
}

it("imports no email delivery module, directly or through any module it imports, and is no sender", () => {
  const files = reached("src/app/api/next-book-prepare/route.ts");
  expect(files.has("src/lib/next-book-step.ts")).toBe(true);
  for (const delivery of ["src/lib/email-delivery.ts", "src/lib/email-resend.ts", "src/lib/workbook-email-server.ts"]) expect(files.has(delivery), delivery).toBe(false);
  expect([...files].filter((f) => /\bfetch\(\s*["'`]https:\/\/api\.resend\.com/.test(readFileSync(f, "utf8")))).toEqual([]);
});
