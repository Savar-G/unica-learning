import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { expect, it } from "vitest";

it.each(["subscription", "fake", "estimate"])("the real chat CLI keeps its sentence reviewer and budget with free talk off: %s", async mode => {
  const root = process.cwd(), dir = mkdtempSync(join(tmpdir(), "maya-cli-review-"));
  const cli = join(root, "scripts/maya-practice-cli.ts"), receipt = join(dir, "receipt.json");
  try {
    await build({
      entryPoints: [cli], bundle: true, platform: "node", format: "cjs", outfile: join(dir, "cli.cjs"),
      packages: "external", alias: { "@": join(root, "src"), "server-only": join(root, "node_modules/next/dist/compiled/server-only/empty.js") },
      banner: { js: 'globalThis.fetch = async () => { throw new Error("network forbidden in CLI test"); };' },
      plugins: [{ name: "offline-cli-boundaries", setup(build) {
        build.onResolve({ filter: /maya-practice$/ }, args => args.importer === cli ? { path: "practice-boundary", namespace: "test" } : undefined);
        build.onLoad({ filter: /.*/, namespace: "test" }, () => ({ loader: "js", resolveDir: root, contents: `
          export * from ${JSON.stringify(join(root, "src/lib/maya-practice/index.ts"))};
          import { writeFileSync } from "node:fs";
          export async function estimateCost(_cases, _runs, models, prices, execution) {
            writeFileSync(process.env.MAYA_TEST_RECEIPT, JSON.stringify({ freeTalk: execution.freeTalk, reviewer: models.reviewer ?? null, priced: !!prices.reviewer }));
            process.exit(0);
          }
          export async function runSuite(_cases, _plan, deps) {
            const input = { conversation: true, promptVersion: "test", line: "You noticed the starting amount.", childTurn: null, transcript: [] };
            const result = deps.reviewer ? await deps.reviewer.review(input, new AbortController().signal) : null;
            writeFileSync(process.env.MAYA_TEST_RECEIPT, JSON.stringify({ freeTalk: deps.freeTalk, reviewer: deps.reviewer?.id ?? null, result }));
            process.exit(0);
          }` }));
        build.onLoad({ filter: /ai-claude-cli-practice\.ts$/ }, () => ({ loader: "js", contents: `
          export const claudeCliClient = ({ model }) => ({ model, json: async request => {
            if (request.name !== "maya_talk_review") throw new Error("unexpected model request");
            return { verdict: "pass", rules: [], reason: "" };
          }});` }));
      } }],
    });
    const provider = mode === "estimate" ? ["--anthropic", "--estimate"] : [mode === "fake" ? "--fake" : "--subscription"];
    execFileSync(process.execPath, [join(dir, "cli.cjs"), ...provider, "--channel", "chat", "--cases", "C07", "--runs", "1", "--out", join(dir, "run")], {
      cwd: root, encoding: "utf8", env: { PATH: dir, HOME: dir, NODE_ENV: "test", NODE_PATH: join(root, "node_modules"), MAYA_TEST_RECEIPT: receipt }, timeout: 20_000,
    });
    expect(JSON.parse(readFileSync(receipt, "utf8"))).toEqual(mode === "estimate"
      ? { freeTalk: false, reviewer: "claude-haiku-5-5", priced: true }
      : { freeTalk: false, reviewer: mode === "fake" ? "fake-review" : "claude-haiku-5-5", result: { verdict: "pass" } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
