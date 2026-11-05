import { describe, expect, it } from "vitest";
import { FOUNDERS_WHY, phoneWelcomeEmail, waitlistEmail, welcomeEmail } from "@/lib/founder-emails";

const SIGNED = "Thank you,\nSavar & Cedric\nCo-founders, Unica Learning";

describe("the founders' emails (D-225)", () => {
  const welcome = welcomeEmail({ parentName: "Priya Shah", childName: "Asha", url: "https://unicalearning.com/account/start/c1" });
  const wait = waitlistEmail({ parentName: "Priya Shah", childName: "Asha", curriculum: "Ontario", reportUrl: "https://unicalearning.com/account/report/r1", bookingUrl: "https://calendly.com/x" });

  it("are signed by the founders, greet the parent by first name, and keep the CASL footer", () => {
    for (const e of [welcome, wait]) {
      expect(e.text).toMatch(/^Hi Priya,/);
      expect(e.text).toContain(SIGNED);
      expect(e.html).toContain("Savar &amp; Cedric");
      expect(e.text).toContain("16557 87A Ave, Surrey, BC V4N 5B2");
      expect(e.text).not.toContain("The Unica Learning team");
    }
  });
  it("welcome: who we are, the two steps and the start button", () => {
    expect(welcome.subject).toBe("Welcome to Unica Learning");
    expect(welcome.text).toContain(`We're Savar and Cedric, the founders of Unica Learning. ${FOUNDERS_WHY}`);
    expect(welcome.text).toContain("1. Asha takes the free math test on a laptop or tablet, alone, in one sitting.");
    expect(welcome.text).toContain("Start Asha's test: https://unicalearning.com/account/start/c1");
  });
  it("waitlist: names the curriculum, links the report and the call; 'other' names none", () => {
    expect(wait.subject).toBe("You're on the list for Ontario workbooks");
    expect(wait.text).toContain("See Asha's report: https://unicalearning.com/account/report/r1");
    expect(wait.text).toContain("with one of us: https://calendly.com/x");
    const other = waitlistEmail({ parentName: "Priya", childName: "Asha", curriculum: null, reportUrl: "https://x.test/r", bookingUrl: null });
    expect(other.subject).toBe("You're on the workbook waitlist");
    expect(other.text).not.toContain("15-minute");
  });
  it("phone welcome: the welcome and the laptop sign-in link in one email, the link before the steps", () => {
    const phone = phoneWelcomeEmail({ parentName: "Priya Shah", childName: "Asha", url: "https://unicalearning.com/sign-in/link?t=x" });
    expect(phone.subject).toBe("Welcome to Unica Learning: open this on a laptop or tablet");
    expect(phone.text).toContain(SIGNED);
    expect(phone.text).toContain(FOUNDERS_WHY);
    expect(phone.text.indexOf("Sign in and start: https://unicalearning.com/sign-in/link?t=x")).toBeLessThan(phone.text.indexOf("Here's what happens next:"));
    expect(phone.text).toContain("The link works once and only for 24 hours.");
  });
  it("say 'Questions? Reply to this email.' once, in the signature", () => {
    for (const e of [welcome, phoneWelcomeEmail({ parentName: "Priya", childName: "Asha", url: "https://x.test" })]) {
      expect(e.text).not.toContain("It comes straight to us");
      expect(e.text.split("Reply to this email").length).toBe(2);
    }
  });
  it("escapes names in the HTML", () => {
    expect(welcomeEmail({ parentName: "<b>A</b>", childName: "Jo & <i>", url: "https://x.test/?a=1&b=2" }).html).not.toMatch(/<b>A<\/b>|<i>/);
  });
});
