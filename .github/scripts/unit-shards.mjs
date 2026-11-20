import { readFileSync } from "node:fs";
import path from "node:path";

export const DEFAULT_WEIGHT_MS = 2000;

/**
 * Files pinned to a specific 1-based shard index.
 * `workbook-book1-recovery.test.ts` loads pinned historical planners from Git objects, so pinning it to shard 1 lets
 * every other shard run with a shallow `fetch-depth: 1` clone instead of downloading the full 400+ MiB pack.
 */
export const PINNED_SHARD_FILES = Object.freeze({
  "src/lib/workbook-book1-recovery.test.ts": 1,
});

export function loadTimings(timingsPath) {
  return JSON.parse(readFileSync(timingsPath, "utf8"));
}

export function toRepoRelative(filePath, rootDir) {
  const rel = path.isAbsolute(filePath) ? path.relative(rootDir, filePath) : filePath;
  return rel.split(path.sep).join("/");
}

export function weightOf(relPath, timings, defaultWeight = DEFAULT_WEIGHT_MS) {
  const value = timings[relPath];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : defaultWeight;
}

/**
 * Deterministically partitions `items` into `shardCount` duration-balanced shards (1-based index) using Longest
 * Processing Time (LPT) bin packing. Pinned files are placed first; unknown files receive `defaultWeight` and are
 * still guaranteed to be assigned to exactly one shard.
 */
export function planShards(items, {
  shardCount,
  timings = {},
  pinned = PINNED_SHARD_FILES,
  keyOf = (item) => item,
  defaultWeight = DEFAULT_WEIGHT_MS,
}) {
  if (!Number.isInteger(shardCount) || shardCount < 1) {
    throw new Error(`shardCount must be a positive integer, got ${shardCount}`);
  }
  const shards = Array.from({ length: shardCount }, (_, i) => ({
    index: i + 1,
    totalMs: 0,
    items: [],
  }));

  const decorated = items.map((item) => {
    const key = keyOf(item);
    return { item, key, ms: weightOf(key, timings, defaultWeight) };
  });

  // Sort deterministically by (weight desc, key asc) so input order never affects shard membership.
  decorated.sort((a, b) => b.ms - a.ms || a.key.localeCompare(b.key));

  const remaining = [];
  for (const entry of decorated) {
    const pinnedIndex = pinned[entry.key];
    if (pinnedIndex !== undefined && pinnedIndex >= 1 && pinnedIndex <= shardCount) {
      const target = shards[pinnedIndex - 1];
      target.items.push(entry.item);
      target.totalMs += entry.ms;
    } else {
      remaining.push(entry);
    }
  }

  for (const entry of remaining) {
    let lightest = shards[0];
    for (let i = 1; i < shards.length; i++) {
      if (shards[i].totalMs < lightest.totalMs) lightest = shards[i];
    }
    lightest.items.push(entry.item);
    lightest.totalMs += entry.ms;
  }

  return shards;
}

/**
 * Sorts files longest-first so multi-minute outliers start at t=0 on Worker 1 while fast files run in parallel on
 * the remaining workers.
 */
export function sortByDuration(items, {
  timings = {},
  keyOf = (item) => item,
  defaultWeight = DEFAULT_WEIGHT_MS,
}) {
  return [...items].sort((a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    return weightOf(kb, timings, defaultWeight) - weightOf(ka, timings, defaultWeight) || ka.localeCompare(kb);
  });
}
