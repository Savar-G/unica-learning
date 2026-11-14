// The second look's safety gate (decision 2026-11-13, docs/scan-marking-escalation.md). Made-up Robin data only.
//
// (a) robin16: the items Sonnet left unsure in the paid iPhone run, asked again (second-look prompt).
// (b) fixed40: the items Sonnet left unsure in the v9 synthetic run, asked again.
// (c) stress: every AI-marked item of the accepted real photos that run (a) did not mark, asked with the second-look
//     prompt, to measure false certainty on answers a first read never saw.
// Scored against the human truth: a definite mark that differs from the truth is a wrong mark; a "right" on a wrong,
// blank or unreadable answer is a wrong answer marked right; a definite mark on an answer the truth calls unreadable is
// a wrong mark. The gate: 0 marked right wrongly, wrong marks at most 1% of definite marks, in every part.
//
// node scripts/scan-marking-escalation-eval.mjs --robin16 DIR --robin-v2 DIR --fixed40 DIR --fixed40-run DIR --out FILE [--estimate] [--max-usd 2]
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { markingEscalationClient } from "@/lib/scan-marking-ai";
import { markingRequestFor, mergeSecondLook, readMarkingOutput, unsureItems, MARKING_ESCALATION_MODEL, type MarkingFrame } from "@/lib/scan-marking";
import type { Observation } from "@/lib/scan-observation";

interface Truth { itemId: string; format: string; result: "right" | "wrong" | "blank" | "uncertain" | "parent" }
interface Photo { id: string; clear: boolean; image: { path: string }; frame: MarkingFrame; truth: Truth[] }
interface Case { part: "robin16" | "fixed40" | "stress"; photo: Photo; dir: string; first: Observation[] | null; asked: string[] }
type Tally = { asked: number; definite: number; unsure: number; wrongMarks: number; wrongAsRight: number; right: number; byTruth: Record<string, number> };

const PER_CALL_USD = 0.035;
const tally = (): Tally => ({ asked: 0, definite: 0, unsure: 0, wrongMarks: 0, wrongAsRight: 0, right: 0, byTruth: {} });

function score(t: Tally, truth: Truth[], obs: readonly Observation[], items: readonly string[], detail: unknown[], label: string) {
  for (const id of items) {
    const tr = truth.find((x) => x.itemId === id);
    if (!tr || tr.result === "parent") continue;
    const o = obs.find((x) => x.identity.itemId === id);
    t.asked++;
    const definite = o && o.state === "scored" && o.result !== null ? o.result : null;
    if (definite === null) { t.unsure++; continue; }
    t.definite++;
    t.byTruth[`${tr.result}->${definite}`] = (t.byTruth[`${tr.result}->${definite}`] ?? 0) + 1;
    if (definite === tr.result) { t.right++; continue; }
    t.wrongMarks++;
    if (definite === "right") t.wrongAsRight++;
    detail.push({ label, item: id, format: tr.format, truth: tr.result, mark: definite, read: o?.readAnswerText ?? null });
  }
}

async function load(set: string, dir: string, resultsOf: Map<string, Observation[]>, part: Case["part"], only?: (p: Photo) => boolean): Promise<Case[]> {
  const raw = JSON.parse(await readFile(set, "utf8"));
  const photos: Photo[] = Array.isArray(raw.photos) && raw.photos[0]?.photo ? raw.photos.filter((p: { status: string }) => p.status === "ready").map((p: { photo: Photo }) => p.photo) : raw.photos;
  return photos.filter((p) => !only || only(p)).map((photo) => {
    const first = resultsOf.get(photo.id) ?? null;
    const asked = part === "stress" ? photo.truth.filter((t) => t.result !== "parent").map((t) => t.itemId) : first ? unsureItems(first, photo.frame as unknown as Parameters<typeof unsureItems>[1]) : [];
    return { part, photo, dir, first, asked };
  }).filter((c) => c.asked.length);
}

