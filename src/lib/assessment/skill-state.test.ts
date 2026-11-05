import { describe, expect, it } from "vitest";
import { BC_SKILL_MAP, skillStateChanges, skillStates, type RecordedSkillState, type SkillMark, type SkillStateInput, type SkillTestResult } from "@/lib/assessment";

// The skill state rule (spec #544, "Skill states"): each BC standard's state and reason, through its one function.

const CODE = "3.3";
const OTHER = "3.4";
const ABOVE = "5.8";

const test = (correct: number, total: number, day = 1, standard = CODE): SkillTestResult => ({ standard, correct, total, at: at(day) });
const at = (day: number) => `2026-10-${String(day).padStart(2, "0")}T18:00:00.000Z`;
const page = (right: boolean, day: number, standard = CODE): SkillMark => ({ standard, right, review: false, at: at(day) });
const review = (right: boolean, day: number, standard = CODE): SkillMark => ({ standard, right, review: true, at: at(day) });
/** Five right pages on days 1 to 5: enough for the page rule, once a later review holds. */
const FIVE_RIGHT = [1, 2, 3, 4, 5].map((d) => page(true, d));

function stateOf(input: Partial<SkillStateInput>, code = CODE) {
  const found = skillStates({ schoolGrade: 3, tests: [], workbookStandards: [], marks: [], ...input }).find((s) => s.standard === code);
  if (!found) throw new Error(`no state for ${code}`);
  return found;
}

