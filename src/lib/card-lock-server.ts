import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CARD_LOCK_SECONDS, type CardLock, type CardLockFinish, type CardLocks } from "@/lib/card-lock";
import type { Database } from "@/lib/database";
import { adminClient } from "@/lib/supabase-auth";

// The card lock's seam on the live site: the service-only functions of migration card_update_lock.

type Answer = Record<string, unknown>;
const object = (data: unknown): Answer => {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Card lock answer unreadable");
  return data as Answer;
};
const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const required = (value: unknown): string => {
  if (typeof value !== "string" || !value) throw new Error("Card lock answer unreadable");
  return value;
};

function readLock(data: unknown): CardLock {
  const a = object(data);
  const recorded = a.recorded === true;
  switch (a.state) {
    case "no_match": return { state: "no_match" };
    case "clean": return { state: "clean", session: text(a.session), recorded };
    case "busy": return { state: "busy", session: text(a.session), recorded };
    case "taken": return { state: "taken", token: required(a.token), session: text(a.session), paymentMethod: text(a.payment_method), needsRepair: a.needs_repair === true, recorded };
    default: throw new Error("Card lock answer unreadable");
  }
}

function readFinish(data: unknown): CardLockFinish {
  const a = object(data);
  switch (a.state) {
    case "done": return { state: "done" };
    case "lost": return { state: "lost" };
    case "unchanged": return { state: "unchanged" };
    case "newer": return { state: "newer", session: text(a.session), paymentMethod: text(a.payment_method) };
    default: throw new Error("Card lock answer unreadable");
  }
}

export function supabaseCardLocks(db: SupabaseClient<Database>): CardLocks {
  return {
    async takeCardLock(cardId, card) {
      const { data, error } = await db.rpc("take_card_lock", {
        p_card: cardId,
        p_seconds: CARD_LOCK_SECONDS,
        ...(card ? { p_parent: card.parentId, p_session: card.session, p_session_created_at: new Date(card.created * 1000).toISOString(), p_payment_method: card.paymentMethod } : {}),
      });
      if (error) throw new Error(`card lock take: ${error.message}`);
      return readLock(data);
    },
    async finishCardLock(cardId, token, session, wrote) {
      const { data, error } = await db.rpc("finish_card_lock", { p_card: cardId, p_token: token, p_session: session, p_wrote: wrote });
      if (error) throw new Error(`card lock finish: ${error.message}`);
      return readFinish(data);
    },
    async releaseCardLock(cardId, token) {
      const { error } = await db.rpc("release_card_lock", { p_card: cardId, p_token: token });
      if (error) throw new Error(`card lock release: ${error.message}`);
    },
  };
}

/** The lock on the live site, or null without the secret key. */
export function liveCardLocks(): CardLocks | null {
  const db = adminClient();
  return db && supabaseCardLocks(db);
}
