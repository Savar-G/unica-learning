// The command line for Maya's practice suite (#325). Run it with `npm run maya:practice -- [options]`;
// scripts/maya-practice.mjs bundles this file. A local tool: nothing in src imports it. See docs/maya-practice.md.
//
// Options:
//   --fake                   fake models only: the rule player as Maya, the scripted children, a fake judge. No key,
//                            no network, no cost. It checks the plumbing, not Maya.
//   --estimate               print the cost estimate and stop
//   --max-usd <n>            the spending cap for the run (default: twice the estimate, rounded up to a dollar)
//   --cases <ids>            only these cases, comma-separated (default: every required case). A part of the suite
//                            is never a gate result: the exit code is 1.
//   --runs <n>               runs per case (default 3; anything else is not a gate result either)
//   --concurrency <n>        runs at the same time (default 3)
//   --out <dir>              where to save the run (default traces/maya-practice/<time>)
//   --report <dir>           rebuild report.md and report.json from a saved run, and stop
//   --maya-model <id>        Maya's model (default AI_MODEL, else the AI client's default)
//   --sim-model <id>         the practice child's model (default MAYA_SIM_MODEL, else anthropic/claude-haiku-5.5)
//   --validity-model <id>    the validity judge's model (default MAYA_VALIDITY_MODEL, else openai/gpt-5.4-mini: another
//                            family than the child, the main judge's family, so it does not share the child's blind spots)
//   --judge-model <id>       the judge's model (default MAYA_JUDGE_MODEL, else openai/gpt-5.4)
//   --review-model <id>      the free-talk review's model (D-197; default MAYA_REVIEW_MODEL, else anthropic/claude-haiku-5.5)
//   --no-free-talk           run Maya with free talk off (every word code's): the comparison run
//   --anthropic              every model through the Claude API (src/lib/ai-anthropic.ts), with the key in
//                            ANTHROPIC_API_KEY or the macOS Keychain item anthropic-unica-tools. Defaults: Maya
//                            claude-sonnet-5-5, the child and the validity judge claude-haiku-5-5, the judge
//                            claude-opus-5-5, the review claude-haiku-5-5. A local tool: the live site stays on OpenRouter.
//   --review-check           run only the review over every NEVER_SAY example (each must fail) and every OK_TALK
//                            line (each must pass), and save review-check.md and .json
//
// The key: OPENROUTER_API_KEY in the environment, or OPENROUTER_API_KEY_FILE (a file that holds only the key), or
// .env.local. The exit code is 0 only when every planned run passed.
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { AI_DEFAULT_MODEL, type AiClient } from "@/lib/ai-client";
import { anthropicClient } from "@/lib/ai-anthropic";
import { openRouterClient } from "@/lib/ai-openrouter";
import { freeTalkProblem, NEVER_SAY, OK_TALK, TALK_REVIEW_PROMPT_VERSION } from "@/lib/maya";
import { aiMayaModel, type MayaModel } from "@/lib/maya-model";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { aiTalkReviewer, fakeTalkReviewer, REVIEW_DEFAULT_MODEL, runReview, type TalkReviewer } from "@/lib/maya-talk-review";
import { redactText } from "@/lib/maya-trace";
import {
  aiChildSimulator, aiJudge, aiValidityJudge, buildReport, fakeValidityJudge, cappedClient, estimateCost, fakeJudge, freeTalkMarkdown, freeTalkReport, meteredFetch, planSuite, PRACTICE_CASES, reportMarkdown,
  RUNS_PER_CASE, runSuite, scriptedSimulator, SIMULATOR_PROMPT_VERSION, Spending,
  type AiJudge, type ByRole, type ChildSimulator, type ValidityJudge, type CostEstimate, type PracticeCase, type PracticeStore, type Price, type Role,
} from "@/lib/maya-practice";

