import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { attemptCostBound, decisionClient, decisionModelTerms, DecisionError } from "@/lib/decision-client";
import { questionGateProbabilities, type GateInput, type QuestionGate } from "@/lib/workbook-gates";
import { evaluateGateFolds, type GateRow } from "@/lib/workbook-gate-evaluation";

interface Case extends GateInput { id: string; source: string; originalId?: string; gate?: QuestionGate }
interface SetFile { version: number; originals: Case[]; changed: Case[] }
interface Results { version: number; rows: GateRow[]; failures: string[]; knownSpend: number; unpriced: number; maximumExposure: number }
const models = ["typesafe/jev-1.14", "google/gemini-decision-1"];
const gates = ["reading_level", "one_right_answer"] as const;
const { values } = parseArgs({ options: { estimate: { type: "boolean" }, "from-results": { type: "boolean" }, "max-usd": { type: "string", default: "0.5" } } });
const max = Number(values["max-usd"]);
if (!Number.isFinite(max) || max <= 0 || max > 0.5) throw new Error("--max-usd must be greater than 0 and no more than 0.5");
const set = JSON.parse(await readFile("docs/workbook-gate-set.json", "utf8")) as SetFile;
const cases = [...set.originals, ...set.changed];
if (set.version !== 1 || set.originals.length === 0 || gates.some((g) => set.changed.filter((x) => x.gate === g).length !== 30)) throw new Error("invalid labelled set");
const bytes = cases.reduce((sum, c) => sum + Buffer.byteLength(JSON.stringify(c.question)) + 2500, 0);
const estimate = Object.fromEntries(models.map((m) => [m, bytes * decisionModelTerms(m).promptUsdPerM / 1e6]));
console.log(JSON.stringify({ estimateUsd: estimate, total: Object.values(estimate).reduce((a, b) => a + b, 0), requests: cases.length * models.length }));
if (!values.estimate) {
  let run: Results;
  if (values["from-results"]) {
    run = JSON.parse(await readFile("docs/workbook-gate-set-results.json", "utf8")) as Results;
    if (run.version !== 1 || run.failures.length) throw new Error("stored results are incomplete");
    console.log("Reusing stored answers; no model requests.");
  } else {
    if (Object.values(estimate).reduce((a, b) => a + b, 0) > max) throw new Error("estimate exceeds cap");
    const clients = models.map((m) => decisionClient(process.env, m, { maxRetries: 0 }));
    if (clients.some((c) => c === null)) throw new Error("DECISIONS_OPENROUTER_API_KEY is required");
    let exposure = 0, knownSpend = 0, unpriced = 0;
    const rows: GateRow[] = [];
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
          failures.push(`${client.model} ${item.id}: ${e instanceof DecisionError ? e.kind : "invalid answer"}`);
        }
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker));
    if (failures.length) {
      console.error(JSON.stringify({ failures, knownSpend, unpriced, maximumExposure: exposure }));
      throw new Error(`${failures.length} requests failed; the existing results and report were not updated`);
    }
    run = { version: 1, rows, failures, knownSpend, unpriced, maximumExposure: exposure };
  }
  const table: string[] = [];
  for (const model of models) for (const gate of gates) {
    const folds = evaluateGateFolds(set.originals, set.changed, run.rows, model, gate);
    const format = (fold: typeof folds[number]) => fold.threshold === null ? "unmeasured" : `${fold.caught}/${fold.changed} (${(100 * fold.caught / fold.changed).toFixed(1)}%), ${fold.falseFlags}/${fold.unchanged} (${(100 * fold.falseFlags / fold.unchanged).toFixed(1)}%), ${fold.threshold.toFixed(2)}`;
    const meanCatch = folds.reduce((a, f) => a + f.caught / f.changed, 0) / 2;
    const meanFlags = folds.reduce((a, f) => a + f.falseFlags / f.unchanged, 0) / 2;
    table.push(`| ${model} | ${gate} | ${format(folds[0])} | ${format(folds[1])} | ${(100 * meanCatch).toFixed(1)}%, ${(100 * meanFlags).toFixed(1)}% | ${folds.every((f) => f.passed) ? "on" : "off"} |`);
  }
  for (const model of models) for (const gate of ["picture_matches", "uses_interest"]) table.push(`| ${model} | ${gate} | unmeasured (0) | unmeasured (0) | unmeasured | off |`);
  const report = `# Workbook question gate set\n\nThe set has 108 unchanged questions: 36 fake U16, 60 real U16 from first-customer-u16-20261106 and 12 real U16 from codex-sol-high-u16-20261105. Both U4 samples had no eligible questions. Each real source had fewer than 100 eligible questions, so the set keeps all of them. The changed set has 30 reading-level and 30 multiple-answer copies. The copies are synthetic. The multiple-answer copies use one repeated instruction. The reading-level labels have not had independent review.\n\nThe split uses the original questions only, without their labels or model answers. It groups identical printed questions, assigns groups in input order to alternate halves, and balances the halves by moving the last singleton if needed. Each half has 54 original questions and 15 changed copies for each measured gate. Every copy stays with its original. This assignment is reproducible, but was made after the copies were written; it is not a prospective sample.\n\nFor fold A, the script selects a threshold on half B and evaluates it on half A. Fold B swaps the halves. A threshold must catch at least 90% of changed copies and flag at most 5% of unchanged questions. A gate is on only when both held-out folds pass. Each cell lists catch rate, false-flag rate and the threshold selected on the other half. The mean is the average of the two held-out rates. Reading flags at or above its threshold. The other gates flag below their P(yes) threshold.\n\n| Model | Gate | Fold A: catch, false flag, threshold | Fold B: catch, false flag, threshold | Mean: catch, false flag | State |\n|---|---|---|---|---|---|\n${table.join("\n")}\n\nThe eligible samples contain 0 picture questions and 0 interest questions. Those gates remain off with unset thresholds. Only Jev's one-right-answer gate passes both folds; both folds selected 0.03. The other thresholds remain unset in the module. These small, templated samples do not establish performance on production questions.\n\nThe original model runs cost USD ${run.knownSpend.toFixed(6)} with ${run.unpriced} unpriced attempts. This report reuses their stored answers; the held-out analysis costs USD 0.\n`;
  if (!values["from-results"]) await writeFile("docs/workbook-gate-set-results.json", JSON.stringify(run, null, 2) + "\n");
  await writeFile("docs/workbook-gate-set-report.md", report);
}
