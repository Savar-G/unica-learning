import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { markedFamily } from "@/lib/scan-pages-access";
import { isUuid } from "@/lib/workbook-content";

/**
 * Who may use automatic marking and the scan steps that feed it (Send, the photo checks, the stack's `checks`).
 * One rule, read on every call; see docs/scan-pages.md, "Families mode". SCAN_PAGES_ENABLED and browser claims
 * cannot grant it. Reasons are for server code and logs only; never show them to a parent.
 */
export type Env = Readonly<Record<string, string | undefined>>;

/** The marking switch. Only the exact values `test-only` and `families` turn it on; anything else is off. */
export function markingMode(env: Env) {
  const value = env.SCAN_MARKING_ENABLED;
  return value === "test-only" || value === "families" ? value : "off" as const;
}

/** The shared stored child-plan gate's contract (owned by the parent dashboard, `src/lib/plan-access.ts`). */
export type ChildPlanReason = "open" | "ending_until_end" | "no_plan" | "ended" | "payment_failed" | "paused" | "unknown" | "read_failed";
export type ChildPlanAccess = (input: { parentId: string; childId: string }) => Promise<{ open: boolean; reason: ChildPlanReason }>;
const PLAN_REASONS: readonly ChildPlanReason[] = ["open", "ending_until_end", "no_plan", "ended", "payment_failed", "paused", "unknown", "read_failed"];

// TODO(plan-access): replace with `childPlanAccess` from `@/lib/plan-access` once the dashboard's gate is on main.
// Until then no real family's plan reads as running, so families mode admits only test families and admins.
export const childPlanAccess: ChildPlanAccess = async () => ({ open: false, reason: "unknown" });

/** Where the work happens: the child named by the page, or the child that owns the photo. */
export type MarkingScope = Readonly<{ child: string }> | Readonly<{ photo: string }>;
export type MarkingAccessReason = "off" | "test_family" | "not_test_family" | "child_unknown" | ChildPlanReason;
export type MarkingDecision = Readonly<{ open: boolean; reason: MarkingAccessReason }>;

/** null: the list is absent. false: present and malformed, which refuses everyone. Never exposes the identities. */
function testParentList(env: Env): Set<string> | null | false {
  const configured = env.SCAN_MARKING_TEST_PARENT_IDS;
  if (configured === undefined) return null;
  // At most 100 canonical UUIDs and 99 commas.
  if (!configured.length || configured.length > 3699) return false;
  const ids = configured.split(",");
  if (ids.length > 100 || ids.some(id => id.length !== 36 || !isUuid(id))) return false;
  const unique = new Set(ids.map(id => id.toLowerCase()));
  return unique.size === ids.length ? unique : false;
}

async function scopedChild(db: SupabaseClient<Database>, parent: string, scope: MarkingScope | undefined): Promise<string | null> {
  if (!scope) return null;
  if ("child" in scope) return isUuid(scope.child) ? scope.child : null;
  if (!isUuid(scope.photo)) return null;
  try {
    const row = await db.from("scan_photos").select("child_id").eq("id", scope.photo).eq("parent_id", parent).maybeSingle();
    return !row.error && row.data && isUuid(row.data.child_id) ? row.data.child_id : null;
  } catch { return null; }
}

/** Open only for an explicit running answer. Anything else, including a throw or an odd shape, is closed. */
async function planDecision(plan: ChildPlanAccess, parentId: string, childId: string): Promise<MarkingDecision> {
  let answer: unknown;
  try { answer = await plan({ parentId, childId }); } catch { return { open: false, reason: "read_failed" }; }
  const a = answer && typeof answer === "object" ? answer as { open?: unknown; reason?: unknown } : null;
  const reason = a && PLAN_REASONS.includes(a.reason as ChildPlanReason) ? a.reason as ChildPlanReason : "unknown";
  return { open: a?.open === true && (reason === "open" || reason === "ending_until_end"), reason };
}

/** The one rule. A test family or admin (only listed ones when a list applies); in families mode also a real family for a child whose plan is running. */
async function admission(db: SupabaseClient<Database>, parent: string, families: boolean, list: Set<string> | null,
  scope: MarkingScope | undefined, plan: ChildPlanAccess): Promise<MarkingDecision> {
  if ((list === null || list.has(parent.toLowerCase())) && await markedFamily(parent, db)) return { open: true, reason: "test_family" };
  if (!families) return { open: false, reason: "not_test_family" };
  const child = await scopedChild(db, parent, scope);
  if (!child) return { open: false, reason: "child_unknown" };
  return planDecision(plan, parent, child);
}

/** Automatic marking and its reads. Off unless the switch is on; SCAN_MARKING_TEST_PARENT_IDS limits test families and admins. */
export async function markingDecision(db: SupabaseClient<Database>, parent: string, env: Env = process.env,
  scope?: MarkingScope, plan: ChildPlanAccess = childPlanAccess): Promise<MarkingDecision> {
  const mode = markingMode(env);
  if (mode === "off") return { open: false, reason: "off" };
  const list = testParentList(env);
  if (list === false) return { open: false, reason: "off" };
  return admission(db, parent, mode === "families", list, scope, plan);
}

export async function markingAccess(db: SupabaseClient<Database>, parent: string, env: Env = process.env,
  scope?: MarkingScope, plan: ChildPlanAccess = childPlanAccess) {
  return (await markingDecision(db, parent, env, scope, plan)).open;
}

/**
 * Send, the photo checks (preview and calibration) and the stack's `checks` (D-252). Off and test-only: test
 * families and admins, whatever the parent list says, as before. Families mode: the same rule as marking for
 * real families.
 */
export async function scanChecksDecision(db: SupabaseClient<Database>, parent: string, env: Env = process.env,
  scope?: MarkingScope, plan: ChildPlanAccess = childPlanAccess): Promise<MarkingDecision> {
  const families = markingMode(env) === "families";
  // A malformed list closes marking in every mode; in families mode it closes these steps too, so they cannot disagree.
  if (families && testParentList(env) === false) return { open: false, reason: "off" };
  return admission(db, parent, families, null, scope, plan);
}

export async function scanChecksAccess(db: SupabaseClient<Database>, parent: string, env: Env = process.env,
  scope?: MarkingScope, plan: ChildPlanAccess = childPlanAccess) {
  return (await scanChecksDecision(db, parent, env, scope, plan)).open;
}
