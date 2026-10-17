// The learner profile's AI parts (#197, spec #181, D-117): one request through the AI client (#183, OpenRouter) writes
// the likely cause of each struggle, how to help with each, the next challenge and the workbook 1 plan. The assessment
// core gives what the AI reads (profileAiFacts: the profile facts, the skill-map neighbours, the misconception
// descriptions) and checks what it writes (checkProfileAi): the output schema, the AI text checks of the report text,
// and the prerequisite rule of a next challenge. Only the parts that pass are kept, each with the model id.
// Behind the AI client's switch: on only with OPENROUTER_API_KEY. For the server only: the profile build
// (src/lib/learner-profile.ts) calls it. No "server-only" import so that its tests can run, as src/lib/work-review-ai.ts.
// What it sends: the profile facts, which hold no name, no family or account id, no drawing and no typed working.
import { aiClient, withTimeLimit, type AiClient } from "@/lib/ai-client";
import {
  PROFILE_AI_SCHEMA,
  PROFILE_AI_TEXT_MAX,
  REPORT_TEXT_NAME,
  checkProfileAi,
  profileAiFacts,
  type LearnerProfile,
  type ProfileAi,
  type ProfileAiDrop,
} from "@/lib/assessment";
import { fakeProfileAi } from "@/lib/learner-profile-ai-fake";

/**
 * The AI parts stop after this long; then the profile keeps its facts. The report job runs this after its own AI step
 * (at most 165 s) and the report's emails: together they stay well under Vercel's 300 s.
 */
export const PROFILE_AI_MS = 60_000;

const SYSTEM = `You interpret the result of a math placement test for one child in grades 1 to 7 in British Columbia, Canada. Your reader plans the child's first workbook, and parts may later be shown to the child's parent. Use only the facts in the JSON you get.

The JSON holds:
- profile: the measured facts. Each BC standard tested, with its result. Strengths: the secure standards. Struggles: standards at or below the school grade that are not secure, with the child's real wrong answers and the ids of the known mistakes they match. Number facts, how the child took the test, and the parent's answers: how the child feels about math, the main goal and the time each week.
- misconceptions: each known mistake id in plain words. A wrong answer can match a known mistake by chance: treat it as a likely cause, not as certain.
- struggle_skills: for each struggle, its skills, the skills each one needs first, and the child's result on each needed skill when the test measured it: its standard's result, or "tested in the quick facts round" when only the facts round asked that skill.
- next_challenge_candidates: the standards the child is ready for: not yet secure, not a struggle, and every standard they build on is secure. There may be none. A candidate has a result when questions measured it, and quick_facts_round_skills lists its skills that the facts round asked.

Return:
- struggles: one entry for each struggle, with its code.
  - likely_cause: the most likely cause, from the wrong answers, the known mistakes they match and the needed skills that are not secure. Say "may" when the evidence is thin: an early sign, or a single wrong answer.
  - how_to_help: what to practise first, and how.
- next_challenge: up to 3 codes from next_challenge_candidates, the best fit first. Prefer standards of the school grade or the grade after it that build on the strengths. Never a code that is not a candidate.
- workbook_plan: the mix of the first workbook. review: secure standards to keep fresh, and needed skills that are not secure. practise: the struggles first. stretch: codes from next_challenge only. Each part has a whole-number percent, and the three add up to 100. Give more to practise when there are struggles, and more to stretch when there are none and the parent's goal is to get ahead. A part may have 0 percent and no standards. Use only codes that are in the facts.

Rules for likely_cause and how_to_help:
- 1 or 2 short sentences, at most ${PROFILE_AI_TEXT_MAX} characters. Plain words. No lists, headings, links or markdown. Name a standard by its words, not its code.
- Write ${REPORT_TEXT_NAME} where the child's name goes. Never use he, she, him, her, his or hers: repeat ${REPORT_TEXT_NAME} or rephrase.
- Write every number as digits, and use only numbers that are in the facts. Do not calculate new numbers: no percentages, differences or totals. Do not write numbers as words, and do not use the words "one" or "half".
- Write only about what the facts show. Say nothing about what the test asked or left out. When the number facts have no speed, say nothing about time or speed: no seconds, pace, quick, fast, slow or time per fact.
- Never invent a strength or a weakness. Do not compare the child with other children. Do not mention prices, the company, how the test works, AI or yourself. Do not write "I". Do not use dashes as punctuation.`;

/**
 * The client for the profile's AI parts, or null when the AI is off (no OPENROUTER_API_KEY; the model comes from
 * AI_MODEL, as for the work review). In development (never in a production build), AI_REVIEW_FAKE=sure or unsure gives
 * the fake, for a profile with AI parts without a key.
 */
export function profileAiClient(env: Record<string, string | undefined> = process.env): AiClient | null {
  const fake = env.AI_REVIEW_FAKE;
  if (env.NODE_ENV !== "production" && (fake === "sure" || fake === "unsure")) return fakeProfileAi(fake);
  return aiClient(env);
}

/**
 * The AI parts of a profile that pass the checks, and what the checks dropped. Throws when there are none to read: the
 * request failed or took longer than `ms`, or the output does not match the schema.
 */
export async function writeProfileAi(client: AiClient, profile: LearnerProfile, ms = PROFILE_AI_MS): Promise<{ ai: ProfileAi; dropped: ProfileAiDrop[] }> {
  const output = await withTimeLimit(ms, (signal) => client.json({
    name: "learner_profile",
    system: SYSTEM,
    content: [{ type: "text", text: JSON.stringify(profileAiFacts(profile), null, 2) }],
    schema: PROFILE_AI_SCHEMA,
    effort: "medium",
  }, signal));
  const check = checkProfileAi(profile, output, client.model);
  if (!check.ok) throw new Error(`the output does not match the schema: ${check.problem}`);
  return check;
}
