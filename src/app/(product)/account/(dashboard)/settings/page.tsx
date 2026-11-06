import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BillingSection } from "@/components/account-billing-section";
import { ParentAccountSettings } from "@/components/parent-account-settings";
import { familyProvince, familyZone } from "@/lib/family-time";
import { pageMetadata } from "@/lib/metadata";
import { parentDashboard } from "@/lib/parent-dashboard-server";
import { childDetails } from "@/components/account-child-details";
import { ACCOUNT_PATH } from "@/lib/parent-shell";
import { parentId, sessionClient } from "@/lib/supabase-auth";

export const metadata = pageMetadata({ path: ACCOUNT_PATH, title: "Your account", description: "Your plan, your invoices, your password and your PIN.", index: false });

// The Account tab (#551, #554): each child's plan and next charge, the family's invoices, the card update, and the family's
// links from Parent home. Cancel stays on the plan page (D-222). A family the dashboard's switch does not open to goes to
// Parent home, which has these links, and no billing read runs for it.
export default async function AccountSettings({ searchParams }: PageProps<"/account/settings">) {
  const db = await sessionClient();
  const parent = await parentId(db);
  if (!parent) redirect(`/sign-in?next=${ACCOUNT_PATH}`);
  if (!(await parentDashboard())) redirect("/account");
  const [{ card }, { data: family }, { data: kids }, { data: cards }] = await Promise.all([
    searchParams,
    db.from("parents").select("postal, time_zone").maybeSingle(),
    db.from("children").select("id, created_at, province").order("created_at").order("id"),
    db.from("card_setups").select("card_saved_at"),
  ]);
  const zone = familyZone({ timeZone: family?.time_zone ?? null, postal: family?.postal ?? null, province: familyProvince(kids ?? []) });
  return <ParentAccountSettings card={card} hasCard={!!cards?.some(c => c.card_saved_at)} province={kids?.at(-1)?.province ?? "BC"}
    details={await childDetails(db)}
    billing={<Suspense fallback={<p role="status">Loading billing...</p>}><BillingSection parent={parent} zone={zone} /></Suspense>} />;
}
