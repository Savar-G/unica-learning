import "server-only";
import type { AdminSession } from "@/lib/admin-store";
import { readHealthRows, type HealthRow } from "@/lib/admin-health";

/** The failure and quality counts of the last 7 and 30 days: one admin-only call (admin_health_v1), no polling. */
export async function loadHealth(a: AdminSession, withTests: boolean): Promise<HealthRow[]> {
  const { data, error } = await a.db.rpc("admin_health_v1", { p_with_tests: withTests });
  if (error) throw new Error(`[admin] health: ${error.message}`);
  return readHealthRows(data ?? []);
}
