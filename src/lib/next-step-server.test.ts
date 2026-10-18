import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The card-link alert to Savar (#66, moved to the delivery module in #149). A BC parent chose a plan on the report, but
// the card page cannot open (here: no Stripe key), so Savar gets an alert to email a link by hand. Supabase and Resend
// are the system boundaries: a fake Supabase answers the reads and writes, and a stubbed network stands in for Resend.
vi.mock("server-only", () => ({}));
let db: SupabaseClient;
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => db }));
/** Work the route schedules with after(); the test runs it when the route has answered. */
let afterResponse: (() => unknown)[] = [];
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (task: () => unknown) => void afterResponse.push(task) }));

const { startCard } = await import("@/lib/next-step-server");

const PARENT = "5e55-parent";
const REPORT = "7d9f3c4e-1111-4a2b-9c3d-0000000000aa";

function fakeSupabase() {
  const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
  db = createClient("https://fixture.invalid", "sb_secret_synthetic", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        const single = new Headers(init?.headers).get("accept")?.includes("vnd.pgrst.object");
        if (url.pathname.startsWith("/rest/v1/rpc/")) return json(null);
        if (url.pathname === "/rest/v1/reports") {
          return json([{ id: REPORT, child_id: "child-1", assessment_id: "test-1", cta: "card", assessment: { province: "BC", grade: 4 }, child: { first_name: "Asha" } }]);
        }
        if (url.pathname === "/rest/v1/parents") return json([{ name: "Priya Shah", email: "priya@family.ca", postal: "V6B 1A1" }]);
        if (url.pathname === "/rest/v1/card_setups") {
          if ((init?.method ?? "GET") === "GET") return json([]);
          const row = { id: "card-1", plan: "one", stripe_customer_id: null, card_saved_at: null };
          return json(single ? row : [row]);
        }
        return json([]);
      },
    },
  });
}

let resend: { url: string; body: Record<string, unknown> }[];
function resendAnswers(status: number, body: unknown) {
  resend = [];
  vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
    resend.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(body), { status });
  });
}

async function chooseThePlan() {
  const result = await startCard(PARENT, REPORT, "one", "email", "https://unica.test");
  for (const task of afterResponse) await task();
  return result;
}

beforeEach(() => {
  afterResponse = [];
  fakeSupabase();
  vi.stubEnv("STRIPE_SECRET_KEY", "");
  vi.stubEnv("SIGNUP_NOTIFY_EMAIL", "savar@unicalearning.com");
  vi.stubEnv("RESEND_API_KEY", "re_synthetic");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the card-link alert to Savar", () => {
  it("goes to Savar from EMAIL_FROM, the sender of every email (D-133)", async () => {
    vi.stubEnv("EMAIL_FROM", "Unica Learning <contact@unicalearning.com>");
    resendAnswers(200, { id: "re_alert" });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await chooseThePlan()).toEqual({ ok: true, state: "later" });
    expect(resend).toHaveLength(1);
    expect(resend[0].url).toBe("https://api.resend.com/emails");
    expect(resend[0].body).toMatchObject({
      from: "Unica Learning <contact@unicalearning.com>",
      to: ["savar@unicalearning.com"],
      reply_to: "priya@family.ca",
      subject: "Card link needed: Priya Shah (Math, grade 4)",
    });
    expect(resend[0].body.text).toContain("Plan chosen from the report, but STRIPE_SECRET_KEY is not set: email them a link to add a card.");
    expect(info).toHaveBeenCalledWith("[next-step] alert sent:", "Card link needed");
  });

  it("is refused, and Resend is never asked, when EMAIL_FROM is not set", async () => {
    vi.stubEnv("EMAIL_FROM", "");
    resendAnswers(200, { id: "re_alert" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    await chooseThePlan();
    expect(resend).toHaveLength(0);
  });

  it("goes from EMAIL_FROM when it is set", async () => {
    vi.stubEnv("EMAIL_FROM", "Unica Learning <contact@unicalearning.com>");
    resendAnswers(200, { id: "re_alert" });
    vi.spyOn(console, "info").mockImplementation(() => {});
    await chooseThePlan();
    expect(resend[0].body.from).toBe("Unica Learning <contact@unicalearning.com>");
  });

  it("is logged with the caller's prefix when Resend does not take it; the parent's answer does not change", async () => {
    vi.stubEnv("EMAIL_FROM", "Unica Learning <contact@unicalearning.com>");
    resendAnswers(503, { message: "down" });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await chooseThePlan()).toEqual({ ok: true, state: "later" });
    expect(error).toHaveBeenCalledWith("[next-step] alert failed", "unknown", 'Resend answered 503: {"message":"down"}');
  });

  it("is not sent when no alert address is set", async () => {
    vi.stubEnv("SIGNUP_NOTIFY_EMAIL", "");
    resendAnswers(200, { id: "re_alert" });
    expect(await chooseThePlan()).toEqual({ ok: true, state: "later" });
    expect(resend).toEqual([]);
  });
});
