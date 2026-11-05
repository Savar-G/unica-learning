// Offline authoring only. This module is loaded by data/curriculum/verify-mistake-lines.mjs.
import { mkdirSync, readFileSync, writeFileSync, renameSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { claudeCliClient } from "@/lib/ai-claude-cli";
import { digestOf } from "@/lib/workbook-digest";
import { parseStepProgressions } from "./step-source";
import { InvalidMistakeBatch, writeMistakePairs, verifyMistakePairs, WRITE_MISTAKE_PROMPT, VERIFY_MISTAKE_PROMPT, type MistakeCase } from "./mistake-verification";
import { mistakeContext, MISTAKE_WRITER_MODEL, MISTAKE_VERIFIER_MODEL, watchOutVerificationHash } from "./watch-out";
import type { WatchOutPair } from "./types";

interface Attempt {
  round: number; pair: WatchOutPair | null; writerReason: string;
  verified: boolean | null; reason: string; verifierModel: string;
}
interface RecordRow { id: string; context: ReturnType<typeof mistakeContext>; attempts: Attempt[] }
interface State { fingerprint: string; writerModel: string; verifierModel: string; rows: Record<string, RecordRow> }

export async function runMistakeVerification(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { help: { type: "boolean" }, out: { type: "string", default: "/tmp/c2-r2-verification" }, concurrency: { type: "string", default: "3" }, "max-batches": { type: "string" } } });
  if (values.help) {
    console.log("WORKBOOK_CLAUDE_CONFIG_DIR=<subscription-folder> node data/curriculum/verify-mistake-lines.mjs [--out <checkpoint-folder>] [--concurrency 1..4] [--max-batches <probe-count>]\nResumes matching checkpoints. Writes active data and the author log only after all batches finish. Uses batches of 20 and at most two revisions. No API fallback.");
    return;
  }
  const configDir = process.env.WORKBOOK_CLAUDE_CONFIG_DIR;
  if (!configDir) throw new Error("Set WORKBOOK_CLAUDE_CONFIG_DIR to the subscription account folder");
  const concurrency = Number(values.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error("Concurrency must be 1 to 4");
  const out = resolve(values.out!); mkdirSync(out, { recursive: true });
  const file = "data/curriculum/step-progressions-k9.json";
  const source = parseStepProgressions(JSON.parse(readFileSync(file, "utf8")));
  const cases = source.steps.flatMap(step => step.mistakes.flatMap((mistake, index) => mistake.misconception === null ? [] : [{
    id: `${step.skill}#${step.number}:${index}`, context: mistakeContext(step, mistake), step, mistake,
  }]));
  const fingerprint = digestOf({ cases: cases.map(({ id, context }) => ({ id, context })), writer: MISTAKE_WRITER_MODEL, verifier: MISTAKE_VERIFIER_MODEL, writePrompt: WRITE_MISTAKE_PROMPT, verifyPrompt: VERIFY_MISTAKE_PROMPT });
  const stateFile = resolve(out, "state.json");
  let state: State;
  try { state = JSON.parse(readFileSync(stateFile, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; state = { fingerprint, writerModel: MISTAKE_WRITER_MODEL, verifierModel: MISTAKE_VERIFIER_MODEL, rows: {} }; }
  if (state.fingerprint !== fingerprint) throw new Error("Verification inputs or prompts changed; use a new output folder");
  const checkpoint = () => { writeFileSync(`${stateFile}.tmp`, JSON.stringify(state, null, 2) + "\n"); renameSync(`${stateFile}.tmp`, stateFile); };
  for (const item of cases) state.rows[item.id] ??= { id: item.id, context: item.context, attempts: [] };
  checkpoint();
  const env = { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: undefined };
  const writer = claudeCliClient({ model: MISTAKE_WRITER_MODEL, configDir, env });
  const verifier = claudeCliClient({ model: MISTAKE_VERIFIER_MODEL, configDir, env });
  const controller = new AbortController();
  process.once("SIGTERM", () => controller.abort()); process.once("SIGINT", () => controller.abort());
  let calls = 0;
  const log = (event: unknown) => appendFileSync(resolve(out, "events.jsonl"), JSON.stringify(event) + "\n");
  const sendBatch = async <T>(stage: string, send: () => Promise<T>): Promise<T> => {
    for (let retry = 0; ; retry++) {
      try { calls++; return await send(); }
      catch (error) {
        if (!(error instanceof InvalidMistakeBatch) || retry >= 2) throw error;
        log({ stage: "invalid_response", operation: stage, retry: retry + 1, reason: error.message });
        console.log(`${stage}: rejected malformed response; retry ${retry + 1}/2`);
      }
    }
  };
  const batches: typeof cases[] = [];
  for (let i = 0; i < cases.length; i += 20) batches.push(cases.slice(i, i + 20));
  const limit = values["max-batches"] ? Number(values["max-batches"]) : batches.length;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Invalid batch limit");
  let next = 0;
  const work = async () => {
    while (!controller.signal.aborted) {
      const batchIndex = next++; if (batchIndex >= Math.min(limit, batches.length)) return;
      const batch = batches[batchIndex];
      for (let round = 0; round < 3; round++) {
        const pending = batch.filter(c => !state.rows[c.id].attempts.some(a => a.verified === true));
        if (!pending.length) break;
        const needWrite = pending.filter(c => !state.rows[c.id].attempts[round]);
        if (needWrite.length) {
          const input: MistakeCase[] = needWrite.map(({ id, context }) => {
            const prior = state.rows[id].attempts.at(-1);
            return { id, context, ...(prior ? { prior: { pair: prior.pair, reason: prior.reason } } : {}) };
          });
          console.log(`batch ${batchIndex + 1}/${batches.length} round ${round + 1}: write ${input.length}`);
          const written = await sendBatch("write", () => writeMistakePairs(writer, input, controller.signal));
          for (const row of written) state.rows[row.id].attempts[round] = { round, pair: row.pair, writerReason: row.reason, verified: row.pair ? null : false, reason: row.pair ? "awaiting independent verification" : row.reason, verifierModel: MISTAKE_VERIFIER_MODEL };
          checkpoint(); log({ stage: "write", batch: batchIndex + 1, round, model: writer.model, results: written });
        }
        const needVerify = pending.filter(c => state.rows[c.id].attempts[round]?.verified === null);
        if (needVerify.length) {
          console.log(`batch ${batchIndex + 1}/${batches.length} round ${round + 1}: verify ${needVerify.length}`);
          const verdicts = await sendBatch("verify", () => verifyMistakePairs(verifier, needVerify.map(({ id, context }) => ({ id, context, pair: state.rows[id].attempts[round].pair! })), controller.signal));
          for (const verdict of verdicts) Object.assign(state.rows[verdict.id].attempts[round], { verified: verdict.verified, reason: verdict.reason });
          checkpoint(); log({ stage: "verify", batch: batchIndex + 1, round, model: verifier.model, results: verdicts });
        }
      }
      const accepted = batch.filter(c => state.rows[c.id].attempts.some(a => a.verified)).length;
      console.log(`batch ${batchIndex + 1}/${batches.length} done: verified ${accepted}, dropped ${batch.length - accepted}`);
    }
  };
  let firstFailure: unknown;
  const results = await Promise.allSettled(Array.from({ length: concurrency }, async () => {
    try { await work(); } catch (error) { firstFailure ??= error; controller.abort(); throw error; }
  }));
  checkpoint();
  const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) throw firstFailure ?? failed.reason;
  if (controller.signal.aborted) throw new Error("Verification stopped; saved the checkpoint, changed no source data");
  if (limit < batches.length) { console.log(`Probe complete. ${calls} model calls. Source data unchanged.`); return; }
  // All calls have settled. Only independently accepted text can enter the active source.
  const before = new Map(source.steps.map(step => [`${step.skill}#${step.number}`, structuredClone(step.mistakes)]));
  for (const item of cases) {
    const accepted = state.rows[item.id].attempts.find(a => a.verified === true);
    if (!accepted?.pair) delete item.mistake.watchOut;
    else {
      const pair: WatchOutPair = { wrong: accepted.pair.wrong, fix: accepted.pair.fix, verified: true, verifierModel: MISTAKE_VERIFIER_MODEL };
      pair.verificationHash = watchOutVerificationHash(item.step, item.mistake, pair);
      item.mistake.watchOut = pair;
    }
  }
  const records = cases.map(c => ({ ...state.rows[c.id], attempts: state.rows[c.id].attempts.map(attempt => ({
    ...attempt, writerReason: attempt.writerReason.replaceAll("\u2014", "-"), reason: attempt.reason.replaceAll("\u2014", "-"),
  })) }));
  const coverage = {
    steps: source.steps.length, codedSteps: new Set(cases.map(c => `${c.step.skill}#${c.step.number}`)).size, mistakes: cases.length,
    pairsWritten: records.filter(r => r.attempts.some(a => a.pair)).length,
    candidateVersionsWritten: records.flatMap(r => r.attempts).filter(a => a.pair).length,
    verified: records.filter(r => r.attempts.some(a => a.verified)).length,
    rejected: records.filter(r => r.attempts.some(a => a.pair && a.verified === false)).length,
    dropped: records.filter(r => !r.attempts.some(a => a.verified)).length,
  };
  const changesFile = "data/curriculum/author-changes.json";
  const changes = JSON.parse(readFileSync(changesFile, "utf8"));
  const rows: string[] = [];
  for (const step of source.steps) {
    const prior = before.get(`${step.skill}#${step.number}`)!;
    if (JSON.stringify(prior) === JSON.stringify(step.mistakes)) continue;
    changes.push({ skill: step.skill, step: step.number, template: null, path: ["mistakes"], before: prior, after: step.mistakes, why: "C2-R2: replace shared lines with independently verified step-specific pairs; remove every unverified pair." });
    for (const [index, mistake] of step.mistakes.entries()) if (mistake.misconception !== null) {
      const record = state.rows[`${step.skill}#${step.number}:${index}`];
      const pair = mistake.watchOut;
      rows.push(`| ${step.skill} | ${step.number} | ${index + 1} | ${pair ? pair.wrong + " / " + pair.fix : "DROPPED: " + record.attempts.at(-1)!.reason} | ${pair?.verifierModel ?? "none"} |`.replaceAll("\n", " "));
    }
  }
  writeFileSync(file, JSON.stringify(source, null, 1) + "\n");
  writeFileSync(changesFile, JSON.stringify(changes, null, 2) + "\n");
  if (rows.length) appendFileSync("data/curriculum/author-changes.md", "\n## C2-R2: step-specific independent verification\n\nEach pair below was written for its own step. A separate subscription model checked the complete context and exact text. Rejected pairs were revised at most twice. The final rejected pairs were removed. The JSON verification report records every attempt and reason. Original question fields and answer keys stay unchanged.\n\n| Skill | Step | Mistake | Final wrong / fix or removal reason | Verifier |\n|---|---|---|---|---|\n" + rows.join("\n") + "\n");
  writeFileSync("data/curriculum/mistake-verification.json", JSON.stringify({ fingerprint, writerModel: writer.model, verifierModel: verifier.model, coverage, records }, null, 2) + "\n");
  console.log(JSON.stringify({ complete: true, coverage, newModelCalls: calls, checkpoint: stateFile }));
}
