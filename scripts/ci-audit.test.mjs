import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distribution, jobTiming, summarize } from './ci-audit.mjs';

const time = (second) => new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString();
const run = { id: 1, run_attempt: 1, event: 'pull_request', head_sha: 'abc', created_at: time(0), conclusion: 'success' };
const step = (name, start, end) => ({ name, status: 'completed', conclusion: 'success', started_at: time(start), completed_at: time(end) });
const job = {
  id: 2, name: 'unit', status: 'completed', conclusion: 'success', labels: ['ubuntu-24.04'],
  created_at: time(1), started_at: time(3), completed_at: time(30),
  steps: [step('Set up job', 3, 4), step('Run npm ci --no-audit', 4, 10), step('Run npm test', 10, 28), step('Complete job', 28, 30)],
};

test('nearest-rank percentiles retain the tail and omit unknown values', () => {
  assert.deepEqual(distribution([null]), { n: 0, p50: null, p95: null });
  assert.deepEqual(distribution(Array.from({ length: 20 }, (_, i) => i + 1)), { n: 20, p50: 10, p95: 19 });
});
test('queue, setup, work and cleanup partition the recorded interval', () => {
  const row = jobTiming(run, job);
  assert.deepEqual([row.waiting, row.setup, row.running, row.cleanup, row.duration], [2, 7, 18, 2, 27]);
  assert.equal(row.setup + row.running + row.cleanup, row.duration);
});
test('running and skipped jobs cannot become zero-duration successes', () => {
  const row = jobTiming(run, { ...job, status: 'in_progress', conclusion: null, completed_at: null });
  assert.equal(row.running, null);
  assert.equal(row.duration, null);
  const skipped = jobTiming(run, { ...job, conclusion: 'skipped', steps: [], started_at: null, completed_at: null });
  assert.equal(skipped.waiting, null);
  assert.equal(skipped.setup, null);
});
test('copied jobs from partial reruns have unknown queue time', () => {
  const row = jobTiming(run, { ...job, created_at: time(40) });
  assert.equal(row.waiting, null);
  assert.equal(row.waitingIssue, 'copied-rerun-timestamps');
  assert.equal(row.duration, 27);
});
test('failure and cancellation remain separate from success, split by event', () => {
  const failedRun = { ...run, id: 3, conclusion: 'failure' };
  const pushRun = { ...run, id: 4, event: 'push' };
  const report = summarize([run, failedRun, pushRun], new Map([
    [1, [job]], [3, [{ ...job, conclusion: 'failure' }]], [4, [job]],
  ]));
  assert.equal(report.jobCount, 3);
  assert.equal(report.jobs.length, 3);
  assert.equal(report.jobs.find((r) => r.event === 'pull_request' && r.conclusion === 'success').count, 1);
  assert.equal(report.feedback.find((r) => r.event === 'pull_request' && r.conclusion === 'failure').p50, 30);
  assert.equal(report.roundedRunnerMinutes, 3);
});
test('corrupt work timestamps fail instead of becoming a fast pass', () => {
  assert.throws(() => jobTiming(run, { ...job, completed_at: time(20) }), /Invalid interval/);
});
