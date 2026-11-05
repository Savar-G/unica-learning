import Link from "next/link";
import { redirect } from "next/navigation";
import { CancelPlan } from "@/components/account-plan";
import { SupportPage } from "@/components/support-page";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import { familyProvince, familyZone, formatInZone, type FamilyZone } from "@/lib/family-time";
import { pageMetadata } from "@/lib/metadata";
import { canCancel, type ParentPlan } from "@/lib/parent-plan";
import { familyPlans } from "@/lib/parent-plan-server";
import { cad } from "@/lib/site";
import { parentId, sessionClient } from "@/lib/supabase-auth";

export const metadata = pageMetadata({ path: "/account/plan", title: "Your plan", description: "See or cancel your plan.", index: false });

const Email = () => <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>;

/** Each child's plan and its cancel button. The state comes from Stripe on every load. */
export default async function PlanPage() {
  const db = await sessionClient();
  const parent = await parentId(db);
  if (!parent) redirect("/sign-in?next=/account/plan");
  const [{ data: family }, { data: kids }, plans] = await Promise.all([
    db.from("parents").select("postal, time_zone").maybeSingle(),
    db.from("children").select("id, created_at, province").order("created_at").order("id"),
    familyPlans(parent),
  ]);
  const zone = familyZone({ timeZone: family?.time_zone ?? null, postal: family?.postal ?? null, province: familyProvince(kids ?? []) });
  return (
    <SupportPage label="Your account" title="Your plan">
      {plans === null && <p role="alert" className="acct-alert">We cannot show your plan right now. To cancel, email <Email />.</p>}
      {plans?.length === 0 && <p>You do not have a saved card or a plan. Nothing will be charged.</p>}
      {plans && plans.length > 0 && <ul className="acct-kids">
        {plans.map(({ cardId, childName, plan }) => (
          <li key={cardId} className="acct-kid acct-plan">
            <div>
              <b>{childName}</b>
              <PlanText plan={plan} zone={zone} />
            </div>
            {canCancel(plan) && <CancelPlan cardId={cardId} name={childName} consequence={consequence(plan, zone)} />}
          </li>
        ))}
      </ul>}
      <p className="small acct-out"><Link href="/account">Back to your account</Link>. <Link href="/terms">Read the terms</Link>.</p>
    </SupportPage>
  );
}

const day = (at: string | null, zone: FamilyZone) => (at ? formatInZone(at, zone, { year: "numeric", month: "long", day: "numeric" }) : null);
const money = (monthly: number | null) => (monthly === null ? "the monthly price" : `CAD ${cad(monthly)}`);

function PlanText({ plan, zone }: { plan: ParentPlan; zone: FamilyZone }) {
  switch (plan.kind) {
    case "not_started": return <p>Your card is saved, and nothing has been charged. Your free first month starts when the first workbook arrives at your home. To stop before then, email <Email />.</p>;
    case "free_month": return <p>Free first month. On {day(plan.firstCharge, zone)}, we charge {money(plan.monthly)}, then {money(plan.monthly)} each month until you cancel.</p>;
    case "paying": return <p>{money(plan.monthly)} a month.{plan.nextCharge ? ` Next charge: ${day(plan.nextCharge, zone)}.` : ""}</p>;
    case "payment_failed": return <p>Your last payment did not go through. To update your card, email <Email />.</p>;
    case "ending": return <p>Cancelled. {plan.endsOn ? `The plan ends on ${day(plan.endsOn, zone)}. ` : ""}We will not charge your card{plan.free ? "" : " again"}.</p>;
    case "ended": return <p>This plan has ended. We will not charge your card.</p>;
    case "unknown": return <p>We cannot show this plan right now. To cancel, email <Email />.</p>;
  }
}

function consequence(plan: ParentPlan, zone: FamilyZone): string {
  if (plan.kind === "free_month") return `The plan ends on ${day(plan.firstCharge, zone)}, and you pay nothing.`;
  if (plan.kind === "paying") return `The plan ends${plan.nextCharge ? ` on ${day(plan.nextCharge, zone)}` : " at the end of this month"}. We will not charge your card again.`;
  return "The plan ends now. We will not try your card again.";
}
