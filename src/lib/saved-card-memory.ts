// The saved-card module's store and provider (src/lib/saved-card.ts) in memory, for tests. The store keeps the
// database's guards: one row per child (the unique child_id), reads and plan writes filtered by the parent, a plan
// change only on an unsaved row, and a saved mark only on an unsaved row with the same ref and customer. The provider
// keeps Stripe's rules as the live provider reads them: the first card saved for the row's ref on its customer, and an
// error when the customer has a finished setup for another ref. Every operation yields first, so two calls started
// together interleave as two requests would; the check and the write after it happen together, as in one statement.
import type { CardEvidence, CardKey, CardRecord, SavedCards } from "@/lib/saved-card";

/** A row of public.card_setups. */
export interface MemoryCardRow extends CardRecord, CardKey {
  reportId: string;
}

type Operation = "load" | "choose" | "record" | "find" | "keepPlan";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const recordOf = ({ id, plan, price, stripe_customer_id, card_saved_at }: MemoryCardRow): CardRecord =>
  ({ id, plan, price, stripe_customer_id, card_saved_at });

/**
 * The store over `rows` and the provider over `saved` (Stripe's saved cards). The returned arrays are the store's rows
 * and Stripe's cards, so a test can change and check them. A new row gets the id "card-<n>". `customerPlans`: each
 * customer's plan in Stripe, as keepPlan left it.
 */
export function memorySavedCards({ rows: initial = [], saved: cards = [] }: { rows?: MemoryCardRow[]; saved?: CardEvidence[] } = {}) {
  const rows = initial.map((r) => ({ ...r }));
  const saved = [...cards];
  const customerPlans = new Map<string, string>();
  const calls: Record<Operation, number> = { load: 0, choose: 0, record: 0, find: 0, keepPlan: 0 };
  let next = rows.length;
  /** Set an operation's error to make every call of it throw, as a database or Stripe error would. */
  const fail: Partial<Record<Operation, Error>> = {};
  /** Operations held at their answer, already worked out, until the test lets them go. */
  const held = new Map<Operation, { reached: () => void; release: Promise<void> }>();
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
  const mine = (key: CardKey) => rows.find((r) => r.childId === key.childId && r.parentId === key.parentId);

  const cardsSeam: SavedCards = {
    store: {
      async load(key) {
        await begin("load");
        const row = mine(key);
        return answer("load", row ? recordOf(row) : null);
      },
      async choose(key, { reportId, plan, price }) {
        await begin("choose");
        let row = rows.find((r) => r.childId === key.childId);
        if (row && row.parentId !== key.parentId) throw new Error("Another family's child");
        if (!row) {
          row = { id: `card-${++next}`, ...key, reportId, plan, price, stripe_customer_id: null, card_saved_at: null };
          rows.push(row);
        } else if (!row.card_saved_at) Object.assign(row, { reportId, plan, price });
        return answer("choose", recordOf(row));
      },
      async record(evidence) {
        await begin("record");
        const row = rows.find((r) => r.id === evidence.ref && r.stripe_customer_id === evidence.customer);
        if (!row) return answer("record", null);
        if (row.card_saved_at) return answer("record", { row: recordOf(row), recorded: false });
        Object.assign(row, { card_saved_at: evidence.savedAt, ...evidence.savedFor });
        return answer("record", { row: recordOf(row), recorded: true });
      },
    },
    provider: {
      async find({ id, customer }) {
        await begin("find");
        const onCustomer = saved.filter((c) => c.customer === customer);
        const first = onCustomer.filter((c) => c.ref === id).sort((a, b) => a.savedAt.localeCompare(b.savedAt))[0];
        if (!first && onCustomer.length) throw new Error("A finished card setup does not match the row");
        return answer("find", first ?? null);
      },
      async keepPlan(evidence) {
        await begin("keepPlan");
        customerPlans.set(evidence.customer, evidence.metadata.plan);
        return answer("keepPlan", undefined);
      },
    },
  };

  return {
    ...cardsSeam,
    rows,
    saved,
    customerPlans,
    calls,
    fail,
    /**
     * Holds the next call of an operation once it has its answer. `reached` resolves when the call gets there; the
     * call returns that answer after `release()`. A held read returns what was true when it read.
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
