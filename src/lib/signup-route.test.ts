import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("stripe", async (original) => {
  const { default: Stripe } = await original<typeof import("stripe")>();
  return { default: class extends Stripe {
    constructor(key: string) { super(key, { maxNetworkRetries: 0, httpClient: Stripe.createFetchHttpClient((...args) => fetch(...args)) }); }
  } };
});

let events: string[];
let admission: "ok" | "frozen" | "missing" | "lost";
let failure: "none" | "customer" | "checkout" | "finish" | "abort";
let completed: unknown[];
beforeEach(() => {
  vi.resetModules();
  events = [];
  admission = "ok";
  failure = "none";
  completed = [];
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://synthetic.invalid");
  vi.stubEnv("SUPABASE_URL", "https://synthetic.invalid");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_synthetic");
  vi.stubEnv("STRIPE_SECRET_KEY", "rk_test_synthetic");
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    events.push(path);
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
    if (path.endsWith("/begin_booking_signup")) {
      if (admission === "lost") throw Error("lost admission response");
      return admission === "ok" ? json(true) : json({ code: admission === "missing" ? "PGRST202" : "55000", message: "unavailable" }, 400);
    }
    if (path.endsWith("/signups")) return new Response(null, { status: 201 }); // Old unsafe path.
    if (path === "/v1/customers") {
      if (failure === "customer") return json({ error: { type: "api_error", message: "unknown" } }, 500);
      if (failure === "abort") throw new DOMException("Request aborted", "AbortError");
      return json({ id: "cus_booking", object: "customer" });
    }
    if (path === "/v1/checkout/sessions") {
      if (failure === "checkout") return json({ error: { type: "api_error", message: "unknown" } }, 500);
      return json({ id: "cs_booking", url: "https://checkout.stripe.com/synthetic" });
    }
    if (path.endsWith("/finish_booking_signup")) {
      completed.push(JSON.parse(String(init?.body)));
      if (failure === "finish") throw Error("Lost store result");
      return json(true);
    }
    throw Error(`Unexpected boundary: ${path}`);
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const payload = { name: "Test Parent", email: "test@example.invalid", postal: "V4N 5B2", plan: "one", subject: "Math", grade: 3, curriculum: "BC", source: {} };
async function book(over = {}, signal?: AbortSignal) {
  const { POST } = await import("@/app/api/signup/route");
  return POST(new Request("http://localhost/api/signup", { method: "POST", body: JSON.stringify({ ...payload, ...over }), signal }));
}

it.each(["frozen", "missing", "lost"] as const)("does not create a customer when booking admission is %s", async state => {
  admission = state;
  const response = await book();
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ ok: false, error: "store_failed" });
  expect(events.some(e => e.startsWith("/v1/"))).toBe(false);
});

it("returns the booking page only after durable completion records the customer", async () => {
  const response = await book();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, status: "reserved", cardUrl: "https://checkout.stripe.com/synthetic" });
  expect(events).toEqual(["/rest/v1/rpc/begin_booking_signup", "/v1/customers", "/v1/checkout/sessions", "/rest/v1/rpc/finish_booking_signup"]);
  expect(completed).toEqual([expect.objectContaining({ customer: "cus_booking" })]);
});

it.each(["customer", "checkout", "abort", "finish"] as const)("retains uncertainty and the existing fallback after %s failure", async stage => {
  failure = stage;
  const response = await book();
  const result = await response.json();
  expect(response.status).toBe(200);
  expect(result).toMatchObject({ ok: true, status: "reserved" });
  expect(result).not.toHaveProperty("cardUrl");
  expect(completed).toEqual(stage === "finish" ? [expect.objectContaining({ customer: "cus_booking" })] : []);
  expect(events.filter(e => e === "/v1/customers")).toHaveLength(1);
});

it.each(["provider_off", "already_aborted"] as const)("releases only a known not-started booking: %s", async state => {
  if (state === "provider_off") vi.stubEnv("STRIPE_SECRET_KEY", "");
  const response = await book({}, state === "already_aborted" ? AbortSignal.abort() : undefined);
  expect(await response.json()).toMatchObject({ ok: true, status: "reserved" });
  expect(completed).toEqual([expect.objectContaining({ customer: null })]);
  expect(events.some(e => e.startsWith("/v1/"))).toBe(false);
});

it("keeps the non-BC waitlist with no payment operation", async () => {
  const response = await book({ curriculum: "ON" });
  expect(await response.json()).toMatchObject({ ok: true, status: "waitlist" });
  expect(events).toEqual(["/rest/v1/rpc/begin_booking_signup"]);
});

it.each([{}, { website: "bot" }, { grade: 9 }])("keeps validation and the bot control before all service writes: %j", async over => {
  const response = await book(over);
  if (Object.keys(over).length) expect(events).toEqual([]);
  else expect(response.status).toBe(200);
});
