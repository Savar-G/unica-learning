import { describe, expect, it, vi } from "vitest";
import { replaySwitch, type ReplayHandle } from "@/lib/sentry-replay";

function setup(o: { consent?: boolean; path?: string } = {}) {
  let consent = o.consent ?? true, path = o.path ?? "/pricing";
  let mode: "buffer" | undefined;
  let listener: (() => void) | null = null;
  const handle: ReplayHandle = {
    startBuffering: vi.fn(() => { mode = "buffer"; }),
    stop: vi.fn(async () => { mode = undefined; }),
    getRecordingMode: () => mode,
  };
  const load = vi.fn(async () => { mode = "buffer"; return handle; });
  const sw = replaySwitch({ consented: () => consent, subscribe: (fn) => { listener = fn; return () => { listener = null; }; }, path: () => path, load });
  return {
    sw, handle, load,
    mode: () => mode,
    setConsent: async (v: boolean) => { consent = v; listener?.(); await new Promise((r) => setTimeout(r, 0)); },
    setPath: (p: string) => { path = p; },
  };
}

describe("replaySwitch", () => {
  it("loads nothing before consent", async () => {
    const t = setup({ consent: false });
    t.sw.start();
    await t.sw.check();
    expect(t.load).not.toHaveBeenCalled();
  });

  it("loads nothing on a child page, even with consent", async () => {
    const t = setup({ path: "/tutor" });
    await t.sw.check();
    expect(t.load).not.toHaveBeenCalled();
    expect(t.sw.mayAttach()).toBe(false);
  });

  it("buffers on an allowed page after consent", async () => {
    const t = setup({ consent: false });
    t.sw.start();
    await t.setConsent(true);
    expect(t.load).toHaveBeenCalledTimes(1);
    expect(t.mode()).toBe("buffer");
    expect(t.sw.mayAttach()).toBe(true);
  });

  it("stops without sending when the visitor moves to a child page, and starts again on the way back", async () => {
    const t = setup();
    await t.sw.check();
    await t.sw.check("/account/test/abc");
    expect(t.handle.stop).toHaveBeenCalledWith({ flush: false });
    expect(t.mode()).toBeUndefined();
    expect(t.sw.mayAttach()).toBe(false);
    await t.sw.check("/account");
    expect(t.handle.startBuffering).toHaveBeenCalledTimes(1);
    expect(t.load).toHaveBeenCalledTimes(1);
  });

  it("stops without sending when consent is withdrawn", async () => {
    const t = setup();
    t.sw.start();
    await t.sw.check();
    await t.setConsent(false);
    expect(t.handle.stop).toHaveBeenCalledWith({ flush: false });
  });

  it("stops at once when the page changed while the code loaded", async () => {
    const t = setup();
    const pending = t.sw.check();
    t.setPath("/admin");
    await pending;
    expect(t.handle.stop).toHaveBeenCalledWith({ flush: false });
  });
});
