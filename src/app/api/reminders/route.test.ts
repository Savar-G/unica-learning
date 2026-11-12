import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { memoryTransport } from "@/lib/email-delivery-memory";
import { memoryMonthlyStore } from "@/lib/monthly-summary-email-memory";
import type { MonthlyStore } from "@/lib/monthly-summary-email";

vi.mock("server-only", () => ({}));

// The reminder job's part of the monthly summary email (#563): the dry path sends nothing, a real run shares the spaced
// transport with the other emails, and a failed monthly run hides nothing else. Only the monthly email is real here.
const h = vi.hoisted(() => ({
  mail: null as unknown as ReturnType<typeof memoryTransport>,
  store: null as unknown as ReturnType<typeof memoryMonthlyStore>,
  releaseStore: null as MonthlyStore | null,
  loadFails: false,
  loadHangs: false,
  loads: 0,
  loadSignal: undefined as AbortSignal | undefined,
  earlierWorkMs: 0,
  claimMs: 0,
  weeklySend: false,
  sendTimes: [] as number[],
  cancelRuns: 0,
  cardRuns: 0,
  cardFails: false,
  cardSends: 0,
  maySends: 0,
  transports: new Set<unknown>(),
  scanEnabled: false,
  scanRuns: 0,
  scanFails: false,
  reportRuns: [] as { dry: boolean; startedAt: number }[],
}));

vi.mock("@/lib/account-server", () => ({ linkOrigin: () => "https://unicalearning.com" }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => ({}) }));
vi.mock("@/lib/workbook-scan-maintenance-server", () => ({
  scanMaintenanceRelease: () => h.scanEnabled ? { parents: ["synthetic"], delivery: false } : null,
  createWorkbookScanMaintenanceServer: (_db: unknown, { provider }: { provider: unknown }) => ({
    transport: provider,
    run: async () => {
      h.scanRuns++;
      h.transports.add(provider);
      if (h.scanFails) throw new Error("private family diagnostic");
      return { selectedBooks: 1, clocks: {}, calendars: {}, reminders: { "delivery-off": 1 }, outOfTime: false, moreMayRemain: false };
    },
  }),
}));
vi.mock("@/lib/email-resend", () => ({
  TIME_LIMIT_MS: 15_000,
  resendConfigProblem: () => null,
  resendFrom: () => "Unica Learning <contact@unicalearning.com>",
  resendTransport: () => ({
    send: async (m: never) => {
      h.sendTimes.push(performance.now());
      return h.mail.transport.send(m);
    },
  }),
}));
vi.mock("@/lib/plan-cancel-recovery-server", () => ({
  sweepOpenCancelsNow: async ({ transport }: { transport: unknown }) => {
    h.cancelRuns++; h.transports.add(transport);
    return { checked: 1, sent: 1, failed: 0, outOfTime: false };
  },
}));
vi.mock("@/lib/card-sweep-server", () => ({
  dueCardCount: async () => 3,
  duePlanReadCount: async () => 2,
  sweepCardsNow: async ({ transport }: { transport: { send(m: unknown): Promise<unknown> } }) => {
    h.cardRuns++;
    h.transports.add(transport);
    for (let i = 0; i < h.cardSends; i++) await transport.send({ to: `card-${i}@family.ca` });
    if (h.cardFails) return { error: "run_failed" };
    return { due: 1, checked: 1, corrected: 0, plans: 0, failed: 0, outOfTime: false };
  },
}));
vi.mock("@/lib/maya-call-sweep-server", () => ({
  sweepAbandonedCallsNow: async (_admin: unknown, options: { dry?: boolean; transport?: { send(m: unknown): Promise<unknown> } }) => {
    if (!options.dry) h.transports.add(options.transport);
    if (options.transport) for (let i = 0; i < h.maySends; i++) await options.transport.send({ to: `alert-${i}@family.ca` });
    return { due: 0 };
  },
}));
vi.mock("@/lib/report-retry-server", () => ({
  retryReportsNow: async (o: { dry?: boolean; startedAt: number; transport?: unknown }) => {
    h.reportRuns.push({ dry: !!o.dry, startedAt: o.startedAt });
    if (!o.dry) h.transports.add(o.transport);
    return o.dry ? { due: 2 } : { due: 1, retried: 1, emailing: 1, gaveUp: 0, skipped: 0, failed: 0, outOfTime: false };
  },
}));
vi.mock("@/lib/maya-weekly-email-store", () => ({ mayaWeeklyStore: () => ({ load: async () => ({}) }) }));
vi.mock("@/lib/maya-weekly-email", () => ({
  dueWeeklyEmails: () => [],
  runWeeklyEmails: async (_store: unknown, _now: number, deps: { transport: { send(m: unknown): Promise<unknown> } }) => {
    h.transports.add(deps.transport);
    if (h.weeklySend) await deps.transport.send({ to: "weekly@family.ca" });
    return { due: h.weeklySend ? 1 : 0, sent: h.weeklySend ? 1 : 0, failed: 0, busy: 0, unknown: 0 };
  },
}));
vi.mock("@/lib/reminder-store", () => ({ reminderStore: () => ({ load: async () => ({}) }), reminderMessage: () => null }));
vi.mock("@/lib/reminders", async (real) => ({
  ...(await real<typeof import("@/lib/reminders")>()),
  dueReminders: () => [],
  runReminders: async () => {
    vi.setSystemTime(Date.now() + h.earlierWorkMs);
    return { due: 0, sent: 0, failed: 0, busy: 0, unknown: 0 };
  },
}));
vi.mock("@/lib/monthly-summary-email-store", () => ({
  monthlySummaryEmailStore: () => h.releaseStore ?? ({
    load: (now: number, signal?: AbortSignal) => {
      h.loads++;
      h.loadSignal = signal;
      if (h.loadHangs) return new Promise(() => {});
      return h.loadFails ? Promise.reject(new Error("read failed")) : h.store.load(now);
    },
    ledger: {
      ...h.store.ledger,
      claim: (...args: Parameters<typeof h.store.ledger.claim>) => {
        vi.setSystemTime(Date.now() + h.claimMs);
        return h.store.ledger.claim(...args);
      },
    },
  }),
}));

