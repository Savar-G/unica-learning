import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import { BaseSequencer } from "vitest/node";
import baseConfig from "../../vitest.config.mts";
import { loadTimings, planShards, sortByDuration, toRepoRelative } from "./unit-shards.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const TIMINGS = loadTimings(fileURLToPath(new URL("./unit-timings.json", import.meta.url)));

class DurationSequencer extends BaseSequencer {
  async shard(files) {
    const { index, count } = this.ctx.config.shard;
    const shards = planShards(files, {
      shardCount: count,
      timings: TIMINGS,
      keyOf: (spec) => toRepoRelative(spec.moduleId, ROOT),
    });
    const picked = shards[index - 1];
    console.info(`[ci-shards] shard ${index}/${count}: ${picked.items.length} files (~${(picked.totalMs / 1000).toFixed(1)}s est worker-sec)`);
    return picked.items;
  }

  async sort(files) {
    return sortByDuration(files, {
      timings: TIMINGS,
      keyOf: (spec) => toRepoRelative(spec.moduleId, ROOT),
    });
  }
}

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      sequence: {
        sequencer: DurationSequencer,
      },
    },
  }),
);
