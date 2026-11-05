import Link from "next/link";
import { redirect } from "next/navigation";
import { CancelPlan, PlanControl } from "@/components/account-plan";
import { PlanText, planDay as day } from "@/components/plan-text";
import { SupportPage } from "@/components/support-page";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import { familyProvince, familyZone, type FamilyZone } from "@/lib/family-time";
import { pageMetadata } from "@/lib/metadata";
import { parentDashboard } from "@/lib/parent-dashboard-server";
import { canCancel, type ParentPlan } from "@/lib/parent-plan";
import { familyPendingControls } from "@/lib/plan-controls-server";
import { familyPlans } from "@/lib/parent-plan-server";
import { parentId, sessionClient } from "@/lib/supabase-auth";

export const metadata = pageMetadata({ path: "/account/plan", title: "Your plan", description: "See or cancel your plan.", index: false });

const Email = () => <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>;

/** Each child's plan and its cancel button. The state comes from Stripe on every load. */
export default async function PlanPage() {
  const db = await sessionClient();
  const parent = await parentId(db);
  if (!parent) redirect("/sign-in?next=/account/plan");
  const [{ data: family }, { data: kids }, plans, dashboard] = await Promise.all([
    db.from("parents").select("postal, time_zone").maybeSingle(),
    db.from("children").select("id, created_at, province").order("created_at").order("id"),
    familyPlans(parent),
    parentDashboard(),
  ]);
  const zone = familyZone({ timeZone: family?.time_zone ?? null, postal: family?.postal ?? null, province: familyProvince(kids ?? []) });
  const pending = dashboard && plans ? await familyPendingControls(parent, plans.map(plan => plan.cardId)) : new Map();
  return (
    <SupportPage label="Your account" title="Your plan">
      {plans === null && <p role="alert" className="acct-alert">We cannot show your plan right now. To cancel, email <Email />.</p>}
      {plans?.length === 0 && <p>You do not have a saved card or a plan. Nothing will be charged.</p>}
      {plans && plans.length > 0 && <ul className="acct-kids">
        {plans.map(({ cardId, childName, plan }) => (
          <li key={cardId} className="acct-kid acct-plan">
            <div>
              <b>{childName}</b>
              <PlanText plan={plan} zone={zone} cardUpdate={dashboard ? "link" : undefined} />
            </div>
            {(pending.get(cardId) === "pause" || pending.get(cardId) === "restart") && <PlanControl cardId={cardId} name={childName} mode={pending.get(cardId) === "restart" ? "restart" : "pause"} pending />}
            {pending.get(cardId) === "cancel" && <p role="status">Cancellation is not confirmed. Please email <Email />.</p>}
            {dashboard && !pending.get(cardId) && (plan.kind === "paying" || plan.kind === "free_month" || plan.kind === "ended") && <PlanControl cardId={cardId} name={childName} mode={plan.kind === "ended" ? "restart" : "pause"} />}
            {canCancel(plan) && <CancelPlan cardId={cardId} name={childName} consequence={consequence(plan, zone)} />}
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
  if (plan.kind === "paying") return `The plan ends${plan.nextCharge ? ` on ${day(plan.nextCharge, zone)}` : " at the end of this month"}. We will not charge your card again.`;
  return "The plan ends now. We will not try your card again.";
}
