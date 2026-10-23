import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { REPORT_PLANS } from "@/lib/report-view";
import type { CardEvidence, CardProvider, CardStore, SavedCards } from "@/lib/saved-card";
import { keepSavedPlan } from "@/lib/stripe";

// The saved-card module's seams (src/lib/saved-card.ts) for the live site: card_setups in Supabase, read and written
// with the secret key, and Stripe's Checkout Sessions.

const CARD_COLUMNS = "id, plan, price, stripe_customer_id, card_saved_at";

/** Stripe reads stop here: far more Checkout Sessions than one child's card ever needs. */
const PAGES = 5;
/** Each Stripe read: one retry, and a short time limit, so the report's check answers within its own limit. */
const READ = { timeout: 4000, maxNetworkRetries: 1 };

const idOf = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : value?.id ?? null);

/**
 * The card a finished setup Checkout Session saved, or null when it saved none: the session is complete, its ref
 * matches client_reference_id, and its SetupIntent succeeded on the session's customer. `savedAt` defaults to the
 * session's start; the thank-you page passes the time the parent came back.
 */
export function checkoutEvidence(session: Stripe.Checkout.Session, savedAt = new Date(session.created * 1000)): CardEvidence | null {
  const intent = session.setup_intent;
  const metadata = session.metadata ?? {};
  const customer = idOf(session.customer);
  if (session.mode !== "setup" || session.status !== "complete" || !metadata.ref || session.client_reference_id !== metadata.ref
    || !customer || !intent || typeof intent === "string" || intent.status !== "succeeded") return null;
  // A SetupIntent on another customer saved no card for this one.
  const intentCustomer = idOf(intent.customer);
  if (intentCustomer && intentCustomer !== customer) return null;
  const option = REPORT_PLANS.find((p) => p.plan === metadata.plan);
  const price = Number(metadata.price);
  return {
    ref: metadata.ref,
    customer,
    savedFor: option ? { plan: option.plan, price: Number.isFinite(price) && price > 0 ? price : option.price } : null,
    savedAt: savedAt.toISOString(),
    metadata,
  };
}

/** Stripe as the card provider. Without a key it cannot tell, so every answer is unknown. */
export function stripeCardProvider(client: Stripe | null): CardProvider {
  return {
    async find({ id, customer }) {
      if (!client) throw new Error("No Stripe key");
      let first: CardEvidence | null = null;
      let unclear = false;
      let cursor: string | undefined;
      for (let page = 0; page < PAGES; page++) {
        const sessions = await client.checkout.sessions.list(
          { customer, limit: 100, expand: ["data.setup_intent"], ...(cursor && { starting_after: cursor }) }, READ);
        for (const session of sessions.data) {
          if (session.mode !== "setup") continue;
          const evidence = checkoutEvidence(session);
          if (evidence?.ref === id) {
            if (!first || evidence.savedAt < first.savedAt) first = evidence;
          } else if (evidence || session.status === "complete" || (typeof session.setup_intent === "object" && session.setup_intent?.status === "processing")) {
            // A finished setup for another row, one that does not add up, or a card Stripe is still saving.
            unclear = true;
          }
        }
        if (!sessions.has_more) break;
        cursor = sessions.data.at(-1)?.id;
        if (!cursor) throw new Error("Checkout Session pages did not advance");
        if (page === PAGES - 1 && !first) throw new Error("Too many Checkout Sessions to read");
      }
      if (!first && unclear) throw new Error("A finished card setup does not match the row");
      return first;
    },
    async keepPlan(evidence) {
      if (!client) return;
      try {
        await keepSavedPlan(client, evidence.customer, evidence.metadata);
      } catch (e) {
        console.error("[saved-card] customer plan update failed", evidence.customer, e instanceof Error ? e.message : e);
        throw e;
      }
    },
  };
}

/** card_setups as the card store. Every read and write filters by the parent and the child, or by the ref and customer. */
export function supabaseCardStore(db: SupabaseClient<Database>): CardStore {
  const table = () => db.from("card_setups");
  const load: CardStore["load"] = async ({ parentId, childId }) => {
    const { data, error } = await table().select(CARD_COLUMNS).eq("child_id", childId).eq("parent_id", parentId).maybeSingle();
    if (error) throw new Error(`Card row read failed: ${error.message}`);
    return data;
  };
  return {
    load,
    async choose(key, { reportId, plan, price }) {
      // One row per child: the insert does nothing when the row is there, and then only an unsaved row takes the choice.
      const added = await table().upsert({ parent_id: key.parentId, child_id: key.childId, report_id: reportId, plan, price }, { onConflict: "child_id", ignoreDuplicates: true })
        .select(CARD_COLUMNS);
      if (added.error) throw new Error(`Card row insert failed: ${added.error.message}`);
      if (added.data.length) return added.data[0];
      const changed = await table().update({ report_id: reportId, plan, price, updated_at: new Date().toISOString() })
        .eq("child_id", key.childId).eq("parent_id", key.parentId).is("card_saved_at", null).select(CARD_COLUMNS);
      if (changed.error) throw new Error(`Card row update failed: ${changed.error.message}`);
      if (changed.data.length) return changed.data[0];
      // Saved since the check: the saved row, as it is.
      const row = await load(key);
      if (!row) throw new Error("Card row not found after the write");
      return row;
    },
    async record(evidence) {
      const marked = await table()
        .update({ card_saved_at: evidence.savedAt, ...evidence.savedFor, updated_at: new Date().toISOString() })
        .eq("id", evidence.ref).eq("stripe_customer_id", evidence.customer).is("card_saved_at", null)
        .select(CARD_COLUMNS);
      if (marked.error) throw new Error(`Card saved mark failed: ${marked.error.message}`);
      if (marked.data.length) return { row: marked.data[0], recorded: true };
      const { data, error } = await table().select(CARD_COLUMNS).eq("id", evidence.ref).eq("stripe_customer_id", evidence.customer).maybeSingle();
      if (error) throw new Error(`Card row read failed: ${error.message}`);
      return data ? { row: data, recorded: false } : null;
    },
  };
}

/** The module's seams on the live site. */
export const savedCards = (db: SupabaseClient<Database>, client: Stripe | null): SavedCards => ({ store: supabaseCardStore(db), provider: stripeCardProvider(client) });
