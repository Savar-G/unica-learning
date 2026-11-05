import type { ReactNode } from "react";
import { ParentShell } from "@/components/parent-shell";
import { parentDashboard } from "@/lib/parent-dashboard-server";

// The parent's pages (#551): the dashboard frame for the families its switch opens to; for everyone else, the page alone,
// as it was. The test, its start screen and the first sign-in stay outside this folder, so they never show the frame.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const dashboard = await parentDashboard();
  if (!dashboard) return children;
  return <ParentShell kids={dashboard.children} remembered={dashboard.remembered} pinSet={dashboard.pinSet} timeZoneSaved={dashboard.timeZoneSaved}>{children}</ParentShell>;
}
