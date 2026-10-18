import { describe, expect, it, vi } from "vitest";
import { copyRow, hideTokens } from "@/lib/email-copies";
import { reminderEmail } from "@/lib/reminder-email";
import { reminderLinks } from "@/lib/reminder-store";
import { newToken } from "@/lib/sign-in-link";

// The email copies (D-103): a copy shows the email the way it was sent, without the secret in its links.
vi.mock("server-only", () => ({}));

describe("the copy of a reminder", () => {
  const { token } = newToken();
  const r = { kind: "start_followup" as const, parentId: "p1", childId: "c1", assessmentId: null, dueAt: 0, retry: null };
  const links = reminderLinks("https://unicalearning.com", r, token);
  const mail = reminderEmail({ kind: "start_followup", parentName: "Priya Shah", childName: "Maya", url: links.url, unsubscribeUrl: links.unsubscribeUrl, postal: "V3S 1A1", total: 30 });
  const message = { sender: { to: "parent" as const }, to: "priya@family.ca", replyTo: "help@unicalearning.com", ...mail, headers: { "List-Unsubscribe": `<${links.oneClickUrl}>` } };
  const row = copyRow({ emailLogId: "l1" }, "p1", { from: "Unica Learning <contact@unicalearning.com>", message, outcome: "sent", emailId: "re_123" });

  it("keeps the email as it was sent: sender, recipient, subject and both bodies", () => {
    expect(row).toMatchObject({
      parent_id: "p1", email_log_id: "l1", outcome: "sent", email_id: "re_123", from_address: "Unica Learning <contact@unicalearning.com>",
      to_address: "priya@family.ca", reply_to: "help@unicalearning.com", subject: "Last reminder: Maya's free math test",
    });
    expect(row.text_body).toContain("Maya has not started the free math placement test yet.");
    expect(row.html_body).toContain("Start Maya&#39;s test");
    expect(row).not.toHaveProperty("report_id");
  });

  it("does not keep the unsubscribe token, in the text or the HTML", () => {
    expect(message.text).toContain(token);
    expect(message.html).toContain(token);
    expect(row.text_body).not.toContain(token);
    expect(row.html_body).not.toContain(token);
    expect(row.text_body).toContain("https://unicalearning.com/unsubscribe?t=hidden");
    expect(row.html_body).toContain('href="https://unicalearning.com/unsubscribe?t=hidden"');
    // The start link has no secret: it stays as sent.
    expect(row.html_body).toContain("https://unicalearning.com/account/start/c1?reminder=start_followup");
  });
});

describe("the copy of a report email", () => {
  it("names the report and which of its emails it is", () => {
    const message = { sender: { to: "savar" as const, testSenderName: "Unica" }, to: "savar@x.ca", subject: "Test finished", text: "Done." };
    expect(copyRow({ reportId: "r1", reportEmail: "alert" }, "p1", { from: null, message, outcome: "refused", emailId: null })).toMatchObject({
      report_id: "r1", report_email: "alert", email_id: null, from_address: null, reply_to: null, html_body: null, outcome: "refused",
    });
  });
});

describe("hiding tokens", () => {
  it("hides each token in a link, after ? or & or &amp;, and nothing else", () => {
    expect(hideTokens("a https://x.ca/u?t=abc-DEF_1 b")).toBe("a https://x.ca/u?t=hidden b");
    expect(hideTokens('<a href="https://x.ca/r?x=1&amp;token_hash=zz9&amp;type=recovery">')).toBe('<a href="https://x.ca/r?x=1&amp;token_hash=hidden&amp;type=recovery">');
    expect(hideTokens("https://x.ca/s?reminder=start&token=q1")).toBe("https://x.ca/s?reminder=start&token=hidden");
    expect(hideTokens("https://x.ca/s?at=5&tt=6 t=7")).toBe("https://x.ca/s?at=5&tt=6 t=7");
  });
});
