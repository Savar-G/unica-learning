// The budget block of a voice call (latency plan V1, Chief of Staff 2026-11-13; docs/maya-spend.md "The budget block"):
// money for a few model attempts, reserved for the call in one atomic database request, then spent in memory, so a
// turn makes no database request before its model request.
//
// - A block is one ordinary `maya_spend` row, what 'model', reserved by `reserve_maya_spend` without force: the
//   database admits it under the child's lock and refuses it at the cap, as it admits one attempt. BLOCK_ATTEMPTS model
//   attempts; when the week does not cover them, 1; when it does not cover 1, nothing (the cap).
// - The allowance is counted in micros. An attempt takes its reservation from one block (`take`, synchronous) and its
//   real cost replaces the reservation when it comes back (`finish`): the reported cost, the reservation when the cost
//   is not known, 0 when it was never sent. These are the ledger's rules, kept in memory.
// - A turn is admitted before the session takes its input (`admit`, synchronous): one model attempt is taken for it, so
//   turns that overlap each hold their own. A turn with no child words asks for 2 free attempts, so the last one stays
//   for the child. The turn's first model attempt claims the admitted one; a turn that asked no model gives it back.
// - Refill off the turn's path: when fewer than 2 attempts are free, or the newest block is BLOCK_RENEW_MS old, one new
//   block is reserved in the background. One refill at a time. A refused refill is not tried again in the background;
//   only a turn at an allowance of 0 tries once more (`ensure`), after the blocks it retired are settled.
// - A block is retired (no new takes) at BLOCK_RETIRE_MS, below the 10-minute expiry of an unsettled reservation
//   (RESERVATION_TTL_MS), when it has no whole attempt left and a newer block exists, and at the call's end (`stop`).
//   A retired block with no attempt open is settled once with the real total of its attempts; its unused room goes
//   back to the week. A crash leaves the block counted at its reservation until the expiry.
// - What another call spends, and a ledger that cannot be read, take effect at the next refill or the call's end, not
//   in the middle of a block.
// - The safety read never comes from the block: it is forced, off the child's week, and never refused.
//
// Seams: the reservation and the settle of a block row (src/lib/maya-spend.ts gives them), the clock and the ids. No
// network, database or Next.js here.
import type { SpendState } from "@/lib/maya-spend";

/** Model attempts in a full block. */
export const BLOCK_ATTEMPTS = 4;
/** The newest block this old: the next block is reserved in the background. */
export const BLOCK_RENEW_MS = 7 * 60_000;
/** A block this old takes no more attempts and is settled: below the 10-minute expiry of an unsettled reservation. */
export const BLOCK_RETIRE_MS = 8 * 60_000;
/** Speculative attempts a turn may take (the Maya lead's prepared replies). */
export const SPECULATIVE_PER_TURN = 3;
/** A speculative attempt is refused when fewer than this many attempts are free: speculation never takes the last live attempts. */
export const SPECULATIVE_KEEP = 2;

/** What an attempt from the block is: Maya's model, a prepared reply that may not be used, or a free-talk review. */
export type BlockKind = "model" | "speculative" | "review";

/** One attempt taken from a block. Opaque to the caller. */
export interface Handle {
  readonly kind: BlockKind;
  /** The reservation it took, in micros. */
  readonly micros: number;
}

/**
 * The seam the text session gets (agreed with the Maya lead, 2026-11-13). `take` is synchronous and answers null when
 * there is no room. The block enforces the rules: at most SPECULATIVE_PER_TURN speculative takes a turn, none when
 * fewer than SPECULATIVE_KEEP attempts are free, and the week's cap. `settle` gives the attempt's real cost in US
 * dollars; `{ used: true }` marks a speculative attempt whose reply was used (it stays kind "speculative"). `giveBack`:
 * the attempt was never sent and costs nothing. Each handle is settled or given back once; a second call changes nothing.
 */
export interface BlockSeam {
  take(kind: "model" | "speculative"): Handle | null;
  settle(handle: Handle, usd: number, how?: { used?: boolean }): void;
  giveBack(handle: Handle): void;
}

/** What the attempts of a call's blocks cost so far, in micros, per kind (settled attempts only). */
export interface BlockTotals {
  model: number;
  speculative: number;
  /** The part of `speculative` whose reply was used. */
  speculativeUsed: number;
  review: number;
}