export const DEFAULT_SIM_MODEL = "anthropic/claude-haiku-5.5";
export const DEFAULT_JUDGE_MODEL = "openai/gpt-5.4";
export const DEFAULT_VALIDITY_MODEL = "openai/gpt-5.4-mini";
const MODELS_URL = "https://openrouter.ai/api/v1/models";
/** The Claude API models for --anthropic, by role. */
export const ANTHROPIC_MODELS: Record<Role, string> = { maya: "claude-sonnet-5-5", simulator: "claude-haiku-5-5", validity: "claude-haiku-5-5", judge: "claude-opus-5-5", reviewer: "claude-haiku-5-5" };
/**
 * Claude API list prices in USD per token (the claude-api skill's model table, cached 2026-10-06): input, output. A
 * cache read costs 0.1 of input and a cache write 1.25. A model not listed has no price, and the run stops.
 */
const ANTHROPIC_PRICES: Record<string, Price> = {
  "claude-sonnet-5-5": { input: 2e-6, output: 10e-6 },
  "claude-haiku-5-5": { input: 0.1e-6, output: 0.5e-6 },
  "claude-opus-5-5": { input: 4e-6, output: 20e-6 },
};
/** The fewest output tokens a Claude API request gets: adaptive thinking counts in them, and a short limit cuts it off. */
const ANTHROPIC_MIN_TOKENS = 6_000;

