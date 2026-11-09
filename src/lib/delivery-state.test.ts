import { describe, expect, it } from "vitest";
import { DELIVERY_STATES, DELIVERY_STATUS, DELIVERY_WORDS, logDeliveryState, reportAlertState, reportEmailState, type DeliveryState } from "@/lib/delivery-state";
import { LOG_STATUSES } from "@/lib/email-log-kinds";

const T = "2026-11-09T20:00:00.000Z";

describe("the send state of each ledger row", () => {
  // Every reachable row of the report email (report-row-ledger.ts): claim sets emailed_at, sent sets email_id, refused
  // clears emailed_at and sets email_error, unknown keeps emailed_at and sets email_error.
  it.each<[string, { emailed_at: string | null; email_id: string | null; email_error: string | null }, DeliveryState]>([
    ["not claimed yet", { emailed_at: null, email_id: null, email_error: null }, "unsent"],
    ["claimed, no answer yet", { emailed_at: T, email_id: null, email_error: null }, "claimed"],
    ["sent", { emailed_at: T, email_id: "re_1", email_error: null }, "sent"],
    ["sent on a retry after an error", { emailed_at: T, email_id: "re_1", email_error: "Resend 500" }, "sent"],
    ["refused (claim released)", { emailed_at: null, email_id: null, email_error: "Resend 422" }, "refused"],
    ["unknown (claim kept)", { emailed_at: T, email_id: null, email_error: "timeout" }, "unknown"],
  ])("report email: %s", (_, row, state) => expect(reportEmailState(row)).toBe(state));

  // The alert has no id column: sent only clears alert_error, so a held claim and a sent alert look the same.
  it.each<[string, { alerted_at: string | null; alert_error: string | null }, DeliveryState]>([
    ["not claimed yet", { alerted_at: null, alert_error: null }, "unsent"],
    ["claimed or sent", { alerted_at: T, alert_error: null }, "sent"],
    ["refused (claim released)", { alerted_at: null, alert_error: "Resend 422" }, "refused"],
    ["unknown (claim kept)", { alerted_at: T, alert_error: "timeout" }, "unknown"],
  ])("report alert: %s", (_, row, state) => expect(reportAlertState(row)).toBe(state));

  // email_log (reminder-store.ts and the two stores of the same shape): unknown is "claimed" with an error.
  it.each<[string, (typeof LOG_STATUSES)[number] | null, string | null, DeliveryState]>([
    ["no status (an unsubscribe row)", null, null, "unsent"],
    ["claimed, no answer yet", "claimed", null, "claimed"],
    ["claimed with an error (unknown)", "claimed", "timeout", "unknown"],
    ["sent", "sent", null, "sent"],
    ["failed", "failed", "Resend 422", "refused"],
  ])("email log: %s", (_, status, error, state) => expect(logDeliveryState(status, error)).toBe(state));

  it("every log status has a state", () => {
    for (const s of LOG_STATUSES) expect(DELIVERY_STATES).toContain(logDeliveryState(s, null));
  });
});

describe("what the admin shows for each state", () => {
  it("counts only a sent email as sent, and a refused one as failed", () => {
    expect(DELIVERY_STATUS).toEqual({ unsent: "pending", claimed: "pending", sent: "sent", refused: "failed", unknown: "pending" });
  });
  it("has words for every state", () => {
    for (const s of DELIVERY_STATES) expect(DELIVERY_WORDS[s].length).toBeGreaterThan(0);
    expect(new Set(Object.values(DELIVERY_WORDS)).size).toBe(DELIVERY_STATES.length);
  });
});
