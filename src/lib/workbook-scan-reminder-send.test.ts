import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmailOnce, type EmailCopy, type EmailMessage, type MailTransport, type SendOptions, type SendResult } from "@/lib/email-delivery";
import { memoryLedger } from "@/lib/email-delivery-memory";
import {
  createWorkbookScanReminderSender, type ScanReminderClaimInput, type ScanReminderHandle,
  type ScanReminderSendInput, type ScanReminderSendStore,
} from "@/lib/workbook-scan-reminder-send";

vi.mock("server-only", () => ({}));

const id = (n: number) => `00000000-0000-0000-0000-${n.toString(16).padStart(12, "0")}`;
const P1 = id(1), P2 = id(2), E1 = id(11), E2 = id(12);
const message = (to = "test@example.invalid"): EmailMessage => ({ sender: { to: "parent" }, to,
  subject: "Synthetic scan reminder", text: "Synthetic text", html: "<p>Synthetic</p>", headers: { "X-Test": "original" } });
const input = (parentId = P1, mail = message()): ScanReminderSendInput => ({ parentId,
  episodeIds: parentId === P1 ? [E1] : [E2], unsubscribeHash: "a".repeat(64), message: mail });
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

type State = "reserved" | "admitted" | "sent" | "refused" | "unknown" | "released";
type Saved = { handle: ScanReminderHandle; state: State };
type Event = { name: string; parentId: string; at: number };

