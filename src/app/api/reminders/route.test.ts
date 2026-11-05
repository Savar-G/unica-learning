import { beforeEach, expect, it, vi } from "vitest";
import { memoryTransport } from "@/lib/email-delivery-memory";
import { memoryMonthlyStore } from "@/lib/monthly-summary-email-memory";

vi.mock("server-only", () => ({}));

// The reminder job's part of the monthly summary email (#563): the dry path sends nothing, a real run shares the spaced
// transport with the other emails, and a failed monthly run hides nothing else. Only the monthly email is real here.
const h = vi.hoisted(() => ({
  mail: null as unknown as ReturnType<typeof memoryTransport>,
  store: null as unknown as ReturnType<typeof memoryMonthlyStore>,
  loadFails: false,
  weeklySend: false,
  sendTimes: [] as number[],
}));

vi.mock("@/lib/account-server", () => ({ linkOrigin: () => "https://unicalearning.com" }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => ({}) }));
vi.mock("@/lib/email-resend", () => ({
  resendConfigProblem: () => null,
  resendFrom: () => "Unica Learning <contact@unicalearning.com>",
  resendTransport: () => ({
    send: async (m: never) => {
      h.sendTimes.push(performance.now());
      return h.mail.transport.send(m);
    },
  }),
}));
vi.mock("@/lib/maya-call-sweep-server", () => ({ sweepAbandonedCallsNow: async () => ({ due: 0 }) }));
vi.mock("@/lib/maya-weekly-email-store", () => ({ mayaWeeklyStore: () => ({ load: async () => ({}) }) }));
vi.mock("@/lib/maya-weekly-email", () => ({
  dueWeeklyEmails: () => [],
  runWeeklyEmails: async (_store: unknown, _now: number, deps: { transport: { send(m: unknown): Promise<unknown> } }) => {
    if (h.weeklySend) await deps.transport.send({ to: "weekly@family.ca" });
    return { due: h.weeklySend ? 1 : 0, sent: h.weeklySend ? 1 : 0, failed: 0, busy: 0, unknown: 0 };
  },
}));
vi.mock("@/lib/reminder-store", () => ({ reminderStore: () => ({ load: async () => ({}) }), reminderMessage: () => null }));
vi.mock("@/lib/reminders", async (real) => ({
  ...(await real<typeof import("@/lib/reminders")>()),
  dueReminders: () => [],
  runReminders: async () => ({ due: 0, sent: 0, failed: 0, busy: 0, unknown: 0 }),
}));
vi.mock("@/lib/monthly-summary-email-store", () => ({
  monthlySummaryEmailStore: () => ({
    load: (now: number) => (h.loadFails ? Promise.reject(new Error("read failed")) : h.store.load(now)),
    ledger: h.store.ledger,
  }),
}));

import { POST } from "./route";

const call = (query = "") => POST(new Request(`https://unicalearning.com/api/reminders${query}`, { method: "POST", headers: { authorization: "Bearer cron" } }));

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "cron");
  vi.useFakeTimers({ toFake: ["Date"], now: Date.UTC(2026, 10, 1, 15) });
  h.mail = memoryTransport();
  h.store = memoryMonthlyStore({
    parents: [{ id: "p1", name: "Priya", email: "priya@family.ca", postal: "V3S 1A1", dashboardOpen: true }],
    children: [{ id: "c1", parentId: "p1", firstName: "Leah" }],
    deliveries: [{ childId: "c1", workbookId: "w1", deliveredAt: "2026-10-10T18:00:00Z" }],
    corrections: [],
  });
  h.loadFails = false;
  h.weeklySend = false;
  h.sendTimes = [];
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

it("a failed monthly run hides nothing else, and sends nothing", async () => {
  h.loadFails = true;
  expect(await (await call()).json()).toMatchObject({ ok: true, due: 0, maya: { due: 0 }, monthly: { error: "run_failed" } });
  expect(h.mail.delivered).toHaveLength(0);
});
