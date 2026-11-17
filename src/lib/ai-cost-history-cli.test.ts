import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { historyFixture } from "./ai-cost-history.fixtures";
beforeEach(() => vi.clearAllMocks());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("runs the offline CLI by default and emits only a count, with private failures hidden", () => {
  const dir = mkdtempSync(join(tmpdir(), "unica-history-cli-test-"));
  try {
    const f = historyFixture();
    const csv = join(dir, "source.csv"), manifest = join(dir, "manifest.json"), snapshot = join(dir, "snapshot.bin");
    writeFileSync(csv, f.csv); writeFileSync(manifest, JSON.stringify(f.manifest)); writeFileSync(snapshot, f.snapshots[0]);
    const args = ["scripts/import-ai-cost-history.mjs", "--csv", csv, "--manifest", manifest, "--snapshot", snapshot];
    const options = { encoding: "utf8" as const, env: { PATH: process.env.PATH, NODE_ENV: "test" as const } };
    const output = execFileSync(process.execPath, args, options);
    expect(output).toBe("Validated dry run: 4 evidence rows. No database requests.\n");
    writeFileSync(snapshot, "changed synthetic evidence");
    const failure = spawnSync(process.execPath, [...args, "--apply"], options);
    expect(failure.status).toBe(1); expect(failure.stdout).toBe("");
    expect(failure.stderr).toContain("No success is claimed");
    expect(failure.stderr).not.toMatch(/gen-|0\.100000|private location|quoted|source\.csv|manifest\.json|changed synthetic/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
