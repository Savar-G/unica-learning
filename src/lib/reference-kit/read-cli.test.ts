import { describe, expect, it } from "vitest";
import { killActiveReaders, spawnCli } from "./read-cli";

describe("killActiveReaders", () => {
  it("stops a reader process that still runs, at once", async () => {
    const started = Date.now();
    // A stand-in for a reader: a process that would run for a minute.
    const run = spawnCli(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], {
      cwd: process.cwd(),
      timeoutMs: 60_000,
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    killActiveReaders();
    const result = await run;
    expect(result.code).not.toBe(0);
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