describe("the skill state of a BC standard", () => {
  it("gives every BC standard one state, and nothing else", () => {
    const all = skillStates({ schoolGrade: 3, tests: [test(5, 5, 1, "not-a-code")], workbookStandards: ["not-a-code"], marks: [page(true, 1, "not-a-code")] });
    expect(all.map((s) => s.standard)).toEqual(BC_SKILL_MAP.standards.map((s) => s.code));
    expect(new Set(all.map((s) => `${s.state}/${s.reason}/${s.evidence}`))).toEqual(new Set(["not_started/no_evidence/none"]));
  });

  describe("from the test", () => {
    it("is Mastered when every answer on the standard is right, with 2 answers or more (#578)", () => {
      expect(stateOf({ tests: [test(2, 2)] })).toEqual({ standard: CODE, state: "mastered", reason: "secure_on_test", evidence: "test" });
      expect(stateOf({ tests: [test(3, 3)] })).toMatchObject({ state: "mastered" });
      expect(stateOf({ tests: [test(5, 5)] })).toMatchObject({ state: "mastered" });
    });

    it("is not Mastered on one right answer alone", () => {
      expect(stateOf({ tests: [test(1, 1)] })).toMatchObject({ state: "not_started", reason: "early_sign_on_test", evidence: "test" });
      expect(stateOf({ tests: [test(1, 1)], workbookStandards: [CODE] })).toMatchObject({ state: "working_on" });
      // Two tests that each ask it once are not one test with every answer right.
      expect(stateOf({ tests: [test(1, 1, 1), test(1, 1, 20)] })).toMatchObject({ state: "not_started" });
    });

    it("is not Mastered with one wrong answer among several", () => {
      expect(stateOf({ tests: [test(2, 3)] })).toMatchObject({ state: "not_started", reason: "developing_on_test" });
      expect(stateOf({ tests: [test(4, 5)] })).toMatchObject({ state: "not_started", reason: "early_sign_on_test" });
      // Secure with Clear certainty is not enough on its own any more.
      expect(stateOf({ tests: [test(9, 10)] })).toEqual({ standard: CODE, state: "not_started", reason: "secure_on_test", evidence: "test" });
    });

    it("is Needs review when the test says Needs attention with Clear certainty", () => {
      expect(stateOf({ tests: [test(0, 2)] })).toEqual({ standard: CODE, state: "needs_review", reason: "needs_attention_on_test", evidence: "test" });
    });

    it("stays Not started on a Needs attention, Early sign result", () => {
      expect(stateOf({ tests: [test(0, 1)] })).toMatchObject({ state: "not_started", reason: "early_sign_on_test" });
    });

    it("stays Not started on a Developing, Clear result", () => {
      expect(stateOf({ tests: [test(3, 5)] })).toMatchObject({ state: "not_started", reason: "developing_on_test", evidence: "test" });
    });

    it("never calls a result above the school grade a weakness (D-108)", () => {
      expect(stateOf({ schoolGrade: 3, tests: [test(0, 2, 1, ABOVE)] }, ABOVE)).toMatchObject({ state: "not_started", reason: "above_school_grade", evidence: "test" });
      expect(stateOf({ schoolGrade: 5, tests: [test(0, 2, 1, ABOVE)] }, ABOVE)).toMatchObject({ state: "needs_review" });
      // Above the school grade, a strong result still counts.
      expect(stateOf({ schoolGrade: 3, tests: [test(2, 2, 1, ABOVE)] }, ABOVE)).toMatchObject({ state: "mastered" });
    });

    it("earns Mastered on a newer test with every answer right", () => {
      expect(stateOf({ tests: [test(2, 2, 20), test(0, 2, 1)] })).toMatchObject({ state: "mastered", reason: "secure_on_test" });
    });

    it("keeps Mastered when a newer test skips the standard, or asks it once and it is right", () => {
      expect(stateOf({ tests: [test(2, 2, 1), test(5, 5, 20, OTHER)] })).toMatchObject({ state: "mastered", reason: "secure_on_test" });
      expect(stateOf({ tests: [test(2, 2, 1), test(1, 1, 20)] })).toMatchObject({ state: "mastered", reason: "secure_on_test" });
    });

    it("goes to Needs review on a wrong answer on a newer test, also a single one", () => {
      expect(stateOf({ tests: [test(3, 3, 1), test(0, 2, 20)] })).toEqual({ standard: CODE, state: "needs_review", reason: "failed_review", evidence: "test" });
      expect(stateOf({ tests: [test(3, 3, 1), test(0, 1, 20)] })).toMatchObject({ state: "needs_review", reason: "failed_review", evidence: "test" });
      expect(stateOf({ tests: [test(3, 3, 1), test(4, 5, 20)] })).toMatchObject({ state: "needs_review", reason: "failed_review" });
      // In the current workbook too: rule 1 comes first.
      expect(stateOf({ tests: [test(3, 3, 1), test(1, 2, 20)], workbookStandards: [CODE] })).toMatchObject({ state: "needs_review", reason: "failed_review" });
    });

    it("needs Mastered before a wrong test answer is a failed one, and reads the newest Clear result then", () => {
      expect(stateOf({ tests: [test(0, 2, 1), test(1, 1, 20)] })).toMatchObject({ state: "needs_review", reason: "needs_attention_on_test" });
      expect(stateOf({ tests: [test(0, 2, 1), test(3, 5, 20)] })).toMatchObject({ state: "not_started", reason: "developing_on_test" });
    });

    it("keeps one standard's result off another standard", () => {
      const tests = [test(5, 5, 1, CODE), test(0, 2, 1, OTHER)];
      expect(stateOf({ tests }, CODE)).toMatchObject({ state: "mastered" });
      expect(stateOf({ tests }, OTHER)).toMatchObject({ state: "needs_review" });
    });
  });

  it("is Working on when the current workbook has the standard", () => {
    expect(stateOf({ workbookStandards: [CODE] })).toEqual({ standard: CODE, state: "working_on", reason: "in_workbook", evidence: "workbook" });
    expect(stateOf({ workbookStandards: [OTHER] })).toMatchObject({ state: "not_started" });
  });

  describe("from marked pages", () => {
    it("is Mastered with 80% or more right on at least 5 results, held on a later review", () => {
      expect(stateOf({ marks: [...FIVE_RIGHT, review(true, 6)] })).toEqual({ standard: CODE, state: "mastered", reason: "held_on_review", evidence: "pages" });
      expect(stateOf({ marks: [page(false, 1), ...FIVE_RIGHT.slice(1), review(true, 6)] })).toMatchObject({ state: "mastered" });
    });

    it("is not Mastered with no later review", () => {
      expect(stateOf({ marks: FIVE_RIGHT })).toMatchObject({ state: "not_started" });
      // A review before the pages reached the rule is not a later one.
      expect(stateOf({ marks: [review(true, 1), ...FIVE_RIGHT.map((m) => ({ ...m, at: at(5) }))] })).toMatchObject({ state: "not_started" });
    });

    it("is not Mastered under 5 results, or under 80% right", () => {
      expect(stateOf({ marks: [...FIVE_RIGHT.slice(1), review(true, 6)] })).toMatchObject({ state: "not_started" });
      expect(stateOf({ marks: [page(false, 1), page(false, 2), ...FIVE_RIGHT.slice(2), review(true, 6)] })).toMatchObject({ state: "not_started" });
    });

    it("counts a review item as a page result, and reads the marks by date", () => {
      // Four pages and a first review make 5 results; the second review is the later one that holds.
      expect(stateOf({ marks: [review(true, 6), ...FIVE_RIGHT.slice(1), review(true, 5)] })).toMatchObject({ state: "mastered", reason: "held_on_review" });
    });

    it("takes Mastered away for any wrong marked item after it, also one that is not a review", () => {
      expect(stateOf({ tests: [test(2, 2, 1)], marks: [page(false, 2)] })).toEqual({ standard: CODE, state: "needs_review", reason: "failed_review", evidence: "pages" });
      expect(stateOf({ tests: [test(2, 2, 1)], marks: [page(true, 2), review(true, 3)] })).toMatchObject({ state: "mastered", reason: "secure_on_test" });
      // A wrong page before the test does not.
      expect(stateOf({ tests: [test(2, 2, 5)], marks: [page(false, 2)] })).toMatchObject({ state: "mastered" });
    });

    it("keeps one standard's marks off another standard", () => {
      expect(stateOf({ marks: [...FIVE_RIGHT, review(true, 6)] }, OTHER)).toMatchObject({ state: "not_started" });
    });
  });

  describe("after a failed review", () => {
    it("is Needs review when a Mastered standard is wrong on a later review", () => {
      expect(stateOf({ tests: [test(5, 5, 1)], marks: [review(false, 2)] })).toEqual({ standard: CODE, state: "needs_review", reason: "failed_review", evidence: "pages" });
      expect(stateOf({ marks: [...FIVE_RIGHT, review(true, 6), review(false, 7)] })).toMatchObject({ state: "needs_review", reason: "failed_review" });
    });

    it("needs the standard to be Mastered first", () => {
      expect(stateOf({ marks: [review(false, 1)] })).toMatchObject({ state: "not_started" });
      expect(stateOf({ tests: [test(5, 5, 9)], marks: [review(false, 2)] })).toMatchObject({ state: "mastered" });
    });

    it("stays Needs review until Mastered is earned again", () => {
      const failed = [test(5, 5, 1)];
      expect(stateOf({ tests: failed, marks: [review(false, 2), review(true, 3)] })).toMatchObject({ state: "needs_review" });
      expect(stateOf({ tests: failed, marks: [review(false, 2), ...[3, 4, 5, 6, 7, 8].map((d) => page(true, d)), review(true, 9)] }))
        .toMatchObject({ state: "mastered", reason: "held_on_review" });
      expect(stateOf({ tests: [...failed, test(5, 5, 9)], marks: [review(false, 2)] })).toMatchObject({ state: "mastered", reason: "secure_on_test" });
    });

    it("keeps the failed review when a newer Clear test is not Secure, also with the standard in the workbook", () => {
      // Mastered on day 10, wrong on review on day 11, Developing with Clear certainty on day 12.
      const tests = [test(5, 5, 10), test(3, 5, 12)];
      const marks = [review(false, 11)];
      expect(stateOf({ tests, marks, workbookStandards: [CODE] })).toEqual({ standard: CODE, state: "needs_review", reason: "failed_review", evidence: "pages" });
      expect(stateOf({ tests, marks })).toMatchObject({ state: "needs_review", reason: "failed_review" });
      expect(stateOf({ tests: [test(5, 5, 10), test(0, 2, 12)], marks })).toMatchObject({ state: "needs_review", reason: "failed_review" });
    });

    it("reads a review against the test results before it, not only the newest", () => {
      // Mastered on day 10, wrong on the test on day 11: a right review on day 12 does not earn it back.
      expect(stateOf({ tests: [test(5, 5, 10), test(3, 5, 11)], marks: [review(true, 12)] })).toMatchObject({ state: "needs_review", reason: "failed_review", evidence: "test" });
      // Not Mastered before day 12: a wrong review is not a failed one.
      expect(stateOf({ tests: [test(1, 1, 10)], marks: [review(false, 12)] })).toMatchObject({ state: "not_started", reason: "early_sign_on_test" });
      // Mastered on day 10, wrong on review on day 11, Mastered again on day 12.
      expect(stateOf({ tests: [test(5, 5, 10), test(5, 5, 12)], marks: [review(false, 11)] })).toMatchObject({ state: "mastered", reason: "secure_on_test" });
    });
  });

  describe("above the school grade (D-108)", () => {
    const above = (input: Partial<SkillStateInput>) => stateOf({ schoolGrade: 3, ...input }, ABOVE);

    it("can be Mastered, because every answer right is no weakness", () => {
      expect(above({ tests: [test(2, 2, 1, ABOVE)] })).toEqual({ standard: ABOVE, state: "mastered", reason: "secure_on_test", evidence: "test" });
    });

    it("is never Needs review after a later wrong answer, on a test or on a marked item", () => {
      expect(above({ tests: [test(2, 2, 1, ABOVE), test(0, 1, 20, ABOVE)] })).toEqual({ standard: ABOVE, state: "not_started", reason: "above_school_grade", evidence: "test" });
      expect(above({ tests: [test(2, 2, 1, ABOVE), test(0, 2, 20, ABOVE)] })).toMatchObject({ state: "not_started", reason: "above_school_grade" });
      expect(above({ tests: [test(2, 2, 1, ABOVE)], marks: [page(false, 20, ABOVE)] })).toEqual({ standard: ABOVE, state: "not_started", reason: "above_school_grade", evidence: "pages" });
      expect(above({ marks: [...[1, 2, 3, 4, 5].map((d) => page(true, d, ABOVE)), review(true, 6, ABOVE), review(false, 7, ABOVE)] })).toMatchObject({ state: "not_started", reason: "above_school_grade" });
    });

    it("is Working on after that wrong answer when the current workbook has it, and can earn Mastered again", () => {
      expect(above({ tests: [test(2, 2, 1, ABOVE), test(0, 1, 20, ABOVE)], workbookStandards: [ABOVE] })).toMatchObject({ state: "working_on", reason: "in_workbook" });
      expect(above({ tests: [test(2, 2, 1, ABOVE), test(0, 1, 20, ABOVE), test(3, 3, 25, ABOVE)] })).toMatchObject({ state: "mastered" });
    });

    it("reads the same answers as Needs review once the child's school grade reaches the standard", () => {
      expect(stateOf({ schoolGrade: 5, tests: [test(2, 2, 1, ABOVE), test(0, 1, 20, ABOVE)] }, ABOVE)).toMatchObject({ state: "needs_review", reason: "failed_review" });
    });

    it("gives no history row that says Needs review", () => {
      const rows = skillStateChanges({ schoolGrade: 3, tests: [test(2, 2, 1, ABOVE), test(0, 1, 20, ABOVE), test(3, 3, 25, ABOVE)], workbookStandards: [], marks: [] }, []);
      expect(rows.map((r) => r.state)).toEqual(["mastered", "not_started", "mastered"]);
    });
  });

  describe("at tied times", () => {
    /** Every order of a short list. */
    const orders = <T,>(list: readonly T[]): T[][] => (list.length < 2 ? [[...list]] : list.flatMap((x, i) => orders([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [x, ...rest])));
    const stateInAnyOrder = (tests: SkillTestResult[], marks: SkillMark[]) => {
      const seen = new Set(orders(tests).flatMap((t) => orders(marks).map((m) => JSON.stringify(stateOf({ tests: t, marks: m })))));
      expect(seen.size).toBe(1);
      return JSON.parse([...seen][0]);
    };

    it("does not read five page results and a review at one time as a later review, in any order", () => {
      const tied = [...[1, 2, 3, 4, 5].map(() => page(true, 9)), review(true, 9)];
      expect(stateInAnyOrder([], tied)).toMatchObject({ state: "not_started", reason: "no_evidence" });
      // Mastered from pages with the same results, when the review is later.
      expect(stateOf({ marks: [...tied, review(true, 10)] })).toMatchObject({ state: "mastered", reason: "held_on_review" });
    });

    it("keeps Mastered from an all-right test beside a wrong mark at that time, in any order", () => {
      expect(stateInAnyOrder([test(2, 2, 9)], [page(false, 9)])).toMatchObject({ state: "mastered", reason: "secure_on_test" });
      // Mastered before too: the test at that time earns it again.
      expect(stateInAnyOrder([test(2, 2, 1), test(3, 3, 9)], [review(false, 9)])).toMatchObject({ state: "mastered", reason: "secure_on_test" });
    });

    it("takes Mastered away for a wrong item in a scan with a right review at one time, in any order", () => {
      expect(stateInAnyOrder([test(2, 2, 1)], [review(true, 9), review(false, 9), page(true, 9)])).toMatchObject({ state: "needs_review", reason: "failed_review", evidence: "pages" });
    });

    it("earns nothing from pages when the scan at that time has a wrong item, in any order", () => {
      const ready = FIVE_RIGHT;
      expect(stateOf({ marks: [...ready, review(true, 9), page(false, 9)] })).toMatchObject({ state: "not_started" });
      expect(stateOf({ marks: [...ready, page(false, 9), review(true, 9)] })).toMatchObject({ state: "not_started" });
    });

    it("reads two tests at one time the same in any order", () => {
      expect(stateInAnyOrder([test(2, 2, 1), test(3, 3, 9), test(0, 2, 9)], [])).toMatchObject({ state: "needs_review", reason: "failed_review", evidence: "test" });
      expect(stateInAnyOrder([test(3, 5, 9), test(0, 5, 9)], [])).toMatchObject({ state: "needs_review", reason: "needs_attention_on_test" });
      expect(stateInAnyOrder([test(3, 3, 9), test(0, 2, 9)], [])).toMatchObject({ state: "needs_review", reason: "needs_attention_on_test" });
    });
  });

  describe("when two rules fit", () => {
    it("puts a failed review first, over Mastered, Working on and the test", () => {
      expect(stateOf({ tests: [test(5, 5, 1)], workbookStandards: [CODE], marks: [review(false, 2)] })).toMatchObject({ state: "needs_review", reason: "failed_review" });
    });

    it("puts Mastered over Working on: a review item in the current workbook does not take it away", () => {
      expect(stateOf({ tests: [test(5, 5)], workbookStandards: [CODE] })).toMatchObject({ state: "mastered", reason: "secure_on_test" });
      expect(stateOf({ marks: [...FIVE_RIGHT, review(true, 6)], workbookStandards: [CODE] })).toMatchObject({ state: "mastered", reason: "held_on_review" });
    });

    it("puts Mastered from pages over Needs review from the test", () => {
      expect(stateOf({ tests: [test(0, 2, 1)], marks: [...FIVE_RIGHT, review(true, 6)] })).toMatchObject({ state: "mastered", reason: "held_on_review" });
    });

    it("puts Working on over Needs review from the test", () => {
      expect(stateOf({ tests: [test(0, 2)], workbookStandards: [CODE] })).toMatchObject({ state: "working_on", reason: "in_workbook" });
    });

    it("puts Working on over a Secure result with a wrong answer", () => {
      expect(stateOf({ tests: [test(9, 10)], workbookStandards: [CODE] })).toMatchObject({ state: "working_on" });
    });
  });
});

describe("the history rows of a rebuild", () => {
  const input = (tests: SkillTestResult[], over: Partial<SkillStateInput> = {}): SkillStateInput => ({ schoolGrade: 3, tests, workbookStandards: [], marks: [], ...over });
  const asRecorded = (rows: ReturnType<typeof skillStateChanges>): RecordedSkillState[] => rows.map(({ standard, state, evidenceAt }) => ({ standard, state, evidenceAt }));

  it("gives each state the standard passed through, with the time of its evidence", () => {
    expect(skillStateChanges(input([test(2, 2, 1), test(0, 1, 2), test(3, 3, 3)]), [])).toEqual([
      { standard: CODE, state: "mastered", reason: "secure_on_test", evidence: "test", evidenceAt: at(1) },
      { standard: CODE, state: "needs_review", reason: "failed_review", evidence: "test", evidenceAt: at(2) },
      { standard: CODE, state: "mastered", reason: "secure_on_test", evidence: "test", evidenceAt: at(3) },
    ]);
  });

  it("gives the same rows whichever rebuilds ran between the tests, and none on a rebuild with nothing new", () => {
    // Every run of 4 tests from: all right, wrong, one right, and skipped by the test.
    const kinds: (SkillTestResult | null)[] = [test(2, 2), test(0, 2), test(1, 1), null];
    const runs: SkillTestResult[][] = [];
    for (const a of kinds) for (const b of kinds) for (const c of kinds) for (const d of kinds) {
      runs.push([a, b, c, d].flatMap((t, i) => (t ? [{ ...t, at: at(i + 1) }] : [])));
    }
    // Which of the tests a rebuild ran after; the last always.
    const schedules = [[4], [1, 4], [2, 4], [3, 4], [1, 2, 4], [1, 3, 4], [2, 3, 4], [1, 2, 3, 4]];
    for (const tests of runs) {
      const after = (schedule: number[]) => {
        let recorded: RecordedSkillState[] = [];
        for (const n of schedule) recorded = [...recorded, ...asRecorded(skillStateChanges(input(tests.filter((t) => Date.parse(t.at) <= Date.parse(at(n)))), recorded))];
        return recorded;
      };
      const expected = after(schedules[0]);
      for (const schedule of schedules) expect(after(schedule)).toEqual(expected);
      expect(skillStateChanges(input(tests), expected)).toEqual([]);
      // No state twice in a row, and the last row is the state now (no row: Not started).
      expect(expected.every((r, i) => i === 0 || r.state !== expected[i - 1].state)).toBe(true);
      const now = skillStates(input(tests)).find((s) => s.standard === CODE)!.state;
      expect(expected.at(-1)?.state ?? "not_started").toBe(now);
    }
  });

  it("does not read evidence twice, and still changes the state when evidence goes away", () => {
    const recorded: RecordedSkillState[] = [{ standard: CODE, state: "mastered", evidenceAt: at(1) }, { standard: CODE, state: "needs_review", evidenceAt: at(2) }];
    expect(skillStateChanges(input([test(2, 2, 1), test(0, 1, 2)]), recorded)).toEqual([]);
    // The newer test deleted: Mastered again, and the older test is not replayed as a new change after that.
    const back = skillStateChanges(input([test(2, 2, 1)]), recorded);
    expect(back).toEqual([{ standard: CODE, state: "mastered", reason: "secure_on_test", evidence: "test", evidenceAt: at(1) }]);
    expect(skillStateChanges(input([test(2, 2, 1)]), [...recorded, ...asRecorded(back)])).toEqual([]);
    // Every test deleted: Not started, with no evidence time.
    expect(skillStateChanges(input([]), recorded)).toEqual([{ standard: CODE, state: "not_started", reason: "no_evidence", evidence: "none", evidenceAt: null }]);
  });

  it("dates no Working on row, and keeps a replayed flip true with the standard in the workbook", () => {
    const rows = skillStateChanges(input([test(0, 2, 1), test(2, 2, 2), test(0, 1, 3), test(2, 2, 4), test(1, 2, 5)], { workbookStandards: [CODE] }), []);
    expect(rows.map((r) => [r.state, r.evidenceAt])).toEqual([["working_on", null], ["mastered", at(2)], ["needs_review", at(3)], ["mastered", at(4)], ["needs_review", at(5)]]);
    expect(skillStateChanges(input([test(0, 2, 1)], { workbookStandards: [CODE] }), [{ standard: CODE, state: "needs_review", evidenceAt: at(1) }])).toEqual([
      { standard: CODE, state: "working_on", reason: "in_workbook", evidence: "workbook", evidenceAt: null },
    ]);
    // A row with no time does not read the same evidence as new again.
    const working: RecordedSkillState[] = [{ standard: CODE, state: "working_on", evidenceAt: null }];
    expect(skillStateChanges(input([test(0, 2, 1)], { workbookStandards: [CODE] }), working)).toEqual([]);
  });

  it("gives rows in the same order and with the same content in any input order", () => {
    const tests = [test(2, 2, 1), test(0, 1, 2), test(3, 3, 3), test(2, 2, 1, OTHER)];
    expect(skillStateChanges(input([...tests].reverse()), [])).toEqual(skillStateChanges(input(tests), []));
  });
});
