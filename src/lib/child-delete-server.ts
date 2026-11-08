import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { Database, Json } from "@/lib/database";
import { deleteChild, type ChildDeletionStore } from "@/lib/child-delete";
import { supabaseDeleteStore } from "@/lib/family-delete-server";
import type { FamilyDeleteStore, FamilyPlans } from "@/lib/family-delete";
import { runningPlans, stopPlanNow } from "@/lib/stripe";
import { FAMILY_BUCKETS, type FamilyBucket } from "@/lib/assessment/deletion";

export function childDeleteStore(db: SupabaseClient<Database>, child: string): FamilyDeleteStore {
  const family = supabaseDeleteStore(db);
  return {
    ...family,
    async check(parent) {
      const { data, error } = await db.rpc("check_child_deletion", { p: parent, c: child });
      if (error || !["ready", "busy", "missing"].includes(data)) throw Error("Child delete check unavailable");
      return data as "ready" | "busy" | "missing";
    },
    async hold(parent, token) {
      // Recheck the child's pending starts under the shared parent lock before taking the hold.
      const checked = await this.check(parent);
      if (checked !== "ready") return checked;
      return family.hold(parent, token);
    },
    async request(parent, token) {
      const { data, error } = await db.rpc("request_child_deletion_held", { p: parent, c: child, hold: token });
      if (error || !["requested", "busy", "missing"].includes(data)) throw Error("Child delete request unavailable");
      return data as "requested" | "busy" | "missing";
    },
  };
}

/** Only this child's Customer. A shared or unresolved Customer cannot safely be stopped for one child. */
export function childDeletePlans(db: SupabaseClient<Database>, s: Stripe, child: string): FamilyPlans {
  return {
    async customers(parent) {
      const { data: cards, error } = await db.from("card_setups").select("stripe_customer_id, card_saved_at").eq("parent_id", parent).eq("child_id", child);
      if (error || !cards || cards.some(c => c.card_saved_at && !c.stripe_customer_id)) throw Error("Child customer unresolved");
      const customers = [...new Set(cards.flatMap(c => c.stripe_customer_id ? [c.stripe_customer_id] : []))];
      for (const customer of customers) {
        const { data: others, error: shared } = await db.from("card_setups").select("child_id").eq("stripe_customer_id", customer).neq("child_id", child).limit(1);
        if (shared || !others || others.length) throw Error("Child customer shared");
      }
      // Old bookings do not name a child. Refuse rather than stop a sibling's historical plan.
      const { data: bookings, error: bookingError } = await db.from("booking_family_links").select("signup_id").eq("parent_id", parent).limit(1);
      if (bookingError || !bookings || bookings.length) throw Error("Historical booking needs support");
      return customers;
    },
    running: customer => runningPlans(s, customer),
    stop: plan => stopPlanNow(s, plan),
  };
}

export async function runChildDeletion(db: SupabaseClient<Database>, parent: string, child: string): Promise<"deleted" | "pending"> {
  const token = randomUUID();
  const args = { p: parent, c: child, token };
  const claim = await db.rpc("claim_child_deletion", args);
  if (claim.error) throw Error("Child delete claim unavailable");
  if (!claim.data) return "pending";
  const store: ChildDeletionStore = {
    async renew() {
      const { error } = await db.rpc("assert_child_deletion_lease", args);
      if (error) throw Error("Child delete lease lost");
    },
    async copySources() {
      const { data, error } = await db.rpc("child_copy_sources", args);
      if (error || !Array.isArray(data)) throw Error("Child copy source unavailable");
      return data;
    },
    async saveCopy(test, copy) {
      const { data, error } = await db.rpc("save_family_test_copy", { p: parent, token, test_id: test, test_copy: copy as unknown as Json });
      if (error || typeof data !== "boolean") throw Error("Child copy failed");
      return data;
    },
    async confirmCopies() {
      const { data, error } = await db.rpc("confirm_child_copies", args);
      if (error) throw Error("Child copy check failed");
      return data === true;
    },
    async roots() {
      await this.renew();
      const { data, error } = await db.rpc("child_delete_roots", { p: parent, c: child });
      if (error || !data || data.some(r => !FAMILY_BUCKETS.includes(r.bucket as FamilyBucket) || !new RegExp(`^${parent}/[0-9a-f-]{36}$`).test(r.prefix))) throw Error("Child file scope unavailable");
      return data.map(r => ({ bucket: r.bucket as FamilyBucket, prefix: r.prefix }));
    },
    async listImages(prefix, offset, limit, bucket) {
      const { data, error } = await db.storage.from(bucket).list(prefix, { offset, limit, sortBy: { column: "name", order: "asc" } });
      if (error || !data) throw Error("Child files unavailable");
      return data.map(r => ({ name: r.name, folder: r.id === null }));
    },
    async removeImages(paths, bucket) {
      const { error } = await db.storage.from(bucket).remove(paths);
      if (error) throw Error("Child files not removed");
    },
    async complete() {
      const { data, error } = await db.rpc("complete_child_deletion", args);
      if (error || data !== true) throw Error("Child delete not complete");
    },
  };
  try {
    await deleteChild(store);
    return "deleted";
  } finally {
    const { error } = await db.rpc("release_child_deletion", args);
    if (error) console.error("[child-delete] release failed", error.code);
  }
}

/** Retry the oldest attempted requests first. A timeout keeps the durable fence and lease for the next run. */
export async function retryChildDeletions(db: SupabaseClient<Database>, deadline: number) {
  const counts = { deleted: 0, pending: 0, failed: 0 };
  const { data, error } = await db.from("child_deletions").select("parent_id,child_id").order("lease_until", { ascending: true, nullsFirst: true }).limit(100);
  if (error || !data) throw Error("Child delete queue unavailable");
  for (const row of data) {
    if (Date.now() >= deadline) break;
    try { counts[await runChildDeletion(db, row.parent_id, row.child_id)]++; }
    catch { counts.failed++; }
  }
  return counts;
}
