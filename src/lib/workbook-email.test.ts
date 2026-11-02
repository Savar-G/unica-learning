import { describe, expect, it } from "vitest";
import { shownWorkbookEmailStatus, workbookDelivery, workbookEmail } from "@/lib/workbook-email";

const mail = { method: "mail" as const, carrier: "Canada Post", trackingNumber: "ABC123", trackingUrl: "https://example.com/track?code=ABC123&lang=en" };
const parent = { parentName: "Priya", childName: "Asha", workbookNumber: 1 };

describe("workbook delivery details", () => {
  it("requires a carrier and tracking number for mail", () => {
    expect(workbookDelivery(mail)).toEqual(mail);
    expect(workbookDelivery({ ...mail, trackingNumber: " " })).toBeNull();
    expect(workbookDelivery({ ...mail, carrier: "" })).toBeNull();
    expect(workbookDelivery({ ...mail, trackingUrl: "" })).toEqual({ ...mail, trackingUrl: "" });
  });
  it("keeps hand delivery free of old tracking fields", () => {
    expect(workbookDelivery({ ...mail, method: "hand" })).toEqual({ method: "hand" });
  });
  it.each(["javascript:alert(1)", "http://example.com", "https://user:password@example.com", "not a link"])("rejects an unsafe tracking link: %s", (trackingUrl) => {
    expect(workbookDelivery({ ...mail, trackingUrl })).toBeNull();
  });
  it("rejects control characters and oversized fields", () => {
    expect(workbookDelivery({ ...mail, trackingNumber: "A\nB" })).toBeNull();
    expect(workbookDelivery({ ...mail, carrier: "x".repeat(81) })).toBeNull();
    expect(workbookDelivery({ ...mail, trackingNumber: "x".repeat(101) })).toBeNull();
    expect(workbookDelivery(null)).toBeNull();
    expect(workbookDelivery({ method: "other" })).toBeNull();
  });
});

describe("workbook emails", () => {
  it("sets expectations after card confirmation without claiming dispatch", () => {
    const message = workbookEmail({ ...parent, kind: "welcome", delivery: null });
    expect(message.text).toContain("We are preparing your first workbook.");
    expect(message.text).toContain("when it is on its way");
    expect(message.text).toContain("local hand delivery");
    expect(message.text).toContain("Nothing was charged");
    expect(message.text).toContain("free first month starts when your first workbook arrives at your home");
    expect(message.text).not.toContain("Tracking number:");
  });
  it("includes mail tracking in text and HTML", () => {
    const message = workbookEmail({ ...parent, kind: "dispatch", delivery: mail });
    expect(message.text).toContain("Asha's workbook 1 is on its way.");
    expect(message.text).toContain("Carrier: Canada Post");
    expect(message.text).toContain("Tracking number: ABC123");
    expect(message.html).toContain('href="https://example.com/track?code=ABC123&amp;lang=en"');
  });
  it("describes hand delivery without inventing tracking or an arrival time", () => {
    const message = workbookEmail({ ...parent, kind: "dispatch", delivery: { method: "hand" } });
    expect(message.text).toContain("on its way by hand delivery");
    expect(message.text).not.toContain("Tracking");
    expect(message.text).not.toContain("arrived");
  });
  it("escapes family names and tracking text in HTML", () => {
    const message = workbookEmail({ ...parent, parentName: '<img src=x onerror="alert(1)">', childName: "<script>Asha</script>", kind: "dispatch", delivery: { ...mail, trackingNumber: "<b>123</b>" } });
    expect(message.html).not.toContain("<script>");
    expect(message.html).not.toContain("<img src=x");
    expect(message.html).toContain("&lt;b&gt;123&lt;/b&gt;");
  });
  it("refuses an incomplete dispatch", () => {
    expect(() => workbookEmail({ ...parent, kind: "dispatch", delivery: null })).toThrow();
    expect(() => workbookEmail({ ...parent, workbookNumber: 0, kind: "dispatch", delivery: mail })).toThrow();
  });
  it("shows a stopped send as uncertain, not retryable", () => {
    const claimed_at = "2026-11-01T10:00:00Z";
    expect(shownWorkbookEmailStatus({ status: "sending", claimed_at }, Date.parse(claimed_at) + 599999)).toBe("sending");
    expect(shownWorkbookEmailStatus({ status: "sending", claimed_at }, Date.parse(claimed_at) + 600000)).toBe("unknown");
  });
});
