// What the parent's report shows from the learner profile (#198, spec #181 stories 5, 6 and 9, D-120, D-121):
// strengths; struggles, each with one real wrong answer and the likely cause; and the workbook 1 preview. One pure
// function over the stored profile, with or without its AI parts (#197), so the account report, the report email, the
// admin report view and the sample report show the same thing. It keeps only what a parent sees: never the test
// behaviour, the full error list, how to help or the model ids (admin only, spec #181).
import { MISCONCEPTIONS, type MisconceptionId } from "./misconceptions";
import type { LearnerProfile, PlanPart, ProfileAi, ProfileStruggle, Tally } from "./profile";
import { BC_SKILL_MAP } from "./skill-map";
import type { Certainty } from "./certainty";
import type { Level, StrandStatus } from "./types";

/** A BC standard as the parent reads it: its code, its exact BC text and the grade where BC teaches it. */
export interface FindingTopic {
  code: string;
  text: string;
  grade: Level;
}

/** A standard the test measured, with its result and how sure it is. */
export interface FindingStandard extends FindingTopic, Tally {
  certainty: Certainty;
}

/** A secure standard. `aboveGrade`: taught after the child's school grade. */
export interface StrengthFinding extends FindingStandard {
  aboveGrade: boolean;
}

/**
 * The likely cause of a struggle: the AI's text when it wrote one (#197; REPORT_TEXT_NAME stands for the child), else
 * the plain description of the known mistake the shown answer matches.
 */
export type LikelyCause = { source: "ai"; text: string } | { source: "misconception"; text: string };

/** A standard at or below the school grade that is not secure, with one real wrong answer. */
export interface StruggleFinding extends FindingStandard {
  status: Exclude<StrandStatus, "secure">;
  /** One wrong answer, as the child gave it: the first that matches a known mistake, else the first. */
  answer: { prompt: string; response: string; rightAnswer: string };
  /** Null when the AI wrote none and the answer matches no known mistake: the report never guesses. */
  cause: LikelyCause | null;
}

/** The most standards the preview names for the focus, and for the challenge: a sentence, not a list. */
export const PREVIEW_TOPICS_MAX = 3;

/**
 * The workbook 1 preview (spec story 9): "Workbook 1 focuses on X. We will challenge {child} on Y." From the AI's
 * workbook plan (#197): the focus is what it practises, else what it reviews; the challenge is its stretch. A part with
 * no share of the workbook is not in it. Text only, no workbook pages.
 */
export interface WorkbookPreview {
  focus: FindingTopic[];
  /** Empty when the plan stretches nothing. */
  challenge: FindingTopic[];
}

/** What the parent's report shows from the profile. */
export interface ReportFindings {
  strengths: StrengthFinding[];
  struggles: StruggleFinding[];
  /** Null without the AI's workbook plan (the AI is off or failed, or the report email went before it wrote), or when it names nothing. */
  preview: WorkbookPreview | null;
}

// Every standard of the map: a Grade 9 child's plan names grade 9 standards (D-158). A Grade 7 or 8 child's plan cannot
// (D-153 rule 2): the plan keeps only standards the AI read, and none of those is grade 9 for them (profile-ai.ts).
const STANDARDS = new Map(BC_SKILL_MAP.standards.map((s) => [s.code, s]));
const SURE: Record<Certainty, number> = { clear: 0, "early-sign": 1 };
const known = (id: string | null) => (id ? MISCONCEPTIONS[id as MisconceptionId] : undefined);

function struggleFinding(s: ProfileStruggle, ai: ProfileAi | undefined): StruggleFinding {
  const shown = s.wrong.find((w) => known(w.misconception)) ?? s.wrong[0];
  const mistake = known(shown.misconception);
  const written = ai?.likelyCauses?.value[s.code];
  return {
    code: s.code,
    text: s.text,
    grade: s.grade,
    correct: s.correct,
    total: s.total,
    certainty: s.certainty,
    status: s.status as StruggleFinding["status"],
    answer: { prompt: shown.prompt, response: shown.response, rightAnswer: shown.rightAnswer },
    cause: written ? { source: "ai", text: written } : mistake ? { source: "misconception", text: mistake.description } : null,
  };
}

/** The standards of one part of the plan, by code and text; none when the part has no share of the workbook. */
const topics = (part: PlanPart): FindingTopic[] =>
  part.percent > 0 ? part.standards.flatMap((code) => {
    const s = STANDARDS.get(code);
    return s ? [{ code, text: s.text, grade: s.grade }] : [];
  }) : [];

function previewOf(ai: ProfileAi | undefined): WorkbookPreview | null {
  const plan = ai?.workbookPlan?.value;
  if (!plan) return null;
  const practise = topics(plan.practise);
  const focus = (practise.length ? practise : topics(plan.review)).slice(0, PREVIEW_TOPICS_MAX);
  const challenge = topics(plan.stretch).filter((t) => !focus.some((f) => f.code === t.code)).slice(0, PREVIEW_TOPICS_MAX);
  return focus.length || challenge.length ? { focus, challenge } : null;
}

/** The parent's part of a learner profile. */
export function reportFindings(profile: LearnerProfile): ReportFindings {
  return {
    // The clear ones first, as they rest on more answers; then the latest taught, the profile's curriculum order within a grade.
    strengths: [...profile.strengths]
      .sort((a, b) => SURE[a.certainty] - SURE[b.certainty] || b.grade - a.grade)
      .map(({ code, text, grade, aboveGrade, correct, total, certainty }) => ({ code, text, grade, aboveGrade, correct, total, certainty })),
    // A struggle always has a scored wrong answer: under the secure share, at least one answer is wrong. The clear ones
    // first, then the profile's order (needs attention, then developing). The sort is stable.
    struggles: profile.struggles
      .filter((s) => s.wrong.length > 0)
      .sort((a, b) => SURE[a.certainty] - SURE[b.certainty])
      .map((s) => struggleFinding(s, profile.ai)),
    preview: previewOf(profile.ai),
  };
}
