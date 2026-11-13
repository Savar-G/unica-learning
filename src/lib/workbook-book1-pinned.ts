// #472 The pinned original planner, for recoverBook1PlanningInput (src/lib/workbook-book1-recovery.ts). It builds the
// public placement entry of one exact commit from Git objects (every src/ and data/ file the bundle reads comes from
// `git show <pin>:<path>`, never the working tree) with esbuild's async build, and records each planWorkbook input the
// pinned planNextWorkbook makes. A local controller tool: it needs the repository's Git objects and esbuild, so it never
// runs in a Vercel function. Packages from node_modules are today's, not the pin's: the planner imports none that decide
// a plan, and the recovery's plan comparison would refuse one that did.
import "server-only";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { Module } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import type { Curriculum } from "./workbook-curriculum";
import type { PlanInput } from "./workbook-plan";
import type { PinnedPlanningEngine } from "./workbook-book1-recovery";

const run = promisify(execFile);
const ENTRY = 'export { planNextWorkbook } from "./src/lib/workbook-placement"; export { storedChildProfile } from "./src/lib/child-profile"; '
  + 'export { curriculumFor, curriculumVersion } from "./src/lib/workbook-curriculum"; export { __calls } from "./src/lib/workbook-plan";';
const PLANNER = "src/lib/workbook-plan.ts";
const KEY = "export function planWorkbook(";

interface PinnedExports {
  planNextWorkbook(o: unknown): { ok: boolean; plan?: unknown };
  storedChildProfile(v: unknown): unknown;
  curriculumFor(key: string): unknown;
  curriculumVersion(key: string): string | null;
  __calls: PlanInput[];
}

/** Loads the planner of commit `pin` from the repository at `root`. Throws when the commit or a file is not there. */
export async function loadPinnedPlanningEngine(pin: string, root = process.cwd()): Promise<PinnedPlanningEngine & { files: Record<string, string> }> {
  if (!/^[0-9a-f]{40}$/.test(pin)) throw Error("pin-invalid");
  const git = async (...args: string[]) => (await run("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })).stdout;
  const commit = (await git("rev-parse", "--verify", `${pin}^{commit}`)).trim();
  if (commit !== pin) throw Error("pin-not-a-commit");
  const tree = (await git("rev-parse", `${pin}^{tree}`)).trim();
  const placementBlob = (await git("rev-parse", `${pin}:src/lib/workbook-placement.ts`)).trim();
  const { build } = await import("esbuild");
  const files: Record<string, string> = {};
  const result = await build({
    stdin: { contents: ENTRY, resolveDir: root, loader: "ts" }, bundle: true, platform: "node", format: "cjs", write: false, logLevel: "silent",
    tsconfig: path.join(root, "tsconfig.json"),
    plugins: [{ name: "pinned-git-source", setup(b) {
      b.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "pinned-empty" }));
      b.onLoad({ filter: /.*/, namespace: "pinned-empty" }, () => ({ contents: "", loader: "js" }));
      b.onLoad({ filter: /\.(?:tsx?|json)$/ }, async args => {
        const relative = path.relative(root, args.path).split(path.sep).join("/");
        if (!relative.startsWith("src/") && !relative.startsWith("data/")) return undefined;
        let text = await git("show", `${pin}:${relative}`);
        // The Git blob id of exactly what was read: proof that the bundle is the pin's source, not the working tree.
        files[relative] = createHash("sha1").update(`blob ${Buffer.byteLength(text, "utf8")}\0`).update(text, "utf8").digest("hex");
        if (relative === PLANNER) {
          if (text.split(KEY).length !== 2) throw Error("planner-interception-shape");
          // The public planWorkbook, wrapped: each input is copied before the original planner reads it.
          text = text.replace(KEY, "function originalPlanWorkbook(")
            + "\nexport const __calls: PlanInput[] = [];\nexport function planWorkbook(input: PlanInput) { __calls.push(structuredClone(input)); return originalPlanWorkbook(input); }\n";
        }
        return { contents: text, loader: relative.endsWith(".json") ? "json" : relative.endsWith(".tsx") ? "tsx" : "ts", resolveDir: path.dirname(args.path) };
      });
    } }],
  });
  const code = result.outputFiles[0].text;
  const file = path.join(root, `pinned-${pin}.cjs`);
  const loaded = new Module(file);
  loaded.paths = (Module as unknown as { _nodeModulePaths(dir: string): string[] })._nodeModulePaths(root);
  (loaded as unknown as { _compile(code: string, file: string): void })._compile(code, file);
  const api = loaded.exports as PinnedExports;
  return { ...engineOf(pin, tree, placementBlob, api), files };
}

function engineOf(pin: string, tree: string, placementBlob: string, api: PinnedExports): PinnedPlanningEngine {
  return {
    pin, tree, placementBlob,
    curriculumVersion: key => api.curriculumVersion(key),
    curriculum: key => api.curriculumFor(key) as Curriculum | null,
    plan(o) {
      const calls = api.__calls;
      if (!Array.isArray(calls)) throw Error("planner-interception-missing");
      calls.length = 0;
      const profile = o.profile === null ? null : api.storedChildProfile(o.profile);
      if (o.profile !== null && !profile) return { profileReadable: false, calls: [], result: { ok: false } };
      const curriculum = api.curriculumFor(o.curriculumKey);
      const result = api.planNextWorkbook({ ...(o.report ? { report: o.report } : {}), ...(Object.hasOwn(o, "device") ? { device: o.device } : {}),
        curriculum, grade: o.grade, profile, workbooks: o.workbooks, number: o.number });
      return { profileReadable: true, calls: structuredClone(calls), result: structuredClone(result) };
    },
  };
}
