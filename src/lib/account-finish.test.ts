import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/account/finish (#82): the one step that writes a family. Supabase is the system boundary. Both clients are
// real supabase-js clients that talk to a fake Supabase: the parent's session (their cookies) and the secret-key client.
// The fake Auth server keeps sessions the way hosted Supabase Auth does (checked on project cdjobwsyzndtltzfpyqa,
// 2026-10-12): a password change by the user ends every other session of the user and keeps the caller's; a password
// change by an admin ends every session of the user, the caller's too. A request with an ended session gets 403
// session_not_found.
vi.mock("server-only", () => ({}));

type FakeUser = { id: string; email: string; email_confirmed_at: string | null } | null;
let user: FakeUser;
/** How the current session signed in (the JWT's amr claim): "otp" for the email code, "oauth" for Google. */
let methods: string[];
let db: SupabaseClient;
let sessionDb: SupabaseClient;

/** The parent's session in this browser, and the session of someone who signed in with an earlier password. */
const PARENT = "5e55-parent";
const STRANGER = "5e55-stranger";

/** What the fake Auth server holds for the account. */
let auth: { password: string | null; sessions: Set<string> };

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const accessToken = (session = PARENT) =>
  `${b64({ alg: "ES256", typ: "JWT" })}.${b64({ sub: user?.id, session_id: session, exp: 4102444800, amr: methods.map((method) => ({ method, timestamp: 1760000000 })) })}.c2ln`;
const sessionOf = (authorization: string | null) => {
  try {
    return (JSON.parse(Buffer.from((authorization ?? "").split(".")[1] ?? "", "base64url").toString()) as { session_id?: string }).session_id;
  } catch {
    return undefined;
  }
};

vi.mock("@/lib/supabase-auth", () => ({
  sessionClient: async () => sessionDb,
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
  /** Someone set this password for the email before its owner proved it, and signed in with it. */
  earlierPassword?: string;
  /** The parent's session ends just after the route checks it (for example, a sign-out in another tab). */
  endsAfterCheck?: boolean;
  /** "Secure password change" is on and the session is more than 24 hours old. */
  staleSession?: boolean;
  /** Auth requires the current password at this password change (1 = random, 2 = chosen). */
  currentPasswordRequiredAt?: number;
  /** A conflicting password change ends the parent's session after this route's last password change. */
  endsAfterPasswordChange?: number;
  /** Auth fails (500) on the session check after the last password change. */
  sessionCheckDown?: boolean;
}

/** Every request the route sends to Supabase, in order, with its body and Authorization header. */
let calls: { method: string; path: string; query: string; body: unknown; auth: string | null }[];

function supabase(world: World) {
  calls = [];
  let passwordChanges = 0;
  auth = { password: world.earlierPassword ?? null, sessions: new Set(world.earlierPassword ? [PARENT, STRANGER] : [PARENT]) };
  const fakeUser = () => ({ id: ID, aud: "authenticated", email: user?.email, email_confirmed_at: user?.email_confirmed_at });
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" && init.body ? JSON.parse(init.body) : null;
    const authorization = new Headers(init?.headers).get("authorization");
    calls.push({ method, path: url.pathname, query: url.search, body, auth: authorization });
    const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", "x-supabase-api-version": "2024-01-01", ...headers } });
    /** The calling session, or an error answer when Auth has ended it. */
    const caller = () => {
      const session = sessionOf(authorization);
      return session && auth.sessions.has(session) ? session : null;
    };
    const ended = () => json({ code: "session_not_found", message: "Session from session_id claim in JWT does not exist" }, 403);
    const newPassword = (password: unknown) => {
      if (world.passwordDown) return json({ code: "unexpected_failure", message: "down" }, 500);
      if (password === WEAK) return json({ code: "weak_password", message: "Password is known to be weak", weak_password: { reasons: ["pwned"] } }, 422);
      return null;
    };

    // The user's own requests, with the access token of their session.
    if (url.pathname === "/auth/v1/user") {
      const session = caller();
      if (!session) return ended();
      if (method === "GET" && world.endsAfterCheck) auth.sessions.delete(session);
      if (method === "GET" && world.sessionCheckDown && passwordChanges > 0) return json({ code: "unexpected_failure", message: "down" }, 500);
      if (method === "PUT" && typeof (body as { password?: unknown })?.password === "string") {
        passwordChanges++;
        if (world.currentPasswordRequiredAt === passwordChanges) return json({ code: "current_password_required", message: "Current password required when setting new password." }, 400);
        if (world.staleSession) return json({ code: "reauthentication_needed", message: "Password update requires reauthentication" }, 400);
        const refused = newPassword((body as { password: string }).password);
        if (refused) return refused;
        auth.password = (body as { password: string }).password;
        auth.sessions = new Set([session]);
        if (world.endsAfterPasswordChange === passwordChanges) auth.sessions = new Set([STRANGER]);
      }
      return json(fakeUser());
    }
    if (url.pathname === "/auth/v1/logout") {
      const session = caller();
      if (!session) return ended();
      auth.sessions = url.searchParams.get("scope") === "others" ? new Set([session]) : new Set();
      return new Response(null, { status: 204 });
    }
    // Admin requests, with the secret key.
    if (url.pathname.startsWith("/auth/v1/admin/users/")) {
      if (typeof (body as { password?: unknown })?.password === "string") {
        const refused = newPassword((body as { password: string }).password);
        if (refused) return refused;
        auth.password = (body as { password: string }).password;
        auth.sessions = new Set();
      }
      return json(fakeUser());
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
  };

  db = createClient("https://fixture.invalid", "sb_secret_synthetic", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch } });
  // The parent's cookies: the session of `user`, signed in with `methods`, until Auth tells the client it ended.
  let cleared = false;
  const cookies = {
    getItem: (key: string) => {
      if (cleared || !user || key !== "sb-fixture-auth-token") return null;
      return JSON.stringify({ access_token: accessToken(), refresh_token: "refresh-synthetic", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user: fakeUser() });
    },
    setItem: () => {},
    removeItem: (key: string) => {
      if (key === "sb-fixture-auth-token") cleared = true;
    },
  };
  sessionDb = createClient("https://fixture.invalid", "sb_publishable_synthetic", {
    auth: { storage: cookies, storageKey: "sb-fixture-auth-token", persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
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

/** The session check the route makes first: the parent's own request to Auth. */
const WHO = "GET /auth/v1/user";
/** Every request but the two reads that come before any write: the session check and the existing-account check. */
const paths = () => calls.map((c) => `${c.method} ${c.path}`).filter((p) => p !== WHO && p !== "GET /rest/v1/parents");
const passwordsSet = () => calls.filter((c) => c.method === "PUT" && (c.body as { password?: unknown } | null)?.password !== undefined).map((c) => (c.body as { password: string }).password);
/** The parent changes the password through their own session, so Auth keeps that session and ends every other one. */
const OWN_PASSWORD = "PUT /auth/v1/user";
const FAMILY = "POST /rest/v1/rpc/create_family";
/** True when Auth still knows the parent's session: their next request in this browser is signed in. */
const parentSignedIn = () => auth.sessions.has(PARENT);

beforeEach(() => {
  user = { id: ID, email: "Priya@Family.ca", email_confirmed_at: "2026-10-11T20:00:00Z" };
  methods = ["otp"];
});
afterEach(() => vi.unstubAllEnvs());

describe("a password set before the email was proved never reaches a family account (#82)", () => {
  it("is replaced by a random one, then the parent's own password is set, before any family row", async () => {
    supabase({ earlierPassword: "strangers-password" });
    const res = await finish({ ...details, email: "attacker@evil.test", password: "a-long-password" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, linkSent: false });
    expect(paths()).toEqual([OWN_PASSWORD, OWN_PASSWORD, FAMILY]);
    const [random, own] = passwordsSet();
    expect(random).not.toBe("strangers-password");
    expect(random).not.toBe("a-long-password");
    expect(random.length).toBeGreaterThanOrEqual(32);
    expect(own).toBe("a-long-password");
    expect(auth.password).toBe("a-long-password");
    // Both changes go through the parent's own session, the one in their cookies.
    expect(calls.filter((c) => `${c.method} ${c.path}` === OWN_PASSWORD).map((c) => c.auth)).toEqual([`Bearer ${accessToken()}`, `Bearer ${accessToken()}`]);
    expect(calls.find((c) => c.path === "/rest/v1/rpc/create_family")?.body).toMatchObject({
      p_parent: ID, p_email: "priya@family.ca", p_name: "Priya Shah", p_postal: "V6B 1A1", p_child_name: "Asha", p_child_grade: 4, p_child_province: "BC",
    });
  });

  it("ends the session of whoever signed in with the earlier password, and keeps the parent signed in", async () => {
    supabase({ earlierPassword: "strangers-password" });
    const res = await finish({ ...details, password: "a-long-password" });
    expect(res.status).toBe(200);
    expect(auth.sessions.has(STRANGER)).toBe(false);
    expect(parentSignedIn()).toBe(true);
    // The family row comes only after the other session ended.
    const familyAt = calls.findIndex((c) => c.path === "/rest/v1/rpc/create_family");
    const firstChange = calls.findIndex((c) => (c.body as { password?: unknown } | null)?.password !== undefined);
    expect(firstChange).toBeGreaterThanOrEqual(0);
    expect(firstChange).toBeLessThan(familyAt);
  });

  it("keeps the parent signed in when they finish without a password (Google, or /account/finish)", async () => {
    supabase({ earlierPassword: "strangers-password" });
    const res = await finish(details);
    expect(await res.json()).toEqual({ ok: true, linkSent: false });
    expect(paths()).toEqual([OWN_PASSWORD, FAMILY]);
    expect(auth.password).not.toBe("strangers-password");
    expect(auth.sessions).toEqual(new Set([PARENT]));
  });

  it("is replaced even when the parent's own password is rejected, and no family is written; the parent stays signed in to try again", async () => {
    supabase({ earlierPassword: "strangers-password" });
    const res = await finish({ ...details, password: WEAK });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "weak_password" });
    expect(paths()).toEqual([OWN_PASSWORD, OWN_PASSWORD]);
    expect(passwordsSet()[0]).not.toBe(WEAK);
    expect(auth.password).not.toBe("strangers-password");
    expect(auth.sessions).toEqual(new Set([PARENT]));

    const again = await finish({ ...details, password: "a-stronger-password" });
    expect(await again.json()).toEqual({ ok: true, linkSent: false });
    expect(auth.password).toBe("a-stronger-password");
    expect(parentSignedIn()).toBe(true);
  });

  it("is replaced even when the request is not valid", async () => {
    supabase({ earlierPassword: "strangers-password" });
    const res = await finish({ ...details, postal: "90210", password: "a-long-password" });
    expect(res.status).toBe(400);
    expect(paths()).toEqual([OWN_PASSWORD]);
    expect(auth.password).not.toBe("strangers-password");
    supabase({});
    const short = await finish({ ...details, password: "short" });
    expect(short.status).toBe(400);
    expect(paths()).toEqual([OWN_PASSWORD]);
  });

  it("cannot be used to make the family: a session that signed in with a password alone writes nothing", async () => {
    supabase({ earlierPassword: "strangers-password" });
    methods = ["password"];
    const res = await finish({ ...details, password: "a-long-password" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "unproved" });
    expect(paths()).toEqual([]);
    expect(auth.password).toBe("strangers-password");
  });

  it("writes no family when the password cannot be changed", async () => {
    supabase({ passwordDown: true });
    expect((await finish({ ...details, password: "a-long-password" })).status).toBe(502);
    expect(paths()).toEqual([OWN_PASSWORD]);
  });
});

describe("a parent whose first finish failed (2026-10-12, #82)", () => {
  it.each([false, true])("writes no family if the session ends after the last password change (chosen password: %s)", async (chosenPassword) => {
    supabase({ endsAfterPasswordChange: chosenPassword ? 2 : 1 });
    const res = await finish({ ...details, ...(chosenPassword ? { password: "a-long-password" } : {}) });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "signed_out" });
    expect(paths()).not.toContain(FAMILY);
  });

  it("keeps the proof, and writes no family, when Auth fails on the session check", async () => {
    supabase({ sessionCheckDown: true });
    const res = await finish({ ...details, password: "a-long-password" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: "store_failed" });
    expect(paths()).not.toContain(FAMILY);
  });

  // Before the fix, an admin password change ended the parent's own session too, and the request failed: the account
  // had a password nobody knows, no session and no family. The parent signs in again with an emailed code, then
  // submits the form again.
  it("finishes after a new email code sign-in, with the password they choose, and stays signed in", async () => {
    supabase({});
    auth.password = "random-password-nobody-knows";
    const res = await finish({ ...details, password: "a-long-password" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, linkSent: false });
    expect(auth.password).toBe("a-long-password");
    expect(parentSignedIn()).toBe(true);
    expect(paths()).toContain(FAMILY);
  });

  it("is told to sign in again, and nothing changes, when the session in the cookies has ended", async () => {
    supabase({});
    auth.sessions = new Set();
    const res = await finish({ ...details, password: "a-long-password" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "signed_out" });
    expect(paths()).toEqual([]);
  });
});

describe("when Auth refuses the first password change", () => {
  it.each([1, 2])("identifies a blocked password change at step %i and writes no family", async (currentPasswordRequiredAt) => {
    supabase({ currentPasswordRequiredAt });
    const res = await finish({ ...details, password: "a-long-password" });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "password_change_blocked" });
    expect(paths()).not.toContain(FAMILY);
  });

  it("asks for a new sign-in, and writes nothing, when the session ends between the check and the change", async () => {
    supabase({ endsAfterCheck: true, earlierPassword: "strangers-password" });
    const res = await finish({ ...details, password: "a-long-password" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "signed_out" });
    expect(paths()).toEqual([OWN_PASSWORD]);
    expect(auth.password).toBe("strangers-password");
  });

  it("asks for a new sign-in, and writes nothing, when Auth wants a recent sign-in to change the password", async () => {
    supabase({ staleSession: true });
    const res = await finish(details);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "signed_out" });
    expect(paths()).toEqual([OWN_PASSWORD]);
  });
});

