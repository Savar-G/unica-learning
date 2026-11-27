// The in-memory reader of the cost per child (child-unit-cost.ts), for tests. It sums raw rows inside each family's month
// the way admin_child_unit_cost does, without the older-ledger history.
import type { BudgetLine, CostFamily, CostSums, FamilyBounds, UnitCostReader } from "@/lib/child-unit-cost";
import type { AiProviderKind } from "@/lib/ai-usage";

export interface MemoryAiCall { parentId: string; childId: string | null; at: string; provider: AiProviderKind; costUsd: number | null; calls?: number }
export interface MemoryMayaRow { parentId: string; childId: string | null; at: string; what: "model" | "review" | "speech_to_text" | "voice"; costMicros: number }
export interface MemoryShipped { parentId: string; childId: string; at: string }
export interface MemoryBudget { name: string; date: string; cents: number }

export function memoryUnitCostReader(data: { families: CostFamily[]; ai?: MemoryAiCall[]; maya?: MemoryMayaRow[]; shipped?: MemoryShipped[]; budget?: MemoryBudget[] }): UnitCostReader & { asked: FamilyBounds[][] } {
  const asked: FamilyBounds[][] = [];
  return {
    asked,
    async families() { return structuredClone(data.families); },
    async sums(bounds, month) {
      asked.push([...bounds]);
      const by = new Map<string, CostSums>();
      const inside = (parentId: string, at: string) => {
        const b = bounds.find((x) => x.parentId === parentId);
        const t = Date.parse(at);
        return !!b && t >= Date.parse(b.from) && t < Date.parse(b.to);
      };
      const of = (parentId: string, childId: string | null) => {
        const key = `${parentId}:${childId ?? ""}`;
        const cur = by.get(key) ?? { parentId, childId, aiUsd: 0, mayaModelMicros: 0, speechMicros: 0, voiceMicros: 0, calls: 0, subscriptionCalls: 0, unpricedCalls: 0, workbooksShipped: 0 };
        by.set(key, cur);
        return cur;
      };
      for (const a of data.ai ?? []) {
        if (!inside(a.parentId, a.at)) continue;
        const s = of(a.parentId, a.childId);
        const n = a.calls ?? 1;
        s.calls += n;
        if (a.provider === "subscription") s.subscriptionCalls += n;
        else if (a.costUsd === null) s.unpricedCalls += n;
        else s.aiUsd += a.costUsd;
      }
      for (const m of data.maya ?? []) {
        if (!inside(m.parentId, m.at)) continue;
        const s = of(m.parentId, m.childId);
        if (m.what === "speech_to_text") s.speechMicros += m.costMicros;
        else if (m.what === "voice") s.voiceMicros += m.costMicros;
        else s.mayaModelMicros += m.costMicros;
      }
      for (const w of data.shipped ?? []) if (inside(w.parentId, w.at)) of(w.parentId, w.childId).workbooksShipped += 1;
      const lines = new Map<string, BudgetLine>();
      for (const b of data.budget ?? []) {
        if (b.date.slice(0, 7) !== month) continue;
        const cur = lines.get(b.name) ?? { name: b.name, cents: 0, entries: 0 };
        cur.cents += b.cents;
        cur.entries += 1;
        lines.set(b.name, cur);
      }
      return { sums: [...by.values()], budget: [...lines.values()] };
    },
  };
}
