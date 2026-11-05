import { AccountBilling } from "@/components/account-billing";
import { loadFamilyBilling } from "@/lib/billing";
import { liveFamilyBilling } from "@/lib/billing-server";
import type { FamilyZone } from "@/lib/family-time";

/** Reads Stripe's invoices, so the Account tab streams it in: a slow Stripe does not hold back the rest of the page. */
export async function BillingSection({ parent, zone }: { parent: string; zone: FamilyZone }) {
  const seams = liveFamilyBilling();
  return <AccountBilling billing={seams ? await loadFamilyBilling(parent, seams) : { state: "unavailable" }} zone={zone} />;
}
