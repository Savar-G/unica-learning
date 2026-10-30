// The AI findings of the child's profile (#304, spec #295): after code stores the facts of a build
// (src/lib/child-profile.ts), one request through the AI client (#183, OpenRouter) reads the facts and the child's
// events and writes findings. A finding is a hypothesis about one BC standard for the workbook planner and Maya, linked
// to the ids of the events that show it. Code keeps the rules before any finding is kept:
//   - the output must match the schema, or nothing is kept (the request fails);
//   - a finding names a standard of the profile and links at least one event of that standard, and every event it
//     links is one the AI read: an event of this child, read by this build. A finding with an unknown id (another
//     child's event, an id that does not exist) is dropped whole;
//   - its text is worded as a hypothesis ("may", "might", "seems", ...) and passes the AI text checks (checkAiText): no
//     first person, no he or she, no markup, and every number from the facts the AI read.
// Findings never change the facts: the secure and not yet secure standards are counted by code, and the findings sit
// beside them (`ai`). Behind the AI client's switch: on only with OPENROUTER_API_KEY.
// What it sends: the child's school grade, the profile's standards with their counts, and the child's newest events
// (id, source, standard, result, the worked step id where the child got stuck, mistake id, hints, time spent, when, and
// the workbook page and question number). Never a name, a parent, a family, account or workbook id, the evidence ids or
// the learning card. The wording rule is a word check ("may", "seems"): it keeps statements out, not every overclaim.
// No "server-only" import so that its tests can run, as src/lib/learner-profile-ai.ts. Pure apart from the client.
import { aiClient, withTimeLimit, type AiClient } from "@/lib/ai-client";
import { MISCONCEPTIONS, checkAiText } from "@/lib/assessment";
import { fakeChildProfileAi } from "@/lib/child-profile-ai-fake";
import type { ChildLearnerProfile, ChildProfileFinding } from "@/lib/child-profile";
import type { LearningEvent } from "@/lib/learning-events";

/**
 * The findings stop after this long; then the profile keeps its facts. The report job runs the child's rebuild last,
 * after its own AI step (at most 165 s), the report's two emails (at most 15 s each) and the test profile's AI parts
 * (60 s): with this, 275 s, under Vercel's 300 s.
 */
export const CHILD_PROFILE_AI_MS = 20_000;
/** The AI reads at most this many events: the child's newest. */
export const AI_EVENTS_MAX = 200;
/** At most this many findings are kept, in the AI's order. */
export const FINDINGS_MAX = 6;
/** The longest finding kept, in characters: one or two short sentences. */
export const FINDING_TEXT_MAX = 300;

const SYSTEM = `You read the learning record of one child from kindergarten to grade 9 in British Columbia, Canada, and write findings for the planner of the child's next math workbook and for the child's AI tutor. Use only the facts in the JSON you get.

The JSON holds:
- school_grade: the child's school grade (0 is kindergarten).
- standards: each BC standard the child's placement test or events touched, with its result, counted by code: right answers with no help and all answers; the test's tally; and the events' counts. A right answer with help is not a right answer. A standard above the school grade is never a weakness.
- secure and not_yet_secure: the codes of the standards the counts say are secure, and those at or below the school grade that are not yet secure.
- events: the child's newest learning events, oldest first. Each has its id, its source (a call with the tutor, a marked workbook page, or the placement test), its standard, its result (right, right_with_help, wrong or blank), the worked step where the child got stuck, the mistake (the id of a known wrong answer), the hints given and the time spent in milliseconds. counted is false for a test answer the test's tally already counts.
- mistakes: what each known mistake id of the placement test means.

Return findings: up to ${FINDINGS_MAX} patterns that the events show and the counts alone do not say, the most useful for the next workbook first. Examples: the step where the child gets stuck again and again, a mistake that repeats across questions, a standard right only with help, a standard where the calls and the marked pages disagree. Return no finding when the events show no pattern; an empty list is a good answer.

For each finding:
- standard: the code of the standard it is about, from standards.
- hypothesis: 1 or 2 short sentences, at most ${FINDING_TEXT_MAX} characters. It is a hypothesis, not a fact: say "may", "might" or "seems". Plain words; name a standard by its words, not its code. Write "the child", never a name, and never he, she, him, her, his or hers. Use only numbers that are in the facts. No lists, headings, links or markdown. Do not write "I". Do not use dashes as punctuation.
- event_ids: the ids of the events that show it, copied exactly from events. At least 1. Never an id that is not in events.

Never change a result: do not say a standard is secure or not secure when the counts say otherwise. Do not compare the child with other children. Do not mention prices, the company, AI or yourself.`;

