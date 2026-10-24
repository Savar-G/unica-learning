import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReportCard } from "@/components/report";
import { reportEmail } from "@/lib/report-email";
import { BANKS, BC_SKILL_MAP, createSession, learnerProfile, reportModel, storedProfile, storedTest, type LearnerProfile, type Placement, type ProfileAi, type ShownWork, type StoredTest } from "@/lib/assessment";
import { knowsUpTo, takeTest } from "@/lib/assessment/scripted-child";
import { loadReportInputs, loadReportView, type ComparisonRead } from "@/lib/report-loading";
import { memoryReportReaders, type MemoryAnswer, type MemoryAssessment, type MemoryReportTables } from "@/lib/report-loading-memory";
import { aiReport, type ReviewStore } from "@/lib/work-review";

// The report-loading module (spec #145), through its public interface: the report view for one report id and one
// reader (#161), and the report inputs for one finished test (#162). The readers are the in-memory adapter, which keeps
// the database's access rules: a parent reads only their own rows (and never the stored test or the answers), an admin
// and the secret key read every row, a parent signs only the drawings in their own folder, and the secret key signs
// nothing. It counts the reads of each table.
vi.mock("server-only", () => ({}));

// Asha, grade 4 in BC, child of parent-1, works at grade 4: she gets every grade 4 question right and every grade 5
// question wrong, 20 seconds each. Her test went up to grade 5: 42 questions, 18 of them above her school grade.
const { asked, placement } = takeTest({ grade: 4, province: "BC" }, 1, knowsUpTo(4));
// The stored test: the same seed draws the same questions.
const test = storedTest(createSession({ grade: 4, province: "BC" }, 1));
const drawing = (parent: string, n: number) => `${parent}/test-1/${asked[n].id}-x.png`;

// The stored report. Four answers with work, in test order: three drawn and one typed. The report shows the first
// three (REPORT_WORK_MAX), so the fourth drawing is in the bucket but not on the report.
const work = (n: number, image: string | null, text: string | null = null): ShownWork =>
  ({ questionId: asked[n].id, prompt: asked[n].prompt, correct: true, required: true, image, text });
const shownWork = [work(0, drawing("parent-1", 0)), work(1, null, "47+38"), work(2, drawing("parent-1", 2)), work(3, drawing("parent-1", 3))];
const model = reportModel(placement, { workReviews: [], shownWork });

const ASSESSMENT: MemoryAssessment = {
  id: "test-1", parentId: "parent-1", childId: "child-1", status: "completed", grade: 4, province: "BC",
  completedAt: "2026-10-10T19:30:00Z", placement, help: "no", test,
};

// Asha's stored answers, as she gave them, with work on four: s1-3 (show your work, drawn), s1-4 (show your work,
// typed), s1-6 (optional work, drawn) and up-8 (grade 5, show your work, drawn, a wrong answer that matches a known
// mistake). Stored in any order: the reader gives them in test order.
const WORK: Record<number, Partial<MemoryAnswer>> = {
  3: { workPath: drawing("parent-1", 3) },
  4: { workRequired: true, workText: "20.00 - 13.10" },
  6: { workPath: drawing("parent-1", 6) },
  26: { response: "614.1", misconception: "operation", workPath: drawing("parent-1", 26) },
};
const answers = (timeMs: (n: number) => number = () => 20_000): MemoryAnswer[] => asked.map((q, n): MemoryAnswer => ({
  assessmentId: "test-1", position: n, questionId: q.id, response: q.level <= 4 ? q.answer : "no idea", correct: q.level <= 4,
  misconception: null, timeMs: timeMs(n), workRequired: q.showWork === true, workPath: null, workText: null, ...WORK[n],
})).reverse();

