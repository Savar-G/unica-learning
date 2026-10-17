import { describe, expect, it } from "vitest";
import { MISCONCEPTIONS, reportModel, type Grade, type Province, type ReportFacts, type ReportFindings } from "@/lib/assessment";
import { allRight, knowsUpTo, takeTest, type Script } from "@/lib/assessment/scripted-child";
import {
  comparisonView,
  STATUS_LABEL,
  factsView,
  helpWarning,
  howWeHelp,
  levelNotes,
  levelSentence,
  metaLine,
  nextStep,
  reportDate,
  reportPath,
  reportReturnPath,
  summaryText,
  certaintyText,
  leftOutLine,
  reliabilityNote,
  thresholdsLine,
  verdictSentence,
  strengthsView,
  strugglesView,
  workbookPreview,
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

describe("the measured comparison", () => {
  const withComparison = (comparison: ReportView["model"]["comparison"]) => {
    const v = view(knowsUpTo(4));
    return { ...v, model: { ...v.model, comparison } };
  };
  it("shows all band words with the measured n and a test-taker scope", () => {
    for (const [band, words] of [["lower", "lower quarter"], ["middle", "middle half"], ["upper", "upper quarter"]] as const) {
      expect(comparisonView(withComparison({ stage: "bands", n: 100, band }))?.text).toBe(
        `Maya's result is in the ${words} of 100 grade 4 children who took this test.`,
      );
    }
  });
  it("names the percentile and explains ties", () => {
    expect(comparisonView(withComparison({ stage: "percentile", n: 400, percentile: 75 }))).toMatchObject({
      text: "Maya's result is at the 75th percentile among 400 grade 4 children who took this test.",
      note: expect.stringContaining("half of equal results"),
    });
    for (const [percentile, ordinal] of [[1, "1st"], [2, "2nd"], [3, "3rd"], [11, "11th"], [12, "12th"], [13, "13th"], [21, "21st"], [100, "100th"]] as const) {
      expect(comparisonView(withComparison({ stage: "percentile", n: 400, percentile }))?.text).toContain(`${ordinal} percentile`);
    }
  });
  it("keeps the scale only for small cohorts, legacy unranked models, and help warnings", () => {
    for (const comparison of [{ stage: "scale", n: 99 }, { stage: "bands", n: 100 }, { stage: "percentile", n: 400 }] as const) {
      expect(comparisonView(withComparison(comparison))).toBeNull();
    }
    const v = withComparison({ stage: "percentile", n: 400, percentile: 75 });
    expect(comparisonView({ ...v, model: { ...v.model, helpWarning: true } })).toBeNull();
  });
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

describe("the AI paragraph (#68)", () => {
  it("puts the child's name where the AI text has {name}", () => {
    const v = view(knowsUpTo(4));
    const withSummary = { ...v, model: { ...v.model, summary: "{name} is working at a grade 4 level. {name} is secure in every area." } };
    expect(summaryText(withSummary)).toBe("Maya is working at a grade 4 level. Maya is secure in every area.");
  });
  it("is absent when the report has no AI text: the plain sentences stand alone", () => {
    expect(summaryText(view(knowsUpTo(4)))).toBeNull();
  });
});

describe("the help warning (#71)", () => {
  const helped = (v: ReportView, helpWarning = true): ReportView => ({ ...v, model: { ...v.model, helpWarning } });

  it("says the level may be too high and suggests a retake on the day the 30-day wait has ended (#72)", () => {
    // Finished 12:30 p.m. October 10 in BC; the next test opens 30 days later, at 11:30 a.m. November 9, so the first
    // whole day it is open is November 10.
    expect(helpWarning(helped(view(knowsUpTo(4))))).toEqual({
      title: "This level may be too high",
      text: "We saw signs in this test that can make a level look higher than it is, such as help with some questions or answers given very quickly.",
      retake: "For a level you can trust, Maya can take a new test alone, with new questions, from November 10, 2026.",
    });
  });
  it("dates the retake in the family's time zone", () => {
    // Opens at 07:00 UTC November 10: 2 a.m. that day in Ontario (first whole day November 11), but 11 p.m.
    // November 9 in BC (first whole day November 10).
    const v = { ...helped(view(knowsUpTo(4), { province: "ON" })), completedAt: "2026-10-11T07:00:00Z" };
    expect(helpWarning(v)?.retake).toContain("from November 11, 2026.");
    expect(helpWarning({ ...v, province: "BC" })?.retake).toContain("from November 10, 2026.");
  });
  it("is absent when help is not likely, and in reports stored before #71", () => {
    expect(helpWarning(helped(view(knowsUpTo(4)), false))).toBeNull();
    const v = view(knowsUpTo(4));
    const old: Partial<ReportView["model"]> = { ...v.model };
    delete old.helpWarning;
    expect(helpWarning({ ...v, model: old as ReportView["model"] })).toBeNull();
  });
  it("never blames the child or the parent", () => {
    const w = helpWarning(helped(view(knowsUpTo(4))));
    expect(JSON.stringify(w)).not.toMatch(/cheat|honest|lie|fault|blame/i);
  });
});

describe("number facts (#70): speed beside accuracy, never alone; grades 1-4 see accuracy only (D-120)", () => {
  const SLOW: ReportFacts = {
    scope: "Addition and subtraction facts to 20, and multiplication facts for 2, 5 and 10",
    seconds: 60,
    answered: 12,
    correct: 12,
    secondsPerFact: 4.6,
    accuracy: "secure",
    speed: "needs-practice",
  };
  /** A grade 6 report (speed shows from grade 5), or another grade's, with these facts. */
  const withFacts = (facts: ReportFacts | null, grade: Grade = 6): ReportView => {
    const v = view(knowsUpTo(grade - 1), { grade });
    return { ...v, model: { ...v.model, facts } };
  };

  it("for grades 1-4, shows accuracy without speed: BC does not expect memorized facts there", () => {
    for (const grade of [1, 2, 3, 4] as const) {
      expect(factsView(withFacts(SLOW, grade)), `grade ${grade}`).toEqual({
        scope: "Addition and subtraction facts to 20, and multiplication facts for 2, 5 and 10.",
        round: "A 60-second round, only with facts for this grade.",
        accuracy: { value: "12 of 12 right", label: "Secure", big: "100%", detail: "12 of 12 right" },
        speed: null,
        note: null,
        thresholds: "Secure: 90% or more right.",
      });
    }
    for (const grade of [5, 6, 7] as const) expect(factsView(withFacts(SLOW, grade))?.speed, `grade ${grade}`).not.toBeNull();
  });

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
      accuracy: { value: "12 of 12 right", label: "Secure", big: "100%", detail: "12 of 12 right" },
      speed: { value: "typically 4.6 seconds a fact", label: "Needs practice", big: "4.6 s", detail: "typical time for one fact" },
      note: "Speed comes with practice. It does not change Maya's working level.",
      thresholds: "Secure: 90% or more right. Quick: 3 seconds or less a fact.",
    });
    expect(JSON.stringify(f)).not.toMatch(/behind/i);
  });
  it("quick and accurate: no practice note", () => {
    const f = factsView(withFacts({ ...SLOW, secondsPerFact: 1.8, speed: "quick" }));
    expect(f?.speed).toEqual({ value: "typically 1.8 seconds a fact", label: "Quick", big: "1.8 s", detail: "typical time for one fact" });
    expect(f?.note).toBeNull();
  });
  it("the big accuracy number is the share right, in whole percent", () => {
    expect(factsView(withFacts({ ...SLOW, answered: 12, correct: 11 }))?.accuracy).toMatchObject({ big: "92%", detail: "11 of 12 right" });
    expect(factsView(withFacts({ ...SLOW, answered: 9, correct: 7, accuracy: "needs-practice" }))?.accuracy).toMatchObject({ big: "78%", label: "Needs practice" });
  });
  it("nothing answered: no accuracy and no speed, and it says so", () => {
    const f = factsView(withFacts({ ...SLOW, answered: 0, correct: 0, secondsPerFact: null, accuracy: null, speed: null }));
    expect(f).toMatchObject({ accuracy: null, speed: null, note: "Maya answered no facts in the 60 seconds." });
  });
  it("never shows speed without accuracy", () => {
    const cases: ReportFacts[] = [SLOW, { ...SLOW, speed: "quick" }, { ...SLOW, answered: 0, correct: 0, secondsPerFact: null, accuracy: null, speed: null }];
    for (const grade of [2, 6] as const) {
      for (const facts of cases) {
        const f = factsView(withFacts(facts, grade));
        if (f?.speed) expect(f.accuracy, JSON.stringify(facts)).not.toBeNull();
      }
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
  // As stored before #189: no certainty key on any area.
  const unlabelled = (v: ReportView): ReportView => ({ ...v, model: { ...v.model, strands: v.model.strands.map((s) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== "certainty")) as typeof s) } });
  it("state the thresholds and that the count is an early signal, not a verdict (D-084)", () => {
    expect(thresholdsLine(unlabelled(view(knowsUpTo(4))))).toBe("Secure: 80% or more right. Developing: 50-79%. Needs attention: under 50%. 36 questions is an early signal, not a final verdict.");
  });
  it("explains the certainty labels instead of the early-signal line once the areas carry them (#189)", () => {
    const v = view(knowsUpTo(4));
    expect(v.model.strands.every((s) => s.certainty)).toBe(true);
    expect(thresholdsLine(v)).not.toBe(thresholdsLine(unlabelled(v)));
    expect(thresholdsLine(v)).not.toContain("early signal");
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
  it("BC families add a card, and see the math price and when the charge starts", () => {
    const step = nextStep(view(knowsUpTo(4)));
    expect(step).toMatchObject({ kind: "card", title: "Start Maya's books" });
    expect(step.text).toContain("Math is CAD 99 a month");
    expect(step.text).toContain("30% off the first month (CAD 69.30)");
    expect(step.text).not.toContain("reading");
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
  it("BC families get the one plan, math at CAD 99, the price of the site's plan", () => {
    expect(nextStep(view(knowsUpTo(4))).plans).toEqual([
      { plan: "one", subject: "Math", price: 99, label: "Math, CAD 99 a month" },
    ]);
  });
  it("waitlist families get no plans to choose", () => {
    expect(nextStep(view(knowsUpTo(4), { province: "ON" })).plans).toEqual([]);
  });
  it("the email's button opens the plan step for BC, and the waitlist step elsewhere", () => {
    expect(nextStep(view(knowsUpTo(4))).email).toEqual({ label: "Choose a plan for Maya", step: "plan" });
    expect(nextStep(view(knowsUpTo(4), { province: "ON" })).email).toEqual({ label: "Join the waitlist", step: "waitlist" });
  });
});

describe("the link to the next step (#66)", () => {
  it("is where a signed-out parent comes back to after sign-in, with the step and the place on the page", () => {
    expect(reportReturnPath("abc", { src: "email", step: "plan" })).toBe("/account/report/abc?src=email&step=plan#rpt-next");
    expect(reportReturnPath("abc", { src: "email", step: null })).toBe("/account/report/abc?src=email");
    expect(reportReturnPath("abc", { src: "account", step: null })).toBe("/account/report/abc");
  });
});

describe("how we help, by verdict (D-084)", () => {
  it("behind: catch up, then move ahead", () => {
    expect(howWeHelp(view(knowsUpTo(3)))).toEqual({
      title: "Catch up, then move ahead",
      text: "Maya's first book starts at grade 3 work, with extra practice in the areas marked Developing or Needs attention. After each photo check-in, we see what is secure and move the next book on: to grade 4 work, then past it when Maya is ready.",
    });
  });
  it("on grade, every area secure at grade level: get ahead, with no practice named", () => {
    // Knows grade 4, misses the grade 5 questions of stage 2: those count for the level, not for the areas.
    expect(howWeHelp(view(knowsUpTo(4)))).toEqual({
      title: "Get ahead",
      text: "Maya's books keep grade 4 work steady, and bring in grade 5 topics when Maya is ready, so Maya sees them before the class does.",
    });
  });
  it("on grade with a weaker area: get ahead, with extra practice", () => {
    // 10 of 18 right in stage 1 (stays on grade), then every stage 2 question right.
    const text = howWeHelp(view((_, i) => i < 10 || i >= 18)).text;
    expect(text).toBe(
      "Maya's books keep grade 4 work steady, with extra practice in the areas marked Developing or Needs attention, and bring in grade 5 topics when Maya is ready, so Maya sees them before the class does.",
    );
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

// #189 (spec #181): certainty labels, the reliability note and its retake time. These assert state and structure, not
// copy (spec #181, Testing Decisions).
describe("certainty labels", () => {
  it("gives a label for each certainty, a different one for each, and none for a result stored before the labels", () => {
    const v = view(allRight);
    const [clear, early] = [certaintyText(v, "clear"), certaintyText(v, "early-sign")];
    expect(clear).toBeTruthy();
    expect(early).toBeTruthy();
    expect(clear).not.toBe(early);
    expect(certaintyText(v, undefined)).toBeNull();
  });
  it("promises no workbook to a family on the waitlist, who has none yet", () => {
    const waitlist = certaintyText(view(allRight, { province: "ON" }), "early-sign");
    expect(waitlist).toBeTruthy();
    expect(waitlist).not.toBe(certaintyText(view(allRight), "early-sign"));
    expect(waitlist).not.toMatch(/workbook/i);
  });
});

describe("the reliability note", () => {
  const rushed = (v: ReportView): ReportView => ({ ...v, model: { ...v.model, reliability: { veryFast: 12, answers: 36 } } });
  // Opens 11:30 a.m. November 9 in BC, so the first whole day is November 10.
  const opens = { kind: "opens", at: Date.parse("2026-11-09T19:30:00Z") } as const;

  it("is absent at a steady pace", () => {
    expect(reliabilityNote(view(allRight))).toBeNull();
  });
  it("gives the count of very fast answers", () => {
    expect(reliabilityNote(rushed(view(allRight)))).toMatchObject({ veryFast: 12, answers: 36 });
  });
  // D-108: the new test at once comes at most once per 30 days, so the note follows the account's start rules.
  it("says now when a new test is open, the first whole day when the 30-day wait applies, and no time when unknown", () => {
    const v = rushed(view(allRight));
    expect(reliabilityNote(v, { kind: "open" })?.when).toEqual({ kind: "now" });
    expect(reliabilityNote(v, opens)?.when).toEqual({ kind: "from", date: "November 10, 2026" });
    expect(reliabilityNote(v)?.when).toEqual({ kind: "unknown" });
    const offers = [reliabilityNote(v, { kind: "open" })?.offer, reliabilityNote(v, opens)?.offer, reliabilityNote(v)?.offer];
    expect(new Set(offers).size).toBe(3);
    expect(offers[1]).toContain("November 10, 2026");
  });
  it("makes the help warning's retake line agree with the note: the same date, or none", () => {
    const v = rushed(view(knowsUpTo(4)));
    const helped = { ...v, model: { ...v.model, helpWarning: true } };
    expect(helpWarning(helped, opens)?.retake).toContain("November 10, 2026");
    for (const retake of [{ kind: "open" } as const, undefined]) expect(helpWarning(helped, retake)?.retake).not.toMatch(/\d{4}/);
    expect(helpWarning(helped, { kind: "open" })?.retake).not.toBe(helpWarning(helped)?.retake);
  });
});

describe("rushed wrong answers left out", () => {
  it("gives a line with the count when answers were left out, and nothing when none were", () => {
    const v = view(allRight);
    expect(leftOutLine({ ...v, model: { ...v.model, leftOut: 3 } })).toMatch(/^3 /);
    expect(leftOutLine({ ...v, model: { ...v.model, leftOut: 1 } })).toMatch(/^1 /);
    expect(leftOutLine(v)).toBeNull();
  });
});

describe("strengths, struggles and the workbook 1 preview (#198)", () => {
  // The parent's part of a learner profile (reportFindings), as the loaded report carries it.
  const FINDINGS: ReportFindings = {
    strengths: [{ code: "4.5", text: "multiplication and division to two digits (single-digit multiplier)", grade: 4, aboveGrade: false, correct: 6, total: 6, certainty: "clear" }],
    struggles: [
      {
        code: "4.4", text: "addition and subtraction to 10 000", grade: 4, correct: 1, total: 3, certainty: "early-sign", status: "needs-attention",
        answer: { prompt: "6,205 − 2,457 = ?", response: "4252", rightAnswer: "3748" },
        cause: { source: "misconception", text: MISCONCEPTIONS.O1.description },
      },
      {
        code: "4.1", text: "number concepts to 10 000", grade: 4, correct: 1, total: 2, certainty: "early-sign", status: "developing",
        answer: { prompt: "What is the value of the 3 in 3,627?", response: "3", rightAnswer: "3000" },
        cause: { source: "ai", text: "{name} may read each digit as ones." },
      },
    ],
    preview: { focus: [{ code: "4.4", text: "addition and subtraction to 10 000", grade: 4 }], challenge: [{ code: "4.9", text: "increasing and decreasing patterns, using tables and charts", grade: 4 }] },
  };
  const withFindings = (findings: ReportFindings | null, v = view(knowsUpTo(3))): ReportView => ({ ...v, findings });

  it("shows none of them for a report without findings: no learner profile (another curriculum), or none stored yet", () => {
    for (const v of [view(knowsUpTo(3)), withFindings(null)]) {
      expect(strengthsView(v)).toBeNull();
      expect(strugglesView(v)).toBeNull();
      expect(workbookPreview(v)).toBeNull();
    }
  });

  it("hides strengths and struggles when there are none", () => {
    const v = withFindings({ ...FINDINGS, strengths: [], struggles: [] });
    expect(strengthsView(v)).toBeNull();
    expect(strugglesView(v)).toBeNull();
  });

  it("gives each struggle the child's answer, the right answer and the likely cause, in the child's name", () => {
    const struggles = strugglesView(withFindings(FINDINGS))!;
    expect(struggles.map((s) => [s.answer, s.rightAnswer])).toEqual([["4252", "3748"], ["3", "3000"]]);
    // The known mistake in plain words; the AI's text with the child's name for {name}.
    expect(struggles[0].cause).toContain(MISCONCEPTIONS.O1.description.toLowerCase());
    expect(struggles[1].cause).toBe("Maya may read each digit as ones.");
    const noCause = withFindings({ ...FINDINGS, struggles: [{ ...FINDINGS.struggles[0], cause: null }] });
    expect(strugglesView(noCause)![0].cause).toBeNull();
  });

  it("previews workbook 1 for a family that can start the books, and never for the waitlist, which has no workbook yet", () => {
    const preview = workbookPreview(withFindings(FINDINGS))!;
    expect(preview).toMatch(/^Workbook 1 focuses on addition and subtraction to 10 000\. We will challenge Maya on increasing and decreasing patterns\.$/);
    expect(workbookPreview(withFindings({ ...FINDINGS, preview: { ...FINDINGS.preview!, challenge: [] } }))).toBe("Workbook 1 focuses on addition and subtraction to 10 000.");
    expect(workbookPreview(withFindings({ ...FINDINGS, preview: null }))).toBeNull();
    // A topic from another grade than the child's names its grade: BC repeats some topics, such as the facts to 20.
    const later = { ...FINDINGS, preview: { focus: FINDINGS.preview!.focus, challenge: [{ code: "5.8", text: "addition and subtraction facts to 20 (extending computational fluency)", grade: 5 as const }] } };
    expect(workbookPreview(withFindings(later))).toBe("Workbook 1 focuses on addition and subtraction to 10 000. We will challenge Maya on grade 5 addition and subtraction facts to 20.");
    const waitlist = view(knowsUpTo(3), { province: "ON" });
    expect(waitlist.model.callToAction).toBe("waitlist");
    expect(workbookPreview(withFindings(FINDINGS, waitlist))).toBeNull();
  });
});
