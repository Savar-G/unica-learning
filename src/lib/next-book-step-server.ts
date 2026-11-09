// The next-book step on the service client, for the /api/reminders run (#476). Off unless NEXT_BOOK_PREPARE_ENABLED is
// "test-only" or "families"; with no planner it answers planner-not-ready before any read or write.
//
// Every request of the step goes through one client bound to the step's deadline signal, with the SDK's retries off: a
// GET that times out is not tried again after the deadline (the SDK retries a TimeoutError after 1, 2 and 4 seconds).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import { nextBookPlanner, nextBookWiring } from "./next-book-planner";
import { nextBookSnapshotServer } from "./next-book-snapshot-server";
import { nextBookRelease, runNextBookStep, untilAborted, type NextBookStepEnvironment, type NextBookStepResult } from "./next-book-step";
import { isTestAccount, nextBookDueStore } from "./next-book-step-store";
import { childPlanAccess } from "./plan-access";
import { adminClient } from "./supabase-auth";

/** Null when the switch is off: the step does not run. */
export function createNextBookStepServer(env: NextBookStepEnvironment,
  client: (signal: AbortSignal) => SupabaseClient<Database> | null = signal => adminClient(signal, { retry: false })) {
  const release = nextBookRelease(env);
  if (!release) return null;
  return {
    async run(time: { now(): number; endAt: number }): Promise<NextBookStepResult> {
      const clients = new WeakMap<AbortSignal, SupabaseClient<Database> | null>();
      /** One client per step signal, made only once a planner exists. */
      const clientFor = (signal: AbortSignal) => {
        if (!clients.has(signal)) clients.set(signal, client(signal));
        return clients.get(signal) ?? null;
      };
      const service = (signal: AbortSignal) => clientFor(signal) ?? (() => { throw new Error("next_book_service_unavailable"); })();
      return runNextBookStep({
        release, planner: nextBookPlanner(), time,
        prepare: (planner, signal) => {
          const wiring = nextBookWiring(planner);
          if (!wiring) return null;
          // The readiness check (no signal) only asks whether a client can be made; it sends nothing.
          const db = clientFor(signal ?? new AbortController().signal);
          if (!db || !signal) return db ? async () => { throw new Error("next_book_no_signal"); } : null;
          const selection = (scope: Parameters<typeof wiring.selection>[0]) => untilAborted(() => wiring.selection(scope), signal);
          return nextBookSnapshotServer({ planner: wiring.planner, selection }, db)?.prepare ?? null;
        },
        reader: { page: input => nextBookDueStore(service(input.signal!)).page(input) },
        testAccount: (parentId, signal) => isTestAccount(service(signal), parentId, signal),
        openPlan: async (input, signal) => (await childPlanAccess(input, { db: service(signal) })).open,
      });
    },
  };
}