/** One stored report for Asha, with her test, its answers, her child row and the drawings bucket. `drop` leaves a row out. */
function tables({ drop }: { drop?: "child" | "assessment" } = {}): MemoryReportTables {
  return {
    reports: [{ id: "report-1", assessmentId: "test-1", parentId: "parent-1", childId: "child-1", model, questions: 36, minutes: 34 }],
    assessments: drop === "assessment" ? [] : [ASSESSMENT],
    answers: answers(),
    children: drop === "child" ? [] : [{ id: "child-1", parentId: "parent-1", firstName: "Asha" }],
    drawings: [drawing("parent-1", 0), drawing("parent-1", 2), drawing("parent-1", 3)],
  };
}

/** A comparison read that must not be called. */
const noComparison: ComparisonRead = async () => {
  throw new Error("the comparison was read");
};

describe("the report view (#161)", () => {
  it("is the same through the parent reader and the admin reader, except for the signed drawings", async () => {
    const readers = memoryReportReaders(tables());
    const asParent = await loadReportView(readers.parent("parent-1"), "report-1");
    const asAdmin = await loadReportView(readers.admin(), "report-1");

    const expected = {
      childId: "child-1",
      assessmentId: "test-1",
      // No learner profile is stored (#198).
      view: { id: "report-1", childName: "Asha", province: "BC", completedAt: "2026-10-10T19:30:00Z", questions: 36, minutes: 34, model, findings: null },
    };
    for (const loaded of [asParent, asAdmin]) {
      const { workImages, ...view } = loaded!.view;
      expect({ ...loaded, view }).toEqual(expected);
      expect(Object.keys(workImages ?? {}).sort()).toEqual([drawing("parent-1", 0), drawing("parent-1", 2)].sort());
    }
    // Each reader signs the drawings for itself.
    expect(asParent!.view.workImages![drawing("parent-1", 0)]).not.toBe(asAdmin!.view.workImages![drawing("parent-1", 0)]);
  });

  it("is not found through another parent's reader, and nothing is signed for them", async () => {
    const readers = memoryReportReaders(tables());
    expect(await loadReportView(readers.parent("parent-2"), "report-1")).toBeNull();
    expect(readers.signed).toEqual([]);
    // The report is still there for its own parent and for the admin.
    expect(await loadReportView(readers.parent("parent-1"), "report-1")).not.toBeNull();
    expect(await loadReportView(readers.admin(), "report-1")).not.toBeNull();
  });

  it("is not found when the child or the test is missing, or there is no such report, for every reader", async () => {
    for (const drop of ["child", "assessment"] as const) {
      const readers = memoryReportReaders(tables({ drop }));
      expect(await loadReportView(readers.parent("parent-1"), "report-1"), `no ${drop}, parent`).toBeNull();
      expect(await loadReportView(readers.admin(), "report-1"), `no ${drop}, admin`).toBeNull();
      expect(readers.signed).toEqual([]);
    }
    const readers = memoryReportReaders(tables());
    expect(await loadReportView(readers.parent("parent-1"), "report-2")).toBeNull();
    expect(await loadReportView(readers.admin(), "report-2")).toBeNull();
  });

  it("signs only the drawings of the report's work: not typed work, and not a drawing the report leaves out", async () => {
    const readers = memoryReportReaders(tables());
    await loadReportView(readers.parent("parent-1"), "report-1");
    await loadReportView(readers.admin(), "report-1");
    const onReport = [drawing("parent-1", 0), drawing("parent-1", 2)];
    expect(readers.signed).toEqual([{ reader: "parent-1", paths: onReport }, { reader: "admin", paths: onReport }]);
  });

  it("leaves out stored work for a question of the removed extra round (#190, D-145): not shown, not signed", async () => {
    const t = tables();
    const roundWork = { questionId: "x-0", prompt: "ROUND QUESTION", correct: true, image: "parent-1/test-1/x-0-x.png", text: "ROUND WORKING", comment: null };
    const readers = memoryReportReaders({ ...t, reports: t.reports?.map((r) => ({ ...r, model: { ...r.model, work: [roundWork, ...(r.model.work ?? [])] } })) });
    for (const reader of [readers.parent("parent-1"), readers.admin()]) {
      const { view } = (await loadReportView(reader, "report-1"))!;
      expect(view.model.work?.map((w) => w.questionId)).toEqual(model.work.map((w) => w.questionId));
      const page = renderToStaticMarkup(createElement(ReportCard, { view, readOnly: true }));
      const email = reportEmail({ view, parentName: "Priya Shah", url: "https://unicalearning.com/account/report/report-1", unsubscribeUrl: "https://unicalearning.com/unsubscribe" });
      for (const place of [page, email.text, email.html]) expect(place).not.toMatch(/ROUND QUESTION|ROUND WORKING|x-0-x\.png/);
    }
    expect(readers.signed.flatMap((x) => x.paths)).not.toContain("parent-1/test-1/x-0-x.png");
  });
});

