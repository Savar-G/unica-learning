// PostHog loads after the page is idle so analytics never competes with the first paint.
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (key && typeof window !== "undefined") {
  const start = () =>
    import("posthog-js").then(({ default: posthog }) =>
      posthog.init(key, {
        api_host: "/ingest",
        ui_host: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST ?? "https://us.posthog.com",
        defaults: "2025-05-24",
        person_profiles: "identified_only",
      }),
    );
  if ("requestIdleCallback" in window) window.requestIdleCallback(start, { timeout: 3000 });
  else setTimeout(start, 1500);
}
