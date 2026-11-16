// The Supabase reader of the cost per child (child-unit-cost.ts): two admin-only database functions with the admin's own
// session (migration admin_child_unit_cost). Server only: the page imports it. Two calls a page load, no polling.
import type { AdminSession } from "@/lib/admin-store";
import { parseFamilies, parseSums, type UnitCostReader } from "@/lib/child-unit-cost";

export function supabaseUnitCostReader(a: AdminSession): UnitCostReader {
  return {
    async families() {
      const { data, error } = await a.db.rpc("admin_child_unit_cost_families");
      if (error) throw new Error(`cost per child families: ${error.message}`);
      if (!Array.isArray(data)) throw new Error("cost per child families: no data returned");
      return parseFamilies(data);
    },
    async sums(bounds, month) {
      const { data, error } = await a.db.rpc("admin_child_unit_cost", { p_bounds: bounds.map((b) => ({ parent_id: b.parentId, from: b.from, to: b.to })), p_month: month });
      if (error) throw new Error(`cost per child: ${error.message}`);
      if (!data || typeof data !== "object" || !("sums" in data) || !Array.isArray(data.sums)) throw new Error("cost per child: no data returned");
      return parseSums(data);
    },
  };
}
