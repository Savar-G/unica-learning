// The next-book step on the service client, for the /api/reminders run (#476). Off unless NEXT_BOOK_PREPARE_ENABLED is
// "test-only" or "families"; with no planner it answers planner-not-ready before any read or write.
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
  client: (signal: AbortSignal) => SupabaseClient<Database> | null = signal => adminClient(signal)) {
  const release = nextBookRelease(env);
  if (!release) return null;
  return {
    async run(time: { now(): number; endAt: number }): Promise<NextBookStepResult> {
      let stepSignal: AbortSignal | undefined;
      let db: SupabaseClient<Database> | null | undefined;
      // Clients are made only when a planner exists, and their requests stop at the step's end.
      const signal = () => stepSignal ??= AbortSignal.timeout(Math.max(1, time.endAt - time.now()));
      const service = () => db === undefined ? (db = client(signal())) : db;
      const unavailable = (): never => { throw new Error("next_book_service_unavailable"); };
      return runNextBookStep({
        release, planner: nextBookPlanner(), time,
        prepare: (planner, itemSignal) => {
          const wiring = nextBookWiring(planner);
          if (!wiring) return null;
          // Each item has its own client: once its deadline passes, none of its requests reach the database.
          const itemDb = itemSignal ? client(AbortSignal.any([itemSignal, signal()])) : service();
          const selection = itemSignal ? ((scope: Parameters<typeof wiring.selection>[0]) => untilAborted(() => wiring.selection(scope), itemSignal)) : wiring.selection;
          const server = itemDb ? nextBookSnapshotServer({ planner: wiring.planner, selection }, itemDb) : null;
          return server ? server.prepare : null;
        },
        reader: { page: input => nextBookDueStore(service() ?? unavailable()).page(input) },
        testAccount: parentId => isTestAccount(service() ?? unavailable(), parentId),
        openPlan: async input => (await childPlanAccess(input, { db: service() ?? unavailable() })).open,
      });
    },
  };
}
