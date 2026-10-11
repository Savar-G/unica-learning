import { describe, expect, it } from "vitest";
import { createAnalytics, type Client } from "@/lib/analytics";

// PostHog is the system boundary: a fake client records what reaches it.
function withConsent() {
  const calls: unknown[][] = [];
  const client: Client = {
    init: () => undefined,
    capture: (...args: unknown[]) => calls.push(args),
    reset: () => undefined,
    opt_in_capturing: () => undefined,
    opt_out_capturing: () => undefined,
  };
  const analytics = createAnalytics({
    key: "test",
    load: async () => client,
    getConsent: () => "granted",
    subscribe: () => () => undefined,
    clearStorage: () => undefined,
    whenIdle: (run) => run(),
  });
  return { analytics, calls };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("events sent as the page goes away (#72)", () => {
  it("go to PostHog at once with the sendBeacon transport", async () => {
    const { analytics, calls } = withConsent();
    analytics.track("test_stop", { status: "closed" }, { beacon: true });
    await settle();
    expect(calls).toEqual([["test_stop", { status: "closed" }, { transport: "sendBeacon", send_instantly: true }]]);
  });

  it("other events keep PostHog's normal transport, which retries after a dropped connection", async () => {
    const { analytics, calls } = withConsent();
    analytics.track("test_stop", { status: "offline" });
    await settle();
    expect(calls).toEqual([["test_stop", { status: "offline" }]]);
  });
});

describe("the admin area sends nothing (#77)", () => {
  // The visitor accepted analytics; `path` is the page they are on.
  function onPage(start: string) {
    const page = { path: start };
    const calls: unknown[][] = [];
    const loads: string[] = [];
    let config: { before_send?: (event: unknown) => unknown } = {};
    const client: Client = {
      init: (_key, c) => { config = c as typeof config; },
      capture: (...args: unknown[]) => calls.push(args),
      reset: () => undefined,
      opt_in_capturing: () => undefined,
      opt_out_capturing: () => undefined,
    };
    const analytics = createAnalytics({
      key: "test",
      load: async () => { loads.push(page.path); return client; },
      getConsent: () => "granted",
      subscribe: () => () => undefined,
      clearStorage: () => undefined,
      whenIdle: (run) => run(),
      path: () => page.path,
    });
    return { analytics, calls, loads, page, beforeSend: (event: unknown) => config.before_send?.(event) };
  }

  it("does not load PostHog on an admin page, and drops its events", async () => {
    for (const path of ["/admin", "/admin/assessments/1", "/%61dmin/parents", "/api/admin/families"]) {
      const { analytics, calls, loads } = onPage(path);
      analytics.begin();
      analytics.track("report_open", { src: "account" });
      await settle();
      expect(loads).toEqual([]);
      expect(calls).toEqual([]);
    }
  });

  it("drops what PostHog sends by itself after the visitor moves on to an admin page", async () => {
    const { analytics, calls, page, beforeSend } = onPage("/account");
    analytics.track("report_open", { src: "account" });
    await settle();
    expect(calls).toEqual([["report_open", { src: "account" }]]);
    const pageview = { properties: { $current_url: "https://unicalearning.com/admin" } };
    expect(beforeSend(pageview)).toBeNull();
    expect(beforeSend({ properties: { $current_url: "https://unicalearning.com/account" } })).not.toBeNull();
    page.path = "/admin";
    expect(beforeSend(pageview)).toBeNull();
    analytics.track("waitlist_join", { src: "account" });
    await settle();
    expect(calls).toHaveLength(1);
  });

  it("still tracks pages whose name only starts with the same letters", async () => {
    const { analytics, calls } = onPage("/administer");
    analytics.track("cta_click");
    await settle();
    expect(calls).toEqual([["cta_click", {}]]);
  });
});
