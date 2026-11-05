// The command line of the listening-test kit (#533). Run it with `npm run voice:listen -- <command> [options]`;
// scripts/voice-listening-test.mjs bundles this file. A local tool: the worker and the site never import it.
//
// Commands:
//   make   --dir <folder> [--fake] [--candidates inworld,cartesia,elevenlabs] [--seed <n>] [--timeout-ms <n>] [--force]
//          Renders the 12 sentences (and the math lines as written) with every voice and shuffles them under letters.
//          Writes <folder>/listener (what listeners get: audio/ at one sample rate and one timestamp, written in a
//          shuffled order, answer-sheet.md, answers-template.csv, letters.json, answers/) and <folder>/operator (never
//          for listeners: key-do-not-open.json, measures.json, operator-report.md). --fake uses the fake voice (silent
//          files, fake word timings, no key). Without it each candidate needs its keys and two voice ids
//          (docs/maya-voice-deploy.md, "Listening test"); a missing one stops the run before any request.
//   record --dir <listener folder> --listener <name>
//          Asks for one listener's choices in the terminal and writes answers/<name>.csv. Needs no key.
//   score  --dir <folder> [--answers <folder>]
//          Reads the answers (default <folder>/listener/answers), refuses an incomplete set, unblinds them with the key
//          in <folder>/operator and writes <folder>/operator/results.md.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { randomInt } from "node:crypto";
import { initializeLogger } from "@livekit/agents";
import {
  blindPlan,
  CANDIDATES,
  kitConfig,
  makeVoice,
  MIN_LISTENERS,
  readAnswers,
  renderLine,
  score,
  seeded,
  SENTENCES,
  sentenceProblems,
  writeListenerFolder,
  type Answer,
  type Clip,
  type Measure,
  type PlanItem,
  type VoiceUnderTest,
} from "./listening-test";

interface Key {
  seed: number;
  fake: boolean;
  madeAt: string;
  voices: (VoiceUnderTest & { name: string; route: string })[];
  plan: PlanItem[];
}

const args = process.argv.slice(2);
const command = args[0];
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i > 0 && i + 1 < args.length ? args[i + 1] : undefined;
};
const fail = (message: string, code = 2): never => {
  console.error(message);
  process.exit(code);
};

function folder(): string {
  const dir = option("dir");
  if (!dir) fail("--dir <folder> is required");
  return resolve(dir!);
}

function readKey(dir: string): Key {
  const path = join(dir, "operator", "key-do-not-open.json");
  if (!existsSync(path)) fail(`no key in ${dir}: run make first`);
  return JSON.parse(readFileSync(path, "utf8")) as Key;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};

function operatorReport(key: Key, measures: Measure[]): string {
  const out = ["# Listening test: operator report", "", "This report names the vendors. Keep it from the listeners until they are done.", ""];
  if (key.fake) out.push("**Fake voice.** The files are silence and the word timings are made up by the fake. This run proves the kit works, nothing about any real voice.", "");
  out.push(`Made ${key.madeAt}, seed ${key.seed}. Every text went through the same LiveKit Agents for Node TTS stream the worker uses, one sentence at a time, as the worker sends it.`, "");
  out.push("## Word timings", "", "Matched words are counted with the worker's board alignment (speech-audio.ts). All matched: the board follows each word. Fewer: the rest waits for the sentence's audio end.", "");
  out.push("| Voice | Route | Files with timed words | Timing check (s04, words) | Words matched, part 1 | Words matched, part 2 (digits) | Median first audio (ms) | Errors |", "|---|---|---|---|---|---|---|---|");
  for (const v of key.voices) {
    const mine = measures.filter(m => m.voice === v.key);
    const sum = (part: "voice" | "math") => {
      const xs = mine.filter(m => m.part === part);
      return `${xs.reduce((n, m) => n + m.matched, 0)} of ${xs.reduce((n, m) => n + m.expected, 0)}`;
    };
    const check = mine.find(m => m.part === "voice" && m.sentence === "s04");
    const errors = mine.filter(m => m.error).length;
    out.push(`| ${v.name}, ${v.voice} | ${v.route} | ${mine.filter(m => m.timedWords > 0).length} of ${mine.length} | ${check ? `${check.matched} of ${check.expected}` : "-"} | ${sum("voice")} | ${sum("math")} | ${median(mine.flatMap(m => (m.firstAudioMs === null ? [] : [m.firstAudioMs]))) ?? "-"} | ${errors} |`);
  }
  out.push("", "## How each voice got the math lines (part 2)", "", "The timed words a voice returned for each line as written. They may repeat the text sent, not what the voice said: the listeners' misread marks decide.", "");
  for (const v of key.voices) {
    out.push(`### ${v.name}, ${v.voice}`, "");
    for (const m of measures.filter(x => x.voice === v.key && x.part === "math")) {
      const s = SENTENCES.find(x => x.id === m.sentence)!;
      out.push(`- ${s.id}: sent "${s.written}"; timed words: ${m.timedText ? `"${m.timedText}"` : "none"}${m.error ? `; error: ${m.error}` : ""}`);
    }
    out.push("");
  }
  return `${out.join("\n")}\n`;
}

