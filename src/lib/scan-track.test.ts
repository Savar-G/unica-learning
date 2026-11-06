// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ loads: 0, captures: [] as unknown[], config: {} as Record<string, unknown> }));
vi.mock("posthog-js", () => { fake.loads++; return { default: { init: (_key: string, config: Record<string, unknown>) => { fake.config = config; }, capture: (event: string, props: unknown) => { const send = fake.config.before_send as (v: unknown) => unknown; const packet = send({ event, properties: { ...(props as object), distinct_id: "PRIVATE_FAMILY", $current_url: location.href, $session_id: "PRIVATE_SESSION" } }); if (packet) fake.captures.push(packet); }, reset() {}, opt_in_capturing() {}, opt_out_capturing() {} } }; });
import { track } from "./track";
import { setConsent } from "./consent";
import { scanEventTicket } from "./scan-track";
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
beforeEach(() => { localStorage.clear(); vi.stubGlobal("fetch", async (_path: string, init: RequestInit) => { fake.captures.push(JSON.parse(String(init.body))); expect(init.credentials).toBe("omit"); expect(init.referrerPolicy).toBe("no-referrer"); return Response.json({}); }); vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "synthetic-project"); window.history.replaceState({}, "", "/account/scan/results/PRIVATE_PHOTO?child=PRIVATE_CHILD"); (globalThis as { __unicaAnalytics?: unknown }).__unicaAnalytics = null; fake.captures = []; });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("public tracking drops denied actions and does not pass scan events to debug or ad transports", async () => {
  const log = vi.spyOn(console, "info");
  setConsent("denied"); track("scan_entry", { status: "opened", name: "PRIVATE" }); await flush(); expect(fake.captures).toEqual([]); expect(log).not.toHaveBeenCalled();
  setConsent("granted"); track("scan_entry", { status: "opened" }); await flush();
  expect(fake.captures).toHaveLength(1); expect(fake.loads).toBe(0); expect(JSON.stringify(fake.captures)).not.toContain("PRIVATE"); log.mockRestore();
});
it("an outcome begun without consent cannot replay after consent arrives", async () => {
  setConsent("denied"); const emit = scanEventTicket(); setConsent("granted"); emit("scan_upload_outcome", "saved"); await flush(); expect(fake.captures).toEqual([]);
});
it("withdrawal and account/context replacement invalidate in-flight outcomes", async () => {
  setConsent("granted"); const oldConsent = scanEventTicket(); setConsent("denied"); setConsent("granted"); oldConsent("scan_review_complete", "completed");
  let current = true; const oldAccount = scanEventTicket(() => current); current = false; oldAccount("scan_upload_outcome", "saved"); await flush(); expect(fake.captures).toEqual([]);
});

it("public tracking aborts a pending anonymous transport when consent is withdrawn", async () => {
  let signal: AbortSignal | undefined;
  vi.stubGlobal("fetch", async (_path: string, init: RequestInit) => { signal = init.signal as AbortSignal; await new Promise<void>((resolve) => signal!.addEventListener("abort", () => resolve())); return Response.json({}); });
  setConsent("granted"); track("scan_entry", { status: "opened" }); expect(signal?.aborted).toBe(false);
  setConsent("denied"); expect(signal?.aborted).toBe(true); await flush(); expect(fake.captures).toEqual([]);
});
