import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { LINK_TTL_MS, MAX_LINKS_PER_HOUR } from "@/lib/sign-in-link";

// sendSignInLink (#63): the rate limit of the sign-in link email (docs/state-machines.md, item 12). Supabase is the
// system boundary: a real supabase-js client talks to a fake Supabase. Each fake request waits a random few
// milliseconds, so parallel calls interleave the way parallel HTTP requests do. The fake's issue_sign_in_link does its
// count and insert in one step, as the SQL function does under its lock; its plain count and insert are two requests.
vi.mock("server-only", () => ({}));
const sent: { to: string; subject: string }[] = [];
vi.mock("@/lib/email-delivery", () => ({
  emailConfigProblem: () => null,
  sendEmail: async (email: { to: string; subject: string }) => {
    sent.push({ to: email.to, subject: email.subject });
    return { status: "sent", emailId: `re_${sent.length}` };
  },
}));

const { sendSignInLink } = await import("@/lib/account-server");

const PARENT = "7d9f3c4e-1111-4a2b-9c3d-000000000001";
const CHILD = "7d9f3c4e-2222-4a2b-9c3d-000000000002";

let links: { parent: string; child: string; hash: string; expiresInSeconds: number }[];
let rpcCalls: Record<string, unknown>[];
let world: { rpcDown?: boolean; otherFamily?: boolean };

const pause = () => new Promise((r) => setTimeout(r, Math.random() * 8));

function admin(): SupabaseClient<Database> {
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" && init.body ? JSON.parse(init.body) : null;
    const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
      new Response(method === "HEAD" ? null : JSON.stringify(value), { status, headers: { "content-type": "application/json", ...headers } });
    await pause();
    if (url.pathname === "/rest/v1/parents") return json([{ name: "Priya Shah", email: "priya@family.ca" }]);
    if (url.pathname === "/rest/v1/children") return json([{ first_name: "Asha" }]);
    if (url.pathname === "/rest/v1/sign_in_links" && (method === "GET" || method === "HEAD")) {
      const n = links.filter((l) => l.parent === PARENT).length;
      return json([], 200, { "content-range": `*/${n}` });
    }
    if (url.pathname === "/rest/v1/sign_in_links" && method === "POST") {
      const row = body as { parent_id: string; child_id: string; token_hash: string };
      links.push({ parent: row.parent_id, child: row.child_id, hash: row.token_hash, expiresInSeconds: LINK_TTL_MS / 1000 });
      return json(null, 201);
    }
    if (url.pathname === "/rest/v1/rpc/issue_sign_in_link") {
      const args = body as { p_parent: string; p_child: string; p_token_hash: string; p_max: number; p_ttl_seconds: number };
      rpcCalls.push(args);
      if (world.rpcDown) return json({ code: "XX000", message: "down" }, 500);
      // One step, no await inside: the SQL function's lock makes the count and the insert one move.
      if (world.otherFamily) return json("not_found");
      if (links.filter((l) => l.parent === args.p_parent).length >= args.p_max) return json("too_many");
      links.push({ parent: args.p_parent, child: args.p_child, hash: args.p_token_hash, expiresInSeconds: args.p_ttl_seconds });
      return json("created");
    }
    return json({ code: "PGRST", message: `no route ${method} ${url.pathname}` }, 404);
  };
  return createClient<Database>("https://fixture.invalid", "sb_secret_synthetic", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch } });
}

beforeEach(() => {
  links = [];
  rpcCalls = [];
  sent.length = 0;
  world = {};
});

describe("the sign-in link rate limit", () => {
  it("holds under parallel requests: 12 at once send exactly the hourly limit, and the rest are too_many", async () => {
    const db = admin();
    const results = await Promise.all(Array.from({ length: 12 }, () => sendSignInLink(db, PARENT, CHILD, "https://unica.test")));
    expect(results.filter((r) => r === "sent")).toHaveLength(MAX_LINKS_PER_HOUR);
    expect(results.filter((r) => r === "too_many")).toHaveLength(12 - MAX_LINKS_PER_HOUR);
    expect(links).toHaveLength(MAX_LINKS_PER_HOUR);
    expect(sent).toHaveLength(MAX_LINKS_PER_HOUR);
  });

  it("asks the database for the link in one call, with the limit, the life of the link and only the token's hash", async () => {
    expect(await sendSignInLink(admin(), PARENT, CHILD, "https://unica.test")).toBe("sent");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toMatchObject({ p_parent: PARENT, p_child: CHILD, p_max: MAX_LINKS_PER_HOUR, p_ttl_seconds: LINK_TTL_MS / 1000 });
    expect(rpcCalls[0].p_token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sends nothing for a child of another family, or when the database call fails", async () => {
    world.otherFamily = true;
    expect(await sendSignInLink(admin(), PARENT, CHILD, "https://unica.test")).toBe("not_found");
    world = { rpcDown: true };
    expect(await sendSignInLink(admin(), PARENT, CHILD, "https://unica.test")).toBe("failed");
    expect(sent).toHaveLength(0);
  });
});
