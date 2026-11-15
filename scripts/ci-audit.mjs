#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const setup = /^(Set up job|Initialize containers|Run actions\/(checkout|setup-node)@|Run npm ci|Restore dependencies|Install dependencies|Set up Bun|Checkout)/;
const cleanup = /^(Post |Stop containers|Complete job)/;
const seconds = (a, b) => {
  if (!a || !b) return null;
  const value = (Date.parse(b) - Date.parse(a)) / 1000;
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid interval: ${a} to ${b}`);
  return value;
};

export function distribution(values) {
  const sorted = values.filter((v) => v !== null).sort((a, b) => a - b);
  const at = (q) => sorted.length ? sorted[Math.ceil(q * sorted.length) - 1] : null;
  return { n: sorted.length, p50: at(0.5), p95: at(0.95) };
}

export function jobTiming(run, job) {
  const steps = job.steps.filter((s) => s.status === 'completed' && s.conclusion !== 'skipped' && s.started_at && s.completed_at);
  const work = steps.filter((s) => !setup.test(s.name) && !cleanup.test(s.name));
  const first = work[0]?.started_at;
  const last = work.at(-1)?.completed_at;
  const complete = job.status === 'completed' && job.started_at && job.completed_at && first && last;
  const row = {
    runId: run.id, attempt: run.run_attempt, event: run.event, sha: run.head_sha,
    jobId: job.id, name: job.name, status: job.status, conclusion: job.conclusion,
    createdAt: job.created_at, labels: job.labels, url: job.html_url,
    // GitHub copies completed jobs into partial reruns with a later created_at.
    // Such a record cannot establish a queue duration. Keep it unknown.
    waiting: job.started_at && Date.parse(job.created_at) > Date.parse(job.started_at) ? null : seconds(job.created_at, job.started_at),
    waitingIssue: job.started_at && Date.parse(job.created_at) > Date.parse(job.started_at) ? 'copied-rerun-timestamps' : null,
    setup: complete ? seconds(job.started_at, first) : null,
    running: complete ? seconds(first, last) : null,
    cleanup: complete ? seconds(last, job.completed_at) : null,
    duration: job.status === 'completed' ? seconds(job.started_at, job.completed_at) : null,
  };
  if (complete && row.setup + row.running + row.cleanup !== row.duration) throw new Error(`Partition does not sum: ${job.id}`);
  return row;
}

export function summarize(runs, jobsByRun) {
  const rows = runs.flatMap((run) => jobsByRun.get(run.id).map((job) => jobTiming(run, job)));
  const count = (values) => Object.fromEntries([...new Set(values)].sort().map((v) => [String(v), values.filter((x) => x === v).length]));
  const jobs = [];
  for (const name of [...new Set(rows.map((r) => r.name))].sort()) {
    for (const event of [...new Set(rows.filter((r) => r.name === name).map((r) => r.event))].sort()) {
      const selected = rows.filter((r) => r.name === name && r.event === event);
      for (const conclusion of [...new Set(selected.map((r) => r.conclusion))].sort()) {
        const group = selected.filter((r) => r.conclusion === conclusion);
        jobs.push({ name, event, conclusion, count: group.length, ...Object.fromEntries(['waiting', 'setup', 'running', 'cleanup', 'duration'].map((key) => [key, distribution(group.map((r) => r[key]))])) });
      }
    }
  }
  const feedback = [];
  for (const event of [...new Set(runs.map((r) => r.event))].sort()) {
    for (const conclusion of ['success', 'failure', 'cancelled']) {
      const selected = runs.filter((r) => r.event === event && r.conclusion === conclusion);
      const values = selected.map((run) => {
        const jobs = jobsByRun.get(run.id);
        // A run update is not its finish time. Use the last completed job instead.
        const ends = jobs.filter((j) => j.status === 'completed' && j.completed_at).map((j) => j.completed_at).sort();
        return seconds(run.created_at, ends.at(-1));
      });
      feedback.push({ event, conclusion, ...distribution(values) });
    }
  }
  return {
    runCount: runs.length, jobCount: rows.length,
    from: runs.at(-1)?.created_at, to: runs[0]?.created_at,
    conclusions: count(runs.map((r) => r.conclusion)), events: count(runs.map((r) => r.event)),
    attempts: count(runs.map((r) => r.run_attempt)),
    // Latest attempts only. Running jobs have no final billable duration yet.
    roundedRunnerMinutes: rows.reduce((sum, r) => sum + (r.duration === null ? 0 : Math.ceil(r.duration / 60)), 0),
    feedback, jobs, rows,
  };
}

function api(path) {
  return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
}

async function collect(repo, directory, limit) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Expected owner/repository');
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Run count must be positive');
  await mkdir(directory, { recursive: true });
  const runs = [];
  for (let page = 1; runs.length < limit; page++) {
    const result = api(`repos/${repo}/actions/workflows/ci.yml/runs?per_page=100&page=${page}`);
    runs.push(...result.workflow_runs.slice(0, limit - runs.length));
    if (!result.workflow_runs.length) break;
  }
  if (runs.length !== limit) throw new Error(`Requested ${limit} runs; received ${runs.length}`);
  await writeFile(resolve(directory, 'runs.json'), JSON.stringify(runs, null, 2) + '\n');
  for (const run of runs) {
    const jobs = [];
    for (let page = 1; ; page++) {
      const result = api(`repos/${repo}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100&page=${page}`);
      jobs.push(...result.jobs);
      if (jobs.length === result.total_count) break;
      if (!result.jobs.length || jobs.length > result.total_count) throw new Error(`Incomplete job pages for ${run.id}`);
    }
    await writeFile(resolve(directory, `jobs-${run.id}-${run.run_attempt}.json`), JSON.stringify({ total_count: jobs.length, jobs }, null, 2) + '\n');
  }
}

async function main(args) {
  const [command, directory, repo = 'Savar-G/unica-learning', rawLimit = '150'] = args;
  if (!directory || !['collect', 'report'].includes(command)) throw new Error('Usage: node scripts/ci-audit.mjs collect|report DIRECTORY [OWNER/REPO] [COUNT]');
  if (command === 'collect') await collect(repo, directory, Number(rawLimit));
  const runs = JSON.parse(await readFile(resolve(directory, 'runs.json'), 'utf8'));
  const jobsByRun = new Map();
  for (const run of runs) {
    const result = JSON.parse(await readFile(resolve(directory, `jobs-${run.id}-${run.run_attempt}.json`), 'utf8'));
    if (result.jobs.length !== result.total_count) throw new Error(`Incomplete jobs for ${run.id}`);
    jobsByRun.set(run.id, result.jobs);
  }
  const report = summarize(runs, jobsByRun);
  await writeFile(resolve(directory, 'audit.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ ...report, rows: undefined }, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
