import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { retentionCandidates, runFamilyDeletion } = await import("@/lib/family-deletion-store");

const parent = "11111111-1111-4111-8111-111111111111";
const booking = { email: "parent@example.invalid", ref: "33333333-3333-4333-8333-333333333333" };
const list = (data: unknown[]) => ({ object: "list", data, has_more: false, url: "/v1/list" });

for (const state of ["waiting", "active", "unresolved"] as const) {
  it(`keeps a booking-only family ${state} through the public candidate and frozen server paths`, async () => {
    let release = false, unfrozen = false;
    const cards = [{ customer: null, saved: false, booking }];
    const db = createClient("https://database.example.invalid", "synthetic-service-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        const args = JSON.parse(String(init?.body ?? "{}"));
        let answer: unknown;
        switch (url.pathname.split("/").at(-1)) {
          case "family_retention_candidates": answer = args.after_id ? [] : [{ parent_id: parent, queued: false, last_activity: "2020-01-01T00:00:00Z", cards }]; break;
          case "claim_family_retention": answer = { state: "ready", reason: "retention", phase: "checking" }; break;
          case "family_retention_cards": answer = cards; break;
          case "family_last_activity": answer = "2020-01-01T00:00:00Z"; break;
          case "pending_family_payment_operations": answer = []; break;
          case "decide_family_deletion": expect(args.keep_family).toBe(true); unfrozen = true; answer = true; break;
          case "release_family_deletion": release = true; answer = true; break;
          // The old source has no report card rows. It must still find the historical booking.
          case "card_setups": answer = []; break;
          default: throw Error(`Deletion or unsupported database operation: ${url.pathname}`);
        }
        return new Response(JSON.stringify(answer), { status: 200, headers: { "content-type": "application/json" } });
      } },
    });
    const stripe = new Stripe("rk_live_synthetic", { maxNetworkRetries: 0, httpClient: Stripe.createFetchHttpClient(async input => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      let data: unknown[] = [];
      if (url.pathname === "/v1/customers") data = state === "unresolved" ? [] : [{ id: "cus_booking", email: booking.email, metadata: { ref: booking.ref } }];
      else if (url.pathname === "/v1/payment_methods") data = state === "waiting" ? [{ id: "pm_saved", customer: "cus_booking" }] : [];
      else if (url.pathname === "/v1/subscriptions") data = state === "active" ? [{ id: "sub_active", customer: "cus_booking", status: "active", ended_at: null }] : [];
      else if (url.pathname !== "/v1/checkout/sessions") throw Error(`Unexpected Stripe operation: ${url.pathname}`);
      return new Response(JSON.stringify(list(data)), { status: 200, headers: { "content-type": "application/json" } });
    }) });
    const [candidate] = await retentionCandidates(db);
    expect(candidate.cards).toEqual(cards);
    const work = runFamilyDeletion(db, parent, db, Date.now() + 30_000, {
      signal: new AbortController().signal, renewEveryMs: 60_000, paymentRequestTimeoutMs: 5_000,
      abortWork() {}, payments: stripe,
    }, { endedAt: null });
    if (state === "unresolved") {
      await expect(work).rejects.toThrow("Payment check incomplete");
      expect(unfrozen).toBe(false);
    } else {
      await expect(work).resolves.toEqual({ state: "excluded" });
      expect(unfrozen).toBe(true);
    }
    expect(release).toBe(true);
  });
}

// #201: the copy without names goes through the database before any Storage or Auth removal, on every deletion path
// (a parent's request, the retention worker and the manual route all run runFamilyDeletion).
describe("the copy without names before a deletion", () => {
  const test = {
    id: "33333333-3333-4333-8333-333333333333", copied: false, testFamily: false, grade: 2, province: "BC", status: "completed",
    route: "stay", help: "no", startedAt: "2026-02-01T09:00:00Z", completedAt: "2026-02-01T09:30:00Z", stored: {}, placement: null,
    device: null, answers: [], shows: [{ position: 0, questionId: "s1-0", shownAt: "2026-02-01T09:00:05Z" }], facts: null, profile: null,
    learning: null,
  };
  function family(missing: boolean) {
    const calls: string[] = [];
    const saved: Record<string, unknown>[] = [];
    let copied = false;
    const db = createClient("https://database.example.invalid", "synthetic-service-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        const name = url.pathname.startsWith("/rest/v1/rpc/") ? url.pathname.split("/").at(-1)! : `${init?.method ?? "GET"} ${url.pathname}`;
        calls.push(name);
        const args = JSON.parse(String(init?.body ?? "{}"));
        const json = (answer: unknown, status = 200) => new Response(JSON.stringify(answer), { status, headers: { "content-type": "application/json" } });
        switch (name) {
          case "claim_family_deletion": return json({ state: "ready", reason: "request", phase: "deleting" });
          case "renew_family_deletion": return json(true);
          case "family_copy_sources":
            if (missing) return json({ code: "PGRST202", message: "Could not find the function public.family_copy_sources(p)" }, 404);
            expect(args).toEqual({ p: parent });
            return json([{ ...test, copied }]);
          case "save_family_test_copy":
            expect(Object.keys(args).sort()).toEqual(["p", "test_copy", "test_id", "token"]);
            expect(args.test_id).toBe(test.id);
            saved.push(args.test_copy);
            copied = true;
            return json(true);
          case "confirm_family_copies": return json(copied);
          case "POST /storage/v1/object/list/shown-work": return json([]);
          case `DELETE /auth/v1/admin/users/${parent}`: return json({});
          case "complete_family_deletion": return json(true);
          case "release_family_deletion": return json(null);
          default: throw Error(`Unsupported database operation: ${name}`);
        }
      } },
    });
    return { db, calls, saved };
  }

  it("saves each test's copy and has the database confirm it before Storage and Auth", async () => {
    const f = family(false);
    expect(await runFamilyDeletion(f.db, parent, f.db)).toEqual({ state: "deleted", images: 0, copies: 1 });
    const first = (step: string) => f.calls.findIndex((c) => c.includes(step));
    expect(first("save_family_test_copy")).toBeGreaterThan(first("family_copy_sources"));
    expect(first("confirm_family_copies")).toBeGreaterThan(first("save_family_test_copy"));
    expect(first("/storage/")).toBeGreaterThan(first("confirm_family_copies"));
    expect(first("/auth/v1/admin/users/")).toBeGreaterThan(first("/storage/"));
    // The copy holds no id of the family or of the test.
    expect(JSON.stringify(f.saved)).not.toContain(parent);
    expect(JSON.stringify(f.saved)).not.toContain(test.id);
  });

  it("deletes nothing and keeps the request when the copy's database functions are missing", async () => {
    const f = family(true);
    await expect(runFamilyDeletion(f.db, parent, f.db)).rejects.toThrow("family_copy_sources");
    expect(f.calls.some((c) => c.includes("/storage/") || c.includes("/auth/") || c === "complete_family_deletion")).toBe(false);
    expect(f.calls.at(-1)).toBe("release_family_deletion");
  });
});
