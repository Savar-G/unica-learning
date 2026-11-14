import { RESERVATION_TTL_MS, type ReserveRequest, type SpendStore } from "@/lib/maya-spend";

// The spending ledger's store (src/lib/maya-spend.ts) in memory, for tests. It keeps the database's rules (migration
// maya_spend_no_monthly_stop): a reservation is atomic (no await inside, like the function's lock), only a child's week
// can refuse, the same id answers ok again, a settled request counts its cost, a settled unknown cost its reservation, and
// an open one its reservation until RESERVATION_TTL_MS. `fail` makes every call throw, as a store that cannot answer.

interface Row {
  request: ReserveRequest;
  cost: number | null;
  settled: boolean;
  at: number;
}

export interface MemorySpendStore extends SpendStore {
  rows(): { id: string; charge: string; childId: string | null; callId: string | null; what: string; reserved: number; cost: number | null; settled: boolean; week: string | null; month: string }[];
  /** Adds an amount already spent (a settled row), for a test's starting point. */
  spent(r: Pick<ReserveRequest, "charge" | "parentId" | "childId" | "week" | "month">, micros: number): void;
  alerts(): string[];
  fail(on: boolean): void;
  /** Every request the ledger made of the store, in order (one entry per database request in Supabase). */
  log(): ("reserve" | "settle" | "used" | "claimAlert")[];
}

export function memorySpendStore(options: { clock?: () => number } = {}): MemorySpendStore {
  const clock = options.clock ?? Date.now;
  const rows = new Map<string, Row>();
  const alerts: string[] = [];
  const log: ReturnType<MemorySpendStore["log"]> = [];
  let failing = false;
  let n = 0;
  const check = (op: (typeof log)[number]) => {
    log.push(op);
    if (failing) throw new Error("maya spend: the store did not answer");
  };
  const counted = (r: Row) => (r.cost !== null ? r.cost : r.settled || clock() - r.at <= RESERVATION_TTL_MS ? r.request.micros : 0);
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
      check("reserve");
      if (rows.has(r.id)) return { ok: true, monthMicros: used(r.childId, r.week, r.month).month };
      if (r.charge === "child" && (r.childId === null || r.week === null)) throw new Error("maya spend: a child's charge names the child and the week");
      const u = used(r.childId, r.week, r.month);
      if (!r.force && r.charge === "child" && u.week + r.micros > r.weekMicros) return { ok: false, over: "week" };
      rows.set(r.id, { request: { ...r }, cost: null, settled: false, at: clock() });
      return { ok: true, monthMicros: u.month + r.micros };
    },
    async settle(id, micros) {
      check("settle");
      const r = rows.get(id);
      if (!r || r.settled) return null;
      r.settled = true;
      r.cost = micros;
      return r.request.month;
    },
    async used(q) {
      check("used");
      return used(q.childId, q.week, q.month);
    },
    async claimAlert(month) {
      check("claimAlert");
      if (alerts.includes(month)) return false;
      alerts.push(month);
      return true;
    },
    rows: () => [...rows.entries()].map(([id, r]) => ({ id, charge: r.request.charge, childId: r.request.childId, callId: r.request.callId, what: r.request.what, reserved: r.request.micros, cost: r.cost, settled: r.settled, week: r.request.week, month: r.request.month })),
    spent(r, micros) {
      const id = `spent-${++n}`;
      rows.set(id, { request: { id, callId: null, what: "model", micros, weekMicros: 0, force: true, ...r }, cost: micros, settled: true, at: clock() });
    },
    alerts: () => [...alerts],
    log: () => [...log],
    fail(on) {
      failing = on;
    },
  };
}
