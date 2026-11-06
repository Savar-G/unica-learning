import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
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
        env: { ...process.env, WORKBOOK_SUBSCRIPTION_PROVIDER: "claude", HOME: dir, WORKER_DIR: checkout, PATH: `${bin}:/usr/bin:/bin` }, stdio: "ignore",
      });
      const code = await new Promise<number | null>((resolve, reject) => { install.on("error", reject); install.on("exit", resolve); });
      const events = (await readFile(log, "utf8")).trim().split("\n");
      expect({ code, events }).toEqual({ code: 0, events: ["bootout", "git", "git", "npm", "bootstrap"] });
      const envFile = join(dir, ".config/unica/workbook-worker.env");
      expect(await readFile(envFile, "utf8")).toContain("# WORKBOOK_SUBSCRIPTION_PROVIDER=claude");
      expect(await readFile(envFile, "utf8")).toContain("# WORKBOOK_CODEX_HOME=/absolute/path/to/selected-codex-home");
      expect((await stat(envFile)).mode & 0o777).toBe(0o600);
    } finally {
      running.kill("SIGKILL");
      await rm(dir, { recursive: true, force: true });
    }
  });

  it.each([{ provider: "codex", saved: true }, { provider: "invalid", saved: true }, { provider: "codex", saved: false }])("checks saved provider settings before changing the service: %j", async ({ provider, saved }) => {
    const dir = await mkdtemp(join(tmpdir(), "workbook-installer-provider-"));
    try {
      const bin = join(dir, "bin"), codexBin = join(dir, "codex-bin"), checkout = join(dir, "worker");
      const log = join(dir, "events"), envFile = join(dir, ".config/unica/workbook-worker.env");
      await mkdir(bin);
      await mkdir(codexBin);
      await mkdir(join(checkout, ".git"), { recursive: true });
      await mkdir(join(dir, ".config/unica"), { recursive: true });
      const settings = `WORKBOOK_SUBSCRIPTION_PROVIDER=${provider}\nWORKBOOK_CODEX_HOME=/accounts/unify\n`;
      if (saved) await writeFile(envFile, settings);
      await writeFile(log, "");
      await symlink(process.execPath, join(bin, "node"));
      const script = (path: string, body: string) => writeFile(path, `#!/bin/bash\n${body}\n`, { mode: 0o755 });
      await script(join(codexBin, "codex"), "exit 0");
      for (const name of ["git", "npm"]) await script(join(bin, name), `echo ${name} >> '${log}'`);
      await script(join(bin, "launchctl"), `if [ "$1" = print ]; then exit 1; fi\necho "$1" >> '${log}'`);
      const install = spawn("/bin/bash", [fileURLToPath(new URL("../../scripts/install-workbook-worker.sh", import.meta.url))], {
        env: { NODE_ENV: "test", WORKBOOK_SUBSCRIPTION_PROVIDER: saved ? undefined : provider, HOME: dir, WORKER_DIR: checkout, PATH: `${bin}:${codexBin}:/usr/bin:/bin` }, stdio: "ignore",
      });
      const code = await new Promise<number | null>((resolve, reject) => { install.on("error", reject); install.on("close", resolve); });
      if (saved) expect(await readFile(envFile, "utf8")).toBe(settings);
      else await expect(stat(envFile)).rejects.toThrow();
      if (provider === "codex" && saved) {
        expect(code).toBe(0);
        expect(await readFile(log, "utf8")).toBe("git\ngit\nnpm\nbootstrap\n");
        expect(await readFile(join(dir, "Library/LaunchAgents/com.unicalearning.workbook-worker.plist"), "utf8")).toContain(codexBin);
      } else {
        expect(code).not.toBe(0);
        expect(await readFile(log, "utf8")).toBe("");
      }
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
