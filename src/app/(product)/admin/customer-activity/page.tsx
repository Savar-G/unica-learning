import Link from "next/link";
import { AdminFrame } from "@/components/admin-frame";
import { CustomerActivityPanel } from "@/components/admin-customer-activity";
import { requireAdmin } from "@/lib/admin-store";
import { showTestFamilies } from "@/lib/admin-test-families-server";
import { customerFilters } from "@/lib/customer-activity-server";
import { pageMetadata } from "@/lib/metadata";
export const metadata = pageMetadata({ path: "/admin/customer-activity", title: "Admin: customer activity", description: "Admin area.", index: false });
export default async function CustomerActivityPage({ searchParams }: PageProps<"/admin/customer-activity">) {
  const admin = await requireAdmin(), tests = await showTestFamilies(), now = new Date().getTime();
  let filters;
  try { filters = customerFilters(await searchParams, now); }
  catch (e) { return <AdminFrame email={admin.email} title="Customer activity"><p role="alert">{e instanceof Error ? e.message : "Invalid filters."}</p><Link href="/admin/customer-activity">Reset filters</Link></AdminFrame>; }
  return <AdminFrame email={admin.email} title="Customer activity" lead="Work, visits, progress and team records, with their evidence limits." testNote={tests}>
    <CustomerActivityPanel admin={admin} filters={filters} tests={tests} now={now} />
  </AdminFrame>;
}
