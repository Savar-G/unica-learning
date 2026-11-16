import "server-only";
import { after } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { PRODUCT_EVENTS, productEvent, type ProductObserver, type ProductEvent } from "@/lib/product-monitoring";

export const PRODUCT_ALERT_TIMEOUT_MS = 2_000;
type Env = Readonly<Record<string, string | undefined>>;
interface DeliveryDeps {
  env?: Env;
  schedule?: (work: () => Promise<void>) => void;
  fetch?: typeof fetch;
  log?: (event: ProductEvent) => void;
  issue?: (code: string, attributes: ProductEvent["attributes"]) => void;
}

// A new scope plus a final allowlist prevents ambient request data from entering a product issue.
// The event processor also protects runtimes whose async-context strategy retains the isolation scope.
const issue = (code: string, attributes: ProductEvent["attributes"]) => {
  const scope = new Sentry.Scope();
  scope.setClient(Sentry.getClient());
  scope.addEventProcessor((event) => ({
    event_id: event.event_id, timestamp: event.timestamp, platform: "javascript",
    environment: event.environment, release: event.release,
    level: "error", message: code, fingerprint: ["product", code], tags: { product_event: code }, extra: attributes,
  }));
  return Sentry.withIsolationScope(new Sentry.Scope(), () => Sentry.withScope(scope, () => {
    Sentry.captureMessage(code, { level: "error", fingerprint: ["product", code], tags: { product_event: code }, extra: attributes });
  }));
};

/** Slack gets fixed codes, counts, and authenticated admin links. It gets no request or exception object. */
export function productAlertText(event: ProductEvent): string {
  const safe = productEvent(event.code, event.attributes);
  if (!safe) return "";
  const a = safe.attributes;
  const counts = ["count", "scored", "pending", "total"].flatMap((key) => typeof a[key] === "number" ? [`${key}=${a[key]}`] : []);
  const link = a.callId ? `https://unicalearning.com/admin/maya/${a.callId}`
    : safe.code.startsWith("scan.") ? "https://unicalearning.com/admin/scans"
    : safe.code.startsWith("feedback.") ? "https://unicalearning.com/admin/feedback" : "https://unicalearning.com/admin";
  return [safe.code, ...counts, link].join(" ");
}

/** Registers delivery in Next after. Nothing waits for Slack on the customer request path. */
export function productObserver(deps: DeliveryDeps = {}): ProductObserver {
  const env = deps.env ?? process.env, schedule = deps.schedule ?? after;
  const report = (code: string, attributes: ProductEvent["attributes"]) => { try { (deps.issue ?? issue)(code, attributes); } catch { /* Never recurse. */ } };
  return (input) => {
    const event = productEvent(input.code, input.attributes);
    if (!event) return;
    try {
      if (PRODUCT_EVENTS[event.code].failure) report(event.code, event.attributes);
      else (deps.log ?? ((e) => Sentry.logger.info(e.code, { product_event: e.code, ...e.attributes })))(event);
    } catch { report("monitoring.record_failed", {}); }
    if (env.VERCEL_ENV !== "production" || !PRODUCT_EVENTS[event.code].alert || !env.SLACK_PRODUCT_ALERTS_WEBHOOK_URL) return;
    let webhook: URL;
    try {
      webhook = new URL(env.SLACK_PRODUCT_ALERTS_WEBHOOK_URL);
      if (webhook.protocol !== "https:" || webhook.hostname !== "hooks.slack.com" || webhook.port || webhook.username || webhook.password || webhook.search || webhook.hash || !/^\/services\/[A-Za-z0-9/_-]+$/.test(webhook.pathname)) throw Error();
    } catch { report("monitoring.configuration_failed", {}); return; }
    try {
      schedule(async () => {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const limit = new Promise<never>((_, reject) => {
            timer = setTimeout(() => { controller.abort(); reject(Error("timeout")); }, PRODUCT_ALERT_TIMEOUT_MS);
          });
          const delivery = Sentry.suppressTracing(() => (deps.fetch ?? fetch)(webhook, { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: productAlertText(event), unfurl_links: false, unfurl_media: false }), signal: controller.signal, redirect: "error" }));
          const response = await Promise.race([delivery, limit]);
          if (!response.ok) throw Error("refused");
          // Do not consume or log a response body. It can contain provider diagnostics.
          void response.body?.cancel().catch(() => {});
        } catch { report("monitoring.delivery_failed", { count: 1 }); }
        finally { clearTimeout(timer); }
      });
    } catch { report("monitoring.schedule_failed", {}); }
  };
}
