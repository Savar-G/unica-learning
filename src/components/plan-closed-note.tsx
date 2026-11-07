import Link from "next/link";
import { ACCOUNT_PATH } from "@/lib/parent-shell";
import { familyHasPlanHistory, familyPlanAccess } from "@/lib/plan-access";

/** A family that has or had a plan, with no child open now. A failed read answers false: the note stays away, and the links stay. */
export async function planClosedFamily(parentId: string): Promise<boolean> {
  const [access, history] = await Promise.all([familyPlanAccess({ parentId }), familyHasPlanHistory({ parentId })]);
  return history && !access.open && access.reason !== "read_failed";
}

/** What a closed family reads: why the product is closed, and how to pay or cancel. These pages stay open to the family. */
export function PlanClosedNote({ showAccount = true }: { showAccount?: boolean }) {
  return (
    <div role="status" className="acct-alert">
      <p>Your plan is not running, so Scan pages and Maya are closed for now. Your child&apos;s saved work stays in your account.</p>
      <p>To pay or change your card, use <b>Update card</b> {showAccount ? <>on your <Link href={ACCOUNT_PATH}>account page</Link></> : "on this page"}. To stop or restart the plan, open <Link href="/account/plan">your plan</Link>.</p>
    </div>
  );
}
