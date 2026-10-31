// The command line for Maya's practice suite (#325). Run it with `npm run maya:practice -- [options]`;
// scripts/maya-practice.mjs bundles this file. A local tool: nothing in src imports it. See docs/maya-practice.md.
//
// Options:
//   --fake                   fake models only: the rule player as Maya, the scripted children, a fake judge. No key,
//                            no network, no cost. It checks the plumbing, not Maya.
//   --estimate               print the cost estimate and stop
//   --max-usd <n>            the spending cap for the run (default: twice the estimate, rounded up to a dollar)
//   --cases <ids>            only these cases, comma-separated (default: every required case)
//   --runs <n>               runs per case (default 3)
//   --concurrency <n>        runs at the same time (default 3)
//   --out <dir>              where to save the run (default traces/maya-practice/<time>)
//   --report <dir>           rebuild report.md and report.json from a saved run, and stop
//   --maya-model <id>        Maya's model (default AI_MODEL, else the AI client's default)
//   --sim-model <id>         the practice child's model (default MAYA_SIM_MODEL, else anthropic/claude-haiku-5.5)
//   --judge-model <id>       the judge's model (default MAYA_JUDGE_MODEL, else openai/gpt-5.4)
//
// The key: OPENROUTER_API_KEY in the environment, or OPENROUTER_API_KEY_FILE (a file that holds only the key), or
// .env.local. The exit code is 0 only when every planned run passed.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { AI_DEFAULT_MODEL } from "@/lib/ai-client";
import { openRouterClient } from "@/lib/ai-openrouter";
import { aiMayaModel, type MayaModel } from "@/lib/maya-model";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { redactText } from "@/lib/maya-trace";
import {
  aiChildSimulator, aiJudge, buildReport, cappedClient, estimateCost, fakeJudge, meteredFetch, planSuite, PRACTICE_CASES, reportMarkdown,
  RUNS_PER_CASE, runSuite, scriptedSimulator, SIMULATOR_PROMPT_VERSION, Spending,
  type AiJudge, type ChildSimulator, type CostEstimate, type PracticeCase, type PracticeStore, type Price, type Role,
} from "@/lib/maya-practice";

export const DEFAULT_SIM_MODEL = "anthropic/claude-haiku-5.5";
export const DEFAULT_JUDGE_MODEL = "openai/gpt-5.4";
const MODELS_URL = "https://openrouter.ai/api/v1/models";

interface Options {
  fake: boolean;
  estimate: boolean;
  maxUsd: number | null;
  cases: string[] | null;
  runs: number;
  concurrency: number;
  out: string | null;
  report: string | null;
  models: Partial<Record<Role, string>>;
}

