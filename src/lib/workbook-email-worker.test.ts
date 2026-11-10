import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import type { EmailMessage } from "@/lib/email-delivery";
import type { CardEvidence, SavedCards } from "@/lib/saved-card";
import { runWorkbookWelcomes, sendQueuedWorkbookWelcome } from "@/lib/workbook-email-server";

vi.mock("server-only", () => ({}));

function fixture(find: () => Promise<CardEvidence | null>) {
  let saved = false, queued = false, claimed = false;
  const mutations: string[] = [], messages: EmailMessage[] = [], reads: URL[] = [];
  const record = vi.fn(async () => {
    saved = true; queued = true;
    return { row: { id: "card-1", plan: "one" as const, price: 79.99, stripe_customer_id: "cus_1", card_saved_at: "2026-11-01T00:00:00Z" }, recorded: true };
  });
  const cards: SavedCards = {
    store: { load: async () => null, choose: async () => { throw Error("Not used"); }, record },
    provider: { find: vi.fn(find), keepPlan: async () => {} },
  };
  const db = createClient<Database>("https://fixture.invalid", "sb_secret_synthetic", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input)); reads.push(url);
      const method = init?.method ?? "GET";
      const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
      if (method !== "GET" && method !== "HEAD") mutations.push(url.pathname);
      if (url.pathname.endsWith("/test_accounts")) return json([]);
      if (method === "HEAD") return new Response(null, { status: 200, headers: { "content-range": `0-0/${queued ? 1 : 0}` } });
      if (url.pathname.endsWith("/card_setups")) {
        if (method === "PATCH") return json(null);
        return json(url.searchParams.has("workbook_welcome_enabled") ? [{ id: "card-1", stripe_customer_id: "cus_1" }]
          : [{ parent_id: "parent-1", child_id: "child-1", card_saved_at: saved ? "2026-11-01T00:00:00Z" : null }]);
      }
      if (url.pathname.endsWith("/parents")) return json([{ name: "Priya", email: "parent@example.com" }]);
      if (url.pathname.endsWith("/children")) return json([{ first_name: "Asha" }]);
      if (url.pathname.endsWith("/rpc/claim_workbook_email")) {
        if (claimed) return json([]);
        claimed = true;
        return json([{ id: "email-1", claim_token: JSON.parse(String(init?.body)).p_token }]);
      }
      if (url.pathname.endsWith("/workbook_emails")) {
        if (method === "PATCH") return json(null);
        return json(queued && !claimed ? [{ id: "email-1", card_setup_id: "card-1" }] : []);
      }
      throw Error("Unexpected request");
    } },
  });
  const transport = { async send(message: EmailMessage) { messages.push(message); return { status: "sent" as const, emailId: "re_1" }; } };
  return { db, cards, record, mutations, messages, reads, transport };
}

describe("automatic workbook welcomes", () => {
  it("finds a card from a closed Checkout tab and sends its welcome in the same run", async () => {
    const f = fixture(async () => ({ ref: "card-1", customer: "cus_1", savedFor: { plan: "one", price: 79.99 }, savedAt: "2026-11-01T00:00:00Z", metadata: {} }));
    const result = await runWorkbookWelcomes(f.db, { cards: f.cards, transport: f.transport });
    expect(result).toMatchObject({ checked: 1, sent: 1 });
    expect(f.record).toHaveBeenCalledOnce();
    expect(f.messages).toHaveLength(1);
    expect(f.messages[0].text).toContain("preparing your first workbook");
    const scan = f.reads.find((r) => r.searchParams.has("workbook_welcome_enabled"));
    expect(scan?.searchParams.get("workbook_welcome_enabled")).toBe("eq.true");
    expect(scan?.searchParams.get("order")).toBe("workbook_email_checked_at.asc.nullsfirst,id.asc");
  });
  it("does no work after a Stripe read times out, even if that read finishes later", async () => {
    vi.useFakeTimers();
    try {
      let finish!: (e: CardEvidence) => void;
      const f = fixture(() => new Promise((resolve) => { finish = resolve; }));
      const running = runWorkbookWelcomes(f.db, { cards: f.cards, transport: f.transport });
      await vi.advanceTimersByTimeAsync(6001);
      expect(await running).toMatchObject({ checked: 1, sent: 0 });
      finish({ ref: "card-1", customer: "cus_1", savedFor: null, savedAt: "2026-11-01T00:00:00Z", metadata: {} });
      await vi.advanceTimersByTimeAsync(0);
      expect(f.record).not.toHaveBeenCalled();
      expect(f.messages).toHaveLength(0);
    } finally { vi.useRealTimers(); }
  });
  it("keeps dry runs read-only", async () => {
    const f = fixture(async () => null);
    expect(await runWorkbookWelcomes(f.db, { cards: f.cards, transport: f.transport, dry: true })).toMatchObject({ checked: 0, sent: 0 });
    expect(f.mutations).toEqual([]);
    expect(f.cards.provider.find).not.toHaveBeenCalled();
    expect(f.messages).toHaveLength(0);
  });
});

