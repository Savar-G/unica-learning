// The next-book step on the service client, for the /api/reminders run (#476). Off unless NEXT_BOOK_PREPARE_ENABLED is
// "test-only" or "families"; with no planner it answers planner-not-ready before any read or write.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import { nextBookPlanner, nextBookWiring } from "./next-book-planner";
import { nextBookSnapshotServer } from "./next-book-snapshot-server";
import { nextBookRelease, runNextBookStep, type NextBookStepEnvironment, type NextBookStepResult } from "./next-book-step";
import { isTestAccount, nextBookDueStore } from "./next-book-step-store";
import { childPlanAccess } from "./plan-access";
import { adminClient } from "./supabase-auth";

/** Null when the switch is off: the step does not run. */
export function createNextBookStepServer(env: NextBookStepEnvironment,
  client: (signal: AbortSignal) => SupabaseClient<Database> | null = signal => adminClient(signal)) {
  const release = nextBookRelease(env);
  if (!release) return null;
  return {
    async run(time: { now(): number; endAt: number }): Promise<NextBookStepResult> {
      let db: SupabaseClient<Database> | null | undefined;
      // The client is made only when a planner exists, and its requests stop at the step's end.
      const service = () => db === undefined ? (db = client(AbortSignal.timeout(Math.max(1, time.endAt - time.now())))) : db;
      const unavailable = (): never => { throw new Error("next_book_service_unavailable"); };
      return runNextBookStep({
        release, planner: nextBookPlanner(), time,
        prepare: planner => {
          const wiring = nextBookWiring(planner);
          const server = wiring ? nextBookSnapshotServer(wiring, service()) : null;
          return server ? server.prepare : null;
        },
        reader: { due: input => nextBookDueStore(service() ?? unavailable()).due(input) },
        testAccount: parentId => isTestAccount(service() ?? unavailable(), parentId),
        openPlan: async input => (await childPlanAccess(input, { db: service() ?? unavailable() })).open,
      });
    },
  };
}
