import { describe, expect, it } from "vitest";
import { checked } from "@/lib/assessment/scripted-child";
import {
  BANKS,
  BC_SKILL_MAP,
  FACTS_BY_GRADE,
  MISCONCEPTIONS,
  PROFILE_AI_SCHEMA,
  REPORT_TEXT_NAME,
  checkProfileAi,
  createFacts,
  createSession,
  factsSkills,
  finish,
  learnerProfile,
  nextQuestion,
  profileAiFacts,
  submitAnswer,
  submitFact,
  type FactsSession,
  type Grade,
  type LearnerProfile,
  type MisconceptionId,
  type ProfileAnswer,
  type Question,
} from "@/lib/assessment";
import { MAIN_REJECTED_UNTESTED } from "./untested-wordings";

// The AI's interpretation of the learner profile (#197, spec #181), through the assessment core's public interface: what
// the AI reads (the profile facts, the skill-map neighbours, the misconception descriptions), and the checks its JSON
// output passes before any of it is kept. A child takes a whole test through the session, as in the profile's tests.

/** A whole test of a grade 4 child in BC (or of another grade), answered by `respond`, with the quick facts when given. */
function profileOf(respond: (q: Question) => string, grade: Grade = 4, facts: FactsSession | null = null): LearnerProfile {
  let session = createSession({ grade, province: "BC" }, 101);
  for (let q = nextQuestion(session); q; q = nextQuestion(session)) {
    session = checked(submitAnswer(session, { questionId: q.id, response: respond(q), timeMs: 20_000 }));
  }
  const questions = [...session.stage1, ...session.stage2[session.route!]];
  const answers: ProfileAnswer[] = session.answers.map((a, i) => ({
    question: questions[i], response: a.response, correct: a.correct, misconception: a.misconception, timeMs: a.timeMs,
    work: { required: false, drawing: false, typed: false }, readAloud: null, away: null,
  }));
  return learnerProfile({ placement: finish(session, facts, "no"), answers, help: "no", learning: null })!;
}
/** A quick facts section with 10 facts right, 2 seconds each: quick and secure. */
function factsOf(grade: Grade): FactsSession {
  let facts = createFacts({ grade, province: "BC" }, 5);
  facts.facts.slice(0, 10).forEach((f, i) => { facts = submitFact(facts, { factId: f.id, response: String(f.answer), atMs: (i + 1) * 2000, browserMs: 2000 }); });
  return facts;
}
const STANDARD = new Map(BANKS["3-5"].map((t) => [t.id, t.standard]));
/** Three grade 4 standards: the struggling child gives a coded wrong answer on their questions, and knows the rest to grade 4. */
const WEAK = new Set(["4.1", "4.3", "4.11"]);
const struggling = profileOf((q) => (WEAK.has(STANDARD.get(q.templateId)!) ? q.wrong[0]?.value ?? "no idea" : q.level <= 4 ? q.answer : "no idea"));
const onGrade = profileOf((q) => (q.level <= 4 ? q.answer : "no idea"));

/** The BC standards whose skills a standard's skills need directly, other than itself. */
const prerequisitesOf = (code: string) => {
  const owner = new Map(BC_SKILL_MAP.standards.flatMap((s) => s.skills.map((k) => [k.id, s.code] as const)));
  const standard = BC_SKILL_MAP.standards.find((s) => s.code === code)!;
  return [...new Set(standard.skills.flatMap((k) => k.requires.map((r) => owner.get(r)!)))].filter((c) => c !== code);
};
const secure = (p: LearnerProfile) => new Set(p.strengths.map((s) => s.code));
/** A standard the child has not shown, with a prerequisite standard that is not secure in the test. */
const notReady = (p: LearnerProfile) =>
  BC_SKILL_MAP.standards.find((s) => s.grade === 5 && !secure(p).has(s.code) && prerequisitesOf(s.code).some((c) => !secure(p).has(c)))!.code;

/** Output that passes every check, for a profile: a cause and a way to help for each struggle, from the facts' words. */
function goodOutput(p: LearnerProfile) {
  const facts = profileAiFacts(p);
  const ready = facts.next_challenge_candidates.map((c) => c.code);
  return {
    struggles: p.struggles.map((s) => ({
      code: s.code,
      likely_cause: `The wrong answers on ${s.text} point to a skill this builds on that is not secure yet.`,
      how_to_help: `Practise ${s.text} in short daily sets, with ${REPORT_TEXT_NAME} explaining each step aloud.`,
    })),
    next_challenge: ready.slice(0, 2),
    workbook_plan: {
      review: { percent: 20, standards: p.strengths.slice(0, 1).map((s) => s.code) },
      practise: { percent: 60, standards: p.struggles.slice(0, 2).map((s) => s.code) },
      stretch: { percent: 20, standards: ready.slice(0, 1) },
    },
  };
}

