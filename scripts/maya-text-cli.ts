// The command line for Maya's text sessions (#322). Run it with `npm run maya:text -- [options]`; scripts/maya-text.mjs
// bundles this file. A local tool: nothing in src imports it.
//
// Options:
//   --question <id|file>     a sample id (default add-27-39; see --list) or a question package JSON file
//   --model fake|openrouter  fake: the rule player, no AI (default). openrouter: AI_MODEL through OpenRouter; needs
//                            OPENROUTER_API_KEY (read from the environment, or from .env.local when it is not set)
//   --script <file>          child turns, one per line; without it, turns come from stdin (typed when it is a terminal)
//   --runner livekit|plain   livekit: LiveKit Agents text mode, no room (default). plain: the text adapter alone
//   --trace <file>           where to write the trace (default traces/maya/<call id>.json)
//   --seed <n>               the wording seed (default 1)
//   --name <child name>      the child's name, said now and then by code
//   --list                   list the sample questions
//
// Script lines: a child turn, or "/wait <seconds>" (the clock moves on and the pause policy runs), "/write start",
// "/write done", "/quit" (the child hangs up: child_stopped). "#" starts a comment. With --script or piped input the
// clock is simulated (4 seconds a turn, plus each /wait); typed input uses the real clock.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { aiClient } from "@/lib/ai-client";
import { livekitTextSession } from "@/lib/maya-livekit-text";
import { aiMayaModel, type MayaModel } from "@/lib/maya-model";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { redactText } from "@/lib/maya-trace";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession } from "@/lib/maya-text";
import { runTextSession } from "@/lib/maya-text-run";

interface Options {
  question: string;
  model: "fake" | "openrouter";
  script: string | null;
  runner: "livekit" | "plain";
  trace: string | null;
  seed: number;
  name: string | null;
  list: boolean;
}

function parse(argv: string[]): Options {
  const o: Options = { question: "add-27-39", model: "fake", script: null, runner: "livekit", trace: null, seed: 1, name: null, list: false };
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
      if (m !== "fake" && m !== "openrouter") throw new Error("--model is fake or openrouter");
      o.model = m;
    } else if (a === "--script") o.script = v();
    else if (a === "--runner") {
      const r = v();
      if (r !== "livekit" && r !== "plain") throw new Error("--runner is livekit or plain");
      o.runner = r;
    } else if (a === "--trace") o.trace = v();
    else if (a === "--seed") o.seed = Number(v());
    else if (a === "--name") o.name = v();
    else if (a === "--list") o.list = true;
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

function model(o: Options, root: string): MayaModel {
  if (o.model === "fake") return ruleMayaModel();
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
  return aiMayaModel(client);
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
  const m = model(o, root);

  const typed = !o.script && process.stdin.isTTY;
  let simulated = Date.now();
  const clock = typed ? () => Date.now() : () => simulated;
  const callId = `text-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const text = createTextSession({
    callId, package: pkg, model: m, clock, random: o.seed, childName: o.name, runner: o.runner === "livekit" ? "livekit-text" : "text",
    onError: (e, where) => console.error(`[maya-text] ${typeof where === "string" ? where : `turn ${where.turn} ${where.source}`}: ${e instanceof Error ? e.message : String(e)}`),
  });
  console.log(`-- Maya text session ${callId}: ${typeof pkg.text === "string" ? pkg.text : o.question} (model ${m.id}, runner ${o.runner})`);
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
  if (error) throw error;
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(redactText(e instanceof Error ? e.message : String(e)));
    process.exit(1);
  },
);