export async function escalationEvalMain() {
  const { values: v } = parseArgs({ options: { robin16: { type: "string" }, "robin-v2": { type: "string" }, fixed40: { type: "string" }, "fixed40-run": { type: "string" }, out: { type: "string" }, estimate: { type: "boolean" }, "max-usd": { type: "string", default: "2" } } });
  if (!v.robin16 || !v["robin-v2"] || !v.fixed40 || !v["fixed40-run"] || !v.out) throw Error("usage: --robin16 DIR --robin-v2 DIR --fixed40 DIR --fixed40-run DIR --out FILE [--estimate] [--max-usd 2]");
  const max = Number(v["max-usd"]);
  if (!(max > 0 && max <= 2)) throw Error("--max-usd must be above 0 and at most 2");

  const robinResults = new Map<string, Observation[]>((JSON.parse(await readFile(resolve(v.robin16, "results.json"), "utf8")) as { photo: string; observations: Observation[] }[]).map((r) => [r.photo, r.observations]));
  const fixedResults = new Map<string, Observation[]>();
  for (const f of await readdir(resolve(v["fixed40-run"], "results"))) {
    const r = JSON.parse(await readFile(resolve(v["fixed40-run"], "results", f), "utf8")) as { photo: string; observations: Observation[] };
    fixedResults.set(r.photo, r.observations);
  }
  const robin16 = await load(resolve(v.robin16, "set.json"), v.robin16, robinResults, "robin16");
  const robinPages = new Set((JSON.parse(await readFile(resolve(v.robin16, "set.json"), "utf8")).photos as { status: string; mapping: { file: string } }[]).filter((p) => p.status === "ready").map((p) => p.mapping.file));
  const v2Raw = JSON.parse(await readFile(resolve(v["robin-v2"], "set.json"), "utf8"));
  const newIds = new Set((v2Raw.photos as { status: string; mapping: { file: string }; photo: Photo }[]).filter((p) => p.status === "ready" && !robinPages.has(p.mapping.file)).map((p) => p.photo.id));
  const stress = await load(resolve(v["robin-v2"], "set.json"), v["robin-v2"], new Map(), "stress", (p) => newIds.has(p.id));
  const fixed40 = await load(resolve(v.fixed40, "manifest.json"), v.fixed40, fixedResults, "fixed40");
  const cases = [...robin16, ...fixed40, ...stress];
  const estimate = cases.length * PER_CALL_USD;
  console.log(JSON.stringify({ model: MARKING_ESCALATION_MODEL, calls: { robin16: robin16.length, fixed40: fixed40.length, stress: stress.length }, items: { robin16: robin16.reduce((n, c) => n + c.asked.length, 0), fixed40: fixed40.reduce((n, c) => n + c.asked.length, 0), stress: stress.reduce((n, c) => n + c.asked.length, 0) }, estimateUsd: Number(estimate.toFixed(2)), maxUsd: max }));
  if (v.estimate) return;
  if (estimate > max) throw Error("estimate above --max-usd; nothing was sent");

  let spentMicros = 0, unpriced = 0, failures = 0;
  const parts: Record<string, { second: Tally; merged?: Tally }> = { robin16: { second: tally(), merged: tally() }, fixed40: { second: tally(), merged: tally() }, stress: { second: tally() } };
  const detail: unknown[] = [];
  for (const c of cases) {
    if (spentMicros / 1e6 + PER_CALL_USD > max) { console.log("stopped at the cap"); break; }
    const factory = markingEscalationClient({ ...process.env, SCAN_MARKING_ESCALATION: "on" });
    const transport = factory?.(async () => {});
    if (!transport) throw Error("no escalation client: SCAN_MARKING_OPENROUTER_API_KEY is required");
    const image = new Uint8Array(await readFile(resolve(c.dir, c.photo.image.path)));
    let second: Observation[] = [];
    try {
      const output = await transport.client.json(markingRequestFor(c.photo.frame, image, c.asked, true), AbortSignal.timeout(120_000));
      second = readMarkingOutput(c.photo.frame, output);
    } catch { failures++; }
    const cost = transport.costMicros();
    if (cost === null) unpriced++; else spentMicros += cost;
    score(parts[c.part].second, c.photo.truth, second, c.asked, detail, `${c.part}:${c.photo.id}`);
    if (c.first && parts[c.part].merged) {
      const merged = mergeSecondLook(c.first, second, c.asked).observations;
      score(parts[c.part].merged!, c.photo.truth, merged, c.photo.truth.filter((t) => t.result !== "parent").map((t) => t.itemId), [], "merged");
    }
  }
  const gate = (t: Tally) => t.wrongAsRight === 0 && t.wrongMarks <= Math.floor(t.definite * 0.01);
  const result = { version: 1, model: MARKING_ESCALATION_MODEL, at: new Date().toISOString(), spentUsd: spentMicros / 1e6, unpriced, failures, parts,
    passes: Object.fromEntries(Object.entries(parts).map(([k, p]) => [k, gate(p.second)])), wrongMarks: detail };
  await writeFile(v.out, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ spentUsd: result.spentUsd, unpriced, failures, passes: result.passes, parts }, null, 1));
}