describe("what the AI reads", () => {
  it("is the profile facts with {name} for the child, the misconception descriptions, and the skill-map neighbours", () => {
    expect(struggling.struggles.length).toBeGreaterThan(0);
    const facts = profileAiFacts(struggling);
    expect(facts.child).toBe(REPORT_TEXT_NAME);
    // The profile without the untested standards (#245).
    const { earlySigns, checkNext } = struggling.unknowns;
    expect(facts.profile).toEqual({ ...struggling, unknowns: { earlySigns, checkNext: checkNext.filter((s) => s.reason === "confirm-struggle") } });

    // Each misconception of the struggles, in plain words.
    const ids = [...new Set(struggling.struggles.flatMap((s) => s.misconceptions))];
    expect(ids.length).toBeGreaterThan(0);
    expect(facts.misconceptions).toEqual(Object.fromEntries(ids.map((id) => [id, MISCONCEPTIONS[id as MisconceptionId].description])));

    // Each struggle's skills, with the skills they need and the child's result on each needed skill's standard.
    const results = new Map(struggling.standards.map((s) => [s.code, s.status as string]));
    expect(facts.struggle_skills.map((s) => s.code)).toEqual(struggling.struggles.map((s) => s.code));
    for (const s of facts.struggle_skills) {
      const mapped = BC_SKILL_MAP.standards.find((x) => x.code === s.code)!;
      expect(s.skills.map((k) => k.id)).toEqual(mapped.skills.map((k) => k.id));
      for (const k of s.skills) {
        const owner = BC_SKILL_MAP.standards.find((x) => x.skills.some((y) => y.id === k.requires[0]?.id));
        if (!k.requires.length) continue;
        expect(k.requires[0]).toMatchObject({ standard: owner!.code });
        // #245: a result only when the test measured it; never a "not tested" label.
        expect(k.requires[0].result).toBe(results.get(owner!.code));
      }
    }
  });

  it("offers as next challenges only standards not yet secure, not a struggle, whose prerequisite standards are all secure", () => {
    for (const p of [struggling, onGrade]) {
      const candidates = profileAiFacts(p).next_challenge_candidates;
      expect(candidates.length).toBeGreaterThan(0);
      for (const c of candidates) {
        expect(secure(p).has(c.code)).toBe(false);
        expect(p.struggles.map((s) => s.code)).not.toContain(c.code);
        expect(c.prerequisites).toEqual(prerequisitesOf(c.code));
        expect(c.prerequisites.length).toBeGreaterThan(0);
        expect(c.prerequisites.every((code) => secure(p).has(code))).toBe(true);
      }
    }
    expect(profileAiFacts(onGrade).next_challenge_candidates.map((c) => c.code)).not.toContain(notReady(onGrade));
  });
});