describe("a stored report reads with the rules of today (#242)", () => {
  /** The report page, and the email in text and HTML, of one stored report model, read through the loader. */
  async function shown(stored: typeof model) {
    const t = tables();
    const readers = memoryReportReaders({ ...t, reports: t.reports?.map((r) => ({ ...r, model: stored })) });
    const { view } = (await loadReportView(readers.parent("parent-1"), "report-1"))!;
    const email = reportEmail({ view, parentName: "Priya Shah", url: "https://unicalearning.com/account/report/report-1", unsubscribeUrl: "https://unicalearning.com/unsubscribe" });
    return { view, places: [renderToStaticMarkup(createElement(ReportCard, { view, readOnly: true })), email.text, email.html] };
  }

  it("shows a report stored with the removed extra round (#190, D-145) without any word about it", async () => {
    const { view, places } = await shown({ ...model, extraRound: { questions: 8, strands: ["number"] } } as typeof model);
    expect(view.model.strands).toEqual(model.strands);
    for (const place of places) {
      expect(place).toContain("By area");
      expect(place).not.toMatch(/extra question/i);
    }
  });

  it("leaves out a stored AI summary that states the facts timing (grade 4) or says something was not tested", async () => {
    for (const summary of ["{name} took 2 seconds to answer each fact.", "{name} recalled the facts instantly.", "The multiplication facts were not tested."]) {
      const { view, places } = await shown({ ...model, summary });
      expect(view.model, summary).not.toHaveProperty("summary");
      const words = summary.replace("{name} ", "");
      for (const place of places) expect(place, summary).not.toContain(words);
    }
    // A summary that breaks no rule still shows.
    const { places } = await shown({ ...model, summary: "{name} is secure in every area." });
    for (const place of places) expect(place).toContain("Asha is secure in every area.");
  });

  it("never says How sure: Clear for a stored estimate that was labelled clear", async () => {
    // Grade 4, knows up to grade 2: no level reaches 70%, so the working level is an estimate.
    const estimate = reportModel(takeTest({ grade: 4, province: "BC" }, 1, knowsUpTo(2)).placement, { workReviews: [] });
    expect(estimate.level.confidence).toBe("low");
    const { view, places } = await shown({ ...estimate, level: { ...estimate.level, certainty: "clear" } });
    expect(view.model.level.certainty).toBe("early-sign");
    for (const place of places) expect(place).not.toMatch(/How sure:(<[^>]*>|\s)*Clear/);
  });
});

