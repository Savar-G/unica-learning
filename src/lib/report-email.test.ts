import { describe, expect, it } from "vitest";
import { reportModel, type Grade, type Province, type ReportFacts } from "@/lib/assessment";
import { knowsUpTo, takeTest, type Script } from "@/lib/assessment/scripted-child";
import { reportAlert, reportEmail } from "@/lib/report-email";
import type { ReportView } from "@/lib/report-view";

const URL = "https://unicalearning.com/account/report/r-1?src=email";

function view(isRight: Script, { grade = 4, province = "BC", name = "Maya" }: { grade?: Grade; province?: Province; name?: string } = {}): ReportView {
  const { placement } = takeTest({ grade, province }, 1, isRight);
  return {
    id: "r-1",
    childName: name,
    province,
    completedAt: "2026-10-10T19:30:00Z",
    questions: 36,
    minutes: 34,
    model: reportModel(placement, { completedTestsInGrade: 0, workReviews: [] }),
  };
}

describe("the report email to the parent", () => {
  const email = reportEmail({ view: view(knowsUpTo(3)), parentName: "Priya Shah", url: URL });

  it("names the child in the subject and greets the parent by first name", () => {
    expect(email.subject).toBe("Maya's math report is ready");
    expect(email.text).toMatch(/^Hi Priya,/);
  });
  it("carries the link that opens the report in the account", () => {
    expect(email.text).toContain(URL);
    expect(email.html).toContain(`href="${URL.replace("&", "&amp;")}"`);
  });
  it("leads with the working level and the verdict, as the report page does", () => {
    expect(email.text).toContain("Maya is working at a grade 3 level.\nThat is one grade below Maya's school grade (grade 4).");
    expect(email.html).toContain("Maya is working at a grade 3 level.");
    expect(email.html).toContain("That is one grade below Maya&#39;s school grade (grade 4).");
  });
  it("lists each area with its status and question count", () => {
    // Grade 4, knows grade 3 only: stage 1 (18 at grade 4) all wrong, stage 2 (18 at grade 3) all right, 4 areas in turn.
    expect(email.text).toContain("Number and operations: Developing, 5 of 10 right");
    expect(email.text).toContain("Fractions and decimals: Developing, 5 of 10 right");
    expect(email.text).toContain("Patterns and algebra: Developing, 4 of 8 right");
    expect(email.text).toContain("Shapes, measurement and data: Developing, 4 of 8 right");
  });
  it("carries the FSA context line, with its source, for a BC family in grade 4", () => {
    expect(email.text).toContain("66.5%");
    expect(email.text).toContain("Foundation Skills Assessment open data");
  });
  it("has no FSA line for a grade 4 family in Ontario (D-087)", () => {
    const on = reportEmail({ view: view(knowsUpTo(3), { province: "ON" }), parentName: "Priya", url: URL });
    for (const body of [on.text, on.html]) expect(body).not.toMatch(/Foundation Skills Assessment|FSA/);
  });
  it("carries number facts with speed beside accuracy, when the child had a facts section", () => {
    const v = view(knowsUpTo(3));
    const facts: ReportFacts = { scope: "Addition and subtraction facts to 20", seconds: 60, answered: 12, correct: 12, secondsPerFact: 4.6, accuracy: "secure", speed: "needs-practice" };
    const withFacts = reportEmail({ view: { ...v, model: { ...v.model, facts } }, parentName: "Priya", url: URL });
    expect(withFacts.text).toContain("Number facts: 12 of 12 right (Secure), typically 4.6 seconds a fact (Needs practice)");
    expect(withFacts.text).toContain("Speed comes with practice. It does not change Maya's working level.");
    expect(withFacts.html).toContain("12 of 12 right");
    expect(withFacts.html).toContain("typically 4.6 seconds a fact");
    // Slow facts need practice; nothing in the parent's email calls the child behind.
    expect(`${withFacts.text}${withFacts.html}`).not.toMatch(/behind/i);
  });
  it("has no number facts line when the child had no facts section", () => {
    for (const body of [email.text, email.html]) expect(body).not.toMatch(/Number facts/);
  });
  it("a BC family's main button opens the plan choice on the report page, as a link (#66)", () => {
    const step = "https://unicalearning.com/account/report/r-1?src=email&amp;step=plan#rpt-next";
    expect(email.html).toMatch(new RegExp(`<a href="${step.replace(/[?.]/g, "\\$&")}"[^>]*>Choose a plan for Maya</a>`));
    expect(email.text).toContain("Choose a plan for Maya: https://unicalearning.com/account/report/r-1?src=email&step=plan#rpt-next");
    // Links only: email clients drop forms.
    expect(email.html).not.toMatch(/<form|<button|<input/);
  });
  it("another province's main button opens the waitlist step (#66)", () => {
    const on = reportEmail({ view: view(knowsUpTo(3), { province: "ON" }), parentName: "Priya", url: URL });
    expect(on.html).toContain('<a href="https://unicalearning.com/account/report/r-1?src=email&amp;step=waitlist#rpt-next"');
    expect(on.html).toMatch(/>Join the waitlist<\/a>/);
    expect(on.text).toContain("Join the waitlist: https://unicalearning.com/account/report/r-1?src=email&step=waitlist#rpt-next");
  });
  it("still links the full report, beside the next step", () => {
    expect(email.html).toMatch(/>See Maya&#39;s full report<\/a>/);
    expect(email.text).toContain(`See Maya's full report: ${URL}`);
  });
  it("carries the help warning and the retake date when help is likely (#71), and never the flags", () => {
    const v = view(knowsUpTo(3));
    const warned = reportEmail({ view: { ...v, model: { ...v.model, helpWarning: true } }, parentName: "Priya", url: URL });
    for (const body of [warned.text, warned.html]) {
      expect(body).toContain("This level may be too high");
      expect(body).toContain("from November 10, 2026.");
      expect(body).not.toMatch(/too-fast|pause-then-perfect|helped/);
    }
  });
  it("has no help warning when help is not likely", () => {
    for (const body of [email.text, email.html]) expect(body).not.toMatch(/may be too high/);
  });
  it("escapes names in the HTML (parent email)", () => {
    const html = reportEmail({ view: view(knowsUpTo(3), { name: "Jo & <i>" }), parentName: "<b>A</b>", url: "https://x.test/?a=1&b=2" }).html;
    expect(html).not.toMatch(/<b>A<\/b>|<i>/);
    expect(html).toContain("Jo &amp; &lt;i&gt;");
    expect(html).toContain('href="https://x.test/?a=1&amp;b=2"');
  });

  describe("the child's work (#67)", () => {
    const withWork = (): ReportView => {
      const v = view(knowsUpTo(3));
      const { placement } = takeTest({ grade: 4, province: "BC" }, 1, knowsUpTo(3));
      const shownWork = [{ questionId: "s1-0", prompt: "47 + 25 = ?", correct: true, required: true, image: "p/a/s1-0-x.png", text: "carry the 1" }];
      return { ...v, model: reportModel(placement, { completedTestsInGrade: 0, workReviews: [], shownWork }), workImages: { "p/a/s1-0-x.png": "https://signed.example/x" } };
    };

    it("says the work is in the full report, with a link, and carries no image or private link", () => {
      const email = reportEmail({ view: withWork(), parentName: "Priya Shah", url: URL });
      expect(email.text).toContain("Maya's work from the whiteboard is in the full report.");
      expect(email.html).toContain("Maya&#39;s work from the whiteboard is in the");
      for (const body of [email.text, email.html]) {
        expect(body).not.toMatch(/<img|signed\.example|s1-0-x\.png|carry the 1/);
      }
    });

    it("says nothing about work when the child showed none", () => {
      const email = reportEmail({ view: view(knowsUpTo(3)), parentName: "Priya Shah", url: URL });
      expect(email.text).not.toMatch(/whiteboard/);
    });
  });
});

describe("the alert to Savar for each finished test", () => {
  const alert = (over: Partial<Parameters<typeof reportAlert>[0]> = {}) =>
    reportAlert({
      view: view(knowsUpTo(3)),
      parent: { name: "Priya Shah", email: "priya@example.com" },
      url: URL,
      flags: [],
      completedInGrade: 12,
      parentEmail: { sent: true },
      ...over,
    });

  it("names the child, the grade and the working level in the subject", () => {
    expect(alert().subject).toBe("Test finished: Maya, grade 4, working at grade 3");
  });
  it("gives the grade, the working level, the flags and the link", () => {
    const { text } = alert();
    expect(text).toContain("School grade: 4 (BC)");
    expect(text).toContain("Working level: grade 3 (behind)");
    expect(text).toContain("Flags: none");
    expect(text).toContain(`Report: ${URL}`);
  });
  it("lists each flag in plain words (#71)", () => {
    const { text } = alert({
      flags: [
        { kind: "helped", answer: "a-little" },
        { kind: "too-fast", questionIds: ["s1-3", "s1-7", "up-2"], right: 2 },
        { kind: "pause-then-perfect", questionId: "s1-14", pauseMs: 250_000, rightBefore: 1 },
      ],
    });
    expect(text).toContain(
      'Flags: child answered "A little" to "Did anyone help?"; 3 answers under 3 seconds, 2 right (s1-3, s1-7, up-2); 4 min 10 s on s1-14, then 4 right in a row after 1 of 4 right before',
    );
  });
  it("gives the child's answer to \"Did anyone help?\", so \"No\" reads apart from a test that never asked", () => {
    expect(alert({ help: "no" }).text).toContain('Did anyone help?: "No"');
    expect(alert({ help: "a-little" }).text).toContain('Did anyone help?: "A little"');
    expect(alert({ help: null }).text).toContain("Did anyone help?: not asked");
  });
  it("says whether help is likely, so Savar knows the parent saw the warning", () => {
    expect(alert().text).toContain("Help likely: no");
    const v = view(knowsUpTo(3));
    expect(alert({ view: { ...v, model: { ...v.model, helpWarning: true } }, flags: [{ kind: "helped", answer: "yes" }] }).text).toContain(
      "Help likely: yes. The report says the level may be too high and suggests a retake.",
    );
  });
  it("gives the number facts, or none", () => {
    expect(alert().text).toContain("Facts: none");
    const v = view(knowsUpTo(3));
    const facts: ReportFacts = { scope: "Addition and subtraction facts to 20", seconds: 60, answered: 12, correct: 12, secondsPerFact: 4.6, accuracy: "secure", speed: "needs-practice" };
    expect(alert({ view: { ...v, model: { ...v.model, facts } } }).text).toContain("Facts: 12 of 12 right (Secure), typically 4.6 seconds a fact (Needs practice)");
  });
  it("gives the comparison stage with the count it came from", () => {
    expect(alert().text).toContain("Comparison: grade-level scale only (12 completed tests in grade 4)");
  });
  it("says whether the parent got the report", () => {
    expect(alert().text).toContain("Parent email: sent to priya@example.com");
    expect(alert({ parentEmail: { sent: false, reason: "Resend answered 403" } }).text).toContain(
      "Parent email: NOT SENT (Resend answered 403). Send the report link by hand.",
    );
  });
});
