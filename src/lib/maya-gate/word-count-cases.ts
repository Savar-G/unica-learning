import { availableParallelism } from "node:os";
import { afterAll, describe, expect, it } from "vitest";
import { BEHAVIOURS } from "./behaviours";
import { runGateBehaviour, judgeSaved } from "./call";
import { memoryTraceStore, isBackupClose, type Behaviour } from "./gate";
import { gateWordCount } from "./word-count";

// A seed walks all 564 behaviours, and the gate's own work is 96% of its cost (28 s of a 32 s seed locally: judging is
// 4 s and word counting rounds to nothing), spread evenly with no behaviour over 252 ms. So a seed's cost is one gate run
// a behaviour, plus the first seed's share of module and JIT warm-up, and it cannot be cut without cutting behaviours or
// seeds, which are the two things this test proves: every scenario stays inside the limit, and every wording a seed picks
// does too. Keep all of them and budget the cost instead.
//
// The three files of the maya-behaviour job share four vCPUs. Five consecutive runs of that job's own command on
// 2026-11-23 took 24.3 to 42.6 s a seed, 43 to 75 ms a behaviour (median 52). The first seed of each file is the
// slowest because it pays the warm-up, not because of its number: run with the seeds as 31, 9, 1 the same file took
// 46.2 and 48.4 s for seed 31 and 35.8 and 37.0 s for seed 1. The 2026-11-21 run that timed out took 41.1 to 78.6 s a
// seed, 73 to 139 ms a behaviour, seed 1 of each file at the top of that range for the same reason.
// 300 ms is 2.2x that slowest CI seed and 5.8x the median local one, so a gate four times slower fails here with its
// measurement in the message; the per-seed timeout below is only a hang guard, 1.4x this budget, so a slow run reports
// the number instead of a timeout.
const SEEDS = [1, 9, 31];
const BUDGET_MS_PER_BEHAVIOUR = 300;
const HANG_GUARD_MS = 240_000;

/** Keep every behaviour and seed, with a separate budget and hang guard for each seed. */
export function gradeWordCountCases(grade: 1 | 4) {
  describe(`all emitted turns and fallbacks obey the grade ${grade} limit`, () => {
    let outputs = 0;
    let fallbacks = 0;
    it.each(SEEDS)("seed %s", async (seed) => {
      const started = performance.now(), cpuStart = process.cpuUsage();
      const beforeOutputs = outputs, beforeFallbacks = fallbacks;
      for (const original of BEHAVIOURS) {
        // Keep each scenario and its safety checks. Original exact flow counts apply to its own grade and seed only.
        const b: Behaviour = { ...original, grade, expect: { outcome: {}, flag: original.expect.flag, safety: original.expect.safety } };
        const store = memoryTraceStore();
        expect((await runGateBehaviour(b, store, { seed })).error, `${b.id}, seed ${seed}`).toBeNull();
        const v = judgeSaved(b, store);
        expect(v.failures.filter((f) => f.detail === "Maya exceeded the spoken word limit"), `${b.id}, seed ${seed}`).toEqual([]);
        for (const t of v.trace!.turns) {
          if (t.kind !== "maya" || !t.output || t.output.act === "safety") continue;
          outputs++;
          const count = gateWordCount(t.output.say.join(" "));
          if (!isBackupClose(t)) expect(count, `${b.id}, seed ${seed}: ${t.output.say.join(" ")}`).toBeLessThanOrEqual(grade <= 3 ? 25 : 45);
          if (t.attempts.at(-1)?.source === "fallback") fallbacks++;
        }
      }
      const wallMs = performance.now() - started;
      const perBehaviour = wallMs / BEHAVIOURS.length;
      if (process.env.CI) {
        const cpu = process.cpuUsage(cpuStart);
        console.info(JSON.stringify({ check: "maya-word-count-timing", pid: process.pid, parallelism: availableParallelism(),
          worker: process.env.VITEST_POOL_ID ?? null, grade, seed, behaviours: BEHAVIOURS.length,
          outputs: outputs - beforeOutputs, fallbacks: fallbacks - beforeFallbacks,
          wallMs, perBehaviourMs: perBehaviour, cpuMs: (cpu.user + cpu.system) / 1000 }));
      }
      expect(Math.round(perBehaviour), `${Math.round(perBehaviour)} ms a behaviour, over ${BEHAVIOURS.length}, grade ${grade} seed ${seed}`).toBeLessThan(BUDGET_MS_PER_BEHAVIOUR);
    }, HANG_GUARD_MS);
    afterAll(() => {
      expect(outputs).toBeGreaterThan(1000);
      expect(fallbacks).toBeGreaterThan(0);
    });
  });
}