describe("the parent's part of the learner profile on the report view (#198)", () => {
  // Asha's stored learner profile, built from her answers with every answer on one grade 4 standard wrong, so that
  // standard is a struggle with more than one wrong answer. The stored JSON also has the admin-only parts: her test
  // behaviour, every wrong answer, how to help, the model ids and the build id.
  const standardOf = (q: (typeof asked)[number]) => BANKS["3-5"].find((t) => t.id === q.templateId)?.standard;
  // The grade 4 standard asked most often.
  const atGrade = asked.filter((q) => q.level === 4).map(standardOf);
  const missed = atGrade.sort((a, b) => atGrade.filter((x) => x === b).length - atGrade.filter((x) => x === a).length)[0]!;
  const wrong = (q: (typeof asked)[number]) => q.level > 4 || standardOf(q) === missed;
  const facts: LearnerProfile = learnerProfile({
    placement,
    answers: asked.map((q, n) => ({
      question: q, response: wrong(q) ? `wrong-${n}` : q.answer, correct: !wrong(q), misconception: null,
      timeMs: 20_000, work: { required: false, drawing: false, typed: false }, readAloud: null, away: null,
    })),
    help: "no",
    learning: null,
  })!;
  const struggle = facts.struggles.find((s) => s.code === missed)!;
  const AI: ProfileAi = {
    likelyCauses: { model: "vendor/model-x", value: { [missed]: "{name} may need this step first." } },
    howToHelp: { model: "vendor/model-x", value: { [missed]: "ADMIN-ONLY how to help" } },
    workbookPlan: { model: "vendor/model-x", value: { review: { percent: 20, standards: [] }, practise: { percent: 80, standards: [missed] }, stretch: { percent: 0, standards: [] } } },
  };
  const stored = (profile: unknown): MemoryReportTables => ({
    ...tables(),
    profiles: [{ assessmentId: "test-1", parentId: "parent-1", childId: "child-1", schemaVersion: 1, profile }],
  });

  it("gives the parent and the admin the strengths, the struggles with one wrong answer each, and the AI parts once stored", async () => {
    const readers = memoryReportReaders(stored({ ...facts, ai: AI, buildId: "build-1" }));
    for (const reader of [readers.parent("parent-1"), readers.admin(), readers.key()]) {
      const findings = (await loadReportView(reader, "report-1"))!.view.findings!;
      expect(findings.strengths.length).toBe(facts.strengths.length);
      const shown = findings.struggles.find((s) => s.code === missed)!;
      expect(struggle.wrong.length).toBeGreaterThan(1);
      expect(struggle.wrong.map((w) => w.response)).toContain(shown.answer.response);
      expect(shown.cause).toEqual({ source: "ai", text: "{name} may need this step first." });
      expect(findings.preview?.focus.map((t) => t.code)).toEqual([missed]);
    }
  });

  it("leaves out a stored wrong answer to the removed extra round (#190, D-145): the parent's example and the admin's list", async () => {
    // Two stored profiles were built with the round's answers: here a round answer comes first in the struggle's list.
    const roundWrong = { questionId: "x-0", templateId: struggle.wrong[0].templateId, prompt: "ROUND PROMPT", response: "round-answer", rightAnswer: "9", misconception: "ROUND-ONLY" };
    const withRound = { ...facts, struggles: facts.struggles.map((s) => (s.code === missed ? { ...s, wrong: [roundWrong, ...s.wrong], misconceptions: ["ROUND-ONLY", ...s.misconceptions] } : s)) };
    for (const reader of [memoryReportReaders(stored(withRound)).parent("parent-1"), memoryReportReaders(stored(withRound)).admin()]) {
      const { view } = (await loadReportView(reader, "report-1"))!;
      expect(view.findings!.struggles.find((s) => s.code === missed)!.answer.response).not.toBe("round-answer");
      expect(JSON.stringify(view)).not.toMatch(/ROUND PROMPT|round-answer/);
    }
    // The admin's profile page reads the stored profile through storedProfile.
    const admin = storedProfile(withRound)!.struggles.find((s) => s.code === missed)!;
    expect(admin.wrong).toEqual(struggle.wrong);
    expect(admin.misconceptions).toEqual(struggle.misconceptions);
  });

  it("never carries the profile's admin-only parts: test behaviour, the full error list, how to help, model ids or the build id", async () => {
    const readers = memoryReportReaders(stored({ ...facts, ai: AI, buildId: "build-1" }));
    const view = JSON.stringify((await loadReportView(readers.parent("parent-1"), "report-1"))!.view);
    const shown = (await loadReportView(readers.parent("parent-1"), "report-1"))!.view.findings!.struggles.find((s) => s.code === missed)!;
    for (const secret of ["build-1", "vendor/model-x", "ADMIN-ONLY", "behaviour", "medianMs", "unknowns", "misconceptions"]) expect(view).not.toContain(secret);
    for (const w of struggle.wrong.filter((x) => x.response !== shown.answer.response)) expect(view).not.toContain(`"${w.response}"`);
  });

  it("ignores the words-or-numbers finding of a profile stored before D-121: the page, the email and the view do not show it", async () => {
    // Profiles stored before #238 carry the finding, here with a gap on a real skill.
    const skill = BC_SKILL_MAP.standards.find((s) => s.code === "4.5")!.skills[0];
    const wordsOrNumbers = { finding: "gap", skills: [{ id: skill.id, finding: "words-harder", words: { correct: 1, total: 3 }, numbers: { correct: 3, total: 3 } }] };
    const loaded = await loadReportView(memoryReportReaders(stored({ ...facts, ai: AI, wordsOrNumbers })).parent("parent-1"), "report-1");
    const { view } = loaded!;
    expect(view.findings!.struggles.map((s) => s.code)).toContain(missed);
    expect(view.findings).not.toHaveProperty("wordsOrNumbers");
    expect(JSON.stringify(view)).not.toContain(skill.text);
    const page = renderToStaticMarkup(createElement(ReportCard, { view, readOnly: true }));
    const email = reportEmail({ view, parentName: "Priya Shah", url: "https://unicalearning.com/account/report/report-1", unsubscribeUrl: "https://unicalearning.com/unsubscribe" });
    for (const place of [page, email.text, email.html]) {
      expect(place).toContain("To work on");
      expect(place).not.toContain("Word problems");
      expect(place).not.toContain("1 of 3");
    }
  });

  it("has no findings without a stored profile, or with one at another schema version", async () => {
    for (const t of [tables(), stored({ ...facts, schemaVersion: 2 })]) {
      const loaded = await loadReportView(memoryReportReaders(t).parent("parent-1"), "report-1");
      expect(loaded).not.toBeNull();
      expect(loaded!.view.findings).toBeNull();
    }
  });

  it("still shows the report when the profile cannot be read, without the findings", async () => {
    const reader = memoryReportReaders(stored(facts)).parent("parent-1");
    const loaded = await loadReportView({ ...reader, profile: async () => { throw new Error("connection reset"); } }, "report-1");
    expect(loaded!.view.model).toEqual(model);
    expect(loaded!.view.findings).toBeNull();
  });
});

