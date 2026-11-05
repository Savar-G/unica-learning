import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { pacedTransport } from "@/lib/email-delivery";
import { resendTransport } from "@/lib/email-resend";
import { SWEEP_END_MS, sweepCardsNow } from "@/lib/card-sweep-server";

vi.mock("server-only", () => ({}));

// One sweep row could take 77 seconds: the guards limited only when rows and writes start. Here the whole sweep runs through the real
// Supabase client, the real Stripe SDK and the real Resend adapter, over one network with the slowest answers each one's own time limit
// allows. Every request must end at the sweep's end, with the row's state safe for the next run.

const CARD = "00000000-0000-4000-8000-000000000001";
const FIRST_CHARGE = new Date(1_900_000_000_000).toISOString();
/** The slowest answers that stay inside each client's own limit: Stripe's read 4 s, Stripe's write and Resend's send 15 s. */
const SLOW = { db: 500, stripeRead: 3_900, stripeWrite: 14_900, resend: 14_900 };

interface Net {
  /** Each request: where it went, and when it ended, from the start of the run. */
  log: { what: string; startedAt: number; endedAt: number | null; aborted: boolean }[];
  delays: typeof SLOW;
  row: Record<string, unknown>;
  customerDefault: string;
  plans: Record<string, unknown>[];
  rpcs: { name: string; body: Record<string, unknown> }[];
  emails: number;
  /** Slow answers by a part of the request's name, in milliseconds. */
  slow?: Record<string, number>;
  /** The send ledger's claims by key, kept across runs. A sent claim is never given again. */
  claims?: Map<string, string>;
}

const started = Date.UTC(2026, 10, 5, 19);
const wait = (ms: number, signal: AbortSignal | null | undefined, entry: Net["log"][number]) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => { entry.endedAt = Date.now() - started; resolve(); }, ms);
  signal?.addEventListener("abort", () => { clearTimeout(timer); entry.aborted = true; entry.endedAt = Date.now() - started; reject(signal.reason); }, { once: true });
});

function network(net: Net) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const text = init?.body ? String(init.body) : "";
    // A real fetch with a stopped signal reaches no network.
    if (signal?.aborted) throw signal.reason;
    const entry = { what: `${method} ${url.host}${url.pathname}`, startedAt: Date.now() - started, endedAt: null as number | null, aborted: false };
    net.log.push(entry);
    if (url.host === "api.resend.com") {
      await wait(net.delays.resend, signal, entry);
      net.emails++;
      return Response.json({ id: "email-1" });
    }
    if (url.host === "api.stripe.com") {
      await wait(method === "GET" ? net.delays.stripeRead : net.delays.stripeWrite, signal, entry);
      const body = new URLSearchParams(text);
      if (method === "POST" && url.pathname.startsWith("/v1/customers/")) net.customerDefault = body.get("invoice_settings[default_payment_method]")!;
      if (method === "POST" && url.pathname.startsWith("/v1/subscriptions/")) net.plans[0].default_payment_method = body.get("default_payment_method");
      if (url.pathname === "/v1/subscriptions") return Response.json({ object: "list", has_more: false, data: net.plans });
      if (url.pathname.startsWith("/v1/customers/")) return Response.json({ id: "cus_1", invoice_settings: { default_payment_method: net.customerDefault } });
      return Response.json({ id: "sub_1" });
    }
    await wait(Object.entries(net.slow ?? {}).find(([part]) => url.pathname.endsWith(part))?.[1] ?? net.delays.db, signal, entry);
    const rpc = url.pathname.match(/\/rpc\/(.+)$/)?.[1];
    if (rpc) {
      net.rpcs.push({ name: rpc, body: JSON.parse(text || "{}") });
      if (rpc === "card_recovery_rows") return Response.json([net.row]);
      if (rpc === "settle_card_update") return Response.json({ state: "flagged" });
      const body = JSON.parse(text || "{}");
      // The ledger's rule in both functions: one claim per key, and a claim given back may be taken again.
      if (rpc === "claim_workbook_email" || rpc === "claim_plan_start_email") {
        const key = rpc === "claim_workbook_email" ? `${body.p_card_setup_id}:${body.p_kind}:${body.p_workbook_number}` : `${body.p_card}:plan_start:${body.p_generation}`;
        if (net.claims?.has(key)) return Response.json(rpc === "claim_workbook_email" ? [] : false);
        net.claims?.set(key, "sending");
        return Response.json(rpc === "claim_workbook_email" ? [{ id: "e1", claim_token: "t1" }] : true);
      }
      if (rpc === "release_plan_start_email") { net.claims?.delete(`${body.p_card}:plan_start:${body.p_generation}`); return Response.json(true); }
      return Response.json(true);
    }
    if (url.pathname.endsWith("/card_setups")) return Response.json(method === "GET" && url.searchParams.get("select")?.includes("price") ? { plan: "one", price: 79.99 } : { parent_id: "p", child_id: "c" });
    if (url.pathname.endsWith("/parents")) return Response.json({ name: "Priya", email: "priya@family.ca", postal: "V3S 1A1", time_zone: null });
    if (url.pathname.endsWith("/children")) return Response.json({ first_name: "Leah", province: "BC" });
    return Response.json([]);
  };
}

