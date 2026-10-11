import { describe, expect, it } from "vitest";
import { reportModel, type Grade, type Province, type ReportFacts } from "@/lib/assessment";
import { allRight, knowsUpTo, takeTest, type Script } from "@/lib/assessment/scripted-child";
import {
  STATUS_LABEL,
  factsView,
  howWeHelp,
  levelNotes,
  levelSentence,
  metaLine,
  nextStep,
  reportDate,
  reportPath,
  thresholdsLine,
  verdictSentence,
  type ReportView,
} from "@/lib/report-view";

/** A finished report for a scripted child, as the page and the email get it. */
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

/** The same report with another working level, for levels the sample bank cannot reach. */
const atLevel = (v: ReportView, working: ReportView["model"]["level"]["working"]): ReportView => ({
  ...v,
  model: { ...v.model, level: { ...v.model.level, working } },
});

describe("the overall level", () => {
  it("leads with the working level, named for the child", () => {
    expect(levelSentence(view(knowsUpTo(3)))).toBe("Maya is working at a grade 3 level.");
  });
  it("names level 0 kindergarten", () => {
    expect(levelSentence(atLevel(view(knowsUpTo(3)), 0))).toBe("Maya is working at a kindergarten level.");
  });
  it("says plainly how far below the school grade a child is", () => {
    expect(verdictSentence(view(knowsUpTo(3)))).toBe("That is one grade below Maya's school grade (grade 4).");
    expect(verdictSentence(atLevel(view(knowsUpTo(3)), 1))).toBe("That is three grades below Maya's school grade (grade 4).");
  });
  it("says plainly how far above the school grade a child is", () => {
    expect(verdictSentence(atLevel(view(allRight), 6))).toBe("That is two grades above Maya's school grade (grade 4).");
  });
  it("says when the level matches the school grade", () => {
    expect(verdictSentence(view(knowsUpTo(4)))).toBe("That matches Maya's school grade.");
  });
});

describe("notes on how sure the level is", () => {
  it("none when the test found the level", () => {
    expect(levelNotes(view(knowsUpTo(4)))).toEqual([]);
  });
  it("a child who cleared the highest level the test reached may work higher still", () => {
    expect(levelNotes(view(allRight))).toEqual(["The test went up to grade 5, and Maya got 70% or more of those questions right. Maya may work above this level."]);
  });
  it("a child who cleared no level gets an estimate, and is told so", () => {
    expect(levelNotes(view(knowsUpTo(2)))).toEqual(["Maya got under 70% right at every level in this test, so grade 2 is an estimate."]);
  });
});

describe("number facts (#70): speed beside accuracy, never alone", () => {
  const SLOW: ReportFacts = {
    scope: "Addition and subtraction facts to 20, and multiplication facts for 2, 5 and 10",
    seconds: 60,
    answered: 12,
    correct: 12,
    secondsPerFact: 4.6,
    accuracy: "secure",
    speed: "needs-practice",
  };
  const withFacts = (facts: ReportFacts | null): ReportView => {
    const v = view(knowsUpTo(3));
    return { ...v, model: { ...v.model, facts } };
  };

  it("shows nothing when the child had no facts section", () => {
    expect(factsView(withFacts(null))).toBeNull();
  });
  it("shows nothing for a report stored before the facts section existed", () => {
    const v = view(knowsUpTo(3));
    const old: Partial<ReportView["model"]> = { ...v.model };
    delete old.facts;
    expect(factsView({ ...v, model: old as ReportView["model"] })).toBeNull();
  });
  it("accurate but slow: accuracy is Secure and speed needs practice, never behind", () => {
    const f = factsView(withFacts(SLOW));
    expect(f).toEqual({
      scope: "Addition and subtraction facts to 20, and multiplication facts for 2, 5 and 10.",
      round: "A 60-second round, only with facts for this grade.",
      accuracy: { value: "12 of 12 right", label: "Secure" },
      speed: { value: "typically 4.6 seconds a fact", label: "Needs practice" },
      note: "Speed comes with practice. It does not change Maya's working level.",
      thresholds: "Secure: 90% or more right. Quick: 3 seconds or less a fact.",
    });
    expect(JSON.stringify(f)).not.toMatch(/behind/i);
  });
  it("quick and accurate: no practice note", () => {
    const f = factsView(withFacts({ ...SLOW, secondsPerFact: 1.8, speed: "quick" }));
    expect(f?.speed).toEqual({ value: "typically 1.8 seconds a fact", label: "Quick" });
    expect(f?.note).toBeNull();
  });
  it("nothing answered: no accuracy and no speed, and it says so", () => {
    const f = factsView(withFacts({ ...SLOW, answered: 0, correct: 0, secondsPerFact: null, accuracy: null, speed: null }));
    expect(f).toMatchObject({ accuracy: null, speed: null, note: "Maya answered no facts in the 60 seconds." });
  });
  it("never shows speed without accuracy", () => {
    const cases: ReportFacts[] = [SLOW, { ...SLOW, speed: "quick" }, { ...SLOW, answered: 0, correct: 0, secondsPerFact: null, accuracy: null, speed: null }];
    for (const facts of cases) {
      const f = factsView(withFacts(facts));
      expect(f?.speed === null, JSON.stringify(facts)).toBe(f?.accuracy === null);
    }
  });
});

