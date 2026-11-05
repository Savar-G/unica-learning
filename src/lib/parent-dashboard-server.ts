import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { parentDashboardAccess } from "@/lib/parent-dashboard-access";
import { LAST_CHILD_COOKIE } from "@/lib/parent-shell";
import { pinIsSet } from "@/lib/parent-pin-server";
import { listChildren, type ChildView } from "@/lib/parent-view";
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
  /** A deletion request is in the queue (#556). A family only frozen by the retention job's check can still reopen, so it does not count. */
  deletionRequested?: boolean;
}

/** Only for a fenced family, so the normal page load gains no read. A failed read counts as no request: the account keeps working. */
async function deletionRequested(parent: string): Promise<boolean> {
  const { data, error } = await adminClient()?.from("family_deletions").select("reason").eq("parent_id", parent).eq("reason", "request").maybeSingle() ?? { data: null, error: null };
  if (error) console.error("[parent-dashboard] deletion read failed", error.code);
  return !!data;
}

export const parentDashboard = cache(async (): Promise<ParentDashboard | null> => {
  const session = await sessionClient();
  const parent = await parentId(session);
  if (!parent || !(await parentDashboardAccess(parent))) return null;
  try {
    const [children, pinSet, family, jar] = await Promise.all([
      listChildren(parentViewReader(session, parent, adminClient()), Date.now()),
      pinIsSet(parent),
      session.from("parents").select("time_zone, deletion_requested_at").maybeSingle(),
      cookies(),
    ]);
    if (family.error) throw new Error(`parents read: ${family.error.message}`);
    return {
      children, remembered: jar.get(LAST_CHILD_COOKIE)?.value ?? null, pinSet, timeZoneSaved: !!family.data?.time_zone,
      deletionRequested: !!family.data?.deletion_requested_at && await deletionRequested(parent),
    };
  } catch (error) {
    console.error("[parent-dashboard] load failed", error instanceof Error ? error.message : "failed");
    return null;
  }
});
