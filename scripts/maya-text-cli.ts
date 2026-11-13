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
//
// Script lines: a child turn, or "/wait <seconds>" (the clock moves on and the pause policy runs), "/write start",
// "/write done", "/quit" (the child hangs up: child_stopped). "#" starts a comment. With --script or piped input the
// clock is simulated (4 seconds a turn, plus each /wait); typed input uses the real clock.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";
import { aiClient } from "@/lib/ai-client";
import { anthropicClient } from "@/lib/ai-anthropic";
import { livekitTextSession } from "@/lib/maya-livekit-text";
import { aiMayaModel, conversationalMayaModel, type MayaModel } from "@/lib/maya-model";
import { ruleConversationalModel } from "@/lib/maya-model-fake";
import { aiTalkReviewer, fakeTalkReviewer, REVIEW_DEFAULT_MODEL, type TalkReviewer } from "@/lib/maya-talk-review";
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
}

function parse(argv: string[]): Options {
  const o: Options = { question: "add-27-39", model: "fake", freeTalk: true, script: null, runner: "livekit", trace: null, seed: 1, name: null, list: false, realClock: false, legacy: false, effort: null };
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

/** Maya's model and the free-talk review (D-197) for the chosen model. */
function models(o: Options, root: string): { maya: MayaModel; reviewer: TalkReviewer } {
  if (o.model === "fake") return { maya: ruleConversationalModel(), reviewer: fakeTalkReviewer() };
  if (o.model === "anthropic") {
    const key = anthropicKey();
    return { maya: conversationalMayaModel(anthropicClient({ apiKey: key })), reviewer: aiTalkReviewer(anthropicClient({ apiKey: key, model: "claude-haiku-5-5" })) };
  }
  const maya = model(o, root);
  const review = aiClient(process.env, process.env.MAYA_REVIEW_MODEL?.trim() || REVIEW_DEFAULT_MODEL);
  return { maya, reviewer: review ? aiTalkReviewer(review) : fakeTalkReviewer(() => ({ verdict: "error", reason: "no review client" })) };
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
  const client = aiClient(env);
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
  const { maya: m, reviewer } = models(o, root);

  const typed = !o.script && process.stdin.isTTY;
  let simulated = Date.now();
  const clock = typed || o.realClock ? () => Date.now() : () => simulated;
  const callId = `text-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const text = createTextSession({
    callId, package: pkg, model: m, clock, random: o.seed, childName: o.name, runner: o.runner === "livekit" ? "livekit-text" : "text",
    freeTalk: o.freeTalk, reviewer: o.freeTalk ? reviewer : null,
    // D-341: stream each checked sentence as it arrives, as the voice worker does; the trace times the first one.
    onSayPart: () => {},
    onError: (e, where) => console.error(`[maya-text] ${typeof where === "string" ? where : `turn ${where.turn} ${where.source}`}: ${e instanceof Error ? e.message : String(e)}`),
  });
  console.log(`-- Maya text session ${callId}: ${typeof pkg.text === "string" ? pkg.text : o.question} (model ${m.id}, runner ${o.runner}, free talk ${o.freeTalk ? `on, review ${reviewer.id}` : "off"})`);
  const path = resolve(o.trace ?? join(root, "traces/maya", `${callId}.json`));
  const { trace, error } = await runTextSession({
    text,
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
