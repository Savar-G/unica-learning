// Root runs after review. Disposable local PostgreSQL only. No inference or hosted address is accepted.
const { Client } = require('pg');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const path = require('node:path');
const socket = process.env.SCAN_MARKING_SOCKET;
const database = process.env.SCAN_MARKING_DATABASE;
if (!socket?.startsWith('/tmp/pd542-pg-') || !database?.startsWith('pd542_')) throw Error('Disposable pd542 Unix socket and database required');
const sql = name => readFileSync(path.join(__dirname, '../migrations', name), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const open = async () => { const c = new Client({ host: socket, database, user: process.env.USER }); await c.connect(); await c.query("set statement_timeout='8s'"); return c; };
(async () => {
  const db = await open(), a = await open(), b = await open();
  try {
    if (process.argv.includes('--bootstrap')) {
      for (const role of ['anon', 'authenticated', 'service_role']) if (!(await db.query('select 1 from pg_roles where rolname=$1', [role])).rowCount) await db.query(`create role ${role}`);
      const base = sql('20261105_scan_marking.sql');
      for (const table of ['scan_marking_prices', 'scan_marking_spend']) {
        const definition = base.match(new RegExp('create table public\\.' + table + ' \\([\\s\\S]*?\n\\);'));
        assert(definition); await db.query(definition[0]);
      }
      await db.query(sql('20261106_scan_marking_evaluation.sql'));
    }
    let passed = 0;
    const model = 'anthropic/claude-sonnet-5.5', endpoint = 'google-vertex/global', evidence = hash('synthetic-reviewed-price');
    const reset = async (maximum = 6000000) => {
      await db.query('truncate scan_marking_evaluation_attempts,scan_marking_evaluations,scan_marking_spend,scan_marking_evaluation_prices');
      await db.query("insert into scan_marking_evaluation_prices(model,endpoint,evidence_hash,maximum_micros,max_pixels,evidence,verified_at,enabled) values($1,$2,$3,$4,1400000,'SYNTHETIC UNIT BOUND',now(),true)", [model, endpoint, evidence, maximum]);
    };
    const admit = async (c, attempt, run = 'run', cap = 15000000, maximum = 6000000) => (await c.query('select reserve_scan_marking_evaluation($1,$2,$3,$4,$5,$6,$7,$8) v', [hash(run), hash(attempt), model, endpoint, evidence, 1400000, maximum, cap])).rows[0].v;
    const settle = async (id, cost) => (await db.query('select settle_scan_marking_evaluation($1,$2) v', [id, cost])).rows[0].v;
    const test = async (name, fn) => { await reset(); await fn(); passed++; console.log('PASS', name); };
    await test('disabled bound refuses without a hold', async () => {
      await db.query('update scan_marking_evaluation_prices set enabled=false');
      assert.equal((await admit(a, 'disabled')).refused, 'price-unverified');
      assert.equal((await db.query('select count(*) n from scan_marking_spend')).rows[0].n, '0');
    });
    await test('unknown cost, idempotency and immutable run cap', async () => {
      const first = await admit(a, 'one'); assert(first.id); assert.equal(await settle(first.id, null), true);
      assert.equal((await admit(b, 'one')).refused, 'existing-attempt-no-redispatch');
      assert.equal((await admit(b, 'changed', 'run', 14000000)).refused, 'run-cap-changed');
      assert((await admit(a, 'two')).id); assert.equal((await admit(b, 'three')).refused, 'run-budget');
      assert.equal((await db.query('select sum(coalesce(charged_micros,reserved_micros)) n from scan_marking_spend')).rows[0].n, '12000000');
    });
    await test('settlement uses explicit transport cost, keeps unknown and refuses invalid or changed charges', async () => {
      const { id } = await admit(a, 'one'); assert.equal(await settle(id, -1), false); assert.equal(await settle(id, 6000001), false);
      assert.equal(await settle(id, null), true); assert.equal(await settle(id, 1250), true); assert.equal(await settle(id, 1250), true); assert.equal(await settle(id, 0), false);
      assert.equal((await db.query('select charged_micros::text v from scan_marking_spend where id=$1', [id])).rows[0].v, '1250');
    });
    await test('family spend and evaluation share the same UTC month ledger', async () => {
      await db.query("insert into scan_marking_spend(period,model,reserved_micros) values(date_trunc('month',clock_timestamp() at time zone 'UTC')::date,$1,49000000)", [model]);
      assert.equal((await admit(a, 'blocked')).refused, 'shared-month-budget');
    });
    await test('key lifetime hold survives UTC month rollover', async () => {
      await db.query("insert into scan_marking_spend(period,model,reserved_micros) values((date_trunc('month',clock_timestamp() at time zone 'UTC')-interval '1 month')::date,$1,49000000)", [model]);
      assert.equal((await admit(a, 'blocked')).refused, 'key-total-budget');
    });
    await test('two concurrent admissions cannot exceed one run cap', async () => {
      const both = await Promise.all([admit(a, 'a', 'concurrent', 10000000), admit(b, 'b', 'concurrent', 10000000)]);
      assert.equal(both.filter(r => r.id).length, 1); assert.equal(both.filter(r => r.refused === 'run-budget').length, 1);
    });
    await test('production global lock blocks evaluation until committed family spend is visible', async () => {
      await a.query('begin');
      await a.query("select pg_advisory_xact_lock(hashtextextended('scan-marking-global-budget',0))");
      const waiting = admit(b, 'waited');
      await a.query("insert into scan_marking_spend(period,model,reserved_micros) values(date_trunc('month',clock_timestamp() at time zone 'UTC')::date,$1,49000000)", [model]);
      await a.query('commit'); assert.equal((await waiting).refused, 'shared-month-budget');
    });
    await test('browser roles have no admission, settlement, direct table write or read permission', async () => {
      for (const role of ['anon', 'authenticated']) {
        await a.query(`set role ${role}`);
        try { await assert.rejects(() => admit(a, role), /permission denied/); await assert.rejects(() => a.query('select * from scan_marking_evaluation_attempts'), /permission denied/); }
        finally { await a.query('reset role'); }
      }
      await a.query('set role service_role');
      try { assert((await admit(a, 'service')).id); await assert.rejects(() => a.query('delete from scan_marking_evaluation_attempts'), /permission denied/); }
      finally { await a.query('reset role'); }
    });
    console.log(`SCAN_MARKING_EVALUATION_SQL_OK ${passed} cases`);
  } finally { await Promise.all([db.end(), a.end(), b.end()]); }
})().catch(error => { console.error(error); process.exitCode = 1; });
