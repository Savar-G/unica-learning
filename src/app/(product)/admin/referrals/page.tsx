import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { DESK_COOKIE, deskAccess } from "@/lib/desk";
import { adminSession } from "@/lib/admin-store";
import { SupportPage } from "@/components/support-page";
import { AdminReferrals } from "@/components/admin-referrals";
export default async function ReferralsAdmin() {
  const admin = await adminSession();
  if (!admin) notFound();
  if (deskAccess((await cookies()).get(DESK_COOKIE)?.value, admin.userId).state === "open") redirect("/tutor");
  const audit = await admin.db.from("referral_corrections").select("id,account_id,actor,reason,created_at,applied_at").order("created_at", { ascending: false }).limit(50);
  return <SupportPage label="Admin" title="Referral corrections"><AdminReferrals /><h2>Recent corrections</h2>
    {audit.error ? <p role="alert">The audit could not be read.</p> : <ol>{audit.data.map(row => <li key={row.id}>
      <p>{row.applied_at ? "Applied" : "Preview only"}: {row.created_at}. Account: {row.account_id}. Actor: {row.actor ?? "Removed account"}.</p><p>{row.reason}</p>
    </li>)}</ol>}
  </SupportPage>;
}
