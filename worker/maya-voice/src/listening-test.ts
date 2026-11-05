// The listening-test kit for Maya's voice (#533, D-238): Savar and two other listeners choose the voice by ear, without
// knowing the vendor. It renders 12 of Maya's real code-written sentences with each candidate voice, shuffles the files,
// hides the vendor behind a letter per sentence, writes an answer sheet, records each listener's choices and scores them
// against the hidden key. The command line is scripts/voice-listening-test.mjs (listening-cli.ts); the test design is
// section 12, part A, of .design/research/maya-voice-council-2026-11/council-voice-claude.md.
//
// What it measures per voice, besides the listeners' choices:
// - Word timings: whether the voice returned timed words through the Node worker's own TTS stream (LiveKit Agents
//   1.9.5), and how many of the sentence's words the worker's board alignment could match (the same prefix rule as
//   speech-audio.ts). The board draws in time with matched words; anything else falls back to the sentence's end.
// - How it reads math: each math sentence is rendered a second time as Maya's worker sends it today (digits and signs,
//   "3/4 = 6/8"). Listeners mark misreads; the report lists the timed words the voice returned. Those words can be the
//   provider's copy of the input text, not what it said, so only the listeners judge the reading.
//
// Blind (R598-1): listeners get only the listener folder (writeListenerFolder). Every clip in it has one sample rate
// (LISTENER_RATE) and one timestamp, and the files are written in a shuffled order, so neither a vendor's sample rate
// nor the order of rendering (voice by voice) shows. The key, the measures and the operator report stay in the
// operator folder.
//
// Only Maya's fixed sentences go to a voice provider: no child data, no name. The fake voice needs no key and writes
// silent files with fake word timings. A real candidate without its key or its two voice ids is refused.
import { allLineTexts, PHRASES, speechKey, writtenFractions } from "@/lib/maya";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { ACK_PHRASES } from "@/lib/maya-voice-ack";
import { speechSentences, speechWords } from "@/lib/board-speech";
import type { AnswerValue, OperationPackage, QuestionPackage } from "@/lib/question-package";
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tts } from "@livekit/agents";
import { AudioFrame, AudioResampler, AudioResamplerQuality } from "@livekit/rtc-node";
import { FakeTTS } from "./fake-providers";

// ---------- the sentences ----------

export interface Sentence {
  id: string;
  /** Where the line comes from in Maya's code: a template key with its sample question, or a bank id. */
  source: string;
  /** The line as Maya's code writes it (and as the worker sends it to the voice today). */
  written: string;
  /** The same line with every number, fraction and sign in words: what the blind test plays. */
  spoken: string;
  /** A math line: also rendered as written, to hear how the voice reads digits, signs and fractions. */
  math: boolean;
  /** The line has one word timing check that counts for the pass bar (the longest step line). */
  timingCheck?: boolean;
}

/** Where a sentence's written form must be found: a sample package's lines (with heard values), or a fixed bank. */
type Origin = { pkg: keyof typeof SAMPLE_PACKAGES; heard?: AnswerValue[]; key: string } | { bank: "phrases" | "ack"; key: string };

/** A package Maya can teach: with its answer, operation and easier example. */
const isOperation = (pkg: QuestionPackage): pkg is OperationPackage => pkg.answer !== null && pkg.operation !== null && pkg.easierExample !== null;
const num = (value: number): AnswerValue => ({ type: "number", value });
const frac = (numerator: number, denominator: number): AnswerValue => ({ type: "fraction", numerator, denominator });

