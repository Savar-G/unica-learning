import { describe, expect, it } from "vitest";
import { planStartEmail, shownWorkbookEmailStatus, workbookDelivery, workbookEmail } from "@/lib/workbook-email";

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
  const contact = "If anything does not work, or if you have feedback, email contact@unicalearning.com or use https://unicalearning.com/account/feedback.";
  it.each(["ready", "hand", "courier"] as const)("matches Savar's approved %s text before the existing signature", (kind) => {
    const input = { parentName: "Sam", childName: "Alex", workbookNumber: 1 };
    const email = workbookEmail({ ...input, kind: kind === "ready" ? "ready" : "dispatch", delivery: kind === "courier" ? { method: "mail", carrier: "Canada Post", trackingNumber: "1234 5678 9012", trackingUrl: "" } : kind === "hand" ? { method: "hand" } : null });
    const content = kind === "ready" ? ["Hi Sam,", "Your workbook is ready and will be shipped soon. You have nothing to do right now. We will email you again when it is on its way.", contact]
      : ["Hi Sam,", `Alex's workbook 1 is on its way${kind === "hand" ? " by hand delivery" : ""}.`, ...(kind === "courier" ? ["Carrier: Canada Post\nTracking number: 1234 5678 9012"] : []), "What to do next: keep the workbook together when it arrives. We will email you the instructions when your free month starts.", contact];
    expect(email.subject).toBe(`Alex's workbook is ${kind === "ready" ? "ready" : "on its way"}`);
    expect(email.text.split("\n\nThank you,")[0]).toBe(content.join("\n\n"));
    const plainHtml = email.html.replace(/<br>/g, "\n").replace(/<[^>]*>/g, "").replace(/&#39;/g, "'");
    for (const paragraph of content) expect(plainHtml).toContain(paragraph);
    expect(email.html).toContain('href="https://unicalearning.com/account/feedback"');
    if (kind === "courier") expect(email.html).not.toContain("Track your workbook");
  });
  it("previews a numbered ready notice without tracking or a dispatch claim", () => {
    const email = workbookEmail({ ...parent, workbookNumber: 2, kind: "ready", delivery: null });
    for (const format of [email.text, email.html]) {
      expect(format).toContain("Your workbook is ready and will be shipped soon.");
      expect(format).toContain("We will email you again when it is on its way.");
      expect(format).not.toContain("Tracking number:");
    }
    expect(() => workbookEmail({ ...parent, workbookNumber: 0, kind: "ready", delivery: null })).toThrow();
  });
  it("sets expectations after card confirmation without claiming dispatch", () => {
    const message = workbookEmail({ ...parent, kind: "welcome", delivery: null });
    expect(message.text).toContain("We are preparing your first workbook.");
    expect(message.text).toContain("when it is on its way");
    expect(message.text).toContain("local hand delivery");
    expect(message.text).toContain("Nothing was charged");
    expect(message.text).toContain("free first month starts when your first workbook arrives at your home");
    expect(message.text).not.toContain("Tracking number:");
  });
  it("the founders sign the welcome; the team signs dispatch notices (D-225)", () => {
    const welcome = workbookEmail({ ...parent, kind: "welcome", delivery: null });
    expect(welcome.text).toContain("Thank you,\nSavar & Cedric\nCo-founders, Unica Learning");
    expect(welcome.html).toContain("Savar &amp; Cedric");
    const dispatch = workbookEmail({ ...parent, kind: "dispatch", delivery: { method: "hand" } });
    expect(dispatch.text).toContain("The Unica Learning team");
    expect(dispatch.text).not.toContain("Co-founders");
  });
  it("includes mail tracking in text and HTML", () => {
    const message = workbookEmail({ ...parent, kind: "dispatch", delivery: mail });
    expect(message.text).toContain("Asha's workbook 1 is on its way.");
    expect(message.text).toContain("Carrier: Canada Post");
    expect(message.text).toContain("Tracking number: ABC123");
    expect(message.html).toContain("Tracking number: ABC123");
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

describe("the free month confirmation", () => {
  const email = planStartEmail({ parentName: "Priya", childName: "Asha & Co", price: 79.99, firstCharge: "December 5, 2026", planUrl: "https://unica.test/account/plan" });
  it("gives the terms the card networks require: the price, how often, the first charge and how to cancel", () => {
    expect(email.text).toContain("On December 5, 2026, we charge CAD 79.99 to your saved card. We then charge CAD 79.99 each month until you cancel.");
    expect(email.text).toContain("We will email you a reminder 7 days before the first charge.");
    expect(email.text).toContain('open https://unica.test/account/plan, then press "Cancel plan". If you cancel before December 5, 2026, you pay nothing.');
    expect(email.text).toContain("contact@unicalearning.com");
  });
  it("links the plan page and escapes names in the html", () => {
    expect(email.html).toContain('<a href="https://unica.test/account/plan"');
    expect(email.html).toContain("Asha &amp; Co");
    expect(email.html).not.toContain("Asha & Co");
  });
});
