import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

export type ReaderFamily = "claude" | "codex";

export const READER_PHOTO_FILE = "page.jpg";

export interface CliRunOptions {
  cwd: string;
  stdin?: string;
  timeoutMs: number;
}

export interface CliRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type RunCli = (
  cmd: string,
  args: string[],
  opts: CliRunOptions,
) => Promise<CliRunResult>;

export interface CliInvocation {
  cmd: string;
  args: string[];
  stdin?: string;
}

export function assertModelMatchesFamily(family: ReaderFamily, model?: string): void {
  if (!model) return;
  const normalized = model.trim().toLowerCase();
  if (!normalized) return;

  if (
    family === "claude" &&
    (normalized.startsWith("gpt") ||
      normalized.startsWith("codex") ||
      /^o[134](?:-|$)/.test(normalized))
  ) {
    throw new Error(
      `Refusing --model "${model}" for reader family "claude": model id belongs to the codex/OpenAI family.`,
    );
  }
  if (family === "codex" && normalized.startsWith("claude")) {
    throw new Error(
      `Refusing --model "${model}" for reader family "codex": model id belongs to the claude/Anthropic family.`,
    );
  }
}

export function buildCliInvocation(opts: {
  family: ReaderFamily;
  model?: string;
  photoDir: string;
  photoFile?: string;
  prompt: string;
  codexLastMessagePath?: string;
}): CliInvocation {
  assertModelMatchesFamily(opts.family, opts.model);
  // Always hand the CLI the fixed name "page.jpg" so no original filename leaks.
  const photoPath = join(opts.photoDir, READER_PHOTO_FILE);

  if (opts.family === "claude") {
    const promptWithPhoto = [
      `Read the image file "${READER_PHOTO_FILE}" in the current working directory using the Read tool, then reply with one JSON object only.`,
      "",
      opts.prompt,
    ].join("\n");

    const args = [
      "-p",
      "--output-format",
      "text",
      "--restricted",
      "--safe-mode",
      "--strict-mcp-config",
      "--no-session-persistence",
      "--disable-slash-commands",
      "--tools",
      "Read",
      "--allowedTools",
      "Read",
      "--permission-mode",
      "dontAsk",
    ];
    if (opts.model) {
      args.push("--model", opts.model);
    }
    args.push(promptWithPhoto);
    return { cmd: "claude", args };
  }

  const args = [
    "exec",
    "-i",
    photoPath,
    "-s",
    "read-only",
    "-C",
    opts.photoDir,
    "--skip-git-repo-check",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--color",
    "never",
  ];
  if (opts.codexLastMessagePath) {
    args.push("-o", opts.codexLastMessagePath);
  }
  if (opts.model) {
    args.push("-m", opts.model);
  }
  args.push("-");
  return { cmd: "codex", args, stdin: opts.prompt };
}

const activeReaders = new Set<ChildProcess>();

// Sends the signal to the reader and to every process of its group. Falls back to the reader alone.
function killReaderTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (typeof child.pid === "number") {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // the group is gone or cannot be signalled; try the process itself
    }
  }
  child.kill(signal);
}

// Stops every reader process at once. A stopped reader cannot read anything that the kit puts
// back on disk afterwards.
export function killActiveReaders(): void {
  for (const child of activeReaders) killReaderTree(child, "SIGKILL");
  activeReaders.clear();
}

export const spawnCli: RunCli = (cmd, args, opts) => {
  return new Promise((resolveRun) => {
    // The reader gets its own process group, so that a stop also ends every helper it started.
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      detached: true,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;
    let timedOut = false;

    // When this process stops (also after Ctrl-C), a reader that still runs is stopped too.
    const killOnExit = (): void => {
      killReaderTree(child, "SIGKILL");
    };
    activeReaders.add(child);
    process.once("exit", killOnExit);
    child.once("close", () => {
      activeReaders.delete(child);
      process.off("exit", killOnExit);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      killReaderTree(child, "SIGTERM");
      setTimeout(() => {
        if (!settled) killReaderTree(child, "SIGKILL");
      }, 2000).unref();
    }, opts.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRun({
        code: 1,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: err.message,
      });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      resolveRun({
        code: timedOut ? 124 : (code ?? 1),
        stdout,
        stderr: timedOut ? `${stderr}\nCLI timed out after ${opts.timeoutMs}ms`.trim() : stderr,
      });
    });

    if (opts.stdin !== undefined) {
      child.stdin.write(opts.stdin, "utf8");
    }
    child.stdin.end();
  });
};
