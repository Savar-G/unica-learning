import "server-only";
import type { AdminSession } from "@/lib/admin-store";
import { readRiskRows, type RiskRow } from "@/lib/admin-families-at-risk";

/** The children on a running or troubled plan, with their activity facts: one admin-only call, no polling. */
export async function loadFamiliesAtRisk(a: AdminSession, withTests: boolean): Promise<RiskRow[]> {
  const { data, error } = await a.db.rpc("admin_families_at_risk_v1", { p_with_tests: withTests });
  if (error) throw new Error(`[admin] families at risk: ${error.message}`);
  return readRiskRows(data ?? []);
}
