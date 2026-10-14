import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emailConfigProblem, sendEmail, sendEmailOnce, type EmailMessage, type MailTransport, type SendLedger } from "@/lib/email-delivery";
import { memoryLedger, memoryTransport } from "@/lib/email-delivery-memory";

// The parent email delivery module (#149, spec #143), through its public interface only. The in-memory transport stands
// in for Resend and the in-memory ledger keeps the database's guards. Each step of both waits a tick, so two sends at
// once really interleave (the style of the start request tests).
vi.mock("server-only", () => ({}));

const report: EmailMessage = {
  sender: { to: "parent" },
  to: "priya@family.ca",
  subject: "Asha's math report",
  text: "Hi Priya, Asha's report is ready.",
  html: "<p>Hi Priya, Asha's report is ready.</p>",
  replyTo: "hello@unicalearning.com",
};

describe("a send once", () => {
  it("sends the message, and the ledger keeps the email id and the claim's own fields", async () => {
    const mail = memoryTransport();
    const book = memoryLedger<string>();
    const outcome = await sendEmailOnce(book.ledger, "report-email:r1", report, { transport: mail.transport, claimFields: { unsubscribe_hash: "h1" } });
    expect(outcome).toEqual({ status: "sent", emailId: "email-1" });
    expect(mail.delivered).toHaveLength(1);
    expect(book.entry("report-email:r1")).toMatchObject({ state: "sent", emailId: "email-1", fields: { unsubscribe_hash: "h1" } });
  });

  it("sends one email when two sends of one key run at the same time; the other answers busy", async () => {
    const mail = memoryTransport();
    const book = memoryLedger<string>();
    const outcomes = await Promise.all([
      sendEmailOnce(book.ledger, "report-email:r1", report, { transport: mail.transport }),
      sendEmailOnce(book.ledger, "report-email:r1", report, { transport: mail.transport }),
    ]);
    expect(mail.delivered).toHaveLength(1);
    expect(outcomes.map((o) => o.status).sort()).toEqual(["busy", "sent"]);
    expect(book.entry("report-email:r1")).toMatchObject({ state: "sent", emailId: "email-1" });
  });

  it("sends nothing again for a key whose email went", async () => {
    const mail = memoryTransport();
    const book = memoryLedger<string>();
    await sendEmailOnce(book.ledger, "report-email:r1", report, { transport: mail.transport });
    expect(await sendEmailOnce(book.ledger, "report-email:r1", report, { transport: mail.transport })).toEqual({ status: "busy" });
    expect(mail.delivered).toHaveLength(1);
  });

  it("releases the claim when the provider refuses the email, so a second send goes", async () => {
    const mail = memoryTransport();
    const book = memoryLedger<string>();
    mail.answerNext("refuse");
    const first = await sendEmailOnce(book.ledger, "report-email:r1", report, { transport: mail.transport, claimFields: { unsubscribe_hash: "h1" } });
    expect(first).toEqual({ status: "refused", error: "Resend answered 422: refused in the test" });
    expect(mail.delivered).toEqual([]);
    expect(book.entry("report-email:r1")).toMatchObject({ state: "refused", error: "Resend answered 422: refused in the test" });

    const second = await sendEmailOnce(book.ledger, "report-email:r1", report, { transport: mail.transport, claimFields: { unsubscribe_hash: "h2" } });
    expect(second).toEqual({ status: "sent", emailId: "email-1" });
    expect(mail.delivered).toHaveLength(1);
    expect(book.entry("report-email:r1")).toMatchObject({ state: "sent", emailId: "email-1", error: null, fields: { unsubscribe_hash: "h2" } });
  });

  it("keeps the claim when the send ends without an answer, so a second send answers busy", async () => {
    const mail = memoryTransport();
    const book = memoryLedger<string>();
    mail.answerNext("no_answer");
    const first = await sendEmailOnce(book.ledger, "report-email:r1", report, { transport: mail.transport, claimFields: { unsubscribe_hash: "h1" } });
    expect(first).toEqual({ status: "unknown", error: "Resend delivery is unknown: no answer in the test. Check delivery before sending again." });
    expect(book.entry("report-email:r1")).toMatchObject({ state: "unknown", error: first.status === "unknown" && first.error, fields: { unsubscribe_hash: "h1" } });

    expect(await sendEmailOnce(book.ledger, "report-email:r1", report, { transport: mail.transport, claimFields: { unsubscribe_hash: "h2" } })).toEqual({ status: "busy" });
    expect(mail.delivered).toEqual([]);
    // The claim keeps its first token hash, so a link in an email that may have gone keeps working.
    expect(book.entry("report-email:r1")?.fields).toEqual({ unsubscribe_hash: "h1" });
  });

  it("treats a delivered email whose answer was lost as unknown, and never sends it again", async () => {
    const mail = memoryTransport();
    const book = memoryLedger<string>();
    mail.answerNext("lose_answer");
    const first = await sendEmailOnce(book.ledger, "reminder:continue:a1", report, { transport: mail.transport });
    expect(first.status).toBe("unknown");
    expect(mail.delivered).toHaveLength(1);
    const later = await Promise.all([1, 2, 3].map(() => sendEmailOnce(book.ledger, "reminder:continue:a1", report, { transport: mail.transport })));
    expect(later).toEqual([{ status: "busy" }, { status: "busy" }, { status: "busy" }]);
    expect(mail.delivered).toHaveLength(1);
    expect(book.entry("reminder:continue:a1")).toMatchObject({ state: "unknown", emailId: null });
  });

  it("keeps different keys apart", async () => {
    const mail = memoryTransport();
    const book = memoryLedger<{ report: string; email: "parent" | "alert" }>();
    const alert: EmailMessage = { sender: { to: "savar", testSenderName: "Unica Learning reports" }, to: "savar@unicalearning.com", subject: "Report: Priya", text: "A report went out." };
    const outcomes = await Promise.all([
      sendEmailOnce(book.ledger, { report: "r1", email: "parent" }, report, { transport: mail.transport }),
      sendEmailOnce(book.ledger, { report: "r1", email: "alert" }, alert, { transport: mail.transport }),
    ]);
    expect(outcomes.map((o) => o.status)).toEqual(["sent", "sent"]);
    expect(mail.delivered.map((m) => m.to).sort()).toEqual(["priya@family.ca", "savar@unicalearning.com"]);
  });
});

