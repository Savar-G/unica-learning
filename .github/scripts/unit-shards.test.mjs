import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadTimings, PINNED_SHARD_FILES, planShards, sortByDuration } from "./unit-shards.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const TIMINGS = loadTimings(fileURLToPath(new URL("./unit-timings.json", import.meta.url)));
const EXCLUDED = new Set([
  "src/lib/maya-gate/gate.test.ts",
  "src/lib/maya-gate/word-count-grade-1.test.ts",
  "src/lib/maya-gate/word-count-grade-4.test.ts",
]);

function walkTests(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTests(full, out);
    else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      const rel = path.relative(ROOT, full).split(path.sep).join("/");
      if (!EXCLUDED.has(rel)) out.push(rel);
    }
  }
  return out.sort();
}

test("planShards forms a complete, disjoint partition of every unit test file", () => {
  const files = walkTests(path.join(ROOT, "src"));
  assert.ok(files.length > 900, `expected >900 unit test files, got ${files.length}`);

  const shards = planShards(files, { shardCount: 5, timings: TIMINGS });
  assert.equal(shards.length, 5);

  const seen = new Set();
  for (const shard of shards) {
    assert.ok(shard.items.length > 0, `shard ${shard.index} must not be empty`);
    for (const file of shard.items) {
      assert.equal(seen.has(file), false, `duplicate assignment for ${file}`);
      seen.add(file);
    }
  }
  assert.deepEqual([...seen].sort(), files);

  const totals = shards.map((s) => s.totalMs);
  const spread = Math.max(...totals) - Math.min(...totals);
  assert.ok(spread < 10_000, `expected balanced shards within 10s worker-sec, got spread ${spread}ms (${totals.join(", ")})`);
});

test("workbook-book1-recovery.test.ts is always pinned to shard 1", () => {
  const files = walkTests(path.join(ROOT, "src"));
  for (const shardCount of [2, 4, 5, 6]) {
    const shards = planShards(files, { shardCount, timings: TIMINGS });
    for (const [pinnedFile, pinnedShard] of Object.entries(PINNED_SHARD_FILES)) {
      assert.ok(shards[pinnedShard - 1].items.includes(pinnedFile), `${pinnedFile} missing from shard ${pinnedShard} (count=${shardCount})`);
    }
  }
});

test("planShards is deterministic regardless of input order and assigns unknown new files", () => {
  const files = [
    "src/lib/workbook-book1-recovery.test.ts",
    "src/lib/brand-new-unmeasured.test.ts",
    "src/lib/a.test.ts",
    "src/lib/b.test.ts",
    "src/lib/c.test.ts",
  ];
  const timings = { "src/lib/a.test.ts": 100_000, "src/lib/b.test.ts": 50_000, "src/lib/c.test.ts": 10_000 };
  const forward = planShards(files, { shardCount: 3, timings });
  const reversed = planShards([...files].reverse(), { shardCount: 3, timings });
  assert.deepEqual(forward, reversed);

  const assigned = forward.flatMap((s) => s.items);
  assert.ok(assigned.includes("src/lib/brand-new-unmeasured.test.ts"));
  assert.equal(new Set(assigned).size, files.length);
});

test("sortByDuration orders slowest files first with deterministic tie-breaking", () => {
  const sorted = sortByDuration(["src/b.test.ts", "src/a.test.ts", "src/slow.test.ts", "src/unknown.test.ts"], {
    timings: { "src/slow.test.ts": 300_000, "src/a.test.ts": 100, "src/b.test.ts": 100 },
  });
  assert.deepEqual(sorted, ["src/slow.test.ts", "src/unknown.test.ts", "src/a.test.ts", "src/b.test.ts"]);
});