describe("the report inputs (#162)", () => {
  it("gives the finished test and its shown work in test order, from one read of the stored test and one of the answers", async () => {
    const readers = memoryReportReaders(tables());
    const inputs = await loadReportInputs(readers.key(), "test-1", noComparison);

    expect(inputs?.assessment).toEqual({
      id: "test-1", parentId: "parent-1", childId: "child-1", grade: 4, province: "BC", completedAt: "2026-10-10T19:30:00Z", placement, help: "no",
    });
    expect(inputs?.shownWork).toEqual([
      { questionId: "s1-3", prompt: asked[3].prompt, correct: true, required: true, image: drawing("parent-1", 3), text: null },
      { questionId: "s1-4", prompt: asked[4].prompt, correct: true, required: true, image: null, text: "20.00 - 13.10" },
      { questionId: "s1-6", prompt: asked[6].prompt, correct: true, required: false, image: drawing("parent-1", 6), text: null },
      // A stage 2 question: its prompt comes from the stored test's "up" path.
      { questionId: "up-8", prompt: "A purchase costs $114.10. You pay $500.00. How many dollars in change should you get?", correct: false, required: true, image: drawing("parent-1", 26), text: null },
    ]);
    expect(readers.reads).toEqual({ reports: 0, assessments: 1, answers: 1 });
  });

  it("builds the review pieces from the same read of the test and the answers, and only when the AI step asks", async () => {
    const readers = memoryReportReaders(tables());
    const inputs = (await loadReportInputs(readers.key(), "test-1", noComparison))!;

    // The AI step off: it never asks for the pieces.
    const build = vi.fn(async () => inputs.reviewPieces());
    const unused: ReviewStore = { stored: vi.fn(), save: vi.fn(), image: vi.fn() };
    const off = await aiReport({ reviewer: null, pieces: build, store: unused, build: () => model });
    expect(off.ai).toEqual({ on: false });
    expect(build).not.toHaveBeenCalled();

    // Asked: each piece of shown work, with the child's answer, the right answer and the level from the stored test.
    expect(inputs.reviewPieces()).toEqual([
      { questionId: "s1-3", prompt: asked[3].prompt, answer: asked[3].answer, rightAnswer: asked[3].answer, correct: true, level: 4, required: true, misconception: null, image: drawing("parent-1", 3), text: null },
      { questionId: "s1-4", prompt: asked[4].prompt, answer: "6.90", rightAnswer: "6.90", correct: true, level: 4, required: true, misconception: null, image: null, text: "20.00 - 13.10" },
      { questionId: "s1-6", prompt: asked[6].prompt, answer: "12", rightAnswer: "12", correct: true, level: 4, required: false, misconception: null, image: drawing("parent-1", 6), text: null },
      {
        questionId: "up-8", prompt: "A purchase costs $114.10. You pay $500.00. How many dollars in change should you get?", answer: "614.1",
        rightAnswer: "385.90", correct: false, level: 5, required: true, misconception: "Uses the wrong operation", image: drawing("parent-1", 26), text: null,
      },
    ]);
    // No second read of the test or the answers.
    expect(readers.reads).toEqual({ reports: 0, assessments: 1, answers: 1 });
  });

  it("counts every marked question, also those above the school grade, and the minutes from the answer times, at least 1", async () => {
    const inputs = await loadReportInputs(memoryReportReaders(tables()).key(), "test-1", noComparison);
    // 42 questions: 24 at grade 4 and 18 at grade 5. At 20 seconds each, the total is 14 minutes.
    expect(placement.strands.reduce((n, s) => n + s.total, 0)).toBe(24);
    expect(inputs).toMatchObject({ questions: 42, minutes: 14 });

    // Each answer's time counts, to the nearest minute; under half a minute is still 1 minute.
    const cases: [string, (n: number) => number, number][] = [
      ["1 minute on each grade 4 question, 30 s on each grade 5 one", (n) => (asked[n].level === 4 ? 60_000 : 30_000), 33],
      ["2.5 s each (1.75 minutes)", () => 2_500, 2],
      ["0.5 s each (21 s)", () => 500, 1],
      ["no time at all", () => 0, 1],
    ];
    for (const [name, timeMs, minutes] of cases) {
      const timed = await loadReportInputs(memoryReportReaders({ ...tables(), answers: answers(timeMs) }).key(), "test-1", noComparison);
      expect(timed?.minutes, name).toBe(minutes);
    }
  });

  it("counts every answered question, also the rushed wrong answers left out of the score (#189)", async () => {
    // Asha's first three answers are very fast and wrong: a run of three, so the score leaves them out of its levels.
    const fast = (n: number) => (n < 3 ? 1_000 : 20_000);
    const rushed = takeTest({ grade: 4, province: "BC" }, 1, (q, n) => n >= 3 && q.level <= 4, undefined, (_, n) => fast(n)).placement;
    expect(rushed.levels.reduce((n, l) => n + l.total, 0)).toBe(39);
    const rows = answers(fast).map((a) => (a.position < 3 ? { ...a, response: "no idea", correct: false } : a));
    const inputs = await loadReportInputs(
      memoryReportReaders({ ...tables(), assessments: [{ ...ASSESSMENT, placement: rushed }], answers: rows }).key(), "test-1", noComparison,
    );
    expect(inputs?.questions).toBe(42);
  });

  it("leaves out the answers of the removed extra round (#190, D-145), also when the stored result counted them", async () => {
    // A test from before the round was removed: two round questions after the main test, stored under `extra`, both
    // answered in 20 seconds, the first with a drawing. The stored result may or may not record the round.
    const extra = [{ ...asked[0], id: "x-0" }, { ...asked[1], id: "x-1" }];
    const round = (position: number, questionId: string, workPath: string | null): MemoryAnswer => ({
      assessmentId: "test-1", position, questionId, response: "1", correct: true, misconception: null, timeMs: 20_000, workRequired: false, workPath, workText: null,
    });
    const rows = [...answers(), round(42, "x-0", drawing("parent-1", 0)), round(43, "x-1", null)];
    const counted = { ...placement, extraRound: { questions: 2, strands: ["number"] } } as Placement;
    for (const result of [placement, counted]) {
      const inputs = await loadReportInputs(
        memoryReportReaders({ ...tables(), assessments: [{ ...ASSESSMENT, placement: result, test: { ...test, extra } as StoredTest }], answers: rows }).key(), "test-1", noComparison,
      );
      // The main test's 42 answers and 14 minutes, its shown work, review pieces and profile answers alone.
      expect(inputs).toMatchObject({ questions: 42, minutes: 14 });
      expect(inputs?.shownWork.map((w) => w.questionId)).toEqual(["s1-3", "s1-4", "s1-6", "up-8"]);
      expect(inputs?.reviewPieces().map((p) => p.questionId)).toEqual(["s1-3", "s1-4", "s1-6", "up-8"]);
      expect(inputs?.profileAnswers().map((a) => a.question.id)).toEqual(asked.map((q) => q.id));
    }
  });

  it("is null for a test that is not completed or has no placement, and then the answers are not read", async () => {
    const cases: [string, Partial<MemoryAssessment>][] = [
      ["in progress", { status: "in_progress", completedAt: null, placement: null }],
      ["expired", { status: "expired", completedAt: null, placement: null }],
      // Each rule alone: the other columns are those of a finished test.
      ["not completed", { status: "in_progress" }],
      ["completed with no placement", { placement: null }],
      ["completed with no finish time", { completedAt: null }],
    ];
    for (const [name, change] of cases) {
      const readers = memoryReportReaders({ ...tables(), assessments: [{ ...ASSESSMENT, ...change }] });
      expect(await loadReportInputs(readers.key(), "test-1", noComparison), name).toBeNull();
      expect(readers.reads, name).toEqual({ reports: 0, assessments: 1, answers: 0 });
    }
  });

  it("makes the comparison read for this test only when asked, so a report already stored costs no comparison read", async () => {
    const cohort = { assessmentId: "test-1", tests: [{ id: "test-1", childId: "child-1", status: "completed", completedAt: "2026-10-10T19:30:00Z", email: "priya@family.ca", placement }] };
    const read = vi.fn<ComparisonRead>(async () => cohort);
    const inputs = (await loadReportInputs(memoryReportReaders(tables()).key(), "test-1", read))!;
    expect(read).not.toHaveBeenCalled();

    expect(await inputs.comparison()).toBe(cohort);
    expect(read.mock.calls).toEqual([["test-1"]]);
  });

  it("is null for a test the reader does not find: no such test, or a parent's session, which may not read the stored test", async () => {
    const readers = memoryReportReaders(tables());
    expect(await loadReportInputs(readers.key(), "test-2", noComparison)).toBeNull();
    expect(await loadReportInputs(readers.parent("parent-1"), "test-1", noComparison)).toBeNull();
    expect(readers.reads.answers).toBe(0);
  });
});
