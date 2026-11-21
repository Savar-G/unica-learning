// #1139 repeatable baseline run (docs/maya-baseline.md). Needs a self-hosted `livekit-server --dev` and real provider
// settings in the environment. It refuses any LiveKit URL that is not a loopback address.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const { values } = parseArgs({ options: {
  url: { type: "string", default: "ws://127.0.0.1:7180" }, out: { type: "string" }, teaching: { type: "string", default: "existing,checked" },
  calls: { type: "string", default: "1" }, concurrency: { type: "string", default: "1" }, network: { type: "string", default: "loopback" },
  device: { type: "string", default: "node-loopback" }, speech: { type: "string", default: "real" }, "health-port": { type: "string", default: "7190" },
} });
if (!/^ws:\/\/(127\.0\.0\.1|localhost):\d+$/.test(values.url)) throw Error("The baseline runs only on a self-hosted loopback LiveKit server");
if (!values.out) throw Error("Usage: node --conditions=react-server scripts/maya-baseline-run/run.mjs --out <dir> [--teaching existing,checked] [--calls 1] [--concurrency 1]");
if (!["real", "fake"].includes(values.speech)) throw Error("--speech is real or fake");
// The speech doubles replace both speech providers; the model stays real. The worker reads these per job process.
if (values.speech === "fake") { process.env.MAYA_STT = "fake"; process.env.MAYA_TTS = "fake"; }
const out = resolve(values.out);
mkdirSync(join(out, "prompts"), { recursive: true });
mkdirSync(join(out, "receipts"), { recursive: true });

// The prompts: macOS speech, 24 kHz mono 16-bit. Silence gaps are part of the cases.
const PROMPTS = {
  first: "What do I do first?", regroup: "Can you show me how to regroup?", four: "four",
  "fourteen-pause": "four [[slnc 1000]] teen", correction: "four. no, fourteen", why: "Why do we have to trade a ten for ten ones?",
  thinking: "um [[slnc 3000]] is it thirty four?", question: "wait, I have a question.",
};
const say = (name, text, voice, extra = []) => {
  const wav = join(out, "prompts", `${name}.wav`);
  if (existsSync(wav)) return wav;
  execFileSync("say", ["-v", voice, "-o", join(out, "prompts", `${name}.aiff`), ...extra, text]);
  execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@24000", "-c", "1", join(out, "prompts", `${name}.aiff`), wav]);
  return wav;
};
for (const [name, text] of Object.entries(PROMPTS)) say(name, text, "Samantha");
// Background speech: another voice with no child speech. run.ts plays it 18 dB quieter.
say("background", "And now the weather for tomorrow. Cloudy in the morning with sun later in the day.", "Daniel");

const common = { absWorkingDir: root, bundle: true, platform: "node", target: "node22", format: "esm", packages: "external",
  alias: { "@": join(root, "src") }, conditions: ["react-server"], logLevel: "warning" };
const dist = join(root, "node_modules/.cache/maya-baseline-run");
await build({ ...common, entryPoints: [join(root, "scripts/maya-baseline-run/agent.ts")], outfile: join(dist, "agent.mjs") });
await build({ ...common, entryPoints: [join(root, "scripts/maya-baseline-run/run.ts")], outfile: join(dist, "run.mjs") });
const { main } = await import(join(dist, "run.mjs"));
await main({ url: values.url, agent: join(dist, "agent.mjs"), out, teachings: values.teaching.split(","), calls: Number(values.calls),
  concurrency: Number(values.concurrency), network: values.network, device: values.device, healthPort: Number(values["health-port"]), fake: values.speech === "fake" });
process.exit(process.exitCode ?? 0);
