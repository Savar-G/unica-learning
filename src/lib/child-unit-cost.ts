// Cost per child per month (docs/child-unit-cost.md, /admin/ai/children): does each family make money? For each real child
// and the family's own calendar month, the AI cost, Maya's speech and voice estimates and the print and postage estimate of
// each workbook shipped, against what the child's plan charged that month, and the margin.
//
// Pure: no database, no clock (the caller passes `now`), no network. The reads go through the reader seam (`UnitCostReader`):
// the Supabase reader in child-unit-cost-store.ts, the in-memory reader in child-unit-cost-memory.ts. Money is whole cents
// in the view, as in budget.ts. The parts are added exactly (US dollars at the one rate MAYA_USD_TO_CAD, and CAD micros) and
// each total is rounded once.
import { PACIFIC_ZONE, addMonths, familyProvince, familyZone, localDateTime, localMonth } from "@/lib/family-time";
import { PLANS } from "@/lib/site";
import { planTerms } from "@/lib/subscription-plan";

export const CHILD_COST_PATH = "/admin/ai/children";

/**
 * The print and postage cost of one shipped workbook, in CAD cents. An ESTIMATE, not a bill: no table records what one
 * workbook costs to print and mail. Change it here when the real cost is known; the page shows the budget tracker's
 * printing and postage total of the month beside it.
 */
export const WORKBOOK_PHYSICAL_COST_CAD = 30;
export const WORKBOOK_PHYSICAL_COST_CENTS = Math.round(WORKBOOK_PHYSICAL_COST_CAD * 100);

/** The plan's monthly price (CAD 79.99), in cents: the line the average cost per paying child is held against. */
export const PLAN_PRICE_CENTS = planTerms(PLANS.one.price).monthlyCents;

export const MICROS_PER_CENT = 10_000;

export const MONTHS = [
  { key: "0", label: "This month" },
  { key: "1", label: "Last month" },
  { key: "2", label: "Two months ago" },
] as const;
export type MonthKey = (typeof MONTHS)[number]["key"];

export function parseMonthKey(value: string | string[] | undefined): MonthKey {
  const v = Array.isArray(value) ? value[0] : value;
  return MONTHS.some((m) => m.key === v) ? (v as MonthKey) : "0";
}

/** The calendar month (YYYY-MM) a key names: this month in Vancouver, moved back. Each family then reads it in its own zone. */
export const monthFor = (key: MonthKey, now: number): string => addMonths(localMonth(now, PACIFIC_ZONE), -Number(key));

// ---------- what the reader gives ----------

export interface CostPlan {
  /** The stored plan kind (child_plan_states), or null when the child has no row. */
  kind: string | null;
  monthlyCents: number | null;
  endsAt: string | null;
  endingFree: boolean;
}
export interface CostChild { id: string; firstName: string; createdAt: string; province: string | null; plan: CostPlan }
export interface CostFamily {
  parentId: string;
  name: string | null;
  email: string | null;
  timeZone: string | null;
  postal: string | null;
  /** A test family or an admin's own family: left out unless the admin shows test families. */
  isTest: boolean;
  children: CostChild[];
}
/** One family's month, by its own zone: [from, to), ISO instants. */
export interface FamilyBounds { parentId: string; from: string; to: string }
export interface CostSums {
  parentId: string;
  /** Null: calls the family made with no child named (for example a photo check). */
  childId: string | null;
  /** Paid AI calls, in US dollars, not rounded. Subscription calls add nothing. */
  aiUsd: number;
  /** Older Maya model rows (maya_spend), CAD micros. */
  mayaModelMicros: number;
  /** Maya's speech-to-text and voice estimates (maya_spend), CAD micros. */
  speechMicros: number;
  voiceMicros: number;
  calls: number;
  subscriptionCalls: number;
  unpricedCalls: number;
  workbooksShipped: number;
}
/** A budget tracker category of printing or postage expenses, and its total for the calendar month. */
export interface BudgetLine { name: string; cents: number; entries: number }

export interface UnitCostReader {
  families(): Promise<CostFamily[]>;
  sums(bounds: readonly FamilyBounds[], month: string): Promise<{ sums: CostSums[]; budget: BudgetLine[] }>;
}

// ---------- the view ----------

