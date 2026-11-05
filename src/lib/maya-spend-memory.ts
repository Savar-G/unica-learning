import type { ReserveRequest, SpendStore } from "@/lib/maya-spend";

// The spending ledger's store (src/lib/maya-spend.ts) in memory, for tests. It keeps the database's rules (migration
// add_maya_spend): a reservation is atomic for all of Maya (no await inside, like the function's one lock), the month is
// checked before the week, the same id answers ok again, a settled request counts its cost, and an unsettled or uncertain
// one its reservation. `fail` makes every call throw, as a store that cannot answer.

interface Row {
  request: ReserveRequest;
  cost: number | null;
  settled: boolean;
}

export interface MemorySpendStore extends SpendStore {
  rows(): { id: string; charge: string; childId: string | null; what: string; reserved: number; cost: number | null; settled: boolean; week: string | null; month: string }[];
  /** Adds an amount already spent (a settled row), for a test's starting point. */
  spent(r: Pick<ReserveRequest, "charge" | "parentId" | "childId" | "week" | "month">, micros: number): void;
  alerts(): string[];
  fail(on: boolean): void;
}

export function memorySpendStore(): MemorySpendStore {
  const rows = new Map<string, Row>();
  const alerts: string[] = [];
  let failing = false;
  let n = 0;
  const check = () => {
    if (failing) throw new Error("maya spend: the store did not answer");
  };
  const counted = (r: Row) => (r.cost !== null ? r.cost : r.request.micros);
  const used = (childId: string | null, week: string | null, month: string) => {
    let w = 0;
    let m = 0;
    for (const r of rows.values()) {
      if (r.request.month === month) m += counted(r);
      if (childId !== null && r.request.charge === "child" && r.request.childId === childId && r.request.week === week) w += counted(r);
    }
    return { week: w, month: m };
  };
  return {
    async reserve(r) {
      check();
      if (rows.has(r.id)) return { ok: true };
      if (r.charge === "child" && (r.childId === null || r.week === null)) throw new Error("maya spend: a child's charge names the child and the week");
      const u = used(r.childId, r.week, r.month);
      if (!r.force) {
        if (u.month + r.micros > r.monthMicros) return { ok: false, over: "month" };
        if (r.charge === "child" && u.week + r.micros > r.weekMicros) return { ok: false, over: "week" };
      }
      rows.set(r.id, { request: { ...r }, cost: null, settled: false });
      return { ok: true };
    },
    async settle(id, micros) {
      check();
      const r = rows.get(id);
      if (!r || r.settled) return;
      r.settled = true;
      r.cost = micros;
    },
    async used(q) {
      check();
      return used(q.childId, q.week, q.month);
    },
    async claimAlert(month) {
      check();
      if (alerts.includes(month)) return false;
      alerts.push(month);
      return true;
    },
    rows: () => [...rows.entries()].map(([id, r]) => ({ id, charge: r.request.charge, childId: r.request.childId, what: r.request.what, reserved: r.request.micros, cost: r.cost, settled: r.settled, week: r.request.week, month: r.request.month })),
    spent(r, micros) {
      const id = `spent-${++n}`;
      rows.set(id, { request: { id, callId: null, what: "model", micros, weekMicros: 0, monthMicros: 0, force: true, ...r }, cost: micros, settled: true });
    },
    alerts: () => [...alerts],
    fail(on) {
      failing = on;
    },
  };
}
