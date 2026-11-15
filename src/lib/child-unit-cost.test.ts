import { describe, expect, it } from "vitest";
import {
  PLAN_PRICE_CENTS, WORKBOOK_PHYSICAL_COST_CENTS, monthFor, parseFamilies, parseMonthKey, parseSums, readChildUnitCost,
  type CostChild, type CostFamily,
} from "@/lib/child-unit-cost";
import { memoryUnitCostReader } from "@/lib/child-unit-cost-memory";

// 2026-11-14, midday in Vancouver.
const NOW = Date.parse("2026-11-14T20:00:00Z");
const RATE = 1.4;

const child = (id: string, plan: Partial<CostChild["plan"]> = {}): CostChild => ({
  id, firstName: id.toUpperCase(), createdAt: "2026-10-01T00:00:00Z", province: "BC",
  plan: { kind: null, monthlyCents: null, endsAt: null, endingFree: false, ...plan },
});
const family = (parentId: string, children: CostChild[], more: Partial<CostFamily> = {}): CostFamily => ({
  parentId, name: `Family ${parentId}`, email: null, timeZone: "America/Vancouver", postal: null, isTest: false, children, ...more,
});
const read = (reader: ReturnType<typeof memoryUnitCostReader>, more: { withTests?: boolean; month?: string } = {}) =>
  readChildUnitCost(reader, { month: more.month ?? "2026-11", rate: RATE, withTests: more.withTests ?? false, now: NOW });

