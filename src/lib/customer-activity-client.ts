import { getConsent, subscribeConsent } from "@/lib/consent";
import { ACTIVITY_CONSENT_COOKIE, type ActivityEvent, type ActivityPage } from "@/lib/customer-activity";

/** No queue or replay. A revoked choice cancels requests that have not finished. */
export function recordActivity(event: ActivityEvent, page: ActivityPage, child: string | null = null, book: string | null = null) {
  if (getConsent() !== "granted" || typeof window === "undefined") return;
  const controller = new AbortController();
  const off = subscribeConsent(() => { if (getConsent() !== "granted") controller.abort(); });
  try {
    // Refresh the server-readable choice for a returning visitor whose stored consent predates this feature.
    document.cookie = `${ACTIVITY_CONSENT_COOKIE}=granted; Path=/; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}`;
    void fetch("/api/account/activity", { method: "POST", credentials: "same-origin", signal: controller.signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event, page, child, book, request: crypto.randomUUID() }) })
      .catch(() => {}).finally(off);
  } catch { off(); }
}