describe("a send without a key", () => {
  it("sends the message once and answers sent with the provider's email id", async () => {
    const mail = memoryTransport();
    const outcome = await sendEmail(report, { transport: mail.transport });
    expect(outcome).toEqual({ status: "sent", emailId: "email-1" });
    expect(mail.delivered).toEqual([{ ...report, emailId: "email-1" }]);
  });

  it("never answers busy: two at once both go, since the caller keeps its own guard", async () => {
    const mail = memoryTransport();
    const outcomes = await Promise.all([sendEmail(report, { transport: mail.transport }), sendEmail(report, { transport: mail.transport })]);
    expect(outcomes.map((o) => o.status)).toEqual(["sent", "sent"]);
    expect(mail.delivered).toHaveLength(2);
  });

  it("answers refused or unknown as the transport does", async () => {
    const mail = memoryTransport();
    mail.answerNext("refuse", "no_answer", "lose_answer");
    const outcomes = [];
    for (let i = 0; i < 3; i++) outcomes.push((await sendEmail(report, { transport: mail.transport })).status);
    expect(outcomes).toEqual(["refused", "unknown", "unknown"]);
    expect(mail.delivered).toHaveLength(1);
  });
});

// The in-memory ledger can copy a production ledger's take-over rule. Here, the report row's (#151): a run that
// stopped after its claim left the claim held; only a parent-email claim older than ten minutes with no email id and
// no unsubscribe token can be taken over, and the alert claim never can.
describe("taking over a claim that a stopped run left", () => {
  const MIN = 60_000;
  type ReportKey = { report: string; email: "parent" | "alert" };
  function reportRows() {
    let clock = Date.UTC(2026, 9, 13, 18, 0);
    const book = memoryLedger<ReportKey>({
      now: () => clock,
      canTakeOver: (held, key, now) => key.email === "parent" && held.emailId === null && !held.fields.unsubscribe_hash && now - held.claimedAt >= 10 * MIN,
    });
    return { book, later: (ms: number) => void (clock += ms) };
  }
  const parent: ReportKey = { report: "r1", email: "parent" };
  const alert: ReportKey = { report: "r1", email: "alert" };

  it("takes over a stale claim the rule allows, and sends once", async () => {
    const { book, later } = reportRows();
    const mail = memoryTransport();
    expect(await book.ledger.claim(parent, {})).not.toBeNull();
    later(9 * MIN);
    expect(await sendEmailOnce(book.ledger, parent, report, { transport: mail.transport })).toEqual({ status: "busy" });
    later(MIN);
    expect(await sendEmailOnce(book.ledger, parent, report, { transport: mail.transport })).toEqual({ status: "sent", emailId: "email-1" });
    expect(book.entry(parent)).toMatchObject({ state: "sent", claims: 2 });
  });

  it("lets only one of two runs take over the same stale claim", async () => {
    const { book, later } = reportRows();
    const mail = memoryTransport();
    await book.ledger.claim(parent, {});
    later(11 * MIN);
    const outcomes = await Promise.all([
      sendEmailOnce(book.ledger, parent, report, { transport: mail.transport }),
      sendEmailOnce(book.ledger, parent, report, { transport: mail.transport }),
    ]);
    expect(outcomes.map((o) => o.status).sort()).toEqual(["busy", "sent"]);
    expect(mail.delivered).toHaveLength(1);
  });

  it("never takes over a claim the rule keeps: one with an unsubscribe token, or the alert", async () => {
    const { book, later } = reportRows();
    const mail = memoryTransport();
    await book.ledger.claim(parent, { unsubscribe_hash: "h1" });
    await book.ledger.claim(alert, {});
    later(60 * MIN);
    expect(await sendEmailOnce(book.ledger, parent, report, { transport: mail.transport, claimFields: { unsubscribe_hash: "h2" } })).toEqual({ status: "busy" });
    expect(await sendEmailOnce(book.ledger, alert, report, { transport: mail.transport })).toEqual({ status: "busy" });
    expect(mail.delivered).toEqual([]);
    expect(book.entry(parent)?.fields).toEqual({ unsubscribe_hash: "h1" });
  });

  it("never takes over an email that went, whatever the rule says", async () => {
    const mail = memoryTransport();
    const book = memoryLedger<string>({ canTakeOver: () => true });
    await sendEmailOnce(book.ledger, "k", report, { transport: mail.transport });
    expect(await sendEmailOnce(book.ledger, "k", report, { transport: mail.transport })).toEqual({ status: "busy" });
    expect(mail.delivered).toHaveLength(1);
  });
});

