import "server-only";
import { after } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { type ProductObserver, type ProductEvent } from "@/lib/product-monitoring";
import { productDelivery } from "@/lib/product-monitoring-delivery";
export { productAlertText, PRODUCT_ALERT_TIMEOUT_MS } from "@/lib/product-monitoring-delivery";

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

/** The Next host supplies the request lifetime and the Sentry SDK. */
export function productObserver(deps: DeliveryDeps = {}): ProductObserver {
  return productDelivery({
    ...deps,
    env: deps.env ?? process.env,
    schedule: deps.schedule ?? after,
    issue: deps.issue ?? issue,
    log: deps.log ?? ((event) => Sentry.logger.info(event.code, { product_event: event.code, ...event.attributes })),
    suppressTracing: Sentry.suppressTracing,
  });
}