describe("what the AI reads about the quick facts (#242)", () => {
  // Grade 5: the facts round asks addition and subtraction facts to 20 and multiplication facts for 2, 3, 4, 5 and 10.
  // Equivalent fractions (5.3) needs the grade 4 multiplication facts (4.8), which no grade 5 question asks.
  const FACTS_5 = ["2.3", "3.4", "4.7", "4.8", "5.8", "5.9"];
  const weak = (q: Question) => (STANDARD_5.get(q.templateId) === "5.3" ? q.wrong[0]?.value ?? "no idea" : q.level <= 5 ? q.answer : "no idea");
  const STANDARD_5 = new Map(Object.values(BANKS).flat().map((t) => [t.id, t.standard]));
  const factsNeeded = (p: LearnerProfile) =>
    profileAiFacts(p).struggle_skills.flatMap((s) => s.skills.flatMap((k) => k.requires)).filter((r) => FACTS_5.includes(r.standard) && !p.standards.some((x) => x.code === r.standard));

  it("a needed skill reads as tested in the quick facts round only when the round asked facts of that skill", () => {
    const facts = factsOf(5);
    // The grade 5 round asks multiplication facts, and no division facts.
    expect(facts.facts.some((f) => f.op === "×")).toBe(true);
    expect(facts.facts.some((f) => f.op === "÷")).toBe(false);
    const resultOf = (p: LearnerProfile) => new Map(factsNeeded(p).map((r) => [r.id, r.result]));
    // 5.3 needs the multiplication facts and the division facts of 4.8, which no grade 5 question asks: no result (#245).
    expect(resultOf(profileOf(weak, 5))).toEqual(new Map([["4.8-multiplication-facts", undefined], ["4.8-division-facts", undefined]]));
    expect(resultOf(profileOf(weak, 5, facts))).toEqual(new Map([["4.8-multiplication-facts", "tested in the quick facts round"], ["4.8-division-facts", undefined]]));
  });

  it("a next challenge candidate has a result only when questions measured it, and names the skills of it the quick facts round asked", () => {
    const asked = new Set(factsSkills(FACTS_BY_GRADE[5]));
    // A grade 4 child who knows grade 4, with 4.8 secure as if questions had asked it, and the grade 5 round: 5.9
    // (recall the multiplication facts, multiply by annexing zeros, the distributive property) is ready.
    const p = profileOf((q) => (q.level <= 4 ? q.answer : "no idea"), 4, factsOf(5));
    const ready = { ...p, strengths: [...p.strengths, { ...p.strengths[0], code: "4.8" }] };
    const candidates = profileAiFacts(ready).next_challenge_candidates;
    expect(candidates.find((c) => c.code === "5.9")).toEqual(expect.objectContaining({ quick_facts_round_skills: ["5.9-recall-facts"] }));
    expect(candidates.find((c) => c.code === "5.9")).not.toHaveProperty("result");
    for (const c of candidates) {
      const skills = BC_SKILL_MAP.standards.find((s) => s.code === c.code)!.skills.map((k) => k.id);
      expect(c.quick_facts_round_skills, c.code).toEqual(skills.some((id) => asked.has(id)) ? skills.filter((id) => asked.has(id)) : undefined);
      expect(c.quick_facts_round_skills ?? [], c.code).not.toContain("4.8-division-facts");
    }
  });

  it("never reads a \"not tested\" label or the untested list, at any grade, with or without the facts round (#245)", () => {
    let untested = 0;
    for (const grade of [1, 2, 3, 4, 5, 6, 7] as const) {
      for (const facts of [null, factsOf(grade)]) {
        const profile = profileOf((q) => (q.level < grade ? q.answer : q.level === grade ? q.wrong[0]?.value ?? "no idea" : "no idea"), grade, facts);
        untested += profile.unknowns.untested.length;
        const read = profileAiFacts(profile);
        const sent = JSON.stringify(read);
        expect(sent, `grade ${grade}`).not.toMatch(/not tested|untested|partly tested/i);
        expect(read.profile.unknowns, `grade ${grade}`).not.toHaveProperty("untested");
        expect(read.profile.unknowns.checkNext.map((s) => s.reason), `grade ${grade}`).not.toContain("untested-in-early-sign-area");
      }
    }
    expect(untested).toBeGreaterThan(0);
  });

  it("has no facts speed or timing for grades 1-4, and keeps them from grade 5", () => {
    const grade3 = profileAiFacts(profileOf((q) => (q.level <= 3 ? q.answer : "no idea"), 3, factsOf(3))).profile.facts;
    expect(grade3).toMatchObject({ answered: 10, correct: 10, accuracy: "secure" });
    expect(grade3).not.toHaveProperty("speed");
    expect(grade3).not.toHaveProperty("medianMs");
    expect(grade3).not.toHaveProperty("seconds");
    expect(profileAiFacts(profileOf(weak, 5, factsOf(5))).profile.facts).toMatchObject({ speed: "quick", medianMs: 2000, seconds: 60 });
  });

  it("drops a likely cause that says something was not tested, or that states the facts timing for grades 1-4", () => {
    const grade3 = profileOf((q) => (STANDARD_5.get(q.templateId)?.startsWith("3.") && q.wrong[0] ? q.wrong[0].value : q.level <= 3 ? q.answer : "no idea"), 3, factsOf(3));
    expect(grade3.struggles.length).toBeGreaterThan(1);
    const [a, b] = grade3.struggles;
    const out = goodOutput(grade3);
    const check = checkProfileAi(grade3, {
      ...out,
      struggles: [
        { code: a.code, likely_cause: "The multiplication facts were not tested.", how_to_help: "Practise." },
        { code: b.code, likely_cause: "{name} answered the facts quickly but skipped steps here.", how_to_help: "Practise." },
      ],
    }, "m");
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.ai.likelyCauses).toBeUndefined();
    expect(check.dropped).toEqual([
      { part: "likelyCauses", code: a.code, problem: "untested", detail: "not tested" },
      { part: "likelyCauses", code: b.code, problem: "speed", detail: "quickly" },
    ]);
  });

  it("drops a likely cause with any wording main's \"not tested\" check rejected in the review probes (#245 r3)", () => {
    const grade5 = profileOf(weak, 5, factsOf(5));
    for (const text of MAIN_REJECTED_UNTESTED) {
      const check = checkProfileAi(grade5, {
        ...goodOutput(grade5),
        struggles: grade5.struggles.map((s) => ({ code: s.code, likely_cause: text, how_to_help: "Practise." })),
      }, "m");
      expect(check.ok, text).toBe(true);
      if (!check.ok) return;
      expect(check.ai.likelyCauses, text).toBeUndefined();
    }
  });

  it("keeps the ways to help as written: they are for the admin only, so the parent text filters do not apply (#245)", () => {
    for (const grade of [3, 5] as const) {
      const profile = grade === 5 ? profileOf(weak, 5, factsOf(5)) : profileOf((q) => (STANDARD_5.get(q.templateId)?.startsWith("3.") && q.wrong[0] ? q.wrong[0].value : q.level <= 3 ? q.answer : "no idea"), 3, factsOf(3));
      const texts = ["Play a quick game of doubles, and ask the facts that were not tested.", "Help {name} recall the facts instantly."];
      const help = Object.fromEntries(profile.struggles.map((s, i) => [s.code, texts[i % texts.length]]));
      const check = checkProfileAi(profile, {
        ...goodOutput(profile),
        struggles: profile.struggles.map((s) => ({ code: s.code, likely_cause: "{name} mixed up the steps.", how_to_help: help[s.code] })),
      }, "m");
      expect(check.ok).toBe(true);
      if (!check.ok) return;
      expect(check.ai.howToHelp?.value, `grade ${grade}`).toEqual(help);
      expect(check.dropped, `grade ${grade}`).toEqual([]);
    }
  });

  it("keeps the facts speed in a likely cause from grade 5", () => {
    const grade5 = profileOf(weak, 5, factsOf(5));
    const [a] = grade5.struggles;
    const check = checkProfileAi(grade5, {
      ...goodOutput(grade5),
      struggles: [{ code: a.code, likely_cause: "{name} recalled the facts instantly, so the facts are not the cause.", how_to_help: "Practise." }],
    }, "m");
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.ai.likelyCauses?.value[a.code]).toContain("instantly");
  });
});

