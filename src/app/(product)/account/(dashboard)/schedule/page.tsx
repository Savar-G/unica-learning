import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ParentSchedule } from "@/components/parent-schedule";
import { DESK_COOKIE, DESK_HOME, deskAccess } from "@/lib/desk";
import { FAMILY_DELETED_PATH } from "@/lib/family-delete";
import { pageMetadata } from "@/lib/metadata";
import { parentDashboard } from "@/lib/parent-dashboard-server";
import { parentSchedule } from "@/lib/parent-schedule-server";
import { SCHEDULE_PATH } from "@/lib/parent-schedule";
import { pickChild } from "@/lib/parent-shell";
import { parentId, sessionClient } from "@/lib/supabase-auth";

export const metadata = pageMetadata({ path: SCHEDULE_PATH, title: "Schedule", description: "Your child's printed workbook schedule.", index: false });

export default async function SchedulePage({ searchParams }: PageProps<"/account/schedule">) {
  const parent = await parentId(await sessionClient());
  if (!parent) redirect(`/sign-in?next=${encodeURIComponent(SCHEDULE_PATH)}`);
  if (deskAccess((await cookies()).get(DESK_COOKIE)?.value, parent).state === "open") redirect(DESK_HOME);
  const dashboard = await parentDashboard();
  if (!dashboard) notFound();
  if (dashboard.deletionRequested) redirect(FAMILY_DELETED_PATH);
  const query = await searchParams;
  if (Array.isArray(query.child) || Array.isArray(query.book)) notFound();
  const explicit = query.child ?? null;
  if (explicit !== null && !dashboard.children.some(c => c.id === explicit)) notFound();
  const child = pickChild(dashboard.children, explicit, dashboard.remembered);
  if (!child) {
    if (query.book) notFound();
    return <ParentSchedule schedule={{ kind: "waiting", child: null }} />;
  }
  const schedule = await parentSchedule(parent, child.id, query.book ?? null);
  if (schedule.kind === "not-found") notFound();
  return <ParentSchedule schedule={schedule} />;
}