function parse(argv: string[]): Options {
  const o: Options = { fake: false, estimate: false, maxUsd: null, cases: null, runs: RUNS_PER_CASE, concurrency: 3, out: null, report: null, models: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => {
      const x = argv[++i];
      if (x === undefined) throw new Error(`${a} needs a value`);
      return x;
    };
    const n = (x: string, min: number) => {
      const y = Number(x);
      if (!Number.isFinite(y) || y < min) throw new Error(`${a} needs a number of at least ${min}`);
      return y;
    };
    if (a === "--fake") o.fake = true;
    else if (a === "--estimate") o.estimate = true;
    else if (a === "--max-usd") o.maxUsd = n(v(), 0);
    else if (a === "--cases") o.cases = v().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--runs") o.runs = Math.floor(n(v(), 1));
    else if (a === "--concurrency") o.concurrency = Math.floor(n(v(), 1));
    else if (a === "--out") o.out = v();
    else if (a === "--report") o.report = v();
    else if (a === "--maya-model") o.models.maya = v();
    else if (a === "--sim-model") o.models.simulator = v();
    else if (a === "--judge-model") o.models.judge = v();
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

/** KEY=value lines of an env file (vercel env pull writes .env.local). */
function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return out;
}

/** The OpenRouter key, put in process.env so every saved file and log line redacts it. */
function apiKey(root: string): string {
  let key = process.env.OPENROUTER_API_KEY?.trim();
  const file = process.env.OPENROUTER_API_KEY_FILE;
  if (!key && file) key = readFileSync(resolve(file), "utf8").trim();
  const envLocal = join(root, ".env.local");
  if (!key && existsSync(envLocal)) key = readEnvFile(envLocal).OPENROUTER_API_KEY?.trim();
  // vercel env pull writes an empty value for a Secret variable.
  if (!key) throw new Error("No OpenRouter key. Set OPENROUTER_API_KEY, or OPENROUTER_API_KEY_FILE=<file with the key>. Or run with --fake.");
  process.env.OPENROUTER_API_KEY = key;
  return key;
}

/** Each model's price per token, from OpenRouter's public model list (no key needed). */
async function prices(models: Record<Role, string>): Promise<Record<Role, Price>> {
  const res = await fetch(MODELS_URL);
  if (!res.ok) throw new Error(`OpenRouter's model list answered ${res.status}`);
  const list = ((await res.json()) as { data: { id: string; pricing: { prompt: string; completion: string }; supported_parameters?: string[] }[] }).data;
  const out = {} as Record<Role, Price>;
  for (const role of Object.keys(models) as Role[]) {
    const m = list.find((x) => x.id === models[role]);
    if (!m) throw new Error(`OpenRouter has no model "${models[role]}" (${role})`);
    if (m.supported_parameters && !m.supported_parameters.includes("structured_outputs")) throw new Error(`${models[role]} does not take structured output (${role})`);
    out[role] = { input: Number(m.pricing.prompt), output: Number(m.pricing.completion) };
  }
  return out;
}

function folderStore(dir: string): PracticeStore {
  return {
    save: (name, json) => {
      const path = join(dir, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${json}\n`);
    },
    load: (name) => {
      const path = join(dir, name);
      return existsSync(path) ? readFileSync(path, "utf8") : undefined;
    },
  };
}

function writeReport(cases: readonly PracticeCase[], dir: string): boolean {
  const report = buildReport(cases, folderStore(dir));
  writeFileSync(join(dir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(dir, "report.md"), `${reportMarkdown(report)}\n`);
  const c = report.counts;
  console.log(`-- ${report.passed ? "PASS" : "FAIL"}: ${c.passed}/${c.planned} passed; failed ${c.failed}, invalid ${c.invalid}, unjudgeable ${c.unjudgeable}, missing ${c.missing}${report.problem ? ` (${report.problem})` : ""}`);
  console.log(`-- report: ${join(dir, "report.md")}`);
  return report.passed;
}

const usd = (x: number) => `$${x.toFixed(2)}`;
function printEstimate(e: CostEstimate, cases: number, runs: number) {
  console.log(`-- cost estimate for ${cases} cases × ${runs} runs (a dry run with the fakes, ×1.5 margin, worst-case output):`);
  for (const [role, r] of Object.entries(e.roles)) console.log(`   ${role.padEnd(9)} ${r.model.padEnd(28)} ${String(r.calls).padStart(5)} calls ${String(r.inputTokens).padStart(9)} in ${String(r.outputTokens).padStart(8)} out  ${usd(r.usd)}`);
  console.log(`   total ${usd(e.usd)}`);
}

function git(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
}

async function main() {
  const root = resolve(process.env.MAYA_ROOT ?? process.cwd());
  const o = parse(process.argv.slice(2));
  const cases = o.cases ? o.cases.map((id) => PRACTICE_CASES.find((c) => c.id === id) ?? (() => { throw new Error(`no case ${id}`); })()) : PRACTICE_CASES;
  if (o.report) process.exit(writeReport(cases, resolve(o.report)) ? 0 : 1);

  const models: Record<Role, string> = o.fake
    ? { maya: "fake", simulator: "fake-child", judge: "fake-judge" }
    : {
        maya: o.models.maya ?? (process.env.AI_MODEL?.trim() || AI_DEFAULT_MODEL),
        simulator: o.models.simulator ?? (process.env.MAYA_SIM_MODEL?.trim() || DEFAULT_SIM_MODEL),
        judge: o.models.judge ?? (process.env.MAYA_JUDGE_MODEL?.trim() || DEFAULT_JUDGE_MODEL),
      };

  let maya: MayaModel;
  let simulator: ChildSimulator;
  let judge: AiJudge;
  let spending = new Spending(null);
  if (o.fake) {
    maya = ruleMayaModel();
    const scripts = new Map(cases.map((c) => [c.persona.name, c.fakeScript]));
    simulator = { id: "fake-child", promptVersion: SIMULATOR_PROMPT_VERSION, next: (input, s) => scriptedSimulator(scripts.get(input.persona.name) ?? []).next(input, s) };
    judge = fakeJudge();
    if (o.estimate) {
      console.log("-- --fake costs nothing.");
      return;
    }
  } else {
    const price = await prices(models);
    const estimate = await estimateCost(cases, o.runs, models, price);
    printEstimate(estimate, cases.length, o.runs);
    if (o.estimate) return;
    const cap = o.maxUsd ?? Math.ceil(estimate.usd * 2);
    if (estimate.usd > cap) throw new Error(`The estimate (${usd(estimate.usd)}) is above the cap (${usd(cap)}). Raise --max-usd or run fewer cases.`);
    console.log(`-- spending cap: ${usd(cap)} (--max-usd). Runs the cap cuts are reported missing.`);
    const key = apiKey(root);
    spending = new Spending(cap);
    const client = (role: Role) => cappedClient(openRouterClient({ apiKey: key, model: models[role], fetch: meteredFetch(globalThis.fetch, spending, price[role]) }), spending, price[role]);
    maya = aiMayaModel(client("maya"));
    simulator = aiChildSimulator(client("simulator"));
    judge = aiJudge(client("judge"));
  }

  const dir = resolve(o.out ?? join(root, "traces/maya-practice", new Date().toISOString().replace(/[:.]/g, "-")));
  const store = folderStore(dir);
  const plan = planSuite(cases, {
    maya: { model: maya.id, promptVersion: maya.promptVersion },
    simulator: { model: simulator.id, promptVersion: simulator.promptVersion },
    judge: { model: judge.id, promptVersion: judge.promptVersion },
    meta: { commit: git("rev-parse HEAD"), changes: git("status --porcelain") ? "uncommitted changes" : "clean", date: new Date().toISOString(), mode: o.fake ? "fake" : "openrouter" },
  }, { runs: o.runs, maxUsd: spending.maxUsd });
  console.log(`-- ${plan.runs.length} runs into ${dir}`);
  let done = 0;
  await runSuite(cases, plan, {
    maya, simulator, judge, store, concurrency: o.concurrency,
    capped: () => spending.reached,
    onRun: (id) => console.log(`   ${++done}/${plan.runs.length} ${id}${o.fake ? "" : ` (spent ${usd(spending.spent)})`}`),
    // Raw errors on stderr for local debugging; the saved files keep only codes.
    onError: (e, where) => console.error(`[maya-practice] ${where}: ${redactText(e instanceof Error ? e.message : String(e))}`),
  });
  if (spending.reached) console.log(`-- the spending cap was reached at ${usd(spending.spent)}: the runs left are missing.`);
  else if (!o.fake) console.log(`-- spent about ${usd(spending.spent)}`);
  process.exit(writeReport(cases, dir) ? 0 : 1);
}

main().catch((e) => {
  console.error(redactText(e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
