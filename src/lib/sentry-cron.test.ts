import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureCheckIn = vi.fn<(...args: unknown[]) => string>(() => "check-in-1");
vi.mock("@sentry/nextjs", () => ({ captureCheckIn: (...args: unknown[]) => captureCheckIn(...args), flush: vi.fn(async () => true) }));

const { CRON_MONITORS, monitored } = await import("@/lib/sentry-cron");
const { sentryCheckInUrl, sentryEnabled, SENTRY_DSN } = await import("@/lib/sentry-options");

const call = (auth?: string, url = "https://unicalearning.com/api/reminders") => new Request(url, { method: "POST", headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  captureCheckIn.mockClear();
  vi.stubEnv("CRON_SECRET", "s3cret");
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("monitored", () => {
  it("checks in at the start and at the end of a scheduled run", async () => {
    const handler = monitored("reminders", async () => Response.json({ ok: true }));
    expect((await handler(call("Bearer s3cret"))).status).toBe(200);
    expect(captureCheckIn).toHaveBeenCalledTimes(2);
    expect(captureCheckIn.mock.calls[0]).toEqual([{ monitorSlug: "reminders", status: "in_progress" }, expect.objectContaining({ schedule: { type: "crontab", value: "*/15 * * * *" } })]);
    expect(captureCheckIn.mock.calls[1][0]).toMatchObject({ checkInId: "check-in-1", monitorSlug: "reminders", status: "ok" });
  });

  it("marks an answer of 500 or more, and a throw, as a failed run", async () => {
    await monitored("keepalive", async () => new Response("x", { status: 502 }))(call("Bearer s3cret"));
    expect(captureCheckIn.mock.calls[1][0]).toMatchObject({ status: "error" });
    captureCheckIn.mockClear();
    await expect(monitored("keepalive", async () => { throw new Error("down"); })(call("Bearer s3cret"))).rejects.toThrow("down");
    expect(captureCheckIn.mock.calls[1][0]).toMatchObject({ status: "error" });
  });

  it("does not check in for a refused or dry call", async () => {
    const handler = monitored("reminders", async () => new Response("Unauthorized", { status: 401 }));
    await handler(call());
    await handler(call("Bearer wrong!"));
    await monitored("reminders", async () => Response.json({ ok: true }))(call("Bearer s3cret", "https://unicalearning.com/api/reminders?dry=1"));
    vi.stubEnv("CRON_SECRET", "");
    await handler(call("Bearer "));
    expect(captureCheckIn).not.toHaveBeenCalled();
  });

  it("names a schedule for every monitor", () => {
    for (const m of Object.values(CRON_MONITORS)) expect(m.schedule.split(" ")).toHaveLength(5);
  });
});

describe("sentry options", () => {
  it("builds the HTTP check-in address from the DSN", () => {
    expect(sentryCheckInUrl("workbook-worker", {})).toBe("https://o4512437890842624.ingest.us.sentry.io/api/4512438134308864/cron/workbook-worker/10064fe995f8eb573cd252a4327265d0/");
    expect(sentryCheckInUrl("x", { NEXT_PUBLIC_SENTRY_DSN: "" })).toBeNull();
  });

  it("sends only from a Vercel deployment or when turned on", () => {
    expect(sentryEnabled({})).toBe(false);
    expect(sentryEnabled({ VERCEL_ENV: "production" })).toBe(true);
    expect(sentryEnabled({ NEXT_PUBLIC_VERCEL_ENV: "preview" })).toBe(true);
    expect(sentryEnabled({ SENTRY_ENABLED: "on" })).toBe(true);
    expect(sentryEnabled({ VERCEL_ENV: "production", NEXT_PUBLIC_SENTRY_DSN: "" })).toBe(false);
    expect(SENTRY_DSN).toMatch(/^https:\/\/[0-9a-f]{32}@o\d+\.ingest\.us\.sentry\.io\/\d+$/);
  });
});
