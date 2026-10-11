import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteFamily, type FamilyDeletionStore, type RetentionCardState } from "@/lib/assessment";
import { stripe } from "@/lib/stripe";
import { WORK_BUCKET } from "@/lib/work-store";

/** Missing migration permits the existing card path, but no other failure does. Deletion itself never falls back. */
export async function beginCardOperation(db: SupabaseClient, parent: string, token: string): Promise<boolean> {
  const { error } = await db.rpc("begin_family_card_operation", { p: parent, token });
  if (error?.code === "PGRST202") return false;
  if (error) throw new Error("Card operation unavailable");
  return true;
}

export async function endCardOperation(db: SupabaseClient, token: string): Promise<void> {
  const { error } = await db.rpc("end_family_card_operation", { token });
  if (error) console.error("[deletion] card hold release failed", error.code);
}

async function rpc<T>(db: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(`Deletion dependency: ${name} (${error.code})`);
  return data as T;
}

/** Stable keyset RPC paging, including jobs whose Auth deletion succeeded before the worker stopped. */
export async function deletionCandidates(db: SupabaseClient): Promise<string[]> {
  const ids: string[] = [];
  let after: string | null = null;
  for (;;) {
    const page: { parent_id: string }[] = await rpc(db, "family_deletion_candidates", { after_id: after, page_size: 100 });
    if (page.length === 0) return ids;
    ids.push(...page.map((r) => r.parent_id));
    const next = page.at(-1)!.parent_id;
    if (next === after) throw new Error("Deletion pagination did not advance");
    after = next;
  }
}

/** Run only after the family is frozen and all app card operations have finished. Expire every open Checkout
 * before deciding: a succeeded setup, a saved method, a subscription, or uncertainty keeps the family. */
async function cardState(db: SupabaseClient, parent: string): Promise<RetentionCardState> {
  const customers: string[] = [];
  for (let from = 0; ; from += 100) {
    const { data, error } = await db.from("card_setups").select("id, stripe_customer_id, card_saved_at")
      .eq("parent_id", parent).order("id").range(from, from + 99);
    if (error) return "unknown";
    if (data.some((r) => r.card_saved_at)) return "saved";
    customers.push(...data.flatMap((r) => r.stripe_customer_id ? [r.stripe_customer_id as string] : []));
    if (data.length < 100) break;
  }
  if (!customers.length) return "clear";
  const s = stripe();
  if (!s) return "unknown";
  try {
    for (const customer of customers) {
      for await (const session of s.checkout.sessions.list({ customer, limit: 100 })) {
        if (session.status === "open") {
          try { await s.checkout.sessions.expire(session.id); }
          catch {
            const current = await s.checkout.sessions.retrieve(session.id);
            if (current.status !== "expired") return "saved";
          }
        }
        if (session.status === "complete") return "saved";
      }
      for await (const intent of s.setupIntents.list({ customer, limit: 100 })) {
        if (intent.status === "succeeded") return "saved";
        if (intent.status === "processing") return "unknown";
      }
      for await (const method of s.paymentMethods.list({ customer, limit: 100 })) {
        if (method.id) return "saved";
      }
      for await (const subscription of s.subscriptions.list({ customer, status: "all", limit: 100 })) {
        if (subscription.id) return "saved";
      }
    }
    return "clear";
  } catch { return "unknown"; }
}

function deletionStore(db: SupabaseClient, parent: string, token: string): FamilyDeletionStore {
  const args = { p: parent, token };
  return {
    async renew() {
      if (!await rpc<boolean>(db, "renew_family_deletion", args)) throw new Error("Deletion lease lost");
    },
    async listImages(prefix, offset, limit) {
      const { data, error } = await db.storage.from(WORK_BUCKET).list(prefix, { limit, offset, sortBy: { column: "name", order: "asc" } });
      if (error || !data) throw new Error("Storage listing failed");
      return data.map((r) => ({ name: r.name, folder: r.id === null }));
    },
    async removeImages(paths) {
      const { error } = await db.storage.from(WORK_BUCKET).remove(paths);
      if (error) throw new Error("Storage removal failed");
    },
    async removeAuth() {
      const { error } = await db.auth.admin.deleteUser(parent);
      if (error && error.code !== "user_not_found") throw new Error("Auth removal failed");
    },
    async complete() {
      if (!await rpc<boolean>(db, "complete_family_deletion", args)) throw new Error("Deletion verification failed");
    },
  };
}

export type FamilyDeletionResult = { state: "deleted"; images: number } | { state: "busy" | "excluded" };

/** An explicit request and the scheduled job share the same durable, retryable process. No analytics or email. */
export async function runFamilyDeletion(db: SupabaseClient, parent: string): Promise<FamilyDeletionResult> {
  const token = randomUUID();
  const args = { p: parent, token };
  const claim = await rpc<{ state: "ready" | "busy" | "excluded"; reason?: "request" | "retention"; phase?: "checking" | "deleting" }>(db, "claim_family_deletion", args);
  if (claim.state !== "ready") return { state: claim.state };
  try {
    if (claim.phase === "checking") {
      const keep = claim.reason === "retention" && await cardState(db, parent) !== "clear";
      if (!await rpc<boolean>(db, "decide_family_deletion", { ...args, keep_family: keep })) throw new Error("Deletion decision lost");
      if (keep) return { state: "excluded" };
    }
    return { state: "deleted", ...await deleteFamily(deletionStore(db, parent, token), parent) };
  } finally {
    // No fence is removed on failure. Another run resumes after release (or lease expiry after a crash).
    await rpc(db, "release_family_deletion", args);
  }
}
