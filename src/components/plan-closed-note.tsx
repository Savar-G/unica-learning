import Link from "next/link";
import type { ReactNode } from "react";
import { ACCOUNT_PATH } from "@/lib/parent-shell";
import { familyClosedPlan, type ClosedPlan } from "@/lib/plan-access";

export type { ClosedPlan };

/** A family that has or had a plan, with no child open now, and why. Null otherwise, and when a read fails: the note stays away, and the links stay. */
export const planClosedFamily = (parentId: string): Promise<ClosedPlan | null> => familyClosedPlan({ parentId });

/** The page the note is on. Update card is on the account page; Cancel plan on the plan page; Restart plan on both. */
type NotePage = "home" | "plan" | "account";

/** The button's own name, and the page that has it. */
function onPage(button: string, link: { href: string; label: string }): ReactNode {
  return <>use <b>{button}</b> on your <Link href={link.href}>{link.label}</Link></>;
}
/** The button's own name, then "below" on the page that has it, else a link to the page that has it. */
function action(button: string, on: NotePage, pages: readonly NotePage[], link: { href: string; label: string }): ReactNode {
  return pages.includes(on) ? <>use <b>{button}</b> below</> : onPage(button, link);
}
const ACCOUNT_PAGE = { href: ACCOUNT_PATH, label: "account page" };
const PLAN_PAGE = { href: "/account/plan", label: "plan page" };

/** The class beside acct-alert gives the note its own spacing under the page's heading (src/ds/styles/support.css). */
const Note = ({ children }: { children: ReactNode }) => <div role="status" className="acct-alert plan-closed-note">{children}</div>;

/**
 * What a closed family reads: why the product is closed, and which button helps. The pages it names stay open to the family. On a failed
 * payment, the plan page's and the account page's cards already say to update the card, so only Parent home, which has no card, says how to pay.
 */
export function PlanClosedNote({ closed: { reason, child }, on }: { closed: ClosedPlan; on: NotePage }) {
  const plan = child ? `${child}'s plan` : "Your family's plan";
  const closed = "so Scan pages, Maya and your dashboard are closed";
  switch (reason) {
    case "payment_failed":
      return (
        <Note>
          <p>Your last payment{child ? ` for ${child}` : ""} did not go through, {closed} for now.</p>
          {on === "home" && <p>To pay, {onPage("Update card", ACCOUNT_PAGE)}.</p>}
          <p>Access comes back after the next payment goes through, which can take a few days.</p>
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
