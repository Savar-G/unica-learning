import { describe, expect, it } from "vitest";
import { reminderEmail, type ReminderEmailInput } from "@/lib/reminder-email";

const URL = "https://unicalearning.com/account/start/c-1?reminder=continue";
const UNSUBSCRIBE = "https://unicalearning.com/unsubscribe?t=abc";
// Monday, October 12, 2026, 23:15 UTC: 4:15 p.m. in Vancouver, 7:15 p.m. in Toronto.
const DEADLINE = Date.UTC(2026, 9, 12, 23, 15);

const common = { parentName: "Priya Shah", childName: "Maya", url: URL, unsubscribeUrl: UNSUBSCRIBE, postal: "V3S 1A1", total: 36 };
const email = (over: Partial<ReminderEmailInput> & Pick<ReminderEmailInput, "kind">) =>
  reminderEmail({ ...common, answered: 12, resumeUntil: DEADLINE, ...over } as ReminderEmailInput);

describe("the continue your test reminder", () => {
  const e = email({ kind: "continue" });

  it("names the child in the subject and greets the parent by first name", () => {
    expect(e.subject).toBe("Maya can finish the math test");
    expect(e.text).toMatch(/^Hi Priya,/);
  });
  it("says where the child stopped and until when the test can continue, in the family's time zone", () => {
    expect(e.text).toContain("Maya stopped the free math placement test after 12 of 36 questions.");
    expect(e.text).toContain("Maya can continue from the same question until 4:15 p.m. PDT on Monday, October 12.");
    const toronto = email({ kind: "continue", postal: "M5V 2T6" });
    expect(toronto.text).toContain("until 7:15 p.m. EDT on Monday, October 12.");
    // The short phone signup gives no postal code (D-134): Pacific time.
    expect(email({ kind: "continue", postal: null }).text).toContain("until 4:15 p.m. PDT on Monday, October 12.");
  });
  it("words a test with no answer yet", () => {
    expect(email({ kind: "continue", answered: 0 }).text).toContain("Maya opened the free math placement test but did not answer a question yet.");
  });
  it("links to the child's test", () => {
    expect(e.text).toContain(URL);
    expect(e.html).toContain(`href="${URL}"`);
    expect(e.html).toContain("Continue Maya&#39;s test");
  });
});

describe("the come back reminder", () => {
  const e = email({ kind: "come_back", url: URL.replace("continue", "come_back") });

  it("says the 24 hours ran out and the child can start again with new questions", () => {
    expect(e.subject).toBe("Maya can start the math test again");
    expect(e.text).toContain("Maya did not finish the free math placement test within 24 hours, so it closed.");
    expect(e.text).toContain("Maya can start again with 36 new questions.");
    expect(e.html).toContain("Start again");
  });
});

describe("the start your test reminder", () => {
  const e = email({ kind: "start", url: URL.replace("continue", "start") });

  it("says the child has not started, and what the test is", () => {
    expect(e.subject).toBe("Maya has not started the free math test");
    expect(e.text).toContain("Maya has not started the free math placement test yet.");
    expect(e.text).toContain("36 questions");
    expect(e.html).toContain("Start Maya&#39;s test");
  });
});

describe("the last start reminder", () => {
  const e = email({ kind: "start_followup", url: URL.replace("continue", "start_followup") });

  it("says it is the last reminder, that the test is free with no card, and what the child needs", () => {
    expect(e.subject).toBe("Last reminder: Maya's free math test");
    expect(e.text).toContain("Maya has not started the free math placement test yet. This is our last reminder about it.");
    expect(e.text).toContain("The test is free, and you do not give a card for it.");
    expect(e.text).toContain("laptop or tablet");
    expect(e.text).toContain("36 questions");
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
  it("uses the chosen logo and team signature for all four reminders", () => {
    for (const e of all) {
      expect(e.html).toContain("background:#ff6a3d");
      for (const body of [e.text, e.html]) {
        expect(body).toContain("The Unica Learning team");
        expect(body).toContain("Questions? Reply to this email.");
      }
      expect(e.html.indexOf("The Unica Learning team")).toBeLessThan(e.html.indexOf("16557 87A Ave"));
    }
  });
  it("escapes names and links in the HTML", () => {
    const html = reminderEmail({ ...common, kind: "start", childName: "Jo & <i>", parentName: "<b>A</b>", url: "https://x.test/?a=1&b=2" }).html;
    expect(html).not.toMatch(/<b>A<\/b>|<i>/);
    expect(html).toContain("Jo &amp; &lt;i&gt;");
    expect(html).toContain('href="https://x.test/?a=1&amp;b=2"');
  });
});
