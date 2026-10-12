import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/account/finish (#82): the one step that writes a family. Supabase is the system boundary: the session is a
// fake signed-in user, and the secret-key client talks to a fake Supabase that records every request.
vi.mock("server-only", () => ({}));

type FakeUser = { id: string; email: string; email_confirmed_at: string | null } | null;
let user: FakeUser;
/** How the current session signed in (the JWT's amr claim): "otp" for the email code, "oauth" for Google. */
let methods: string[];
let db: SupabaseClient;

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const accessToken = () => `${b64({ alg: "ES256", typ: "JWT" })}.${b64({ sub: user?.id, amr: methods.map((method) => ({ method, timestamp: 1760000000 })) })}.c2ln`;

vi.mock("@/lib/supabase-auth", () => ({
  sessionClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user }, error: user ? null : new Error("Auth session missing") }),
      getSession: async () => ({ data: { session: user ? { access_token: accessToken() } : null }, error: null }),
    },
  }),
  adminClient: () => db,
}));

const { POST } = await import("@/app/api/account/finish/route");

const ID = "7d9f3c4e-1111-4a2b-9c3d-000000000001";
const LAPTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
/** The fake Auth server rejects this one as weak, like Supabase's leaked-password check. */
const WEAK = "password123";

interface World {
  /** A parent row already exists for this user. */
  existing?: boolean;
  /** The parent read fails. */
  readDown?: boolean;
  /** What the database function answers. */
  admission?: { status: "created"; child: string } | { status: "exists" | "busy" | "unavailable" };
  /** Every password change fails. */
  passwordDown?: boolean;
  /** Signing out the other sessions fails. */
  signOutDown?: boolean;
}

/** Every request the route sends to Supabase, in order, with its body and Authorization header. */
let calls: { method: string; path: string; query: string; body: unknown; auth: string | null }[];

function supabase(world: World) {
  calls = [];
  db = createClient("https://fixture.invalid", "sb_secret_synthetic", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        const method = init?.method ?? "GET";
        const body = typeof init?.body === "string" && init.body ? JSON.parse(init.body) : null;
        const auth = new Headers(init?.headers).get("authorization");
        calls.push({ method, path: url.pathname, query: url.search, body, auth });
        const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
          new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...headers } });
        if (url.pathname.startsWith("/auth/v1/admin/users/")) {
          if (world.passwordDown) return json({ code: "unexpected_failure", message: "down" }, 500);
          if ((body as { password?: string })?.password === WEAK) return json({ code: "weak_password", message: "Password is known to be weak", weak_password: { reasons: ["pwned"] } }, 422);
          return json({ id: ID, email: user?.email });
        }
        if (url.pathname === "/auth/v1/logout") {
          if (world.signOutDown) return json({ code: "unexpected_failure", message: "down" }, 500);
          return new Response(null, { status: 204 });
        }
        if (url.pathname === "/rest/v1/rpc/create_family") return json(world.admission ?? { status: "created", child: "child-1" });
        if (url.pathname === "/rest/v1/parents") {
          // The phone link step reads the new parent back by name; the existing-account check reads only the id.
          if (url.searchParams.get("select")?.includes("name")) return json([{ name: "Priya Shah", email: "priya@family.ca" }]);
          if (world.readDown) return json({ code: "XX000", message: "down" }, 500);
          return json(world.existing ? [{ id: ID }] : []);
        }
        if (url.pathname === "/rest/v1/children") return json([{ first_name: "Asha" }]);
        return json([], 200, { "content-range": "*/0" });
      },
    },
  });
}

const details = { name: "Priya Shah", postal: "V6B 1A1", child: { firstName: "Asha", grade: 4, province: "BC" }, source: { utm_source: "flyer" } };

function finish(body: unknown, ua = LAPTOP) {
  return POST(new Request("https://unica.test/api/account/finish", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": ua },
    body: JSON.stringify(body),
  }));
}

const paths = () => calls.map((c) => `${c.method} ${c.path}`);
const passwordsSet = () => calls.filter((c) => c.path.startsWith("/auth/v1/admin/users/")).map((c) => (c.body as { password: string }).password);
const RANDOM = `PUT /auth/v1/admin/users/${ID}`;
const SIGN_OUT = "POST /auth/v1/logout";
const FAMILY = "POST /rest/v1/rpc/create_family";

beforeEach(() => {
  user = { id: ID, email: "Priya@Family.ca", email_confirmed_at: "2026-10-11T20:00:00Z" };
  methods = ["otp"];
});
afterEach(() => vi.unstubAllEnvs());

