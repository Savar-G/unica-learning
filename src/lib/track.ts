// Funnel events: cta_click, form_start, plan_selected, details_done, waitlist_join, checkout_start, reserve_success, card_redirect, card_saved, card_cancelled, signup_save_failed, heard_from.
// Assessment pilot (#62): account_form_start, account_created, account_signup_failed, sign_in, sign_in_failed, child_added, phone_screen, test_start_click.
// Sign-in (#63): google_start, google_failed, sign_in_link_sent, sign_in_link_failed, sign_in_link_page, sign_in (channel "link", on the start screen), password_reset_request, password_changed, password_change_failed.
// The test (#64): test_start (status new or resumed), test_finish, test_error (code, status = the step that failed).
// Read-aloud, break, progress (#69): read_aloud (the child started the voice), test_break (status shown, rested or skipped).
// Quick facts (#70): test_facts_done (status time_up or all_answered). No grade and no score.
// Stop and resume (#72): test_stop (status closed = the tab closed or left, sent with a beacon; offline = the connection
// dropped, retried by PostHog when it comes back), during a question, the break or quick facts; test_resume (an open
// test continued, or one with every answer in opened to finish). test_start is now only a new test (status new, or
// restart after one expired). test_start_click status: new, retake, in_progress, finish, expired.
// The report (#65): report_open (src = email when the parent came from the report email, else account).
// Analytics run only after the visitor accepts (see consent.ts). Without consent an event is dropped, not queued.
// Only src, plan, subject, curriculum, price, status, code, card and channel travel with an event (see analytics.ts).
// posthog-js is imported on demand so it stays out of the first-load bundle.
import { getAnalytics } from "@/lib/analytics";
import { getConsent } from "@/lib/consent";

/** `beacon`: the page is going away (pagehide), so the event goes out at once with sendBeacon. */
export function track(event: string, props: Record<string, unknown> = {}, options: { beacon?: boolean } = {}) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    if (process.env.NODE_ENV !== "production") console.info("[track]", getConsent() === "granted" ? "sent" : "dropped (no consent)", event, props, options.beacon ? "(beacon)" : "");
    return;
  }
  const analytics = getAnalytics();
  analytics?.begin();
  analytics?.track(event, props, options);
}

// Parents are never identified: no email, name or postal code reaches analytics. Kept so old call sites compile.
export function identify(...args: unknown[]): void {
  void args;
}
