import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import type { EmailMessage, MailTransport, SendResult } from "@/lib/email-delivery";
import { planStartEmailClaim, sendPlanStartEmail, sendWorkbookNotice, workbookEmailLedger, type WorkbookNotice } from "@/lib/workbook-email-server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/stripe", () => ({ stripe: () => null, keepSavedPlan: vi.fn() }));

const notice: WorkbookNotice = { cardId: "card-1", kind: "dispatch", workbookNumber: 1, delivery: { method: "mail", carrier: "Test carrier", trackingNumber: "A123", trackingUrl: "" } };
type Row = { id: string; status: string; claim_token: string; delivery: unknown; to_address: string; subject: string; text_body: string };
function fixture() {
  const rows = new Map<string, Row>();
  let claimError = false, outcomeError = false, saved = true;
  const requests: URL[] = [];
  const db = createClient<Database>("https://fixture.invalid", "sb_secret_synthetic", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input)); requests.push(url);
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
      if (url.pathname.endsWith("/card_setups")) return json([{ parent_id: "parent-1", child_id: "child-1", card_saved_at: saved ? "2026-11-01T00:00:00Z" : null }]);
      if (url.pathname.endsWith("/parents")) return json([{ name: "Priya", email: "real-parent@example.com" }]);
      if (url.pathname.endsWith("/children")) return json([{ first_name: "Asha" }]);
      if (url.pathname.endsWith("/rpc/claim_workbook_email")) {
        if (claimError) return json({ message: "Claim failed" }, 503);
        const p = JSON.parse(String(init?.body));
        const key = `${p.p_card_setup_id}:${p.p_kind}:${p.p_workbook_number}`;
        const old = rows.get(key);
        if (old && old.status !== "failed") return json([]);
        const row = { id: old?.id ?? `email-${rows.size}`, status: "sending", claim_token: p.p_token, delivery: p.p_delivery,
          to_address: p.p_message.to, subject: p.p_message.subject, text_body: p.p_message.text };
        rows.set(key, row);
        return json([{ id: row.id, claim_token: row.claim_token }]);
      }
      if (url.pathname.endsWith("/workbook_emails") && init?.method === "PATCH") {
        if (outcomeError) return json({ message: "Outcome failed" }, 503);
        const row = [...rows.values()].find((r) => `eq.${r.id}` === url.searchParams.get("id") && `eq.${r.claim_token}` === url.searchParams.get("claim_token") && `eq.${r.status}` === url.searchParams.get("status"));
        if (row) Object.assign(row, JSON.parse(String(init.body)));
        return json(null);
      }
      throw Error(`Unexpected request: ${url.pathname}`);
    } },
  });
  const messages: EmailMessage[] = [];
  let result: SendResult = { status: "sent", emailId: "provider-1" };
  const transport: MailTransport = { async send(m) { messages.push(m); return result; } };
  return { db, rows, messages, requests, transport, failClaim: () => { claimError = true; }, failOutcome: () => { outcomeError = true; }, noCard: () => { saved = false; }, refuse: () => { result = { status: "refused", error: "Refused" }; }, unknown: () => { result = { status: "unknown", error: "Lost response" }; } };
}

