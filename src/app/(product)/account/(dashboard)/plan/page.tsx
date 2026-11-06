import { ParentPlanView } from "@/components/parent-plan-view";
import { redirect } from "next/navigation";
import { familyProvince, familyZone } from "@/lib/family-time";
import { pageMetadata } from "@/lib/metadata";
import { parentDashboard } from "@/lib/parent-dashboard-server";
import { familyPendingControls } from "@/lib/plan-controls-server";
import { familyPlans } from "@/lib/parent-plan-server";
import { parentId, sessionClient } from "@/lib/supabase-auth";

export const metadata = pageMetadata({ path: "/account/plan", title: "Your plan", description: "See or cancel your plan.", index: false });

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
  return <ParentPlanView plans={plans} zone={zone} controls={!!dashboard} pending={pending} />;
}
