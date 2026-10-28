// The AI's interpretation of the learner profile (#197, spec #181, D-117): what the AI reads, the JSON schema of what
// it writes, and the checks its output passes before any of it is kept. The AI writes four parts: the likely cause of
// each struggle, how to help with each struggle, the next challenge and the workbook 1 plan. Code keeps the rules:
//   - the output must match the schema, or nothing is kept;
//   - every AI text passes the AI text checks of the report text (checkAiText): no first person, no he or she, no
//     markup, and every number from the facts the AI read;
//   - a next challenge (and a stretch standard of the plan) names a standard that is not yet secure and not a struggle
//     (a struggle is practise), whose prerequisite standards in the skill map are all secure in this test; a challenge
//     that does not is dropped;
//   - the plan's three percents add up to 100, and it names only standards the AI read in the facts.
// Pure, like the profile: the server module (src/lib/learner-profile-ai.ts) sends the request through the AI client.
import { REPORT_TEXT_NAME, checkAiText, parentTextProblem, type ReportTextProblem } from "./ai-checks";
import { FACT_SPEED_FROM_GRADE, factsSkills } from "./facts";
import { startLevel } from "./grades";
import { MISCONCEPTIONS, type MisconceptionId } from "./misconceptions";
import type { LearnerProfile, PlanPart, ProfileAi, WorkbookPlan } from "./profile";
import { BC_LEVEL_STANDARDS, BC_SKILL_MAP } from "./skill-map";

/** The longest likely cause or way to help kept, in characters: one or two short sentences. */
export const PROFILE_AI_TEXT_MAX = 300;

/** The subset of JSON Schema the output schema uses, and that checkProfileAi checks. */
type JsonSchema = {
  type: "object" | "array" | "string" | "integer";
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: false;
  items?: JsonSchema;
};

const PLAN_PART = (what: string): JsonSchema => ({
  type: "object",
  description: what,
  properties: {
    percent: { type: "integer", description: "This part's share of the workbook, in percent. The three parts add up to 100." },
    standards: { type: "array", items: { type: "string" }, description: "The codes of the BC standards this part works on, from the facts." },
  },
  required: ["percent", "standards"],
  additionalProperties: false,
});

/** The output's JSON Schema: sent to the model as its structured output, and checked again by checkProfileAi. */
export const PROFILE_AI_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    struggles: {
      type: "array",
      description: "One entry for each struggle in the facts.",
      items: {
        type: "object",
        properties: {
          code: { type: "string", description: "The struggle's BC standard code, as in the facts." },
          likely_cause: { type: "string", description: "The likely cause, in one or two short sentences." },
          how_to_help: { type: "string", description: "How to help, in one or two short sentences." },
        },
        required: ["code", "likely_cause", "how_to_help"],
        additionalProperties: false,
      },
    },
    next_challenge: { type: "array", items: { type: "string" }, description: "Codes of next challenge candidates from the facts, most fitting first." },
    workbook_plan: {
      type: "object",
      properties: {
        review: PLAN_PART("Standards to keep fresh."),
        practise: PLAN_PART("Standards to practise now."),
        stretch: PLAN_PART("Next challenges to start."),
      },
      required: ["review", "practise", "stretch"],
      additionalProperties: false,
    },
  },
  required: ["struggles", "next_challenge", "workbook_plan"],
  additionalProperties: false,
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The first way a value does not match the schema, or null when it matches. */
function schemaProblem(schema: JsonSchema, value: unknown, at: string): string | null {
  switch (schema.type) {
    case "object": {
      if (!isObject(value)) return `${at} is not an object`;
      for (const key of schema.required ?? []) if (!(key in value)) return `${at}.${key} is missing`;
      for (const [key, v] of Object.entries(value)) {
        const property = schema.properties?.[key];
        if (!property) return `${at}.${key} is not in the schema`;
        const problem = schemaProblem(property, v, `${at}.${key}`);
        if (problem) return problem;
      }
      return null;
    }
    case "array": {
      if (!Array.isArray(value)) return `${at} is not an array`;
      for (const [i, v] of value.entries()) {
        const problem = schemaProblem(schema.items!, v, `${at}[${i}]`);
        if (problem) return problem;
      }
      return null;
    }
    case "string":
      return typeof value === "string" ? null : `${at} is not a string`;
    case "integer":
      return Number.isInteger(value) ? null : `${at} is not an integer`;
  }
}

// K-8 only: a grade 9 standard (workbooks only) is an unknown standard here, so never a next challenge.
const STANDARDS = new Map(BC_LEVEL_STANDARDS.map((s) => [s.code, s]));
/** The result of a skill or a standard that only the quick facts round asked (#242). */
const FACTS_TESTED = "tested in the quick facts round";
const OWNER = new Map(BC_SKILL_MAP.standards.flatMap((s) => s.skills.map((k) => [k.id, s] as const)));