const family = (overrides: Partial<Net> = {}): Net => ({
  log: [], delays: { ...SLOW }, customerDefault: "pm_old", rpcs: [], emails: 0,
  plans: [{ id: "sub_1", status: "trialing", default_payment_method: "pm_old", metadata: { start_key: "key-1" }, trial_end: 1_900_000_000 }],
  row: {
    card_id: CARD, customer: "cus_1", session_id: "cs_1", payment_method_id: "pm_new", needs_repair: true,
    start_generation: 1, start_key: "key-1", start_card: "pm_old", start_at: new Date(started - 3_600_000).toISOString(), start_state: "open",
    start_subscription: null, start_first_charge: null, start_finished_at: null, start_email: "none", start_alert: null,
  },
  ...overrides,
});

/** Runs one sweep to its end with the clock moving, and answers the result and when it came. */
async function run(net: Net, { at = started, elapsed = 0 }: { at?: number; elapsed?: number } = {}) {
  vi.setSystemTime(at);
  vi.stubGlobal("fetch", network(net));
  const transport = pacedTransport(resendTransport(), 600);
  let endedAt: number | null = null;
  const answer = sweepCardsNow({ origin: "https://unicalearning.com", startedAt: at - elapsed, transport }).then((r) => { endedAt = Date.now() - at + elapsed; return r; });
  for (let i = 0; i < 400 && endedAt === null; i++) await vi.advanceTimersByTimeAsync(500);
  // Whatever a cut-off row left behind has its moment too.
  await vi.advanceTimersByTimeAsync(5_000);
  return { result: await answer, endedAt: endedAt as unknown as number };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "performance"], now: started });
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_sweep");
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("EMAIL_FROM", "Unica Learning <contact@unicalearning.com>");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("the end is well inside the route's 60-second limit", () => {
  expect(SWEEP_END_MS).toBe(45_000);
});

it("one row with every step at its slowest (about 77 seconds without a deadline) ends at 45 seconds, and no request outlives it", async () => {
  const net = family();
  const { result, endedAt } = await run(net);
  expect(endedAt).toBeLessThanOrEqual(SWEEP_END_MS);
  expect(result).toMatchObject({ due: 1, failed: 1, outOfTime: true });
  for (const request of net.log) {
    expect(request.endedAt, request.what).not.toBeNull();
    expect(request.endedAt!, request.what).toBeLessThanOrEqual(SWEEP_END_MS);
  }
  expect(net.log.some((r) => r.aborted)).toBe(true);
});

it("a row started near 25 seconds starts no write and no email after 30, and its record and flag are safe for the next run", async () => {
  const net = family();
  const { result, endedAt } = await run(net, { elapsed: 24_000 });
  expect(endedAt).toBeLessThanOrEqual(SWEEP_END_MS);
  expect(result).toMatchObject({ due: 1, checked: 1, failed: 1 });
  expect(net.log.filter((r) => r.what.startsWith("POST api.stripe.com") || r.what.includes("api.resend.com"))).toEqual([]);
  expect(net.rpcs).toContainEqual({ name: "settle_card_update", body: { p_card: CARD, p_session: "cs_1", p_confirmed: false } });
  expect(net.emails).toBe(0);
});

it("a read that hangs is cut at 45 seconds, and the run answers instead of failing at the route's limit", async () => {
  const net = family({ delays: { ...SLOW, db: 600_000 } });
  const { result, endedAt } = await run(net);
  expect(endedAt).toBe(SWEEP_END_MS);
  expect(result).toEqual({ error: "run_failed" });
});

