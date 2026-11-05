// One writer of a child's card at a time (#554, public.child_card_updates). A card update's return and a plan start both
// write a child's card at Stripe, and Stripe writes cannot be undone or ordered from here. So each writer holds this lock
// across its Stripe writes. The row names the newest card, and needs_repair says that card may not be everywhere yet.
//
// The rule that makes an expired lock safe: no Stripe write starts within WRITE_MARGIN_MS of the lock's end, and each write has
// its own time limit (CARD_WRITE_MS), shorter than the margin. So when the lock has expired, its old holder's writes can no
// longer land, and the next holder may write. The end is counted from just before the request that takes the lock, on this
// machine's clock, so the database's clock does not matter and the count ends before the lock does.
//
// A crash at any step leaves needs_repair set, and the lock ends on its own. The next return of either address, the next
// update or a plan start then writes the newest card.

/** How long a lock lasts. It outlives the longest return request: that route's maxDuration is 60 seconds. */
export const CARD_LOCK_SECONDS = 120;
/** The time limit of one Stripe write of a card. No automatic retry: the Stripe SDK's retry can wait a minute on Stripe's say. */
export const CARD_WRITE_MS = 15_000;
const WRITE_MARGIN_MS = 30_000;
/** Writes of the newest card in one holding: a failure, or a newer card, gets another try. */
const CARD_WRITES = 3;

/** A return's card, recorded when it is the child's newest. `created` is in Unix seconds. */
export interface RecordedCard {
  parentId: string;
  session: string;
  created: number;
  paymentMethod: string;
}

export type CardLock =
  /** Not this parent's card setup. Nothing was written. */
  | { state: "no_match" }
  /** A return with nothing to write: the row's newest card is already everywhere. */
  | { state: "clean"; session: string | null; recorded: boolean }
  /** Another writer holds the lock. The return's card is recorded all the same, so that writer sees it. */
  | { state: "busy"; session: string | null; recorded: boolean }
  /** This caller holds the lock. `recorded`: this call made its session the newest. */
  | { state: "taken"; token: string; session: string | null; paymentMethod: string | null; needsRepair: boolean; recorded: boolean };

export type CardLockFinish =
  /** The row is clean and the lock is free, in one step. */
  | { state: "done" }
  /** Another session is the newest now. Write its card. The lock stays. */
  | { state: "newer"; session: string | null; paymentMethod: string | null }
  /** The write failed and nothing newer waits. Nothing changed. The lock stays. */
  | { state: "unchanged" }
  /** This token no longer holds the lock. */
  | { state: "lost" };

export interface CardLocks {
  /** Records `card` when given, then takes the lock. Throws when it fails. */
  takeCardLock(cardId: string, card?: RecordedCard): Promise<CardLock>;
  /** The holder's step after a write of `session`'s card. Throws when it fails. */
  finishCardLock(cardId: string, token: string, session: string | null, wrote: boolean): Promise<CardLockFinish>;
  /** Lets go without a finished write. needs_repair stays as it is. Throws when it fails. */
  releaseCardLock(cardId: string, token: string): Promise<void>;
}

/** The test before each Stripe write of a card. Call this just before the request that takes the lock. */
export function lockWindow(startedAt = Date.now()): () => boolean {
  const lastWrite = startedAt + CARD_LOCK_SECONDS * 1000 - WRITE_MARGIN_MS;
  return () => Date.now() < lastWrite;
}

/** The one card this holder works on: the card to write, and whether it must be written. */
export interface CardTarget {
  session: string | null;
  paymentMethod: string | null;
  write: boolean;
}

/**
 * Brings Stripe to the row's newest card, starting at `first`, until the row says it is done, which also frees the lock.
 * Answers the session that ended up done. A failed write of an older card goes on to the newer one, so a card refused by
 * Stripe cannot hold up the card after it. Throws when it stops without that: the caller lets go, and needs_repair stays set.
 */
export async function writeNewestCard(locks: CardLocks, cardId: string, token: string, first: CardTarget, write: (paymentMethod: string) => Promise<void>): Promise<string | null> {
  let target = first;
  let failure: unknown = null;
  for (let attempt = 0; attempt < CARD_WRITES; attempt++) {
    let wrote = true;
    if (target.write) {
      try {
        if (!target.paymentMethod) throw new Error("The newest card update has no card");
        await write(target.paymentMethod);
      } catch (e) {
        wrote = false;
        failure = e;
        console.error("[billing] card write failed", e instanceof Error ? e.message : "failed");
      }
    }
    const answer = await locks.finishCardLock(cardId, token, target.session, wrote);
    if (answer.state === "done") return target.session;
    if (answer.state === "lost") throw new Error("The card lock was lost");
    if (answer.state === "newer") target = { session: answer.session, paymentMethod: answer.paymentMethod, write: true };
    else target = { ...target, write: true };
  }
  throw failure instanceof Error ? failure : new Error("Card updates kept overtaking this one");
}

/** Lets go, and only logs when it cannot: the lock ends on its own, and the caller's answer stands. */
export async function letGoOfCardLock(locks: CardLocks, cardId: string, token: string) {
  try {
    await locks.releaseCardLock(cardId, token);
  } catch (e) {
    console.error("[billing] card lock release failed", e instanceof Error ? e.message : "failed");
  }
}
