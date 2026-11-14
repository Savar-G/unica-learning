import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database";
import type { ReferralCommand, ReferralReply, ReferralStore } from "@/lib/referrals";

/** One typed RPC is the only write interface. Regenerate schema types after the additive migration. */
export function referralStore(db: SupabaseClient<Database>): ReferralStore {
  return {
    async command(command: ReferralCommand) {
      const { data, error } = await db.rpc("referral_command", { p_command: JSON.parse(JSON.stringify(command)) as Json });
      if (error) throw new Error(`Referral store: ${error.code}`);
      if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.ok !== "boolean") throw new Error("Referral reply unreadable");
      return data as unknown as ReferralReply;
    },
    async owner(customer) {
      // Current card ownership is required before any provider identifier can affect a family.
      const { data, error } = await db.from("card_setups").select("parent_id,child_id,stripe_customer_id").eq("stripe_customer_id", customer).maybeSingle();
      if (error) throw new Error(`Referral owner: ${error.code}`);
      if (data) return { parent: data.parent_id, child: data.child_id, customer };
      const retained = await db.from("referral_customers").select("account_id,child_id").eq("customer",customer).maybeSingle();
      if (retained.error) throw new Error("Referral retained customer unreadable");
      if (!retained.data) return null;
      const account = await db.from("referral_accounts").select("parent_id").eq("id",retained.data.account_id).maybeSingle();
      if (account.error) throw new Error("Referral retained owner unreadable");
      return account.data?.parent_id ? { parent: account.data.parent_id, child: retained.data.child_id, customer } : null;
    },
    async customers(parent) {
      const bound = await this.command({ action: "overview", parent });
      if (!bound.ok) throw new Error("Referral family unavailable");
      const customers: string[] = [];
      // Include retained customers after child deletion. A partial list never establishes eligibility.
      for (let page = 0; page < 100; page++) {
        const { data: account, error: accountError } = await db.from("referral_accounts").select("id").eq("parent_id", parent).single();
        if (accountError) throw new Error("Referral account unreadable");
        const { data, error } = await db.from("referral_customers").select("customer").eq("account_id", account.id).order("customer").range(page * 100, page * 100 + 99);
        if (error) throw new Error(`Referral customers: ${error.code}`);
        customers.push(...data.map(c => c.customer));
        if (data.length < 100) return customers;
      }
      throw new Error("Referral customer list incomplete");
    },
    async readOrder() {
      const { data, error } = await db.rpc("referral_next_read");
      if (error || typeof data !== "number" || !Number.isSafeInteger(data)) throw new Error("Referral read order unavailable");
      return data;
    },
  };
}