describe("the report page", () => {
  it("is in the parent's account", () => expect(reportPath("abc")).toBe("/account/report/abc"));
});

describe("the areas", () => {
  it("label each status in plain words", () => {
    expect(STATUS_LABEL).toEqual({ secure: "Secure", developing: "Developing", "needs-attention": "Needs attention" });
  });
  it("state the thresholds and that the count is an early signal, not a verdict (D-084)", () => {
    expect(thresholdsLine(view(knowsUpTo(4)))).toBe("Secure: 80% or more right. Developing: 50-79%. Needs attention: under 50%. 36 questions is an early signal, not a final verdict.");
  });
});

describe("the date and the closing line", () => {
  // 05:30 UTC on October 11 is still October 10 in BC, but already October 11 in Ontario.
  const late = (v: ReportView): ReportView => ({ ...v, completedAt: "2026-10-11T05:30:00Z" });
  it("dates the test in the family's own time zone", () => {
    expect(reportDate(late(view(knowsUpTo(4))))).toBe("October 10, 2026");
    expect(reportDate(late(view(knowsUpTo(4), { province: "ON" })))).toBe("October 11, 2026");
  });
  it("gives the date, the questions, the minutes and the curriculum the test measured against", () => {
    expect(metaLine(view(knowsUpTo(4), { province: "ON" }))).toBe("Math placement · October 10, 2026 · 36 questions in 34 minutes · measured against Ontario grade expectations");
  });
  it("says 1 minute, not 1 minutes", () => {
    expect(metaLine({ ...view(knowsUpTo(4)), minutes: 1 })).toContain("36 questions in 1 minute ·");
  });
  it("adds no curriculum note for another province, which is scored against BC (D-083)", () => {
    expect(metaLine(view(knowsUpTo(4), { province: "other" }))).toBe("Math placement · October 10, 2026 · 36 questions in 34 minutes");
  });
});

describe("the next step", () => {
  it("BC families add a card, and see both plans and when the charge starts", () => {
    const step = nextStep(view(knowsUpTo(4)));
    expect(step).toMatchObject({ kind: "card", title: "Start Maya's books" });
    expect(step.text).toContain("CAD 139");
    expect(step.text).toContain("CAD 229");
    expect(step.text).toContain("We charge nothing until the first workbook ships.");
  });
  it("says the money-back guarantee starts with the first payment (D-055)", () => {
    expect(nextStep(view(knowsUpTo(4))).text).toContain("30-day money-back guarantee from the first payment.");
  });
  it("a family in another tagged province joins the waitlist for that curriculum", () => {
    expect(nextStep(view(knowsUpTo(4), { province: "ON" }))).toMatchObject({ kind: "waitlist", title: "Books for the Ontario curriculum are coming" });
  });
  it("a family in another province, or not sure, joins the waitlist without a province name", () => {
    expect(nextStep(view(knowsUpTo(4), { province: "other" }))).toMatchObject({ kind: "waitlist", title: "Books for more provinces are coming" });
  });
});

describe("how we help, by verdict (D-084)", () => {
  it("behind: catch up, then move ahead", () => {
    expect(howWeHelp(view(knowsUpTo(3)))).toEqual({
      title: "Catch up, then move ahead",
      text: "Maya's first book starts at grade 3 work, with extra practice in the areas marked Developing or Needs attention. After each photo check-in, we see what is secure and move the next book on: to grade 4 work, then past it when Maya is ready.",
    });
  });
  it("on grade: get ahead", () => {
    expect(howWeHelp(view(knowsUpTo(4)))).toEqual({
      title: "Get ahead",
      text: "Maya's books keep grade 4 work steady, with extra practice in the areas marked Developing or Needs attention, and bring in grade 5 topics when Maya is ready, so Maya sees them before the class does.",
    });
  });
  it("ahead: go further", () => {
    expect(howWeHelp(view(allRight))).toEqual({
      title: "Go further",
      text: "Maya already does grade 5 work. The books start there, so Maya learns new things instead of repeating known work, and the topics from school stay covered.",
    });
  });
  it("never invents a weakness: with every area secure, no verdict mentions extra practice", () => {
    const secure = (v: ReportView): ReportView => ({ ...v, model: { ...v.model, strands: v.model.strands.map((s) => ({ ...s, status: "secure" as const })) } });
    for (const v of [view(knowsUpTo(3)), view(knowsUpTo(4)), view(allRight)]) {
      expect(howWeHelp(secure(v)).text, v.model.howWeHelp).not.toMatch(/practice/);
    }
  });
});
