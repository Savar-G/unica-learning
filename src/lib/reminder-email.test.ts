import { describe, expect, it } from "vitest";
import { reminderEmail, type ReminderEmailInput } from "@/lib/reminder-email";

const URL = "https://unicalearning.com/account/start/c-1?reminder=continue";
const UNSUBSCRIBE = "https://unicalearning.com/unsubscribe?t=abc";
// Monday, October 12, 2026, 23:15 UTC: 4:15 p.m. in Vancouver, 7:15 p.m. in Toronto.
const DEADLINE = Date.UTC(2026, 9, 12, 23, 15);

const common = { parentName: "Priya Shah", childName: "Maya", url: URL, unsubscribeUrl: UNSUBSCRIBE, postal: "V3S 1A1" };
const email = (over: Partial<ReminderEmailInput> & Pick<ReminderEmailInput, "kind">) =>
  reminderEmail({ ...common, answered: 12, resumeUntil: DEADLINE, ...over } as ReminderEmailInput);

describe("the continue your test reminder", () => {
  const e = email({ kind: "continue" });

  it("names the child in the subject and greets the parent by first name", () => {
    expect(e.subject).toBe("Maya's math test is saved");
    expect(e.text).toMatch(/^Hi Priya,/);
  });
  it("says where the child stopped and until when the test can continue, in the family's time zone", () => {
    expect(e.text).toContain("Maya answered 12 questions on the free math placement test, and those answers are saved.");
    expect(e.html).toContain("Maya answered 12 questions on the free math placement test, and those answers are saved.");
    expect(email({ kind: "continue", answered: 1 }).text).toContain("Maya answered 1 question on the free math placement test, and those answers are saved.");
    // A block test's length is not known until it ends, so no email names a total.
    for (const body of [e.text, e.html]) expect(body).not.toMatch(/answered \d+ of \d+/);
    expect(e.text).toContain("Maya can pick up from the same question until 4:15 p.m. on Monday, October 12.");
    const toronto = email({ kind: "continue", postal: "M5V 2T6" });
    expect(toronto.text).toContain("until 7:15 p.m. on Monday, October 12.");
    // The short phone signup gives no postal code (D-134): Pacific time.
    expect(email({ kind: "continue", postal: null }).text).toContain("until 4:15 p.m. on Monday, October 12.");
  });
  it("words a test with no answer yet", () => {
    expect(email({ kind: "continue", answered: 0 }).text).toContain("Maya opened the free math placement test but hasn't answered a question yet.");
  });
  it("links to the child's test", () => {
    expect(e.text).toContain(URL);
    expect(e.html).toContain(`href="${URL}"`);
    expect(e.html).toContain("Continue Maya&#39;s test");
  });
});

describe("the come back reminder", () => {
  const e = email({ kind: "come_back", url: URL.replace("continue", "come_back") });

  it("says the test closed before a report and the child can start fresh", () => {
    expect(e.subject).toBe("Maya can start the math test fresh");
    expect(e.text).toContain("Maya's free math placement test closed before a report could be made.");
    expect(e.text).toContain("Maya can start fresh with a new set of questions.");
    expect(e.text).toContain("about 20 minutes");
    expect(e.html).toContain("Start again");
  });
});

describe("the start your test reminder", () => {
  const e = email({ kind: "start", url: URL.replace("continue", "start") });

  it("says the test is ready, how long it takes, why the child answers alone, and what the report shows", () => {
    expect(e.subject).toBe("Maya's free math check is ready");
    expect(e.text).toContain("Maya's free math placement test is ready to go. Just find 20 quiet minutes when Maya can sit down at a laptop or tablet.");
    expect(e.text).toContain("so the report shows where Maya really is");
    expect(e.text).toContain("which skills to work on next");
    expect(e.text).toContain("You may be asked to sign in first.");
    expect(e.html).toContain("Start Maya&#39;s test");
  });
});

describe("the last start reminder", () => {
  const e = email({ kind: "start_followup", url: URL.replace("continue", "start_followup") });

  it("is a note from the founders that asks what is in the way, and does not say it is automatic", () => {
    expect(e.subject).toBe("A quick question about Maya's math test");
    expect(e.text).toContain("We're Savar and Cedric, the founders of Unica Learning.");
    expect(e.text).toContain("Is anything getting in the way, like timing, signing in, or questions about how it works?");
    expect(e.text).toContain("It's free, with no card needed.");
    expect(e.text).not.toMatch(/automatic|last reminder/i);
    expect(e.text).not.toContain("I read every email");
    expect(e.html).toContain("Start Maya&#39;s test");
  });
});

describe("every reminder", () => {
  const all = (["continue", "come_back", "start", "start_followup"] as const).map((kind) => email({ kind }));

  it("has a working unsubscribe link, in the text and the HTML", () => {
    for (const e of all) {
      expect(e.text).toContain(`Unsubscribe from reminders: ${UNSUBSCRIBE}`);
      expect(e.html).toContain(`href="${UNSUBSCRIBE}"`);
    }
  });
  it("names the sender and gives the mailing address (CASL)", () => {
    for (const e of all) {
      for (const body of [e.text, e.html]) {
        expect(body).toContain("Unica Learning");
        expect(body.replace(/<br>/g, ", ")).toContain("16557 87A Ave, Surrey, BC V4N 5B2");
        expect(body).toContain("unicalearning.com");
      }
      expect(e.text).toContain("You get this reminder because you signed up for Maya's free math placement test.");
    }
  });
  it("uses the chosen logo and a signature above the address in all four reminders (team or founders, D-225)", () => {
    for (const e of all) {
      expect(e.html).toContain("background:#ff6a3d");
      const signed = e.founders ? "Co-founders, Unica Learning" : "The Unica Learning team";
      for (const body of [e.text, e.html]) {
        expect(body).toContain(signed);
        expect(body).toContain("Questions? Reply to this email.");
      }
      expect(e.html.indexOf(signed)).toBeLessThan(e.html.indexOf("16557 87A Ave"));
    }
  });
  it("escapes names and links in the HTML", () => {
    const html = reminderEmail({ ...common, kind: "start", childName: "Jo & <i>", parentName: "<b>A</b>", url: "https://x.test/?a=1&b=2" }).html;
    expect(html).not.toMatch(/<b>A<\/b>|<i>/);
    expect(html).toContain("Jo &amp; &lt;i&gt;");
    expect(html).toContain('href="https://x.test/?a=1&amp;b=2"');
  });
});

describe("who signs a reminder (D-225)", () => {
  it("the founders sign the last start reminder; the team signs the others", () => {
    const last = email({ kind: "start_followup" });
    expect(last.founders).toBe(true);
    expect(last.text).toContain("Thank you,\nSavar & Cedric\nCo-founders, Unica Learning");
    expect(last.html).toContain("Savar &amp; Cedric");
    for (const kind of ["continue", "come_back", "start"] as const) {
      const e = email({ kind });
      expect(e.founders).toBe(false);
      expect(e.text).toContain("The Unica Learning team");
      expect(e.text).not.toContain("Co-founders");
    }
  });
});