/** The output's JSON Schema: sent to the model as its structured output, and checked again here. */
export const CHILD_PROFILE_AI_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      description: "The findings, the most useful first. May be empty.",
      items: {
        type: "object",
        properties: {
          standard: { type: "string", description: "The BC standard code the finding is about, from the facts." },
          hypothesis: { type: "string", description: "The finding as a hypothesis, in one or two short sentences." },
          event_ids: { type: "array", items: { type: "string" }, description: "The ids of the events that show it, from the facts." },
        },
        required: ["standard", "hypothesis", "event_ids"],
        additionalProperties: false,
      },
    },
  },
  required: ["findings"],
  additionalProperties: false,
} as const;

/** Why a finding was dropped: its place in the output, its standard (when it is one of the profile's), and the rule. Never the AI's text. */
export interface FindingDrop {
  index: number;
  standard: string | null;
  rule: "unknown-standard" | "no-events" | "unknown-event" | "no-event-of-standard" | "not-a-hypothesis" | "too-many" | `text-${string}`;
}

/** What the AI reads (childProfileAiFacts). */
export type ChildProfileAiFacts = ReturnType<typeof childProfileAiFacts>;

/** What the AI reads: the facts and the newest events, with no name, family, account or workbook id. */
function childProfileAiFacts(profile: ChildLearnerProfile, events: readonly LearningEvent[]) {
  const counted = new Set(profile.standards.flatMap((s) => s.evidence.events));
  const newest = events.slice(-AI_EVENTS_MAX);
  const mistakes = Object.fromEntries(newest.flatMap((e) => (e.mistake && e.mistake in MISCONCEPTIONS ? [[e.mistake, MISCONCEPTIONS[e.mistake as keyof typeof MISCONCEPTIONS].description]] : [])));
  return {
    school_grade: profile.grade,
    standards: profile.standards.map((s) => ({
      code: s.code, text: s.text, grade: s.grade, above_school_grade: s.aboveGrade, result: s.status, right: s.correct, answers: s.total,
      test: s.assessment && { right: s.assessment.correct, answers: s.assessment.total },
      events: { right: s.events.right, right_with_help: s.events.rightWithHelp, wrong: s.events.wrong, blank: s.events.blank, hints: s.events.hints, stuck_steps: s.events.stuckSteps, mistakes: s.events.mistakes },
    })),
    secure: profile.secure,
    not_yet_secure: profile.notYetSecure,
    events: newest.map((e) => ({
      id: e.id,
      source: e.source,
      ...(e.question.source === "workbook" ? { workbook_page: e.question.page, workbook_question: e.question.question } : {}),
      standard: e.skill.standard,
      result: e.result,
      stuck_step: e.stuckStep,
      mistake: e.mistake,
      hints: e.hints,
      time_ms: e.timeMs,
      at: e.occurredAt,
      counted: counted.has(e.id),
    })),
    mistakes,
  };
}

