import { describe, expect, it, vi } from "vitest";
import { sendEmailOnce, type EmailMessage } from "@/lib/email-delivery";
import { memoryTransport } from "@/lib/email-delivery-memory";
import { memoryReportLedger } from "@/lib/report-row-ledger-memory";

// The report row ledger's rules (#151, spec #143), through the in-memory ledger that copies them: the claims of the
// report email and the report alert live on the report row. A run that stopped after its claim leaves the claim held.
// Only a parent-email claim older than ten minutes with no email id and no unsubscribe token can be taken over; the
// alert claim never can. Each step waits a tick, so two runs at once really interleave.
vi.mock("server-only", () => ({}));

const MIN = 60_000;
const parent = { report: "r1", email: "parent" } as const;
const alert = { report: "r1", email: "alert" } as const;
const email: EmailMessage = { sender: { to: "parent" }, to: "priya@family.ca", subject: "Asha's math report is ready", text: "Hi Priya," };

function reportRows() {
  let clock = Date.UTC(2026, 9, 13, 18, 0);
  const book = memoryReportLedger({ now: () => clock });
  return { book, later: (ms: number) => void (clock += ms) };
}

describe("the report row ledger's take-over rule", () => {
  it("takes over a parent-email claim with no token and no email id once it is older than ten minutes", async () => {
    const { book, later } = reportRows();
    const mail = memoryTransport();
    // A run from before the unsubscribe token (#80) claimed the email, then stopped.
    expect(await book.ledger.claim(parent, {})).not.toBeNull();
    later(10 * MIN);
    expect(await sendEmailOnce(book.ledger, parent, email, { transport: mail.transport })).toEqual({ status: "busy" });
    later(1);
    expect(await sendEmailOnce(book.ledger, parent, email, { transport: mail.transport, claimFields: { unsubscribe_hash: "h2" } })).toEqual({ status: "sent", emailId: "email-1" });
    expect(mail.delivered).toHaveLength(1);
    expect(book.entry(parent)).toMatchObject({ state: "sent", claims: 2, fields: { unsubscribe_hash: "h2" } });
  });

  it("lets only one of two runs take over the same stale claim", async () => {
    const { book, later } = reportRows();
    const mail = memoryTransport();
    await book.ledger.claim(parent, {});
    later(11 * MIN);
    const outcomes = await Promise.all([
      sendEmailOnce(book.ledger, parent, email, { transport: mail.transport, claimFields: { unsubscribe_hash: "h2" } }),
      sendEmailOnce(book.ledger, parent, email, { transport: mail.transport, claimFields: { unsubscribe_hash: "h3" } }),
    ]);
    expect(outcomes.map((o) => o.status).sort()).toEqual(["busy", "sent"]);
    expect(mail.delivered).toHaveLength(1);
  });

  it("never takes over a claim that holds an unsubscribe token, so a delivered link keeps working", async () => {
    const { book, later } = reportRows();
    const mail = memoryTransport();
    // The email went, then its answer was lost: the outcome is unknown and the claim stays with its token's hash.
    mail.answerNext("lose_answer");
    expect((await sendEmailOnce(book.ledger, parent, email, { transport: mail.transport, claimFields: { unsubscribe_hash: "h1" } })).status).toBe("unknown");
    later(24 * 60 * MIN);
    expect(await sendEmailOnce(book.ledger, parent, email, { transport: mail.transport, claimFields: { unsubscribe_hash: "h2" } })).toEqual({ status: "busy" });
    expect(mail.delivered).toHaveLength(1);
    expect(book.entry(parent)).toMatchObject({ state: "unknown", fields: { unsubscribe_hash: "h1" } });
  });

  it("never takes over the alert claim, however old", async () => {
    const { book, later } = reportRows();
    const mail = memoryTransport();
    await book.ledger.claim(alert, {});
    later(24 * 60 * MIN);
    expect(await sendEmailOnce(book.ledger, alert, email, { transport: mail.transport })).toEqual({ status: "busy" });
    expect(mail.delivered).toEqual([]);
  });

  it("never claims a parent email that went, however old", async () => {
    const { book, later } = reportRows();
    const mail = memoryTransport();
    await sendEmailOnce(book.ledger, parent, email, { transport: mail.transport });
    later(24 * 60 * MIN);
    expect(await sendEmailOnce(book.ledger, parent, email, { transport: mail.transport })).toEqual({ status: "busy" });
    expect(mail.delivered).toHaveLength(1);
  });

  it("lets a later run send a refused email again, with a new token", async () => {
    const { book } = reportRows();
    const mail = memoryTransport();
    mail.answerNext("refuse");
    expect((await sendEmailOnce(book.ledger, parent, email, { transport: mail.transport, claimFields: { unsubscribe_hash: "h1" } })).status).toBe("refused");
    expect(await sendEmailOnce(book.ledger, parent, email, { transport: mail.transport, claimFields: { unsubscribe_hash: "h2" } })).toEqual({ status: "sent", emailId: "email-1" });
    expect(book.entry(parent)).toMatchObject({ state: "sent", error: null, fields: { unsubscribe_hash: "h2" } });
  });
});

describe("whether the parent email went", () => {
  it("is yes only once the email went: not while it is claimed, refused or unknown", async () => {
    const mail = memoryTransport();
    const book = memoryReportLedger();
    expect(await book.ledger.parentEmailSent("r1")).toBe(false);
    mail.answerNext("refuse");
    await sendEmailOnce(book.ledger, parent, email, { transport: mail.transport });
    expect(await book.ledger.parentEmailSent("r1")).toBe(false);
    await sendEmailOnce(book.ledger, parent, email, { transport: mail.transport });
    expect(await book.ledger.parentEmailSent("r1")).toBe(true);
    expect(await book.ledger.parentEmailSent("r2")).toBe(false);

    const other = memoryReportLedger();
    mail.answerNext("no_answer");
    await sendEmailOnce(other.ledger, parent, email, { transport: mail.transport });
    expect(await other.ledger.parentEmailSent("r1")).toBe(false);
  });

  it("is about the parent email only: a sent alert does not count", async () => {
    const book = memoryReportLedger();
    await sendEmailOnce(book.ledger, alert, email, { transport: memoryTransport().transport });
    expect(await book.ledger.parentEmailSent("r1")).toBe(false);
  });
});