function deletionQueue(race: boolean) {
  const entries = (race ? ["blocked-1", "valid"] : ["blocked-1", "blocked-2", "valid"])
    .map((id) => ({ id, deleted: !race && id.startsWith("blocked"), claimed: false, sent: false }));
  const messages: EmailMessage[] = [];
  const db = createClient<Database>("https://fixture.invalid", "sb_secret_synthetic", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const u = new URL(String(input)), method = init?.method ?? "GET";
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
      if (u.pathname.endsWith("/test_accounts")) return json([]);
      if (u.pathname.endsWith("/card_setups")) return json([{ parent_id: "parent", child_id: "child", card_saved_at: "2026-11-01T00:00:00Z" }]);
      if (u.pathname.endsWith("/parents")) return json([{ name: "Parent", email: "parent@example.com" }]);
      if (u.pathname.endsWith("/children")) return json([{ first_name: "Child" }]);
      if (u.pathname.endsWith("/rpc/claim_workbook_email")) {
        const p = JSON.parse(String(init?.body));
        const e = entries.find((x) => x.id === p.p_card_setup_id)!;
        if (e.id.startsWith("blocked")) return json({ message: "family_unavailable" }, 503);
        if (e.claimed) return json([]);
        e.claimed = true;
        return json([{ id: e.id, claim_token: p.p_token }]);
      }
      if (u.pathname.endsWith("/workbook_emails")) {
        if (method === "PATCH") { entries.find((e) => `eq.${e.id}` === u.searchParams.get("id"))!.sent = true; return json(null); }
        let due = entries.filter((e) => !e.sent);
        if (u.searchParams.get("parent.deletion_requested_at") === "is.null") due = due.filter((e) => !e.deleted);
        if (u.searchParams.has("card_setup_id")) due = due.filter((e) => `eq.${e.id}` === u.searchParams.get("card_setup_id"));
        if (method === "HEAD") return new Response(null, { status: 200, headers: { "content-range": `0-0/${due.length}` } });
        if (u.searchParams.has("limit")) due = due.slice(0, Number(u.searchParams.get("limit")));
        return json(due.map((e) => ({ id: e.id, card_setup_id: e.id })));
      }
      throw Error("Unexpected request");
    } },
  });
  const transport = { async send(m: EmailMessage) { messages.push(m); return { status: "sent" as const, emailId: "re_valid" }; } };
  return { db, messages, transport };
}

describe("welcome queue progress during family deletion", () => {
  it("excludes blocked families before the batch limit so they cannot occupy each run", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    try {
      const f = deletionQueue(false);
      expect(await runWorkbookWelcomes(f.db, { transport: f.transport })).toMatchObject({ sent: 1 });
      expect(await runWorkbookWelcomes(f.db, { transport: f.transport })).toMatchObject({ sent: 0 });
      expect(f.messages).toHaveLength(1);
    } finally { vi.unstubAllEnvs(); }
  });
  it("continues when a family becomes blocked after the queue was selected", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const f = deletionQueue(true);
      expect(await runWorkbookWelcomes(f.db, { transport: f.transport })).toMatchObject({ sent: 1 });
      expect(f.messages).toHaveLength(1);
    } finally { vi.unstubAllEnvs(); log.mockRestore(); }
  });
});

