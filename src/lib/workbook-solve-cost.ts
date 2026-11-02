// The live solve check with its cost (#312 round 3, after #380 round 7): the generator's solve check (aiSolver,
// src/lib/workbook-solve-check.ts) on the solve model's client, each answer's cost asked of OpenRouter (costingFetch)
// and kept until the check's log comes, so the job stores every check with what it cost (public.workbook_run_solves).
// A check is matched to its cost by what the reader was shown; a check that was late gets none (its answer may still
// cost: that cost goes to the next check of the same printed words, or to none).
// No Next.js; the client maker is passed in (aiSolveClient in live use).
import type { AiClient } from "@/lib/ai-client";
import { costingFetch } from "@/lib/ai-openrouter";
import { aiSolver, type SolveLog, type Solver } from "@/lib/workbook-solve-check";

export interface CostedSolver {
  solver: Solver;
  /** The cost of the check this log is of, in US dollars; null when the provider said none (or it was late). */
  cost(log: SolveLog): number | null;
}

/** The solver and its costs, or null when `client` makes none (the AI is off). `base`: the fetch under the cost's (tests). */
export function costedSolver(client: (fetch: typeof globalThis.fetch) => AiClient | null, base: typeof globalThis.fetch = globalThis.fetch): CostedSolver | null {
  const model = client(base)?.model;
  if (!model) return null;
  const costs = new Map<string, number[]>();
  const keyOf = (questions: SolveLog["questions"]) => JSON.stringify(questions);
  return {
    solver: {
      model,
      async solve(request, signal) {
        let usd: number | null = null;
        const ai = client(costingFetch((c) => { usd = (usd ?? 0) + c; }, base));
        if (!ai) throw new Error("the AI is off");
        try {
          return await aiSolver(ai).solve(request, signal);
        } finally {
          if (usd !== null) {
            const key = keyOf(request.questions);
            costs.set(key, [...(costs.get(key) ?? []), usd]);
          }
        }
      },
    },
    cost(log) {
      const key = keyOf(log.questions);
      const [first, ...rest] = costs.get(key) ?? [];
      if (first === undefined) return null;
      if (rest.length) costs.set(key, rest);
      else costs.delete(key);
      return first;
    },
  };
}
