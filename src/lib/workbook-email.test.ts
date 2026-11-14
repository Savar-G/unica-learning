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
    expect(message.text).toContain("Your family gets one free month. It starts when your first workbook arrives.");
    expect(message.text).not.toContain("Tracking number:");
    expect(message.text).toContain("Please allow 5 to 7 days for us to prepare your first workbook.");
    expect(message.text).toContain("You have nothing to do right now.\n\n" + contact);
    expect(message.html).toContain('href="https://unicalearning.com/account/feedback"');
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
  const email = planStartEmail({ parentName: "Priya", childName: "Asha & Co", grade: 3, price: 79.99, firstCharge: "December 5, 2026", marking: true, explain: true });
  it("gives the terms the card networks require: the price, how often, the first charge and how to cancel", () => {
    expect(email.text).toContain("On December 5, 2026, we charge up to CAD 79.99 to your saved card. Your regular price is CAD 79.99 a month until you cancel. An eligible referral benefit gives 50% off one paid month.");
    expect(email.text).toContain("We will email you a reminder 7 days before the first charge.");
    expect(email.text).toContain('open https://unicalearning.com/account/plan, then press "Cancel plan". If you cancel before December 5, 2026, you pay nothing.');
    expect(email.text).toContain("contact@unicalearning.com");
  });
  it("links the plan page and escapes names in the html", () => {
    expect(email.html).toContain('<a href="https://unicalearning.com/account/plan"');
    expect(email.html).toContain("Asha &amp; Co");
    expect(email.html).not.toContain("Asha & Co");
  });
  it.each([0, 1, 2, 3, 9, -1, 10, NaN])("includes Maya chat only for a valid school grade of at least 3 (%s)", (grade) => {
    const message = planStartEmail({ parentName: "Sam", childName: "Alex", grade, price: 79.99, firstCharge: "December 15, 2026", marking: true, explain: true });
    for (const format of [message.text, message.html]) {
      if (grade === 3 || grade === 9) expect(format).toContain("can chat with Maya, our AI Teaching Assistant");
      else expect(format).not.toContain("Maya");
      expect(format).not.toMatch(/\bcalls?\b|\bvoice\b/i);
      expect(format).toContain("https://unicalearning.com/account/schedule");
      expect(format).toContain("https://unicalearning.com/account/scan");
      expect(format).toContain("https://unicalearning.com/account/feedback");
      expect(format).toContain("CAD 79.99");
    }
    for (const path of ["schedule", "scan", "feedback", "plan"]) expect(message.html).toContain(`href="https://unicalearning.com/account/${path}"`);
  });
  it("matches Savar's approved free-month words, with unchanged signature and footer", () => {
    const message = planStartEmail({ parentName: "Sam", childName: "Alex", grade: 3, price: 79.99, firstCharge: "December 15, 2026", marking: true, explain: true });
    const expected = `Hi Sam,

Thanks for joining Unica Learning. Alex's first workbook has arrived, so your free first month has started. Nothing has been charged.

As a parent, here are your responsibilities:

1. Follow the schedule, 5 days a week. The workbook has 10 days, so it takes 2 weeks. Do one day on 5 days of each week, for example Monday to Friday with the weekend off. You can choose any 5 days, but do the days in order, Day 1 to Day 10. See which pages Alex does each day: https://unicalearning.com/account/schedule. The same schedule is on page 2 of the workbook.
2. Scan the finished pages. After Alex finishes the pages, scan them: https://unicalearning.com/account/scan. Each page has its own QR code.
3. Read the marks. You will see which questions are right and wrong. On a wrong answer, press "Explain this problem" for a simple explanation that you can use with Alex.
4. Set up Maya. If Alex gets stuck, Alex can chat with Maya, our AI Teaching Assistant. Sign in at https://unicalearning.com/account, set a PIN, agree to the Maya notice, then open Alex's desk.

Why 5 days? Two days off each week give Alex time to rest, or to look back at the week's pages, and come back ready to learn. A steady 5 days builds a habit. Working every day can wear kids out and make math feel like a chore, for Alex and for you.

If anything is broken, if anything does not work, or if you have feedback, email contact@unicalearning.com or use https://unicalearning.com/account/feedback.

Your plan: On December 15, 2026, we charge up to CAD 79.99 to your saved card. Your regular price is CAD 79.99 a month until you cancel. An eligible referral benefit gives 50% off one paid month. Delivery is included. We will email you a reminder 7 days before the first charge.

To cancel, sign in and open https://unicalearning.com/account/plan, then press "Cancel plan". If you cancel before December 15, 2026, you pay nothing.`;
    expect(message.subject).toBe("Welcome to Unica Learning: how Alex's free month works");
    expect(message.text.split("\n\nThank you,")[0]).toBe(expected);
    const htmlText = message.html.replace(/<br>/g, "\n").replace(/<[^>]*>/g, "").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    for (const paragraph of expected.split("\n\n")) expect(htmlText).toContain(paragraph);
    expect(message.text).toContain("Thank you,\nThe Unica Learning team");
    expect(message.text).toContain("16557 87A Ave");
  });
  it.each([false, true])("pins the five-day copy in both formats for shared window %s", (sharedWindow) => {
    for (const marking of [false, true]) for (const explain of [false, true]) {
      const message = planStartEmail({ parentName: "Sam", childName: "Alex", grade: 3, price: 79.99, firstCharge: "December 15, 2026", marking, explain, sharedWindow });
      const step = "1. Follow the schedule, 5 days a week. The workbook has 10 days, so it takes 2 weeks. Do one day on 5 days of each week, for example Monday to Friday with the weekend off. You can choose any 5 days, but do the days in order, Day 1 to Day 10. See which pages Alex does each day: https://unicalearning.com/account/schedule. The same schedule is on page 2 of the workbook.";
      const why = "Why 5 days? Two days off each week give Alex time to rest, or to look back at the week's pages, and come back ready to learn. A steady 5 days builds a habit. Working every day can wear kids out and make math feel like a chore, for Alex and for you.";
      const htmlText = message.html.replace(/<br>/g, "\n").replace(/<[^>]*>/g, "").replace(/&#39;/g, "'").replace(/&quot;/g, '\"');
      for (const format of [message.text, htmlText]) {
        expect(format).toContain(step);
        expect(format).toContain(why);
      }
      expect(message.text.split("\n").filter(line => line.startsWith("1. "))).toEqual([step]);
      expect(message.text).toContain(`\n\n${why}\n\n`);
      expect(message.html).toContain('<a href="https://unicalearning.com/account/schedule"');
    }
  });
  it("promises no marks and no Explain button while marking is closed for the child: step 3 says the marks come later", () => {
    const open = planStartEmail({ parentName: "Sam", childName: "Alex", grade: 3, price: 79.99, firstCharge: "December 15, 2026", marking: true, explain: true });
    const closed = planStartEmail({ parentName: "Sam", childName: "Alex", grade: 3, price: 79.99, firstCharge: "December 15, 2026", marking: false, explain: true });
    const later = "3. Marks come later. Scan the pages now. Later, we will use the photos to mark Alex's work.";
    expect(closed.text).toContain(later);
    for (const format of [closed.text, closed.html]) {
      expect(format).not.toContain("Read the marks");
      expect(format).not.toContain("right and wrong");
      expect(format).not.toContain("Explain this problem");
    }
    const htmlText = closed.html.replace(/<br>/g, "\n").replace(/<[^>]*>/g, "").replace(/&#39;/g, "'");
    expect(htmlText).toContain(later);
    // Only step 3 differs: the steps before and after it, the plan terms and the footer are the same words.
    const lines = (t: string) => t.split("\n").filter((l) => !l.startsWith("3. "));
    expect(lines(closed.text)).toEqual(lines(open.text));
    expect(open.text).not.toContain("Marks come later");
  });
  it.each([
    [true, true, '3. Read the marks. You will see which questions are right and wrong. On a wrong answer, press "Explain this problem" for a simple explanation that you can use with Alex.'],
    [true, false, "3. Read the marks. You will see which questions are right and wrong."],
    [false, true, "3. Marks come later. Scan the pages now. Later, we will use the photos to mark Alex's work."],
    [false, false, "3. Marks come later. Scan the pages now. Later, we will use the photos to mark Alex's work."],
  ])("step 3 with marking %s and Explain %s", (marking, explain, step) => {
    const message = planStartEmail({ parentName: "Sam", childName: "Alex", grade: 3, price: 79.99, firstCharge: "December 15, 2026", marking, explain });
    expect(message.text.split("\n").filter((l) => l.startsWith("3. "))).toEqual([step]);
    if (!(marking && explain)) for (const format of [message.text, message.html]) expect(format).not.toContain("Explain");
  });
});

describe("the plan start email's reminder words (PR #803 review)", () => {
  const cases = [undefined, true].flatMap((sharedWindow) => [undefined, true, false].flatMap((free) => [undefined, true, false].map((reminder) => ({ sharedWindow, free, reminder }))));
  it("keeps the reminder condition and referral price terms for every window and free case", () => {
    const rendered = cases.map((c) => planStartEmail({ parentName: "Sam", childName: "Alex", grade: 3, price: 59.99, firstCharge: "December 15, 2026", marking: true, explain: true, ...c }));
    rendered.forEach(m => {
      expect(m.text).toContain("we charge up to CAD 59.99 to your saved card");
      expect(m.text).toContain("Your regular price is CAD 59.99 a month until you cancel");
      expect(m.text).toContain("An eligible referral benefit gives 50% off one paid month");
    });
    rendered.forEach((m, i) => expect(m.text.includes(" We will email you a reminder 7 days before the first charge.")).toBe(cases[i].reminder !== false));
  });
});
