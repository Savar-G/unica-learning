import { afterEach, describe, expect, it, vi } from "vitest";
import { replaySwitch, type ReplayHandle } from "@/lib/sentry-replay";

const ORIGIN = "https://unicalearning.com";

function setup(o: { consent?: boolean; path?: string; random?: number } = {}) {
  let consent = o.consent ?? true, href = ORIGIN + (o.path ?? "/pricing");
  let mode: "buffer" | "session" | undefined;
  let listener: (() => void) | null = null;
  const handle = {
    startBuffering: vi.fn(() => { mode = "buffer"; }),
    stop: vi.fn(async () => { mode = undefined; }),
    flush: vi.fn<(o?: { continueRecording?: boolean }) => Promise<void>>(async () => {}),
    getRecordingMode: () => mode,
  } satisfies ReplayHandle;
  const load = vi.fn(async () => { mode = "buffer"; return handle; });
  const sw = replaySwitch({ consented: () => consent, subscribe: (fn) => { listener = fn; return () => { listener = null; }; }, href: () => href, load, random: () => o.random ?? 0.1 });
  return {
    sw, handle, load,
    mode: () => mode,
    setConsent: async (v: boolean) => { consent = v; listener?.(); await new Promise((r) => setTimeout(r, 0)); },
    setHref: (path: string) => { href = ORIGIN + path; },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => { vi.useRealTimers(); });

describe("replaySwitch", () => {
  it("loads nothing before consent", async () => {
    const t = setup({ consent: false });
    t.sw.start();
    await t.sw.check();
    expect(t.load).not.toHaveBeenCalled();
  });

  it.each(["/tutor", "/account/test/abc", "/sign-in/link?t=abc123", "/thank-you?session_id=cs_1"])("loads nothing on %s, even with consent", async (path) => {
    const t = setup({ path });
    await t.sw.check();
    expect(t.load).not.toHaveBeenCalled();
  });

  it("buffers on an allowed page after consent, also with ad tags", async () => {
    const t = setup({ consent: false, path: "/?utm_source=meta&utm_campaign=bc" });
    t.sw.start();
    await t.setConsent(true);
    expect(t.load).toHaveBeenCalledTimes(1);
    expect(t.mode()).toBe("buffer");
  });

  it("stops without sending on a move to a blocked page, and stays off after the move back", async () => {
    const t = setup();
    await t.sw.check();
    await t.sw.check(`${ORIGIN}/admin`);
    expect(t.handle.stop).toHaveBeenCalledWith({ flush: false });
    expect(t.mode()).toBeUndefined();
    // The admin page is still on screen when the move back starts: no new buffer in this document.
    await t.sw.check(`${ORIGIN}/account`);
    expect(t.handle.startBuffering).not.toHaveBeenCalled();
    expect(t.mode()).toBeUndefined();
  });

  it("reads the whole address on a move: a QR page in a query blocks it", async () => {
    const t = setup();
    await t.sw.check();
    await t.sw.check(`${ORIGIN}/sign-in?next=%2Ftutor%2Fp%2Fabc`);
    expect(t.handle.stop).toHaveBeenCalledWith({ flush: false });
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
    t.setHref("/admin");
    await pending;
    expect(t.handle.stop).toHaveBeenCalledWith({ flush: false });
  });

  it("on a sampled error sends the buffer once, then starts a new buffer: never a whole-visit recording", async () => {
    const t = setup({ random: 0.1 });
    await t.sw.check();
    expect(t.sw.onError()).toBe(false);
    await tick(); await tick();
    expect(t.handle.flush).toHaveBeenCalledWith({ continueRecording: false });
    expect(t.handle.stop).toHaveBeenCalledWith({ flush: false });
    expect(t.handle.startBuffering).toHaveBeenCalledTimes(1);
    expect(t.mode()).toBe("buffer");
  });

  it("sends nothing for an error outside the sample, or on a blocked page", async () => {
    const t = setup({ random: 0.9 });
    await t.sw.check();
    expect(t.sw.onError()).toBe(false);
    await tick();
    expect(t.handle.flush).not.toHaveBeenCalled();
    const b = setup({ random: 0.1 });
    await b.sw.check();
    await b.sw.check(`${ORIGIN}/tutor`);
    expect(b.sw.onError()).toBe(false);
    await tick();
    expect(b.handle.flush).not.toHaveBeenCalled();
  });
});
