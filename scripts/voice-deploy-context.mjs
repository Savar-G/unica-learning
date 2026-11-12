// Stages the folder LiveKit Cloud builds Maya's voice worker from (#533, docs/maya-voice-deploy.md). `lk agent create`
// and `lk agent deploy` upload the folder they run in and build its Dockerfile there, but the worker's bundle needs the
// site's src/lib. This copies only the committed files the image needs, from one git ref (default HEAD), into a folder
// outside the repository: src/lib and worker/maya-voice from `git archive` (no untracked file, no .env, no
// node_modules), the Dockerfile and its ignore file at the top, and livekit.toml when it has an agent id.
//
// Usage: npm run voice:stage -- [--ref <git ref>] [--out <folder>]
// Then:  cd <folder> && lk agent create --secrets-file <file>   (first time) or lk agent deploy (later)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};
const ref = option("ref") ?? "HEAD";
const out = resolve(option("out") ?? join(tmpdir(), "unica-maya-voice-deploy"));
const MARK = ".unica-maya-voice-stage";

const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/** The agent id in a livekit.toml, or "" when it is not set yet. */
export function agentId(toml) {
  const agent = /^\s*\[agent\]\s*$([\s\S]*?)(?=^\s*\[|(?![\s\S]))/m.exec(toml)?.[1] ?? "";
  return /^\s*id\s*=\s*"([^"]*)"/m.exec(agent)?.[1].trim() ?? "";
}

function main() {
  if (out === resolve(root) || out.startsWith(resolve(root) + sep)) throw new Error(`--out must be outside the repository (${out})`);
  if (existsSync(out) && readdirSync(out).length > 0) {
    if (!existsSync(join(out, MARK))) throw new Error(`${out} is not empty and was not staged by this script`);
    // Keep the livekit.toml a first `lk agent create` wrote, until it is copied into the repository.
    const written = existsSync(join(out, "livekit.toml")) && agentId(readFileSync(join(out, "livekit.toml"), "utf8"));
    if (written && !agentId(git("show", `${ref}:worker/maya-voice/livekit.toml`))) {
      throw new Error(`${out}/livekit.toml has the agent id from lk agent create; copy it to worker/maya-voice/livekit.toml and commit it first`);
    }
    rmSync(out, { recursive: true, force: true });
  }
  mkdirSync(out, { recursive: true });
  const dirty = git("status", "--porcelain", "--", "src/lib", "worker/maya-voice").trim();
  if (dirty && ref === "HEAD") console.warn(`Uncommitted changes under src/lib or worker/maya-voice are not staged (only ${ref} is):\n${dirty}`);
  const tar = execFileSync("git", ["archive", "--format=tar", ref, "src/lib", "worker/maya-voice"], { cwd: root, maxBuffer: 256 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", out], { input: tar });
  const show = (path) => git("show", `${ref}:${path}`);
  writeFileSync(join(out, "Dockerfile"), show("worker/maya-voice/Dockerfile"));
  writeFileSync(join(out, ".dockerignore"), show("worker/maya-voice/Dockerfile.dockerignore"));
  // The LiveKit CLI (2.19) refuses a folder with no project file at its top. The .dockerignore keeps this copy out of
  // the image, which installs from worker/maya-voice/package.json as before.
  writeFileSync(join(out, "package.json"), show("worker/maya-voice/package.json"));
  const toml = show("worker/maya-voice/livekit.toml");
  if (agentId(toml)) writeFileSync(join(out, "livekit.toml"), toml);
  writeFileSync(join(out, MARK), `${git("rev-parse", ref).trim()}\n`);
  console.log(`Staged ${ref} (${git("rev-parse", "--short", ref).trim()}) in ${out}`);
  console.log(agentId(toml)
    ? `Next: cd ${out} && lk agent deploy`
    : `Next (first time): cd ${out} && lk agent create --secrets-file <secrets file>\nThen copy ${out}/livekit.toml to worker/maya-voice/livekit.toml and commit it.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }
}
