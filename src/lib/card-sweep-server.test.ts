import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  /** The rows the daily plan re-read finds. A note moves a row to the back, as the database's order does. */
  planRows?: { child_id: string; parent_id: string; customer: string; kind: string; event_at: string | null }[];
  /** Each customer's subscriptions and how long Stripe takes to list them. Unset: `plans`, at `delays.stripeRead`. */
  lists?: Record<string, { ms: number; data: Record<string, unknown>[]; status?: number }>;
  /** The first read of the re-read's rows fails. */
  planRowsFail?: boolean;
  /** The first read of the card rows fails. */
  cardRowsFail?: boolean;
}

const started = Date.UTC(2026, 10, 5, 19);
const wait = (ms: number, signal: AbortSignal | null | undefined, entry: Net["log"][number]) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => { entry.endedAt = Date.now() - started; resolve(); }, ms);
  signal?.addEventListener("abort", () => { clearTimeout(timer); entry.aborted = true; entry.endedAt = Date.now() - started; reject(signal.reason); }, { once: true });
});

function network(net: Net) {
  let takes = 0;
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
      const list = url.pathname === "/v1/subscriptions" ? net.lists?.[url.searchParams.get("customer") ?? ""] : undefined;
      if (url.pathname === "/v1/subscriptions") entry.what += ` ${url.searchParams.get("customer")}`;
      await wait(list ? list.ms : method === "GET" ? net.delays.stripeRead : net.delays.stripeWrite, signal, entry);
      if (url.pathname === "/v1/subscriptions" && list) {
        if (list.status) return Response.json({ error: { type: "api_error", message: "Stripe is down" } }, { status: list.status });
        return Response.json({ object: "list", has_more: false, data: list.data });
      }
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
      if (rpc === "card_recovery_rows") return net.cardRowsFail ? Response.json({ message: "down" }, { status: 500 }) : Response.json(net.row ? [net.row] : []);
      // No start rows here: src/lib/plan-read-sweep.test.ts and src/lib/plan-state-server.test.ts cover them.
      if (rpc === "due_plan_start_reads") return Response.json([]);
      if (rpc === "due_plan_reads") return net.planRowsFail ? Response.json({ message: "down" }, { status: 500 }) : Response.json(net.planRows ?? []);
      if (rpc === "note_plan_read_tried") {
        const body = JSON.parse(text || "{}");
        const at = (net.planRows ?? []).findIndex((r) => r.child_id === body.p_child);
        if (at >= 0) net.planRows!.push(net.planRows!.splice(at, 1)[0]);
        return Response.json(null);
      }
      if (rpc === "take_plan_read_order") return Response.json(++takes);
      if (rpc === "save_child_plan_state") {
        const body = JSON.parse(text || "{}");
        net.planRows = net.planRows?.filter((r) => r.customer !== body.p_customer);
        return Response.json("stored");
      }
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
  expect(result).toEqual({ error: "run_failed", planReads: { error: "run_failed" } });
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

describe("the daily plan re-read, through the real Supabase client and Stripe SDK", () => {
  const CHILD = (n: number) => `00000000-0000-4000-8000-00000000010${n}`;
  const planRow = (n: number) => ({ child_id: CHILD(n), parent_id: "00000000-0000-4000-8000-000000000009", customer: `cus_${n}`, kind: "paying", event_at: new Date(started - 2 * 86_400_000).toISOString() });
  const over = [{ id: "sub_x", status: "canceled", cancel_at_period_end: false, trial_end: null, created: 1, ended_at: 1_800_000_000, items: { data: [{ current_period_end: 1_800_000_000, price: { unit_amount: 7999 } }] } }];
  const saves = (net: Net) => net.rpcs.filter((r) => r.name === "save_child_plan_state").map((r) => r.body);
  const noCardRow = (over: Partial<Net>) => family({ row: null as unknown as Net["row"], ...over });

  it("reads each due row with its take first, saves through the one function, and sends no email", async () => {
    const net = noCardRow({ planRows: [planRow(1)], lists: { cus_1: { ms: 100, data: over } } });
    const { result } = await run(net);
    expect(result).toMatchObject({ planReads: { due: 1, read: 1, changed: 1, failed: 0, outOfTime: false } });
    const names = net.rpcs.map((r) => r.name);
    expect(names.indexOf("take_plan_read_order")).toBeGreaterThan(names.indexOf("note_plan_read_tried"));
    expect(saves(net)).toHaveLength(1);
    expect(saves(net)[0]).toMatchObject({ p_customer: "cus_1", p_kind: "ended", p_event_at: planRow(1).event_at, p_read_order: 1 });
    expect(String(saves(net)[0].p_event_id)).toMatch(/^plan-read:/);
    expect(net.emails).toBe(0);
    expect(net.log.filter((r) => r.what.includes("api.resend.com"))).toEqual([]);
  });

  const stripeOrder = (net: Net, from: number) => net.log.slice(from).map((r) => r.what).filter((w) => w.includes("/v1/subscriptions")).map((w) => w.split(" ").at(-1));

  it("Stripe hanging on one row costs its own read limit: the row stays, the others are read, and a later run reads it", async () => {
    const net = noCardRow({
      planRows: [planRow(1), planRow(2), planRow(3)],
      lists: { cus_1: { ms: 100_000, data: over }, cus_2: { ms: 100, data: over }, cus_3: { ms: 100, data: over } },
    });
    const first = await run(net);
    expect(first.result).toMatchObject({ planReads: { due: 3, read: 2, failed: 1, outOfTime: false } });
    expect(saves(net).map((b) => b.p_customer)).toEqual(["cus_2", "cus_3"]);
    expect(first.endedAt).toBeLessThan(15_000);
    net.lists!.cus_1.ms = 100;
    const reads = net.log.length;
    const second = await run(net, { at: started + 900_000 });
    expect(second.result).toMatchObject({ planReads: { due: 1, read: 1, failed: 0 } });
    expect(stripeOrder(net, reads)).toEqual(["cus_1"]);
  });

  it("a save that hangs ends at the sweep's end, and the next run reads the others first", async () => {
    const net = noCardRow({
      planRows: [planRow(1), planRow(2), planRow(3)], slow: { save_child_plan_state: 600_000 },
      lists: { cus_1: { ms: 100, data: over }, cus_2: { ms: 100, data: over }, cus_3: { ms: 100, data: over } },
    });
    const first = await run(net);
    expect(first.endedAt).toBe(SWEEP_END_MS);
    expect(first.result).toMatchObject({ planReads: { due: 3, read: 0, failed: 1, outOfTime: true } });
    expect(saves(net)).toEqual([]);
    for (const request of net.log) expect(request.endedAt!, request.what).toBeLessThanOrEqual(SWEEP_END_MS);
    net.slow = {};
    const reads = net.log.length;
    const second = await run(net, { at: started + 900_000 });
    expect(second.result).toMatchObject({ planReads: { read: 3, failed: 0 } });
    expect(stripeOrder(net, reads)).toEqual(["cus_2", "cus_3", "cus_1"]);
  });

  it("every row at its slowest: no new row after 25 seconds, and the next run goes on from there", async () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 8].map(planRow);
    const lists = Object.fromEntries(rows.map((r) => [r.customer, { ms: 3_900, data: over }]));
    const net = noCardRow({ planRows: rows, lists });
    const first = await run(net);
    expect(first.result).toMatchObject({ planReads: { due: 8, read: 5, failed: 0, outOfTime: true } });
    expect(first.endedAt).toBeLessThan(SWEEP_END_MS);
    expect(saves(net).map((b) => b.p_customer)).toEqual(["cus_1", "cus_2", "cus_3", "cus_4", "cus_5"]);
    const reads = net.log.length;
    const second = await run(net, { at: started + 900_000 });
    expect(second.result).toMatchObject({ planReads: { due: 3, read: 3, outOfTime: false } });
    expect(stripeOrder(net, reads)).toEqual(["cus_6", "cus_7", "cus_8"]);
  });

  it("a closed row, through the real clients: a paid answer saves, and a trial answer saves nothing and sends no customer to the log", async () => {
    const closed = (n: number, kind: string) => ({ ...planRow(n), kind });
    const paid = [{ ...over[0], status: "active", ended_at: null }];
    const trial = [{ ...over[0], status: "trialing", ended_at: null, trial_end: 1_900_000_000 }];
    const net = noCardRow({ planRows: [closed(1, "payment_failed"), closed(2, "paused")], lists: { cus_1: { ms: 10, data: paid }, cus_2: { ms: 10, data: trial } } });
    const { result } = await run(net);
    expect(result).toMatchObject({ planReads: { due: 2, read: 1, changed: 1, unclear: 1, failed: 0 } });
    expect(saves(net).map((b) => [b.p_customer, b.p_kind])).toEqual([["cus_1", "paying"]]);
    expect(net.emails).toBe(0);
    const logged = JSON.stringify([...vi.mocked(console.info).mock.calls, ...vi.mocked(console.error).mock.calls]);
    expect(logged).toContain("re-read run");
    expect(logged).not.toContain("cus_");
  });

  it("Stripe down: every read fails, nothing is saved, and the rows stay for a later run", async () => {
    const net = noCardRow({ planRows: [planRow(1), planRow(2)], lists: { cus_1: { ms: 10, data: [], status: 500 }, cus_2: { ms: 10, data: [], status: 500 } } });
    const { result } = await run(net);
    expect(result).toMatchObject({ planReads: { due: 2, read: 0, failed: 2 } });
    expect(saves(net)).toEqual([]);
    expect(net.planRows).toHaveLength(2);
  });

  it("slow card rows do not starve the re-read, and a failed card sweep hides nothing", async () => {
    const slowCards = family({ planRows: [planRow(2)], lists: { cus_2: { ms: 100, data: over } } });
    const { result } = await run(slowCards);
    expect(result).toMatchObject({ due: 1, outOfTime: true, planReads: { read: 1 } });
    const failed = noCardRow({ planRows: [planRow(1)], lists: { cus_1: { ms: 100, data: over } }, cardRowsFail: true });
    const second = await run(failed);
    expect(second.result).toMatchObject({ error: "run_failed", planReads: { read: 1 } });
  });

  it("a failed read of the re-read's rows hides nothing of the card sweep", async () => {
    const net = family({ planRowsFail: true });
    const { result } = await run(net);
    expect(result).toMatchObject({ due: 1, planReads: { error: "run_failed" } });
  });
});
