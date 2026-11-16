// One job process serves one call. Only fixed product events leave this process.
import * as Sentry from "@sentry/node";
import { DATA_COLLECTION, SENTRY_DSN } from "@/lib/sentry-options";
import { PRODUCT_EVENTS, monitorProduct, productEvent, setProductObserver, type ProductCode, type ProductEvent } from "@/lib/product-monitoring";
import { productDelivery } from "@/lib/product-monitoring-delivery";

type Env = Readonly<Record<string, string | undefined>>;
const DIAGNOSTICS = new Set(["monitoring.record_failed", "monitoring.configuration_failed", "monitoring.schedule_failed", "monitoring.delivery_failed"]);
const MAX_PENDING = 32;

function safeRecord(code: unknown, input: Record<string, unknown> = {}) {
  if (typeof code !== "string") return null;
  if (DIAGNOSTICS.has(code)) return { code, attributes: {} };
  return Object.hasOwn(PRODUCT_EVENTS, code) ? productEvent(code as ProductCode, input) : null;
}

/** No automatic content collection. Fatal process errors become one fixed diagnostic with no exception content. */
export function voiceMonitoringOptions(env: Env) {
  return {
    dsn: env.SENTRY_DSN ?? SENTRY_DSN,
    enabled: env.MAYA_VOICE_MONITORING === "production" || env.MAYA_VOICE_MONITORING === "preview",
    environment: env.MAYA_VOICE_MONITORING,
    release: env.MAYA_MONITORING_RELEASE,
    defaultIntegrations: false as const,
    integrations: [Sentry.onUncaughtExceptionIntegration(), Sentry.onUnhandledRejectionIntegration()],
    skipOpenTelemetrySetup: true,
    tracesSampleRate: 0,
    dataCollection: DATA_COLLECTION,
    beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
      const safe = safeRecord(event.message, event.extra) ?? (event.exception?.values?.length ? { code: "maya.worker_failed", attributes: {} } : null);
      if (!safe) return null;
      return { type: undefined, event_id: event.event_id, timestamp: event.timestamp, environment: event.environment, release: event.release,
        platform: "javascript", level: "error", message: safe.code, fingerprint: ["product", safe.code],
        tags: { product_event: safe.code, component: "maya-voice" }, extra: safe.attributes };
    },
    beforeSendLog(log: Sentry.Log): Sentry.Log | null {
      const safe = safeRecord(log.message, log.attributes);
      return safe ? { ...log, message: safe.code, attributes: { product_event: safe.code, component: "maya-voice", ...safe.attributes } } : null;
    },
  };
}

/** Start bounded delivery without making a turn wait for the network. Flush after the call's last write. */
export function registerVoiceMonitoring(env: Env = process.env, request: typeof fetch = fetch): { flush(): Promise<void> } {
  const options = voiceMonitoringOptions(env);
  if (!options.enabled) return { flush: async () => {} };
  try { Sentry.init(options); } catch { console.error("monitoring.record_failed"); return { flush: async () => {} }; }
  const pending = new Set<Promise<void>>();
  const issue = (code: string, attributes: ProductEvent["attributes"]) => {
    Sentry.captureMessage(code, { level: "error", extra: attributes });
  };
  setProductObserver(productDelivery({
    // The common transport uses its production gate. This host supplies its own explicit deployment environment.
    env: { VERCEL_ENV: env.MAYA_VOICE_MONITORING, SLACK_PRODUCT_ALERTS_WEBHOOK_URL: env.SLACK_PRODUCT_ALERTS_WEBHOOK_URL },
    fetch: request,
    log: event => Sentry.logger.info(event.code, { product_event: event.code, ...event.attributes }),
    issue,
    suppressTracing: work => work(),
    schedule: work => {
      if (pending.size >= MAX_PENDING) throw Error("monitoring queue full");
      const task = Promise.resolve().then(work).finally(() => { pending.delete(task); });
      pending.add(task);
    },
  }));
  return {
    async flush() {
      // No new turn runs during call shutdown. Drain the events before flushing the SDK's own buffers.
      while (pending.size) await Promise.allSettled([...pending]);
      try { await Sentry.flush(2_000); } catch { console.error("monitoring.record_failed"); }
    },
  };
}

/** Entry failures must report a fixed code. Shutdown waits for the pending delivery work. */
export async function monitoredVoiceJob(
  ctx: { addShutdownCallback(callback: () => Promise<void>): void },
  work: (monitoring: { flush(): Promise<void> }) => Promise<void>,
): Promise<void> {
  const monitoring = registerVoiceMonitoring();
  ctx.addShutdownCallback(() => monitoring.flush());
  try { await work(monitoring); }
  catch (error) {
    monitorProduct("maya.worker_failed", { step: "voice" });
    await monitoring.flush();
    throw error;
  }
}
