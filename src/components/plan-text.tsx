import Link from "next/link";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import { formatInZone, type FamilyZone } from "@/lib/family-time";
import type { ParentPlan } from "@/lib/parent-plan";
import { ACCOUNT_PATH } from "@/lib/parent-shell";
import { cad } from "@/lib/site";

const Email = () => <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>;

export const planDay = (at: string | null, zone: FamilyZone) => (at ? formatInZone(at, zone, { year: "numeric", month: "long", day: "numeric" }) : null);
const money = (monthly: number | null) => (monthly === null ? "the monthly price" : `CAD ${cad(monthly)}`);

/**
 * One child's plan in words. `cardUpdate` says where a parent can update the card: "here" on the Account tab, beside the
 * button; "link" on a page that links to it. Left out, a parent emails us, as a family the dashboard does not open to does.
 */
export function PlanText({ plan, zone, cardUpdate }: { plan: ParentPlan; zone: FamilyZone; cardUpdate?: "here" | "link" }) {
  switch (plan.kind) {
    case "not_started": return <p>Your card is saved, and nothing has been charged. Your free first month starts when the first workbook arrives at your home. To stop before then, email <Email />.</p>;
    case "free_month": return <p>Free first month. On {planDay(plan.firstCharge, zone)}, we charge {money(plan.monthly)}, then {money(plan.monthly)} each month until you cancel.</p>;
    case "paying": return <p>{money(plan.monthly)} a month.{plan.nextCharge ? ` Next charge: ${planDay(plan.nextCharge, zone)}.` : ""}</p>;
    case "payment_failed": return <p>Your last payment did not go through. {cardUpdate === "here" ? "Please update your card." : cardUpdate === "link" ? <>Please <Link href={ACCOUNT_PATH}>update your card</Link>.</> : <>To update your card, email <Email />.</>}</p>;
    case "ending": return <p>Cancelled. {plan.endsOn ? `The plan ends on ${planDay(plan.endsOn, zone)}. ` : ""}We will not charge your card{plan.free ? "" : " again"}.</p>;
    case "ended": return <p>This plan has ended. We will not charge your card.</p>;
    case "unknown": return cardUpdate === "here" ? <p>We cannot load this plan now.</p> : <p>We cannot show this plan right now. To cancel, email <Email />.</p>;
  }
}
