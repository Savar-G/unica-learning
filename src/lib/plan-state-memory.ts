// The plan state module's store and provider (src/lib/plan-state.ts) in memory, for tests. The store keeps the rules of
// the database function save_child_plan_state: one row per child, a write with no event only fills a missing row, and an
// event replaces a row from another event or a fill when its take is larger. Its takes count up, as the database's
// sequence does. supabase/tests/child_plan_states.sql checks the same cases on the database. The provider keeps Stripe's
// list of the customer's subscriptions and reads it through parentPlan. Every operation yields first, so two calls started
// together interleave as two requests would; the check and the write after it happen together, as in one statement.
import type { PlanReadRows } from "@/lib/card-reconcile";
import { parentPlan, type KnownPlan, type PlanSubscription } from "@/lib/parent-plan";
import { PLAN_READ_KINDS, type PlanOwner, type PlanRead, type PlanStates, type StoredPlanState } from "@/lib/plan-state";

export interface MemoryPlanRow extends StoredPlanState {
  parentId: string;
  childId: string;
  readOrder: number;
}

type Operation = "owner" | "load" | "take" | "save" | "plan";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * The store over `cards` (card_setups) and the provider over `subscriptions` (Stripe). The returned `rows` are the
 * store's rows and `subscriptions` is Stripe's list per customer, so a test can change and check them.
 */
export function memoryPlanStates({ cards, subscriptions: initial = {}, now = Date.now }: { cards: PlanOwner[]; subscriptions?: Record<string, PlanSubscription[]>; now?: () => number }) {
  const rows: MemoryPlanRow[] = [];
  /** read_at and read_tried_at, on the database's clock (`now`). */
  const readAt = new Map<string, number>();
  const triedAt = new Map<string, number>();
  const subscriptions = { ...initial };
  const calls: Record<Operation, number> = { owner: 0, load: 0, take: 0, save: 0, plan: 0 };
  /** Set an operation's error to make every call of it throw, as a database or Stripe error would. */
  const fail: Partial<Record<Operation, Error>> = {};
  /** Operations held at their answer, already worked out, until the test lets them go. */
  const held = new Map<Operation, { reached: () => void; release: Promise<void> }>();
  let writes = 0;
  let takes = 0;
  const begin = async (operation: Operation) => {
    calls[operation]++;
    await tick();
    if (fail[operation]) throw fail[operation];
  };
  const answer = async <T>(operation: Operation, value: T) => {
    const gate = held.get(operation);
    if (gate) {
      held.delete(operation);
      gate.reached();
      await gate.release;
    }
    return value;
  };

  const seams: PlanStates = {
    store: {
      async ownerOfCustomer(customer) {
        await begin("owner");
        return answer("owner", cards.find((c) => c.customer === customer) ?? null);
      },
      async ownerOfChild({ parentId, childId }) {
        await begin("owner");
        return answer("owner", cards.find((c) => c.childId === childId && c.parentId === parentId) ?? null);
      },
      async load({ parentId, childId }) {
        await begin("load");
        const row = rows.find((r) => r.childId === childId && r.parentId === parentId);
        return answer("load", row ? { plan: row.plan, eventAt: row.eventAt, eventId: row.eventId } : null);
      },
      async takeReadOrder() {
        await begin("take");
        return answer("take", ++takes);
      },
      async save(customer, write) {
        await begin("save");
        const card = cards.find((c) => c.customer === customer);
        if (!card) return answer("save", "no_match" as const);
        const row = rows.find((r) => r.childId === card.childId);
        if (!row) {
          rows.push({ parentId: card.parentId, childId: card.childId, ...write });
          readAt.set(card.childId, now());
          writes++;
          return answer("save", "stored" as const);
        }
        if (write.eventAt === null) return answer("save", "older" as const);
        if (row.eventId === write.eventId) return answer("save", "duplicate" as const);
        if (write.readOrder > row.readOrder) {
          Object.assign(row, write);
          readAt.set(card.childId, now());
          writes++;
          return answer("save", "stored" as const);
        }
        return answer("save", "older" as const);
      },
    },
    provider: {
      async plan(customer): Promise<KnownPlan> {
        await begin("plan");
        return answer("plan", parentPlan(subscriptions[customer] ?? []));
      },
    },
  };

  const lookedAt = (childId: string) => Math.max(readAt.get(childId) ?? 0, triedAt.get(childId) ?? 0);
  /** The rules of the database functions due_plan_reads and note_plan_read_tried; supabase/tests/child_plan_states.sql checks the same cases. */
  const reads: PlanReadRows = {
    async duePlanReads(limit) {
      await tick();
      const due = rows.flatMap((row): PlanRead[] => {
        const kind = PLAN_READ_KINDS.find((k) => k === row.plan.kind);
        const customer = cards.find((c) => c.childId === row.childId)?.customer;
        if (!kind || !customer || (readAt.get(row.childId) ?? 0) >= now() - 24 * 60 * 60 * 1000) return [];
        return [{ parentId: row.parentId, childId: row.childId, customer, kind, eventAt: row.eventAt }];
      });
      return due.sort((a, b) => lookedAt(a.childId) - lookedAt(b.childId) || a.childId.localeCompare(b.childId)).slice(0, limit);
    },
    async notePlanReadTried(childId) {
      await tick();
      triedAt.set(childId, now());
    },
  };

  return {
    ...seams,
    reads,
    rows,
    subscriptions,
    calls,
    fail,
    /** How many times the store wrote a row. */
    get writes() {
      return writes;
    },
    /**
     * Holds the next call of an operation once it has its answer. `reached` resolves when the call gets there; the call
     * returns that answer after `release()`. A held read returns what was true when it read.
     */
    hold(operation: Operation) {
      let reached!: () => void;
      let release!: () => void;
      const at = new Promise<void>((resolve) => { reached = resolve; });
      held.set(operation, { reached, release: new Promise<void>((resolve) => { release = resolve; }) });
      return { reached: at, release };
    },
  };
}
