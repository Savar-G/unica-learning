// Funnel events: cta_click, form_start, plan_selected, details_done, waitlist_join, checkout_start, reserve_success, card_redirect, card_saved, card_cancelled.
// posthog-js is imported on demand so it stays out of the first-load bundle.
export function track(event: string, props: Record<string, unknown> = {}) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    if (process.env.NODE_ENV !== "production") console.info("[track]", event, props);
    return;
  }
  import("posthog-js").then(({ default: posthog }) => posthog.capture(event, props));
}

export function identify(id: string, props: Record<string, unknown>) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  import("posthog-js").then(({ default: posthog }) => posthog.identify(id, props));
}
