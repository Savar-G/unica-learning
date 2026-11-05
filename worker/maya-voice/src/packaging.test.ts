import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

// The worker's image (#533): its runtime package.json holds every npm package the bundle leaves outside, at the root
// lockfile's versions (the versions the tests and the typecheck ran with), and the Dockerfile runs the bundle as the
// worker does locally. These read files only; building the image is `docker build` (docs/maya-voice-deploy.md).

const here = dirname(fileURLToPath(import.meta.url));
const worker = resolve(here, "..");
const root = resolve(worker, "../..");
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const deps: Record<string, string> = json(resolve(worker, "package.json")).dependencies;
const workerDev: Record<string, string> = json(resolve(worker, "package.json")).devDependencies;
const rootLock = json(resolve(root, "package-lock.json")).packages as Record<string, { version: string }>;
const workerLock = json(resolve(worker, "package-lock.json")).packages as Record<string, { version: string }>;
const packageOf = (spec: string) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);

describe("the worker image's packages", () => {
  it("are at the versions the root lockfile installs, in the worker's own lockfile too", () => {
    for (const [name, version] of Object.entries({ ...deps, ...workerDev })) {
      expect(rootLock[`node_modules/${name}`]?.version, name).toBe(version);
      expect(workerLock[`node_modules/${name}`]?.version, name).toBe(version);
    }
    // LiveKit's native module for the image's platform is in the worker's lockfile.
    expect(workerLock["node_modules/@livekit/rtc-ffi-bindings-linux-x64-gnu"]).toBeDefined();
  });

  it("hold every package the bundle imports, and nothing else", async () => {
    const r = await build({
      absWorkingDir: root, entryPoints: [resolve(worker, "src/main.ts")], bundle: true, platform: "node", target: "node22", format: "esm",
      packages: "external", alias: { "@": resolve(root, "src") }, conditions: ["react-server"], write: false, metafile: true, logLevel: "silent",
      outfile: resolve(worker, "dist/main.mjs"),
    });
    // The bundle's own imports, as it runs (type-only imports are gone by then).
    const output = Object.values(r.metafile.outputs)[0];
    const imported = new Set(output.imports.filter(x => x.external && !x.path.startsWith("node:")).map(x => packageOf(x.path)));
    expect([...imported].filter(p => p.startsWith("@/"))).toEqual([]);
    expect([...imported].sort()).toEqual(Object.keys(deps).sort());
    // Only the site's src/lib and the worker's own sources are bundled: what the Dockerfile copies.
    for (const f of Object.keys(r.metafile.inputs)) expect(f).toMatch(/^(src\/lib\/|worker\/maya-voice\/src\/)/);
  });
});

describe("the Dockerfile", () => {
  const docker = readFileSync(resolve(worker, "Dockerfile"), "utf8");
  const ignore = readFileSync(resolve(worker, "Dockerfile.dockerignore"), "utf8");

  it("builds on a glibc Node image at the version the worker targets and runs the bundle with `start`", () => {
    const froms = [...docker.matchAll(/^FROM (\S+)/gm)].map(m => m[1]);
    expect(froms).toHaveLength(2);
    for (const f of froms) expect(f).toBe("node:${NODE_VERSION}-bookworm-slim");
    expect(docker).toMatch(/^ARG NODE_VERSION=22\.\d+\.\d+$/m);
    expect(docker).toMatch(/^CMD \["node", "dist\/main\.mjs", "start"\]$/m);
    expect(docker).toMatch(/NODE_OPTIONS=--conditions=react-server/);
    expect(docker).toMatch(/^USER appuser$/m);
    // No secret is baked into the image.
    expect(docker).not.toMatch(/LIVEKIT_API_SECRET=|_KEY=/);
  });

  it("copies only paths its ignore file lets in", () => {
    const copied = [...docker.matchAll(/^COPY (?!--from)(.+) \S+$/gm)].flatMap(m => m[1].split(/\s+/));
    const allowed = ignore.split("\n").filter(l => l.startsWith("!")).map(l => l.slice(1));
    for (const c of copied) expect(allowed.some(a => c === a || c.startsWith(`${a}/`)), c).toBe(true);
    expect(ignore).toMatch(/^\*$/m);
    expect(ignore).toMatch(/\.env/);
  });

  it("has a livekit.toml with the project and agent keys, empty until lk agent create fills them", async () => {
    const toml = readFileSync(resolve(worker, "livekit.toml"), "utf8");
    expect(toml).toMatch(/^\[project\]\s*\n\s*subdomain = "[^"]*"/m);
    expect(toml).toMatch(/^\[agent\]\s*\n\s*id = "[^"]*"/m);
    const stage = (await import(resolve(root, "scripts/voice-deploy-context.mjs") as string)) as { agentId(toml: string): string };
    expect(stage.agentId(toml)).toBe("");
    expect(stage.agentId('[project]\n  subdomain = "unica"\n\n[agent]\n  id = "CA_abc123"\n')).toBe("CA_abc123");
    expect(stage.agentId('[agent]\n  id = ""\n[other]\n  id = "x"\n')).toBe("");
  });
});