async function make() {
  const dir = folder();
  if (existsSync(dir) && readdirSync(dir).length) {
    if (!existsSync(join(dir, "operator", "key-do-not-open.json"))) fail(`${dir} is not empty and holds no listening test; use an empty folder`);
    if (!flag("force")) fail(`${dir} already holds a test; use another folder, or --force to replace it`);
  }
  const problems = sentenceProblems();
  if (problems.length) fail(`the sentences are not Maya's lines any more:\n${problems.join("\n")}`);
  const candidates = option("candidates")?.split(",").map(s => s.trim()).filter(Boolean);
  const config = kitConfig(process.env, { fake: flag("fake"), candidates });
  if (!config.ok) fail(`refused, nothing was sent:\n- ${config.problems.join("\n- ")}\nUse --fake to run the kit with no key.`);
  if (!config.ok) return;
  const seed = option("seed") ? Number(option("seed")) : randomInt(1, 2 ** 31);
  if (!Number.isSafeInteger(seed)) fail("--seed must be a whole number");
  const timeoutMs = option("timeout-ms") ? Number(option("timeout-ms")) : 30_000;
  const plan = blindPlan(config.voices, seed);
  const measures: Measure[] = [];
  // Rendered voice by voice into memory; written to the listener folder in a shuffled order afterwards.
  const clips: Clip[] = [];
  for (const v of config.voices) {
    const voice = await makeVoice(v, config);
    try {
      for (const item of plan.filter(p => p.voice === v.key)) {
        const s = SENTENCES.find(x => x.id === item.sentence)!;
        const text = item.part === "voice" ? s.spoken : s.written;
        const r = await renderLine(voice, text, { timeoutMs });
        clips.push({ file: item.file, samples: r.samples, sampleRate: r.sampleRate });
        measures.push({
          voice: v.key, part: item.part, sentence: s.id, timedWords: r.timedWords, matched: r.matched, expected: r.expected, firstAudioMs: r.firstAudioMs,
          audioMs: Math.round((r.samples.length / r.sampleRate) * 1000), error: r.error, timedText: r.timed.map(t => t.text.trim()).join(" "),
        });
        process.stdout.write(r.error ? `\n${item.file} error: ${r.error}\n` : ".");
      }
    } finally {
      await voice.close();
    }
  }
  const key: Key = {
    seed, fake: config.fake, madeAt: new Date().toISOString(), plan,
    voices: config.voices.map(v => { const c = CANDIDATES.find(x => x.id === v.candidate)!; return { ...v, name: c.name, route: c.route }; }),
  };
  if (flag("force")) rmSync(dir, { recursive: true, force: true });
  const operator = join(dir, "operator");
  const listener = join(dir, "listener");
  mkdirSync(operator, { recursive: true });
  // The write order has its own randomness: from the plan's seed, a file's inode order would give back the whole key.
  writeListenerFolder(listener, plan, clips, { random: () => randomInt(2 ** 31) / 2 ** 31, time: new Date("2026-01-01T00:00:00Z") });
  writeFileSync(join(operator, "key-do-not-open.json"), `${JSON.stringify(key, null, 2)}\n`);
  writeFileSync(join(operator, "measures.json"), `${JSON.stringify(measures, null, 2)}\n`);
  writeFileSync(join(operator, "operator-report.md"), operatorReport(key, measures));
  const errors = measures.filter(m => m.error).length;
  console.log(`\n${plan.length} files${config.fake ? " (fake voice)" : ""}.\nGive listeners only ${listener}.\nKeep ${operator} from them until they are done.${errors ? `\n${errors} files had errors; see operator-report.md.` : ""}`);
  if (errors) process.exitCode = 1;
}

interface Letters {
  part: "voice" | "math";
  sentence: string;
  letters: string[];
}