/** The 12 lines, in the order of the answer sheet. Each one is checked against Maya's code by `sentenceProblems`. */
const LINES: { id: string; written: string; origin: Origin; math: boolean; timingCheck?: boolean }[] = [
  { id: "s01", written: "Hello! I'm Maya. I'm an AI, here to help you.", origin: { pkg: "add-27-39", key: "open.hello" }, math: false },
  { id: "s02", written: "Hmm, let me think.", origin: { bank: "ack", key: "ack.think.hmm" }, math: false },
  { id: "s03", written: "Let's try an easier one first: 18 + 5.", origin: { pkg: "add-27-39", key: "example.intro" }, math: true },
  { id: "s04", written: "7 + 9 = 16. 16 is 1 ten and 6 ones. Write 6 in the ones. Carry 1 ten to the tens.", origin: { pkg: "add-27-39", key: "regroup.add" }, math: true, timingCheck: true },
  { id: "s05", written: "Was it 13 or 30?", origin: { pkg: "add-27-39", heard: [num(13), num(30)], key: "confirm.which" }, math: true },
  { id: "s06", written: "Did you say 14 or 40?", origin: { pkg: "add-27-39", heard: [num(14), num(40)], key: "confirm.which" }, math: true },
  { id: "s07", written: "What is 13 − 6?", origin: { pkg: "subtract-83-46", key: "operation.subtract" }, math: true },
  { id: "s08", written: "Yes! 27 + 39 = 66.", origin: { pkg: "add-27-39", key: "answer.right" }, math: true },
  { id: "s09", written: "Make both denominators 8. Multiply the top and the bottom of 3/4 by 2.", origin: { pkg: "add-fractions-3-4-1-8", key: "operation.common" }, math: true },
  { id: "s10", written: "Multiply the numerator and the denominator of 3/4 by 2. 3/4 = 6/8.", origin: { pkg: "add-fractions-3-4-1-8", key: "step.show" }, math: true },
  { id: "s11", written: "14/16 is the right amount. The question asks for simplest form. Can you simplify it?", origin: { pkg: "add-fractions-3-4-1-8", heard: [frac(14, 16)], key: "check.equal" }, math: true },
  { id: "s12", written: "Thanks for working with me today.", origin: { bank: "phrases", key: "closing" }, math: false },
];

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const ORDINAL_ONES: Record<number, string> = { 1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth", 6: "sixth", 7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth", 11: "eleventh", 12: "twelfth" };

/** A whole number below 1000 in words, with a hyphen in the tens ("twenty-seven", "one hundred five"). */
function numberWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999) throw new Error(`no words for ${n}`);
  if (n < 20) return ONES[n];
  if (n < 100) return n % 10 ? `${TENS[Math.floor(n / 10)]}-${ONES[n % 10]}` : TENS[n / 10];
  const rest = n % 100;
  return `${ONES[Math.floor(n / 100)]} hundred${rest ? ` ${numberWords(rest)}` : ""}`;
}

/** A denominator as a fraction word: 2 half, 4 quarter, 8 eighth, 16 sixteenth; plural when the numerator is not 1. */
function denominatorWord(d: number, plural: boolean): string {
  if (d === 2) return plural ? "halves" : "half";
  if (d === 4) return plural ? "quarters" : "quarter";
  let word: string;
  if (ORDINAL_ONES[d]) word = ORDINAL_ONES[d];
  else if (d < 20) word = `${ONES[d]}th`;
  else if (d < 100 && d % 10 === 0) word = `${TENS[d / 10].replace(/y$/, "ie")}th`;
  else throw new Error(`no denominator word for ${d}`);
  return plural ? `${word}s` : word;
}

/**
 * A math line with its numbers, fractions and signs in words, as the council's test design asks (numbers as words, digits
 * stay on the board): "3/4 = 6/8" is "three quarters equals six eighths". The first letter of a sentence is upper case.
 * Only the forms Maya's lines in LINES use are known; any other is an error, so the kit never guesses.
 */
/** A fraction in words: 3/4 is "three quarters", 1/2 "one half". */
const fractionWords = (n: number, d: number) => `${numberWords(n)} ${denominatorWord(d, n !== 1)}`;

export function spokenMath(text: string): string {
  if (/\d[.,]\d|\d\s+\d+\/\d/.test(text)) throw new Error(`a math form the kit cannot say in words: ${text}`);
  let t = text.replace(/(\d+)\/(\d+)/g, (_, n: string, d: string) => fractionWords(Number(n), Number(d)));
  t = t.replace(/\s\+\s/g, " plus ").replace(/\s[−-]\s/g, " minus ").replace(/\s×\s/g, " times ").replace(/\s÷\s/g, " divided by ").replace(/\s=\s/g, " equals ");
  t = t.replace(/\d+/g, d => numberWords(Number(d)));
  if (/[\d+−×÷=/]/.test(t)) throw new Error(`a math form the kit cannot say in words: ${text}`);
  return t.replace(/(^|[.?!]\s+)([a-z])/g, (_, before: string, c: string) => before + c.toUpperCase());
}

