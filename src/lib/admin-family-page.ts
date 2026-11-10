// The family and child pages' models (D-313, D-315): where a family is on the Families board's stages, what the team
// should do next, each child's latest test and plan, the family's timeline, and where one child's current workbook is
// on Production's stages. Pure: no network, database or clock (pass `now`). It invents no rule: the stages are the
// board's columns (admin-families-board.ts), the next steps are the dashboard's Needs you list and stage actions
// (admin-dashboard.ts), and the workbook stages are Production's (admin-production.ts).
import { STAGE_ACTION, activities, type Activity, type Dashboard, type Family, type FamilyTest } from "@/lib/admin-dashboard";
import { BOARD_COLUMNS, groupOf, type BoardColumnKey } from "@/lib/admin-families-board";
import { STAGES as BOOK_STAGES, STAGE_TEXT as BOOK_STAGE_TEXT, type Stage as BookStage } from "@/lib/admin-production";
import type { CardSetupRow } from "@/lib/admin-store";

export type StepState = "done" | "now" | "todo";

export interface JourneyStep {
  key: BoardColumnKey;
  label: string;
  state: StepState;
  /** When the family first reached the step, or null. */
  at: string | null;
}

/**
 * The family on the board's columns (Signed up to Customer). A waitlist or cancelled family is beside the columns, not
 * on them: `off` names that lane, and each step it reached shows as done.
 */
export function familyJourney(f: Pick<Family, "stage" | "reached">): { steps: JourneyStep[]; off: "Waitlist" | "Cancelled" | null } {
  const group = groupOf(f.stage);
  const now = BOARD_COLUMNS.findIndex((c) => c.key === group);
  const steps = BOARD_COLUMNS.map((c, i): JourneyStep => {
    const at = c.stages.map((s) => f.reached[s]).filter((x): x is string => !!x).sort()[0] ?? null;
    const state: StepState = now < 0 ? (at ? "done" : "todo") : i < now ? "done" : i === now ? "now" : "todo";
    return { key: c.key, label: c.label, state, at };
  });
  return { steps, off: f.stage === "waitlist" ? "Waitlist" : f.stage === "cancelled" ? "Cancelled" : null };
}

export interface NextStep { title: string; detail: string; tone: "warn" | "bad" | "info" }

/**
 * What the team should do for this family: the dashboard's Needs you items that hold it (real families only, as on
 * the dashboard), then the stage's own action as the calm line.
 */
export function familyNextSteps(f: Pick<Family, "id" | "stage">, needs: Dashboard["needs"]): { needs: NextStep[]; calm: string } {
  return {
    needs: needs.filter((n) => n.families.some((x) => x.id === f.id)).map(({ title, detail, tone }) => ({ title, detail, tone })),
    calm: STAGE_ACTION[f.stage],
  };
}

/** The child's newest test (by start), or null. */
export function latestTest(tests: readonly FamilyTest[], childId: string): FamilyTest | null {
  return tests.filter((t) => t.childId === childId).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
}

/** The child's card and plan in a few words, from the family's card setups. */
export function childPlan(cards: readonly Pick<CardSetupRow, "child_id" | "card_saved_at" | "updated_at" | "planStarted">[], childId: string): { tone: "ok" | "warn" | "muted"; text: string; savedAt: string | null } {
  const mine = cards.filter((c) => c.child_id === childId);
  const saved = mine.filter((c) => c.card_saved_at).sort((a, b) => b.card_saved_at!.localeCompare(a.card_saved_at!))[0];
  if (saved) {
    if (saved.planStarted === true) return { tone: "ok", text: "Card saved. Plan started.", savedAt: saved.card_saved_at };
    if (saved.planStarted === false) return { tone: "warn", text: "Card saved. No plan started yet.", savedAt: saved.card_saved_at };
    return { tone: "warn", text: "Card saved. Check the plan in Stripe.", savedAt: saved.card_saved_at };
  }
  if (mine.length) return { tone: "muted", text: "Opened the payment page. No card saved.", savedAt: null };
  return { tone: "muted", text: "No card yet.", savedAt: null };
}

/** The family's timeline, newest first: its signup, tests, payment steps and every email, without the family's name. */
export function familyTimeline(f: Family): Activity[] {
  return activities([f]).map((a) => ({ ...a, text: a.text.charAt(0).toUpperCase() + a.text.slice(1) }));
}

export interface BookStep { stage: BookStage; label: string; state: StepState }

/** Production's stages for one child's current book: the stages before it done, its own stage now, the rest to come. */
export function bookSteps(stage: BookStage): BookStep[] {
  const now = BOOK_STAGES.indexOf(stage);
  return BOOK_STAGES.map((s, i) => ({ stage: s, label: BOOK_STAGE_TEXT[s], state: i < now ? "done" : i === now ? "now" : "todo" }));
}
