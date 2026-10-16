import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOLERANCE_MS, hideAddresses, parseDeliveryEvent, verifySignature } from "@/lib/resend-webhook";

// Resend's delivery webhook (D-104): the Svix signature check, the event parser, and the route that keeps the events.
const KEY = Buffer.from("synthetic-test-key-0123456789abcdef");
const SECRET = `whsec_${KEY.toString("base64")}`;
const NOW = Date.UTC(2026, 9, 16, 1, 0);
const sign = (id: string, ts: number, body: string, key = KEY) => `v1,${createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")}`;
const headersFor = (body: string, { id = "msg_1", at = NOW, key = KEY } = {}) => {
  const ts = Math.floor(at / 1000);
  return { id, timestamp: String(ts), signature: sign(id, ts, body, key) };
};
const event = (type: string, data: Record<string, unknown> = {}) =>
  JSON.stringify({ type, created_at: "2026-10-16T00:59:00.000Z", data: { email_id: "re_abc", to: ["priya@family.ca"], ...data } });

describe("the signature", () => {
  const body = event("email.delivered");

  it("is accepted when Resend signed this exact body with the secret, within 5 minutes", () => {
    expect(verifySignature(SECRET, headersFor(body), body, NOW)).toBe(true);
    expect(verifySignature(SECRET, headersFor(body, { at: NOW - TOLERANCE_MS }), body, NOW)).toBe(true);
  });

  it("is refused for a changed body, another key, an old or future message, or a missing header", () => {
    expect(verifySignature(SECRET, headersFor(body), body.replace("delivered", "bounced"), NOW)).toBe(false);
    expect(verifySignature(SECRET, headersFor(body, { key: Buffer.from("another-key") }), body, NOW)).toBe(false);
    expect(verifySignature(SECRET, headersFor(body, { at: NOW - TOLERANCE_MS - 1000 }), body, NOW)).toBe(false);
    expect(verifySignature(SECRET, headersFor(body, { at: NOW + TOLERANCE_MS + 1000 }), body, NOW)).toBe(false);
    expect(verifySignature(SECRET, { ...headersFor(body), signature: null }, body, NOW)).toBe(false);
    expect(verifySignature(SECRET, { ...headersFor(body), id: "msg_2" }, body, NOW)).toBe(false);
  });

  it("is accepted when one of several listed signatures matches (a secret being rotated), and only for v1", () => {
    const h = headersFor(body);
    expect(verifySignature(SECRET, { ...h, signature: `v1,AAAA ${h.signature}` }, body, NOW)).toBe(true);
    expect(verifySignature(SECRET, { ...h, signature: h.signature.replace("v1,", "v2,") }, body, NOW)).toBe(false);
  });
});

describe("the event", () => {
  it("keeps the type, Resend's email id and the event's time, and drops the recipient", () => {
    const e = parseDeliveryEvent(event("email.delivered"), NOW);
    expect(e).toEqual({ type: "delivered", emailId: "re_abc", occurredAt: "2026-10-16T00:59:00.000Z", detail: null });
    expect(JSON.stringify(e)).not.toContain("priya");
  });

  it("keeps why it bounced or failed, with the email addresses taken out", () => {
    const bounced = event("email.bounced", { bounce: { type: "Permanent", subType: "General", message: "550 5.1.1 <priya@family.ca>: Recipient address rejected" } });
    expect(parseDeliveryEvent(bounced, NOW)).toMatchObject({ type: "bounced", detail: "Permanent, General: 550 5.1.1 <[address]>: Recipient address rejected" });
    expect(parseDeliveryEvent(event("email.failed", { failed: { reason: "reached_daily_quota" } }), NOW)).toMatchObject({ type: "failed", detail: "reached_daily_quota" });
    expect(parseDeliveryEvent(event("email.complained"), NOW)).toMatchObject({ type: "complained", detail: null });
  });

  it("is not kept for the other types, or without an email id", () => {
    for (const type of ["email.sent", "email.opened", "email.clicked", "email.received", "contact.created"]) expect(parseDeliveryEvent(event(type), NOW)).toBeNull();
    expect(parseDeliveryEvent(JSON.stringify({ type: "email.delivered", data: {} }), NOW)).toBeNull();
  });

  it("takes the time of the request when the event has none", () => {
    expect(parseDeliveryEvent(JSON.stringify({ type: "email.delivered", data: { email_id: "re_1" } }), NOW)?.occurredAt).toBe(new Date(NOW).toISOString());
  });

  it("hides each address in a text", () => {
    expect(hideAddresses("to a.b+c@x.ca and (d@y.org)")).toBe("to [address] and ([address])");
  });
});

// The route, with the store a stub that records each write.
const writes: Record<string, unknown>[] = [];
let storeError: string | null = null;
vi.mock("@/lib/supabase-auth", () => ({
  adminClient: () => ({
    from: (table: string) => ({
      upsert: async (row: Record<string, unknown>, options: Record<string, unknown>) => {
        writes.push({ table, row, options });
        return { error: storeError ? { message: storeError } : null };
      },
    }),
  }),
}));
const { POST } = await import("@/app/api/resend-webhook/route");

describe("the webhook route", () => {
  const post = (body: string, h = headersFor(body, { at: Date.now() })) =>
    POST(new Request("https://unicalearning.com/api/resend-webhook", { method: "POST", body, headers: { "svix-id": h.id, "svix-timestamp": h.timestamp, "svix-signature": h.signature } }));
  beforeEach(() => {
    writes.length = 0;
    storeError = null;
    vi.stubEnv("RESEND_WEBHOOK_SECRET", SECRET);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("keeps a signed delivery event once per message, and answers 204", async () => {
    const body = event("email.bounced", { bounce: { type: "Permanent", message: "no such user priya@family.ca" } });
    const res = await post(body);
    expect(res.status).toBe(204);
    expect(writes).toEqual([{
      table: "email_events",
      row: { webhook_id: "msg_1", email_id: "re_abc", type: "bounced", occurred_at: "2026-10-16T00:59:00.000Z", detail: "Permanent: no such user [address]" },
      options: { onConflict: "webhook_id", ignoreDuplicates: true },
    }]);
  });

  it("refuses an unsigned or wrongly signed message and keeps nothing", async () => {
    const body = event("email.delivered");
    // Timestamps are current, so only the signature can refuse these.
    expect((await post(body, { ...headersFor(body, { at: Date.now() }), signature: "v1,AAAA" })).status).toBe(401);
    expect((await post(body, headersFor(body, { at: Date.now(), key: Buffer.from("x") }))).status).toBe(401);
    expect((await post(body, headersFor(body, { at: Date.now() - TOLERANCE_MS - 60_000 }))).status).toBe(401);
    expect(writes).toEqual([]);
  });

  it("takes a type it does not keep without a write", async () => {
    expect((await post(event("email.opened"))).status).toBe(204);
    expect(writes).toEqual([]);
  });

  it("answers 500 when the store fails, so Resend sends the message again", async () => {
    storeError = "connection reset";
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post(event("email.delivered"))).status).toBe(500);
    error.mockRestore();
  });

  it("answers 503 without the secret, and keeps nothing", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post(event("email.delivered"))).status).toBe(503);
    expect(writes).toEqual([]);
    error.mockRestore();
  });
});
