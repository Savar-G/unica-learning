import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { attemptCostBound, decisionClient, decisionModelTerms, DecisionError } from "@/lib/decision-client";
import { questionGateProbabilities, type GateInput, type QuestionGate } from "@/lib/workbook-gates";
import { evaluateGateFolds, gateCatchesByKind, type GateRow } from "@/lib/workbook-gate-evaluation";

interface Case extends GateInput { id: string; source: string; originalId?: string; gate?: QuestionGate; kind?: string }
interface SetFile { version: number; originals: Case[]; changed: Case[] }
interface Results { version: number; rows: GateRow[]; failures: string[]; knownSpend: number; unpriced: number; maximumExposure: number }
// Stored rows exist for both; new requests go to Jev only (Savar, 2026-11-11: the generator gates use Jev; Gemini is not used).
const reportModels = ["typesafe/jev-1.14", "google/gemini-decision-1"];
const gates = ["reading_level", "one_right_answer"] as const;
const { values } = parseArgs({ options: { estimate: { type: "boolean" }, "from-results": { type: "boolean" }, "max-usd": { type: "string", default: "0.5" }, models: { type: "string", default: "typesafe/jev-1.14" } } });
const max = Number(values["max-usd"]);
if (!Number.isFinite(max) || max <= 0 || max > 0.5) throw new Error("--max-usd must be greater than 0 and no more than 0.5");
const askModels = values.models!.split(",").map((m) => m.trim()).filter(Boolean);
if (!askModels.length || askModels.some((m) => !reportModels.includes(m))) throw new Error(`--models takes ${reportModels.join(" or ")}`);
const set = JSON.parse(await readFile("docs/workbook-gate-set.json", "utf8")) as SetFile;
const cases = [...set.originals, ...set.changed];
if (set.version !== 2 || set.originals.length === 0 || gates.some((g) => set.changed.filter((x) => x.gate === g).length < 30)) throw new Error("invalid labelled set");
const stored: Results = JSON.parse(await readFile("docs/workbook-gate-set-results.json", "utf8").catch(() => '{"version":1,"rows":[],"failures":[],"knownSpend":0,"unpriced":0,"maximumExposure":0}'));
if (stored.failures.length) throw new Error("stored results are incomplete");
const answered = (model: string) => new Set(stored.rows.filter((r) => r.model === model).map((r) => r.id));
// (Only the questions a model has no stored answer for are asked again: the copies added since the last run.)
const missing = askModels.flatMap((model) => { const has = answered(model); return cases.filter((c) => !has.has(c.id)).map((item) => ({ model, item })); });
const bytes = (items: Case[]) => items.reduce((sum, c) => sum + Buffer.byteLength(JSON.stringify(c.question)) + 2500, 0);
const estimate = Object.fromEntries(askModels.map((m) => [m, bytes(missing.filter((j) => j.model === m).map((j) => j.item)) * decisionModelTerms(m).promptUsdPerM / 1e6]));
console.log(JSON.stringify({ estimateUsd: estimate, total: Object.values(estimate).reduce((a, b) => a + b, 0), requests: missing.length }));
if (!values.estimate) {
  let run: Results = stored;
  if (values["from-results"] || !missing.length) {
    console.log("Reusing stored answers; no model requests.");
  } else {
    if (Object.values(estimate).reduce((a, b) => a + b, 0) > max) throw new Error("estimate exceeds cap");
    const clients = new Map(askModels.map((m) => [m, decisionClient(process.env, m, { maxRetries: 0 })]));
    if ([...clients.values()].some((c) => c === null)) throw new Error("DECISIONS_OPENROUTER_API_KEY is required");
    let exposure = 0, knownSpend = 0, unpriced = 0;
    const rows: GateRow[] = [];
    const failures: string[] = [];
    const jobs = missing.map(({ model, item }) => ({ client: clients.get(model)!, item }));
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
    run = { version: 2, rows: [...stored.rows, ...rows], failures, knownSpend: stored.knownSpend + knownSpend, unpriced: stored.unpriced + unpriced, maximumExposure: exposure };
    console.log(JSON.stringify({ spentUsd: knownSpend, unpriced, totalSpentUsd: run.knownSpend }));
  }
  // A model is measured on the copies it has answers for; a copy it was never asked is listed as not measured.
  const table: string[] = [], kinds: string[] = [], notMeasured: string[] = [];
  for (const model of reportModels) for (const gate of gates) {
    const has = new Set(run.rows.filter((r) => r.model === model && r.gate === gate).map((r) => r.id));
    const copies = set.changed.filter((c) => c.gate === gate && has.has(c.id));
    const left = set.changed.filter((c) => c.gate === gate && !has.has(c.id)).length;
    if (left) notMeasured.push(`${model} ${gate}: ${left} copies not asked`);
    const folds = evaluateGateFolds(set.originals, copies, run.rows, model, gate);
    const format = (fold: typeof folds[number]) => `${fold.caught}/${fold.changed} (${(100 * fold.caught / fold.changed).toFixed(1)}%), ${fold.falseFlags}/${fold.unchanged} (${(100 * fold.falseFlags / fold.unchanged).toFixed(1)}%), ${fold.threshold.toFixed(2)}`;
    const meanCatch = folds.reduce((a, f) => a + f.caught / f.changed, 0) / 2;
    const meanFlags = folds.reduce((a, f) => a + f.falseFlags / f.unchanged, 0) / 2;
    table.push(`| ${model} | ${gate} | ${format(folds[0])} | ${format(folds[1])} | ${(100 * meanCatch).toFixed(1)}%, ${(100 * meanFlags).toFixed(1)}% | ${folds.every((f) => f.passed) ? "on" : "off"} |`);
    if (gate === "one_right_answer") for (const [kind, c] of gateCatchesByKind(set.originals, copies, run.rows, model, gate)) kinds.push(`| ${model} | ${kind} | ${c.caught}/${c.total} |`);
  }
  for (const model of reportModels) for (const gate of ["picture_matches", "uses_interest"]) table.push(`| ${model} | ${gate} | unmeasured (0) | unmeasured (0) | unmeasured | off |`);
  const count = (gate: string) => set.changed.filter((c) => c.gate === gate).length;
  const kindNames = [...new Set(set.changed.filter((c) => c.gate === "one_right_answer").map((c) => c.kind))];
  const report = `# Workbook question gate set\n\nThe set has ${set.originals.length} unchanged questions: 36 fake U16, 60 real U16 from first-customer-u16-20261106 and 12 real U16 from codex-sol-high-u16-20261105. Both U4 samples had no eligible questions. Each real source had fewer than 100 eligible questions, so the set keeps all of them. The changed set has ${count("reading_level")} reading-level and ${count("one_right_answer")} multiple-answer copies. The copies are synthetic. The multiple-answer copies are of ${kindNames.length} kinds (${kindNames.join(", ")}): the first 30 use one repeated instruction ("either-instruction"); the other kinds were added for #858, so the gate is not measured on one pattern only. The reading-level labels have not had independent review.\n\nThe split uses the original questions only, without their labels or model answers. It groups identical printed questions, assigns groups in input order to alternate halves, and balances the halves by moving the last singleton if needed. Every copy stays with its original, and each added kind has two copies in each half. This assignment is reproducible, but was made after the copies were written; it is not a prospective sample.\n\nFor fold A, the script selects a threshold on half B and evaluates it on half A. Fold B swaps the halves. A threshold must catch at least 90% of changed copies and flag at most 5% of unchanged questions. A gate is on only when both held-out folds pass. Each cell lists catch rate, false-flag rate and the threshold selected on the other half. The mean is the average of the two held-out rates. Reading flags at or above its threshold. The other gates flag below their P(yes) threshold.\n\n| Model | Gate | Fold A: catch, false flag, threshold | Fold B: catch, false flag, threshold | Mean: catch, false flag | State |\n|---|---|---|---|---|---|\n${table.join("\n")}\n\nMultiple-answer copies caught by kind, each judged by its own fold's threshold:\n\n| Model | Kind | Caught |\n|---|---|---|\n${kinds.join("\n")}\n\n${notMeasured.length ? `Not measured: ${notMeasured.join("; ")}. A model is measured only on the copies it answered; Gemini is not asked again (Savar, 2026-11-11).\n\n` : ""}The eligible samples contain 0 picture questions and 0 interest questions. Those gates remain off with unset thresholds. These small, templated samples do not establish performance on production questions.\n\nThe model runs cost USD ${run.knownSpend.toFixed(6)} in all, with ${run.unpriced} unpriced attempts.\n`;
  if (run !== stored) await writeFile("docs/workbook-gate-set-results.json", JSON.stringify(run, null, 2) + "\n");
  await writeFile("docs/workbook-gate-set-report.md", report);
}
