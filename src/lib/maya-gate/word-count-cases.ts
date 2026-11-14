import { availableParallelism } from "node:os";
import { afterAll, describe, expect, it } from "vitest";
import { BEHAVIOURS } from "./behaviours";
import { runGateBehaviour, judgeSaved } from "./call";
import { memoryTraceStore, isBackupClose, type Behaviour } from "./gate";
import { gateWordCount } from "./word-count";

/** Keep every behaviour and seed, with a separate timeout budget for each seed. */
export function gradeWordCountCases(grade: 1 | 4) {
  describe(`all emitted turns and fallbacks obey the grade ${grade} limit`, () => {
    let outputs = 0;
    let fallbacks = 0;
    it.each([1, 9, 31])("seed %s", async (seed) => {
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
      if (process.env.CI) {
        const cpu = process.cpuUsage(cpuStart);
        console.info(JSON.stringify({ check: "maya-word-count-timing", pid: process.pid, parallelism: availableParallelism(),
          worker: process.env.VITEST_POOL_ID ?? null, grade, seed, behaviours: BEHAVIOURS.length,
          outputs: outputs - beforeOutputs, fallbacks: fallbacks - beforeFallbacks,
          wallMs: performance.now() - started, cpuMs: (cpu.user + cpu.system) / 1000 }));
      }
    });
    afterAll(() => {
      expect(outputs).toBeGreaterThan(1000);
      expect(fallbacks).toBeGreaterThan(0);
    });
  });
}
