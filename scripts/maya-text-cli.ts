// The command line for Maya's text sessions (#322). Run it with `npm run maya:text -- [options]`; scripts/maya-text.mjs
// bundles this file. A local tool: nothing in src imports it.
//
// Options:
//   --question <id|file>     a sample id (default add-27-39; see --list) or a question package JSON file
//   --model fake|openrouter|anthropic
//                            fake: the rule player, no AI (default). openrouter: AI_MODEL through OpenRouter; needs
//                            OPENROUTER_API_KEY (read from the environment, or from .env.local when it is not set).
//                            anthropic: claude-sonnet-5-5 through the Claude API (src/lib/ai-anthropic.ts), with the key
//                            in ANTHROPIC_API_KEY or the macOS Keychain item anthropic-unica-tools; local only
//   --anthropic              the same as --model anthropic
//   --no-free-talk           every word Maya says from code (D-197 turns free talk on by default here, as in the demo)
//   --script <file>          child turns, one per line; without it, turns come from stdin (typed when it is a terminal)
//   --runner livekit|plain   livekit: LiveKit Agents text mode, no room (default). plain: the text adapter alone
//   --trace <file>           where to write the trace (default traces/maya/<call id>.json)
//   --seed <n>               the wording seed (default 1)
//   --name <child name>      the child's name, said now and then by code
//   --list                   list the sample questions
//   --real-clock             the real clock with a script, so the trace times each model call
//   --legacy                 Maya's version 2 model (code-written lines), for a before-and-after comparison
//   --effort <level>         none, minimal, low (default), medium or high: how much the model thinks first
//   --tutor                  the tutor core (D-345, docs/maya-tutor.md), as on admin test calls
//   --voice                  as the voice worker: no repair on a controller turn; prints, for each child turn, the ms
//                            to Maya's first and last sentence (the adapter's onSayPart; no speech-to-text or voice)
//   --chat                   as desk chat (maya-call.ts textSession for a chat call): channel "chat", the plain runner,
//                            no free talk but the safety review still on, no streaming (no onSayPart), the real clock
//
// With --model openrouter or anthropic the math-truth review of the tutor core is on, built as the site builds it
// (callMathReviewer in src/lib/maya-call-seams.ts). Without it every tutor sentence code did not read whole is refused.
// Every review (safety and math, with the math retry) is timed: the times go to <trace>.reviews.json and a summary prints.
//
// Script lines: a child turn, or "/wait <seconds>" (the clock moves on and the pause policy runs), "/write start",
// "/write done", "/quit" (the child hangs up: child_stopped). "#" starts a comment. With --script or piped input the
// clock is simulated (4 seconds a turn, plus each /wait); typed input uses the real clock.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";
import { anthropicClient } from "@/lib/ai-anthropic";
import { livekitTextSession } from "@/lib/maya-livekit-text";
import { aiMayaModel, conversationalMayaModel, type MayaModel } from "@/lib/maya-model";
import { ruleConversationalModel } from "@/lib/maya-model-fake";
import { aiTalkReviewer, fakeTalkReviewer, type TalkReviewer } from "@/lib/maya-talk-review";
import { aiMathReviewer, type MathReviewer } from "@/lib/maya-math-review";
import { callMathReviewer, callReviewer } from "@/lib/maya-call-seams";
import { mayaAiClient } from "@/lib/maya-ai-route";
import { redactText } from "@/lib/maya-trace";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession } from "@/lib/maya-text";
import { runTextSession } from "@/lib/maya-text-run";

interface Options {
  question: string;
  model: "fake" | "openrouter" | "anthropic";
  freeTalk: boolean;
  script: string | null;
  runner: "livekit" | "plain";
  trace: string | null;
  seed: number;
  name: string | null;
  list: boolean;
  /** The real clock with a script, so the trace times each model call (latency checks). */
  realClock: boolean;
  /** Maya's version 2 model (code-written lines), for a before-and-after comparison. */
  legacy: boolean;
  /** How much the model thinks first (D-341 latency checks); default CONVERSATION_EFFORT. */
  effort: "none" | "minimal" | "low" | "medium" | "high" | null;
  /** D-345: the tutor core. */
  tutor: boolean;
  /** As the voice worker (modelRepair false), with the first-sentence time of each child turn. */
  voice: boolean;
  /** As desk chat: channel chat, plain runner, free talk off with the safety review on, no streaming, the real clock. */
  chat: boolean;
}