import { POST } from "./route";

const call = (query = "") => POST(new Request(`https://unicalearning.com/api/reminders${query}`, { method: "POST", headers: { authorization: "Bearer cron" } }));

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "cron");
  vi.useFakeTimers({ toFake: ["Date"], now: Date.UTC(2026, 10, 1, 15) });
  h.mail = memoryTransport();
  h.releaseStore = null;
  h.store = memoryMonthlyStore({
    parents: [{ id: "p1", name: "Priya", email: "priya@family.ca", postal: "V3S 1A1", dashboardOpen: true }],
    children: [{ id: "c1", parentId: "p1", firstName: "Leah" }],
    deliveries: [{ childId: "c1", workbookId: "w1", deliveredAt: "2026-10-10T18:00:00Z" }],
    corrections: [],
  });
  h.loadFails = false;
  h.loadHangs = false;
  h.loads = 0;
  h.loadSignal = undefined;
  h.earlierWorkMs = 0;
  h.claimMs = 0;
  h.weeklySend = false;
  h.sendTimes = [];
  h.cardSends = 0;
  h.maySends = 0;
  h.transports = new Set();
  h.scanEnabled = false;
  h.scanRuns = 0;
  h.scanFails = false;
  h.reportRuns = [];
});

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

it("the monthly release switch blocks dry eligibility and actual claims at the real store without stopping weekly email", async () => {
  const requests: string[] = [];
  const tables: Record<string, unknown[]> = {
    workbook_delivery_receipts: [{ workbook_id: "w1", child_id: "c1", parent_id: "p1", delivered_at: "2026-10-10T18:00:00Z" }],
    parents: [{ id: "p1", name: "Priya", email: "priya@family.ca", postal: "V3S 1A1", time_zone: "America/Vancouver" }],
    children: [{ id: "c1", parent_id: "p1", first_name: "Leah", province: "BC", created_at: "2026-01-01T00:00:00Z" }],
  };
  const db = createClient<Database>("https://fixture.invalid", "synthetic-key", {
    auth: { persistSession: false },
    global: { fetch: async (input, init) => {
      const table = new URL(String(input)).pathname.split("/").pop()!;
      requests.push(`${init?.method ?? "GET"} ${table}`);
      // This fixture permits reads only. A claim or copy write must fail the test.
      expect(init?.method ?? "GET").toBe("GET");
      return Response.json(tables[table] ?? []);
    } },
  });
  const { monthlySummaryEmailStore } = await vi.importActual<typeof import("@/lib/monthly-summary-email-store")>("@/lib/monthly-summary-email-store");
  h.releaseStore = monthlySummaryEmailStore(db);
  vi.stubEnv("PARENT_DASHBOARD_ENABLED", "on");
  vi.stubEnv("MONTHLY_SUMMARY_EMAIL_ENABLED", undefined);
  expect(await (await call("?dry=1")).json()).toMatchObject({ ok: true, dry: true, monthly: 0, cards: 3 });
  expect(h.mail.delivered).toEqual([]);
  expect(requests).toEqual([]);
  h.weeklySend = true;
  expect(await (await call()).json()).toMatchObject({ ok: true, maya: { due: 1, sent: 1 }, monthly: { due: 0, sent: 0 }, cards: { due: 1 } });
  expect(h.mail.delivered.map((m) => m.to)).toEqual(["weekly@family.ca"]);
  expect(requests).toEqual([]);
  vi.stubEnv("MONTHLY_SUMMARY_EMAIL_ENABLED", "on");
  expect(await (await call("?dry=1")).json()).toMatchObject({ ok: true, dry: true, monthly: 1 });
  expect(requests.sort()).toEqual(["GET children", "GET email_log", "GET parents", "GET workbook_delivery_corrections", "GET workbook_delivery_receipts"]);
  expect(h.mail.delivered).toHaveLength(1);
});