describe("workbook email delivery through its public server interface", () => {
  it("concurrent ready clicks send once, separately from the shared hand/courier dispatch key", async () => {
    const f = fixture();
    const ready: WorkbookNotice = { ...notice, kind: "ready", delivery: null };
    const outcomes = await Promise.all([sendWorkbookNotice(f.db, ready, f.transport), sendWorkbookNotice(f.db, ready, f.transport)]);
    expect(outcomes.map((r) => r.status).sort()).toEqual(["busy", "sent"]);
    const dispatches = await Promise.all([
      sendWorkbookNotice(f.db, { ...notice, delivery: { method: "hand" } }, f.transport),
      sendWorkbookNotice(f.db, notice, f.transport),
    ]);
    expect(dispatches.map((r) => r.status).sort()).toEqual(["busy", "sent"]);
    expect(f.messages).toHaveLength(2);
    expect(f.messages[0].text).toContain("ready and will be shipped soon");
    expect([...f.rows.values()].every((r) => r.status === "sent")).toBe(true);
    expect(f.requests.filter((r) => !r.pathname.endsWith("/rpc/claim_workbook_email") && !r.pathname.endsWith("/workbook_emails")).every((r) => ["/rest/v1/card_setups", "/rest/v1/parents", "/rest/v1/children"].includes(r.pathname))).toBe(true);
  });
  it("sends once under concurrent clicks and takes the recipient from the saved card's family", async () => {
    const f = fixture();
    const outcomes = await Promise.all([sendWorkbookNotice(f.db, notice, f.transport), sendWorkbookNotice(f.db, notice, f.transport)]);
    expect(outcomes.map((r) => r.status).sort()).toEqual(["busy", "sent"]);
    expect(f.messages).toHaveLength(1);
    expect(f.messages[0].to).toBe("real-parent@example.com");
    expect(f.messages[0].text).toContain("Tracking number: A123");
    expect(f.requests.find((u) => u.pathname.endsWith("/children"))?.searchParams.get("parent_id")).toBe("eq.parent-1");
  });
  it("gives each workbook a distinct notice", async () => {
    const f = fixture();
    await sendWorkbookNotice(f.db, notice, f.transport);
    await sendWorkbookNotice(f.db, { ...notice, workbookNumber: 2 }, f.transport);
    expect(f.messages).toHaveLength(2);
  });
  it("retries a definite refusal and records the corrected tracking details", async () => {
    const f = fixture(); f.refuse();
    expect((await sendWorkbookNotice(f.db, notice, f.transport)).status).toBe("refused");
    const corrected = { ...notice, delivery: { method: "hand" as const } };
    await sendWorkbookNotice(f.db, corrected, f.transport);
    expect(f.messages).toHaveLength(2);
    expect(f.messages[1].text).toContain("hand delivery");
    expect([...f.rows.values()][0].delivery).toEqual({ method: "hand" });
  });
  it("does not resend after an uncertain outcome", async () => {
    const f = fixture(); f.unknown();
    expect((await sendWorkbookNotice(f.db, notice, f.transport)).status).toBe("unknown");
    expect((await sendWorkbookNotice(f.db, notice, f.transport)).status).toBe("busy");
    expect(f.messages).toHaveLength(1);
  });
  it("keeps the send held when the provider accepted it but the outcome write failed", async () => {
    const f = fixture(); f.failOutcome();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await sendWorkbookNotice(f.db, notice, f.transport);
      expect((await sendWorkbookNotice(f.db, notice, f.transport)).status).toBe("busy");
      expect(f.messages).toHaveLength(1);
      expect([...f.rows.values()][0].status).toBe("sending");
    } finally { log.mockRestore(); }
  });
  it("sends nothing when the claim fails or no saved card is confirmed", async () => {
    const f = fixture(); f.failClaim();
    await expect(sendWorkbookNotice(f.db, notice, f.transport)).rejects.toThrow();
    expect(f.messages).toHaveLength(0);
    f.noCard();
    await expect(sendWorkbookNotice(f.db, notice, f.transport)).rejects.toThrow("card_not_saved");
    expect(f.messages).toHaveLength(0);
  });
  it("rejects an old claim's outcome after a refusal was claimed again", async () => {
    const f = fixture();
    const ledger = workbookEmailLedger(f.db, { sender: { to: "parent" }, to: "parent@example.com", subject: "Test", text: "Test" });
    const first = await ledger.claim(notice, {});
    expect(first).not.toBeNull();
    await ledger.refused(first!, "Refused");
    const second = await ledger.claim(notice, {});
    expect(second).not.toBeNull();
    await ledger.sent(first!, "old-email");
    expect([...f.rows.values()][0].status).toBe("sending");
    await ledger.sent(second!, "new-email");
    expect([...f.rows.values()][0].status).toBe("sent");
  });
});

