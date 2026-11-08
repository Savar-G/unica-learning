// Disposable Unix-socket PostgreSQL only. No credentials, inference or hosted address.
const { Client } = require('pg');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const path = require('node:path');
const socket = process.env.SCAN_MARKING_SOCKET, database = process.env.SCAN_MARKING_DATABASE;
if (!socket?.startsWith('/tmp/pd542-pg-') || !database?.startsWith('pd542_')) throw Error('Disposable pd542 Unix socket and database required');
const hash = v => createHash('sha256').update(v).digest('hex');
const sql = name => readFileSync(path.join(__dirname, '../migrations', name), 'utf8');
const open = async () => { const c = new Client({ host: socket, database, user: process.env.USER }); await c.connect(); await c.query("set statement_timeout='8s'"); return c; };
(async () => {
  const db = await open(), a = await open(), b = await open();
  let passed = 0;
  try {
    if (process.argv.includes('--bootstrap')) {
      for (const role of ['anon', 'authenticated', 'service_role']) if (!(await db.query('select 1 from pg_roles where rolname=$1', [role])).rowCount) await db.query(`create role ${role}`);
      for (const table of ['scan_marking_prices', 'scan_marking_spend']) {
        const definition = sql('20261105_scan_marking.sql').match(new RegExp('create table public\\.' + table + ' \\([\\s\\S]*?\n\\);'));
        assert(definition); await db.query(definition[0]);
      }
      await db.query(sql('20261106_scan_marking_evaluation.sql'));
      await db.query(sql('20261106220640_scan_marking_evaluation_price_refresh.sql'));
    }
    const model = 'z-ai/glm-5.3-flash', endpoint = 'wafer/us', evidence = hash('reviewed fixture price');
    const reset = async () => {
      await db.query('truncate scan_marking_evaluation_deferrals,scan_marking_evaluation_attempts,scan_marking_evaluations,scan_marking_spend,scan_marking_evaluation_prices');
      await db.query("insert into scan_marking_evaluation_prices(model,endpoint,evidence_hash,maximum_micros,max_pixels,evidence,verified_at,enabled) values($1,$2,$3,6000000,1400000,'FIXTURE',now(),true)", [model, endpoint, evidence]);
    };
    const admit = async (c, attempt, run = 'run', cap = 15000000) => (await c.query('select reserve_scan_marking_evaluation_checked($1,$2,$3,$4,$5,1400000,6000000,$6) v', [hash(run), hash(attempt), model, endpoint, evidence, cap])).rows[0].v;
    const envelope = () => ({ error: { code: 429, message: 'Rate limited', metadata: { provider_name: 'fixture', raw: '{"error":{"message":"rate limit"}}' } } });
    const response = () => { const e = envelope(); return { status: 429, body: JSON.stringify(e), envelope: e, openrouter_metadata: e.error.metadata }; };
    const defer = async (c, id, attempt, run = 'run', raw = response(), received = 1000000) => (await c.query('select defer_scan_marking_evaluation($1,$2,$3,$4,$5) v', [hash(run), hash(attempt), id, raw, received])).rows[0].v;
    const test = async (name, fn) => { await reset(); await fn(); passed++; console.log('PASS', name); };
    // Prior-source falsifier: the old checked RPC refuses the same valid bounded unknown hold.
    if (process.argv.includes('--bootstrap')) {
      await db.query("insert into scan_marking_evaluation_prices(model,endpoint,evidence_hash,maximum_micros,max_pixels,evidence,verified_at,enabled) values($1,$2,$3,6000000,1400000,'FIXTURE',now(),true)", [model, endpoint, evidence]);
      const first = await admit(a, 'prior'); assert(first.id);
      assert.equal((await admit(b, 'prior-next')).refused, 'unresolved-evaluation-cost');
      console.log('PRIOR_FALSIFIER checked RPC rejects the bounded unknown hold');
    }
    await db.query(sql('20261107015353_scan_marking_evaluation_clean429.sql'));
    await test('validated raw 429 allows a later reservation while both full holds stay counted', async () => {
      const first = await admit(a, 'first'); assert(first.id);
      assert.equal((await admit(b, 'before-classify')).refused, 'unresolved-evaluation-cost');
      await a.query('set role service_role');
      try { assert.equal(await defer(a, first.id, 'first'), true); } finally { await a.query('reset role'); }
      const second = await admit(b, 'second'); assert(second.id);
      assert.equal((await db.query('select sum(coalesce(charged_micros,reserved_micros)) v from scan_marking_spend')).rows[0].v, '12000000');
      assert.equal((await db.query('select count(*) n from scan_marking_spend where charged_micros is null')).rows[0].n, '2');
      assert.equal((await db.query('select response from scan_marking_evaluation_deferrals')).rows[0].response.body, response().body);
      assert.equal((await admit(a, 'unknown-still-fatal')).refused, 'unresolved-evaluation-cost');
    });
    for (const bad of ['status', 'code', 'usage', 'null-usage', 'generation', 'nested-generation', 'raw-usage', 'body', 'envelope', 'metadata', 'label', 'missing-message']) {
      await test(`refuse ${bad} without releasing the unknown hold`, async () => {
        const first = await admit(a, bad); assert(first.id); const raw = response();
        if (bad === 'status') raw.status = 503;
        if (bad === 'code') raw.envelope.error.code = 500;
        if (bad === 'usage') raw.envelope.usage = {};
        if (bad === 'null-usage') raw.envelope.usage = null;
        if (bad === 'generation') raw.envelope.id = 'gen-fixture';
        if (bad === 'nested-generation') raw.envelope.error.metadata.generation_id = 'gen-fixture';
        if (bad === 'raw-usage') raw.envelope.error.metadata.raw = '{"usage":{}}';
        if (bad === 'missing-message') delete raw.envelope.error.message;
        raw.body = JSON.stringify(raw.envelope);
        if (bad === 'body') raw.body = 'unreadable';
        if (bad === 'envelope') raw.envelope = {};
        if (bad === 'metadata') raw.openrouter_metadata = { untrusted: true };
        const sent = bad === 'label' ? { clean429: true } : raw;
        assert.equal(await defer(a, first.id, bad, 'run', sent), false);
        assert.equal((await admit(b, 'after-' + bad)).refused, 'unresolved-evaluation-cost');
        assert.equal((await db.query('select count(*) n from scan_marking_evaluation_deferrals')).rows[0].n, '0');
      });
    }
    await test('run, dispatch and attempt identities must all belong to the same reservation', async () => {
      const first = await admit(a, 'first'); assert(first.id);
      assert.equal(await defer(a, first.id, 'first', 'copied-run'), false);
      assert.equal(await defer(a, first.id, 'copied-attempt'), false);
      assert.equal(await defer(a, '00000000-0000-4000-8000-000000000000', 'first'), false);
      assert.equal((await admit(b, 'next')).refused, 'unresolved-evaluation-cost');
    });
    await test('duplicate classification is idempotent; changed evidence cannot replace it', async () => {
      const first = await admit(a, 'first'); assert(first.id);
      const both = await Promise.all([defer(a, first.id, 'first'), defer(b, first.id, 'first')]); assert.deepEqual(both, [true, true]);
      assert.equal(await defer(a, first.id, 'first', 'run', response(), 1000001), false);
      assert.equal((await db.query('select count(*) n from scan_marking_evaluation_deferrals')).rows[0].n, '1');
      assert.equal((await admit(a, 'first')).refused, 'existing-attempt-no-redispatch');
    });
    await test('classification rollback cannot authorize an unknown hold', async () => {
      const first = await admit(a, 'first'); await a.query('begin'); assert.equal(await defer(a, first.id, 'first'), true); await a.query('rollback');
      assert.equal((await admit(b, 'after-rollback')).refused, 'unresolved-evaluation-cost');
    });
    await test('concurrent checked reservations remain serialized after a clean hold', async () => {
      const first = await admit(a, 'first'); assert.equal(await defer(a, first.id, 'first'), true);
      const both = await Promise.all([admit(a, 'a'), admit(b, 'b')]);
      assert.equal(both.filter(v => v.id).length, 1); assert.equal(both.filter(v => v.refused === 'unresolved-evaluation-cost').length, 1);
      assert.equal((await db.query('select sum(coalesce(charged_micros,reserved_micros)) n from scan_marking_spend')).rows[0].n, '12000000');
    });
    await test('multiple classified holds bind the exact run cap and a retry needs a separate reservation', async () => {
      const one = await admit(a, 'initial', 'run', 12000000); assert.equal(await defer(a, one.id, 'initial'), true);
      const retry = await admit(b, 'final-batch', 'run', 12000000); assert(retry.id); assert.notEqual(retry.id, one.id); assert.equal(await defer(b, retry.id, 'final-batch'), true);
      assert.equal((await admit(a, 'third', 'run', 12000000)).refused, 'run-budget');
      assert.equal((await admit(a, 'changed-cap', 'run', 15000000)).refused, 'run-cap-changed');
      const count = (await db.query('select count(*) n from scan_marking_spend where charged_micros is null')).rows[0].n; assert.equal(count, '2');
    });
    await test('unknown non429 in a different run stays globally fatal beside clean holds', async () => {
      const one = await admit(a, 'initial'); assert.equal(await defer(a, one.id, 'initial'), true);
      const unknown = await admit(b, 'unknown', 'other-run'); assert(unknown.id);
      assert.equal((await admit(a, 'after', 'third-run')).refused, 'unresolved-evaluation-cost');
      assert.equal((await db.query('select settle_scan_marking_evaluation($1,null) v', [unknown.id])).rows[0].v, true);
      assert.equal((await admit(a, 'after-null', 'third-run')).refused, 'unresolved-evaluation-cost');
    });
    for (const period of ["date_trunc('month',clock_timestamp() at time zone 'UTC')::date", "(date_trunc('month',clock_timestamp() at time zone 'UTC')-interval '1 month')::date"]) {
      await test(`classified hold stays in ${period.includes('interval') ? 'lifetime' : 'UTC month'} cap`, async () => {
        const one = await admit(a, 'first'); assert.equal(await defer(a, one.id, 'first'), true);
        await db.query(`insert into scan_marking_spend(period,model,reserved_micros,charged_micros) values(${period},$1,38000001,38000001)`, [model]);
        assert.equal((await admit(b, 'blocked', 'another-run')).refused, period.includes('interval') ? 'key-total-budget' : 'shared-month-budget');
        await db.query('update scan_marking_spend set reserved_micros=38000000,charged_micros=38000000 where charged_micros=38000001');
        assert((await admit(b, 'boundary', 'another-run')).id);
      });
    }
    await test('no zero settlement is invented; actual later settlement replaces its hold once', async () => {
      const one = await admit(a, 'first'); assert.equal(await defer(a, one.id, 'first'), true);
      assert.equal((await db.query('select charged_micros from scan_marking_spend where id=$1', [one.id])).rows[0].charged_micros, null);
      assert.equal((await db.query('select settle_scan_marking_evaluation($1,1234) v', [one.id])).rows[0].v, true);
      assert.equal((await db.query('select settle_scan_marking_evaluation($1,0) v', [one.id])).rows[0].v, false);
      assert.equal((await db.query('select coalesce(charged_micros,reserved_micros) v from scan_marking_spend where id=$1', [one.id])).rows[0].v, '1234');
    });
    await test('RLS and permissions deny browser access, direct service writes and ledger deletion', async () => {
      const one = await admit(a, 'first'); assert.equal(await defer(a, one.id, 'first'), true);
      for (const role of ['anon', 'authenticated']) {
        await a.query(`set role ${role}`);
        try {
          await assert.rejects(() => defer(a, one.id, 'first'), /permission denied/);
          await assert.rejects(() => admit(a, role), /permission denied/);
          await assert.rejects(() => a.query('select * from scan_marking_evaluation_deferrals'), /permission denied/);
        } finally { await a.query('reset role'); }
      }
      await a.query('set role service_role');
      try {
        assert.equal(await defer(a, one.id, 'first'), true);
        assert.equal((await a.query('select count(*) n from scan_marking_evaluation_deferrals')).rows[0].n, '1');
        await assert.rejects(() => a.query('delete from scan_marking_evaluation_deferrals'), /permission denied/);
        await assert.rejects(() => a.query("update scan_marking_evaluation_deferrals set policy='clean429-v1'"), /permission denied/);
      } finally { await a.query('reset role'); }
      assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.scan_marking_evaluation_deferrals'::regclass")).rows[0].relrowsecurity, true);
      await assert.rejects(() => db.query('delete from scan_marking_evaluation_attempts'), /foreign key constraint/);
    });
    console.log(`SCAN_MARKING_CLEAN429_SQL_OK ${passed} cases`);
  } finally { await Promise.all([db.end(), a.end(), b.end()]); }
})().catch(error => { console.error(error); process.exitCode = 1; });