it("runs enabled scan maintenance on the shared invocation transport and keeps the dry path read-only", async () => {
  h.scanEnabled = true;
  expect(await (await call("?dry=1")).json()).toMatchObject({ ok: true, dry: true });
  expect(h.scanRuns).toBe(0);
  expect(await (await call()).json()).toMatchObject({ ok: true, scans: { selectedBooks: 1, reminders: { "delivery-off": 1 } } });
  expect(h.scanRuns).toBe(1);
  expect(h.transports.size).toBe(1);
});

it("reports a stopped scan turn without replaying prior emails or exposing private diagnostics", async () => {
  h.scanEnabled = true;
  h.scanFails = true;
  const result = await (await call()).json();
  expect(result).toMatchObject({ ok: true, monthly: { sent: 1 }, scans: { error: "run_failed" } });
  expect(JSON.stringify(result)).not.toContain("private family diagnostic");
  expect(h.scanRuns).toBe(1);
  expect(h.mail.delivered).toHaveLength(1);
});

it("the dry path counts the email, sends nothing and claims nothing", async () => {
  const res = await call("?dry=1");
  expect(await res.json()).toMatchObject({ ok: true, dry: true, monthly: 1 });
  expect(h.mail.delivered).toHaveLength(0);
  expect(h.store.rows()).toEqual([]);
});

it("a run sends it once, and a second run does not", async () => {
  expect(await (await call()).json()).toMatchObject({ ok: true, monthly: { due: 1, sent: 1 } });
  expect(await (await call()).json()).toMatchObject({ ok: true, monthly: { due: 0, sent: 0 } });
  expect(h.mail.delivered).toHaveLength(1);
});

it("waits Resend's gap after the email before it, on the same transport", async () => {
  h.weeklySend = true;
  await call();
  expect(h.sendTimes).toHaveLength(2);
  expect(h.sendTimes[1] - h.sendTimes[0]).toBeGreaterThanOrEqual(590);
});