/** A voice call's budget block. */
export interface CallBudget {
  /** The agreed seam for the text session. */
  readonly seam: BlockSeam;
  /** Reserves the call's first block, if none is under way. Never throws; resolves when the reservation answered. */
  open(): Promise<void>;
  /** A new turn starts: its count of speculative takes starts from 0. */
  newTurn(): void;
  /**
   * The turn's gate, synchronous: one model attempt for the turn when `need` attempts are free (2 for a turn with no
   * child words), else null. Starts a background refill when fewer than 2 are left.
   */
  admit(need: 1 | 2): Handle | null;
  /** Gives back a turn's admitted attempt that no request claimed. Nothing when it was claimed. */
  release(handle: Handle): void;
  /** An attempt of `kind` (`micros`: its reservation), synchronous; null when no block has room. */
  take(kind: BlockKind, micros?: number): Handle | null;
  /** The next model request of the call: the oldest admitted attempt no request claimed, else null. */
  claim(micros: number): Handle | null;
  /** The attempt's real cost in micros; null: not known, it stays at its reservation. */
  finish(handle: Handle, micros: number | null, how?: { used?: boolean }): void;
  /** Whole model attempts free now. */
  attempts(): number;
  /**
   * "open" when an attempt is free. At 0: settles what it retired, tries one refill (or waits for the one under way),
   * and answers again: "week_used" or "paused" when nothing came. Never throws. Off the turn's path unless the
   * allowance is 0.
   */
  ensure(): Promise<SpendState>;
  /** The age checks: renews and retires blocks by their age. Synchronous; the requests run in the background. */
  tick(): void;
  /** The call's end: no more takes; every block is settled with its real total once its open attempts end. */
  stop(): Promise<void>;
  totals(): BlockTotals;
}

export interface BudgetSeams {
  /** One model attempt's reservation, in micros. */
  modelMicros: number;
  /** A review attempt's reservation, in micros. */
  reviewMicros: number;
  usdToMicros(usd: number): number;
  clock(): number;
  newId(): string;
  /** Reserves a block row without force. Throws when the ledger cannot answer. */
  reserve(id: string, micros: number): Promise<{ ok: true } | { ok: false }>;
  /** Settles a block row with its total. Throws when the ledger cannot answer. */
  settle(id: string, micros: number): Promise<void>;
}

interface Block {
  id: string;
  reserved: number;
  /** Open attempts at their reservation, plus finished attempts at their cost. */
  spent: number;
  open: number;
  at: number;
  retired: boolean;
  settled: boolean;
}

interface Ticket extends Handle {
  block: Block;
  done: boolean;
}