export const SENTENCES: readonly Sentence[] = LINES.map(l => ({
  id: l.id,
  source: "bank" in l.origin ? `${l.origin.bank === "ack" ? "ACK_PHRASES" : "PHRASES"} ${l.origin.key}` : `${l.origin.key} on ${l.origin.pkg}`,
  written: l.written,
  spoken: spokenMath(l.written),
  math: l.math,
  ...(l.timingCheck ? { timingCheck: true } : {}),
}));

/**
 * Why the spoken form does not say the written line, or null: each fraction's words must be what Maya's own fraction
 * reader reads back as that fraction (writtenFractions, on the words alone, since it declines "three quarters by two" as
 * an operation in a child's answer), and with the fractions in those words, both forms must have the same speechKey
 * (numbers in words, signs as words, case and punctuation aside).
 */
function spokenProblem(written: string, spoken: string): string | null {
  for (const [, n, d] of written.matchAll(/(\d+)\/(\d+)/g)) {
    const words = fractionWords(Number(n), Number(d));
    if (writtenFractions(words, { fractions: true }) !== `${n}/${d}`) return `Maya's reader does not read "${words}" as ${n}/${d}`;
  }
  const withWords = written.replace(/(\d+)\/(\d+)/g, (_, n: string, d: string) => fractionWords(Number(n), Number(d)));
  return speechKey(withWords) === speechKey(spoken) ? null : `"${spoken}" says other words than "${written}"`;
}

/**
 * Why the kit's sentences are not Maya's real lines, or [] when they are: each written form is one of Maya's own
 * code-written texts (allLineTexts of its sample question, ACK_PHRASES or PHRASES), and each spoken form says exactly the
 * same words by Maya's own normalisation (speechKey, and writtenFractions for fraction words).
 */
export function sentenceProblems(): string[] {
  const problems: string[] = [];
  for (const l of LINES) {
    const s = SENTENCES.find(x => x.id === l.id)!;
    let found: boolean;
    if ("bank" in l.origin) {
      const key = l.origin.key;
      found = l.origin.bank === "ack" ? ACK_PHRASES.some(a => a.id === key && a.text === l.written) : (PHRASES[key as keyof typeof PHRASES] ?? []).includes(l.written);
    } else {
      const pkg = SAMPLE_PACKAGES[l.origin.pkg];
      found = isOperation(pkg) && allLineTexts(pkg, l.origin.heard ?? []).includes(l.written);
    }
    if (!found) problems.push(`${l.id} is not one of Maya's lines (${s.source}): ${l.written}`);
    const spoken = spokenProblem(s.written, s.spoken);
    if (spoken) problems.push(`${l.id}: ${spoken}`);
  }
  if (SENTENCES.length !== 12) problems.push(`the kit has ${SENTENCES.length} sentences, not 12`);
  return problems;
}

// ---------- the candidates ----------

export const CANDIDATES = [
  { id: "inworld", name: "Inworld TTS-2", model: "inworld/inworld-tts-2", route: "LiveKit Inference", voicesEnv: "LISTEN_INWORLD_VOICES", keys: ["LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"] },
  { id: "cartesia", name: "Cartesia Sonic 3.6", model: "cartesia/sonic-3.6", route: "LiveKit Inference", voicesEnv: "LISTEN_CARTESIA_VOICES", keys: ["LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"] },
  { id: "elevenlabs", name: "ElevenLabs v4 Turbo", model: "eleven_v4_turbo", route: "direct (ElevenLabs plugin; not on LiveKit Inference)", voicesEnv: "LISTEN_ELEVENLABS_VOICES", keys: ["ELEVEN_API_KEY"] },
] as const;
export type CandidateId = (typeof CANDIDATES)[number]["id"];

/** One voice under test: a candidate and one of its two voice ids. `key` is what the hidden key and the report name. */
export interface VoiceUnderTest {
  candidate: CandidateId;
  voice: string;
  key: string;
}

export type KitConfig = { ok: true; fake: boolean; voices: VoiceUnderTest[]; env: Readonly<Record<string, string>> } | { ok: false; problems: string[] };

const VOICE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;

/**
 * The voices to render. Fake: each candidate with two fake voices, no key. Real: each chosen candidate needs its keys and
 * exactly two voice ids (a comma list in its LISTEN_*_VOICES variable); a missing one refuses the whole run, so a test
 * never runs with a candidate quietly missing.
 */