/** Two queued welcomes: one for a family marked in public.test_accounts (#804), one for a real family. */
function testFamilyQueue() {
  const entries = [
    { card: "test-card", parent: "test-parent", sent: false },
    { card: "real-card", parent: "real-parent", sent: false },
  ];
  const claims: string[] = [], messages: EmailMessage[] = [];
  const db = createClient<Database>("https://fixture.invalid", "sb_secret_synthetic", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const u = new URL(String(input)), method = init?.method ?? "GET";
      const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
      const marked = ["test-parent"];
      if (u.pathname.endsWith("/test_accounts")) {
        const only = u.searchParams.get("parent_id");
        return json(marked.filter((p) => !only || only === `eq.${p}`).map((parent_id) => ({ parent_id })));
      }
      const card = (id: string | null) => entries.find((e) => `eq.${e.card}` === id);
      if (u.pathname.endsWith("/card_setups")) {
        const e = card(u.searchParams.get("id"));
        return json([{ parent_id: e?.parent ?? "real-parent", child_id: "child", card_saved_at: "2026-11-01T00:00:00Z" }]);
      }
      if (u.pathname.endsWith("/parents")) return json([{ name: "Parent", email: "parent@example.com" }]);
      if (u.pathname.endsWith("/children")) return json([{ first_name: "Child" }]);
      if (u.pathname.endsWith("/rpc/claim_workbook_email")) {
        const p = JSON.parse(String(init?.body));
        claims.push(p.p_card_setup_id);
        return json([{ id: p.p_card_setup_id, claim_token: p.p_token }]);
      }
      if (u.pathname.endsWith("/workbook_emails")) {
        if (method === "PATCH") { entries.find((e) => `eq.${e.card}` === u.searchParams.get("id"))!.sent = true; return json(null); }
        let due = entries.filter((e) => !e.sent);
        const left = /^not\.in\.\((.*)\)$/.exec(u.searchParams.get("parent_id") ?? "");
        if (left) due = due.filter((e) => !left[1].split(",").includes(e.parent));
        if (u.searchParams.has("card_setup_id")) due = due.filter((e) => `eq.${e.card}` === u.searchParams.get("card_setup_id"));
        if (method === "HEAD") return new Response(null, { status: 200, headers: { "content-range": `0-0/${due.length}` } });
        if (u.searchParams.has("limit")) due = due.slice(0, Number(u.searchParams.get("limit")));
        return json(due.map((e) => ({ id: e.card, card_setup_id: e.card, parent_id: e.parent })));
      }
      throw Error("Unexpected request");
    } },
  });
  const transport = { async send(m: EmailMessage) { messages.push(m); return { status: "sent" as const, emailId: "re_real" }; } };
  return { db, claims, messages, transport };
}

describe("welcomes for test families (#804)", () => {
  it("a test family gets no welcome and no claim, while a real family still gets one", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    try {
      const f = testFamilyQueue();
      expect(await runWorkbookWelcomes(f.db, { transport: f.transport, dry: true })).toMatchObject({ pending: 1 });
      expect(await runWorkbookWelcomes(f.db, { transport: f.transport })).toMatchObject({ pending: 1, sent: 1 });
      expect(await runWorkbookWelcomes(f.db, { transport: f.transport })).toMatchObject({ pending: 0, sent: 0 });
      expect(f.claims).toEqual(["real-card"]);
      expect(f.messages).toHaveLength(1);
    } finally { vi.unstubAllEnvs(); }
  });
  it("the card-saved path claims nothing for a test family", async () => {
    const f = testFamilyQueue();
    expect(await sendQueuedWorkbookWelcome(f.db, "test-card", f.transport)).toBeNull();
    expect(await sendQueuedWorkbookWelcome(f.db, "real-card", f.transport)).toMatchObject({ status: "sent" });
    expect(f.claims).toEqual(["real-card"]);
  });
});
