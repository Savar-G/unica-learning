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