export function kitConfig(env: Readonly<Record<string, string | undefined>>, options: { fake: boolean; candidates?: readonly string[] }): KitConfig {
  const chosen = options.candidates?.length ? options.candidates : CANDIDATES.map(c => c.id);
  const problems: string[] = [];
  const unknown = chosen.filter(id => !CANDIDATES.some(c => c.id === id));
  if (unknown.length) problems.push(`unknown candidates: ${unknown.join(", ")} (known: ${CANDIDATES.map(c => c.id).join(", ")})`);
  const voices: VoiceUnderTest[] = [];
  const used: Record<string, string> = {};
  for (const c of CANDIDATES.filter(x => chosen.includes(x.id))) {
    if (options.fake) {
      for (const v of ["fake-1", "fake-2"]) voices.push({ candidate: c.id, voice: v, key: `${c.id}/${v}` });
      continue;
    }
    for (const k of c.keys) {
      const v = env[k]?.trim();
      if (!v) problems.push(`${c.name} needs ${k}`);
      else used[k] = v;
    }
    const ids = (env[c.voicesEnv] ?? "").split(",").map(s => s.trim()).filter(Boolean);
    if (ids.length !== 2) problems.push(`${c.name} needs two voice ids in ${c.voicesEnv} (a comma list), not ${ids.length}`);
    else if (ids.some(id => !VOICE_ID.test(id))) problems.push(`${c.voicesEnv} has a voice id that is not letters, digits, '.', '_' or '-'`);
    else if (ids[0] === ids[1]) problems.push(`${c.voicesEnv} names the same voice twice`);
    else for (const v of ids) voices.push({ candidate: c.id, voice: v, key: `${c.id}/${v}` });
  }
  if (problems.length) return { ok: false, problems };
  return { ok: true, fake: options.fake, voices, env: used };
}

/** The TTS of one voice, through the same LiveKit Agents classes the worker uses. Real plugins load only when chosen. */
export async function makeVoice(v: VoiceUnderTest, config: Extract<KitConfig, { ok: true }>): Promise<tts.TTS> {
  if (config.fake) return new FakeTTS(60, true);
  const env = config.env;
  if (v.candidate === "elevenlabs") {
    const elevenlabs = await import("@livekit/agents-plugin-elevenlabs");
    // eleven_v4_turbo goes through ElevenLabs' text-to-dialogue stream in plugin 1.9.5; sync alignment asks for timings.
    return new elevenlabs.TTS({ apiKey: env.ELEVEN_API_KEY, voiceId: v.voice, model: "eleven_v4_turbo", syncAlignment: true, language: "en" });
  }
  const { inference } = await import("@livekit/agents");
  const c = CANDIDATES.find(x => x.id === v.candidate)!;
  // The same options the worker uses (INFERENCE_TTS_MODELS in src/lib/maya-voice.ts).
  const modelOptions = v.candidate === "cartesia" ? { add_timestamps: true } : { timestamp_type: "WORD" as const };
  return new inference.TTS({ model: c.model, voice: v.voice, language: "en", apiKey: env.LIVEKIT_API_KEY, apiSecret: env.LIVEKIT_API_SECRET, modelOptions });
}

// ---------- rendering ----------

export interface Timed {
  text: string;
  startTime?: number;
  endTime?: number;
}

export interface Rendered {
  /** 16-bit mono PCM. */
  samples: Int16Array;
  sampleRate: number;
  /** Words with times the voice returned, in order. */
  timed: Timed[];
  /** From the text being sent to the first audio frame. */
  firstAudioMs: number | null;
  error: string | null;
}

