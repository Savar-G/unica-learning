import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { referralStore } from "@/lib/referral-store";
import { stripeReferrals } from "@/lib/referral-stripe";
import { recordReferralInvoice, type ReferralInvoice } from "@/lib/referrals";

/** Called after the existing payment settlement, immediately before Auth removal. No provider write or email. */
export async function preserveReferralBeforeDeletion(db: SupabaseClient<Database>, parent: string, client: Stripe | null) {
  const store = referralStore(db);
  const reply = await store.command({ action: "deletion_history", parent });
  if (!reply.ok || !reply.financial) throw new Error("Referral deletion history unreadable");
  if (!reply.financial.needed) return;
  if (!client) throw new Error("Referral deletion provider unavailable");
  const key = process.env.STRIPE_SECRET_KEY ?? "", mode = process.env.STRIPE_REFERRAL_MODE;
  if (mode !== "live" && mode !== "test" && !/^(?:sk|rk)_(live|test)_/.test(key)) throw new Error("Referral provider mode is required");
  const provider = stripeReferrals(client, mode === "live" || (!mode && /^(?:sk|rk)_live_/.test(key)));
  const readOrder = await store.readOrder();
  const customers = [...new Set([...reply.financial.customers,...await provider.familyCustomers!(parent)])];
  const bound = await store.command({ action: "deletion_history", parent, customers });
  if (!bound.ok) throw new Error("Referral deletion customer admission failed");
  const invoices: ReferralInvoice[] = [];
  for (const customer of customers) invoices.push(...await provider.invoices(customer));
  for (const invoice of invoices.sort((a,b)=>(a.paidAt ?? 0)-(b.paidAt ?? 0))) await recordReferralInvoice(invoice,{store,provider},readOrder);
}
