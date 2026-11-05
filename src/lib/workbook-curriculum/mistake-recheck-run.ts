// Offline re-verification of existing pairs. Never reuse the earlier approval as a new verdict.
import { mkdirSync, readFileSync, writeFileSync, renameSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { claudeCliClient } from "@/lib/ai-claude-cli";
import { digestOf } from "@/lib/workbook-digest";
import { parseStepProgressions } from "./step-source";
import { InvalidMistakeBatch, writeMistakePairs, verifyMistakePairs, VERIFY_MISTAKE_PROMPT, WRITE_MISTAKE_PROMPT } from "./mistake-verification";
import { mistakeContext, MISTAKE_WRITER_MODEL, MISTAKE_VERIFIER_MODEL, watchOutVerificationHash } from "./watch-out";
import type { WatchOutPair } from "./types";

interface Attempt {
  round: number; pair: WatchOutPair | null; writerReason: string;
  verified: boolean | null; reason: string; verifierModel: string;
}
interface Row { id: string; context: ReturnType<typeof mistakeContext>; attempts: Attempt[] }
interface Recheck { fingerprint: string; prompt: string; selection: string[]; previousRecords: Row[]; records: Row[] }
interface Report {
  coverage: { steps: number; codedSteps: number; mistakes: number; pairsWritten: number; candidateVersionsWritten: number; verified: number; rejected: number; dropped: number };
  records: Row[]; rechecks?: Recheck[];
}

export async function runMistakeRecheck(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { help: { type: "boolean" }, ids: { type: "string" }, levels: { type: "string" }, out: { type: "string", default: "/tmp/c2-r3-recheck" } } });
  if (values.help) {
    console.log("WORKBOOK_CLAUDE_CONFIG_DIR=<subscription-folder> node data/curriculum/verify-mistake-lines.mjs --recheck (--ids <id,id> | --levels <U4,U16>) --out <fresh-checkpoint-folder>\nVerifies existing exact text in batches of 20. Repairs rejections at most twice, then drops them. No API fallback. A matching checkpoint resumes this run only.");
    return;
  }
  if (!!values.ids === !!values.levels) throw new Error("Choose ids or levels");
  const requested = (values.ids ?? values.levels)!.split(",");
  if (requested.some(id => !id.trim()) || new Set(requested).size !== requested.length) throw new Error("Empty or duplicate selection");
  const configDir = process.env.WORKBOOK_CLAUDE_CONFIG_DIR;
  if (!configDir) throw new Error("Set WORKBOOK_CLAUDE_CONFIG_DIR to the subscription account folder");
  const sourceFile = "data/curriculum/step-progressions-k9.json";
  const source = parseStepProgressions(JSON.parse(readFileSync(sourceFile, "utf8")));
  const cases = source.steps.flatMap(step => step.mistakes.flatMap((mistake, index) => {
    const id = `${step.skill}#${step.number}:${index}`;
    return mistake.watchOut && mistake.misconception !== null && requested.includes(values.ids ? id : step.position.split(".")[0])
      ? [{ id, context: mistakeContext(step, mistake), step, mistake, pair: { wrong: mistake.watchOut.wrong, fix: mistake.watchOut.fix } }] : [];
  }));
  if (!cases.length || requested.some(key => !cases.some(c => values.ids ? c.id === key : c.step.position.startsWith(`${key}.`)))) throw new Error("Selection has no pair");
  const fingerprint = digestOf({ cases: cases.map(({ id, context, pair }) => ({ id, context, pair })), prompt: VERIFY_MISTAKE_PROMPT, writerPrompt: WRITE_MISTAKE_PROMPT, writer: MISTAKE_WRITER_MODEL, verifier: MISTAKE_VERIFIER_MODEL });
  const out = resolve(values.out!); mkdirSync(out, { recursive: true });
  const stateFile = resolve(out, "state.json");
  let state: { fingerprint: string; rows: Row[]; newVersions: number };
  try { state = JSON.parse(readFileSync(stateFile, "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    state = { fingerprint, newVersions: cases.filter(c => c.mistake.watchOut?.verified !== true).length, rows: cases.map(c => ({ id: c.id, context: c.context, attempts: [{ round: 0, pair: c.pair, writerReason: "Exact existing candidate; no new writer call", verified: null, reason: "awaiting fresh independent verification", verifierModel: MISTAKE_VERIFIER_MODEL }] })) };
  }
  if (state.fingerprint !== fingerprint) throw new Error("Recheck inputs or prompts changed; use a fresh output folder");
  const checkpoint = () => { writeFileSync(`${stateFile}.tmp`, JSON.stringify(state, null, 2) + "\n"); renameSync(`${stateFile}.tmp`, stateFile); };
  checkpoint();
  const env = { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: undefined };
  const writer = claudeCliClient({ model: MISTAKE_WRITER_MODEL, configDir, env });
  const verifier = claudeCliClient({ model: MISTAKE_VERIFIER_MODEL, configDir, env });
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort()); process.once("SIGTERM", () => controller.abort());
  let calls = 0;
  const send = async <T>(operation: string, call: () => Promise<T>): Promise<T> => {
    for (let retry = 0; ; retry++) {
      try { calls++; return await call(); }
      catch (error) { if (!(error instanceof InvalidMistakeBatch) || retry >= 2) throw error; console.log(`${operation}: malformed response, retry ${retry + 1}/2`); }
    }
  };
  const log = (event: unknown) => appendFileSync(resolve(out, "events.jsonl"), JSON.stringify(event) + "\n");
  for (let round = 0; round < 3; round++) {
    const pending = state.rows.filter(row => !row.attempts.some(a => a.verified === true));
    if (!pending.length) break;
    if (round > 0) for (let offset = 0; offset < pending.length; offset += 20) {
      const batch = pending.slice(offset, offset + 20).filter(row => !row.attempts[round]);
      if (!batch.length) continue;
      console.log(`round ${round + 1}: repair ${batch.length}`);
      const written = await send("write", () => writeMistakePairs(writer, batch.map(row => ({ id: row.id, context: row.context, prior: { pair: row.attempts.at(-1)!.pair, reason: row.attempts.at(-1)!.reason } })), controller.signal));
      for (const result of written) {
        state.rows.find(row => row.id === result.id)!.attempts.push({ round, pair: result.pair, writerReason: result.reason, verified: result.pair ? null : false, reason: result.pair ? "awaiting independent verification" : result.reason, verifierModel: MISTAKE_VERIFIER_MODEL });
        if (result.pair) state.newVersions++;
      }
      checkpoint(); log({ stage: "write", round, model: writer.model, results: written });
    }
    for (let offset = 0; offset < pending.length; offset += 20) {
      const batch = pending.slice(offset, offset + 20).filter(row => row.attempts[round]?.verified === null);
      if (!batch.length) continue;
      console.log(`round ${round + 1}: verify ${batch.length} (${offset + 1}/${pending.length})`);
      const verdicts = await send("verify", () => verifyMistakePairs(verifier, batch.map(row => ({ id: row.id, context: row.context, pair: row.attempts[round].pair! })), controller.signal));
      for (const verdict of verdicts) Object.assign(state.rows.find(row => row.id === verdict.id)!.attempts[round], { verified: verdict.verified, reason: verdict.reason });
      checkpoint(); log({ stage: "verify", round, model: verifier.model, prompt: VERIFY_MISTAKE_PROMPT, results: verdicts });
      for (const verdict of verdicts) if (!verdict.verified) console.log(`REJECTED ${verdict.id}: ${verdict.reason}`);
    }
  }
  if (controller.signal.aborted || state.rows.some(row => row.attempts.some(a => a.verified === null))) throw new Error("Recheck did not finish; no source publication");
  const reportFile = "data/curriculum/mistake-verification.json";
  const report: Report = JSON.parse(readFileSync(reportFile, "utf8"));
  if (cases.some(item => !report.records.some(row => row.id === item.id))) throw new Error("Selected case has no original verification record");
  if (report.rechecks?.some(run => run.fingerprint === fingerprint)) { console.log("Recheck already published; no new source changes"); return; }
  const before = new Map(cases.map(c => [c.step, structuredClone(c.step.mistakes)]));
  for (const item of cases) {
    const accepted = state.rows.find(row => row.id === item.id)!.attempts.find(a => a.verified === true);
    if (!accepted?.pair) delete item.mistake.watchOut;
    else {
      const pair: WatchOutPair = { wrong: accepted.pair.wrong, fix: accepted.pair.fix, verified: true, verifierModel: MISTAKE_VERIFIER_MODEL };
      pair.verificationHash = watchOutVerificationHash(item.step, item.mistake, pair);
      item.mistake.watchOut = pair;
    }
  }
  const changesFile = "data/curriculum/author-changes.json";
  const changes = JSON.parse(readFileSync(changesFile, "utf8"));
  const lines: string[] = [];
  for (const [step, prior] of before) if (JSON.stringify(step.mistakes) !== JSON.stringify(prior)) {
    changes.push({ skill: step.skill, step: step.number, template: null, path: ["mistakes"], before: prior, after: step.mistakes, why: "C2-R3: publish only pairs accepted by the stricter factual-claim verifier; remove final rejections." });
    for (const item of cases.filter(c => c.step === step)) lines.push(`| ${item.id} | ${item.mistake.watchOut ? `${item.mistake.watchOut.wrong} / ${item.mistake.watchOut.fix}` : "DROPPED"} | ${MISTAKE_VERIFIER_MODEL} |`);
  }
  const rows = state.rows.map(row => ({ ...row, attempts: row.attempts.map(attempt => ({
    ...attempt, reason: attempt.reason.replaceAll("\u2014", "-"), writerReason: attempt.writerReason.replaceAll("\u2014", "-"),
  })) }));
  const ids = new Set(rows.map(row => row.id));
  report.rechecks ??= [];
  report.rechecks.push({ fingerprint, prompt: VERIFY_MISTAKE_PROMPT, selection: requested, previousRecords: report.records.filter(row => ids.has(row.id)), records: rows });
  report.records = report.records.map(row => rows.find(next => next.id === row.id) ?? row);
  const history = [...report.records, ...report.rechecks.flatMap(run => run.previousRecords)];
  report.coverage.verified = report.records.filter(row => row.attempts.some(a => a.verified)).length;
  report.coverage.dropped = report.records.length - report.coverage.verified;
  report.coverage.rejected = new Set(history.filter(row => row.attempts.some(a => a.pair && a.verified === false)).map(row => row.id)).size;
  report.coverage.pairsWritten = new Set(history.filter(row => row.attempts.some(a => a.pair)).map(row => row.id)).size;
  report.coverage.candidateVersionsWritten += state.newVersions;
  writeFileSync(sourceFile, JSON.stringify(source, null, 1) + "\n");
  writeFileSync(changesFile, JSON.stringify(changes, null, 2) + "\n");
  if (lines.length) appendFileSync("data/curriculum/author-changes.md", "\n## C2-R3: factual-claim recheck results\n\n| Case | Final wrong / fix | Verifier |\n|---|---|---|\n" + lines.join("\n") + "\n");
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ complete: true, selected: rows.length, initialRejected: rows.filter(row => row.attempts[0].verified === false).map(row => ({ id: row.id, reason: row.attempts[0].reason })), verified: rows.filter(row => row.attempts.some(a => a.verified)).length, dropped: rows.filter(row => !row.attempts.some(a => a.verified)).map(row => row.id), newModelCalls: calls }));
}
