import type { ReactNode } from "react";
import Link from "next/link";
import { CancelPlan, PlanControl } from "@/components/account-plan";
import { PlanText, planDay as day } from "@/components/plan-text";
import { SupportPage } from "@/components/support-page";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import type { FamilyZone } from "@/lib/family-time";
import { canCancel, type ParentPlan } from "@/lib/parent-plan";
import type { familyPlans } from "@/lib/parent-plan-server";

const Email = () => <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>;
type PlanRow = NonNullable<Awaited<ReturnType<typeof familyPlans>>>[number];

export function ParentPlanView({ plans, zone, controls, pending, control, cancellation, note }: {
  plans: Awaited<ReturnType<typeof familyPlans>>; zone: FamilyZone; controls: boolean;
  note?: ReactNode;
  control?: (row: PlanRow) => ReactNode;
  cancellation?: (row: PlanRow) => ReactNode;
  pending?: ReadonlyMap<string, "pause" | "restart" | "cancel">;
}) {
  return (
    <SupportPage label="Your account" title="Your plan">
      {note}
      {plans === null && <p role="alert" className="acct-alert">We cannot show your plan right now. To cancel, email <Email />.</p>}
      {plans?.length === 0 && <p>You do not have a saved card or a plan. Nothing will be charged.</p>}
      {plans && plans.length > 0 && <ul className="acct-kids">
        {plans.map(({ cardId, childName, plan }) => (
          <li key={cardId} className="acct-kid acct-plan">
            <div>
              <b>{childName}</b>
              <PlanText plan={plan} zone={zone} cardUpdate={controls ? "link" : undefined} />
            </div>
            {!control && (pending?.get(cardId) === "pause" || pending?.get(cardId) === "restart") && <PlanControl cardId={cardId} name={childName} mode={pending?.get(cardId) === "restart" ? "restart" : "pause"} pending />}
            {pending?.get(cardId) === "cancel" && <p role="status">Cancellation is not confirmed. Please email <Email />.</p>}
            {!control && controls && !pending?.get(cardId) && (plan.kind === "paying" || plan.kind === "free_month" || plan.kind === "ended") && <PlanControl cardId={cardId} name={childName} mode={plan.kind === "ended" ? "restart" : "pause"} />}
            {control?.({ cardId, childName, plan })}
            {canCancel(plan) && (cancellation?.({ cardId, childName, plan }) ?? <CancelPlan cardId={cardId} name={childName} consequence={consequence(plan, zone)} />)}
          </li>
        ))}
      </ul>}
      <p className="small acct-out"><Link href="/account">Back to your account</Link>. <Link href="/terms">Read the terms</Link>.</p>
    </SupportPage>
  );
}

function consequence(plan: ParentPlan, zone: FamilyZone): string {
  if (plan.kind === "free_month") return `The plan ends on ${day(plan.firstCharge, zone)}, and you pay nothing.`;
  if (plan.kind === "paused") return "The plan ends now. It will not resume, and we will not charge your card again.";
  if (plan.kind === "paying") {
    const endsAt = plan.cancelAt ?? plan.nextCharge;
    return `The plan ends${endsAt ? ` on ${day(endsAt, zone)}` : " at the end of this month"}. We will not charge your card again.`;
  }
  return "The plan ends now. We will not try your card again.";
}