export interface ChildMonth {
  parentId: string;
  familyName: string;
  childId: string | null;
  childName: string;
  plan: string;
  /** Paid AI calls (US dollars at the rate) and older Maya model rows, in CAD cents. */
  aiCents: number;
  /** Maya's speech and voice, an estimate, in CAD cents. */
  voiceCents: number;
  workbooks: number;
  /** Workbooks shipped times WORKBOOK_PHYSICAL_COST_CENTS: an estimate. */
  physicalCents: number;
  /** All of the above, rounded once. */
  totalCents: number;
  paidCents: number;
  marginCents: number;
  calls: number;
  subscriptionCalls: number;
  unpricedCalls: number;
}
export interface UnitCostView {
  month: string;
  rate: number;
  rows: ChildMonth[];
  totals: { costCents: number; paidCents: number; marginCents: number; subscriptionCalls: number; unpricedCalls: number };
  /** Children whose plan charged this month: their count and their average cost, against the plan price. */
  paying: { children: number; avgCostCents: number | null; priceCents: number };
  physical: { workbooks: number; estimateCents: number; budget: BudgetLine[]; budgetCents: number };
  /** True when the month is not this month: the stored plan state is today's, so the paid column may not fit that month. */
  pastMonth: boolean;
}

/** Each family's own month: midnight on the 1st to midnight on the 1st of the next month, in the family's zone. */
export function familyBounds(families: readonly CostFamily[], month: string): FamilyBounds[] {
  const next = `${addMonths(month, 1)}-01`;
  return families.map((f) => {
    const zone = familyZone({ timeZone: f.timeZone, postal: f.postal, province: familyProvince(f.children.map((c) => ({ id: c.id, created_at: c.createdAt, province: c.province }))) });
    return { parentId: f.parentId, from: new Date(localDateTime(`${month}-01`, zone)).toISOString(), to: new Date(localDateTime(next, zone)).toISOString() };
  });
}

const PLAN_LABEL: Record<string, string> = {
  free_month: "free month", paying: "paying", ending: "ending", payment_failed: "payment failed", paused: "paused", ended: "ended", not_started: "card saved",
};

/**
 * What the child's plan charged in the month, in cents, from the stored plan state. A free month is 0. A plan that is ending
 * charged its price when the month started before its end and it was not a free month; the stored row of an ending plan has
 * no price, so the plan price is used. Every other state is 0.
 */
export function paidInMonth(plan: CostPlan, monthFrom: string): number {
  switch (plan.kind) {
    case "paying": return plan.monthlyCents ?? PLAN_PRICE_CENTS;
    case "ending":
      if (plan.endingFree || !plan.endsAt || Date.parse(plan.endsAt) <= Date.parse(monthFrom)) return 0;
      return plan.monthlyCents ?? PLAN_PRICE_CENTS;
    default: return 0;
  }
}

const roundMicros = (micros: number): number => Math.round(micros / MICROS_PER_CENT);
const usdMicros = (usd: number, rate: number): number => usd * rate * 1_000_000;

