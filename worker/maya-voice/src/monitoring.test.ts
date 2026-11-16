import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@sentry/node", { spy: true });
import * as Sentry from "@sentry/node";
import { monitorProduct, setProductObserver } from "@/lib/product-monitoring";
import { monitoredVoiceJob, registerVoiceMonitoring, voiceMonitoringOptions } from "./monitoring";

const webhook = "https://hooks.slack.com/services/TEXAMPLE/BEXAMPLE/synthetic-secret";
const callId = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks(); setProductObserver(null);
  vi.mocked(Sentry.init).mockReturnValue(undefined);
  vi.mocked(Sentry.flush).mockResolvedValue(true);
});
afterEach(() => { setProductObserver(null); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("allows fixed codes only and removes ambient content from worker events and logs", () => {
  const options = voiceMonitoringOptions({ MAYA_VOICE_MONITORING: "production" });
  expect(options.defaultIntegrations).toBe(false); expect(options.tracesSampleRate).toBe(0);
  const event = options.beforeSend({ type: undefined, message: "maya.failed", extra: { callId, text: "PRIVATE" },
    user: { email: "PRIVATE" }, request: { data: "PRIVATE" }, breadcrumbs: [{ message: "PRIVATE" }], contexts: { call: { words: "PRIVATE" } } });
  expect(event?.extra).toEqual({ callId }); expect(JSON.stringify(event)).not.toContain("PRIVATE");
  expect(options.beforeSend({ type: undefined, message: "PRIVATE" })).toBeNull();
  expect(options.beforeSend({ type: undefined, exception: { values: [{ value: "PRIVATE" }] } })).toMatchObject({ message: "maya.worker_failed" });
  const log = options.beforeSendLog({ level: "info", message: "maya.started", attributes: { callId, transcript: "PRIVATE" } });
  expect(log?.attributes).toMatchObject({ product_event: "maya.started", component: "maya-voice", callId, "sentry.environment": "production" });
});

it.each(["production", "preview"])("keeps the configured %s environment and release in safe logs", environment => {
  const options = voiceMonitoringOptions({ MAYA_VOICE_MONITORING: environment, MAYA_MONITORING_RELEASE: "candidate-sha" });
  const log = options.beforeSendLog({ level: "info", message: "maya.started", attributes: {
    "sentry.environment": "PRIVATE", "sentry.release": "PRIVATE", transcript: "PRIVATE", callId,
  } });
  expect(log?.attributes).toMatchObject({ product_event: "maya.started", component: "maya-voice", callId,
    "sentry.environment": environment, "sentry.release": "candidate-sha" });
  expect(JSON.stringify(log)).not.toContain("PRIVATE");
});

it("starts no SDK or delivery when the worker environment is not explicitly enabled", async () => {
  const request = vi.fn<typeof fetch>();
  const monitoring = registerVoiceMonitoring({ NODE_ENV: "production", SLACK_PRODUCT_ALERTS_WEBHOOK_URL: webhook }, request);
  monitorProduct("maya.started", { callId }); await monitoring.flush();
  expect(Sentry.init).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
});

it("sends committed events without holding the caller and waits for delivery during shutdown", async () => {
  let finish: (value: Response) => void = () => {};
  const request = vi.fn<typeof fetch>(() => new Promise(resolve => { finish = resolve; }));
  const monitoring = registerVoiceMonitoring({ MAYA_VOICE_MONITORING: "production", SLACK_PRODUCT_ALERTS_WEBHOOK_URL: webhook }, request);
  monitorProduct("maya.started", { callId, transcript: "PRIVATE" });
  expect(request).not.toHaveBeenCalled(); await Promise.resolve();
  expect(request).toHaveBeenCalledOnce();
  expect(String(request.mock.calls[0][1]?.body)).not.toContain("PRIVATE");
  let done = false; const draining = monitoring.flush().then(() => { done = true; });
  await Promise.resolve(); expect(done).toBe(false);
  finish(new Response("ok")); await draining;
  expect(Sentry.flush).toHaveBeenCalledWith(2_000);
});

it("records preview events but sends no Slack request", async () => {
  const request = vi.fn<typeof fetch>();
  const monitoring = registerVoiceMonitoring({ MAYA_VOICE_MONITORING: "preview", SLACK_PRODUCT_ALERTS_WEBHOOK_URL: webhook }, request);
  monitorProduct("maya.started", { callId }); await monitoring.flush();
  expect(Sentry.logger.info).toHaveBeenCalledWith("maya.started", expect.objectContaining({ callId }));
  expect(request).not.toHaveBeenCalled();
});

it("bounds a stalled delivery and records its failure without another Slack request", async () => {
  vi.useFakeTimers(); const request = vi.fn<typeof fetch>(() => new Promise(() => {}));
  const monitoring = registerVoiceMonitoring({ MAYA_VOICE_MONITORING: "production", SLACK_PRODUCT_ALERTS_WEBHOOK_URL: webhook }, request);
  monitorProduct("maya.ended", { callId }); const draining = monitoring.flush();
  await vi.advanceTimersByTimeAsync(2_000); await draining;
  expect(request).toHaveBeenCalledOnce();
  expect(Sentry.captureMessage).toHaveBeenCalledExactlyOnceWith("monitoring.delivery_failed", { level: "error", extra: { count: 1 } });
});

it("captures an entry failure with a fixed code and preserves its original error", async () => {
  vi.stubEnv("MAYA_VOICE_MONITORING", "preview");
  const callbacks: (() => Promise<void>)[] = []; const error = Error("PRIVATE");
  await expect(monitoredVoiceJob({ addShutdownCallback: callback => { callbacks.push(callback); } }, async () => { throw error; })).rejects.toBe(error);
  expect(Sentry.captureMessage).toHaveBeenCalledExactlyOnceWith("maya.worker_failed", { level: "error", extra: { step: "voice" } });
  expect(callbacks).toHaveLength(1); await callbacks[0]();
});
