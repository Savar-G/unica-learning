import type { SkillState } from "@/lib/assessment/skill-state";

// The four words a parent reads for a skill's state (D-254), for the server page and the browser's skill map.

export const STATE_ORDER: readonly SkillState[] = ["mastered", "working_on", "needs_review", "not_started"];
export const STATE_WORD: Record<SkillState, string> = { mastered: "Mastered", working_on: "Working on", needs_review: "Needs review", not_started: "Not started" };
