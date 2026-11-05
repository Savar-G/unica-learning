import { initializeLogger } from "@livekit/agents";
import { describe, expect, it } from "vitest";
import {
  answerSheet,
  answersTemplate,
  blindPlan,
  CANDIDATES,
  kitConfig,
  makeVoice,
  readAnswers,
  renderLine,
  score,
  SENTENCES,
  sentenceProblems,
  spokenMath,
  wav,
  wordCoverage,
  type Measure,
} from "./listening-test";
import { FakeTTS } from "./fake-providers";

// The listening-test kit (#533) through its public functions: the sentences are Maya's real lines, the plan hides the
// vendor, the fake voice runs with no key, a real voice without its key is refused, and choices score against the key.

initializeLogger({ pretty: false, level: "silent" });

const KEYS = {
  LIVEKIT_API_KEY: "lk", LIVEKIT_API_SECRET: "lks", ELEVEN_API_KEY: "el",
  LISTEN_INWORLD_VOICES: "Ashley,Dennis", LISTEN_CARTESIA_VOICES: "voice-a,voice-b", LISTEN_ELEVENLABS_VOICES: "el-1,el-2",
};

describe("the sentences", () => {
  it("are 12 of Maya's own code-written lines, each said in words with the same words by Maya's normalisation", () => {
    expect(sentenceProblems()).toEqual([]);
    expect(SENTENCES).toHaveLength(12);
  });

  it("hold the hard number pairs and the fraction lines, with numbers as words", () => {
    const spoken = SENTENCES.map(s => s.spoken).join(" ").toLowerCase();
    for (const w of ["thirteen", "thirty", "fourteen", "forty", "three quarters", "six eighths", "fourteen sixteenths", "twenty-seven plus thirty-nine equals sixty-six"]) expect(spoken).toContain(w);
    for (const s of SENTENCES) expect(s.spoken).not.toMatch(/[\d+−×÷=/]/);
    expect(SENTENCES.filter(s => s.math).length).toBeGreaterThanOrEqual(8);
    expect(SENTENCES.filter(s => s.timingCheck).map(s => s.id)).toEqual(["s04"]);
  });

  it("refuses a math form it cannot say in words, instead of guessing", () => {
    expect(spokenMath("What is 27 + 39?")).toBe("What is twenty-seven plus thirty-nine?");
    expect(spokenMath("1/2 and 3/4.")).toBe("One half and three quarters.");
    expect(() => spokenMath("It is 2.5.")).toThrow(/cannot say/);
    expect(() => spokenMath("1 3/8")).toThrow(/cannot say/);
    expect(() => spokenMath("1,000 is big.")).toThrow(/cannot say/);
  });
});

