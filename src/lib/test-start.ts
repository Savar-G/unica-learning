// "Start test", "Continue test", "Finish test" and "Start again" on the server (#72). The rules come from the
// assessment core (decideStart); this runs them against the store. The store is a small interface, so the flow and its
// races can be tested without a database: the real one (src/lib/assessment-store.ts) keeps the same guards with a
// unique index and guarded updates.
import { decideStart, startAttempt, type Attempt } from "@/lib/assessment";

/** A stored attempt, with the seed that drew its questions. */
export type StoredAttempt = Attempt & { seed: number };

export interface StartStore {
  /** The child's attempts. An in-progress one comes with `answeredAll`. */
  attempts(): Promise<StoredAttempt[]>;
  /** Marks the attempt expired, only while it is in progress and its window ended before `now`. */
  expire(id: string, now: number): Promise<void>;
  /** Draws and stores a new test. "taken": the child already has a test in progress (one open test per child). */
  create(seed: number, attempt: Attempt): Promise<{ id: string } | "taken" | "not_ready">;
}

export type StartOutcome =
  | { ok: true; id: string; resumed: boolean }
  | { ok: false; error: "expired" | "not_ready" | "busy" }
  | { ok: false; error: "retake_closed"; opensAt: number };

/** Reads and decides again when another request opened a test in between. Two rounds settle any double click. */
const ROUNDS = 3;

/**
 * Starts or continues one child's test at `now`. `restart` is the family's "Start again" after the test expired.
 * Continuing writes nothing: only a stored answer moves the deadline. Two requests at once (a double click, two tabs)
 * end on the same test: the store lets only one test be open, and the request that loses reads again and continues
 * the winner's test.
 */
export async function startTest(store: StartStore, now: number, { restart, newSeed }: { restart: boolean; newSeed: () => number }): Promise<StartOutcome> {
  for (let round = 0; round < ROUNDS; round++) {
    const attempts = await store.attempts();
    const decision = decideStart(attempts, now, { restart });
    if (decision.action === "refuse") {
      return decision.error === "expired" ? { ok: false, error: "expired" } : { ok: false, error: "retake_closed", opensAt: decision.opensAt };
    }
    // If the test runs out of time before the next answer, the answer route says so and the screen offers Start again.
    if (decision.action === "resume") return { ok: true, id: decision.attemptId, resumed: true };

    if (decision.expire) await store.expire(decision.expire, now);
    // A new test never repeats a seed the child had, so "Start again" and a retake always get new questions.
    const used = new Set(attempts.map((a) => a.seed));
    let seed = newSeed();
    while (used.has(seed)) seed = newSeed();
    const created = await store.create(seed, startAttempt("", now));
    if (created === "not_ready") return { ok: false, error: "not_ready" };
    if (created !== "taken") return { ok: true, id: created.id, resumed: false };
    // Another request opened a test first: read again, and continue that one.
  }
  return { ok: false, error: "busy" };
}