interface Options {
  fake: boolean;
  anthropic: boolean;
  freeTalk: boolean;
  reviewCheck: boolean;
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
  const o: Options = { fake: false, anthropic: false, freeTalk: true, reviewCheck: false, estimate: false, maxUsd: null, cases: null, runs: RUNS_PER_CASE, concurrency: 3, out: null, report: null, models: {} };
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
    else if (a === "--anthropic") o.anthropic = true;
    else if (a === "--no-free-talk") o.freeTalk = false;
    else if (a === "--review-check") o.reviewCheck = true;
    else if (a === "--review-model") o.models.reviewer = v();
    else if (a === "--estimate") o.estimate = true;
    else if (a === "--max-usd") o.maxUsd = n(v(), 0);
    else if (a === "--cases") o.cases = v().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--runs") o.runs = Math.floor(n(v(), 1));
    else if (a === "--concurrency") o.concurrency = Math.floor(n(v(), 1));
    else if (a === "--out") o.out = v();
    else if (a === "--report") o.report = v();
    else if (a === "--maya-model") o.models.maya = v();
    else if (a === "--sim-model") o.models.simulator = v();
    else if (a === "--validity-model") o.models.validity = v();
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

/**
 * The Claude API key for --anthropic: ANTHROPIC_API_KEY, else the macOS Keychain item anthropic-unica-tools. Put in
 * process.env so every saved file and log line redacts it. Never printed.
 */
function anthropicKey(): string {
  let key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    try {
      key = execFileSync("security", ["find-generic-password", "-s", "anthropic-unica-tools", "-w"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      key = "";
    }
  }
  if (!key) throw new Error("No Claude API key. Set ANTHROPIC_API_KEY, or add the Keychain item anthropic-unica-tools.");
  process.env.ANTHROPIC_API_KEY = key;
  return key;
}

/** Each Claude model's price, from the table above. */
function anthropicPrices(models: Record<Role, string>): Record<Role, Price> {
  const out = {} as Record<Role, Price>;
  for (const role of Object.keys(models) as Role[]) {
    const p = ANTHROPIC_PRICES[models[role]];
    if (!p) throw new Error(`No Claude API price for "${models[role]}" (${role}): add it to ANTHROPIC_PRICES.`);
    out[role] = p;
  }
  return out;
}

/**
 * A Claude API client within the cap: each answer's cost (its token counts at `price`) is added to `spending`, the cap
 * reserves each call's worst case first, and each request gets at least ANTHROPIC_MIN_TOKENS output tokens.
 */
function anthropicRole(key: string, model: string, spending: Spending, price: Price): AiClient {
  const metered = anthropicClient({
    apiKey: key, model,
    onUsage: (u) => spending.add(u.inputTokens * price.input + u.outputTokens * price.output + u.cacheReadTokens * price.input * 0.1 + u.cacheWriteTokens * price.input * 1.25),
  });
  const capped = cappedClient(metered, spending, price);
  return { model: capped.model, json: (request, signal) => capped.json({ ...request, maxTokens: Math.max(request.maxTokens ?? 0, ANTHROPIC_MIN_TOKENS) }, signal) };
}

/**
 * The review check (D-197): the review over every NEVER_SAY example (each must fail) and every OK_TALK line (each
 * must pass), with the code guards' result beside it. Saves review-check.json and .md; true when every line came out
 * as it must.
 */
async function reviewCheck(reviewer: TalkReviewer, dir: string): Promise<boolean> {
  const lines = [
    ...NEVER_SAY.flatMap((e) => e.examples.map((line) => ({ line, childTurn: null as string | null, want: "fail" as const, rule: e.id as string }))),
    ...OK_TALK.map((x) => ({ line: x.line, childTurn: x.childTurn || null, want: "pass" as const, rule: null as string | null })),
  ];
  const results = await Promise.all(lines.map(async (x) => {
    const result = await runReview(reviewer, { promptVersion: TALK_REVIEW_PROMPT_VERSION, line: x.line, childTurn: x.childTurn, transcript: x.childTurn ? [{ speaker: "child" as const, text: x.childTurn }] : [] }, 30_000,
      (e) => console.error(`[review-check] ${redactText(e instanceof Error ? e.message : String(e))}`));
    const code = freeTalkProblem(x.line, null, x.childTurn ? [x.childTurn] : []);
    const ok = x.want === "fail" ? result.verdict !== "pass" : result.verdict === "pass";
    return { ...x, code, result, ok };
  }));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "review-check.json"), `${JSON.stringify({ reviewer: { model: reviewer.id, promptVersion: reviewer.promptVersion }, results }, null, 2)}\n`);
  const bad = results.filter((r) => r.want === "fail");
  const good = results.filter((r) => r.want === "pass");
  const cell = (t: string) => t.replace(/\|/g, "\\|");
  const md = [
    `# Free-talk review check (D-197)`, "", `Review: ${reviewer.id}, ${reviewer.promptVersion}.`, "",
    `- Never-say examples failed by the review: ${bad.filter((r) => r.ok).length}/${bad.length} (an error counts as a fail).`,
    `- Never-say examples the code guards pass, so only the review stops them: ${bad.filter((r) => r.code === null).length}/${bad.length}; the review failed ${bad.filter((r) => r.code === null && r.ok).length} of them.`,
    `- OK lines passed by the review: ${good.filter((r) => r.ok).length}/${good.length}.`, "",
    "| Line | Want | Rule | Code guards | Review | Rules named | OK |", "|---|---|---|---|---|---|---|",
    ...results.map((r) => `| ${cell(r.line)} | ${r.want} | ${r.rule ?? "-"} | ${r.code === null ? "pass" : cell(r.code)} | ${r.result.verdict} | ${r.result.verdict === "fail" ? r.result.rules.join(", ") : "-"} | ${r.ok ? "yes" : "NO"} |`),
  ].join("\n");
  writeFileSync(join(dir, "review-check.md"), `${md}\n`);
  console.log(md.split("\n").slice(0, 7).join("\n"));
  console.log(`-- review check: ${join(dir, "review-check.md")}`);
  return results.every((r) => r.ok);
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
      // The exact text: the run record holds its hash.
      writeFileSync(path, json);
    },
    load: (name) => {
      const path = join(dir, name);
      return existsSync(path) ? readFileSync(path, "utf8") : undefined;
    },
  };
}