it("one transport carries everything the run sends, and sends that overlap still start 600 ms apart", async () => {
  h.weeklySend = true;
  h.cardSends = 3;
  h.maySends = 2;
  await call();
  expect(h.transports.size).toBe(1);
  expect(h.sendTimes).toHaveLength(7); // 3 card emails, 2 safety alerts, 1 weekly, 1 monthly.
  const times = [...h.sendTimes].sort((a, b) => a - b);
  expect(Math.min(...times.slice(1).map((at, i) => at - times[i]))).toBeGreaterThanOrEqual(590);
}, 15_000);

it("a failed monthly run hides nothing else, and sends nothing", async () => {
  h.loadFails = true;
  expect(await (await call()).json()).toMatchObject({ ok: true, due: 0, maya: { due: 0 }, monthly: { error: "run_failed" } });
  expect(h.mail.delivered).toHaveLength(0);
});

it("after 38 seconds of earlier work it reads nothing and sends nothing, and the next run sends", async () => {
  h.earlierWorkMs = 38_000;
  expect(await (await call()).json()).toMatchObject({ ok: true, monthly: { outOfTime: true, due: 0, sent: 0 } });
  expect(h.loads).toBe(0);
  expect(h.store.rows()).toEqual([]);
  h.earlierWorkMs = 0;
  expect(await (await call()).json()).toMatchObject({ ok: true, monthly: { outOfTime: false, sent: 1 } });
});

it("a slow load stops at the time for one send: the run still answers, and nothing is claimed", async () => {
  h.loadHangs = true;
  h.earlierWorkMs = 25_980; // The load's time ends 26 seconds after the run began.
  expect(await (await call()).json()).toMatchObject({ ok: true, maya: { due: 0 }, monthly: { outOfTime: true, sent: 0 } });
  expect(h.loadSignal?.aborted).toBe(true);
  expect(h.store.rows()).toEqual([]);
  expect(h.mail.delivered).toHaveLength(0);
});

it("a 10-second claim that leaves too little for the send's limit goes back, and the next run sends", async () => {
  h.earlierWorkMs = 25_900;
  h.claimMs = 10_000;
  expect(await (await call()).json()).toMatchObject({ ok: true, monthly: { due: 1, released: 1, sent: 0 } });
  expect(h.mail.delivered).toHaveLength(0);
  expect(h.store.rows()).toEqual([]);
  h.earlierWorkMs = 0;
  h.claimMs = 0;
  expect(await (await call()).json()).toMatchObject({ ok: true, monthly: { due: 1, sent: 1 } });
  expect(h.mail.delivered).toHaveLength(1);
});

it("the card sweep runs beside the emails, a failed sweep hides nothing else, and the dry run only counts", async () => {
  h.cardRuns = 0;
  h.cardFails = false;
  expect(await (await call()).json()).toMatchObject({ ok: true, cards: { due: 1, failed: 0 } });
  expect(h.cardRuns).toBe(1);
  h.cardFails = true;
  expect(await (await call()).json()).toMatchObject({ ok: true, maya: { due: 0 }, cards: { error: "run_failed" } });
  h.cardFails = false;
  const runs = h.cardRuns;
  expect(await (await call("?dry=1")).json()).toMatchObject({ ok: true, dry: true, cards: 3, planReads: 2 });
  expect(h.cardRuns).toBe(runs);
});

it("runs the cancellation sweep on the shared transport and skips it in a dry run", async () => {
  h.cancelRuns = 0;
  expect(await (await call()).json()).toMatchObject({ ok: true, cancels: { checked: 1, sent: 1 } });
  expect(h.cancelRuns).toBe(1);
  await call("?dry=1"); expect(h.cancelRuns).toBe(1);
});

it("retries the report jobs on the shared transport from the run's start, and only counts them in a dry run (#771)", async () => {
  expect(await (await call()).json()).toMatchObject({ ok: true, reports: { due: 1, retried: 1 } });
  expect(h.reportRuns).toEqual([{ dry: false, startedAt: Date.UTC(2026, 10, 1, 15) }]);
  expect(h.transports.size).toBe(1);
  expect(await (await call("?dry=1")).json()).toMatchObject({ ok: true, dry: true, reports: { due: 2 } });
  expect(h.reportRuns.map((r) => r.dry)).toEqual([false, true]);
});
