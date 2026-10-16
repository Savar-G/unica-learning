import { createHmac, timingSafeEqual } from "node:crypto";

// Resend's delivery webhook (D-104): what happened to an email after Resend took it. Pure: the route
// (src/app/api/resend-webhook/route.ts) passes the raw body, the Svix headers, the secret and the clock.
//
// Resend signs each message the Svix way: the base64 HMAC-SHA256 of "<svix-id>.<svix-timestamp>.<raw body>", with the
// key in the signing secret ("whsec_" + base64). The svix-signature header lists one or more "v1,<signature>" values,
// separated by spaces. https://docs.svix.com/receiving/verifying-payloads/how-manual

/** A message older or newer than this is refused, so a captured message cannot be sent again later. */
export const TOLERANCE_MS = 5 * 60_000;

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/** Whether Resend signed this message with `secret`, within the time tolerance of `now`. */
export function verifySignature(secret: string, headers: SvixHeaders, body: string, now: number): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(now - Number(timestamp) * 1000) > TOLERANCE_MS) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** The delivery events the site keeps. The others (sent, opened, clicked, received) are answered and dropped. */
export const DELIVERY_TYPES = ["delivered", "delivery_delayed", "bounced", "complained", "failed", "suppressed"] as const;
export type DeliveryType = (typeof DELIVERY_TYPES)[number];

export interface DeliveryEvent {
  type: DeliveryType;
  emailId: string;
  occurredAt: string;
  /** Why it bounced or failed, with every email address taken out; null when Resend gives no reason. */
  detail: string | null;
}

/** Every email address in `s`, replaced, so a kept reason names nobody. */
export const hideAddresses = (s: string) => s.replace(/[^\s<>()"',;:]+@[^\s<>()"',;:]+/g, "[address]");

const text = (v: unknown) => (typeof v === "string" ? v : null);

/**
 * The delivery event in a webhook body, or null when the body is not one the site keeps (another type, or no email id).
 * `now` stands in for an event without a time. Throws on a body that is not JSON.
 */
export function parseDeliveryEvent(body: string, now: number): DeliveryEvent | null {
  const event = JSON.parse(body) as { type?: unknown; created_at?: unknown; data?: Record<string, unknown> };
  const type = text(event.type)?.replace(/^email\./, "");
  if (!type || !(DELIVERY_TYPES as readonly string[]).includes(type)) return null;
  const data = event.data ?? {};
  const emailId = text(data.email_id);
  if (!emailId) return null;
  const at = Date.parse(text(event.created_at) ?? text(data.created_at) ?? "");
  const bounce = data.bounce as { type?: unknown; subType?: unknown; message?: unknown } | undefined;
  const failed = data.failed as { reason?: unknown } | undefined;
  const reason = bounce
    ? [text(bounce.type), text(bounce.subType)].filter(Boolean).join(", ") + (text(bounce.message) ? `: ${text(bounce.message)}` : "")
    : text(failed?.reason);
  return {
    type: type as DeliveryType,
    emailId: emailId.slice(0, 100),
    occurredAt: new Date(Number.isNaN(at) ? now : at).toISOString(),
    detail: reason ? hideAddresses(reason).slice(0, 500) : null,
  };
}