describe("cost per child", () => {
  it("counts a free month as paid 0, so the margin is the cost taken away", async () => {
    const reader = memoryUnitCostReader({
      families: [family("p1", [child("a", { kind: "free_month", monthlyCents: 7999 })])],
      ai: [{ parentId: "p1", childId: "a", at: "2026-11-05T18:00:00Z", provider: "openrouter", costUsd: 1 }],
    });
    const v = await read(reader);
    expect(v.rows).toHaveLength(1);
    expect(v.rows[0]).toMatchObject({ plan: "free month", aiCents: 140, paidCents: 0, totalCents: 140, marginCents: -140 });
    expect(v.paying).toEqual({ children: 0, avgCostCents: null, priceCents: PLAN_PRICE_CENTS });
  });

  it("charges a paying child its monthly price, and adds Maya's voice estimate and the workbooks shipped", async () => {
    const reader = memoryUnitCostReader({
      families: [family("p1", [child("a", { kind: "paying", monthlyCents: 7999 })])],
      ai: [{ parentId: "p1", childId: "a", at: "2026-11-05T18:00:00Z", provider: "openrouter", costUsd: 2.5 }],
      maya: [
        { parentId: "p1", childId: "a", at: "2026-11-06T18:00:00Z", what: "speech_to_text", costMicros: 300_000 },
        { parentId: "p1", childId: "a", at: "2026-11-06T18:00:00Z", what: "voice", costMicros: 200_000 },
      ],
      shipped: [{ parentId: "p1", childId: "a", at: "2026-11-10T18:00:00Z" }],
    });
    const v = await read(reader);
    const r = v.rows[0];
    expect(r).toMatchObject({ plan: "paying", aiCents: 350, voiceCents: 50, workbooks: 1, physicalCents: WORKBOOK_PHYSICAL_COST_CENTS, paidCents: 7999 });
    expect(r.totalCents).toBe(350 + 50 + WORKBOOK_PHYSICAL_COST_CENTS);
    expect(r.marginCents).toBe(7999 - r.totalCents);
    expect(v.paying).toEqual({ children: 1, avgCostCents: r.totalCents, priceCents: 7999 });
    expect(v.physical).toMatchObject({ workbooks: 1, estimateCents: WORKBOOK_PHYSICAL_COST_CENTS });
  });

  it("turns US dollars into cents once, on the total, not call by call", async () => {
    // Three calls of USD 0.003: each is 0.42 cents (0 rounded alone); together 1.26 cents, rounded once to 1.
    const ai = [1, 2, 3].map((d) => ({ parentId: "p1", childId: "a", at: `2026-11-0${d}T18:00:00Z`, provider: "openrouter" as const, costUsd: 0.003 }));
    const v = await read(memoryUnitCostReader({ families: [family("p1", [child("a")])], ai }));
    expect(v.rows[0].aiCents).toBe(1);
    expect(v.rows[0].totalCents).toBe(1);
  });

  it("leaves test families out unless they are shown, and asks the database for no test family", async () => {
    const data = {
      families: [family("real", [child("a")]), family("test", [child("t")], { isTest: true })],
      ai: [
        { parentId: "real", childId: "a", at: "2026-11-05T18:00:00Z", provider: "openrouter" as const, costUsd: 1 },
        { parentId: "test", childId: "t", at: "2026-11-05T18:00:00Z", provider: "openrouter" as const, costUsd: 5 },
      ],
    };
    const reader = memoryUnitCostReader(data);
    const v = await read(reader);
    expect(v.rows.map((r) => r.parentId)).toEqual(["real"]);
    expect(reader.asked[0].map((b) => b.parentId)).toEqual(["real"]);
    expect(v.totals.costCents).toBe(140);
    const all = await read(memoryUnitCostReader(data), { withTests: true });
    expect(all.rows.map((r) => r.parentId)).toEqual(["test", "real"]);
  });

  it("counts subscription calls but never adds them to the cost", async () => {
    const reader = memoryUnitCostReader({
      families: [family("p1", [child("a")])],
      ai: [
        { parentId: "p1", childId: "a", at: "2026-11-05T18:00:00Z", provider: "subscription", costUsd: null, calls: 4 },
        { parentId: "p1", childId: "a", at: "2026-11-05T18:00:00Z", provider: "openrouter", costUsd: null },
      ],
    });
    const v = await read(reader);
    expect(v.rows[0]).toMatchObject({ calls: 5, subscriptionCalls: 4, unpricedCalls: 1, totalCents: 0 });
    expect(v.totals.subscriptionCalls).toBe(4);
  });

  it("reads each family's month in its own zone", async () => {
    // 2026-11-01 05:00 UTC is still October in Vancouver, and already November in Halifax.
    const at = "2026-11-01T05:00:00Z";
    const reader = memoryUnitCostReader({
      families: [family("west", [child("w")]), family("east", [child("e")], { timeZone: "America/Halifax" })],
      ai: [
        { parentId: "west", childId: "w", at, provider: "openrouter", costUsd: 1 },
        { parentId: "east", childId: "e", at, provider: "openrouter", costUsd: 1 },
      ],
    });
    const v = await read(reader);
    expect(v.rows.map((r) => r.parentId)).toEqual(["east"]);
    const october = await read(reader, { month: "2026-10" });
    expect(october.rows.map((r) => r.parentId)).toEqual(["west"]);
    expect(october.pastMonth).toBe(true);
  });

  it("keeps a family's calls with no child on their own line, and shows the budget's printing beside the estimate", async () => {
    const reader = memoryUnitCostReader({
      families: [family("p1", [child("a")])],
      ai: [{ parentId: "p1", childId: null, at: "2026-11-05T18:00:00Z", provider: "openrouter", costUsd: 0.5 }],
      budget: [{ name: "Printing", date: "2026-11-04", cents: 1503 }, { name: "Printing", date: "2026-10-04", cents: 999 }],
    });
    const v = await read(reader);
    expect(v.rows).toMatchObject([{ childId: null, childName: "No child named", totalCents: 70 }]);
    expect(v.physical).toMatchObject({ budgetCents: 1503, budget: [{ name: "Printing", cents: 1503, entries: 1 }] });
  });

  it("charges an ending plan until its end, and a free ending plan nothing", async () => {
    const reader = memoryUnitCostReader({
      families: [family("p1", [
        child("a", { kind: "ending", endsAt: "2026-11-20T00:00:00Z" }),
        child("b", { kind: "ending", endsAt: "2026-11-20T00:00:00Z", endingFree: true }),
        child("c", { kind: "ending", endsAt: "2026-10-20T00:00:00Z" }),
      ])],
    });
    const v = await read(reader);
    expect(v.rows.map((r) => [r.childId, r.paidCents])).toEqual([["a", PLAN_PRICE_CENTS]]);
  });
});

describe("months and parsing", () => {
  it("names this month in Vancouver and moves back", () => {
    expect(monthFor("0", NOW)).toBe("2026-11");
    expect(monthFor("2", NOW)).toBe("2026-09");
    expect(parseMonthKey("1")).toBe("1");
    expect(parseMonthKey("x")).toBe("0");
  });
  it("reads the functions' JSON, with numbers as strings", () => {
    const f = parseFamilies([{ parent_id: "p", is_test: true, children: [{ id: "c", first_name: "Ann", plan_kind: "paying", monthly_cents: "7999" }] }, { name: "no id" }]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ isTest: true, children: [{ firstName: "Ann", plan: { kind: "paying", monthlyCents: 7999 } }] });
    const s = parseSums({ sums: [{ parent_id: "p", child_id: null, ai_usd: "0.5089", voice_micros: 10 }], budget: [{ name: "Printing", cents: 6045, entries: 4 }] });
    expect(s.sums[0]).toMatchObject({ childId: null, aiUsd: 0.5089, voiceMicros: 10, calls: 0 });
    expect(s.budget).toEqual([{ name: "Printing", cents: 6045, entries: 4 }]);
    expect(parseSums(null)).toEqual({ sums: [], budget: [] });
  });
});
