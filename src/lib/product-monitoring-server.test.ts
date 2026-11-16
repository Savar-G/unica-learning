import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@sentry/nextjs", { spy: true });
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
import * as Sentry from "@sentry/nextjs";
import { productAlertText, productObserver, PRODUCT_ALERT_TIMEOUT_MS } from "./product-monitoring-server";
import { monitorProduct, setProductObserver, type ProductEvent } from "./product-monitoring";
const webhook = "https://hooks.slack.com/services/TEXAMPLE/BEXAMPLE/synthetic-secret";
const success: ProductEvent = { code: "scan.send_accepted", attributes: { count: 2, text: "PRIVATE CHILD WORDS", photoId: "11111111-1111-4111-8111-111111111111" } };
beforeEach(() => { vi.clearAllMocks(); setProductObserver(null); });
afterEach(() => {
  setProductObserver(null);
  Sentry.getIsolationScope().setUser(null);
  Sentry.getIsolationScope().setContext("secret", null);
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});

function setup(env: Record<string, string> = { VERCEL_ENV: "production", SLACK_PRODUCT_ALERTS_WEBHOOK_URL: webhook }) {
  const tasks: (() => Promise<void>)[] = [], fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("ok"));
  const issue = vi.fn(), log = vi.fn();
  const observer = productObserver({ env, schedule: (work) => { tasks.push(work); }, fetch, issue, log });
  return { observer, tasks, fetch, issue, log };
}

it.each(["preview", "development", "", "production-local"])("sends no Slack request outside exact Vercel production: %s", (VERCEL_ENV) => {
  const s = setup({ VERCEL_ENV, NODE_ENV: "production", SLACK_PRODUCT_ALERTS_WEBHOOK_URL: webhook });
  s.observer(success);
  expect(s.tasks).toHaveLength(0); expect(s.fetch).not.toHaveBeenCalled(); expect(s.log).toHaveBeenCalledOnce();
});

it("records success as structured info and sends only codes, counts and protected links after the response", async () => {
  const s = setup(); s.observer(success);
  expect(s.log).toHaveBeenCalledWith({ code: success.code, attributes: { count: 2, photoId: success.attributes.photoId } });
  expect(s.issue).not.toHaveBeenCalled(); expect(s.fetch).not.toHaveBeenCalled();
  await s.tasks[0]();
  expect(s.fetch).toHaveBeenCalledOnce();
  const body = JSON.parse(String(s.fetch.mock.calls[0][1]?.body));
  expect(body).toEqual({ text: "scan.send_accepted count=2 https://unicalearning.com/admin/scans", unfurl_links: false, unfurl_media: false });
  expect(s.fetch.mock.calls[0][1]?.redirect).toBe("error");
  expect(productAlertText({ code: "maya.safety_flagged", attributes: { callId: "11111111-1111-4111-8111-111111111111", flag: "safety_concern", text: "PRIVATE" } }))
    .toBe("maya.safety_flagged https://unicalearning.com/admin/maya/11111111-1111-4111-8111-111111111111");
});

it("creates fixed issue codes for real failures and does not turn safety signals or budget outcomes into errors", () => {
  const s = setup();
  s.observer({ code: "maya.failed", attributes: { error: "PRIVATE" } });
  s.observer({ code: "maya.safety_flagged", attributes: {} });
  s.observer({ code: "scan.marking_deferred", attributes: { status: "budget" } });
  expect(s.issue).toHaveBeenCalledExactlyOnceWith("maya.failed", {});
  expect(s.log).toHaveBeenCalledTimes(2); expect(s.tasks).toHaveLength(2);
});

it.each(["network", "refused", "timeout"])("contains %s delivery failure, without a recursive Slack send or private diagnostics", async (failure) => {
  vi.useFakeTimers(); const s = setup();
  if (failure === "network") s.fetch.mockRejectedValue(Error(webhook + " PRIVATE"));
  if (failure === "refused") s.fetch.mockResolvedValue(new Response("PRIVATE", { status: 429 }));
  if (failure === "timeout") s.fetch.mockImplementation(() => new Promise(() => {}));
  s.observer(success); const task = s.tasks[0]();
  await vi.advanceTimersByTimeAsync(PRODUCT_ALERT_TIMEOUT_MS);
  await expect(task).resolves.toBeUndefined();
  expect(s.issue).toHaveBeenCalledExactlyOnceWith("monitoring.delivery_failed", { count: 1 });
  expect(s.tasks).toHaveLength(1); expect(s.fetch).toHaveBeenCalledOnce();
  if (failure === "timeout") expect(s.fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
});

it("contains scheduler failure and rejects destinations that can expose the webhook", () => {
  const issue = vi.fn();
  const observer = productObserver({ env: { VERCEL_ENV: "production", SLACK_PRODUCT_ALERTS_WEBHOOK_URL: webhook }, schedule: () => { throw Error("PRIVATE"); }, issue, log: () => {} });
  expect(() => observer(success)).not.toThrow();
  expect(issue).toHaveBeenCalledExactlyOnceWith("monitoring.schedule_failed", {});
  for (const url of ["https://attacker.test/services/x", webhook + "?private=1", "http://hooks.slack.com/services/x"]) {
    const s = setup({ VERCEL_ENV: "production", SLACK_PRODUCT_ALERTS_WEBHOOK_URL: url });
    s.observer(success); expect(s.tasks).toHaveLength(0); expect(s.issue).toHaveBeenCalledWith("monitoring.configuration_failed", {});
  }
});

it("uses a cleared Sentry scope, a stable fingerprint, and the allowlisted payload for a handled issue", () => {
  const scopes: unknown[] = [];
  const capture = vi.mocked(Sentry.captureMessage).mockImplementation(() => {
    const current = Sentry.getCurrentScope().getScopeData();
    scopes.push(current.eventProcessors[0]({ message: "PRIVATE", user: { email: "PRIVATE" },
      contexts: { request: { text: "PRIVATE" } }, request: { data: "PRIVATE" }, extra: { text: "PRIVATE" }, breadcrumbs: [{ message: "PRIVATE" }] }, {}));
    return "event-id";
  });
  setProductObserver(productObserver({ env: {} }));
  Sentry.withIsolationScope((isolation) => {
    isolation.setUser({ email: "PRIVATE" }); isolation.setContext("secret", { text: "PRIVATE" });
    Sentry.withScope((scope) => {
      scope.setExtra("request", "PRIVATE"); scope.addBreadcrumb({ message: "PRIVATE" });
      monitorProduct("feedback.failed", { count: 1, text: "PRIVATE", request: { email: "PRIVATE" } });
    });
  });
  expect(JSON.stringify(scopes)).not.toContain("PRIVATE");
  expect(capture).toHaveBeenCalledExactlyOnceWith("feedback.failed", expect.objectContaining({
    level: "error", fingerprint: ["product", "feedback.failed"], extra: { count: 1 },
  }));
});
