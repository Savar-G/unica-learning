import { AccountBilling } from "@/components/account-billing";
import { loadFamilyBilling } from "@/lib/billing";
import { liveFamilyBilling } from "@/lib/billing-server";
import type { FamilyZone } from "@/lib/family-time";
import type { ClosedPlan } from "@/lib/plan-access";

/** Reads Stripe's invoices, so the Account tab streams it in: a slow Stripe does not hold back the rest of the page. `closed`: the page's own read for its note, so this makes no second read. */
export async function BillingSection({ parent, zone, closed }: { parent: string; zone: FamilyZone; closed?: ClosedPlan | null }) {
  const seams = liveFamilyBilling();
  return <AccountBilling billing={seams ? await loadFamilyBilling(parent, seams) : { state: "unavailable" }} zone={zone} closed={closed} />;
}