export function createBudget(seams: BudgetSeams): CallBudget {
  const m = seams.modelMicros;
  const blocks: Block[] = [];
  /** Admitted attempts of turns, not claimed yet, oldest first. */
  const pending: Ticket[] = [];
  const totals: BlockTotals = { model: 0, speculative: 0, speculativeUsed: 0, review: 0 };
  const settles = new Set<Promise<void>>();
  let refilling: Promise<void> | null = null;
  let refused: Exclude<SpendState, "open"> | null = null;
  let stopped = false;
  let speculated = 0;

  const freeOf = (b: Block) => Math.max(0, b.reserved - b.spent);
  const active = () => blocks.filter((b) => !b.retired);
  const attempts = () => active().reduce((n, b) => n + Math.floor(freeOf(b) / m), 0);

  function settleIfDone(b: Block) {
    if (!b.retired || b.open > 0 || b.settled) return;
    b.settled = true;
    const p = seams.settle(b.id, b.spent).then(() => {
      // Room may have come back to the week: a later refill may be tried again.
      refused = null;
    }, (e: unknown) => {
      // Unsettled, the block stops counting at the expiry; its real cost is then lost to the week (docs/maya-spend.md).
      console.error("[maya spend] a block not settled", b.id, e instanceof Error ? e.message : String(e));
    });
    settles.add(p);
    void p.finally(() => settles.delete(p));
  }

  function retire(b: Block) {
    b.retired = true;
    settleIfDone(b);
  }

  function age() {
    const now = seams.clock();
    for (const b of active()) if (now - b.at >= BLOCK_RETIRE_MS) retire(b);
  }

  async function refill() {
    try {
      for (const n of [BLOCK_ATTEMPTS, 1]) {
        const id = seams.newId();
        const r = await seams.reserve(id, n * m);
        if (!r.ok) continue;
        const b: Block = { id, reserved: n * m, spent: 0, open: 0, at: seams.clock(), retired: stopped, settled: false };
        blocks.push(b);
        if (stopped) settleIfDone(b);
        // An older block with no whole attempt left takes no more: it is settled once its attempts end.
        else for (const o of active()) if (o !== b && freeOf(o) < m) retire(o);
        return;
      }
      refused = "week_used";
    } catch (e) {
      console.error("[maya spend] a block could not be reserved", e instanceof Error ? e.message : String(e));
      refused = "paused";
    } finally {
      refilling = null;
    }
  }

  function maybeRefill() {
    if (stopped || refilling || refused) return;
    const newest = active().at(-1);
    if (attempts() < 2 || !newest || seams.clock() - newest.at >= BLOCK_RENEW_MS) refilling = refill();
  }

  function takeFrom(kind: BlockKind, micros: number): Ticket | null {
    if (stopped) return null;
    age();
    const b = active().find((x) => freeOf(x) >= micros);
    if (!b) {
      maybeRefill();
      return null;
    }
    b.spent += micros;
    b.open++;
    const t: Ticket = { kind, micros, block: b, done: false };
    maybeRefill();
    return t;
  }

  function finish(handle: Handle, micros: number | null, how?: { used?: boolean }) {
    const t = handle as Ticket;
    if (t.done) return;
    t.done = true;
    const i = pending.indexOf(t);
    if (i >= 0) pending.splice(i, 1);
    const cost = micros === null ? t.micros : Math.max(0, Math.ceil(micros));
    t.block.spent += cost - t.micros;
    t.block.open--;
    totals[t.kind] += cost;
    if (t.kind === "speculative" && how?.used) totals.speculativeUsed += cost;
    settleIfDone(t.block);
  }

  const budget: CallBudget = {
    seam: {
      take(kind) {
        if (kind === "model") return budget.claim(m) ?? budget.take("model", m);
        if (speculated >= SPECULATIVE_PER_TURN || attempts() < SPECULATIVE_KEEP) return null;
        const h = budget.take("speculative", m);
        if (h) speculated++;
        return h;
      },
      settle: (handle, usd, how) => finish(handle, seams.usdToMicros(usd), how),
      giveBack: (handle) => finish(handle, 0),
    },
    open() {
      if (blocks.length === 0 && !refilling && !stopped) refilling = refill();
      return refilling ?? Promise.resolve();
    },
    newTurn() {
      speculated = 0;
    },
    admit(need) {
      if (stopped) return null;
      age();
      if (attempts() < need) {
        maybeRefill();
        return null;
      }
      const t = takeFrom("model", m);
      if (t) pending.push(t);
      return t;
    },
    release(handle) {
      if (pending.includes(handle as Ticket)) finish(handle, 0);
    },
    take: (kind, micros = kind === "review" ? seams.reviewMicros : m) => takeFrom(kind, micros),
    claim(micros) {
      const i = pending.findIndex((t) => micros <= t.micros);
      return i < 0 ? null : pending.splice(i, 1)[0];
    },
    finish,
    attempts,
    async ensure() {
      if (!stopped) age();
      if (attempts() >= 1) return "open";
      if (stopped) return refused ?? "week_used";
      // Blocks with no whole attempt left give their unused room back first.
      for (const b of active()) if (freeOf(b) < m) retire(b);
      await Promise.all([...settles]);
      if (!refilling) {
        refused = null;
        maybeRefill();
      }
      await refilling;
      return attempts() >= 1 ? "open" : refused ?? "week_used";
    },
    tick() {
      if (stopped) return;
      age();
      maybeRefill();
    },
    async stop() {
      stopped = true;
      await refilling;
      for (const b of blocks) if (!b.retired) retire(b);
      await Promise.all([...settles]);
    },
    totals: () => ({ ...totals }),
  };
  return budget;
}
