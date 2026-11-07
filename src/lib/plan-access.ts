import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { ParentPlan } from "@/lib/parent-plan";
import { planFromColumns, type PlanColumns } from "@/lib/plan-state";
import { adminClient } from "@/lib/supabase-auth";

// The one gate between a child's stored plan (child_plan_states) and the product. The action that starts the free month
// (the admin's "Workbook delivered: start free month") opens it, and it closes when the plan stops. No switch is involved.
//
// Open: free_month, paying, and ending until its end date. Closed: everything else, a kind the code does not know, a row
// that does not fit its kind, and any failed read. Nothing here asks Stripe: the webhook, the start route and the card
// sweep keep the row (src/lib/plan-state.ts), so a later payment that makes a plan run reopens this on its next read.
//
// This file does not say who sees what. Each feature adds its own switches beside this gate (scan-pages-access.ts,
// parent-dashboard-access.ts, maya-chat-server.ts, parent-problem-explanation-server.ts).

export type PlanAccessReason = "open" | "ending_until_end" | "no_plan" | "ended" | "payment_failed" | "paused" | "unknown" | "read_failed";
export interface PlanAccess { open: boolean; reason: PlanAccessReason }
export interface PlanAccessDeps {
  /** The database client with the secret key. Unset uses the site's. Null, or a site with no key, reads as read_failed. */
  db?: SupabaseClient<Database> | null;
  now?: () => number;
}

const READ_FAILED: PlanAccess = { open: false, reason: "read_failed" };
const COLUMNS = "kind, next_charge_at, ends_at, monthly_cents, ending_free";

/** The rule, on a plan as parentPlan and planFromColumns give it. Null is a child with no row. */
export function planAccessRule(plan: ParentPlan | null | undefined, now: number): PlanAccess {
  switch (plan?.kind) {
    case undefined:
    case "not_started": return { open: false, reason: "no_plan" };
    case "free_month":
    case "paying": return { open: true, reason: "open" };
    case "ending": {
      const end = plan.endsOn ? Date.parse(plan.endsOn) : Number.NaN;
      if (Number.isNaN(end)) return { open: false, reason: "unknown" };
      return now < end ? { open: true, reason: "ending_until_end" } : { open: false, reason: "ended" };
    }
    case "ended":
    case "payment_failed":
    case "paused": return { open: false, reason: plan.kind };
    default: return { open: false, reason: "unknown" };
  }
}

const clientOf = (deps: PlanAccessDeps) => (deps.db === undefined ? adminClient() : deps.db);
const ruleOfRow = (row: PlanColumns, now: number) => planAccessRule(planFromColumns(row) ?? { kind: "unknown" }, now);

/** One child of one family. Another family's child reads as no_plan. Never throws: a failed read is closed, with read_failed. */
export async function childPlanAccess(input: { parentId: string; childId: string }, deps: PlanAccessDeps = {}): Promise<PlanAccess> {
  try {
    const db = clientOf(deps);
    if (!db) return READ_FAILED;
    const { data, error } = await db.from("child_plan_states").select(COLUMNS).eq("child_id", input.childId).eq("parent_id", input.parentId).maybeSingle();
    if (error) return READ_FAILED;
    return data ? ruleOfRow(data, deps.now?.() ?? Date.now()) : { open: false, reason: "no_plan" };
  } catch {
    return READ_FAILED;
  }
}

/** Each stored child of the family, with its answer. Null when the read fails. */
async function familyRows(parentId: string, deps: PlanAccessDeps): Promise<{ childId: string; access: PlanAccess }[] | null> {
  try {
    const db = clientOf(deps);
    if (!db) return null;
    const { data, error } = await db.from("child_plan_states").select(`child_id, ${COLUMNS}`).eq("parent_id", parentId);
    if (error) return null;
    const now = deps.now?.() ?? Date.now();
    return data.map((row) => ({ childId: row.child_id, access: ruleOfRow(row, now) }));
  } catch {
    return null;
  }
}

/** Any child of the family. Closed, it names a stopped plan before a child with none. Never throws. */
export async function familyPlanAccess(input: { parentId: string }, deps: PlanAccessDeps = {}): Promise<PlanAccess> {
  const rows = await familyRows(input.parentId, deps);
  if (!rows) return READ_FAILED;
  return rows.find((r) => r.access.open)?.access ?? rows.find((r) => r.access.reason !== "no_plan")?.access ?? { open: false, reason: "no_plan" };
}

/** The children of the family whose plan is open. Empty when the read fails. */
export async function familyOpenPlanChildren(input: { parentId: string }, deps: PlanAccessDeps = {}): Promise<ReadonlySet<string>> {
  return new Set((await familyRows(input.parentId, deps) ?? []).filter((r) => r.access.open).map((r) => r.childId));
}

/**
 * Whether this family has or had a plan, open or closed, for the pages and routes that must stay reachable when the gate is
 * closed: a family with a failed payment must still reach its card. A saved card alone is not a plan. A start with no plan
 * row yet counts: its record says that Stripe has, or may still make, a plan that can charge the card. False when both reads fail.
 */
export async function familyHasPlanHistory(input: { parentId: string }, deps: PlanAccessDeps = {}): Promise<boolean> {
  try {
    const db = clientOf(deps);
    if (!db) return false;
    const states = await db.from("child_plan_states").select("kind").eq("parent_id", input.parentId);
    if (!states.error && states.data.some((row) => row.kind !== "not_started")) return true;
    const starts = await db.from("plan_starts").select("state").eq("parent_id", input.parentId).in("state", ["open", "started", "other"]).limit(1);
    return !starts.error && starts.data.length > 0;
  } catch {
    return false;
  }
}

/** Why a family with a plan is closed, for the words a parent reads. `child` is set only when one child has a stopped plan. */
export interface ClosedPlan { reason: PlanAccessReason; child: string | null }

/**
 * A family with a stopped plan and no child open now, for the note a parent reads. Two children's plans that stopped in different
 * ways read as unknown. Null with an open plan, with no plan, when the plan read fails, and for a started plan with no row yet:
 * access stays closed then, but Stripe's live line says "Free month", so no note says otherwise. A failed read of the name only
 * leaves the name out.
 */
export async function familyClosedPlan(input: { parentId: string }, deps: PlanAccessDeps = {}): Promise<ClosedPlan | null> {
  const rows = await familyRows(input.parentId, deps);
  if (!rows || rows.some((r) => r.access.open)) return null;
  const stopped = rows.filter((r) => r.access.reason !== "no_plan");
  if (stopped.length === 0) return null;
  const reasons = new Set(stopped.map((r) => r.access.reason));
  const reason: PlanAccessReason = reasons.size === 1 ? stopped[0].access.reason : "unknown";
  if (stopped.length !== 1) return { reason, child: null };
  try {
    const { data } = await clientOf(deps)!.from("children").select("first_name").eq("id", stopped[0].childId).eq("parent_id", input.parentId).maybeSingle();
    return { reason, child: data?.first_name ?? null };
  } catch {
    return { reason, child: null };
  }
}