/** The BC standards whose skills the standard's skills need directly, other than itself, in the map's order of need. */
function prerequisiteStandards(code: string): string[] {
  const needs = STANDARDS.get(code)?.skills.flatMap((k) => k.requires.flatMap((id) => OWNER.get(id)?.code ?? [])) ?? [];
  return [...new Set(needs)].filter((c) => c !== code);
}

/** Why a standard cannot be a next challenge for this profile, or null when it can. */
type ChallengeProblem = "unknown-standard" | "already-secure" | "a-struggle" | "no-prerequisite" | "prerequisites-not-secure";

function challengeProblem(code: string, profile: LearnerProfile): ChallengeProblem | null {
  const secure = new Set(profile.strengths.map((s) => s.code));
  if (!STANDARDS.has(code)) return "unknown-standard";
  if (secure.has(code)) return "already-secure";
  if (profile.struggles.some((s) => s.code === code)) return "a-struggle";
  const needs = prerequisiteStandards(code);
  // With no prerequisite in another standard, the test shows nothing about readiness.
  if (needs.length === 0) return "no-prerequisite";
  return needs.every((c) => secure.has(c)) ? null : "prerequisites-not-secure";
}

/**
 * What the AI reads (spec #181): the profile facts, with REPORT_TEXT_NAME for the child; the descriptions of the
 * struggles' misconceptions; the skill-map neighbours of each struggle (its skills, the skills they need, and the
 * child's result on each needed skill's standard); and the next challenge candidates (every standard that passes the
 * challenge rule). Never a name, an id of the family, a drawing or typed working: the profile holds none.
 * The AI text checks take their numbers from all of it. #242: below FACT_SPEED_FROM_GRADE the facts carry no timing, as
 * the parent's report shows no speed (D-120). #245: only what the test measured, never what it did not: no untested
 * list and no "not tested" label, as what the test did not ask is code's to say. A needed skill has a result when its
 * standard's questions measured it, or "tested in the quick facts round" when the round asked that skill (factsSkills:
 * a round of multiplication facts asks no division); else none. A candidate has a result when questions measured it,
 * and names the skills of it the quick facts round asked, when it asked any. And every standard of the school grade, by
 * code and words, that the workbook plan may name (D-124).
 */
export function profileAiFacts(profile: LearnerProfile) {
  const rest: Omit<LearnerProfile, "ai"> & { ai?: unknown } = { ...profile };
  delete rest.ai;
  const { earlySigns, checkNext } = profile.unknowns;
  const facts = {
    ...rest,
    facts: profile.test.grade < FACT_SPEED_FROM_GRADE ? withoutTiming(profile.facts) : profile.facts,
    // The early signs, and the struggles to confirm; never the untested standards.
    unknowns: { earlySigns, checkNext: checkNext.filter((s) => s.reason === "confirm-struggle") },
  };
  const results = new Map(profile.standards.map((s) => [s.code, s.status as string]));
  const askedSkills = new Set(factsSkills(profile.facts?.families ?? []));
  const skillResult = (id: string, code: string) => results.get(code) ?? (askedSkills.has(id) ? FACTS_TESTED : undefined);
  const misconceptions = [...new Set(profile.struggles.flatMap((s) => s.misconceptions))];
  return {
    child: REPORT_TEXT_NAME,
    profile: facts,
    misconceptions: Object.fromEntries(misconceptions.map((id) => [id, MISCONCEPTIONS[id as MisconceptionId]?.description ?? "unknown"])),
    struggle_skills: profile.struggles.map((s) => ({
      code: s.code,
      skills: (STANDARDS.get(s.code)?.skills ?? []).map((k) => ({
        id: k.id,
        text: k.text,
        requires: k.requires.flatMap((id) => {
          const owner = OWNER.get(id);
          const needed = owner?.skills.find((x) => x.id === id);
          const result = owner && skillResult(id, owner.code);
          return owner && needed ? [{ id, text: needed.text, standard: owner.code, ...(result ? { result } : {}) }] : [];
        }),
      })),
    })),
    next_challenge_candidates: BC_LEVEL_STANDARDS
      .filter((s) => challengeProblem(s.code, profile) === null)
      .map((s) => {
        const result = results.get(s.code);
        const asked = s.skills.filter((k) => askedSkills.has(k.id)).map((k) => k.id);
        return {
          code: s.code, text: s.text, grade: s.grade, ...(result ? { result } : {}),
          ...(asked.length ? { quick_facts_round_skills: asked } : {}), prerequisites: prerequisiteStandards(s.code),
        };
      }),
    // The plan may name any standard of the school grade, as before #245: all of them, with no result, so the list
    // says nothing about which the test measured.
    // D-156: a Grade 9 child's are grade 8's, the highest the test checks: the plan never names grade 9 (D-153).
    school_grade_standards: BC_SKILL_MAP.standards.filter((s) => s.grade === startLevel(profile.test.grade)).map((s) => ({ code: s.code, text: s.text })),
  };
}