function writeReport(cases: readonly PracticeCase[], runs: number, dir: string): boolean {
  const report = buildReport(cases, folderStore(dir), runs);
  // What happened to each piece of Maya's own words (D-197): not a gate result.
  const talk = freeTalkReport(cases, folderStore(dir), runs);
  writeFileSync(join(dir, "free-talk.json"), `${JSON.stringify(talk, null, 2)}\n`);
  writeFileSync(join(dir, "free-talk.md"), `${freeTalkMarkdown(talk)}\n`);
  console.log(`-- free talk: ${talk.pieces} pieces, ${talk.said} said, ${talk.codeRefused} refused by the code guards, ${talk.reviewFailed} failed by the review (${talk.caught.length} that the code guards passed), ${talk.reviewErrors} review errors: ${join(dir, "free-talk.md")}`);
  writeFileSync(join(dir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(dir, "report.md"), `${reportMarkdown(report)}\n`);
  const c = report.counts;
  if (report.passed && !report.full) console.log("-- part of the suite only (--cases or --runs): not a gate result");
  console.log(`-- ${report.passed && report.full ? "PASS" : "FAIL"}: ${c.passed}/${c.planned} passed; failed ${c.failed}, invalid ${c.invalid}, unjudgeable ${c.unjudgeable}, missing ${c.missing}${report.problem ? ` (${report.problem})` : ""}`);
  console.log(`-- report: ${join(dir, "report.md")}`);
  return report.passed && report.full;
}

const usd = (x: number) => `$${x.toFixed(2)}`;
function printEstimate(e: CostEstimate, cases: number, runs: number) {
  console.log(`-- cost estimate for ${cases} cases × ${runs} runs (a dry run with the fakes, ×1.5 margin, worst-case output; the review at one call per Maya call):`);
  for (const [role, r] of Object.entries(e.roles)) if (r) console.log(`   ${role.padEnd(9)} ${r.model.padEnd(28)} ${String(r.calls).padStart(5)} calls ${String(r.inputTokens).padStart(9)} in ${String(r.outputTokens).padStart(8)} out  ${usd(r.usd)}`);
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
  if (o.report) process.exit(writeReport(cases, o.runs, resolve(o.report)) ? 0 : 1);

  const models: Record<Role, string> = o.fake
    ? { maya: "fake", simulator: "fake-child", validity: "fake-validity", judge: "fake-judge", reviewer: "fake-review" }
    : o.anthropic
      ? { ...ANTHROPIC_MODELS, ...o.models }
      : {
          maya: o.models.maya ?? (process.env.AI_MODEL?.trim() || AI_DEFAULT_MODEL),
          simulator: o.models.simulator ?? (process.env.MAYA_SIM_MODEL?.trim() || DEFAULT_SIM_MODEL),
          validity: o.models.validity ?? (process.env.MAYA_VALIDITY_MODEL?.trim() || DEFAULT_VALIDITY_MODEL),
          judge: o.models.judge ?? (process.env.MAYA_JUDGE_MODEL?.trim() || DEFAULT_JUDGE_MODEL),
          reviewer: o.models.reviewer ?? (process.env.MAYA_REVIEW_MODEL?.trim() || REVIEW_DEFAULT_MODEL),
        };
  // With free talk off there is no review to pay for.
  const { reviewer: _reviewerModel, ...core } = models;
  void _reviewerModel;
  const paid: ByRole<string> = o.freeTalk ? models : core;

  let maya: MayaModel;
  let simulator: ChildSimulator;
  let validity: ValidityJudge;
  let judge: AiJudge;
  let reviewer: TalkReviewer | null = null;
  let spending = new Spending(null);
  if (o.reviewCheck && o.fake) throw new Error("--review-check needs a real review model: drop --fake.");
  if (o.fake) {
    maya = ruleMayaModel();
    reviewer = o.freeTalk ? fakeTalkReviewer() : null;
    const scripts = new Map(cases.map((c) => [c.persona.name, c.fakeScript]));
    simulator = { id: "fake-child", promptVersion: SIMULATOR_PROMPT_VERSION, next: (input, s) => scriptedSimulator(scripts.get(input.persona.name) ?? []).next(input, s) };
    validity = fakeValidityJudge();
    judge = fakeJudge();
    if (o.estimate) {
      console.log("-- --fake costs nothing.");
      return;
    }
  } else {
    const price = o.anthropic ? anthropicPrices(models) : await prices(models);
    if (o.reviewCheck) {
      // About 70 short review calls: a cap of USD 2 is far above them.
      spending = new Spending(o.maxUsd ?? 2);
    } else {
      const estimate = await estimateCost(cases, o.runs, paid, price);
      printEstimate(estimate, cases.length, o.runs);
      if (o.estimate) return;
      const cap = o.maxUsd ?? Math.ceil(estimate.usd * 2);
      if (estimate.usd > cap) throw new Error(`The estimate (${usd(estimate.usd)}) is above the cap (${usd(cap)}). Raise --max-usd or run fewer cases.`);
      console.log(`-- spending cap: ${usd(cap)} (--max-usd). Runs the cap cuts are reported missing.`);
      spending = new Spending(cap);
    }
    let client: (role: Role) => AiClient;
    if (o.anthropic) {
      const key = anthropicKey();
      client = (role) => anthropicRole(key, models[role], spending, price[role]);
    } else {
      const key = apiKey(root);
      client = (role) => cappedClient(openRouterClient({ apiKey: key, model: models[role], fetch: meteredFetch(globalThis.fetch, spending, price[role]) }), spending, price[role]);
    }
    maya = aiMayaModel(client("maya"));
    simulator = aiChildSimulator(client("simulator"));
    validity = aiValidityJudge(client("validity"));
    judge = aiJudge(client("judge"));
    reviewer = o.freeTalk || o.reviewCheck ? aiTalkReviewer(client("reviewer")) : null;
  }

  if (o.reviewCheck) {
    const dir = resolve(o.out ?? join(root, "traces/maya-practice", `review-check-${new Date().toISOString().replace(/[:.]/g, "-")}`));
    const ok = await reviewCheck(reviewer!, dir);
    console.log(`-- spent about ${usd(spending.spent)}`);
    process.exit(ok ? 0 : 1);
  }

  const dir = resolve(o.out ?? join(root, "traces/maya-practice", new Date().toISOString().replace(/[:.]/g, "-")));
  const store = folderStore(dir);
  const plan = planSuite(cases, {
    maya: { model: maya.id, promptVersion: maya.promptVersion },
    simulator: { model: simulator.id, promptVersion: simulator.promptVersion },
    validity: { model: validity.id, promptVersion: validity.promptVersion },
    judge: { model: judge.id, promptVersion: judge.promptVersion },
    reviewer: reviewer ? { model: reviewer.id, promptVersion: reviewer.promptVersion } : null,
    meta: {
      commit: git("rev-parse HEAD"), changes: git("status --porcelain") ? "uncommitted changes" : "clean", date: new Date().toISOString(),
      mode: o.fake ? "fake" : o.anthropic ? "anthropic" : "openrouter", freeTalk: o.freeTalk ? "on" : "off",
    },
  }, { runs: o.runs, maxUsd: spending.maxUsd });
  console.log(`-- ${plan.runs.length} runs into ${dir}`);
  let done = 0;
  await runSuite(cases, plan, {
    maya, simulator, validity, judge, store, concurrency: o.concurrency, freeTalk: o.freeTalk, reviewer,
    capped: () => spending.reached,
    onRun: (id) => console.log(`   ${++done}/${plan.runs.length} ${id}${o.fake ? "" : ` (spent ${usd(spending.spent)})`}`),
    // Raw errors on stderr for local debugging; the saved files keep only codes.
    onError: (e, where) => console.error(`[maya-practice] ${where}: ${redactText(e instanceof Error ? e.message : String(e))}`),
  });
  if (spending.reached) console.log(`-- the spending cap was reached at ${usd(spending.spent)}: the runs left are missing.`);
  else if (!o.fake) console.log(`-- spent about ${usd(spending.spent)}`);
  process.exit(writeReport(cases, o.runs, dir) ? 0 : 1);
}

main().catch((e) => {
  console.error(redactText(e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
