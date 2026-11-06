// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { createAnalytics, type Client } from "./analytics";
// The installed SDK supplies default properties. Browser transports are synthetic and cannot reach a service.
afterEach(() => { vi.unstubAllGlobals(); });
it("the installed PostHog SDK cannot restore family, session or previous-page identifiers after before_send", async () => {
  let initializationError: unknown;
  class Xhr {
    withCredentials = false; readyState = 4; status = 200; responseText = "{}";
    onreadystatechange: (() => void) | null = null;
    open() {} setRequestHeader() {} getAllResponseHeaders() { return ""; }
    send() { this.onreadystatechange?.(); } abort() {}
  }
  vi.stubGlobal("XMLHttpRequest", Xhr);
  vi.stubGlobal("fetch", async () => Response.json({}));
  const { PostHog } = await import("posthog-js");
  const sdk = new PostHog(), packets: unknown[] = [], scanPackets: unknown[] = []; const current = { path: "/" };
  const client: Client = {
    init: (key, config) => { try { return sdk.init(key, { ...config, api_host: "https://synthetic.invalid", persistence: "memory", request_batching: false, disable_external_dependency_loading: true, capture_pageview: false, opt_out_useragent_filter: true, bootstrap: { distinctID: "PRIVATE_BOOTSTRAP", isIdentifiedID: true } }); } catch (error) { initializationError = error; throw error; } },
    capture: (event, props) => { const packet = sdk.capture(event, props); if (packet) packets.push(packet); return packet; },
    reset: (reset) => sdk.reset(reset), opt_in_capturing: (options) => sdk.opt_in_capturing(options), opt_out_capturing: () => sdk.opt_out_capturing(),
  };
  const analytics = createAnalytics({ key: "synthetic-project", sendScan: async (packet) => { scanPackets.push(packet); }, load: async () => client, getConsent: () => "granted", subscribe: () => () => {}, clearStorage() {}, whenIdle: (run) => run(), path: () => current.path });
  analytics.begin(); await new Promise((resolve) => setTimeout(resolve, 0)); current.path = "/account/scan/results/PRIVATE_PHOTO";
  analytics.track("scan_entry", { status: "opened" });
  expect(initializationError).toBeUndefined(); expect(sdk.is_capturing()).toBe(true);
  sdk.register({ distinct_id: "PRIVATE_FAMILY", $device_id: "PRIVATE_DEVICE", $session_id: "PRIVATE_SESSION", $prev_pageview_pathname: "/account/scan/PRIVATE_PHOTO", $groups: { family: "PRIVATE_FAMILY" } });
  analytics.track("scan_upload_outcome", { status: "saved" });
  expect(packets).toEqual([]); expect(scanPackets).toHaveLength(2);
  expect(sdk.capture("scan_entry", { status: "opened" })).toBeUndefined();
  expect(JSON.stringify(scanPackets)).not.toContain("PRIVATE");
  for (const packet of scanPackets as { properties: Record<string, unknown> }[]) expect(packet.properties).toEqual({ status: expect.any(String), token: "synthetic-project", distinct_id: "scan-anonymous", $process_person_profile: false });
  // The public SDK capture is rejected after its defaults are added. Only the separate fixed transport can send scan events.
  expect(sdk.capture("$pageview", { $current_url: "https://test.invalid/account/scan/results/PRIVATE" })).toBeUndefined();
  sdk.opt_out_capturing(); await sdk.shutdown();
});
