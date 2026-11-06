// Run the original evaluation probe with --bootstrap first, on this disposable local database.
const { Client } = require('pg');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const path = require('node:path');
const socket = process.env.SCAN_MARKING_SOCKET, database = process.env.SCAN_MARKING_DATABASE;
if (!socket?.startsWith('/tmp/pd542-pg-') || !database?.startsWith('pd542_')) throw Error('Disposable pd542 Unix socket and database required');
const hash = value => createHash('sha256').update(value).digest('hex');
const fixture = JSON.parse(readFileSync(path.join(__dirname, '../../data/scan-marking-endpoint-evidence-20261106.json')));
const model = 'z-ai/glm-5.3-flash', endpoint = 'wafer/us';
const original = () => ({ model, endpoint: fixture.snapshots[model].data.endpoints.find(e => e.tag === endpoint),
  excludedEndpoints: [], zdrListed: true, safetyRetention: false, policy: 'strict-zdr',
  source: `https://openrouter.ai/api/v1/models/${model}/endpoints`, snapshotHash: hash('snapshot'), zdrHash: hash('zdr') });
const maximum = e => {
  const tiers = [e.endpoint.pricing, ...(e.endpoint.pricing.overrides ?? [])];
  const rate = fields => Math.max(...tiers.flatMap(t => fields.map(f => Number(t[f] ?? 0))));
  return Math.ceil(((e.endpoint.max_prompt_tokens ?? e.endpoint.context_length) * rate(['prompt', 'image', 'input_cache_write', 'input_cache_write_1h']) + 4096 * rate(['completion', 'internal_reasoning'])) * 1e6);
};
const open = async () => { const c = new Client({ host: socket, database, user: process.env.USER }); await c.connect(); await c.query("set statement_timeout='8s'"); return c; };
(async () => {
  const db = await open(), a = await open(), b = await open();
  const approved = original(), details = JSON.stringify(approved), approvedHash = hash(details);
  const reset = async () => {
    await db.query('truncate scan_marking_evaluation_attempts,scan_marking_evaluations,scan_marking_spend,scan_marking_evaluation_prices');
    await db.query('insert into scan_marking_evaluation_prices(model,endpoint,evidence_hash,maximum_micros,max_pixels,evidence,verified_at,enabled) values($1,$2,$3,$4,2103750,$5,now(),true)', [model, endpoint, approvedHash, maximum(approved), details]);
  };
  const refresh = async (c, e, overrides = {}) => {
    const body = JSON.stringify(e), args = { model, endpoint, prior: approvedHash, evidence: hash(body), maximum: maximum(e), body, ...overrides };
    return (await c.query('select refresh_scan_marking_evaluation_price($1,$2,$3,$4,$5,$6) v', [args.model, args.endpoint, args.prior, args.evidence, args.maximum, args.body])).rows[0].v;
  };
  const admit = async (c, e, attempt, run = 'run', overrides = {}) => {
    const args = { evidence: hash(JSON.stringify(e)), maximum: maximum(e), cap: 15000000, pixels: 2103750, ...overrides };
    return (await c.query('select reserve_scan_marking_evaluation_checked($1,$2,$3,$4,$5,$6,$7,$8) v', [hash(run), hash(attempt), model, endpoint, args.evidence, args.pixels, args.maximum, args.cap])).rows[0].v;
  };
  const changed = () => { const e = structuredClone(approved); e.endpoint.pricing.prompt = '0.0000000812'; e.endpoint.pricing.completion = '0.000000424'; e.snapshotHash = hash('fresh snapshot'); e.zdrHash = hash('fresh zdr'); return e; };
  let passed = 0;
  const test = async (name, fn) => { await reset(); await fn(); passed++; console.log('PASS', name); };
  try {
    await db.query(readFileSync(path.join(__dirname, '../migrations/20261106220640_scan_marking_evaluation_price_refresh.sql'), 'utf8'));
    await test('price-only refresh genuinely dispatches through exact new hash and new bound', async () => {
      await a.query('set role service_role');
      try {
        const e = changed(); assert(maximum(e) > maximum(approved));
        assert.equal((await admit(a, e, 'not-yet')).refused, 'price-unverified');
        assert.deepEqual(await refresh(a, e), { verified: true });
        assert.equal((await admit(a, e, 'old-bound', 'run', { maximum: maximum(approved) })).refused, 'price-unverified');
        const r = await admit(a, e, 'new-bound'); assert(r.id);
        const row = (await db.query('select p.maximum_micros::text maximum,s.reserved_micros::text reserved,a.evidence_hash from scan_marking_evaluation_attempts a join scan_marking_spend s on s.id=a.dispatch_id join scan_marking_evaluation_prices p on p.evidence_hash=a.evidence_hash')).rows[0];
        assert.equal(row.maximum, String(maximum(e))); assert.equal(row.reserved, row.maximum); assert.equal(row.evidence_hash, hash(JSON.stringify(e)));
      } finally { await a.query('reset role'); }
    });
    await test('disabled or absent reviewed anchor never enables itself', async () => {
      await db.query('update scan_marking_evaluation_prices set enabled=false');
      assert.equal((await refresh(a, changed())).refused, 'reviewed-price-missing');
      assert.equal((await db.query('select count(*) n from scan_marking_evaluation_prices where enabled')).rows[0].n, '0');
    });
    await test('wrong evidence hash and under-reservation cannot enable a new price', async () => {
      const e = changed(); assert.equal((await refresh(a, e, { evidence: hash('wrong') })).refused, 'invalid-price-evidence');
      assert.equal((await refresh(a, e, { maximum: maximum(e) - 1 })).refused, 'price-bound-mismatch');
      assert.equal((await refresh(a, e, { maximum: maximum(e) + 2 })).refused, 'price-bound-mismatch');
      assert.equal((await db.query('select count(*) n from scan_marking_evaluation_prices')).rows[0].n, '1');
    });
    for (const field of ['provider', 'tag', 'quantization', 'zdr', 'retention', 'schema', 'status', 'suffix', 'context']) {
      await test(`policy change ${field} refuses only its new evidence`, async () => {
        const e = changed();
        if (field === 'provider') e.endpoint.provider_name = 'Cohere';
        if (field === 'tag') e.endpoint.tag = 'other/host';
        if (field === 'quantization') e.endpoint.quantization = 'unknown';
        if (field === 'zdr') { e.zdrListed = false; e.policy = 'not-zdr'; }
        if (field === 'retention') { e.safetyRetention = true; e.policy = 'safety-retention'; }
        if (field === 'schema') e.endpoint.supported_parameters = ['response_format'];
        if (field === 'status') e.endpoint.status = -2;
        if (field === 'suffix') e.excludedEndpoints = ['wafer/us/flex'];
        if (field === 'context') e.endpoint.context_length += 1;
        assert((await refresh(a, e)).refused); assert((await admit(a, approved, field)).id);
      });
    }
    await test('tiers, cache writes, image and reasoning prices bind the conservative bound', async () => {
      const e = changed(); e.endpoint.pricing.overrides = [{ prompt: '0.000003', completion: '0.000004', input_cache_write_1h: '0.000006', image: '0.000005', internal_reasoning: '0.000007' }];
      assert.deepEqual(await refresh(a, e), { verified: true });
      assert.equal((await refresh(a, e, { maximum: 100 })).refused, 'price-bound-mismatch');
      assert((await admit(a, e, 'tiers')).id);
    });
    await test('unknown liability stops a different run until a real settlement arrives', async () => {
      const first = await admit(a, approved, 'unknown'); assert(first.id);
      assert.equal((await admit(b, approved, 'other', 'other-run')).refused, 'unresolved-evaluation-cost');
      await db.query('select settle_scan_marking_evaluation($1,null)', [first.id]);
      assert.equal((await admit(b, approved, 'other', 'other-run')).refused, 'unresolved-evaluation-cost');
      assert.equal((await db.query('select charged_micros v from scan_marking_spend where id=$1', [first.id])).rows[0].v, null);
      await db.query('select settle_scan_marking_evaluation($1,1234)', [first.id]);
      assert((await admit(b, approved, 'other', 'other-run')).id);
    });
    await test('refreshed prices preserve run, monthly and lifetime caps', async () => {
      const e = changed(); assert.deepEqual(await refresh(a, e), { verified: true });
      assert.equal((await admit(a, e, 'run', 'run', { cap: maximum(e) - 1 })).refused, 'run-budget');
      assert.equal((await admit(a, e, 'too-high', 'run', { cap: 15000001 })).refused, 'invalid-admission');
      for (const period of ["date_trunc('month',now() at time zone 'UTC')::date", "(date_trunc('month',now() at time zone 'UTC')-interval '1 month')::date"]) {
        await db.query('truncate scan_marking_spend cascade');
        await db.query(`insert into scan_marking_spend(period,model,reserved_micros,charged_micros) values(${period},$1,49999999,49999999)`, [model]);
        assert.equal((await admit(a, e, period, period)).refused, period.includes('interval') ? 'key-total-budget' : 'shared-month-budget');
      }
    });
    await test('concurrent refresh and admissions keep exact evidence and global liability serialization', async () => {
      const e = changed(); const refreshes = await Promise.all([refresh(a, e), refresh(b, e)]); assert(refreshes.every(r => r.verified));
      const both = await Promise.all([admit(a, e, 'a'), admit(b, e, 'b')]);
      assert.equal(both.filter(r => r.id).length, 1); assert.equal(both.filter(r => r.refused === 'unresolved-evaluation-cost').length, 1);
    });
    await test('browser roles cannot use either RPC and service role cannot write tables directly', async () => {
      for (const role of ['anon', 'authenticated']) {
        await a.query(`set role ${role}`);
        try { await assert.rejects(() => refresh(a, changed()), /permission denied/); await assert.rejects(() => admit(a, approved, role), /permission denied/); }
        finally { await a.query('reset role'); }
      }
      await a.query('set role service_role');
      try {
        assert.deepEqual(await refresh(a, changed()), { verified: true });
        await assert.rejects(() => a.query('update scan_marking_evaluation_prices set enabled=true'), /permission denied/);
        await assert.rejects(() => a.query('delete from scan_marking_evaluation_prices'), /permission denied/);
      } finally { await a.query('reset role'); }
    });
    console.log(`SCAN_MARKING_PRICE_REFRESH_SQL_OK ${passed} cases`);
  } finally { await Promise.all([db.end(), a.end(), b.end()]); }
})().catch(error => { console.error(error); process.exitCode = 1; });
