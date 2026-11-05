import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AddChild, SignOut } from "@/components/account";
import { BillingSection } from "@/components/account-billing-section";
import { FamilyDelete } from "@/components/family-delete";
import { SupportPage } from "@/components/support-page";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import { familyProvince, familyZone } from "@/lib/family-time";
import { pageMetadata } from "@/lib/metadata";
import { parentDashboard } from "@/lib/parent-dashboard-server";
import { childDetails } from "@/components/account-child-details";
import { ACCOUNT_PATH } from "@/lib/parent-shell";
import { parentId, sessionClient } from "@/lib/supabase-auth";

export const metadata = pageMetadata({ path: ACCOUNT_PATH, title: "Your account", description: "Your plan, your invoices, your password and your PIN.", index: false });

function CardNote({ card }: { card: unknown }) {
  if (card === "updated") return <p role="status" className="acct-alert">Your new card is saved. We use it for your plan&apos;s next charge.</p>;
  if (card === "unchanged") return <p role="status" className="acct-alert">Your card did not change.</p>;
  if (card === "unconfirmed") return <p role="status" className="acct-alert">We could not confirm your card update. Try again in a few minutes, or email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</p>;
  if (card === "failed") return <p role="alert" className="acct-alert">We could not update your card. Try again, or email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</p>;
  return null;
}

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
  return (
    <SupportPage label="Your account" title="Account">
      <CardNote card={card} />
      <Suspense fallback={<p role="status">Loading billing...</p>}>
        <BillingSection parent={parent} zone={zone} />
      </Suspense>
      <h2>Settings</h2>
      <ul className="pd-links">
        {cards?.some((c) => c.card_saved_at) && <li><Link href="/account/plan">Manage or cancel plan</Link></li>}
        <li><Link href="/account/password">Add or change your password</Link></li>
        <li><Link href="/account/pin">Set or change your PIN</Link></li>
        <li><Link href="/account/maya-notice">Maya notice</Link></li>
      </ul>
      {await childDetails(db)}
      <AddChild province={kids?.at(-1)?.province ?? "BC"} />
      <p className="small acct-out">Signed in. <SignOut /></p>
      <FamilyDelete />
    </SupportPage>
  );
}