describe("what the route never does", () => {
  it("writes nothing for an email nobody confirmed, or without a session", async () => {
    supabase({});
    user = { id: ID, email: "priya@family.ca", email_confirmed_at: null };
    const unconfirmed = await finish({ ...details, password: "a-long-password" });
    expect(unconfirmed.status).toBe(403);
    expect(await unconfirmed.json()).toEqual({ ok: false, error: "unconfirmed" });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([WHO]);
    supabase({});
    user = null;
    const signedOut = await finish({ ...details, password: "a-long-password" });
    expect(signedOut.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("leaves an existing account as it is: no new password, no sign-outs, no second family", async () => {
    for (const how of [["otp"], ["password"]]) {
      supabase({ existing: true, earlierPassword: "parents-password" });
      methods = how;
      const res = await finish({ ...details, password: "someone-elses-password" });
      expect(await res.json()).toEqual({ ok: true, existing: true });
      expect(paths()).toEqual([]);
      expect(auth.password).toBe("parents-password");
      expect(auth.sessions).toEqual(new Set([PARENT, STRANGER]));
    }
  });

  it("changes nothing when the parent read fails", async () => {
    supabase({ readDown: true });
    expect((await finish({ ...details, password: "a-long-password" })).status).toBe(502);
    expect(paths()).toEqual([]);
  });
});

describe("finishing a Google signup (#63)", () => {
  it("writes the family from a Google session, and the parent stays signed in", async () => {
    supabase({});
    methods = ["oauth"];
    const res = await finish(details);
    expect(await res.json()).toEqual({ ok: true, linkSent: false });
    expect(paths()).toContain(FAMILY);
    expect(parentSignedIn()).toBe(true);
  });
});

describe("what the database decides (#82, #78)", () => {
  it("answers busy at the site-wide cap and sends no link", async () => {
    supabase({ admission: { status: "busy" } });
    const res = await finish(details, PHONE);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: false, error: "busy" });
    expect(paths()).not.toContain("POST /rest/v1/sign_in_links");
    expect(parentSignedIn()).toBe(true);
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
  it("makes the family from the short phone signup: no postal code and no password (D-134), then emails the link", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_synthetic");
    vi.stubEnv("EMAIL_FROM", "Unica Learning <contact@unicalearning.com>");
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ id: "email-1" }), { status: 200 }));
    supabase({ earlierPassword: "strangers-password", admission: { status: "created", child: "child-42" } });
    const { postal: _, ...short } = details;
    void _;
    const res = await finish(short, PHONE);
    vi.unstubAllGlobals();
    expect(await res.json()).toEqual({ ok: true, linkSent: true });
    expect(calls.find((c) => c.path === "/rest/v1/rpc/create_family")?.body).toMatchObject({ p_postal: null, p_child_name: "Asha" });
    // Only the password that nobody knows was set: the stranger's is gone and the parent stays signed in.
    expect(passwordsSet()).toHaveLength(1);
    expect(auth.password).not.toBe("strangers-password");
    expect(parentSignedIn()).toBe(true);
  });

  it("emails the sign-in link for the new child", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_synthetic");
    vi.stubEnv("EMAIL_FROM", "Unica Learning <contact@unicalearning.com>");
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

  it("does not hang when Resend never answers: after 15 seconds the family is made and no link was sent (#149)", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_synthetic");
    vi.stubEnv("EMAIL_FROM", "Unica Learning <contact@unicalearning.com>");
    let asked = false;
    vi.stubGlobal("fetch", (_input: unknown, init?: RequestInit) => {
      asked = true;
      return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      supabase({ admission: { status: "created", child: "child-42" } });
      const pending = finish(details, PHONE);
      for (let i = 0; i < 50 && !asked; i++) await vi.advanceTimersByTimeAsync(0);
      expect(asked).toBe(true);
      await vi.advanceTimersByTimeAsync(15_000);
      const res = await pending;
      expect(await res.json()).toEqual({ ok: true, linkSent: false });
      expect(paths()).toContain(FAMILY);
    } finally {
      error.mockRestore();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
