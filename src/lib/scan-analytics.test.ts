import { expect, it } from "vitest";
import { createAnalytics, type Client } from "./analytics";
import type { ConsentState } from "./consent";
import { SCAN_EVENTS } from "./scan-events";
import { redactPathTokens, redactUrlTokens } from "./url-tokens";
import { scrubAnalyticsEvent, scrubSpeedEvent } from "@/components/site-analytics";
function fixture(initial: ConsentState = "granted") {
  let consent = initial, path = "/account/scan/results/private-photo", loads = 0;
  let sync = () => {}; let before: (event: Record<string, unknown>) => unknown = () => null;
  const captured: unknown[] = [], sent: unknown[] = [];
  const client: Client = { init: (_key, config) => { before = config.before_send as typeof before; }, capture: (event, props) => {
    captured.push({ event, props });
    const packet = before({ event, uuid: "PRIVATE_FAMILY_ID", properties: { ...props, distinct_id: "PRIVATE_FAMILY_ID", $device_id: "PRIVATE_CHILD_ID", $session_id: "PRIVATE_SESSION", $groups: { family: "PRIVATE_FAMILY_ID" }, $current_url: "https://test.invalid/account/scan/results/PRIVATE_PHOTO?token=PRIVATE_TOKEN", $prev_pageview_pathname: "/account/scan/PRIVATE_PHOTO", breadcrumbs: [{ url: "/api/account/scans/PRIVATE_PHOTO/image?x=PRIVATE_TOKEN" }], $set: { name: "PRIVATE_NAME" } }, $set: { name: "PRIVATE_NAME" } });
    if (packet) sent.push(packet);
  }, reset() {}, opt_in_capturing() {}, opt_out_capturing() {} };
  const analytics = createAnalytics({ key: "synthetic-project", sendScan: async (packet) => { sent.push(packet); }, load: async () => { loads++; return client; }, getConsent: () => consent, subscribe: (run) => { sync = run; return () => {}; }, clearStorage() {}, whenIdle: (run) => run(), path: () => path });
  analytics.begin();
  return { analytics, captured, sent, before: (v: Record<string, unknown>) => before(v), loads: () => loads, consent: (v: ConsentState) => { consent = v; sync(); }, path: (v: string) => { path = v; } };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
it("only the fixed event/status pairs enter the consent-bound transport without loading an SDK", async () => {
  const f = fixture(); expect(f.loads()).toBe(0);
  for (const [name, statuses] of Object.entries(SCAN_EVENTS)) for (const status of statuses) f.analytics.track(name, { status });
  await flush();
  expect(f.sent).toHaveLength(13); expect(f.loads()).toBe(0); expect(f.captured).toEqual([]);
  for (const event of f.sent) {
    const packet = event as { event: string; properties: Record<string, unknown> };
    expect(packet.properties).toEqual({ status: expect.any(String), token: "synthetic-project", distinct_id: "scan-anonymous", $process_person_profile: false });
    expect(JSON.stringify(event)).not.toContain("PRIVATE"); expect(Object.keys(packet)).toEqual(["event", "properties"]);
  }
  f.analytics.track("scan_upload_outcome", { status: "raw private error" });
  f.analytics.track("scan_entry", { status: "opened", child: "PRIVATE" });
  f.analytics.track("scan_made_up", { status: "opened" });
  expect(f.sent).toHaveLength(13);
});
it("scan auto-pageviews and Admin calls remain blocked while safe explicit scan events work", async () => {
  const f = fixture(); f.analytics.track("scan_entry", { status: "opened" }); await flush();
  expect(f.before({ event: "$pageview", properties: { $current_url: "https://test.invalid/account/scan/results/PRIVATE" } })).toBeNull();
  f.analytics.track("report_open", { status: "opened" }); expect(f.captured).toHaveLength(0);
  f.path("/admin/scans"); f.analytics.track("scan_entry", { status: "opened" }); expect(f.captured).toHaveLength(0);
  expect(f.before({ event: "scan_entry", properties: { status: "opened" } })).toBeNull();
});
it.each(["unset", "denied"] as const)("%s consent imports and captures nothing and never replays earlier scan actions", async (state) => {
  const f = fixture(state);
  for (const [name, statuses] of Object.entries(SCAN_EVENTS)) f.analytics.track(name, { status: statuses[0] });
  await flush(); expect(f.loads()).toBe(0); expect(f.sent).toEqual([]); expect(f.captured).toEqual([]);
  f.consent("granted"); await flush(); expect(f.sent).toEqual([]); expect(f.captured).toEqual([]);
  f.analytics.track("scan_entry", { status: "opened" }); await flush(); expect(f.sent).toHaveLength(1);
  f.consent("denied"); f.analytics.track("scan_entry", { status: "opened" }); expect(f.sent).toHaveLength(1);
  expect(f.before({ event: "scan_entry", properties: { status: "opened" } })).toBeNull();
});
it("invalid context discards a pending capture before the transport runs", async () => {
  const f = fixture(); let current = true;
  current = false; f.analytics.track("scan_upload_outcome", { status: "saved" }, { current: () => current });
  await flush(); expect(f.captured).toEqual([]); expect(f.sent).toEqual([]);
  f.analytics.track("scan_entry", { status: "opened" }); expect(f.sent).toHaveLength(1);
});
it("canonical, nested, error, escaped and encoded routes lose every scan identifier and query value", () => {
  const raw = "/account/scan/results/PRIVATE_PHOTO?child=PRIVATE_CHILD&x=PRIVATE_QUERY";
  let encoded = raw; const routes = [raw, "/api/account/scans/PRIVATE_PHOTO/image?token=PRIVATE_TOKEN", "/error" + raw, "https://test.invalid/error?next=" + encodeURIComponent(raw), raw.replaceAll("/", "\\/")];
  for (let i = 0; i < 12; i++) { encoded = encodeURIComponent(encoded); routes.push(encoded); }
  for (const route of routes) {
    expect(redactPathTokens(route)).not.toContain("PRIVATE"); expect(redactUrlTokens(route)).not.toContain("PRIVATE");
    expect(scrubAnalyticsEvent({ type: "pageview", url: route })).toBeNull(); expect(scrubSpeedEvent({ type: "vital", url: route })).toBeNull();
  }
});
it("a later public event drops previous scan context and scrubs nested breadcrumbs/error routes", async () => {
  const f = fixture(); f.path("/"); f.analytics.track("cta_click"); await flush();
  const out = f.before({ event: "$pageview", properties: { $current_url: "https://test.invalid/", $prev_pageview_pathname: "/account/scan/PRIVATE_PHOTO", $prev_pageview_duration: 8, nested: { error_url: "https://test.invalid/error?next=%2Faccount%2Fscan%2FPRIVATE_PHOTO&x=PRIVATE_QUERY" } }, breadcrumbs: [{ path: "/api/account/scans/PRIVATE_PHOTO/image?x=PRIVATE_QUERY" }] });
  expect(JSON.stringify(out)).not.toContain("PRIVATE"); expect(JSON.stringify(out)).not.toContain("prev_pageview");
});

it("withdrawal cancels an admitted transport and never retries or replays it", async () => {
  let consent: ConsentState = "granted", notify = () => {}, signal: AbortSignal | undefined, calls = 0;
  const analytics = createAnalytics({ key: "synthetic", load: async () => { throw Error("SDK must stay unloaded"); }, getConsent: () => consent,
    subscribe: (run) => { notify = run; return () => {}; }, whenIdle: (run) => run(), clearStorage() {}, path: () => "/account/scan",
    sendScan: async (_packet, pending) => { calls++; signal = pending; await new Promise<void>((resolve) => pending.addEventListener("abort", () => resolve())); },
  });
  analytics.begin(); analytics.track("scan_entry", { status: "opened" }); expect(calls).toBe(1);
  consent = "denied"; notify(); expect(signal?.aborted).toBe(true); consent = "granted"; notify(); await flush(); expect(calls).toBe(1);
});

it("deeply encoded Admin routes cannot use the explicit scan transport", () => {
  const f = fixture(); let path = "/admin/scans/PRIVATE"; for (let n = 0; n < 12; n++) path = encodeURIComponent(path);
  f.path(path); f.analytics.track("scan_entry", { status: "opened" }); expect(f.sent).toEqual([]); expect(f.loads()).toBe(0);
});