it("a cut-off row leaves its state safe, and the next run finishes it with one email and one plan", async () => {
  const net = family();
  await run(net);
  const firstFinish = net.rpcs.filter((r) => r.name === "finish_plan_start").length;
  // The next run has a quick network, and reads the same row: its Stripe state as the first run left it.
  const next = family({ row: net.row, plans: net.plans, customerDefault: net.customerDefault, delays: { db: 1, stripeRead: 1, stripeWrite: 1, resend: 1 } });
  const { result, endedAt } = await run(next, { at: started + 900_000 });
  expect(result).toMatchObject({ due: 1, plans: 1, emails: 1, failed: 0, outOfTime: false });
  expect(endedAt).toBeLessThan(5_000);
  expect(next.customerDefault).toBe("pm_new");
  expect(next.plans[0].default_payment_method).toBe("pm_new");
  expect(next.emails).toBe(1);
  expect(next.log.filter((r) => r.what === "POST api.stripe.com/v1/subscriptions")).toEqual([]);
  expect(firstFinish).toBe(0);
});

it("every call of the sweep uses the deadline: Supabase, Stripe and Resend all stop at it", async () => {
  // Each kind on its own: a network that answers at once except that one kind, which hangs.
  for (const [kind, delays] of [
    ["Stripe", { db: 1, stripeRead: 600_000, stripeWrite: 1, resend: 1 }],
    ["Supabase", { db: 600_000, stripeRead: 1, stripeWrite: 1, resend: 1 }],
  ] as const) {
    const net = family({ delays });
    const { endedAt } = await run(net);
    expect(endedAt, kind).toBeLessThanOrEqual(SWEEP_END_MS);
  }
});

it("a pending email goes on the shared transport inside the sweep's time, with nothing else to do for the row", async () => {
  const net = family({ customerDefault: "pm_new", plans: [{ id: "sub_1", status: "trialing", default_payment_method: "pm_new", metadata: { start_key: "key-1" }, trial_end: 1_900_000_000 }] });
  net.row = { ...net.row, start_state: "started", start_subscription: "sub_1", start_first_charge: FIRST_CHARGE, start_finished_at: new Date(started - 3_600_000).toISOString(), start_email: "pending" };
  const { result, endedAt } = await run(net);
  expect(result).toMatchObject({ due: 1, emails: 1, failed: 0, outOfTime: false });
  expect(endedAt).toBeLessThanOrEqual(SWEEP_END_MS);
  expect(net.emails).toBe(1);
  expect(net.rpcs).toContainEqual({ name: "note_plan_start_email", body: { p_card: CARD, p_generation: 1, p_state: "sent" } });
});

const pendingEmail = (generation: number, overrides: Partial<Net> = {}) => {
  const net = family({ customerDefault: "pm_new", plans: [{ id: "sub_1", status: "trialing", default_payment_method: "pm_new", metadata: { start_key: "key-1" }, trial_end: 1_900_000_000 }], ...overrides });
  net.row = { ...net.row, start_generation: generation, start_state: "started", start_subscription: "sub_1", start_first_charge: FIRST_CHARGE, start_finished_at: new Date(started - 3_600_000).toISOString(), start_email: "pending" };
  return net;
};

it("a second generation gets its own email: the first generation's sent claim does not answer for it", async () => {
  const claims = new Map<string, string>();
  const first = pendingEmail(1, { claims });
  expect((await run(first)).result).toMatchObject({ emails: 1, failed: 0 });
  expect(first.emails).toBe(1);
  const second = pendingEmail(2, { claims });
  expect((await run(second, { at: started + 3_600_000 })).result).toMatchObject({ emails: 1, failed: 0 });
  expect(second.emails).toBe(1);
  expect(second.rpcs).toContainEqual({ name: "note_plan_start_email", body: { p_card: CARD, p_generation: 2, p_state: "sent" } });
});

it("the deadline holds after the reads: at 24 s it may write, an 8 s read ends at 32 s, nothing is sent, and the next run sends it", async () => {
  const claims = new Map<string, string>();
  // The row's other reads take no time, so the email's turn comes at 24 s. Its first read then takes 8 s, past the write limit at 30 s.
  const late = pendingEmail(1, { claims, delays: { ...SLOW, db: 0, stripeRead: 0 }, slow: { "/card_setups": 8_000 } });
  const { result } = await run(late, { elapsed: 24_000 });
  expect(late.emails).toBe(0);
  expect(late.log.filter((r) => r.what.includes("resend"))).toEqual([]);
  expect(result).toMatchObject({ failed: 0, emails: 0 });
  expect(late.rpcs.map((r) => r.name)).toContain("release_plan_start_email");
  expect(late.rpcs.map((r) => r.name)).not.toContain("note_plan_start_email");

  const next = pendingEmail(1, { claims });
  expect((await run(next, { at: started + 900_000 })).result).toMatchObject({ emails: 1, failed: 0 });
  expect(next.emails).toBe(1);
});

