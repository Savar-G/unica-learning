import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ParentShell } from "@/components/parent-shell";
import { FAMILY_DELETED_PATH } from "@/lib/family-delete";
import { parentDashboard } from "@/lib/parent-dashboard-server";

// The parent's pages (#551): the dashboard frame for the families its switch opens to; for everyone else, the page alone,
// as it was. The test, its start screen and the first sign-in stay outside this folder, so they never show the frame.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const dashboard = await parentDashboard();
  if (!dashboard) return children;
  // #556: a parent who signs in again while the deletion waits for the daily job sees where it stands, not a live account.
  if (dashboard.deletionRequested) redirect(FAMILY_DELETED_PATH);
  return <ParentShell kids={dashboard.children} remembered={dashboard.remembered} pinSet={dashboard.pinSet} timeZoneSaved={dashboard.timeZoneSaved}>{children}</ParentShell>;
}
