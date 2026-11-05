import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { blindPlan, CANDIDATES, kitConfig, LISTENER_RATE, seeded, SENTENCES, toListenerRate, writeListenerFolder, type Clip, type PlanItem } from "./listening-test";

// R598-1: the listener folder says nothing about which vendor made a file. No key, no measures, one sample rate, one
// timestamp for every file, and a write order that does not follow the voices. Before this, the clips were written voice
// by voice in the kit's folder, so sorting by time recovered 126 of 126 voices, and each vendor's sample rate showed.

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const voices = (kitConfig({}, { fake: true }) as Extract<ReturnType<typeof kitConfig>, { ok: true }>).voices;

/** The attack in the review: sort by a file time, cut into one block per voice, and guess each block's voice. */
function recovered(files: { file: string; key: number }[], plan: readonly PlanItem[]): number {
  const ordered = [...files].sort((a, b) => a.key - b.key || a.file.localeCompare(b.file));
  const voiceOf = new Map(plan.map(p => [p.file, p.voice]));
  const block = ordered.length / voices.length;
  let hits = 0;
  for (let i = 0; i < voices.length; i++) {
    const inBlock = ordered.slice(i * block, (i + 1) * block).map(f => voiceOf.get(f.file)!);
    const counts = new Map<string, number>();
    for (const v of inBlock) counts.set(v, (counts.get(v) ?? 0) + 1);
    hits += Math.max(...counts.values());
  }
  return hits;
}

/** Text in the listener folder must not name a vendor, a model or a voice key. */
const NAMES = [...CANDIDATES.flatMap(c => [c.id, c.name, c.model, c.route]), "fake-1", "fake-2", "inference", "elevenlabs", "cartesia", "inworld"];

function checkListenerFolder(dir: string, plan: readonly PlanItem[]) {
  expect(readdirSync(dir).sort()).toEqual(["answer-sheet.md", "answers", "answers-template.csv", "audio", "letters.json"]);
  const audio = readdirSync(join(dir, "audio")).sort();
  expect(audio).toEqual(plan.map(p => p.file).sort());
  for (const f of ["answer-sheet.md", "answers-template.csv", "letters.json"]) {
    const text = readFileSync(join(dir, f), "utf8").toLowerCase();
    for (const n of NAMES) expect(text, `${f} names ${n}`).not.toContain(n.toLowerCase());
  }
  const stats = audio.map(f => ({ file: f, s: statSync(join(dir, "audio", f)), wav: readFileSync(join(dir, "audio", f)) }));
  for (const { wav } of stats) {
    expect(wav.readUInt32LE(24)).toBe(LISTENER_RATE);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt16LE(34)).toBe(16);
  }
  expect(new Set(stats.map(x => x.s.mtimeMs)).size).toBe(1);
  expect(new Set(stats.map(x => x.s.atimeMs)).size).toBe(1);
  if (process.platform === "darwin") expect(new Set(stats.map(x => x.s.birthtimeMs)).size).toBe(1);
  // Times the files cannot set (the inode change time, the inode number) follow the write order, which is shuffled.
  const chance = plan.length / 2;
  for (const key of ["mtimeMs", "birthtimeMs", "ctimeMs", "ino"] as const) {
    expect(recovered(stats.map(x => ({ file: x.file, key: Number(x.s[key]) })), plan), key).toBeLessThan(chance);
  }
}

describe("the listener folder", () => {
  it("resamples every clip to one rate: Inworld and Cartesia at 16,000 Hz and ElevenLabs at 22,050 Hz all become 24,000 Hz", () => {
    const tone = (rate: number) => Int16Array.from({ length: rate }, (_, i) => Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / rate)));
    for (const rate of [16_000, 22_050, 24_000, 44_100]) {
      const out = toListenerRate(tone(rate), rate);
      expect(Math.abs(out.length - LISTENER_RATE)).toBeLessThan(LISTENER_RATE * 0.01);
      // The tone survives: about 440 upward zero crossings in one second.
      let crossings = 0;
      for (let i = 1; i < out.length; i++) if (out[i - 1] < 0 && out[i] >= 0) crossings++;
      expect(Math.abs(crossings - 440)).toBeLessThan(5);
    }
  });

  it("holds the sheet and one file per plan item, no key or measures, and hides the order the voices were rendered in", () => {
    const plan = blindPlan(voices, 11);
    const rates: Record<string, number> = { inworld: 16_000, cartesia: 16_000, elevenlabs: 22_050 };
    // Clips in the order a run renders them: voice by voice, each at its vendor's rate.
    const clips: Clip[] = plan.map(p => ({ file: p.file, sampleRate: rates[p.voice.split("/")[0]], samples: new Int16Array(rates[p.voice.split("/")[0]] / 10) }));
    const dir = mkdtempSync(join(tmpdir(), "maya-listener-"));
    writeListenerFolder(dir, plan, clips, { random: seeded(5), time: new Date("2026-01-01T00:00:00Z") });
    checkListenerFolder(dir, plan);
    const letters = JSON.parse(readFileSync(join(dir, "letters.json"), "utf8")) as { part: string; sentence: string; letters: string[] }[];
    expect(letters).toHaveLength(12 + SENTENCES.filter(s => s.math).length);
    expect(letters.every(l => l.letters.join("") === "ABCDEF")).toBe(true);
  });

  it("refuses clips that do not match the plan", () => {
    const plan = blindPlan(voices, 11);
    const clips: Clip[] = plan.slice(1).map(p => ({ file: p.file, sampleRate: 24_000, samples: new Int16Array(10) }));
    expect(() => writeListenerFolder(mkdtempSync(join(tmpdir(), "maya-listener-")), plan, clips, { random: seeded(1), time: new Date() })).toThrow(/clips/);
  });

  it("is what `make` gives listeners, apart from the operator folder that holds the key and measures (CLI, fake voice)", () => {
    const out = join(mkdtempSync(join(tmpdir(), "maya-listening-")), "run");
    execFileSync(process.execPath, [join(root, "scripts/voice-listening-test.mjs"), "make", "--dir", out, "--fake", "--seed", "42"], { cwd: root, stdio: "pipe" });
    expect(readdirSync(out).sort()).toEqual(["listener", "operator"]);
    expect(readdirSync(join(out, "operator")).sort()).toEqual(["key-do-not-open.json", "measures.json", "operator-report.md"]);
    const key = JSON.parse(readFileSync(join(out, "operator", "key-do-not-open.json"), "utf8")) as { plan: PlanItem[] };
    checkListenerFolder(join(out, "listener"), key.plan);
  }, 120_000);
});