function parse(argv: string[]): Options {
  const o: Options = { question: "add-27-39", model: "fake", freeTalk: true, script: null, runner: "livekit", trace: null, seed: 1, name: null, list: false, realClock: false, legacy: false, effort: null, tutor: false, voice: false, chat: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => {
      const x = argv[++i];
      if (x === undefined) throw new Error(`${a} needs a value`);
      return x;
    };
    if (a === "--question") o.question = v();
    else if (a === "--model") {
      const m = v();
      if (m !== "fake" && m !== "openrouter" && m !== "anthropic") throw new Error("--model is fake, openrouter or anthropic");
      o.model = m;
    } else if (a === "--anthropic") o.model = "anthropic";
    else if (a === "--no-free-talk") o.freeTalk = false;
    else if (a === "--tutor") o.tutor = true;
    else if (a === "--voice") o.voice = true;
    else if (a === "--chat") o.chat = true;
    else if (a === "--script") o.script = v();
    else if (a === "--runner") {
      const r = v();
      if (r !== "livekit" && r !== "plain") throw new Error("--runner is livekit or plain");
      o.runner = r;
    } else if (a === "--trace") o.trace = v();
    else if (a === "--seed") o.seed = Number(v());
    else if (a === "--name") o.name = v();
    else if (a === "--list") o.list = true;
    else if (a === "--real-clock") o.realClock = true;
    else if (a === "--legacy") o.legacy = true;
    else if (a === "--effort") {
      const e = v();
      if (!["none", "minimal", "low", "medium", "high"].includes(e)) throw new Error("--effort is none, minimal, low, medium or high");
      o.effort = e as Options["effort"];
    }
    else throw new Error(`unknown option ${a}`);
  }
  if (o.chat && o.voice) throw new Error("--chat and --voice cannot go together");
  if (o.chat) { o.runner = "plain"; o.freeTalk = false; o.realClock = true; }
  return o;
}

/** KEY=value lines of an env file (vercel env pull writes .env.local). */
function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, "$1").replace(/\\n/g, "\n");
  }
  return out;
}