/** The facts result without its timing: the round's length, the median time and the speed label. */
function withoutTiming(facts: LearnerProfile["facts"]) {
  if (!facts) return null;
  const { families, answered, correct, skipped, accuracy } = facts;
  return { families, answered, correct, skipped, accuracy };
}

/** Something the checks dropped from valid output: which part, which standard, and why. */
export interface ProfileAiDrop {
  part: keyof ProfileAi;
  code?: string;
  problem: ReportTextProblem | ChallengeProblem | "not-a-struggle" | "repeated" | "proportions";
  detail?: string;
}

export type ProfileAiCheck = { ok: true; ai: ProfileAi; dropped: ProfileAiDrop[] } | { ok: false; problem: string };

interface Output {
  struggles: { code: string; likely_cause: string; how_to_help: string }[];
  next_challenge: string[];
  workbook_plan: WorkbookPlan;
}

/**
 * The parts of the AI's output that pass the checks, each labelled with the model id; or why nothing is kept, when the
 * output does not match PROFILE_AI_SCHEMA. Within valid output, a text, a challenge or a plan standard that fails its
 * check is dropped on its own (`dropped` says which and why), and a part with nothing left is absent.
 */
export function checkProfileAi(profile: LearnerProfile, output: unknown, model: string): ProfileAiCheck {
  const problem = schemaProblem(PROFILE_AI_SCHEMA, output, "output");
  if (problem) return { ok: false, problem };
  const out = output as Output;
  const facts = profileAiFacts(profile);
  const struggles = new Set(profile.struggles.map((s) => s.code));
  const dropped: ProfileAiDrop[] = [];
  const ai: ProfileAi = {};

  // The likely cause and how to help, by struggle: each text checked on its own.
  const causes: Record<string, string> = {};
  const help: Record<string, string> = {};
  const seen = new Set<string>();
  for (const s of out.struggles) {
    const texts = [["likelyCauses", s.likely_cause, causes], ["howToHelp", s.how_to_help, help]] as const;
    for (const [part, text, into] of texts) {
      if (!struggles.has(s.code)) dropped.push({ part, code: s.code, problem: "not-a-struggle" });
      else if (seen.has(s.code)) dropped.push({ part, code: s.code, problem: "repeated" });
      else {
        const check = checkAiText(text, facts, PROFILE_AI_TEXT_MAX);
        // What a parent's AI text may not say (#242): the likely cause is on the parent's report (D-120). How to help is
        // the admin's only (#245).
        const parent = check.ok && part === "likelyCauses" ? parentTextProblem(check.text, profile.test.grade) : null;
        if (!check.ok) dropped.push({ part, code: s.code, problem: check.problem, detail: check.detail });
        else if (parent) dropped.push({ part, code: s.code, ...parent });
        else into[s.code] = check.text;
      }
    }
    seen.add(s.code);
  }
  if (Object.keys(causes).length) ai.likelyCauses = { model, value: causes };
  if (Object.keys(help).length) ai.howToHelp = { model, value: help };

  /** The codes that pass a rule, each once; the others dropped with their reason. */
  const keep = (part: keyof ProfileAi, codes: readonly string[], rule: (code: string) => ProfileAiDrop["problem"] | null) => {
    const kept: string[] = [];
    for (const code of codes) {
      const why = rule(code) ?? (kept.includes(code) ? "repeated" : null);
      if (why) dropped.push({ part, code, problem: why });
      else kept.push(code);
    }
    return kept;
  };
  const challenge = (code: string) => challengeProblem(code, profile);

  const next = keep("nextChallenge", out.next_challenge, challenge);
  if (next.length) ai.nextChallenge = { model, value: next };

  // The plan: three percents that add up to 100, and only standards the AI read in the facts.
  const plan = out.workbook_plan;
  const percents = [plan.review.percent, plan.practise.percent, plan.stretch.percent];
  if (percents.some((p) => p < 0 || p > 100) || percents.reduce((a, b) => a + b, 0) !== 100) {
    dropped.push({ part: "workbookPlan", problem: "proportions", detail: percents.join(" + ") });
  } else {
    const read = new Set([
      ...profile.standards.map((s) => s.code),
      ...facts.struggle_skills.flatMap((s) => s.skills.flatMap((k) => k.requires.map((r) => r.standard))),
      ...facts.next_challenge_candidates.map((c) => c.code),
      ...facts.school_grade_standards.map((s) => s.code),
    ]);
    const known = (code: string) => (read.has(code) ? null : "unknown-standard" as const);
    const part = (p: PlanPart, rule: typeof known | typeof challenge): PlanPart => ({ percent: p.percent, standards: keep("workbookPlan", p.standards, rule) });
    ai.workbookPlan = { model, value: { review: part(plan.review, known), practise: part(plan.practise, known), stretch: part(plan.stretch, challenge) } };
  }
  return { ok: true, ai, dropped };
}
