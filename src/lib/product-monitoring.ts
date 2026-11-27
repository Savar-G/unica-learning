// No SDK or platform imports. Standalone workers have no observer until their host registers one.
import { SCAN_REJECT_REASONS } from "@/lib/scan-states";

export const PRODUCT_EVENTS = {
  "scan.upload_committed": { failure: false, alert: true },
  "scan.upload_refused": { failure: false, alert: false },
  "scan.upload_failed": { failure: true, alert: true },
  "scan.send_accepted": { failure: false, alert: true },
  "scan.send_failed": { failure: true, alert: true },
  "scan.check_failed": { failure: true, alert: true },
  "scan.marking_complete": { failure: false, alert: true },
  "scan.marking_team_pending": { failure: false, alert: true },
  "scan.team_mark_saved": { failure: false, alert: true },
  "scan.team_mark_failed": { failure: true, alert: true },
  "scan.marking_deferred": { failure: false, alert: false },
  "scan.marking_failed": { failure: true, alert: true },
  "scan.recovery_failed": { failure: true, alert: true },
  "maya.started": { failure: false, alert: true },
  "maya.ended": { failure: false, alert: true },
  "maya.safety_flagged": { failure: false, alert: true },
  "maya.failed": { failure: true, alert: true },
  "maya.recovery_failed": { failure: true, alert: true },
  "maya.worker_failed": { failure: true, alert: true },
  "maya.voice_provider_failed": { failure: true, alert: true },
  "maya.voice_provider_retry": { failure: false, alert: false },
  "feedback.received": { failure: false, alert: true },
  "feedback.failed": { failure: true, alert: true },
  "dashboard.request_failed": { failure: true, alert: true },
  // Send the job counts directly. A Sentry issue would also notify Slack through the project rule.
  "workbook.job_failed": { failure: false, alert: true },
  "workbook.job_stalled": { failure: false, alert: true },
  "workbook.job_waiting": { failure: false, alert: true },
  "workbook.alert_check_failed": { failure: true, alert: false },
} as const;
export type ProductCode = keyof typeof PRODUCT_EVENTS;
export interface ProductEvent { code: ProductCode; attributes: Record<string, string | number> }
export type ProductObserver = (event: ProductEvent) => void | Promise<void>;
const holder = globalThis as typeof globalThis & { __unicaProductObserver?: ProductObserver };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENUMS: Record<string, readonly string[]> = {
  mode: ["text", "voice"], kind: ["chat", "family", "admin_test"],
  flag: ["unsafe_request", "safety_concern", "safety_immediate"],
  status: ["pending", "busy", "off", "budget", "price-unverified", "attempts", "unfinished", "terminal", "unavailable"],
  step: ["upload", "send", "check", "marking", "profile", "learning", "note", "history", "safety", "stream", "chat", "voice", "usage", "stack", "schedule", "recovery", "model", "sheet_results"],
  product: ["workbook", "parent_dashboard", "marking", "maya", "other"],
};

/** Unknown codes, keys, strings, objects and invalid numbers never reach an observer. */
export function productEvent(code: ProductCode, input: Record<string, unknown> = {}): ProductEvent | null {
  if (!Object.hasOwn(PRODUCT_EVENTS, code)) return null;
  const attributes: ProductEvent["attributes"] = {};
  for (const key of ["photoId", "callId"] as const) {
    if (typeof input[key] === "string" && UUID.test(input[key])) attributes[key] = input[key].toLowerCase();
  }
  for (const key of ["count", "scored", "pending", "total"] as const) {
    const value = input[key];
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000) attributes[key] = value;
  }
  for (const [key, values] of Object.entries(ENUMS)) {
    const value = input[key];
    if (typeof value === "string" && values.includes(value)) attributes[key] = value;
  }
  if (code === "scan.upload_refused") {
    const reason = SCAN_REJECT_REASONS.find((value) => value === input.reason);
    if (reason) attributes.reason = reason;
  }
  return { code, attributes };
}
export function setProductObserver(observer: ProductObserver | null): void { holder.__unicaProductObserver = observer ?? undefined; }

/** Monitoring cannot change the product result, even if registration or the observer fails. */
export function monitorProduct(code: ProductCode, input: Record<string, unknown> = {}): void {
  const observer = holder.__unicaProductObserver;
  if (!observer) {
    // Standalone workers retain a content-free failure diagnostic without loading a platform SDK.
    try { if (Object.hasOwn(PRODUCT_EVENTS, code) && PRODUCT_EVENTS[code].failure) console.error(code); } catch { /* Diagnostics cannot fail work. */ }
    return;
  }
  try {
    const event = productEvent(code, input);
    if (event) void Promise.resolve(observer(event)).catch(() => {});
  } catch { /* No recursive alert through a failed observer. */ }
}

/** Both a synchronous scheduling error and a later rejected task need a handled failure event. */
export function productAfter(schedule: (work: () => Promise<void>) => void, work: () => Promise<unknown>, code: ProductCode, attributes: Record<string, unknown> = {}): boolean {
  try {
    schedule(async () => {
      try { await work(); } catch { monitorProduct(code, attributes); }
    });
    return true;
  } catch { monitorProduct(code, { ...attributes, step: "schedule" }); return false; }
}