/** The Claude API key: ANTHROPIC_API_KEY, else the Keychain item anthropic-unica-tools. In process.env so traces redact it. */
function anthropicKey(): string {
  let key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    try {
      key = execFileSync("security", ["find-generic-password", "-s", "anthropic-unica-tools", "-w"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      key = "";
    }
  }
  if (!key) throw new Error("--model anthropic needs ANTHROPIC_API_KEY or the Keychain item anthropic-unica-tools.");
  process.env.ANTHROPIC_API_KEY = key;
  return key;
}

/**
 * Maya's model, the free-talk review (D-197) and the tutor core's math-truth review for the chosen model. The math review
 * is the site's own (callMathReviewer); the fake rule player has none, as on the site.
 */
function models(o: Options, root: string): { maya: MayaModel; reviewer: TalkReviewer; mathReviewer: MathReviewer | null } {
  if (o.model === "fake") return { maya: ruleConversationalModel(), reviewer: fakeTalkReviewer(), mathReviewer: null };
  if (o.model === "anthropic") {
    const key = anthropicKey();
    return {
      maya: conversationalMayaModel(anthropicClient({ apiKey: key })), reviewer: aiTalkReviewer(anthropicClient({ apiKey: key, model: "claude-haiku-5-5" })),
      mathReviewer: aiMathReviewer(anthropicClient({ apiKey: key, model: "claude-haiku-5-5" }), undefined, { client: anthropicClient({ apiKey: key, model: "claude-sonnet-5-5" }) }),
    };
  }
  // The site's own builds: Maya's route (Azure, then Anthropic; mayaAiClient), the review and the math review (callSeams).
  const maya = model(o, root);
  const review = callReviewer(maya.id, process.env);
  return { maya, reviewer: review ?? fakeTalkReviewer(() => ({ verdict: "error", reason: "no review client" })), mathReviewer: callMathReviewer(maya.id, process.env) };
}

/** One review as the CLI saw it: which, the model, when it started (ms from the session start), how long it took, and its answer. */
interface ReviewTime { review: "safety" | "math" | "math-retry"; model: string; startMs: number; ms: number; answer: string; input: unknown }

/** The reviewers, each review timed from its start to its answer (or to its end: an error, or the time limit's abort). */
function timeReviews(reviewer: TalkReviewer, math: MathReviewer | null, times: ReviewTime[], t0: number): { reviewer: TalkReviewer; mathReviewer: MathReviewer | null } {
  async function time<T extends { verdict: string }>(review: ReviewTime["review"], model: string, input: unknown, run: () => Promise<T>, signal: AbortSignal): Promise<T> {
    const start = Date.now();
    try {
      const r = await run();
      times.push({ review, model, startMs: start - t0, ms: Date.now() - start, answer: r.verdict, input });
      return r;
    } catch (e) {
      times.push({ review, model, startMs: start - t0, ms: Date.now() - start, answer: signal.aborted ? "time-out" : "error", input });
      throw e;
    }
  }
  const mathOf = (m: MathReviewer, review: "math" | "math-retry"): MathReviewer => ({
    id: m.id, promptVersion: m.promptVersion,
    ...(m.retry ? { retry: mathOf(m.retry, "math-retry") } : {}),
    review: (input, signal) => time(review, m.id, input, () => m.review(input, signal), signal),
  });
  return {
    reviewer: { id: reviewer.id, promptVersion: reviewer.promptVersion, review: (input, signal) => time("safety", reviewer.id, input, () => reviewer.review(input, signal), signal) },
    mathReviewer: math ? mathOf(math, "math") : null,
  };
}

/** p50, p90 and max of a list of ms. */
function spread(ms: number[]): string {
  if (!ms.length) return "none";
  const s = [...ms].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
  return `n ${s.length}, p50 ${at(0.5)} ms, p90 ${at(0.9)} ms, max ${s.at(-1)} ms`;
}

function model(o: Options, root: string): MayaModel {
  if (o.model === "fake") return ruleConversationalModel();
  const env: Record<string, string | undefined> = { ...process.env };
  const file = join(root, ".env.local");
  if (!env.OPENROUTER_API_KEY && existsSync(file)) {
    const fromFile = readEnvFile(file);
    env.OPENROUTER_API_KEY = fromFile.OPENROUTER_API_KEY;
    // In process.env too, so the trace and the log redact this key wherever it appears (configuredSecrets).
    if (fromFile.OPENROUTER_API_KEY) process.env.OPENROUTER_API_KEY = fromFile.OPENROUTER_API_KEY;
    env.AI_MODEL ??= fromFile.AI_MODEL;
  }
  const client = mayaAiClient(env);
  if (!client) throw new Error("--model openrouter needs OPENROUTER_API_KEY (in the environment or .env.local). The AI is off without it.");
  return o.legacy ? aiMayaModel(client) : conversationalMayaModel(client, o.effort ? { effort: o.effort } : {});
}

async function main() {
  const root = resolve(process.env.MAYA_ROOT ?? process.cwd());
  const o = parse(process.argv.slice(2));
  if (o.list) {
    for (const [id, p] of Object.entries(SAMPLE_PACKAGES)) console.log(`${id}\t${p.text}`);
    return;
  }
  const pkg = SAMPLE_PACKAGES[o.question] ?? (existsSync(o.question) ? JSON.parse(readFileSync(o.question, "utf8")) : undefined);
  if (pkg === undefined) throw new Error(`no sample "${o.question}" and no such file (see --list)`);
  const reviewTimes: ReviewTime[] = [];
  const built = models(o, root);
  const m = built.maya;
  const { reviewer, mathReviewer } = timeReviews(built.reviewer, built.mathReviewer, reviewTimes, Date.now());

  const typed = !o.script && process.stdin.isTTY;
  let simulated = Date.now();
  const clock = typed || o.realClock ? () => Date.now() : () => simulated;
  const callId = `text-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  // --voice: the time from each child turn to Maya's first and last sentence.
  let turnStart: number | null = null;
  let firstSay: number | null = null;
  let lastSay: number | null = null;
  const timings: string[] = [];
  const text = createTextSession({
    callId, package: pkg, model: m, clock, random: o.seed, childName: o.name, runner: o.runner === "livekit" ? "livekit-text" : "text",
    // Desk chat keeps the safety review with free talk off (maya-call.ts textSession).
    freeTalk: o.freeTalk, reviewer: o.freeTalk || o.chat ? reviewer : null, tutor: o.tutor, mathReviewer,
    ...(o.chat ? { channel: "chat" as const } : {}),
    // D-341: as the voice worker, stream each checked sentence as it arrives; the trace times the first one. Only a voice
    // session streams (onSayPart also gives a tutor repair the voice budget), so a text or chat run is not timed so.
    ...(o.voice ? {
      modelRepair: false,
      onSayPart: () => {
        const at = Date.now();
        if (turnStart !== null) { firstSay ??= at - turnStart; lastSay = at - turnStart; }
      },
    } : {}),
    onError: (e, where) => console.error(`[maya-text] ${typeof where === "string" ? where : `turn ${where.turn} ${where.source}`}: ${e instanceof Error ? e.message : String(e)}`),
  });
  console.log(`-- Maya text session ${callId}: ${typeof pkg.text === "string" ? pkg.text : o.question} (model ${m.id}, runner ${o.runner}${o.chat ? ", chat" : ""}, free talk ${o.freeTalk ? `on, review ${reviewer.id}` : "off"}, math review ${mathReviewer ? `${mathReviewer.id}${mathReviewer.retry ? `, retry ${mathReviewer.retry.id}` : ""}` : "none"})`);
  const path = resolve(o.trace ?? join(root, "traces/maya", `${callId}.json`));
  const timed = !o.voice ? text : new Proxy(text, {
    get(target, key, receiver) {
      if (key !== "child") return Reflect.get(target, key, receiver);
      return async (line: string, opts?: Parameters<typeof text.child>[1]) => {
        turnStart = Date.now(); firstSay = null; lastSay = null;
        const out = await target.child(line, opts);
        timings.push(`${JSON.stringify(line)}: first ${firstSay ?? "-"} ms, last ${lastSay ?? "-"} ms`);
        turnStart = null;
        return out;
      };
    },
  });
  const { trace, error } = await runTextSession({
    text: timed,
    lines: () =>
      o.script
        ? (async function* () { yield* readFileSync(o.script!, "utf8").split("\n"); })()
        : createInterface({ input: process.stdin, output: typed ? process.stdout : undefined, prompt: "" }),
    livekit: o.runner === "livekit" ? livekitTextSession : null,
    advance: (ms) => (simulated += ms),
    echoChild: !typed,
    log: (line) => console.log(line),
    // Raw error text: on stderr for local debugging, never in the trace.
    debug: (line) => console.error(line),
    writeTrace: (t) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(t, null, 2)}\n`);
      console.log(`-- trace: ${path}`);
    },
  });
  console.log(`-- counts: ${JSON.stringify(trace.counts)}`);
  for (const t of timings) console.log(`-- timing ${t}`);
  writeFileSync(path.replace(/\.json$/, "") + ".reviews.json", `${JSON.stringify(reviewTimes, null, 2)}\n`);
  for (const kind of ["safety", "math", "math-retry"] as const) {
    const all = reviewTimes.filter((r) => r.review === kind);
    if (all.length) console.log(`-- review times ${kind}: ${spread(all.map((r) => r.ms))}; time-outs ${all.filter((r) => r.answer === "time-out").length}`);
  }
  // Each piece of Maya's own words, both checks and what was said (D-197).
  for (const t of trace.turns) {
    if (t.kind !== "maya" || !t.output) continue;
    for (const x of t.attempts.at(-1)?.talk ?? []) console.log(`-- free talk: "${x.proposed}" code ${x.code ?? "pass"}, review ${x.review}${x.rules ? ` (${x.rules.join(", ")})` : ""} -> "${x.shown}"`);
  }
  if (error) throw error;
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(redactText(e instanceof Error ? e.message : String(e)));
    process.exit(1);
  },
);
