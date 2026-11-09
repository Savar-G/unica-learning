import "server-only";
import { adminClient } from "@/lib/supabase-auth";
import { PLANS } from "@/lib/site";
import type { FamilyPlanOffer } from "@/lib/family-plan-words";

/** Called only after the report read establishes the parent's child. No card is required. */
export async function loadFamilyPlanOffer(parent: string, child: string): Promise<FamilyPlanOffer | null> {
  const db = adminClient();
  if (!db) return null;
  try {
    const { data, error } = await db.rpc("family_plan_offer", { p_parent: parent, p_child: child, p_agreed_cents: Math.round(PLANS.one.price * 100) });
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
    const { monthly_cents: cents, window } = data;
    if (typeof cents !== "number" || !Number.isInteger(cents) || cents <= 0 || !["new", "open", "ended"].includes(String(window))) return null;
    return { monthly: cents / 100, window: window as FamilyPlanOffer["window"] };
  } catch { return null; }
}