// Without a transport, the module sends through Resend: the configuration is read there. The network is a stub.
describe("missing configuration", () => {
  function resendStub() {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: unknown) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ id: "re_1" }), { status: 200 });
    });
    return calls;
  }
  beforeEach(() => vi.stubEnv("RESEND_API_KEY", "re_synthetic"));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is refused with the reason and releases the claim; once it is set, the send goes", async () => {
    vi.stubEnv("EMAIL_FROM", "");
    const calls = resendStub();
    const book = memoryLedger<string>();
    expect(emailConfigProblem()).toBe("EMAIL_FROM is not set");
    expect(await sendEmailOnce(book.ledger, "report-email:r1", report)).toEqual({ status: "refused", error: "EMAIL_FROM is not set" });
    expect(book.entry("report-email:r1")).toMatchObject({ state: "refused", error: "EMAIL_FROM is not set" });
    expect(calls).toEqual([]);

    vi.stubEnv("EMAIL_FROM", "Unica Learning <hello@unicalearning.com>");
    expect(emailConfigProblem()).toBeNull();
    expect(await sendEmailOnce(book.ledger, "report-email:r1", report)).toEqual({ status: "sent", emailId: "re_1" });
    expect(calls).toEqual(["https://api.resend.com/emails"]);
  });

  it("is refused with the reason for a send without a key", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const calls = resendStub();
    expect(emailConfigProblem()).toBe("RESEND_API_KEY is not set");
    expect(await sendEmail(report)).toEqual({ status: "refused", error: "RESEND_API_KEY is not set" });
    expect(calls).toEqual([]);
  });
});

describe("a ledger write that throws after the send", () => {
  it("does not hide the outcome: the caller still learns that the email went", async () => {
    const mail = memoryTransport();
    const broken: SendLedger<string, string> = {
      claim: async (key) => key,
      sent: async () => { throw new Error("database down"); },
      refused: async () => { throw new Error("database down"); },
      unknown: async () => { throw new Error("database down"); },
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendEmailOnce(broken, "k", report, { transport: mail.transport })).toEqual({ status: "sent", emailId: "email-1" });
    mail.answerNext("refuse");
    expect((await sendEmailOnce(broken, "k", report, { transport: mail.transport })).status).toBe("refused");
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("a transport that throws", () => {
  const throwing: MailTransport = { send: async () => { throw new Error("socket hang up"); } };

  it("is unknown: the request may have reached the provider", async () => {
    expect(await sendEmail(report, { transport: throwing })).toEqual({
      status: "unknown",
      error: "Email delivery is unknown: socket hang up. Check delivery before sending again.",
    });
  });

  it("keeps the claim of a send once", async () => {
    const book = memoryLedger<string>();
    expect((await sendEmailOnce(book.ledger, "k", report, { transport: throwing })).status).toBe("unknown");
    expect(book.entry("k")?.state).toBe("unknown");
    expect(await sendEmailOnce(book.ledger, "k", report, { transport: memoryTransport().transport })).toEqual({ status: "busy" });
  });
});