describe("the plan start email, one per generation (review round 5 of PR #593)", () => {
  type Claim = { email_send_status: string; email_claim_token: string; email_claimed_at: string };
  function planFixture() {
    const records = new Map<number, Claim>([[1, { email_send_status: "", email_claim_token: "", email_claimed_at: "" }], [2, { email_send_status: "", email_claim_token: "", email_claimed_at: "" }]]);
    const legacy: number[] = [];
    const db = createClient<Database>("https://fixture.invalid", "sb_secret_synthetic", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (input, init) => {
        const url = new URL(String(input));
        const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (url.pathname.endsWith("/card_setups")) return json([{ parent_id: "parent-1", child_id: "child-1" }]);
        if (url.pathname.endsWith("/parents")) return json([{ name: "Priya", email: "real-parent@example.com", postal: "V3S 1A1", time_zone: null }]);
        if (url.pathname.endsWith("/children")) return json([{ first_name: "Asha", province: "BC" }]);
        // The old ledger's one key, for a head that still uses it: a second send with the same key finds it taken.
        if (url.pathname.endsWith("/rpc/claim_workbook_email")) { legacy.push(body.p_workbook_number); return json(legacy.length === 1 ? [{ id: "e1", claim_token: body.p_token }] : []); }
        if (url.pathname.endsWith("/workbook_emails")) return json(null);
        if (url.pathname.endsWith("/rpc/claim_plan_start_email")) {
          const row = records.get(body.p_generation)!;
          if (row.email_send_status && row.email_send_status !== "failed") return json(false);
          Object.assign(row, { email_send_status: "sending", email_claim_token: body.p_token, email_claimed_at: new Date().toISOString() });
          return json(true);
        }
        if (url.pathname.endsWith("/rpc/note_plan_start_email_send")) {
          const row = records.get(body.p_generation)!;
          if (row.email_claim_token === body.p_token) row.email_send_status = body.p_status;
          return json(true);
        }
        if (url.pathname.endsWith("/rpc/release_plan_start_email")) {
          const row = records.get(body.p_generation)!;
          if (row.email_claim_token === body.p_token) row.email_send_status = "";
          return json(true);
        }
        if (url.pathname.endsWith("/plan_starts")) return json([records.get(Number(url.searchParams.get("generation")?.replace("eq.", "")))]);
        throw Error(`Unexpected request: ${url.pathname}`);
      } },
    });
    const messages: EmailMessage[] = [];
    const transport: MailTransport = { async send(m) { messages.push(m); return { status: "sent", emailId: "provider-1" }; } };
    return { db, records, messages, transport };
  }
  const key = (generation: number) => ({ cardId: "card-1", generation, price: 79.99, firstChargeAt: "2026-12-05T18:00:00.000Z", origin: "https://unica.test" });

  it("two generations send two emails, and the same generation sends one", async () => {
    const f = planFixture();
    expect((await sendPlanStartEmail(f.db, key(1), f.transport)).status).toBe("sent");
    expect((await sendPlanStartEmail(f.db, key(1), f.transport)).status).toBe("busy");
    expect((await sendPlanStartEmail(f.db, key(2), f.transport)).status).toBe("sent");
    expect(f.messages).toHaveLength(2);
  });
  it("reads each generation's claim on its own", async () => {
    const f = planFixture();
    await sendPlanStartEmail(f.db, key(1), f.transport);
    expect(await planStartEmailClaim(f.db, "card-1", 1)).toBe("sent");
    expect(await planStartEmailClaim(f.db, "card-1", 2)).toBe("pending");
  });
  it("gives the claim back when the time ran out, with nothing sent, so the next send goes", async () => {
    const f = planFixture();
    expect(await sendPlanStartEmail(f.db, key(2), f.transport, () => false)).toEqual({ status: "not_sent", released: true });
    expect(f.messages).toEqual([]);
    expect((await sendPlanStartEmail(f.db, key(2), f.transport)).status).toBe("sent");
    expect(f.messages).toHaveLength(1);
  });
  it("a claim held for 10 minutes reads as unknown, as the email may have gone", async () => {
    const f = planFixture();
    Object.assign(f.records.get(1)!, { email_send_status: "sending", email_claim_token: "t", email_claimed_at: new Date(1_000_000).toISOString() });
    expect(await planStartEmailClaim(f.db, "card-1", 1, 1_000_000 + 9 * 60_000)).toBe("pending");
    expect(await planStartEmailClaim(f.db, "card-1", 1, 1_000_000 + 10 * 60_000)).toBe("unknown");
  });
});
