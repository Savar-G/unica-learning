// Funnel events: cta_click, form_start, plan_selected, details_done, waitlist_join, checkout_start, reserve_success, card_redirect, card_saved, card_cancelled, signup_save_failed, heard_from.
// Assessment pilot (#62): account_form_start, account_created, account_signup_failed, sign_in, sign_in_failed, child_added, phone_screen, test_start_click.
// The test (#64): test_start (status new or resumed), test_finish, test_error (code, status = the step that failed).
// Analytics run only after the visitor accepts (see consent.ts). Without consent an event is dropped, not queued.
// Only src, plan, subject, curriculum, price, status, code, card and channel travel with an event (see analytics.ts).
// posthog-js is imported on demand so it stays out of the first-load bundle.
import { getAnalytics } from "@/lib/analytics";
import { getConsent } from "@/lib/consent";

export function track(event: string, props: Record<string, unknown> = {}) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    if (process.env.NODE_ENV !== "production") console.info("[track]", getConsent() === "granted" ? "sent" : "dropped (no consent)", event, props);
    return;
  }
  const analytics = getAnalytics();
  analytics?.begin();
  analytics?.track(event, props);
}

// Parents are never identified: no email, name or postal code reaches analytics. Kept so old call sites compile.
export function identify(...args: unknown[]): void {
  void args;
}