/** A token-checked store seam, not an implementation of due calendars, eligibility or SQL retry policy. */
function fixture() {
  let sequence = 100;
  const rows = new Map<string, Saved>();
  const events: Event[] = [];
  const claims: ScanReminderClaimInput[] = [];
  const copies: { handle: ScanReminderHandle; copy: EmailCopy }[] = [];
  const finishes: { handle: ScanReminderHandle; outcome: SendResult }[] = [];
  const releases: ScanReminderHandle[] = [];
  const requests: { message: EmailMessage; options?: SendOptions; at: number }[] = [];
  const controls = {
    claimAnswer: undefined as unknown,
    admissionAnswer: undefined as unknown,
    claimError: false, admissionError: false, copyError: false, finishError: false, currentError: false,
    releaseError: false, allowRetry: false, loseAdmission: false,
    beforeAdmission: undefined as (() => Promise<void>) | undefined,
    afterCopy: undefined as (() => void) | undefined,
    provider: undefined as ((mail: EmailMessage, options?: SendOptions) => Promise<SendResult>) | undefined,
  };
  const event = (name: string, parentId: string) => events.push({ name, parentId, at: performance.now() });
  const current = (h: ScanReminderHandle, state: State) => {
    const saved = rows.get(h.parentId);
    return saved?.state === state && saved.handle.messageId === h.messageId
      && saved.handle.attemptToken === h.attemptToken && saved.handle.emailLogId === h.emailLogId;
  };
  const store: ScanReminderSendStore = {
    async claim(key) {
      await Promise.resolve();
      claims.push(key);
      event("claim", key.parentId);
      if (controls.claimError) throw new Error("claim response lost");
      if (controls.claimAnswer !== undefined) return controls.claimAnswer;
      const prior = rows.get(key.parentId);
      if (prior && !(prior.state === "refused" && controls.allowRetry)) return { status: "busy" };
      const handle: ScanReminderHandle = { ...key, messageId: prior?.handle.messageId ?? id(sequence++),
        attemptToken: id(sequence++), emailLogId: prior?.handle.emailLogId ?? id(sequence++),
        attempt: (prior?.handle.attempt ?? 0) + 1, childIds: [id(sequence++)] };
      rows.set(key.parentId, { handle, state: "reserved" });
      return { status: "claimed", ...handle };
    },
    async admit(h) {
      event("admit", h.parentId);
      await controls.beforeAdmission?.();
      if (controls.admissionError) throw new Error("admission unavailable");
      if (controls.admissionAnswer !== undefined) {
        if ((controls.admissionAnswer as { status?: string })?.status === "not-due") rows.get(h.parentId)!.state = "released";
        return controls.admissionAnswer;
      }
      if (!current(h, "reserved")) return { status: "stale" };
      rows.get(h.parentId)!.state = "admitted";
      if (controls.loseAdmission) throw new Error("committed admission response lost");
      return { status: "admitted", messageId: h.messageId, attemptToken: h.attemptToken,
        emailLogId: h.emailLogId, episodeIds: [...h.episodeIds] };
    },
    async current(h, state) {
      event(`current:${state}`, h.parentId);
      if (controls.currentError) throw new Error("current row unavailable");
      return current(h, state);
    },
    async keepCopy(h, copy) {
      expect(current(h, "admitted")).toBe(true);
      event("copy", h.parentId);
      if (controls.copyError) throw new Error("copy write failed");
      copies.push({ handle: h, copy });
      controls.afterCopy?.();
    },
    async finish(h, outcome) {
      finishes.push({ handle: h, outcome });
      event("finish", h.parentId);
      if (controls.finishError) throw new Error("finish response lost");
      if (!current(h, "admitted")) return { status: "stale" };
      rows.get(h.parentId)!.state = outcome.status;
      return { status: "recorded" };
    },
    async release(h) {
      releases.push(h);
      if (controls.releaseError) throw new Error("release unavailable");
      if (!current(h, "reserved")) return { status: "stale" };
      rows.get(h.parentId)!.state = "released";
      return { status: "released" };
    },
  };
  const transport: MailTransport = {
    async send(mail, options) {
      requests.push({ message: mail, options, at: performance.now() });
      event("request", mail.to);
      return controls.provider ? controls.provider(mail, options) : { status: "sent", emailId: `provider-${requests.length}` };
    },
  };
  const run = createWorkbookScanReminderSender({ store, transport, gapMs: 100 });
  async function settle<T>(work: Promise<T>): Promise<T> {
    await vi.runAllTimersAsync();
    return work;
  }
  return { run, store, rows, events, claims, copies, finishes, releases, requests, controls, settle };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  vi.stubEnv("EMAIL_FROM", "Synthetic <test@example.invalid>");
  // Any accidental use of the default provider fails, including in an ordinary send.
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network is forbidden"); }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("one scan reminder send coordinator per scheduler run", () => {
  it("paces two parents and an ordinary send together, including a slow first admission", async () => {
    const f = fixture();
    f.controls.beforeAdmission = () => delay(250);
    const ordinary = memoryLedger<string>();
    const all = Promise.all([
      f.run.send(input(P1, message("parent-one@example.invalid"))),
      f.run.send(input(P2, message("parent-two@example.invalid"))),
      sendEmailOnce(ordinary.ledger, "ordinary", message("ordinary@example.invalid"), { transport: f.run.transport }),
    ]);
    expect((await f.settle(all)).map((r) => r.status)).toEqual(["sent", "sent", "sent"]);
    expect(f.requests.map((r) => r.message.to)).toEqual([
      "parent-one@example.invalid", "parent-two@example.invalid", "ordinary@example.invalid",
    ]);
    expect(f.requests.map((r) => r.at)).toEqual([250, 600, 700]);
    expect(f.events.filter((e) => e.name === "admit").map((e) => e.at)).toEqual([0, 350]);
    expect(ordinary.entry("ordinary")?.state).toBe("sent");
  });

  it("serializes provider requests even when the previous response takes longer than the gap", async () => {
    const f = fixture();
    f.controls.provider = async () => { await delay(300); return { status: "sent", emailId: "slow" }; };
    await f.settle(Promise.all([f.run.send(input()), f.run.send(input(P2))]));
    expect(f.requests.map((r) => r.at)).toEqual([0, 300]);
  });

  it("allows only one same-parent concurrent claim and forwards the full set and hash unchanged", async () => {
    const f = fixture(), request = { ...input(), episodeIds: [E1, E2] };
    const outcomes = await f.settle(Promise.all([f.run.send(request), f.run.send(request)]));
    expect(outcomes.map((r) => r.status).sort()).toEqual(["busy", "sent"]);
    expect(f.claims).toEqual(Array.from({ length: 2 }, () => ({ parentId: P1, episodeIds: [E1, E2], unsubscribeHash: "a".repeat(64) })));
    expect(f.requests).toHaveLength(1);
    expect(f.finishes).toHaveLength(1);
  });

  it("binds separate immutable copies when two parents reuse the same message object concurrently", async () => {
    const f = fixture(), shared = message();
    const work = Promise.all([f.run.send(input(P1, shared)), f.run.send(input(P2, shared))]);
    shared.to = "changed@example.invalid";
    shared.sender = { to: "savar" };
    shared.headers!["X-Test"] = "changed";
    expect((await f.settle(work)).map((r) => r.status)).toEqual(["sent", "sent"]);
    expect(f.requests).toHaveLength(2);
    expect(f.requests[0].message).not.toBe(f.requests[1].message);
    for (const request of f.requests) {
      expect(request.message.to).toBe("test@example.invalid");
      expect(request.message.sender).toEqual({ to: "parent" });
      expect(request.message.headers).toEqual({ "X-Test": "original" });
      expect(Object.isFrozen(request.message)).toBe(true);
      expect(Object.isFrozen(request.message.sender)).toBe(true);
      expect(Object.isFrozen(request.message.headers)).toBe(true);
    }
    expect(f.copies.map((c) => c.handle.parentId)).toEqual([P1, P2]);
    expect(f.finishes.map((c) => c.handle.attemptToken)).toEqual(f.copies.map((c) => c.handle.attemptToken));
    expect(f.copies.map((c) => c.copy.message)).toEqual(f.requests.map((r) => r.message));
    // Even a transport that retains the registered object cannot replay its binding through the public transport.
    await f.settle(f.run.transport.send(f.requests[0].message));
    expect(f.requests).toHaveLength(2);
  });

  it.each(["scan", "unsubscribe"])("does not dispatch when %s changes before queued admission", async (reason) => {
    const f = fixture(), gate = deferred(), entered = deferred();
    f.controls.provider = async () => { entered.resolve(); await gate.promise; return { status: "sent", emailId: "ordinary" }; };
    const ordinary = sendEmailOnce(memoryLedger<string>().ledger, "ordinary", message(), { transport: f.run.transport });
    await vi.advanceTimersByTimeAsync(0);
    await entered.promise;
    const scan = f.run.send(input());
    f.controls.admissionAnswer = { status: "not-due", reason };
    gate.resolve();
    const result = await f.settle(Promise.all([ordinary, scan]));
    expect(result[1]).toEqual({ status: "not_sent", reason: "not-due", released: false });
    expect(f.requests).toHaveLength(1);
    expect(f.rows.get(P1)?.state).toBe("released");
    expect(f.releases).toHaveLength(0);
    expect(f.finishes).toHaveLength(0);
    expect(f.copies).toHaveLength(0);
  });

  it.each(["busy", "stale", "unavailable", "refused", "unexpected"])("rejects admission status %s without a provider refusal write", async (status) => {
    const f = fixture();
    f.controls.admissionAnswer = { status };
    expect((await f.settle(f.run.send(input()))).status).toBe("not_sent");
    expect(f.requests).toHaveLength(0);
    expect(f.releases).toHaveLength(0);
    expect(f.finishes).toHaveLength(0);
    expect(f.copies).toHaveLength(0);
    expect(f.rows.get(P1)?.state).toBe("reserved");
  });

  it.each([null, [], {}, { status: "admitted" },
    { status: "admitted", messageId: id(100), attemptToken: id(999), emailLogId: id(102), episodeIds: [E1] },
    { status: "admitted", messageId: id(999), attemptToken: id(101), emailLogId: id(102), episodeIds: [E1] },
    { status: "admitted", messageId: id(100), attemptToken: id(101), emailLogId: id(999), episodeIds: [E1] },
    { status: "admitted", messageId: id(100), attemptToken: id(101), emailLogId: id(102), episodeIds: [E2] },
    { status: "admitted", messageId: id(100), attemptToken: id(101), emailLogId: id(102), episodeIds: [E1, E1] },
  ])("retains the claim on malformed or mismatched admission %#", async (answer) => {
    const f = fixture();
    f.controls.admissionAnswer = answer;
    expect(await f.settle(f.run.send(input()))).toEqual({ status: "not_sent", reason: "admission-unknown", released: false });
    expect(await f.settle(f.run.send(input()))).toEqual({ status: "busy" });
    expect(f.requests).toHaveLength(0);
    expect(f.releases).toHaveLength(0);
    expect(f.finishes).toHaveLength(0);
  });

  it.each([false, true])("retains an unknown admission, including a committed lost reply: %s", async (committed) => {
    const f = fixture(), stop = new AbortController();
    f.controls.admissionError = !committed;
    f.controls.loseAdmission = committed;
    f.controls.beforeAdmission = async () => { stop.abort(); };
    expect(await f.settle(f.run.send({ ...input(), signal: stop.signal }))).toEqual({ status: "not_sent", reason: "admission-unknown", released: false });
    expect(await f.settle(f.run.send(input()))).toEqual({ status: "busy" });
    expect(f.rows.get(P1)?.state).toBe(committed ? "admitted" : "reserved");
    expect(f.requests).toHaveLength(0);
    expect(f.releases).toHaveLength(0);
    expect(f.finishes).toHaveLength(0);
  });

  it.each(["unknown", "throw"])("retains a provider %s outcome without a second request", async (mode) => {
    const f = fixture();
    f.controls.provider = async () => { if (mode === "throw") throw new Error("lost response"); return { status: "unknown", error: "lost response" }; };
    expect((await f.settle(f.run.send(input()))).status).toBe("unknown");
    expect(await f.settle(f.run.send(input()))).toEqual({ status: "busy" });
    expect(f.rows.get(P1)?.state).toBe("unknown");
    expect(f.requests).toHaveLength(1);
    expect(f.finishes[0].outcome.status).toBe("unknown");
    expect(f.copies[0].copy.outcome).toBe("unknown");
    expect(f.copies[0].copy.emailId).toBeNull();
  });

  it("stages refusal until after copy and leaves all retry permission to the store", async () => {
    const f = fixture();
    f.controls.provider = async () => ({ status: "refused", error: "Synthetic 422" });
    expect(await f.settle(f.run.send(input()))).toEqual({ status: "refused", error: "Synthetic 422" });
    expect(f.requests).toHaveLength(1);
    expect(f.events.filter((e) => ["copy", "finish"].includes(e.name)).map((e) => e.name)).toEqual(["copy", "finish"]);
    expect(await f.settle(f.run.send(input()))).toEqual({ status: "busy" });
    f.controls.allowRetry = true;
    expect((await f.settle(f.run.send(input()))).status).toBe("refused");
    expect(f.requests).toHaveLength(2);
    expect(f.finishes[0].handle.attemptToken).not.toBe(f.finishes[1].handle.attemptToken);
    expect(f.finishes[0].handle.emailLogId).toBe(f.finishes[1].handle.emailLogId);
    expect(f.releases).toHaveLength(0);
  });

  it("releases a cancelled queued reservation before the earlier provider response arrives", async () => {
    const f = fixture(), gate = deferred(), entered = deferred(), claimed = deferred();
    f.controls.provider = async () => { entered.resolve(); await gate.promise; return { status: "sent", emailId: "ordinary" }; };
    const ordinary = sendEmailOnce(memoryLedger<string>().ledger, "ordinary", message(), { transport: f.run.transport });
    await vi.advanceTimersByTimeAsync(0);
    await entered.promise;
    const originalClaim = f.store.claim;
    f.store.claim = async (key) => { const result = await originalClaim(key); claimed.resolve(); return result; };
    const stop = new AbortController();
    const scan = f.run.send({ ...input(), signal: stop.signal });
    await claimed.promise;
    stop.abort();
    expect(await scan).toEqual({ status: "not_sent", reason: "cancelled", released: true });
    expect(f.releases).toHaveLength(1);
    expect(f.events.filter((e) => e.name === "admit")).toHaveLength(0);
    expect(f.finishes).toHaveLength(0);
    gate.resolve();
    await f.settle(ordinary);
    expect(f.requests).toHaveLength(1);
  });

  it("does not recall dispatch when cancellation occurs during confirmed admission", async () => {
    const f = fixture(), stop = new AbortController();
    f.controls.beforeAdmission = async () => { stop.abort(); };
    expect((await f.settle(f.run.send({ ...input(), signal: stop.signal }))).status).toBe("sent");
    expect(f.requests[0].options).toBeUndefined();
    expect(f.rows.get(P1)?.state).toBe("sent");
    expect(f.releases).toHaveLength(0);
  });

  it("keeps an admitted request running when cancellation occurs during the provider request", async () => {
    const f = fixture(), stop = new AbortController(), entered = deferred(), gate = deferred();
    f.controls.provider = async (_mail, options) => {
      expect(options).toBeUndefined();
      entered.resolve();
      await gate.promise;
      return { status: "unknown", error: "Provider response lost" };
    };
    const scan = f.run.send({ ...input(), signal: stop.signal });
    await entered.promise;
    stop.abort();
    expect(f.finishes).toHaveLength(0);
    expect(f.releases).toHaveLength(0);
    gate.resolve();
    expect(await f.settle(scan)).toEqual({ status: "unknown", error: "Provider response lost" });
    expect(f.rows.get(P1)?.state).toBe("unknown");
  });

  it("can cancel during the extra gap after a slow admission without another admission", async () => {
    const f = fixture(), stop = new AbortController();
    f.controls.beforeAdmission = () => delay(250);
    const first = f.run.send(input()), queued = f.run.send({ ...input(P2), signal: stop.signal });
    await vi.advanceTimersByTimeAsync(260);
    stop.abort();
    expect(await f.settle(queued)).toEqual({ status: "not_sent", reason: "cancelled", released: true });
    expect((await first).status).toBe("sent");
    expect(f.events.filter((e) => e.name === "admit").map((e) => e.parentId)).toEqual([P1]);
    expect(f.requests).toHaveLength(1);
  });

  it.each(["stale", "release-error", "current-error"])("retains a cancelled reservation when release is unsafe: %s", async (mode) => {
    const f = fixture(), stop = new AbortController(), claimed = deferred();
    const original = f.store.claim;
    f.store.claim = async (key) => { const result = await original(key); claimed.resolve(); return result; };
    const ordinary = f.run.transport.send(message());
    const scan = f.run.send({ ...input(), signal: stop.signal });
    await claimed.promise;
    if (mode === "stale") {
      const saved = f.rows.get(P1)!;
      saved.handle = { ...saved.handle, attemptToken: id(999) };
    }
    f.controls.releaseError = mode === "release-error";
    f.controls.currentError = mode === "current-error";
    stop.abort();
    expect(await f.settle(scan)).toEqual({ status: "not_sent", reason: "cancelled", released: false });
    await ordinary;
    expect(f.releases).toHaveLength(mode === "release-error" ? 1 : 0);
    expect(f.finishes).toHaveLength(0);
    expect(f.rows.get(P1)?.state).toBe("reserved");
    expect(f.requests).toHaveLength(1);
  });

  it.each(["before-copy", "during-copy"])("skips obsolete token writes %s", async (when) => {
    const f = fixture();
    const replace = () => { const saved = f.rows.get(P1)!; saved.handle = { ...saved.handle, attemptToken: id(999) }; };
    if (when === "before-copy") f.controls.provider = async () => { replace(); return { status: "sent", emailId: "accepted" }; };
    else f.controls.afterCopy = replace;
    expect((await f.settle(f.run.send(input()))).status).toBe("sent");
    expect(f.copies).toHaveLength(when === "before-copy" ? 0 : 1);
    expect(f.finishes).toHaveLength(0);
    expect(f.releases).toHaveLength(0);
  });

  it.each(["sent", "refused", "unknown"] as const)("still finalizes %s if copy storage fails", async (status) => {
    const f = fixture();
    f.controls.copyError = true;
    f.controls.provider = async () => status === "sent" ? { status, emailId: "accepted" } : { status, error: "Synthetic result" };
    expect((await f.settle(f.run.send(input()))).status).toBe(status);
    expect(f.finishes).toHaveLength(1);
    expect(f.rows.get(P1)?.state).toBe(status);
    expect(f.events.filter((e) => ["copy", "finish"].includes(e.name)).map((e) => e.name)).toEqual(["copy", "finish"]);
  });

  it.each(["current", "finish"])("keeps the admitted claim on a %s error and returns the provider result", async (mode) => {
    const f = fixture();
    f.controls.currentError = mode === "current";
    f.controls.finishError = mode === "finish";
    expect((await f.settle(f.run.send(input()))).status).toBe("sent");
    expect(await f.settle(f.run.send(input()))).toEqual({ status: "busy" });
    expect(f.rows.get(P1)?.state).toBe("admitted");
    expect(f.requests).toHaveLength(1);
    expect(f.releases).toHaveLength(0);
  });

  it.each(["busy", "set-changed", "refresh-required", "unsubscribed", "unavailable", "malformed", "error"])("does not admit after claim %s", async (status) => {
    const f = fixture();
    f.controls.claimError = status === "error";
    f.controls.claimAnswer = status === "malformed" ? { status: "claimed" } : { status };
    const result = await f.settle(f.run.send(input()));
    expect(result.status).toBe(status === "busy" ? "busy" : "not_sent");
    expect(f.requests).toHaveLength(0);
    expect(f.events.filter((e) => e.name === "admit")).toHaveLength(0);
    expect(f.finishes).toHaveLength(0);
    expect(f.releases).toHaveLength(0);
  });

  it("rejects a malformed claimed full set and does not release a claim with an uncertain identity", async () => {
    const f = fixture();
    f.controls.claimAnswer = { status: "claimed", messageId: id(100), attemptToken: id(101), emailLogId: id(102),
      attempt: 1, episodeIds: [E2], childIds: [id(30)] };
    expect(await f.settle(f.run.send(input()))).toEqual({ status: "not_sent", reason: "claim-unknown", released: false });
    expect(f.requests).toHaveLength(0);
    expect(f.releases).toHaveLength(0);
  });

  it("snapshots claim fields before awaiting the store and rejects invalid input before any claim", async () => {
    const f = fixture(), request = { ...input(), episodeIds: [E1] };
    const work = f.run.send(request);
    request.parentId = P2;
    request.episodeIds = [E2];
    request.unsubscribeHash = "b".repeat(64);
    expect((await f.settle(work)).status).toBe("sent");
    expect(f.claims).toEqual([{ parentId: P1, episodeIds: [E1], unsubscribeHash: "a".repeat(64) }]);
    expect(f.finishes[0].handle.parentId).toBe(P1);
    for (const bad of [{ ...input(), episodeIds: [E1, E1] }, { ...input(), unsubscribeHash: "short" },
      { ...input(), parentId: "not-a-uuid" }]) {
      expect(await f.run.send(bad)).toEqual({ status: "not_sent", reason: "invalid-input", released: false });
    }
    const stop = new AbortController();
    stop.abort();
    expect(await f.run.send({ ...input(), signal: stop.signal })).toEqual({ status: "not_sent", reason: "cancelled", released: false });
    expect(f.claims).toHaveLength(1);
  });

  it("preserves ordinary refusal, unknown, options and synchronous time checks", async () => {
    const f = fixture(), stop = new AbortController();
    f.controls.provider = async () => ({ status: "refused", error: "ordinary refused" });
    const book = memoryLedger<string>();
    expect(await f.settle(sendEmailOnce(book.ledger, "normal", message(), { transport: f.run.transport })))
      .toEqual({ status: "refused", error: "ordinary refused" });
    expect(book.entry("normal")?.state).toBe("refused");
    f.controls.provider = async () => ({ status: "unknown", error: "ordinary unknown" });
    expect(await f.settle(sendEmailOnce(book.ledger, "other", message(), { transport: f.run.transport })))
      .toEqual({ status: "unknown", error: "ordinary unknown" });
    const mayStart = () => true;
    await f.settle(f.run.transport.send(message(), { signal: stop.signal, mayStart }));
    expect(f.requests.at(-1)?.options).toEqual({ signal: stop.signal, mayStart });
    expect(await f.settle(f.run.transport.send(message(), { mayStart: () => false })))
      .toEqual({ status: "refused", error: "The send did not start: the time ran out" });
    expect(f.requests).toHaveLength(3);
    expect(f.claims).toHaveLength(0);
  });
});
