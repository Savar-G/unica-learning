import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { workbookAnthropicBudget } from './workbook-anthropic-budget.mjs';
const url = 'https://api.anthropic.com/v1/messages';
const request = () => ({ method: 'POST', body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 16000, system: 'test', messages: [] }) });
const countFetch = async () => Response.json({ input_tokens: 100 });
const answer = () => Response.json({ model: 'claude-sonnet-5-5', usage: { input_tokens: 100, output_tokens: 20 } });
async function setup(t, limitUsd = 35) {
  const dir = await mkdtemp(join(tmpdir(), 'workbook-budget-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'budget.json');
  return { file, budget: await workbookAnthropicBudget({ file, childId: 'authorized-child', limitUsd, countFetch }) };
}
test('settles usage and preserves the same ledger across restarts', async t => {
  const { budget, file } = await setup(t); await budget.wrap(async () => answer())(url, request());
  assert.equal((await budget.state()).spentUsd, .0004);
  const reloaded = await workbookAnthropicBudget({ file, childId: 'authorized-child', limitUsd: 35, countFetch });
  assert.equal((await reloaded.state()).spentUsd, .0004);
  await assert.rejects(workbookAnthropicBudget({ file, childId: 'other-child', limitUsd: 35, countFetch }), /invalid/);
});
test('refuses a request before dispatch when its reservation exceeds the cap', async t => {
  const { budget } = await setup(t, .01); let dispatched = 0;
  await assert.rejects(budget.wrap(async () => { dispatched++; return answer(); })(url, request()), /budget/);
  assert.equal(dispatched, 0);
});
test('counts concurrent reservations atomically across clients', async t => {
  const { budget, file } = await setup(t, .3);
  const other = await workbookAnthropicBudget({ file, childId: 'authorized-child', limitUsd: .3, countFetch });
  let release; const hold = new Promise(resolve => { release = resolve; });
  const pending = budget.wrap(async () => { await hold; return answer(); })(url, request());
  while (!(await budget.state()).reservedUsd) await new Promise(resolve => setTimeout(resolve, 5));
  await assert.rejects(other.wrap(async () => answer())(url, request()), /budget/);
  release(); await pending;
});
test('retains unknown billing and does not reset it on restart', async t => {
  const { budget, file } = await setup(t, .2);
  await assert.rejects(budget.wrap(async () => { throw Error('lost connection'); })(url, request()), /lost/);
  const other = await workbookAnthropicBudget({ file, childId: 'authorized-child', limitUsd: .2, countFetch });
  assert.ok((await other.state()).reservedUsd > 0);
  await assert.rejects(other.wrap(async () => answer())(url, request()), /budget/);
  assert.match(await readFile(file, 'utf8'), /reserved/);
});
test('releases a documented unbilled schema validation rejection', async t => {
  const { budget } = await setup(t, .2);
  await budget.wrap(async () => Response.json({ type: 'error', error: { type: 'invalid_request_error' } }, { status: 400 }))(url, request());
  assert.equal((await budget.state()).reservedUsd, 0);
  await budget.wrap(async () => answer())(url, request());
});
test('rejects other endpoints, unpriced models and cancelled requests', async t => {
  const { budget } = await setup(t); let sent = 0; const send = budget.wrap(async () => { sent++; return answer(); });
  await assert.rejects(send('https://example.com', request()), /endpoint/);
  await assert.rejects(send(url, { ...request(), body: JSON.stringify({ model: 'another-account-model', max_tokens: 16000 }) }), /Unpriced/);
  const stop = new AbortController(); stop.abort();
  await assert.rejects(send(url, { ...request(), signal: stop.signal })); assert.equal(sent, 0);
});
test('rejects prototype property names as unpriced models', async t => {
  const { budget } = await setup(t);
  await assert.rejects(budget.wrap(async () => answer())(url, { ...request(), body: JSON.stringify({ model: 'constructor', max_tokens: 16000 }) }), /Unpriced/);
});
test('halts future dispatch when returned pricing identity is unknown', async t => {
  const { budget } = await setup(t);
  await assert.rejects(budget.wrap(async () => Response.json({ model: 'unknown-model', usage: { input_tokens: 100, output_tokens: 20 } }))(url, request()), /halted/);
  let sent = 0;
  await assert.rejects(budget.wrap(async () => { sent++; return answer(); })(url, request()), /invalid/);
  assert.equal(sent, 0);
});
for (const usage of [{}, { input_tokens: null, output_tokens: null }]) {
  test(`keeps unknown billing reserved for malformed required usage ${JSON.stringify(usage)}`, async t => {
    const { budget, file } = await setup(t);
    await assert.rejects(budget.wrap(async () => Response.json({ model: 'claude-sonnet-5-5', usage }))(url, request()), /halted/);
    const saved = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(saved.spentUsd, 0);
    assert.equal(saved.calls[0].status, 'reserved');
    assert.ok(saved.calls[0].reservedUsd > 0);
    let sent = 0;
    await assert.rejects(budget.wrap(async () => { sent++; return answer(); })(url, request()), /invalid/);
    assert.equal(sent, 0);
  });
}