it("an email stopped by the deadline: before its request nothing goes, and during its request the outcome is unknown", async () => {
  vi.stubGlobal("fetch", (_input: unknown, init?: RequestInit) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))));
  const message = { sender: { to: "parent" }, to: "priya@family.ca", subject: "S", text: "T" } as const;
  const inFlight = new AbortController();
  const sending = resendTransport().send(message, { signal: inFlight.signal });
  await vi.advanceTimersByTimeAsync(1_000);
  inFlight.abort(new Error("The sweep's time is over"));
  expect(await sending).toMatchObject({ status: "unknown" });

  const stopped = new AbortController();
  stopped.abort(new Error("The sweep's time is over"));
  expect(await resendTransport().send(message, { signal: stopped.signal })).toMatchObject({ status: "refused" });

  const paced = pacedTransport({ send: async () => ({ status: "sent", emailId: "e" }) }, 600);
  const waiting = new AbortController();
  expect(await paced.send(message)).toMatchObject({ status: "sent" });
  const second = paced.send(message, { signal: waiting.signal });
  await vi.advanceTimersByTimeAsync(100);
  waiting.abort();
  expect(await second).toMatchObject({ status: "refused" });
});

it("the sweep's emails go on the run's transport with the sweep's signal: the parent's confirmation, and the team's alert", async () => {
  const sends: { to: string; signal?: AbortSignal }[] = [];
  const transport = { send: async (m: { to: string }, o?: { signal?: AbortSignal }) => { sends.push({ to: m.to, signal: o?.signal }); return { status: "sent" as const, emailId: "e" }; } };
  const pending = family({ customerDefault: "pm_new", plans: [{ id: "sub_1", status: "trialing", default_payment_method: "pm_new", metadata: { start_key: "key-1" }, trial_end: 1_900_000_000 }], delays: { db: 1, stripeRead: 1, stripeWrite: 1, resend: 1 } });
  pending.row = { ...pending.row, start_state: "started", start_subscription: "sub_1", start_first_charge: FIRST_CHARGE, start_finished_at: new Date(started - 3_600_000).toISOString(), start_email: "pending" };
  vi.stubGlobal("fetch", network(pending));
  const parent = sweepCardsNow({ origin: "https://unicalearning.com", startedAt: started, transport });
  await vi.advanceTimersByTimeAsync(1_000);
  expect(await parent).toMatchObject({ emails: 1 });
  expect(sends.map((s) => s.to)).toEqual(["priya@family.ca"]);
  expect(sends[0].signal).toBeInstanceOf(AbortSignal);
  expect(pending.emails).toBe(0);

  sends.length = 0;
  vi.stubEnv("SIGNUP_NOTIFY_EMAIL", "team@unicalearning.com");
  const stuck = family({ customerDefault: "pm_new", plans: [], delays: { db: 1, stripeRead: 1, stripeWrite: 1, resend: 1 } });
  stuck.row = { ...stuck.row, start_at: new Date(started - 25 * 3_600_000).toISOString() };
  vi.stubGlobal("fetch", network(stuck));
  const team = sweepCardsNow({ origin: "https://unicalearning.com", startedAt: Date.now(), transport });
  await vi.advanceTimersByTimeAsync(1_000);
  expect(await team).toMatchObject({ needsTeam: 1, failed: 0 });
  expect(sends.map((s) => s.to)).toEqual(["team@unicalearning.com"]);
  expect(sends[0].signal).toBeInstanceOf(AbortSignal);
  expect(stuck.rpcs.map((r) => r.name)).toEqual(expect.arrayContaining(["claim_plan_start_alert", "note_plan_start_alert"]));
  expect(stuck.rpcs.map((r) => r.name)).not.toContain("finish_plan_start");
});

it("the paced transport runs overlapping sends one after another, and a quick send's next request waits the full gap", async () => {
  const starts: number[] = [];
  let ms = 15_000;
  const paced = pacedTransport({ send: async () => { starts.push(performance.now()); await new Promise((r) => setTimeout(r, ms)); return { status: "sent", emailId: "e" }; } }, 600);
  const message = { sender: { to: "parent" }, to: "priya@family.ca", subject: "S", text: "T" } as const;
  const slow = Promise.all([paced.send(message), paced.send(message), paced.send(message)]);
  await vi.advanceTimersByTimeAsync(46_000);
  await slow;
  expect(starts.map((at) => at - starts[0])).toEqual([0, 15_000, 30_000]);
  ms = 10;
  starts.length = 0;
  const quick = Promise.all([paced.send(message), paced.send(message)]);
  await vi.advanceTimersByTimeAsync(2_000);
  await quick;
  expect(starts[1] - starts[0]).toBe(600);
});
