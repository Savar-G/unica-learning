// Shared delivery for the Next server and the standalone voice worker. It imports no platform SDK.
import { PRODUCT_EVENTS, productEvent, type ProductObserver, type ProductEvent } from "@/lib/product-monitoring";

export const PRODUCT_ALERT_TIMEOUT_MS = 2_000;
export interface ProductDeliveryDeps {
  env: Readonly<Record<string, string | undefined>>;
  schedule: (work: () => Promise<void>) => void;
  fetch?: typeof fetch;
  log: (event: ProductEvent) => void;
  issue: (code: string, attributes: ProductEvent["attributes"]) => void;
  suppressTracing: <T>(work: () => T) => T;
}

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
export function productDelivery(deps: ProductDeliveryDeps): ProductObserver {
  const env = deps.env, schedule = deps.schedule;
  const report = (code: string, attributes: ProductEvent["attributes"]) => { try { deps.issue(code, attributes); } catch { /* Never recurse. */ } };
  return (input) => {
    const event = productEvent(input.code, input.attributes);
    if (!event) return;
    try {
      if (PRODUCT_EVENTS[event.code].failure) report(event.code, event.attributes);
      else deps.log(event);
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
          const delivery = deps.suppressTracing(() => (deps.fetch ?? fetch)(webhook, { method: "POST", headers: { "Content-Type": "application/json" },
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