describe("a password set before the email was proved never reaches a family account (#82)", () => {
  it("is replaced by a random one, then every other session ends, then the parent's own password is set, before any family row", async () => {
    supabase({});
    const res = await finish({ ...details, email: "attacker@evil.test", password: "a-long-password" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, linkSent: false });
    expect(paths().filter((p) => p !== "GET /rest/v1/parents")).toEqual([RANDOM, SIGN_OUT, RANDOM, FAMILY]);
    const [random, own] = passwordsSet();
    expect(random).not.toBe("a-long-password");
    expect(random.length).toBeGreaterThanOrEqual(32);
    expect(own).toBe("a-long-password");
    const signOut = calls.find((c) => c.path === "/auth/v1/logout");
    expect(signOut?.query).toBe("?scope=others");
    expect(signOut?.auth).toBe(`Bearer ${accessToken()}`);
    expect(calls.find((c) => c.path === "/rest/v1/rpc/create_family")?.body).toMatchObject({
      p_parent: ID, p_email: "priya@family.ca", p_name: "Priya Shah", p_postal: "V6B 1A1", p_child_name: "Asha", p_child_grade: 4, p_child_province: "BC",
    });
  });

  it("is replaced even when the parent's own password is rejected, and no family is written", async () => {
    supabase({});
    const res = await finish({ ...details, password: WEAK });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "weak_password" });
    expect(paths().filter((p) => p !== "GET /rest/v1/parents")).toEqual([RANDOM, SIGN_OUT, RANDOM]);
    expect(passwordsSet()[0]).not.toBe(WEAK);
  });

  it("is replaced even when the request is not valid", async () => {
    supabase({});
    const res = await finish({ ...details, postal: "90210", password: "a-long-password" });
    expect(res.status).toBe(400);
    expect(paths().filter((p) => p !== "GET /rest/v1/parents")).toEqual([RANDOM, SIGN_OUT]);
    supabase({});
    const short = await finish({ ...details, password: "short" });
    expect(short.status).toBe(400);
    expect(paths().filter((p) => p !== "GET /rest/v1/parents")).toEqual([RANDOM, SIGN_OUT]);
  });

  it("is replaced when the family is finished on /account/finish, whose request has no password", async () => {
    supabase({});
    const res = await finish(details);
    expect(await res.json()).toEqual({ ok: true, linkSent: false });
    expect(paths().filter((p) => p !== "GET /rest/v1/parents")).toEqual([RANDOM, SIGN_OUT, FAMILY]);
  });

  it("cannot be used to make the family: a session that signed in with a password alone writes nothing", async () => {
    supabase({});
    methods = ["password"];
    const res = await finish({ ...details, password: "a-long-password" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "unproved" });
    expect(paths()).toEqual(["GET /rest/v1/parents"]);
  });

  it("writes no family when the password or the other sessions cannot be changed", async () => {
    supabase({ passwordDown: true });
    expect((await finish({ ...details, password: "a-long-password" })).status).toBe(502);
    expect(paths()).not.toContain(FAMILY);
    expect(paths()).not.toContain(SIGN_OUT);
    supabase({ signOutDown: true });
    expect((await finish({ ...details, password: "a-long-password" })).status).toBe(502);
    expect(paths().filter((p) => p !== "GET /rest/v1/parents")).toEqual([RANDOM, SIGN_OUT]);
  });
});

describe("what the route never does", () => {
  it("writes nothing for an email nobody confirmed, or without a session", async () => {
    supabase({});
    user = { id: ID, email: "priya@family.ca", email_confirmed_at: null };
    const unconfirmed = await finish({ ...details, password: "a-long-password" });
    expect(unconfirmed.status).toBe(403);
    expect(await unconfirmed.json()).toEqual({ ok: false, error: "unconfirmed" });
    user = null;
    const signedOut = await finish({ ...details, password: "a-long-password" });
    expect(signedOut.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("leaves an existing account as it is: no new password, no sign-outs, no second family", async () => {
    for (const how of [["otp"], ["password"]]) {
      supabase({ existing: true });
      methods = how;
      const res = await finish({ ...details, password: "someone-elses-password" });
      expect(await res.json()).toEqual({ ok: true, existing: true });
      expect(paths()).toEqual(["GET /rest/v1/parents"]);
    }
  });

  it("changes nothing when the parent read fails", async () => {
    supabase({ readDown: true });
    expect((await finish({ ...details, password: "a-long-password" })).status).toBe(502);
    expect(paths()).toEqual(["GET /rest/v1/parents"]);
  });
});

describe("finishing a Google signup (#63)", () => {
  it("writes the family from a Google session", async () => {
    supabase({});
    methods = ["oauth"];
    const res = await finish(details);
    expect(await res.json()).toEqual({ ok: true, linkSent: false });
    expect(paths()).toContain(FAMILY);
  });
});

describe("what the database decides (#82, #78)", () => {
  it("answers busy at the site-wide cap and sends no link", async () => {
    supabase({ admission: { status: "busy" } });
    const res = await finish(details, PHONE);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: false, error: "busy" });
    expect(paths()).not.toContain("POST /rest/v1/sign_in_links");
  });

  it("does not make a family again while it is being deleted", async () => {
    supabase({ admission: { status: "unavailable" } });
    const res = await finish(details);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: "unavailable" });
  });

  it("treats a parallel finish that won the race as the existing account", async () => {
    supabase({ admission: { status: "exists" } });
    expect(await (await finish(details)).json()).toEqual({ ok: true, existing: true });
  });
});

describe("finishing on a phone (#63)", () => {
  it("emails the sign-in link for the new child", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_synthetic");
    vi.stubEnv("EMAIL_FROM", "Unica Learning <hello@unicalearning.com>");
    const sent: string[] = [];
    vi.stubGlobal("fetch", async (input: unknown) => {
      sent.push(String(input));
      return new Response(JSON.stringify({ id: "email-1" }), { status: 200 });
    });
    supabase({ admission: { status: "created", child: "child-42" } });
    const res = await finish(details, PHONE);
    vi.unstubAllGlobals();
    const link = calls.find((c) => c.method === "POST" && c.path === "/rest/v1/sign_in_links");
    expect(link?.body).toMatchObject({ parent_id: ID, child_id: "child-42" });
    expect(sent).toEqual(["https://api.resend.com/emails"]);
    expect(await res.json()).toEqual({ ok: true, linkSent: true });
  });
});
