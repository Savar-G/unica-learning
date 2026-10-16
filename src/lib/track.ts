// Funnel events: page_zoom (src = sample child page opened on the home page, D-096), cta_click (src = the "Take free assessment" link that opened /start, #82), card_saved, card_cancelled.
// The old booking dialog's events (form_start, plan_selected, details_done, checkout_start, reserve_success,
// card_redirect, signup_save_failed) stopped with the public launch (#82). heard_from stays for old booking receipts.
// Parent accounts (#62): account_form_start, account_created, account_signup_failed, sign_in, sign_in_failed, child_added, phone_screen, test_start_click.
// Email code (#82): account_code_sent (status sent, wait or again), account_code_failed (code send, expired, too_many or
// check_failed), sign_in (channel "code": the email already had an account, and the code signed the parent in).
// Sign-in (#63): google_start, google_failed, sign_in_link_sent, sign_in_link_failed, sign_in_link_page, sign_in (channel "link", on the start screen), password_reset_request, password_changed, password_change_failed.
// The test (#64): test_start (status new or resumed), test_finish, test_error (code, status = the step that failed).
// Read-aloud, break, progress (#69): read_aloud (the child started the voice), test_break (status shown, rested or skipped).
// Quick facts (#70): test_facts_done (status time_up or all_answered). No grade and no score.
// Stop and resume (#72): test_stop (status closed = the tab closed or left, sent with a beacon; offline = the connection
// dropped, retried by PostHog when it comes back), during a question, the break or quick facts; test_resume (an open
// test continued, or one with every answer in opened to finish). test_start is now only a new test (status new, or
// restart after one expired). test_start_click status: new, retake, in_progress, finish, expired.
// The report (#65): report_open (src = email when the parent came from the report email, else account).
// Whiteboard (#67): test_work (an answer stored with work; status required or optional, channel draw, type or both),
// test_work_nudge (a show-your-work question was answered with an empty board, once per question).
// The report's next step (#66): card_start (the plan click toward the payment page: plan, price, src = email or
// account, status = stripe, later (no Stripe key or Stripe failed), saved (a card was saved before) or error);
// waitlist_join (src, curriculum, status = joined or already; the reserve form's waitlist_join has no src);
// card_cancelled and card_saved with src = report.
// How the child learns (#126): learning_step (src = report or account, status = saved, cleared, skipped or error).
// No answer travels with it: no learning style, interest, note, feeling about math, goal or weekly time (#195) goes to
// analytics.
// Help flags (#71): test_help (status yes, a-little or no: the answer to "Did anyone help?", sent once the test is stored).
// Rushing (#189): test_pace (status shown: "Take your time" showed after three very fast answers in a row). No time or score.
// Extra round (#190): test_extra (status offered, taken, skipped, stopped (Stop here part way) or finished; src = test
// when the offer came after the last main question, report when the parent opened it from the report). No area, count
// or score.
// Reminders (#73): reminder_open (status = continue, come_back, start or start_followup: the parent opened the start screen from that
// reminder email), unsubscribe (status done or failed: the unsubscribe page turned reminders off), unsubscribe_page
// (status unsubscribed = already off, unknown = a link that does not work, failed).
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
