import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { PinStore } from "@/lib/parent-pin";

// The parent PIN's store (src/lib/parent-pin.ts, #300) in Supabase, with the secret key: the service role reads and
// writes public.parent_pins (migration add_parent_pins), which no parent or admin can read. A claim is one database
// function (claim_pin_attempt) that counts the attempt under a row lock. Tests use src/lib/parent-pin-memory.ts.
export function pinStore(admin: SupabaseClient<Database>): PinStore {
  return {
    async has(parentId) {
      const { data, error } = await admin.from("parent_pins").select("parent_id").eq("parent_id", parentId).maybeSingle();
      if (error) throw new Error(`pin load: ${error.message}`);
      return !!data;
    },
    async create(parentId, hash) {
      // Insert only: a parent who already has a PIN keeps it (unique violation 23505 on the primary key).
      const { error } = await admin.from("parent_pins").insert({ parent_id: parentId, pin_hash: hash });
      if (error?.code === "23505") return false;
      if (error) throw new Error(`pin create: ${error.message}`);
      return true;
    },
    async replace(parentId, oldHash, newHash) {
      // Only while the stored hash is still the verified one; a fresh count (created_at stays).
      const { data, error } = await admin.from("parent_pins")
        .update({ pin_hash: newHash, failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() })
        .eq("parent_id", parentId).eq("pin_hash", oldHash).select("parent_id");
      if (error) throw new Error(`pin replace: ${error.message}`);
      return data.length === 1;
    },
    async claim(parentId, now, policy) {
      const { data, error } = await admin.rpc("claim_pin_attempt", {
        p_parent: parentId, p_now: new Date(now).toISOString(), p_max: policy.maxAttempts, p_lock_seconds: Math.ceil(policy.lockMs / 1000),
      });
      if (error) throw new Error(`pin claim: ${error.message}`);
      const row = data[0];
      if (!row || row.out_status === "none") return { kind: "none" };
      const lockedUntil = row.out_locked_until ? Date.parse(row.out_locked_until) : null;
      if (row.out_status === "locked" && lockedUntil !== null) return { kind: "locked", until: lockedUntil };
      if (row.out_status === "open") return { kind: "open", hash: row.out_hash, attemptsLeft: row.out_attempts_left, lockedUntil };
      throw new Error(`pin claim: unexpected answer ${row.out_status}`);
    },
    async clear(parentId, hash) {
      // Only while the stored hash is the one that was checked.
      const { error } = await admin.from("parent_pins").update({ failed_attempts: 0, locked_until: null })
        .eq("parent_id", parentId).eq("pin_hash", hash).or("failed_attempts.gt.0,locked_until.not.is.null");
      if (error) throw new Error(`pin clear: ${error.message}`);
    },
    async reset(parentId, hash) {
      // One upsert on the primary key: a new PIN and a fresh count, whether or not a row exists.
      const { error } = await admin.from("parent_pins")
        .upsert({ parent_id: parentId, pin_hash: hash, failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() }, { onConflict: "parent_id" });
      if (error) throw new Error(`pin reset: ${error.message}`);
    },
  };
}
