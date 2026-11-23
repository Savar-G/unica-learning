import { describe, expect, it } from "vitest";
import { killActiveReaders, spawnCli } from "./read-cli";

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("killActiveReaders", () => {
  it("also stops a helper process that the reader started", async () => {
    // The stand-in reader starts a helper, prints the helper's process id, and waits.
    const script = [
      'const { spawn } = require("node:child_process");',
      'const helper = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });',
      "console.log(helper.pid);",
      "setTimeout(() => {}, 60000);",
    ].join("\n");
    const run = spawnCli(process.execPath, ["-e", script], { cwd: process.cwd(), timeoutMs: 60_000 });
    await new Promise((resolve) => setTimeout(resolve, 600));
    killActiveReaders();
    const result = await run;
    const helperPid = Number(result.stdout.trim());
    expect(Number.isInteger(helperPid) && helperPid > 0).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(isAlive(helperPid)).toBe(false);
  });

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
