import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TablesInsert } from "@/lib/database";
import { recordSendsWith, sendEmail, sendEmailOnce, sendEmailOnceInTime, type EmailMessage } from "@/lib/email-delivery";
import { memoryLedger, memoryTransport } from "@/lib/email-delivery-memory";
import { SECRET_SEND_KINDS } from "@/lib/email-send-kinds";
import { sendRow } from "@/lib/email-sends";

// The send log (public.email_sends): the delivery module writes one row per attempt of a tagged message, so the admin
// Emails page shows every email. Through the module's public interface, with the in-memory transport and ledger and a
// recorder that keeps the rows.
vi.mock("server-only", () => ({}));

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const scanLink: EmailMessage = {
  sender: { to: "parent" }, to: "priya@family.ca", replyTo: "contact@unicalearning.com",
  subject: "Take pictures of Asha's workbook pages", text: "Open https://unicalearning.com/account/scan?t=secret123", html: "<a href=\"https://unicalearning.com/x?a=1&amp;t=secret123\">Open</a>",
  log: { kind: "scan_link", parentId: PARENT, childId: CHILD },
};

let rows: TablesInsert<"email_sends">[];
let restore: () => void;
beforeEach(() => {
  rows = [];
  restore = recordSendsWith(async (row) => { rows.push(row); });
  vi.stubEnv("EMAIL_FROM", "Unica Learning <contact@unicalearning.com>");
});
afterEach(() => {
  restore();
  vi.unstubAllEnvs();
});

describe("a tagged send", () => {
  it("writes one row with the outcome, Resend's id and a copy with the link tokens hidden", async () => {
    const mail = memoryTransport();
    expect(await sendEmail(scanLink, { transport: mail.transport })).toEqual({ status: "sent", emailId: "email-1" });
    expect(rows).toEqual([{
      kind: "scan_link", parent_id: PARENT, child_id: CHILD, outcome: "sent", email_id: "email-1", error: null,
      from_address: "Unica Learning <contact@unicalearning.com>", to_address: "priya@family.ca", reply_to: "contact@unicalearning.com",
      subject: "Take pictures of Asha's workbook pages",
      text_body: "Open https://unicalearning.com/account/scan?t=hidden", html_body: "<a href=\"https://unicalearning.com/x?a=1&amp;t=hidden\">Open</a>",
    }]);
  });

  it("never hands the tag to the transport", async () => {
    const mail = memoryTransport();
    await sendEmail(scanLink, { transport: mail.transport });
    expect(mail.delivered[0]).not.toHaveProperty("log");
  });

  it("writes a row per attempt of a send once: the refusal, then the send; none for a busy claim", async () => {
    const mail = memoryTransport();
    const book = memoryLedger<string>();
    const alert: EmailMessage = { sender: { to: "savar" }, to: "team@example.com", subject: "A plan start needs the team", text: "Card setup: c1", log: { kind: "plan_start_alert" } };
    mail.answerNext("refuse");
    expect((await sendEmailOnce(book.ledger, "c1", alert, { transport: mail.transport })).status).toBe("refused");
    expect((await sendEmailOnce(book.ledger, "c1", alert, { transport: mail.transport })).status).toBe("sent");
    expect((await sendEmailOnce(book.ledger, "c1", alert, { transport: mail.transport })).status).toBe("busy");
    expect(rows.map((r) => [r.kind, r.parent_id, r.outcome, r.email_id, r.error])).toEqual([
      ["plan_start_alert", null, "refused", null, "Resend answered 422: refused in the test"],
      ["plan_start_alert", null, "sent", "email-1", null],
    ]);
  });

  it("writes an unknown outcome, and nothing when the time ran out before the send", async () => {
    const mail = memoryTransport();
    const book = memoryLedger<string>();
    const ledger = { ...book.ledger, release: async () => true };
    const digest: EmailMessage = { sender: { to: "savar" }, to: "team@example.com", subject: "Unica daily digest", text: "Nothing new", log: { kind: "team_digest" } };
    mail.answerNext("no_answer");
    expect((await sendEmailOnceInTime(ledger, "d1", digest, { transport: mail.transport, inTime: () => true })).status).toBe("unknown");
    expect((await sendEmailOnceInTime(ledger, "d2", digest, { transport: mail.transport, inTime: () => false })).status).toBe("not_sent");
    expect(rows.map((r) => [r.kind, r.outcome])).toEqual([["team_digest", "unknown"]]);
  });

  it("keeps the outcome when the row cannot be written", async () => {
    restore();
    restore = recordSendsWith(async () => { throw new Error("database down"); });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await sendEmail(scanLink, { transport: memoryTransport().transport })).status).toBe("sent");
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("writes nothing for a message with no tag (its own ledger keeps it)", async () => {
    await sendEmail({ ...scanLink, log: undefined }, { transport: memoryTransport().transport });
    expect(rows).toEqual([]);
  });
});

describe("the emails with a secret", () => {
  it.each(SECRET_SEND_KINDS)("%s keeps only the kind, the family, the outcome and Resend's id", async (kind) => {
    const mail = memoryTransport();
    await sendEmail({ ...scanLink, subject: "Your code: 123456", text: "Code 123456", log: { kind, parentId: PARENT, childId: CHILD } }, { transport: mail.transport });
    expect(rows).toEqual([{
      kind, parent_id: PARENT, child_id: null, outcome: "sent", email_id: "email-1", error: null, from_address: "Unica Learning <contact@unicalearning.com>",
      to_address: null, reply_to: null, subject: null, text_body: null, html_body: null,
    }]);
  });
});

describe("the team digest", () => {
  it("keeps no copy, subject or address: its body names many families", async () => {
    const mail = memoryTransport();
    await sendEmail({ ...scanLink, subject: "Daily digest", text: "Family ee06 flagged", log: { kind: "team_digest" } }, { transport: mail.transport });
    expect(rows).toEqual([{
      kind: "team_digest", parent_id: null, child_id: null, outcome: "sent", email_id: "email-1", error: null, from_address: "Unica Learning <contact@unicalearning.com>",
      to_address: null, reply_to: null, subject: null, text_body: null, html_body: null,
    }]);
  });
});

describe("a row", () => {
  it("keeps no stand-in id and cuts a long error", () => {
    const row = sendRow({ kind: "team_digest" }, { to: "t@example.com", subject: "s", text: "t" }, { outcome: "sent", emailId: "sent", error: null, from: null });
    expect(row.email_id).toBeNull();
    const refused = sendRow({ kind: "team_digest" }, { to: "t@example.com", subject: "s", text: "t" }, { outcome: "refused", emailId: null, error: "x".repeat(900), from: null });
    expect(refused.error).toHaveLength(500);
  });
});