/** One text through a voice's stream, as the worker's pipeline gets it: frames and the timed words on them. */
export async function render(voice: tts.TTS, text: string, options: { timeoutMs?: number; now?: () => number } = {}): Promise<Rendered> {
  const now = options.now ?? (() => performance.now());
  const stream = voice.stream();
  const chunks: Int16Array[] = [];
  const timed: Timed[] = [];
  let sampleRate = voice.sampleRate;
  let firstAudioMs: number | null = null;
  let error: string | null = null;
  const started = now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const read = (async () => {
    stream.pushText(text);
    stream.flush();
    stream.endInput();
    for await (const ev of stream) {
      if (ev === tts.SynthesizeStream.END_OF_STREAM) break;
      if (firstAudioMs === null) firstAudioMs = Math.round(now() - started);
      sampleRate = ev.frame.sampleRate;
      chunks.push(new Int16Array(ev.frame.data));
      for (const t of ev.timedTranscripts ?? []) timed.push({ text: t.text, startTime: t.startTime, endTime: t.endTime });
    }
  })();
  try {
    await Promise.race([read, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timed out")), options.timeoutMs ?? 30_000); })]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    clearTimeout(timer);
    stream.close();
  }
  const samples = new Int16Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { samples.set(c, at); at += c.length; }
  return { samples, sampleRate, timed, firstAudioMs, error };
}

/** A WAV file of 16-bit mono PCM. */
export function wav(samples: Int16Array, sampleRate: number): Buffer {
  const data = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + data.length, 4); head.write("WAVE", 8);
  head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(sampleRate, 24); head.writeUInt32LE(sampleRate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write("data", 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

/**
 * How many of a sentence's words the worker's board alignment matches from the timed words, with the rule of
 * speech-audio.ts: the expected words are the sentence's own words, and a word counts once the timed words so far, by
 * Maya's speechKey, start with the sentence's words up to it. All of them: the board follows every word. Fewer: the
 * rest of the sentence's batches wait for its audio end.
 */
export function wordCoverage(sentence: string, timed: readonly Timed[]): { matched: number; expected: number } {
  const expected = speechWords(sentence);
  const prefixes = expected.map((_, i) => speechKey(expected.slice(0, i + 1).join(" ")));
  const ordered = timed.filter(t => t.endTime !== undefined && Number.isFinite(t.endTime) && t.endTime > 0)
    .sort((a, b) => (a.startTime ?? a.endTime!) - (b.startTime ?? b.endTime!) || a.endTime! - b.endTime!);
  let aligned = "";
  let matched = 0;
  for (const t of ordered) {
    aligned += ` ${t.text.trim()}`;
    const heard = speechKey(aligned);
    for (let n = matched + 1; n <= expected.length; n++) if (prefixes[n - 1] && (heard === prefixes[n - 1] || heard.startsWith(`${prefixes[n - 1]} `))) matched = n;
  }
  return { matched, expected: expected.length };
}

export interface RenderedLine {
  samples: Int16Array;
  sampleRate: number;
  /** Words with times from the start of the line. */
  timed: Timed[];
  timedWords: number;
  matched: number;
  expected: number;
  firstAudioMs: number | null;
  error: string | null;
}

/**
 * A line as the worker speaks it: one synthesis per sentence (speechSentences), the audio joined, each sentence's word
 * times moved by the audio before it, and the board coverage counted per sentence.
 */
export async function renderLine(voice: tts.TTS, text: string, options: { timeoutMs?: number; now?: () => number } = {}): Promise<RenderedLine> {
  const parts: Int16Array[] = [];
  const timed: Timed[] = [];
  let sampleRate = voice.sampleRate;
  let offset = 0;
  let matched = 0;
  let expected = 0;
  let firstAudioMs: number | null = null;
  let error: string | null = null;
  for (const sentence of speechSentences(text)) {
    const r = await render(voice, sentence, options);
    if (firstAudioMs === null) firstAudioMs = r.firstAudioMs;
    if (r.samples.length && r.sampleRate !== sampleRate && parts.length) { error = "the voice changed its sample rate within a line"; break; }
    sampleRate = r.sampleRate;
    const c = wordCoverage(sentence, r.timed);
    matched += c.matched;
    expected += c.expected;
    for (const t of r.timed) timed.push({ text: t.text, startTime: t.startTime === undefined ? undefined : t.startTime + offset, endTime: t.endTime === undefined ? undefined : t.endTime + offset });
    parts.push(r.samples);
    offset += r.samples.length / r.sampleRate;
    if (r.error) { error = r.error; break; }
  }
  const samples = new Int16Array(parts.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of parts) { samples.set(c, at); at += c.length; }
  return { samples, sampleRate, timed, timedWords: timed.length, matched, expected, firstAudioMs, error };
}

// ---------- the blind plan ----------

/** A seeded random number generator (mulberry32), so a plan can be rebuilt from its seed. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type Part = "voice" | "math";

/** One file a listener hears: the part, the sentence, its letter and its hidden voice. */
export interface PlanItem {
  part: Part;
  sentence: string;
  letter: string;
  file: string;
  voice: string;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * The blind plan: for each sentence a new random order of the voices, named by letter, so no letter or file name says
 * the vendor and no voice keeps a letter from one sentence to the next. Part "voice" plays the spoken form of all 12;
 * part "math" plays each math line as written (digits and signs).
 */
export function blindPlan(voices: readonly VoiceUnderTest[], seed: number): PlanItem[] {
  if (voices.length > LETTERS.length) throw new Error("too many voices for one letter each");
  const random = seeded(seed);
  const items: PlanItem[] = [];
  const add = (part: Part, s: Sentence) => shuffle(voices, random).forEach((v, i) => {
    const letter = LETTERS[i];
    items.push({ part, sentence: s.id, letter, voice: v.key, file: `${part === "voice" ? s.id : `m${s.id.slice(1)}`}-${letter}.wav` });
  });
  for (const s of SENTENCES) add("voice", s);
  for (const s of SENTENCES.filter(x => x.math)) add("math", s);
  return items;
}

/** The answer sheet: what each file should say, and where to write the choice. It names no vendor. */
export function answerSheet(plan: readonly PlanItem[]): string {
  const letters = (part: Part, id: string) => plan.filter(p => p.part === part && p.sentence === id).map(p => p.letter).join(", ");
  const lines = [
    "# Maya voice listening test",
    "",
    "Listen to each sentence's files in `audio/`. They are the same sentence in different voices. The letters are shuffled for every sentence, so a letter is not the same voice twice.",
    "",
    "Everything you need is in this folder. Please do not ask which voice is which until every listener is done.",
    "",
    "Record your choices with `npm run voice:listen -- record --dir <this folder> --listener <your name>`, or fill a copy of `answers-template.csv` and put it in `answers/<your name>.csv`. Answer every sentence of both parts once.",
    "",
    "## Part 1: which voice do you like best?",
    "",
    "For each sentence, pick your favourite letter. Also note any letter that says a word wrong.",
    "",
  ];
  for (const s of SENTENCES) lines.push(`- **${s.id}** (${letters("voice", s.id)}): "${s.spoken}"`);
  lines.push("", "## Part 2: does the voice read the math right?", "", "These files are Maya's math lines as the voice gets them today, with digits and signs. Each should sound like the words below. Note every letter that reads a number, sign or fraction wrong (for example \"thirty\" for 13, \"three slash four\" or \"three over four\" for 3/4). Part 2 has no favourite.", "");
  for (const s of SENTENCES.filter(x => x.math)) lines.push(`- **m${s.id.slice(1)}** (${letters("math", s.id)}): should sound like "${s.spoken}"`);
  return `${lines.join("\n")}\n`;
}

export const ANSWER_HEADER = "listener,part,sentence,favourite,misread";

/** The CSV a listener fills: one row per sentence of each part. */
export function answersTemplate(): string {
  const rows = [ANSWER_HEADER, ...SENTENCES.map(s => `,voice,${s.id},,`), ...SENTENCES.filter(s => s.math).map(s => `,math,${s.id},,`)];
  return `${rows.join("\n")}\n`;
}

// ---------- the listener folder ----------

/** The one sample rate of every file listeners get (the fake voice's and the worker's playback rate). */
export const LISTENER_RATE = 24_000;

/** A clip at the listener rate, resampled with LiveKit's own (Sox) resampler at its best quality. */
export function toListenerRate(samples: Int16Array, sampleRate: number): Int16Array {
  if (sampleRate === LISTENER_RATE) return samples.slice();
  if (!samples.length) return new Int16Array(0);
  const resampler = new AudioResampler(sampleRate, LISTENER_RATE, 1, AudioResamplerQuality.VERY_HIGH);
  try {
    const frames = [...resampler.push(new AudioFrame(samples, sampleRate, 1, samples.length)), ...resampler.flush()];
    const out = new Int16Array(frames.reduce((n, f) => n + f.data.length, 0));
    let at = 0;
    for (const f of frames) { out.set(f.data, at); at += f.data.length; }
    return out;
  } finally {
    resampler.close();
  }
}

/** One rendered file of the plan. */
export interface Clip {
  file: string;
  samples: Int16Array;
  sampleRate: number;
}

/**
 * The folder listeners get: audio/ (every plan file at LISTENER_RATE), answer-sheet.md, answers-template.csv,
 * letters.json (each sentence's letters, never their voices) and an empty answers/ for `record`. Files are written and
 * then touched in a shuffled order, and every file and folder gets the same access and change time, `time`. Times the
 * system sets itself (the inode change time, the inode number) can only show that shuffled order. Returns the write order.
 */
export function writeListenerFolder(dir: string, plan: readonly PlanItem[], clips: readonly Clip[], options: { random: () => number; time: Date }): string[] {
  const byFile = new Map(clips.map(c => [c.file, c]));
  const files = plan.map(p => p.file);
  if (byFile.size !== clips.length || files.length !== clips.length || files.some(f => !byFile.has(f))) throw new Error("the clips do not match the plan: one clip per plan file");
  mkdirSync(join(dir, "audio"), { recursive: true });
  mkdirSync(join(dir, "answers"), { recursive: true });
  const order = shuffle(files, options.random);
  for (const f of order) {
    const c = byFile.get(f)!;
    writeFileSync(join(dir, "audio", f), wav(toListenerRate(c.samples, c.sampleRate), LISTENER_RATE));
  }
  writeFileSync(join(dir, "answer-sheet.md"), answerSheet(plan));
  writeFileSync(join(dir, "answers-template.csv"), answersTemplate());
  const letters = [...new Map(plan.map(p => [`${p.part} ${p.sentence}`, { part: p.part, sentence: p.sentence, letters: plan.filter(q => q.part === p.part && q.sentence === p.sentence).map(q => q.letter).sort() }])).values()];
  writeFileSync(join(dir, "letters.json"), `${JSON.stringify(letters, null, 2)}\n`);
  // On macOS a time before a file's creation also moves its creation time, so this sets that too.
  for (const f of shuffle(order, options.random)) utimesSync(join(dir, "audio", f), options.time, options.time);
  for (const f of ["answer-sheet.md", "answers-template.csv", "letters.json", "audio", "answers", "."]) utimesSync(join(dir, f), options.time, options.time);
  return order;
}

// ---------- answers and the score ----------

export interface Answer {
  listener: string;
  part: Part;
  sentence: string;
  /** A letter, in part "voice" only. */
  favourite: string | null;
  /** Letters that said a word wrong. */
  misread: string[];
}

const letterList = (s: string) => s.toUpperCase().split(/[^A-Z]+/).filter(Boolean);

/** A listener's answers from their CSV; a row that names an unknown sentence, part or letter is an error. */
export function readAnswers(csv: string, plan: readonly PlanItem[], fallbackListener: string): { answers: Answer[]; problems: string[] } {
  const answers: Answer[] = [];
  const problems: string[] = [];
  const rows = csv.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
  for (const [i, row] of rows.entries()) {
    if (i === 0 && row.replace(/\s/g, "") === ANSWER_HEADER) continue;
    const [listener, part, sentence, favourite, misread] = row.split(",").map(c => c.trim());
    if (part !== "voice" && part !== "math") { problems.push(`row ${i + 1}: part must be voice or math`); continue; }
    const letters = plan.filter(p => p.part === part && p.sentence === sentence).map(p => p.letter);
    if (!letters.length) { problems.push(`row ${i + 1}: no sentence ${sentence} in part ${part}`); continue; }
    const fav = favourite ? favourite.toUpperCase() : null;
    if (fav && (part === "math" || !letters.includes(fav))) { problems.push(`row ${i + 1}: favourite ${favourite} is not a letter of ${sentence}`); continue; }
    const bad = letterList(misread ?? "").filter(l => !letters.includes(l));
    if (bad.length) { problems.push(`row ${i + 1}: misread letters ${bad.join(" ")} are not letters of ${sentence}`); continue; }
    answers.push({ listener: listener || fallbackListener, part, sentence, favourite: fav, misread: [...new Set(letterList(misread ?? ""))] });
  }
  return { answers, problems };
}

/** What the kit measured for one voice and one file. */
export interface Measure {
  voice: string;
  part: Part;
  sentence: string;
  timedWords: number;
  matched: number;
  expected: number;
  firstAudioMs: number | null;
  audioMs: number;
  error: string | null;
  /** The timed words the voice returned, for the operator report. */
  timedText: string;
}

export interface VoiceScore {
  voice: string;
  /** Sentences of part "voice" where this voice was the listener's favourite, per listener. */
  favourites: Record<string, number>;
  /** Listeners whose overall favourite (most sentence favourites, ties shared) this voice is. */
  firstChoiceOf: string[];
  /** Misreads marked on a math line, in either part. */
  mathMisreads: number;
  /** The timing check sentence: every word matched by the board's alignment. */
  wordTimingsOnCheck: boolean;
  /** Files with any timed word, of all this voice's files. */
  timedFiles: string;
  pass: boolean;
}

/** The test design's three listeners: Savar, one parent and one child. */
export const MIN_LISTENERS = 3;

/** Why the answers are not one complete set per listener, or [] (R598-2). */
export function answerSetProblems(plan: readonly PlanItem[], answers: readonly Answer[]): string[] {
  if (!answers.length) return ["no answers"];
  const needed = [...new Set(plan.map(p => `${p.part} ${p.sentence}`))];
  const problems: string[] = [];
  for (const listener of [...new Set(answers.map(a => a.listener))].sort()) {
    const mine = answers.filter(a => a.listener === listener);
    const count = new Map<string, number>();
    for (const a of mine) count.set(`${a.part} ${a.sentence}`, (count.get(`${a.part} ${a.sentence}`) ?? 0) + 1);
    const missing = needed.filter(k => !count.has(k));
    if (missing.length) problems.push(`${listener} is missing ${missing.length} answer${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`);
    for (const [k, n] of count) if (n > 1) problems.push(`${listener} answered ${k} ${n} times`);
    for (const a of mine) if (a.part === "voice" && !a.favourite) problems.push(`${listener} gave no favourite for ${a.sentence}`);
  }
  return problems;
}

/**
 * The score, against the pass bar of the test design: a voice passes when it is the first choice of at least two thirds
 * of the listeners (2 of 3), no listener marked a misread on any of its math lines, and its word timings covered every
 * word of the timing check sentence. Several voices can pass; the report lists them all. With fewer than MIN_LISTENERS
 * listeners no voice passes.
 *
 * It scores only complete answers (R598-2): every listener answers each sentence of both parts exactly once, with a
 * favourite for each sentence of part 1. A missing math row would otherwise count as no misread.
 */
export function score(plan: readonly PlanItem[], answers: readonly Answer[], measures: readonly Measure[]): { ok: true; voices: VoiceScore[]; listeners: string[] } | { ok: false; problems: string[] } {
  const problems = answerSetProblems(plan, answers);
  if (problems.length) return { ok: false, problems };
  const listeners = [...new Set(answers.map(a => a.listener))].sort();
  const voiceKeys = [...new Set(plan.map(p => p.voice))];
  const of = (part: Part, sentence: string, letter: string) => plan.find(p => p.part === part && p.sentence === sentence && p.letter === letter)?.voice;
  const favourites = new Map(voiceKeys.map(v => [v, Object.fromEntries(listeners.map(l => [l, 0])) as Record<string, number>]));
  const misreads = new Map(voiceKeys.map(v => [v, 0]));
  const math = new Set(SENTENCES.filter(s => s.math).map(s => s.id));
  for (const a of answers) {
    if (a.favourite) {
      const v = of(a.part, a.sentence, a.favourite);
      if (v) favourites.get(v)![a.listener] += 1;
    }
    if (math.has(a.sentence)) for (const l of a.misread) {
      const v = of(a.part, a.sentence, l);
      if (v) misreads.set(v, misreads.get(v)! + 1);
    }
  }
  const firstChoice = new Map(voiceKeys.map(v => [v, [] as string[]]));
  for (const l of listeners) {
    const best = Math.max(...voiceKeys.map(v => favourites.get(v)![l]));
    if (best > 0) for (const v of voiceKeys) if (favourites.get(v)![l] === best) firstChoice.get(v)!.push(l);
  }
  const check = SENTENCES.find(s => s.timingCheck)!.id;
  const needed = Math.ceil((listeners.length * 2) / 3);
  const voices = voiceKeys.map((v): VoiceScore => {
    const mine = measures.filter(m => m.voice === v);
    const c = mine.find(m => m.part === "voice" && m.sentence === check);
    const wordTimingsOnCheck = !!c && !c.error && c.expected > 0 && c.matched === c.expected;
    const firstChoiceOf = firstChoice.get(v)!;
    return {
      voice: v, favourites: favourites.get(v)!, firstChoiceOf, mathMisreads: misreads.get(v)!, wordTimingsOnCheck,
      timedFiles: `${mine.filter(m => m.timedWords > 0).length} of ${mine.length}`,
      pass: listeners.length >= MIN_LISTENERS && firstChoiceOf.length >= needed && misreads.get(v) === 0 && wordTimingsOnCheck,
    };
  });
  return { ok: true, voices, listeners };
}