describe("the configuration", () => {
  it("runs the fake voice with no key: three candidates, two voices each", () => {
    const c = kitConfig({}, { fake: true });
    expect(c.ok).toBe(true);
    if (c.ok) expect(c.voices.map(v => v.key)).toEqual(["inworld/fake-1", "inworld/fake-2", "cartesia/fake-1", "cartesia/fake-2", "elevenlabs/fake-1", "elevenlabs/fake-2"]);
  });

  it("refuses a real voice without its key, and names each missing key", () => {
    const none = kitConfig({ LISTEN_INWORLD_VOICES: "Ashley,Dennis", LISTEN_CARTESIA_VOICES: "a,b", LISTEN_ELEVENLABS_VOICES: "c,d" }, { fake: false });
    expect(none).toEqual({ ok: false, problems: [
      "Inworld TTS-2 needs LIVEKIT_API_KEY", "Inworld TTS-2 needs LIVEKIT_API_SECRET",
      "Cartesia Sonic 3.6 needs LIVEKIT_API_KEY", "Cartesia Sonic 3.6 needs LIVEKIT_API_SECRET",
      "ElevenLabs v4 Turbo needs ELEVEN_API_KEY",
    ] });
    for (const missing of ["LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "ELEVEN_API_KEY"]) {
      const env: Record<string, string> = { ...KEYS };
      delete env[missing];
      const c = kitConfig(env, { fake: false });
      expect(c.ok).toBe(false);
      expect(!c.ok && c.problems.join("; ")).toContain(`needs ${missing}`);
    }
    // One candidate alone needs only its own keys.
    expect(kitConfig({ ELEVEN_API_KEY: "el", LISTEN_ELEVENLABS_VOICES: "a,b" }, { fake: false, candidates: ["elevenlabs"] })).toMatchObject({ ok: true });
    expect(kitConfig({ LISTEN_ELEVENLABS_VOICES: "a,b" }, { fake: false, candidates: ["elevenlabs"] })).toMatchObject({ ok: false });
  });

  it("refuses a real voice without exactly two distinct voice ids, and an unknown candidate", () => {
    expect(kitConfig({ ...KEYS, LISTEN_CARTESIA_VOICES: "only-one" }, { fake: false })).toMatchObject({ ok: false, problems: [expect.stringMatching(/two voice ids in LISTEN_CARTESIA_VOICES/)] });
    expect(kitConfig({ ...KEYS, LISTEN_CARTESIA_VOICES: "a,a" }, { fake: false })).toMatchObject({ ok: false, problems: [expect.stringMatching(/same voice twice/)] });
    expect(kitConfig({ ...KEYS, LISTEN_INWORLD_VOICES: "Ashley,bad:id" }, { fake: false })).toMatchObject({ ok: false });
    expect(kitConfig({}, { fake: true, candidates: ["openai"] })).toMatchObject({ ok: false, problems: [expect.stringMatching(/unknown candidates: openai/)] });
  });

  it("builds the real voices with the worker's classes and asks each for word timings, with no network", async () => {
    const c = kitConfig(KEYS, { fake: false });
    if (!c.ok) throw new Error(c.problems.join("; "));
    for (const v of c.voices) {
      const t = await makeVoice(v, c);
      expect(t.capabilities.alignedTranscript).toBe(true);
      expect(t.label).toMatch(v.candidate === "elevenlabs" ? /elevenlabs/i : /inference/i);
      await t.close();
    }
    expect(CANDIDATES.map(x => x.route)).toEqual(["LiveKit Inference", "LiveKit Inference", "direct (ElevenLabs plugin; not on LiveKit Inference)"]);
  });
});

describe("the blind plan", () => {
  const voices = (kitConfig({}, { fake: true }) as Extract<ReturnType<typeof kitConfig>, { ok: true }>).voices;

  it("gives every sentence every voice once, under letters and file names that say nothing of the vendor", () => {
    const plan = blindPlan(voices, 7);
    const math = SENTENCES.filter(s => s.math).length;
    expect(plan).toHaveLength((12 + math) * 6);
    for (const s of SENTENCES) {
      const items = plan.filter(p => p.part === "voice" && p.sentence === s.id);
      expect(items.map(p => p.letter)).toEqual(["A", "B", "C", "D", "E", "F"]);
      expect(new Set(items.map(p => p.voice)).size).toBe(6);
    }
    for (const p of plan) expect(p.file).toMatch(/^[sm]\d\d-[A-F]\.wav$/);
    const sheet = answerSheet(plan);
    for (const word of ["inworld", "cartesia", "eleven", "fake", "Inference"]) expect(sheet.toLowerCase()).not.toContain(word.toLowerCase());
    expect(sheet).toContain("Was it thirteen or thirty?");
  });

  it("shuffles anew for each sentence, and the same seed gives the same plan", () => {
    const plan = blindPlan(voices, 7);
    expect(blindPlan(voices, 7)).toEqual(plan);
    expect(blindPlan(voices, 8)).not.toEqual(plan);
    const orders = new Set(SENTENCES.map(s => plan.filter(p => p.part === "voice" && p.sentence === s.id).map(p => p.voice).join()));
    expect(orders.size).toBeGreaterThan(6);
  });
});

describe("rendering with the fake voice", () => {
  it("speaks each line sentence by sentence through the TTS stream, with word timings the board alignment matches", async () => {
    const voice = new FakeTTS(5, true);
    const s04 = SENTENCES.find(s => s.id === "s04")!;
    const r = await renderLine(voice, s04.spoken);
    expect(r.error).toBeNull();
    expect(r.samples.length).toBeGreaterThan(0);
    expect(r.matched).toBe(r.expected);
    expect(r.expected).toBe(s04.spoken.split(/\s+/).length);
    // The written form (digits and signs) matches too, by the worker's normalisation.
    const written = await renderLine(voice, s04.written);
    expect(written.matched).toBe(written.expected);
    // Word times run on across the sentences of the line.
    expect(r.timed.at(-1)!.endTime!).toBeGreaterThan(r.timed[0].endTime!);
    const file = wav(r.samples, r.sampleRate);
    expect(file.subarray(0, 4).toString()).toBe("RIFF");
    expect(file.readUInt32LE(24)).toBe(24_000);
    expect(file.length).toBe(44 + r.samples.length * 2);
  });

  it("reports no word timings for a voice that returns none: the board would use sentence ends", async () => {
    const r = await renderLine(new FakeTTS(5, false), "Was it thirteen or thirty?");
    expect(r).toMatchObject({ timedWords: 0, matched: 0, expected: 5, error: null });
    expect(wordCoverage("Was it thirteen or thirty?", [{ text: "Was ", startTime: 0, endTime: 0.2 }, { text: "it ", startTime: 0.2, endTime: 0.3 }, { text: "thirty", startTime: 0.3, endTime: 0.6 }])).toEqual({ matched: 2, expected: 5 });
  });
});

describe("answers and the score", () => {
  const voices = (kitConfig({}, { fake: true }) as Extract<ReturnType<typeof kitConfig>, { ok: true }>).voices;
  const plan = blindPlan(voices, 3);
  const letterOf = (part: "voice" | "math", sentence: string, voice: string) => plan.find(p => p.part === part && p.sentence === sentence && p.voice === voice)!.letter;
  const csvFor = (listener: string, favourite: string, misread: Record<string, string> = {}) => [
    "listener,part,sentence,favourite,misread",
    ...SENTENCES.map(s => `${listener},voice,${s.id},${letterOf("voice", s.id, favourite)},`),
    ...SENTENCES.filter(s => s.math).map(s => `${listener},math,${s.id},,${misread[s.id] ? letterOf("math", s.id, misread[s.id]) : ""}`),
  ].join("\n");
  const measures = (matchedOnCheck: boolean): Measure[] => plan.map(p => ({
    voice: p.voice, part: p.part, sentence: p.sentence, timedWords: 5, matched: p.sentence === "s04" && !matchedOnCheck && p.voice === "cartesia/fake-1" ? 3 : 10, expected: 10,
    firstAudioMs: 100, audioMs: 1000, error: null, timedText: "",
  }));

  const read = (csv: string) => {
    const r = readAnswers(csv, plan, "x");
    expect(r.problems).toEqual([]);
    return r.answers;
  };
  const scored = (answers: ReturnType<typeof read>, m: Measure[]) => {
    const r = score(plan, answers, m);
    if (!r.ok) throw new Error(r.problems.join("; "));
    return r;
  };

  it("passes a voice that two of three listeners chose, with no math misread and full word timings", () => {
    const result = scored([...read(csvFor("Savar", "cartesia/fake-1")), ...read(csvFor("Parent", "cartesia/fake-1")), ...read(csvFor("Child", "inworld/fake-2"))], measures(true));
    expect(result.listeners).toEqual(["Child", "Parent", "Savar"]);
    const cartesia = result.voices.find(v => v.voice === "cartesia/fake-1")!;
    expect(cartesia).toMatchObject({ firstChoiceOf: ["Parent", "Savar"], mathMisreads: 0, wordTimingsOnCheck: true, pass: true });
    expect(result.voices.find(v => v.voice === "inworld/fake-2")).toMatchObject({ firstChoiceOf: ["Child"], pass: false });
    expect(result.voices.filter(v => v.pass).map(v => v.voice)).toEqual(["cartesia/fake-1"]);
  });

  it("fails the favourite when a listener marked a math misread, or when its word timings miss the check sentence", () => {
    const child = read(csvFor("Child", "inworld/fake-2"));
    const misread = [...read(csvFor("Savar", "cartesia/fake-1", { s05: "cartesia/fake-1" })), ...read(csvFor("Parent", "cartesia/fake-1")), ...child];
    expect(scored(misread, measures(true)).voices.find(v => v.voice === "cartesia/fake-1")).toMatchObject({ firstChoiceOf: ["Parent", "Savar"], mathMisreads: 1, pass: false });
    const clean = [...read(csvFor("Savar", "cartesia/fake-1")), ...read(csvFor("Parent", "cartesia/fake-1")), ...child];
    expect(scored(clean, measures(false)).voices.find(v => v.voice === "cartesia/fake-1")).toMatchObject({ firstChoiceOf: ["Parent", "Savar"], wordTimingsOnCheck: false, pass: false });
  });

  it("refuses to score unless every listener gave one complete answer set, each row once (R598-2)", () => {
    // Three listeners with one s01 row each scored and passed a voice before.
    const one = (l: string) => read(`listener,part,sentence,favourite,misread\n${l},voice,s01,${letterOf("voice", "s01", "cartesia/fake-1")},`);
    const partial = score(plan, [...one("Savar"), ...one("Parent"), ...one("Child")], measures(true));
    expect(partial.ok).toBe(false);
    expect(!partial.ok && partial.problems.join("; ")).toMatch(/Savar is missing 20 answers: voice s02.*math s03/);
    // A math row left out, a row given twice, a voice row with no favourite.
    const full = csvFor("Savar", "cartesia/fake-1").split("\n");
    const others = [...read(csvFor("Parent", "cartesia/fake-1")), ...read(csvFor("Child", "inworld/fake-2"))];
    const withoutMath = score(plan, [...read(full.filter(r => !r.includes(",math,s11,")).join("\n")), ...others], measures(true));
    expect(withoutMath).toEqual({ ok: false, problems: ["Savar is missing 1 answer: math s11"] });
    const twice = score(plan, [...read([...full, full[1]].join("\n")), ...others], measures(true));
    expect(twice).toEqual({ ok: false, problems: ["Savar answered voice s01 2 times"] });
    const noFavourite = score(plan, [...read(full.map(r => (r.includes(",voice,s07,") ? "Savar,voice,s07,," : r)).join("\n")), ...others], measures(true));
    expect(noFavourite).toEqual({ ok: false, problems: ["Savar gave no favourite for s07"] });
    expect(score(plan, [], measures(true))).toEqual({ ok: false, problems: ["no answers"] });
  });

  it("gives no pass with fewer than three listeners, whatever they chose", () => {
    const two = scored([...read(csvFor("Savar", "cartesia/fake-1")), ...read(csvFor("Parent", "cartesia/fake-1"))], measures(true));
    expect(two.voices.find(v => v.voice === "cartesia/fake-1")).toMatchObject({ firstChoiceOf: ["Parent", "Savar"], pass: false });
  });

  it("refuses an answer row with a letter, sentence or part that is not in the plan", () => {
    const r = readAnswers("listener,part,sentence,favourite,misread\nS,voice,s01,Z,\nS,voice,s99,A,\nS,math,s01,,A\nS,math,s05,A,\nS,tone,s01,A,\nS,voice,s02,b,c d", plan, "x");
    expect(r.problems).toHaveLength(5);
    expect(r.answers).toEqual([{ listener: "S", part: "voice", sentence: "s02", favourite: "B", misread: ["C", "D"] }]);
    expect(answersTemplate().split("\n")[0]).toBe("listener,part,sentence,favourite,misread");
  });
});