async function record() {
  const dir = folder();
  const listener = option("listener")?.trim() ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/.test(listener)) fail("--listener <name>: letters, digits, spaces, '_' or '-', at most 40");
  if (!existsSync(join(dir, "letters.json"))) fail(`no letters.json in ${dir}: pass the listener folder that make wrote`);
  const sheet = JSON.parse(readFileSync(join(dir, "letters.json"), "utf8")) as Letters[];
  const path = join(dir, "answers", `${listener}.csv`);
  if (existsSync(path)) fail(`${path} already exists; each listener answers once`);
  // A line iterator, not rl.question: it keeps lines that arrive before the question (piped answers).
  const rl = createInterface({ input: process.stdin, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  const rows = ["listener,part,sentence,favourite,misread"];
  const ask = async (question: string, ok: (a: string) => boolean): Promise<string> => {
    for (;;) {
      process.stdout.write(question);
      const next = await lines.next();
      if (next.done) { rl.close(); return fail("\nThe answers ended before the last sentence; nothing was saved."); }
      const a = String(next.value).trim().toUpperCase();
      if (ok(a)) return a;
      console.log("Please answer with the letters shown.");
    }
  };
  for (const part of ["voice", "math"] as const) {
    console.log(part === "voice" ? "\nPart 1: your favourite voice for each sentence." : "\nPart 2: which files read the math wrong?");
    for (const s of SENTENCES.filter(x => part === "voice" || x.math)) {
      const letters = sheet.find(l => l.part === part && l.sentence === s.id)?.letters ?? [];
      if (!letters.length) { rl.close(); fail(`letters.json has no letters for ${part} ${s.id}`); }
      console.log(`\n${part === "voice" ? s.id : `m${s.id.slice(1)}`} (${letters.join(", ")}): "${s.spoken}"`);
      const within = (a: string) => a.split(/[^A-Z]+/).filter(Boolean).every(l => letters.includes(l));
      const favourite = part === "voice" ? await ask("Favourite letter: ", a => letters.includes(a)) : "";
      const misread = await ask("Letters that said a word wrong (blank for none): ", within);
      rows.push(`${listener},${part},${s.id},${favourite},${misread.split(/[^A-Z]+/).filter(Boolean).join(" ")}`);
    }
  }
  rl.close();
  mkdirSync(join(dir, "answers"), { recursive: true });
  writeFileSync(path, `${rows.join("\n")}\n`);
  console.log(`\nSaved ${path}.`);
}

function scoreCommand() {
  const dir = folder();
  const key = readKey(dir);
  const measures = JSON.parse(readFileSync(join(dir, "operator", "measures.json"), "utf8")) as Measure[];
  const answersDir = resolve(option("answers") ?? join(dir, "listener", "answers"));
  const files = existsSync(answersDir) ? readdirSync(answersDir).filter(f => f.endsWith(".csv")) : [];
  if (!files.length) fail(`no answers in ${answersDir}`);
  const answers: Answer[] = [];
  for (const f of files) {
    const r = readAnswers(readFileSync(join(answersDir, f), "utf8"), key.plan, f.replace(/\.csv$/, ""));
    if (r.problems.length) fail(`${f}:\n- ${r.problems.join("\n- ")}`);
    answers.push(...r.answers);
  }
  const result = score(key.plan, answers, measures);
  if (!result.ok) return fail(`not scored, the answers are not complete:\n- ${result.problems.join("\n- ")}`);
  const name = (k: string) => { const v = key.voices.find(x => x.key === k)!; return `${v.name}, ${v.voice}`; };
  const out = ["# Listening test: results", ""];
  if (key.fake) out.push("**Fake voice.** These results test the kit only.", "");
  out.push(`Listeners: ${result.listeners.join(", ")}. A voice passes when at least ${Math.ceil((result.listeners.length * 2) / 3)} of ${result.listeners.length} listeners chose it most often, no listener marked a misread on its math lines, and its word timings matched every word of s04. No voice passes with fewer than ${MIN_LISTENERS} listeners.`, "");
  out.push(`| Voice | ${result.listeners.map(l => `${l} (favourites)`).join(" | ")} | First choice of | Math misreads | Word timings on s04 | Files with timed words | Pass |`);
  out.push(`|---|${result.listeners.map(() => "---|").join("")}---|---|---|---|---|`);
  for (const v of result.voices) out.push(`| ${name(v.voice)} | ${result.listeners.map(l => v.favourites[l]).join(" | ")} | ${v.firstChoiceOf.join(", ") || "-"} | ${v.mathMisreads} | ${v.wordTimingsOnCheck ? "yes" : "no"} | ${v.timedFiles} | ${v.pass ? "yes" : "no"} |`);
  const passed = result.voices.filter(v => v.pass).map(v => name(v.voice));
  out.push("", passed.length ? `Passed: ${passed.join("; ")}.` : "No voice passed.", "");
  writeFileSync(join(dir, "operator", "results.md"), `${out.join("\n")}\n`);
  console.log(out.join("\n"));
}

initializeLogger({ pretty: true, level: "warn" });
if (command === "make") await make();
else if (command === "record") await record();
else if (command === "score") scoreCommand();
else fail("usage: npm run voice:listen -- make|record|score --dir <folder> [options] (see worker/maya-voice/src/listening-cli.ts)");
