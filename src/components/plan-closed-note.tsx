import Link from "next/link";
import type { ReactNode } from "react";
import { ACCOUNT_PATH } from "@/lib/parent-shell";
import { familyClosedPlan, type ClosedPlan } from "@/lib/plan-access";

export type { ClosedPlan };

/** A family that has or had a plan, with no child open now, and why. Null otherwise, and when a read fails: the note stays away, and the links stay. */
export const planClosedFamily = (parentId: string): Promise<ClosedPlan | null> => familyClosedPlan({ parentId });

/** The page the note is on. Update card is on the account page; Cancel plan on the plan page; Restart plan on both. */
type NotePage = "home" | "plan" | "account";

/** The button's own name, then "below" on the page that has it, else a link to the page that has it. */
function action(button: string, on: NotePage, pages: readonly NotePage[], link: { href: string; label: string }): ReactNode {
  return <>use <b>{button}</b> {pages.includes(on) ? "below" : <>on your <Link href={link.href}>{link.label}</Link></>}</>;
}
const ACCOUNT_PAGE = { href: ACCOUNT_PATH, label: "account page" };
const PLAN_PAGE = { href: "/account/plan", label: "plan page" };

/** What a closed family reads: why the product is closed, and which button helps. The pages it names stay open to the family. */
export function PlanClosedNote({ closed: { reason, child }, on }: { closed: ClosedPlan; on: NotePage }) {
  const plan = child ? `${child}'s plan` : "Your family's plan";
  const closed = "so Scan pages and Maya are closed";
  switch (reason) {
    case "payment_failed":
      return (
        <div role="status" className="acct-alert">
          <p>Your last payment{child ? ` for ${child}` : ""} did not go through, {closed} for now.</p>
          <p>To pay, {action("Update card", on, ["account"], ACCOUNT_PAGE)}. Access comes back after the next payment goes through, which can take a few days.</p>
          <p>To stop the plan, {action("Cancel plan", on, ["plan"], PLAN_PAGE)}.</p>
        </div>
      );
    case "ended":
      return (
        <div role="status" className="acct-alert">
          <p>{plan} has ended, {closed}.</p>
          <p>To start again, {action("Restart plan", on, ["plan", "account"], PLAN_PAGE)}.</p>
        </div>
      );
    case "paused":
      return <div role="status" className="acct-alert"><p>{plan} is paused, {closed} until it resumes.</p></div>;
    default:
      return <div role="status" className="acct-alert"><p>{plan} is not running, {closed} for now.</p></div>;
  }
}
