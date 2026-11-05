import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { Database } from "@/lib/database";
import { sendEmail } from "@/lib/email-delivery";
import type { AttemptClaim, FamilyDeleteStore, FamilyPlans } from "@/lib/family-delete";
import { familyStripeCustomers, runFamilyDeletion } from "@/lib/family-deletion-store";
import { runningPlans, stopPlanNow } from "@/lib/stripe";
import { adminClient } from "@/lib/supabase-auth";

// The self-serve delete's seams for the live site (#556): the database functions of migrations family_delete_self_serve and family_delete_hold,
// and Stripe with the site's key. The deletion worker's restricted key has no subscription write, so plans stop here.

const CHECKS = ["ready", "busy", "plan_start", "protected", "missing"] as const;
const HOLDS = ["held", "busy", "plan_start", "protected", "missing"] as const;
const REQUESTS = ["requested", "busy", "plan_start", "protected", "missing"] as const;

function answer<T extends string>(data: unknown, allowed: readonly T[]): T {
  if (!allowed.includes(data as T)) throw new Error("Family delete: unexpected answer");
  return data as T;
}

export function supabaseDeleteStore(db: SupabaseClient<Database>): FamilyDeleteStore {
  return {
    async claimAttempt(parent, now, policy): Promise<AttemptClaim> {
      const { data, error } = await db.rpc("claim_family_delete_attempt", {
        p_parent: parent, p_now: new Date(now).toISOString(), p_max: policy.maxAttempts, p_lock_seconds: Math.ceil(policy.lockMs / 1000),
      });
      if (error) throw new Error(`Family delete claim: ${error.code}`);
      const row = data[0];
      const lockedUntil = row?.out_locked_until ? Date.parse(row.out_locked_until) : null;
      if (row?.out_status === "locked" && lockedUntil !== null) return { kind: "locked", until: lockedUntil };
      if (row?.out_status === "open") return { kind: "open", attemptsLeft: row.out_attempts_left, lockedUntil };
      throw new Error("Family delete claim: unexpected answer");
    },
    async clearAttempts(parent) {
      const { error } = await db.rpc("clear_family_delete_attempts", { p_parent: parent });
      if (error) throw new Error(`Family delete clear: ${error.code}`);
    },
    async check(parent) {
      const { data, error } = await db.rpc("check_parent_family_deletion", { p: parent });
      if (error) throw new Error(`Family delete check: ${error.code}`);
      return answer(data, CHECKS);
    },
    async hold(parent, token) {
      const { data, error } = await db.rpc("begin_family_delete_hold", { p: parent, hold: token });
      if (error) throw new Error(`Family delete hold: ${error.code}`);
      return answer(data, HOLDS);
    },
    async release(parent, token) {
      const { error } = await db.rpc("end_family_delete_hold", { p: parent, hold: token });
      if (error) throw new Error(`Family delete release: ${error.code}`);
    },
    async request(parent, token) {
      const { data, error } = await db.rpc("request_parent_family_deletion_held", { p: parent, hold: token });
      if (error) throw new Error(`Family delete request: ${error.code}`);
      return answer(data, REQUESTS);
    },
  };
}

export function stripeFamilyPlans(db: SupabaseClient<Database>, s: Stripe): FamilyPlans {
  return {
    customers: (parent) => familyStripeCustomers(db, s, parent),
    running: (customer) => runningPlans(s, customer),
    stop: (plan) => stopPlanNow(s, plan),
  };
}

/**
 * Tells the team, so that no further workbook is prepared or mailed. It names no child. The family's id is there only
 * when the deletion did not finish, because the team may need to look at the family.
 */
export async function familyDeleteAlert(parent: string, { plansStopped, state }: { plansStopped: number; state: "deleted" | "queued" | "not_queued" | "plan_start" }) {
  const to = process.env.SIGNUP_NOTIFY_EMAIL;
  if (!to) return;
  const stateLine = {
    deleted: "The family's data is deleted, and the copy without names is written.",
    queued: "The deletion is queued. The daily job finishes it.",
    not_queued: "The deletion is NOT queued, and the family's data is all there. The parent was asked to try again.",
    plan_start: "The deletion is NOT queued, and the family's data is all there. A plan start for this family has an unknown outcome. The parent was told that the team must finish it first. It ends when the plan shows up in Stripe, or when an admin closes it on the card under /admin/next-steps. The parent then has to ask again.",
  }[state];
  try {
    const outcome = await sendEmail({
      sender: { to: "savar" }, to, subject: state === "not_queued" || state === "plan_start" ? "Family delete not finished" : "Family deleted from Account",
      text: [`A parent asked to delete their family from Account.`, `Plans stopped: ${plansStopped}`, stateLine, "Do not prepare or mail another workbook for this family.",
        ...(state === "deleted" ? [] : [`Family: ${parent}`])].join("\n"),
    });
    if (outcome.status !== "sent") console.error("[family-delete] alert failed", outcome.status);
  } catch (e) {
    console.error("[family-delete] alert failed", e instanceof Error ? e.message : "failed");
  }
}

/**
 * The deletion itself, after the answer has gone. The request is saved, so a failure here costs nothing: the daily job
 * picks the family up from the queue, as it does for an admin's request.
 */
export async function finishFamilyDelete(parent: string, plansStopped: number) {
  let state: "deleted" | "queued" = "queued";
  try {
    const worker = adminClient(AbortSignal.timeout(45_000));
    const control = adminClient(AbortSignal.timeout(55_000));
    if (worker && control && (await runFamilyDeletion(worker, parent, control)).state === "deleted") state = "deleted";
  } catch (e) {
    console.error("[family-delete] deletion left for the daily job", e instanceof Error ? e.message : "failed");
  }
  await familyDeleteAlert(parent, { plansStopped, state });
}