describe("the AI output's checks", () => {
  it("keeps valid output, each part labelled with the model id", () => {
    const out = goodOutput(struggling);
    const check = checkProfileAi(struggling, out, "anthropic/claude-sonnet-5.5");
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    const model = "anthropic/claude-sonnet-5.5";
    expect(check.ai.likelyCauses).toEqual({ model, value: Object.fromEntries(out.struggles.map((s) => [s.code, s.likely_cause])) });
    expect(check.ai.howToHelp).toEqual({ model, value: Object.fromEntries(out.struggles.map((s) => [s.code, s.how_to_help])) });
    expect(check.ai.nextChallenge).toEqual({ model, value: out.next_challenge });
    expect(check.ai.workbookPlan).toEqual({ model, value: out.workbook_plan });
    expect(check.dropped).toEqual([]);
  });

  it("rejects output that does not match the schema: nothing is kept", () => {
    const good = goodOutput(struggling);
    const plan = good.workbook_plan;
    for (const bad of [
      null, "text", [], {},
      { ...good, extra: 1 },
      { struggles: good.struggles, next_challenge: good.next_challenge },
      { ...good, next_challenge: "5.1" },
      { ...good, next_challenge: [5.1] },
      { ...good, struggles: [{ code: "4.1", likely_cause: "Not secure yet." }] },
      { ...good, struggles: [{ code: "4.1", likely_cause: "Not secure yet.", how_to_help: 3 }] },
      { ...good, workbook_plan: { ...plan, stretch: { percent: "20", standards: [] } } },
      { ...good, workbook_plan: { ...plan, stretch: { percent: 20.5, standards: [] } } },
      { ...good, workbook_plan: { review: plan.review, practise: plan.practise } },
    ]) {
      expect(checkProfileAi(struggling, bad, "m"), JSON.stringify(bad)).toMatchObject({ ok: false });
    }
  });

  it("drops a next challenge that names a standard whose prerequisites are not secure, from the list and from the stretch", () => {
    const out = goodOutput(onGrade);
    const [ready] = out.next_challenge;
    const bad = notReady(onGrade);
    const check = checkProfileAi(onGrade, {
      ...out,
      next_challenge: [ready, bad],
      workbook_plan: { ...out.workbook_plan, stretch: { percent: 20, standards: [bad, ready] } },
    }, "m");
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.ai.nextChallenge?.value).toEqual([ready]);
    expect(check.ai.workbookPlan?.value.stretch).toEqual({ percent: 20, standards: [ready] });
    expect(check.dropped).toEqual([
      { part: "nextChallenge", code: bad, problem: "prerequisites-not-secure" },
      { part: "workbookPlan", code: bad, problem: "prerequisites-not-secure" },
    ]);
  });

  it("drops a next challenge the child is already secure in, one not in the skill map, and one with no prerequisite to show readiness", () => {
    const out = goodOutput(struggling);
    const [ready] = out.next_challenge;
    const strength = struggling.strengths[0].code;
    const noPrerequisite = BC_SKILL_MAP.standards.find((s) => !secure(struggling).has(s.code) && prerequisitesOf(s.code).length === 0)!.code;
    const check = checkProfileAi(struggling, { ...out, next_challenge: [strength, "9.99", noPrerequisite, ready, ready] }, "m");
    expect(check.ok && check.ai.nextChallenge?.value).toEqual([ready]);
    expect(check.ok && check.dropped.map((d) => [d.code, d.problem])).toEqual([
      [strength, "already-secure"], ["9.99", "unknown-standard"], [noPrerequisite, "no-prerequisite"], [ready, "repeated"],
    ]);
    // Every challenge dropped: no next challenge part.
    const none = checkProfileAi(struggling, { ...out, next_challenge: [strength] }, "m");
    expect(none.ok && none.ai.nextChallenge).toBeUndefined();
  });

  it("drops a next challenge that is a struggle, even with every prerequisite secure: a struggle is practise", () => {
    // Knows grade 3 and gives a coded wrong answer at grade 4: struggles whose grade 3 prerequisites are secure.
    const behind = profileOf((q) => (q.level <= 3 ? q.answer : q.wrong[0]?.value ?? "no idea"));
    const struggle = behind.struggles.find((s) => prerequisitesOf(s.code).length > 0 && prerequisitesOf(s.code).every((c) => secure(behind).has(c)))!.code;
    expect(profileAiFacts(behind).next_challenge_candidates.map((c) => c.code)).not.toContain(struggle);
    const out = goodOutput(behind);
    const check = checkProfileAi(behind, { ...out, next_challenge: [struggle], workbook_plan: { ...out.workbook_plan, stretch: { percent: 20, standards: [struggle] } } }, "m");
    expect(check.ok && check.ai.nextChallenge).toBeUndefined();
    expect(check.ok && check.ai.workbookPlan?.value.stretch).toEqual({ percent: 20, standards: [] });
    expect(check.ok && check.dropped).toEqual([
      { part: "nextChallenge", code: struggle, problem: "a-struggle" },
      { part: "workbookPlan", code: struggle, problem: "a-struggle" },
    ]);
  });

  it("checks each text with the AI text rules: a number not in the facts, a pronoun or first person drops that text only", () => {
    const out = goodOutput(struggling);
    expect(out.struggles.length).toBeGreaterThan(2);
    const [a, b, c] = out.struggles;
    const check = checkProfileAi(struggling, {
      ...out,
      struggles: [
        { ...a, likely_cause: "Gets 97 percent of the steps right, then slips." },
        { ...b, how_to_help: "Ask her to say each step aloud." },
        { ...c, likely_cause: "I think the regrouping step is missing." },
        ...out.struggles.slice(3),
      ],
    }, "m");
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(Object.keys(check.ai.likelyCauses!.value)).toEqual(out.struggles.filter((s) => s !== a && s !== c).map((s) => s.code));
    expect(Object.keys(check.ai.howToHelp!.value)).toEqual(out.struggles.filter((s) => s !== b).map((s) => s.code));
    expect(check.dropped).toEqual([
      { part: "likelyCauses", code: a.code, problem: "number", detail: "97" },
      { part: "howToHelp", code: b.code, problem: "pronoun", detail: "her" },
      { part: "likelyCauses", code: c.code, problem: "voice", detail: "I" },
    ]);
  });

  it("keeps a number in AI text when it is in the facts: the child's own answer and the question", () => {
    // A wrong answer with numbers only, so the text is about numbers and nothing else.
    const plain = /^\d+$/;
    const s = struggling.struggles.find((x) => x.wrong.some((w) => plain.test(w.response) && plain.test(w.rightAnswer) && /\d/.test(w.prompt)))!;
    const w = s.wrong.find((x) => plain.test(x.response) && plain.test(x.rightAnswer) && /\d/.test(x.prompt))!;
    const text = `Answered ${w.response} where ${w.rightAnswer} was right, with ${w.prompt.match(/\d{1,3}(?:,\d{3})+|\d+/g)!.join(" and ")} in the question.`;
    const check = checkProfileAi(struggling, { ...goodOutput(struggling), struggles: [{ code: s.code, likely_cause: text, how_to_help: "Practise with objects first." }] }, "m");
    expect(check.ok && check.ai.likelyCauses?.value).toEqual({ [s.code]: text });
    // The same text with a number the facts do not hold is dropped.
    const off = checkProfileAi(struggling, { ...goodOutput(struggling), struggles: [{ code: s.code, likely_cause: `${text} Then 9999.`, how_to_help: "Practise." }] }, "m");
    expect(off.ok && off.ai.likelyCauses).toBeUndefined();
  });

  it("drops a cause or a way to help for a standard that is not a struggle, and a plan whose parts do not add up to 100", () => {
    const out = goodOutput(struggling);
    const strength = struggling.strengths[0].code;
    const check = checkProfileAi(struggling, {
      ...out,
      struggles: [...out.struggles, { code: strength, likely_cause: "Not secure yet.", how_to_help: "Practise." }],
      workbook_plan: { ...out.workbook_plan, stretch: { percent: 30, standards: [] } },
    }, "m");
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(Object.keys(check.ai.likelyCauses!.value)).not.toContain(strength);
    expect(check.ai.workbookPlan).toBeUndefined();
    expect(check.dropped).toEqual([
      { part: "likelyCauses", code: strength, problem: "not-a-struggle" },
      { part: "howToHelp", code: strength, problem: "not-a-struggle" },
      { part: "workbookPlan", problem: "proportions", detail: "20 + 60 + 30" },
    ]);
  });

  it("drops a plan standard the AI did not read in the facts", () => {
    const out = goodOutput(struggling);
    const check = checkProfileAi(struggling, { ...out, workbook_plan: { ...out.workbook_plan, review: { percent: 20, standards: ["9.99", ...out.workbook_plan.review.standards] } } }, "m");
    expect(check.ok && check.ai.workbookPlan?.value.review.standards).toEqual(out.workbook_plan.review.standards);
    expect(check.ok && check.dropped).toEqual([{ part: "workbookPlan", code: "9.99", problem: "unknown-standard" }]);
  });

  it("keeps a plan standard of the school grade the test did not measure: the AI reads them all as a plain list (#245 r2, D-124)", () => {
    const untested = onGrade.unknowns.untested.map((s) => s.code);
    expect(untested.length).toBeGreaterThan(0);
    const facts = profileAiFacts(onGrade);
    // Every standard of the school grade, by code and words, with no result: the same for a tested one and an untested one.
    expect(facts.school_grade_standards).toEqual(BC_SKILL_MAP.standards.filter((s) => s.grade === 4).map((s) => ({ code: s.code, text: s.text })));
    const out = goodOutput(onGrade);
    const plan = { ...out.workbook_plan, review: { percent: 20, standards: [untested[0]] }, practise: { percent: 60, standards: untested } };
    const check = checkProfileAi(onGrade, { ...out, workbook_plan: plan }, "m");
    expect(check.ok && check.ai.workbookPlan?.value.review.standards).toEqual([untested[0]]);
    expect(check.ok && check.ai.workbookPlan?.value.practise.standards).toEqual(untested);
    expect(check.ok && check.dropped.filter((d) => d.part === "workbookPlan")).toEqual([]);
  });

  it("sends a schema the structured output accepts: every object closed, every property required", () => {
    const objects: Record<string, unknown>[] = [];
    const walk = (s: unknown) => {
      if (!s || typeof s !== "object") return;
      const o = s as Record<string, unknown>;
      if (o.type === "object") objects.push(o);
      Object.values(o).forEach(walk);
    };
    walk(PROFILE_AI_SCHEMA);
    expect(objects.length).toBeGreaterThan(3);
    for (const o of objects) {
      expect(o.additionalProperties).toBe(false);
      expect(o.required).toEqual(Object.keys(o.properties as object));
    }
  });
});
