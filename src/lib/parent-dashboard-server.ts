import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { parentDashboardAccess } from "@/lib/parent-dashboard-access";
import { LAST_CHILD_COOKIE, pickChild } from "@/lib/parent-shell";
import { pinIsSet } from "@/lib/parent-pin-server";
import { listChildren, readOverview, type ChildView, type OverviewView } from "@/lib/parent-view";
import { parentViewReader } from "@/lib/parent-view-server";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";

// Who gets the dashboard shell (#551), and the facts the frame needs. The account pages' layout and the home page both
// ask, once per request. Null gives today's Parent home: no one signed in, a family the switch does not open to, or a
// failed read, because a family's account must keep working when the dashboard's reads do not.

export interface ParentDashboard {
  children: ChildView[];
  /** The id in the last-child cookie; not checked yet. Use `pickChild`. */
  remembered: string | null;
  /** Null when it cannot be read: the desk route then decides, as it does for Parent home. */
  pinSet: boolean | null;
  timeZoneSaved: boolean;
}

export const parentDashboard = cache(async (): Promise<ParentDashboard | null> => {
  const session = await sessionClient();
  const parent = await parentId(session);
  if (!parent || !(await parentDashboardAccess(parent))) return null;
  try {
    const [children, pinSet, family, jar] = await Promise.all([
      listChildren(parentViewReader(session, parent, adminClient()), Date.now()),
      pinIsSet(parent),
      session.from("parents").select("time_zone").maybeSingle(),
      cookies(),
    ]);
    if (family.error) throw new Error(`parents read: ${family.error.message}`);
    return { children, remembered: jar.get(LAST_CHILD_COOKIE)?.value ?? null, pinSet, timeZoneSaved: !!family.data?.time_zone };
  } catch (error) {
    console.error("[parent-dashboard] load failed", error instanceof Error ? error.message : "failed");
    return null;
  }
});

/**
 * The Overview (#560) of the child the home page shows: the child the address names, else the last child viewed. Null
 * for a stage with no Overview, and when its reads fail: the home page then shows its other parts, as before.
 */
export async function dashboardOverview(dashboard: ParentDashboard, addressChild: string | null): Promise<OverviewView | null> {
  const child = pickChild(dashboard.children, addressChild, dashboard.remembered);
  if (!child?.tabs.includes("overview")) return null;
  try {
    const session = await sessionClient();
    const parent = await parentId(session);
    return parent ? await readOverview(parentViewReader(session, parent, adminClient()), child.id, Date.now()) : null;
  } catch (error) {
    console.error("[parent-dashboard] overview load failed", error instanceof Error ? error.message : "failed");
    return null;
  }
}
