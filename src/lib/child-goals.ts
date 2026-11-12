// Parent goals (D-325): right after signup, before the child's first test, the parent answers three select-one
// questions about the child (main goal, how the child feels about math, the math help the child gets now). The team
// reads them before the results call (admin child and family pages). Stored on public.children: learning_goal and
// math_feeling (the same columns the planner and the profiles read, src/lib/learning-style.ts) and math_help.
// Pure: no database, no clock. The server side is src/lib/child-goals-server.ts. Never sent to analytics.
import {
  feelingLabel,
  goalLabel,
  helpLabel,
  LEARNING_GOALS,
  MATH_FEELINGS,
  MATH_HELPS,
  SIGNUP_GOALS,
  type LearningGoal,
  type MathFeeling,
  type MathHelp,
} from "@/lib/learning-style";

export interface ChildGoals {
  goal: LearningGoal;
  feeling: MathFeeling;
  help: MathHelp;
}

/** The columns of public.children that hold the answers. */
export const GOAL_COLUMNS = "learning_goal, math_feeling, math_help";
export interface GoalColumns { learning_goal: string | null; math_feeling: string | null; math_help: string | null }

/** The three questions in the order the parent sees them. `{name}` is the child's first name. */
export const GOAL_QUESTIONS = [
  { key: "goal", question: "What is your main goal for {name} in math?", options: SIGNUP_GOALS },
  { key: "feeling", question: "How does {name} feel about math right now?", options: MATH_FEELINGS },
  { key: "help", question: "What math help does {name} get now, other than school?", options: MATH_HELPS },
] as const;

export type GoalKey = (typeof GOAL_QUESTIONS)[number]["key"];

const ids = (list: readonly { id: string }[]) => list.map((o) => o.id) as readonly string[];
const pick = <T extends string>(list: readonly { id: string }[], v: unknown): T | null =>
  typeof v === "string" && ids(list).includes(v) ? (v as T) : null;

/** The answers from a request body, or null when any answer is missing or not one of the offered options. */
export function cleanGoals(body: unknown): ChildGoals | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  // The signup offers no keep_up, so the request may not send it.
  const goal = pick<LearningGoal>(SIGNUP_GOALS, b.goal);
  const feeling = pick<MathFeeling>(MATH_FEELINGS, b.feeling);
  const help = pick<MathHelp>(MATH_HELPS, b.help);
  return goal && feeling && help ? { goal, feeling, help } : null;
}

/** The stored columns as answers. Each answer is null when not given (or a value this code does not know). */
export function goalsFromRow(row: { learning_goal: string | null; math_feeling: string | null; math_help: string | null }) {
  return {
    goal: pick<LearningGoal>(LEARNING_GOALS, row.learning_goal),
    feeling: pick<MathFeeling>(MATH_FEELINGS, row.math_feeling),
    help: pick<MathHelp>(MATH_HELPS, row.math_help),
  };
}

/** The answers as label and value rows for the admin pages, "No answer" where the parent gave none. */
export function goalFacts(row: { learning_goal: string | null; math_feeling: string | null; math_help: string | null }): [string, string][] {
  const g = goalsFromRow(row);
  return [
    ["Main goal", g.goal ? goalLabel(g.goal) : "No answer"],
    ["Feeling about math", g.feeling ? feelingLabel(g.feeling) : "No answer"],
    ["Math help now", g.help ? helpLabel(g.help) : "No answer"],
  ];
}

/**
 * Whether a child must answer before the test (D-325): a child with any of the three answers missing and no test yet.
 * A child who already has a test (any status) is never asked, so a family from before D-325 and a test in progress are
 * not stopped.
 */
export function needsGoals(child: { learning_goal: string | null; math_feeling: string | null; math_help: string | null }, hasTest: boolean): boolean {
  if (hasTest) return false;
  const g = goalsFromRow(child);
  return !g.goal || !g.feeling || !g.help;
}

/** Where the goals page sends the parent after the answers: a path on this site only, else Parent home. */
export function goalsNext(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/account";
  return next;
}

/** The goals page for a signup or a new child, then `next`. */
export const goalsPath = (next: string, child?: string) =>
  `/account/goals?${child ? `child=${encodeURIComponent(child)}&` : ""}next=${encodeURIComponent(next)}`;
