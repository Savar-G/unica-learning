// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { recordActivity } from "@/lib/customer-activity-client";
import { setConsent } from "@/lib/consent";
const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); document.cookie = "unica_activity_consent=; Max-Age=0; Path=/"; vi.stubGlobal("fetch", fetcher); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); localStorage.clear(); });
it("sends nothing when consent is absent or denied; a later grant does not replay", () => {
  recordActivity("page_visit", "home"); setConsent("denied"); recordActivity("scanner_opened", "scanner");
  expect(fetcher).not.toHaveBeenCalled(); setConsent("granted"); expect(fetcher).not.toHaveBeenCalled();
});
it("sends a bounded fixed event and an owned reference, with no page address or text", async () => {
  setConsent("granted"); const child = "00000000-0000-4000-8000-000000000001";
  recordActivity("scanner_opened", "scanner", child);
  expect(fetcher).toHaveBeenCalledOnce();
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/account/activity");
  expect(Object.keys(JSON.parse(String(init.body))).sort()).toEqual(["book", "child", "event", "page", "request"]);
  expect(JSON.parse(String(init.body))).toMatchObject({ child, book: null, event: "scanner_opened" });
  expect(document.cookie).toContain("unica_activity_consent=granted");
});
it("revocation cancels an in-flight request and updates the receiving cookie", async () => {
  let signal: AbortSignal | undefined;
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => { signal = init.signal as AbortSignal; await new Promise<void>(resolve => signal!.addEventListener("abort", () => resolve())); return new Response(null, { status: 204 }); });
  setConsent("granted"); recordActivity("page_visit", "home"); expect(signal?.aborted).toBe(false);
  setConsent("denied"); expect(signal?.aborted).toBe(true); expect(document.cookie).toContain("unica_activity_consent=denied");
  recordActivity("page_visit", "home");
});
it("telemetry transport failure does not throw into the product workflow", () => {
  setConsent("granted"); vi.stubGlobal("fetch", () => { throw new Error("offline"); });
  expect(() => recordActivity("page_visit", "home")).not.toThrow();
});
