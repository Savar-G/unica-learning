import Link from "next/link";
import { redirect } from "next/navigation";
import { AddChild, SignOut } from "@/components/account";
import { SupportPage } from "@/components/support-page";
import { pageMetadata } from "@/lib/metadata";
import { parentDashboard } from "@/lib/parent-dashboard-server";
import { ACCOUNT_PATH } from "@/lib/parent-shell";
import { parentId, sessionClient } from "@/lib/supabase-auth";

export const metadata = pageMetadata({ path: ACCOUNT_PATH, title: "Your account", description: "Your plan, your password and your PIN.", index: false });

// The Account tab (#551): the family's links from Parent home, and nothing new. #554 adds plans and invoices. A family
// the dashboard's switch does not open to goes to Parent home, which has these links.
export default async function AccountSettings() {
  const db = await sessionClient();
  const parent = await parentId(db);
  if (!parent) redirect(`/sign-in?next=${ACCOUNT_PATH}`);
  if (!(await parentDashboard())) redirect("/account");
  const [{ data: kids }, { data: cards }] = await Promise.all([
    db.from("children").select("province").order("created_at").order("id"),
    db.from("card_setups").select("card_saved_at"),
  ]);
  return (
    <SupportPage label="Your account" title="Account">
      <ul className="pd-links">
        {cards?.some((c) => c.card_saved_at) && <li><Link href="/account/plan">Manage or cancel plan</Link></li>}
        <li><Link href="/account/password">Add or change your password</Link></li>
        <li><Link href="/account/pin">Set or change your PIN</Link></li>
        <li><Link href="/account/maya-notice">Maya notice</Link></li>
      </ul>
      <AddChild province={kids?.at(-1)?.province ?? "BC"} />
      <p className="small acct-out">Signed in. <SignOut /></p>
    </SupportPage>
  );
}
