import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Envelope } from "@sentry/core";
const capture = vi.hoisted(() => ({ envelopes: [] as Envelope[] }));
vi.mock("@sentry/node", async importOriginal => {
  const sdk = await importOriginal<typeof import("@sentry/node")>();
  return { ...sdk, init: (options: Parameters<typeof sdk.init>[0]) => sdk.init({
    ...options, dsn: "https://public@example.invalid/1",
    transport: () => ({ send: async envelope => { capture.envelopes.push(envelope); return { statusCode: 200 }; }, flush: async () => true }),
  }) };
});
import * as Sentry from "@sentry/node";
import { monitorProduct, setProductObserver } from "@/lib/product-monitoring";
import { registerVoiceMonitoring } from "./monitoring";

beforeEach(() => { vi.clearAllMocks(); capture.envelopes.length = 0; setProductObserver(null); });
afterEach(async () => {
  setProductObserver(null); Sentry.getGlobalScope().setAttribute("global.words", undefined);
  Sentry.getGlobalScope().setAttribute("mode", undefined); Sentry.getGlobalScope().setAttribute("mode", undefined);
  await Sentry.close(2_000); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

it.each(["production", "preview"])("excludes all ambient scope attributes from actual %s log envelopes", async environment => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("ok"));
  const worker = registerVoiceMonitoring({ MAYA_VOICE_MONITORING: environment, MAYA_MONITORING_RELEASE: "test-release",
    SLACK_PRODUCT_ALERTS_WEBHOOK_URL: "https://hooks.slack.com/services/TEXAMPLE/BEXAMPLE/synthetic" }, request);
  Sentry.getGlobalScope().setAttribute("global.words", "PRIVATE_GLOBAL");
  Sentry.getGlobalScope().setAttribute("mode", "voice");
  Sentry.getGlobalScope().setAttribute("mode", "voice");
  Sentry.withIsolationScope(isolation => {
    isolation.setAttribute("provider.answer", "PRIVATE_ISOLATION");
    Sentry.withScope(scope => {
      scope.setAttribute("child.words", "PRIVATE_CURRENT");
      scope.setAttribute("sentry.environment", "PRIVATE_ENVIRONMENT");
      monitorProduct("maya.started", { callId: "11111111-1111-4111-8111-111111111111", transcript: "PRIVATE_EVENT" });
    });
  });
  await worker.flush();
  const logs: { body: string; attributes: Record<string, { value: unknown }> }[] = [];
  for (const envelope of capture.envelopes) for (const item of envelope[1]) {
    if (item[0].type === "log") logs.push(...(item[1] as { items: typeof logs }).items);
  }
  expect(logs).toHaveLength(1); expect(logs[0].body).toBe("maya.started");
  expect(logs[0].attributes["sentry.environment"].value).toBe(environment);
  expect(logs[0].attributes["sentry.release"].value).toBe("test-release");
  expect(logs[0].attributes.callId.value).toBe("11111111-1111-4111-8111-111111111111");
  expect(Object.keys(logs[0].attributes).sort()).toEqual(["callId", "component", "product_event", "sentry.environment", "sentry.release"]);
  expect(Object.keys(logs[0].attributes).sort()).toEqual(["callId", "component", "product_event", "sentry.environment", "sentry.release"]);
  expect(JSON.stringify(capture.envelopes)).not.toContain("PRIVATE_");
  expect(request).toHaveBeenCalledTimes(environment === "production" ? 1 : 0);
  expect(JSON.stringify(request.mock.calls)).not.toContain("PRIVATE_");
});