/** The view of one month from the families, their sums and the budget lines. */
export function buildView(input: {
  families: readonly CostFamily[]; bounds: readonly FamilyBounds[]; sums: readonly CostSums[]; budget: readonly BudgetLine[];
  month: string; rate: number; withTests: boolean; now: number;
}): UnitCostView {
  const { rate } = input;
  const families = input.families.filter((f) => input.withTests || !f.isTest);
  const fromOf = new Map(input.bounds.map((b) => [b.parentId, b.from]));
  const sumOf = new Map(input.sums.map((s) => [`${s.parentId}:${s.childId ?? ""}`, s]));
  const rows: ChildMonth[] = [];
  const row = (f: CostFamily, child: CostChild | null, s: CostSums | undefined): ChildMonth | null => {
    const from = fromOf.get(f.parentId);
    if (!from) return null;
    const paid = child ? paidInMonth(child.plan, from) : 0;
    const workbooks = s?.workbooksShipped ?? 0;
    const physical = workbooks * WORKBOOK_PHYSICAL_COST_CENTS;
    const aiMicros = usdMicros(s?.aiUsd ?? 0, rate) + (s?.mayaModelMicros ?? 0);
    const voiceMicros = (s?.speechMicros ?? 0) + (s?.voiceMicros ?? 0);
    const total = roundMicros(aiMicros + voiceMicros) + physical;
    const calls = s?.calls ?? 0;
    if (!s && paid === 0 && child?.plan.kind !== "free_month") return null;
    if (s && total === 0 && calls === 0 && workbooks === 0 && paid === 0 && child?.plan.kind !== "free_month") return null;
    return {
      parentId: f.parentId, familyName: f.name || f.email || "Family", childId: child?.id ?? null, childName: child ? child.firstName : "No child named",
      plan: child ? (child.plan.kind ? PLAN_LABEL[child.plan.kind] ?? child.plan.kind : "no plan") : "-",
      aiCents: roundMicros(aiMicros), voiceCents: roundMicros(voiceMicros), workbooks, physicalCents: physical,
      totalCents: total, paidCents: paid, marginCents: paid - total,
      calls, subscriptionCalls: s?.subscriptionCalls ?? 0, unpricedCalls: s?.unpricedCalls ?? 0,
    };
  };
  for (const f of families) {
    for (const c of f.children) {
      const r = row(f, c, sumOf.get(`${f.parentId}:${c.id}`));
      if (r) rows.push(r);
    }
    const none = sumOf.get(`${f.parentId}:`);
    if (none) {
      const r = row(f, null, none);
      if (r) rows.push(r);
    }
  }
  rows.sort((a, b) => b.totalCents - a.totalCents || a.marginCents - b.marginCents || a.familyName.localeCompare(b.familyName));
  const sum = (pick: (r: ChildMonth) => number) => rows.reduce((t, r) => t + pick(r), 0);
  const paying = rows.filter((r) => r.childId && r.paidCents > 0);
  const budgetCents = input.budget.reduce((t, b) => t + b.cents, 0);
  const workbooks = sum((r) => r.workbooks);
  return {
    month: input.month, rate, rows,
    totals: { costCents: sum((r) => r.totalCents), paidCents: sum((r) => r.paidCents), marginCents: sum((r) => r.marginCents), subscriptionCalls: sum((r) => r.subscriptionCalls), unpricedCalls: sum((r) => r.unpricedCalls) },
    paying: { children: paying.length, avgCostCents: paying.length ? Math.round(paying.reduce((t, r) => t + r.totalCents, 0) / paying.length) : null, priceCents: PLAN_PRICE_CENTS },
    physical: { workbooks, estimateCents: workbooks * WORKBOOK_PHYSICAL_COST_CENTS, budget: [...input.budget], budgetCents },
    pastMonth: input.month !== localMonth(input.now, PACIFIC_ZONE),
  };
}

/** Reads one month through the seam: the families first (for their zones), then the sums inside each family's month. */
export async function readChildUnitCost(reader: UnitCostReader, opts: { month: string; rate: number; withTests: boolean; now: number }): Promise<UnitCostView> {
  const all = await reader.families();
  const families = all.filter((f) => opts.withTests || !f.isTest);
  const bounds = familyBounds(families, opts.month);
  const { sums, budget } = bounds.length ? await reader.sums(bounds, opts.month) : { sums: [], budget: [] };
  return buildView({ families, bounds, sums, budget, ...opts });
}

// ---------- the database function's JSON ----------

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const rows = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((r): r is Record<string, unknown> => !!r && typeof r === "object") : []);

/** admin_child_unit_cost_families' JSON. A family with no id is dropped. */
export function parseFamilies(raw: unknown): CostFamily[] {
  return rows(raw).flatMap((f) => {
    const parentId = str(f.parent_id);
    if (!parentId) return [];
    return [{
      parentId, name: str(f.name), email: str(f.email), timeZone: str(f.time_zone), postal: str(f.postal), isTest: f.is_test === true,
      children: rows(f.children).flatMap((c) => {
        const id = str(c.id);
        if (!id) return [];
        return [{
          id, firstName: str(c.first_name) ?? "Child", createdAt: str(c.created_at) ?? "", province: str(c.province),
          plan: { kind: str(c.plan_kind), monthlyCents: c.monthly_cents === null || c.monthly_cents === undefined ? null : num(c.monthly_cents), endsAt: str(c.ends_at), endingFree: c.ending_free === true },
        }];
      }),
    }];
  });
}

/** admin_child_unit_cost's JSON. */
export function parseSums(raw: unknown): { sums: CostSums[]; budget: BudgetLine[] } {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    sums: rows(o.sums).flatMap((s) => {
      const parentId = str(s.parent_id);
      if (!parentId) return [];
      return [{
        parentId, childId: str(s.child_id), aiUsd: num(s.ai_usd), mayaModelMicros: num(s.maya_model_micros), speechMicros: num(s.speech_micros), voiceMicros: num(s.voice_micros),
        calls: num(s.calls), subscriptionCalls: num(s.subscription_calls), unpricedCalls: num(s.unpriced_calls), workbooksShipped: num(s.workbooks_shipped),
      }];
    }),
    budget: rows(o.budget).map((b) => ({ name: str(b.name) ?? "Budget", cents: num(b.cents), entries: num(b.entries) })),
  };
}
