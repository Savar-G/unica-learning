import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rmSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import dgram from "node:dgram";
import { syncBuiltinESMExports } from "node:module";

export const PIN = "b8d7569bf5c5ea78994ea34befdf1b442a8d2822";
export const root = fileURLToPath(new URL("../..", import.meta.url));
// Do not read credential values or load an env file. Bundled core code receives an empty environment.
process.env = {};
export async function verifySource(files, sourceRoot = root) {
  for (const file of [...new Set([...files, "src/lib/maya-call-seams.ts"])].sort()) {
    const actual = await readFile(join(sourceRoot, file));
    const pinned = execFileSync("/usr/bin/git", ["show", `${PIN}:${file}`], { cwd: root, maxBuffer: 20_000_000 });
    if (!actual.equals(pinned)) throw Error(`Source differs from ${PIN}: ${file}`);
  }
  const seams = await readFile(join(sourceRoot, "src/lib/maya-call-seams.ts"), "utf8");
  if (!/streamChat:\s*false\s*[,}]/.test(seams)) throw Error("Production sentence writing must remain false");
}

export async function bundle() {
  const directory = await mkdtemp(join(tmpdir(), "maya-isolated-stream-"));
  try {
    const common = { absWorkingDir: root, bundle: true, write: false, metafile: true, alias: { "@": join(root, "src") }, logLevel: "warning" };
    const [server, client] = await Promise.all([
      build({ ...common, entryPoints: [join(root, "scripts/maya-isolated-stream/server.ts")], platform: "node", format: "esm", target: "node22", outfile: join(directory, "server.mjs") }),
      build({ ...common, entryPoints: [join(root, "scripts/maya-isolated-stream/client.tsx")], platform: "browser", format: "esm", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' }, outfile: join(directory, "client.js") }),
    ]);
    const sources = Object.keys({ ...server.metafile.inputs, ...client.metafile.inputs }).map(p => relative(root, resolve(root, p))).filter(p => p.startsWith("src/"));
    await verifySource([...sources, "public/desk/maya.webp"]);
    // Service SDKs and production adapters must not enter either dependency graph.
    const inputs = Object.keys({ ...server.metafile.inputs, ...client.metafile.inputs });
    if (inputs.some(p => /node_modules\/(?:@supabase|stripe|next)\/|src\/lib\/.*(?:-server|-store)\.ts$/.test(p))) throw Error("A production service adapter entered the bundle");
    for (const output of [...server.outputFiles, ...client.outputFiles]) await writeFile(output.path, output.contents);
    await copyFile(join(root, "scripts/maya-isolated-stream/index.html"), join(directory, "index.html"));
    await copyFile(join(root, "public/desk/maya.webp"), join(directory, "maya.webp"));
    await writeFile(join(directory, "provenance.json"), JSON.stringify({ pin: PIN, sources: sources.sort() }, null, 2));
    return { directory, sources };
  } catch (e) { await rm(directory, { recursive: true, force: true }); throw e; }
}

export function blockOutbound() {
  const blocked = () => { throw Error("External requests are disabled in the isolated test"); };
  globalThis.fetch = blocked;
  http.request = blocked; http.get = blocked; https.request = blocked; https.get = blocked;
  net.Socket.prototype.connect = blocked;
  dgram.Socket.prototype.send = blocked;
  syncBuiltinESMExports();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(a => a !== "--check" && !/^--port=\d+$/.test(a))) throw Error("Use --check or --port=43125");
  const port = Number(args.find(a => a.startsWith("--port="))?.split("=")[1] ?? 43125);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("Port must be between 1024 and 65535");
  const built = await bundle();
  console.log(`Verified ${built.sources.length} core source files against ${PIN}. Production streamChat is false.`);
  if (args.includes("--check")) { await rm(built.directory, { recursive: true, force: true }); return; }
  process.once("exit", () => rmSync(built.directory, { recursive: true, force: true }));
  blockOutbound();
  const { launch } = await import(pathToFileURL(join(built.directory, "server.mjs")).href);
  await launch(built.directory, port);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
