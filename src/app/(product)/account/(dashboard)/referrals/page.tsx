import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ReferralCard } from "@/components/referral-card";
import { SupportPage } from "@/components/support-page";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { DESK_COOKIE, deskAccess } from "@/lib/desk";
import { pageMetadata } from "@/lib/metadata";
export const metadata = pageMetadata({ path: "/account/referrals", title: "Family referrals", description: "Your referral code and rewards.", index: false });
export default async function ReferralsPage() {
  const parent = await parentId(await sessionClient());
  if (!parent) redirect("/sign-in?next=/account/referrals");
  if (deskAccess((await cookies()).get(DESK_COOKIE)?.value, parent).state === "open") redirect("/tutor");
  return <SupportPage label="Your account" title="Family referrals"><ReferralCard /></SupportPage>;
}
