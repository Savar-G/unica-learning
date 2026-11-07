import { describe, expect, it } from "vitest";
import { BUSINESS_NAME, MAILING_ADDRESS, WEBSITE } from "@/lib/contact";
import { workbookScanReminderEmail } from "@/lib/workbook-scan-reminder-email";

const input = { origin: "https://unicalearning.com", token: "a".repeat(43) };

describe("one parent scan reminder", () => {
  it("opens the protected Scan pages entry without child, workbook, photo or page identifiers", () => {
    const message = workbookScanReminderEmail(input);
    expect(message.subject).toBe("Ready to scan your next page?");
    expect(message.text).toContain("Scan pages: https://unicalearning.com/account/scans");
    expect(message.html).toContain('href="https://unicalearning.com/account/scans"');
    expect(message.text).toContain("You may be asked to sign in first.");
    expect(message.html).not.toMatch(/<img|tutor\/p|photo_id|workbook_id|child_id|written answer|score/i);
  });

  it("retains the shared business footer, reason and both unsubscribe routes", () => {
    const message = workbookScanReminderEmail(input);
    for (const body of [message.text, message.html]) {
      expect(body).toContain(BUSINESS_NAME);
      expect(body.replace(/<br>/g, ", ")).toContain(MAILING_ADDRESS);
      expect(body).toContain(WEBSITE);
      expect(body).toContain("your family has a delivered Unica Learning workbook");
      expect(body).toContain(`/unsubscribe?t=${input.token}`);
    }
    expect(message.headers).toEqual({
      "List-Unsubscribe": `<https://unicalearning.com/api/unsubscribe?t=${input.token}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it.each(["http://unicalearning.com", "javascript:alert(1)", "https://a:b@unicalearning.com",
    "https://unicalearning.com/private", "https://unicalearning.com/?child=private", "https://unicalearning.com/#private"])
  ("refuses an unsafe or non-origin address: %s", (origin) => {
    expect(() => workbookScanReminderEmail({ ...input, origin })).toThrow();
  });

  it.each(["", "short", "a".repeat(129), "a".repeat(40) + "\r\nInjected: yes", "a".repeat(40) + "&child=private"])
  ("refuses malformed or injectable tokens", (token) => {
    expect(() => workbookScanReminderEmail({ ...input, token })).toThrow();
  });

  it("uses the same routes on a local QA origin without sending an email", () => {
    const message = workbookScanReminderEmail({ ...input, origin: "http://localhost:3467/" });
    expect(message.html).toContain('href="http://localhost:3467/account/scans"');
    expect(message.headers["List-Unsubscribe"]).toBe(`<http://localhost:3467/api/unsubscribe?t=${input.token}>`);
  });
});
