import Link from "next/link";
import type { ReactNode } from "react";
import { ACCOUNT_PATH } from "@/lib/parent-shell";
import { familyClosedPlan, type ClosedPlan } from "@/lib/plan-access";
import { markedFamily } from "@/lib/scan-pages-access";
import { adminClient } from "@/lib/supabase-auth";

export type { ClosedPlan };

/** A family that has or had a plan, with no child open now, and why. Null otherwise, and when a read fails: the note stays away, and the links stay. */
export const planClosedFamily = (parentId: string): Promise<ClosedPlan | null> => familyClosedPlan({ parentId });

/** The note a page shows: the closed plan, and whether the dashboard stays open around it. */
export type ClosedNote = { closed: ClosedPlan; dashboardOpen: boolean };

/**
 * The note for a family whose plan stopped, whatever opens the dashboard (#709). With PARENT_DASHBOARD_ENABLED on, a
 * stopped family keeps the dashboard frame while Scan pages and Maya close, so it still needs the note, with words that
 * leave the dashboard out. A marked family (test or admin) keeps the dashboard by its mark and reads no note.
 */
export async function closedNoteFor(parentId: string, dashboard: boolean): Promise<ClosedNote | null> {
  if (dashboard && await markedFamily(parentId, adminClient())) return null;
  const closed = await planClosedFamily(parentId);
  return closed ? { closed, dashboardOpen: dashboard } : null;
}

/** The page the note is on. Update card is on the account page; Cancel plan on the plan page; Restart plan on both. */
type NotePage = "home" | "plan" | "account";

/** The button's own name, then "below" on the page that has it, else a link to the page that has it. */
function action(button: string, on: NotePage, pages: readonly NotePage[], link: { href: string; label: string }): ReactNode {
  return <>use <b>{button}</b> {pages.includes(on) ? "below" : <>on your <Link href={link.href}>{link.label}</Link></>}</>;
}
const ACCOUNT_PAGE = { href: ACCOUNT_PATH, label: "account page" };
const PLAN_PAGE = { href: "/account/plan", label: "plan page" };

/** The class beside acct-alert gives the note its own spacing under the page's heading (src/ds/styles/support.css). */
const Note = ({ children }: { children: ReactNode }) => <div role="status" className="acct-alert plan-closed-note">{children}</div>;

/** What a closed family reads: why the product is closed, and which button helps. The pages it names stay open to the family. */
export function PlanClosedNote({ closed: { reason, child }, on, dashboardOpen = false }: { closed: ClosedPlan; on: NotePage; dashboardOpen?: boolean }) {
  const plan = child ? `${child}'s plan` : "Your family's plan";
  // (The dashboard is not named when it stays open: PARENT_DASHBOARD_ENABLED on, #709.)
  const closed = dashboardOpen ? "so Scan pages and Maya are closed" : "so Scan pages, Maya and your dashboard are closed";
  switch (reason) {
    case "payment_failed":
      return (
        <Note>
          <p>Your last payment{child ? ` for ${child}` : ""} did not go through, {closed} for now.</p>
          <p>To pay, {action("Update card", on, ["account"], ACCOUNT_PAGE)}. Access comes back after the next payment goes through, which can take a few days.</p>
          <p>To stop the plan, {action("Cancel plan", on, ["plan"], PLAN_PAGE)}.</p>
        </Note>
      );
    case "ended":
      return (
        <Note>
          <p>{plan} has ended, {closed}.</p>
          <p>To start again, {action("Restart plan", on, ["plan", "account"], PLAN_PAGE)}.</p>
        </Note>
      );
    case "paused":
      return <Note><p>{plan} is paused, {closed} until it resumes.</p></Note>;
    default:
      return <Note><p>{plan} is not running, {closed} for now.</p></Note>;
  }
}
