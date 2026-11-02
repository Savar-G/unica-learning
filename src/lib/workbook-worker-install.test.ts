import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Execute the installer through its public shell interface. Only the worker process is real.
// All service, git and npm operations use a temporary PATH and a temporary home directory.
describe("the workbook worker installer", () => {
  it("R404-7 waits for the old process to exit before changing code or dependencies", async () => {
    const dir = await mkdtemp(join(tmpdir(), "workbook-installer-"));
    const bin = join(dir, "bin");
    const checkout = join(dir, "worker");
    const log = join(dir, "events");
    const ended = join(dir, "ended");
    await mkdir(bin);
    await mkdir(join(checkout, ".git"), { recursive: true });
    const running = spawn(process.execPath, ["-e", `
      const fs = require("node:fs");
      process.on("SIGTERM", () => setTimeout(() => { fs.writeFileSync(${JSON.stringify(ended)}, "done"); process.exit(0); }, 300));
      console.log("ready");
      setInterval(() => {}, 1000);
    `], { stdio: ["ignore", "pipe", "ignore"] });
    try {
      await new Promise<void>((resolve, reject) => {
        running.on("error", reject);
        running.stdout!.once("data", () => resolve());
      });
      const script = (name: string, text: string) => writeFile(join(bin, name), `#!/bin/bash\n${text}\n`, { mode: 0o755 });
      await script("node", "exit 0");
      await script("claude", "exit 0");
      for (const name of ["git", "npm"]) {
        await script(name, `if [ ! -f '${ended}' ]; then echo mutation-before-stop >> '${log}'; exit 71; fi\necho ${name} >> '${log}'`);
      }
      await script("launchctl", `case "$1" in
        print) echo 'pid = ${running.pid}' ;;
        bootout) echo bootout >> '${log}'; kill -TERM ${running.pid} ;;
        bootstrap) echo bootstrap >> '${log}' ;;
      esac`);
      const install = spawn("/bin/bash", [fileURLToPath(new URL("../../scripts/install-workbook-worker.sh", import.meta.url))], {
        env: { ...process.env, HOME: dir, WORKER_DIR: checkout, PATH: `${bin}:/usr/bin:/bin` }, stdio: "ignore",
      });
      const code = await new Promise<number | null>((resolve, reject) => { install.on("error", reject); install.on("exit", resolve); });
      const events = (await readFile(log, "utf8")).trim().split("\n");
      expect({ code, events }).toEqual({ code: 0, events: ["bootout", "git", "git", "npm", "bootstrap"] });
    } finally {
      running.kill("SIGKILL");
      await rm(dir, { recursive: true, force: true });
    }
  });
});
