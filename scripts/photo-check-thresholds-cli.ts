// The threshold run of the photo check (#855, spec #850 slice C). Asks the photo check's questions about the fixed 40
// synthetic photos (10 blurry, 30 clear) and prints each photo's P(yes) and the threshold rule's result. Run through
// scripts/photo-check-thresholds.mjs; docs/photo-check-thresholds.md. Reads the set folder and never writes into it.
// Writes the raw answers under .workbook-sample/photo-check/ (gitignored). The key comes only from
// DECISIONS_OPENROUTER_API_KEY in the process environment; this script never prints it.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { DecisionError, decisionClient } from "../src/lib/decision-client";
import { PHOTO_CHECK_CONTEXT, PHOTO_CHECK_QUESTIONS, chooseThreshold, photoCheckImage, type PhotoProblem, type ThresholdRow } from "../src/lib/scan-photo-check";

const { values: v } = parseArgs({ options: {
  set: { type: "string" }, model: { type: "string" }, runs: { type: "string", default: "1" }, "max-usd": { type: "string", default: "0.5" },
  question: { type: "string", default: "blurry" }, out: { type: "string", default: ".workbook-sample/photo-check" },
} });
if (!v.set) throw new Error("--set DIR is required");
const question = v.question as PhotoProblem;
if (!PHOTO_CHECK_QUESTIONS[question]) throw new Error(`unknown question ${question}`);
const maxUsd = Number(v["max-usd"]), runs = Number(v.runs);
const client = decisionClient(process.env, v.model, { timeout: 20_000, maxRetries: 0 });
if (!client) throw new Error("DECISIONS_OPENROUTER_API_KEY is not set");
const manifest = JSON.parse(await readFile(resolve(v.set, "manifest.json"), "utf8")) as { photos: { id: string; clear: boolean; image: { path: string } }[] };
let spent = 0, unpriced = 0;
const rows: (ThresholdRow & { run: number; ms: number; error: string | null })[] = [];
for (let run = 1; run <= runs; run++) {
  for (const photo of manifest.photos) {
    if (spent > maxUsd) throw new Error(`spent USD ${spent} is above --max-usd ${maxUsd}: stopped`);
    const image = await photoCheckImage(new Uint8Array(await readFile(resolve(v.set, photo.image.path))));
    const started = Date.now();
    try {
      const out = await client.decide({ input: [{ type: "text", text: PHOTO_CHECK_CONTEXT }, { type: "image", mediaType: "image/jpeg", data: image }], questions: { [question]: PHOTO_CHECK_QUESTIONS[question] }, signal: AbortSignal.timeout(30_000) });
      if (out.usd !== null) spent += out.usd;
      unpriced += out.unpricedAttempts;
      const a = out.answers[question];
      rows.push({ run, photo: photo.id, problem: !photo.clear, yes: a.type === "noul" ? a.yes : null, ms: Date.now() - started, error: null });
    } catch (e) {
      if (e instanceof DecisionError) { if (e.usd !== null) spent += e.usd; unpriced += e.unpricedAttempts; }
      rows.push({ run, photo: photo.id, problem: !photo.clear, yes: null, ms: Date.now() - started, error: e instanceof DecisionError ? `${e.kind}: ${e.message}` : String(e) });
    }
  }
}
const perRun = Array.from({ length: runs }, (_, n) => ({ run: n + 1, ...chooseThreshold(rows.filter((r) => r.run === n + 1)) }));
// Over all runs together: a threshold that holds for every run.
const all = chooseThreshold(rows);
const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
const summary = { model: client.model, question, runs, perRun, all, spentUsd: Math.round(spent * 1e6) / 1e6, unpricedAttempts: unpriced,
  p50Ms: ms[Math.floor(ms.length / 2)], p95Ms: ms[Math.floor(ms.length * 0.95)], over3s: rows.filter((r) => r.ms > 3000).length };
await mkdir(v.out!, { recursive: true });
await writeFile(resolve(v.out!, `${question}-${client.model.replace("/", "_")}.json`), JSON.stringify({ summary, rows }, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
console.log(rows.map((r) => `${r.run}\t${r.problem ? "blurry" : "clear "}\t${r.yes === null ? "error" : r.yes.toFixed(4)}\t${r.ms}ms\t${r.photo}${r.error ? `\t${r.error}` : ""}`).join("\n"));
