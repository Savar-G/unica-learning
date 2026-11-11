import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { attemptCostBound, decisionClient, decisionModelTerms, DecisionError } from "@/lib/decision-client";
import { calibrateGate, questionGateProbabilities, type GateInput, type QuestionGate } from "@/lib/workbook-gates";

interface Case extends GateInput { id: string; source: string; originalId?: string; gate?: QuestionGate }
interface SetFile { version: number; originals: Case[]; changed: Case[] }
type MeasuredGate = "reading_level" | "one_right_answer";
type Row = { model: string; id: string; gate: MeasuredGate; changed: boolean; probability: number };
const models = ["typesafe/jev-1.14", "google/gemini-decision-1"];
const gates: MeasuredGate[] = ["reading_level", "one_right_answer"];
const { values } = parseArgs({ options: { estimate: { type: "boolean" }, "max-usd": { type: "string", default: "2" } } });
const max = Number(values["max-usd"]);
if (!Number.isFinite(max) || max <= 0 || max > 2) throw new Error("--max-usd must be greater than 0 and no more than 2");
const set = JSON.parse(await readFile("docs/workbook-gate-set.json", "utf8")) as SetFile;
const cases = [...set.originals, ...set.changed];
if (set.version !== 1 || set.originals.length === 0 || gates.some((g) => set.changed.filter((x) => x.gate === g).length !== 30)) throw new Error("invalid labelled set");
// A byte per token is a conservative text estimate, but the cap below reserves a whole context per request.
const bytes = cases.reduce((sum, c) => sum + Buffer.byteLength(JSON.stringify(c.question)) + 2500, 0);
const estimate = Object.fromEntries(models.map((m) => [m, bytes * decisionModelTerms(m).promptUsdPerM / 1e6]));
console.log(JSON.stringify({ estimateUsd: estimate, total: Object.values(estimate).reduce((a, b) => a + b, 0), requests: cases.length * models.length }));
if (!values.estimate) {
  if (Object.values(estimate).reduce((a, b) => a + b, 0) > max) throw new Error("estimate exceeds cap");
  const clients = models.map((m) => decisionClient(process.env, m, { maxRetries: 0 }));
  if (clients.some((c) => c === null)) throw new Error("DECISIONS_OPENROUTER_API_KEY is required");
  let exposure = 0;
  let knownSpend = 0;
  let unpriced = 0;
  const rows: Row[] = [];
  const failures: string[] = [];
  const jobs = clients.flatMap((client) => cases.map((item) => ({ client: client!, item })));
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const { client, item } = jobs[next++];
      const bound = attemptCostBound(client.model);
      if (exposure + bound > max) { failures.push(`${client.model} ${item.id}: cap`); continue; }
      exposure += bound;
      try {
        const { probabilities, result } = await questionGateProbabilities(client, item, AbortSignal.timeout(30_000));
        if (result.costKnown && result.usd !== null && result.usd <= bound) { exposure -= bound - result.usd; knownSpend += result.usd; }
        else { unpriced += 1; if (result.usd !== null) knownSpend += result.usd; }
        for (const gate of gates) {
          if (item.gate && item.gate !== gate) continue;
          const probability = probabilities[gate];
          if (probability === undefined) throw new Error(`missing ${gate}`);
          rows.push({ model: client.model, id: item.id, gate, changed: Boolean(item.gate), probability });
        }
      } catch (e) {
        if (e instanceof DecisionError && e.costKnown && e.usd !== null && e.usd <= bound) { exposure -= bound - e.usd; knownSpend += e.usd; }
        else { unpriced += 1; if (e instanceof DecisionError && e.usd !== null) knownSpend += e.usd; }
        failures.push(`${client.model} ${item.id}: ${e instanceof DecisionError ? e.kind : 'invalid answer'}`);
      }
      if (next % 25 === 0) console.log(`started ${next}/${jobs.length}; known USD ${knownSpend.toFixed(6)}`);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  if (failures.length) {
    console.error(JSON.stringify({ failures, knownSpend, unpriced, maximumExposure: exposure }));
    throw new Error(`${failures.length} requests failed; the existing results and report were not updated`);
  }
  await writeFile("docs/workbook-gate-set-results.json", JSON.stringify({ version: 1, rows, failures, knownSpend, unpriced, maximumExposure: exposure }, null, 2) + "\n");
  const table: string[] = [];
  for (const model of models) for (const gate of gates) {
    const original = rows.filter((r) => r.model === model && r.gate === gate && !r.changed);
    const changed = rows.filter((r) => r.model === model && r.gate === gate && r.changed);
    if (original.length !== set.originals.length || changed.length !== 30) throw new Error("incomplete result set");
    const best = calibrateGate(gate, original.map((r) => r.probability), changed.map((r) => r.probability));
    if (!best) {
      table.push(`| ${model} | ${gate} | unmeasured | above 5% at all tested thresholds | unset | off |`);
      continue;
    }
    table.push(`| ${model} | ${gate} | ${best.caught}/${changed.length} (${(best.caught / changed.length * 100).toFixed(1)}%) | ${best.falseFlags}/${original.length} (${(best.falseFlags / original.length * 100).toFixed(1)}%) | ${best.threshold.toFixed(2)} | ${best.enabled ? "on" : "off"} |`);
  }
  for (const model of models) for (const gate of ["picture_matches", "uses_interest"]) table.push(`| ${model} | ${gate} | unmeasured (0) | unmeasured (0) | unset | off |`);
  const report = `# Workbook question gate set\n\nThe set has ${set.originals.length} unchanged questions: 36 fake U16, 60 real U16 from first-customer-u16-20261106 and 12 real U16 from codex-sol-high-u16-20261105. Both U4 samples had no eligible questions. The real source folders each had fewer than 100 eligible questions, so the set keeps all of them. The changed set has 30 reading-level and 30 multiple-answer copies. These edits are synthetic and do not establish performance on production questions. The 30 multiple-answer copies use one repeated instruction. The reading-level labels have not been independently checked. The same set selects and evaluates each threshold, so the rates are not held-out estimates.\n\nThe eligible samples contain 0 picture questions and 0 interest questions. Picture and interest gates are off with unset thresholds until suitable real sample questions exist.\n\nA threshold passes when it catches at least 90% of changed copies and flags at most 5% of unchanged questions. The script searches thresholds from 0.00 to 1.00 in steps of 0.01, maximises catches under the false-flag limit, then minimises false flags. Reading flags at or above the threshold. Other gates flag below their P(yes) threshold.\n\n| Model | Gate | Catch rate | False-flag rate | Threshold | On or off |\n|---|---|---:|---:|---:|---|\n${table.join("\n")}\n\nKnown spend: USD ${knownSpend.toFixed(6)}. Unpriced attempts: ${unpriced}. Maximum spend including unpriced attempts: USD ${exposure.toFixed(6)}.\n`;
  await writeFile("docs/workbook-gate-set-report.md", report);
  console.log(`Known USD ${knownSpend.toFixed(6)}; unpriced ${unpriced}; maximum exposure USD ${exposure.toFixed(6)}`);
}
