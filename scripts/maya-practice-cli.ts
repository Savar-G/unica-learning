// The command line for Maya's practice suite (#325). Run it with `npm run maya:practice -- [options]`;
// scripts/maya-practice.mjs bundles this file. A local tool: nothing in src imports it. See docs/maya-practice.md.
//
// Options:
//   --channel <voice|chat>   voice through the text adapter (default), or actual child chat settings
//   --generated              add real-generator U4/U16 Day 1 packages with local synthetic inputs
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
//   --maya-model <id>        Maya's model, the turn model (default AI_MODEL, else the AI client's default; with
//                            --anthropic or --subscription a Claude API id such as claude-haiku-5-5). Each run also saves
//                            turn-time.md and .json: the real time of each model and review call, to compare two models.
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
//   --subscription           every model through `claude -p` on the Claude subscription (src/lib/ai-claude-cli-practice.ts),
//                            at no cost: the same Claude models as --anthropic, Maya's exact system prompt and schema,
//                            no tools, ANTHROPIC_API_KEY removed. MAYA_CLAUDE_CONFIG_DIR sets CLAUDE_CONFIG_DIR for the
//                            calls, MAYA_CLAUDE_TIMEOUT_S each call's time limit (default 300). At the usage limit the
//                            run stops and keeps the runs it finished; it never falls back to the paid API.
//   --provider <p>           openrouter (default), anthropic or subscription: the same as the flags above
//   --review-check           run only the review over every NEVER_SAY and NOT_OK_TALK example (each must fail) and every OK_TALK
//                            line (each must pass), and save review-check.md and .json
//
// The key: OPENROUTER_API_KEY in the environment, or OPENROUTER_API_KEY_FILE (a file that holds only the key), or
// .env.local. The exit code is 0 only when every planned run passed.
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { AI_DEFAULT_MODEL, type AiClient } from "@/lib/ai-client";
import { anthropicClient } from "@/lib/ai-anthropic";
import { claudeCliClient } from "@/lib/ai-claude-cli-practice";
import { openRouterClient } from "@/lib/ai-openrouter";
import { freeTalkProblem, NEVER_SAY, NOT_OK_TALK, OK_TALK, TALK_REVIEW_PROMPT_VERSION } from "@/lib/maya";
import { aiMayaModel, type MayaModel } from "@/lib/maya-model";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { aiTalkReviewer, fakeTalkReviewer, REVIEW_DEFAULT_MODEL, runReview, type TalkReviewer } from "@/lib/maya-talk-review";
import { redactText } from "@/lib/maya-trace";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { createSpendLedger, recordLocalSpend, spendConfig } from "@/lib/maya-spend";
import { mayaSpendStore } from "@/lib/maya-spend-store";
import {
  generatedPracticeSet, practiceExecution, aiChildSimulator, aiJudge, aiValidityJudge, buildReport, fakeValidityJudge, fileHash, cappedClient, estimateCost, fakeJudge, freeTalkMarkdown, freeTalkReport, meteredFetch, planSuite, PRACTICE_CASES, reportMarkdown,
  RUNS_PER_CASE, runSuite, scriptedSimulator, SIMULATOR_PROMPT_VERSION, Spending, timedTurns, turnTimeMarkdown,
  type ExecutionOptions, type AiJudge, type ByRole, type ChildSimulator, type ValidityJudge, type CostEstimate, type PracticeCase, type PracticeStore, type Price, type Role,
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
/** With --subscription: the time limit of a Maya, child or validity call (the judge gets twice it), and of a review. */
const SUBSCRIPTION_MAYA_MS = 120_000;
const SUBSCRIPTION_REVIEW_MS = 60_000;

type Provider = "openrouter" | "anthropic" | "subscription";

interface Options {
  fake: boolean;
  channel: "voice" | "chat";
  generated: boolean;
  provider: Provider;
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
  const o: Options = { fake: false, channel: "voice", generated: false, provider: "openrouter", freeTalk: true, reviewCheck: false, estimate: false, maxUsd: null, cases: null, runs: RUNS_PER_CASE, concurrency: 3, out: null, report: null, models: {} };
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
    if (a === "--channel") {
      const channel = v();
      if (channel !== "voice" && channel !== "chat") throw new Error("--channel must be voice or chat");
      o.channel = channel;
    }
    else if (a === "--generated") o.generated = true;
    else if (a === "--fake") o.fake = true;
    else if (a === "--anthropic") o.provider = "anthropic";
    else if (a === "--subscription") o.provider = "subscription";
    else if (a === "--provider") {
      const p = v();
      if (p !== "openrouter" && p !== "anthropic" && p !== "subscription") throw new Error("--provider must be openrouter, anthropic or subscription");
      o.provider = p;
    }
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
  if (o.channel === "chat") o.freeTalk = false;
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
async function reviewCheck(reviewer: TalkReviewer, dir: string, concurrency: number, timeLimitMs = 30_000): Promise<boolean> {
  const lines = [
    ...NEVER_SAY.flatMap((e) => e.examples.map((line) => ({ line, childTurn: null as string | null, want: "fail" as const, rule: e.id as string }))),
    ...OK_TALK.map((x) => ({ line: x.line, childTurn: x.childTurn || null, want: "pass" as const, rule: null as string | null })),
    ...NOT_OK_TALK.map((x) => ({ line: x.line, childTurn: x.childTurn as string | null, want: "fail" as const, rule: x.rule as string })),
  ];
  // A few at a time: the Claude API limits concurrent requests per organization.
  let next = 0;
  const results: ({ code: string | null; result: Awaited<ReturnType<typeof runReview>>; ok: boolean } & (typeof lines)[number])[] = new Array(lines.length);
  const one = async (x: (typeof lines)[number]) => {
    const result = await runReview(reviewer, { promptVersion: TALK_REVIEW_PROMPT_VERSION, line: x.line, childTurn: x.childTurn, transcript: x.childTurn ? [{ speaker: "child" as const, text: x.childTurn }] : [] }, timeLimitMs,
      (e) => console.error(`[review-check] ${redactText(e instanceof Error ? e.message : String(e))}`));
    const code = freeTalkProblem(x.line, null, x.childTurn ? [x.childTurn] : []);
    // An error is not a judgement: it fails a line in a call, but here it makes the check incomplete.
    const ok = x.want === "fail" ? result.verdict === "fail" : result.verdict === "pass";
    return { ...x, code, result, ok };
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (next < lines.length) {
      const i = next++;
      results[i] = await one(lines[i]);
    }
  }));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "review-check.json"), `${JSON.stringify({ reviewer: { model: reviewer.id, promptVersion: reviewer.promptVersion }, results }, null, 2)}\n`);
  const bad = results.filter((r) => r.want === "fail");
  const good = results.filter((r) => r.want === "pass");
  const cell = (t: string) => t.replace(/\|/g, "\\|");
  const md = [
    `# Free-talk review check (D-197)`, "", `Review: ${reviewer.id}, ${reviewer.promptVersion}.`, "",
    `- Never-say examples failed by the review: ${bad.filter((r) => r.ok).length}/${bad.length}. Review errors (no judgement): ${results.filter((r) => r.result.verdict === "error").length}.`,
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

function writeReport(cases: readonly PracticeCase[], runs: number, dir: string, execution: ExecutionOptions): boolean {
  const report = buildReport(cases, folderStore(dir), runs, execution);
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
/** What the run cost: USD 0 on the subscription and with the fakes. */
/**
 * Maya's month's total (D-291) counts the practice suite's API spend, for the team's alert only: never a child's week, and
 * it stops nobody. With no database key here (SUPABASE_URL and SUPABASE_SECRET_KEY), it says so and counts nothing.
 */
async function countMonthly(o: Options, s: Spending): Promise<void> {
  if (o.fake || o.provider === "subscription" || !(s.spent > 0)) return;
  const url = process.env.SUPABASE_URL?.trim(), key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) return console.log("-- not counted in Maya's month's total: SUPABASE_URL and SUPABASE_SECRET_KEY are not set.");
  try {
    const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const ledger = createSpendLedger({ store: mayaSpendStore(db), clock: Date.now, config: spendConfig(), zone: async () => "America/Vancouver" });
    await recordLocalSpend(ledger, s.spent, randomUUID());
    console.log(`-- counted ${usd(s.spent)} in Maya's month's total.`);
  } catch (e) {
    console.error(`[maya-practice] not counted in Maya's month's total: ${redactText(e instanceof Error ? e.message : String(e))}`);
  }
}

const spent = (o: Options, s: Spending) => (o.fake || o.provider === "subscription" ? `cost USD 0${o.provider === "subscription" && !o.fake ? " (claude -p on the Claude subscription)" : ""}` : `spent about ${usd(s.spent)}`);
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
  const generated = o.generated ? await generatedPracticeSet() : null;
  const required = [...PRACTICE_CASES, ...(generated?.cases ?? [])];
  const execution = practiceExecution(o);
  const cases = o.cases ? o.cases.map((id) => required.find((c) => c.id === id) ?? (() => { throw new Error(`no case ${id}`); })()) : required;
  if (o.report) process.exit(writeReport(cases, o.runs, resolve(o.report), execution) ? 0 : 1);
  // The fake rule player is always Maya with --fake: a model named here would be ignored without a word.
  if (o.fake && o.models.maya) throw new Error("--maya-model needs a real model: drop --fake.");

  const models: Record<Role, string> = o.fake
    ? { maya: "fake", simulator: "fake-child", validity: "fake-validity", judge: "fake-judge", reviewer: "fake-review" }
    : o.provider !== "openrouter"
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
  // Set when a `claude -p` call met the subscription's usage limit: the suite stops as at the spending cap.
  let usageLimit: string | null = null;
  const stopped = () => spending.reached || usageLimit !== null;
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
  } else if (o.provider === "subscription") {
    if (o.maxUsd !== null) console.log("-- --max-usd does nothing with --subscription: the calls cost USD 0.");
    if (o.estimate) {
      console.log("-- --subscription costs USD 0 (claude -p on the Claude subscription); it uses the subscription's usage limit.");
      return;
    }
    const timeoutS = Number(process.env.MAYA_CLAUDE_TIMEOUT_S ?? 300);
    const client = (role: Role): AiClient => claudeCliClient({
      model: models[role], configDir: process.env.MAYA_CLAUDE_CONFIG_DIR?.trim() || null,
      timeoutMs: (Number.isFinite(timeoutS) && timeoutS > 0 ? timeoutS : 300) * 1000,
      onLimit: (detail) => {
        if (usageLimit === null) console.error(`[maya-practice] the Claude subscription's usage limit is reached (${role}): ${redactText(detail)}. Stopping; finished runs are kept.`);
        usageLimit ??= detail;
      },
    });
    // Each call starts a Claude Code process (about 3 s more than an API call), so Maya's 30 s limit and the review's 8 s
    // live limit are raised: this run checks her rules and words, not the live time limits.
    maya = aiMayaModel(client("maya"), { timeoutMs: SUBSCRIPTION_MAYA_MS });
    simulator = aiChildSimulator(client("simulator"), { timeoutMs: SUBSCRIPTION_MAYA_MS });
    validity = aiValidityJudge(client("validity"), { timeoutMs: SUBSCRIPTION_MAYA_MS });
    judge = aiJudge(client("judge"), { timeoutMs: 2 * SUBSCRIPTION_MAYA_MS });
    reviewer = o.freeTalk || o.reviewCheck ? aiTalkReviewer(client("reviewer")) : null;
  } else {
    const anthropic = o.provider === "anthropic";
    const price = anthropic ? anthropicPrices(models) : await prices(models);
    if (o.reviewCheck) {
      // About 70 short review calls: a cap of USD 2 is far above them.
      spending = new Spending(o.maxUsd ?? 2);
    } else {
      const estimate = await estimateCost(cases, o.runs, paid, price, execution);
      printEstimate(estimate, cases.length, o.runs);
      if (o.estimate) return;
      const cap = o.maxUsd ?? Math.ceil(estimate.usd * 2);
      if (estimate.usd > cap) throw new Error(`The estimate (${usd(estimate.usd)}) is above the cap (${usd(cap)}). Raise --max-usd or run fewer cases.`);
      console.log(`-- spending cap: ${usd(cap)} (--max-usd). Runs the cap cuts are reported missing.`);
      spending = new Spending(cap);
    }
    let client: (role: Role) => AiClient;
    if (anthropic) {
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
    const ok = await reviewCheck(reviewer!, dir, o.concurrency, o.provider === "subscription" ? SUBSCRIPTION_REVIEW_MS : 30_000);
    console.log(`-- provider: ${o.provider}; ${spent(o, spending)}`);
    await countMonthly(o, spending);
    if (usageLimit !== null) console.log("-- the Claude subscription's usage limit was reached: the check is incomplete. Run it again after the limit resets.");
    process.exit(ok ? 0 : 1);
  }

  const dir = resolve(o.out ?? join(root, "traces/maya-practice", new Date().toISOString().replace(/[:.]/g, "-")));
  const store = folderStore(dir);
  if (generated) store.save("generated-packages.json", JSON.stringify(generated, null, 2));
  const times = timedTurns(maya, reviewer, () => Date.now());
  maya = times.maya;
  reviewer = times.reviewer;
  const plan = planSuite(cases, {
    maya: { model: maya.id, promptVersion: maya.promptVersion },
    simulator: { model: simulator.id, promptVersion: simulator.promptVersion },
    validity: { model: validity.id, promptVersion: validity.promptVersion },
    judge: { model: judge.id, promptVersion: judge.promptVersion },
    reviewer: reviewer ? { model: reviewer.id, promptVersion: reviewer.promptVersion } : null,
    meta: {
      commit: git("rev-parse HEAD"), changes: git("status --porcelain") ? "uncommitted changes" : "clean", date: new Date().toISOString(),
      ...(generated ? { generatedArtifact: fileHash(store.load("generated-packages.json")!) } : {}),
      mode: o.fake ? "fake" : o.provider, freeTalk: o.freeTalk ? "on" : "off",
    },
  }, { runs: o.runs, maxUsd: spending.maxUsd, ...execution });
  console.log(`-- channel: ${execution.channel}; free talk: ${execution.freeTalk ? "on" : "off"}; generated packages: ${generated ? "U4,U16 Day 1 (synthetic)" : "none"}`);
  console.log(`-- ${plan.runs.length} runs into ${dir}`);
  let done = 0;
  await runSuite(cases, plan, {
    maya, simulator, validity, judge, store, concurrency: o.concurrency, freeTalk: o.freeTalk, reviewer,
    ...(o.provider === "subscription" && !o.fake ? { reviewTimeLimitMs: SUBSCRIPTION_REVIEW_MS } : {}),
    capped: stopped,
    onRun: (id) => console.log(`   ${++done}/${plan.runs.length} ${id}${o.fake || o.provider === "subscription" ? "" : ` (spent ${usd(spending.spent)})`}`),
    // Raw errors on stderr for local debugging; the saved files keep only codes.
    onError: (e, where) => console.error(`[maya-practice] ${where}: ${redactText(e instanceof Error ? e.message : String(e))}`),
  });
  if (usageLimit !== null) console.log(`-- the Claude subscription's usage limit was reached: the runs left are missing. The finished runs are saved in ${dir}. Run the missing cases again after the limit resets (--cases).`);
  else if (spending.reached) console.log(`-- the spending cap was reached at ${usd(spending.spent)}: the runs left are missing.`);
  const turnTime = times.report();
  writeFileSync(join(dir, "turn-time.json"), `${JSON.stringify(turnTime, null, 2)}\n`);
  writeFileSync(join(dir, "turn-time.md"), `${turnTimeMarkdown(turnTime, o.fake ? "fake" : o.provider)}\n`);
  console.log(`-- turn time: ${turnTime.maya.id}: ${turnTime.maya.calls} calls, ${turnTime.maya.failed} failed, p50 ${turnTime.maya.p50Ms ?? "-"} ms, p95 ${turnTime.maya.p95Ms ?? "-"} ms: ${join(dir, "turn-time.md")}`);
  const passed = writeReport(cases, o.runs, dir, execution);
  console.log(`-- provider: ${o.fake ? "fake" : o.provider}; ${spent(o, spending)}`);
  await countMonthly(o, spending);
  process.exit(passed ? 0 : 1);
}

main().catch((e) => {
  console.error(redactText(e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