/** A hypothesis says it may not be so. */
const HEDGE = /\b(?:may|might|could|seems?|appears?|possibly|perhaps|likely|probably)\b/i;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The first way the output does not match the schema, or null when it matches. */
function outputProblem(output: unknown): string | null {
  if (!isObject(output) || Object.keys(output).some((k) => k !== "findings")) return "output is not { findings }";
  if (!Array.isArray(output.findings)) return "output.findings is not an array";
  for (const [i, f] of output.findings.entries()) {
    if (!isObject(f)) return `output.findings[${i}] is not an object`;
    const keys = Object.keys(f).sort().join();
    // Not the AI's own key names: the problem is logged.
    if (keys !== "event_ids,hypothesis,standard") return `output.findings[${i}] does not have exactly standard, hypothesis and event_ids`;
    if (typeof f.standard !== "string" || typeof f.hypothesis !== "string") return `output.findings[${i}] has a text that is not a string`;
    if (!Array.isArray(f.event_ids) || !f.event_ids.every((id) => typeof id === "string")) return `output.findings[${i}].event_ids is not a list of strings`;
  }
  return null;
}

/**
 * The findings that pass the checks (see the header), with the events each links in the AI's order, and what the checks
 * dropped. Throws when the output does not match the schema.
 */
function checkChildProfileAi(facts: ChildProfileAiFacts, output: unknown): { findings: ChildProfileFinding[]; dropped: FindingDrop[] } {
  const problem = outputProblem(output);
  if (problem) throw new Error(`the output does not match the schema: ${problem}`);
  const standards = new Set(facts.standards.map((s) => s.code));
  const read = new Map(facts.events.map((e) => [e.id, e.standard]));
  // The numbers a finding may use: those of the facts, not the digits of the ids.
  const numbers = { ...facts, events: facts.events.map((e) => ({ ...e, id: null })) };
  const findings: ChildProfileFinding[] = [];
  const dropped: FindingDrop[] = [];
  for (const [index, f] of (output as { findings: { standard: string; hypothesis: string; event_ids: string[] }[] }).findings.entries()) {
    const drop = (rule: FindingDrop["rule"]) => void dropped.push({ index, standard: standards.has(f.standard) ? f.standard : null, rule });
    const events = [...new Set(f.event_ids.map((id) => id.trim().toLowerCase()))];
    if (!standards.has(f.standard)) drop("unknown-standard");
    else if (events.length === 0) drop("no-events");
    else if (!events.every((id) => read.has(id))) drop("unknown-event");
    else if (!events.some((id) => read.get(id) === f.standard)) drop("no-event-of-standard");
    else if (!HEDGE.test(f.hypothesis)) drop("not-a-hypothesis");
    else {
      const text = checkAiText(f.hypothesis, numbers, FINDING_TEXT_MAX);
      if (!text.ok) drop(`text-${text.problem}`);
      else if (findings.length >= FINDINGS_MAX) drop("too-many");
      else findings.push({ standard: f.standard, hypothesis: text.text, events });
    }
  }
  return { findings, dropped };
}

/**
 * The client for the findings, or null when the AI is off (no OPENROUTER_API_KEY; the model comes from AI_MODEL). In
 * development (never in a production build), AI_REVIEW_FAKE=sure or unsure gives the fake, for findings without a key.
 */
export function childProfileAiClient(env: Record<string, string | undefined> = process.env): AiClient | null {
  const fake = env.AI_REVIEW_FAKE;
  if (env.NODE_ENV !== "production" && (fake === "sure" || fake === "unsure")) return fakeChildProfileAi(fake);
  return aiClient(env);
}

/**
 * The findings of a profile's facts and the child's events that pass the checks, and what the checks dropped. Throws when
 * there are none to read: the request failed or took longer than `ms`, or the output does not match the schema.
 */
export async function writeChildProfileFindings(client: AiClient, profile: ChildLearnerProfile, events: readonly LearningEvent[], ms = CHILD_PROFILE_AI_MS) {
  const facts = childProfileAiFacts(profile, events);
  const output = await withTimeLimit(ms, (signal) => client.json({
    name: "child_profile_findings",
    system: SYSTEM,
    content: [{ type: "text", text: JSON.stringify(facts, null, 2) }],
    schema: CHILD_PROFILE_AI_SCHEMA,
    effort: "low",
  }, signal));
  return checkChildProfileAi(facts, output);
}
