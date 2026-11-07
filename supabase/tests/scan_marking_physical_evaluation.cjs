// Root runs this probe after review, in a new disposable local database only.
const { Client } = require('pg');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const path = require('node:path');
const socket = process.env.SCAN_MARKING_SOCKET, database = process.env.SCAN_MARKING_DATABASE;
if (!socket?.startsWith('/tmp/pd542-pg-') || !database?.startsWith('pd542_physical_')) throw Error('New disposable pd542_physical_ database and Unix socket required');
const migration = file => readFileSync(path.join(__dirname, '../migrations', file), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const open = async () => { const c = new Client({ host: socket, database, user: process.env.USER }); await c.connect(); await c.query("set statement_timeout='8s'"); return c; };
(async () => {
  const db = await open(), a = await open(), b = await open();
  try {
    if (!process.argv.includes('--bootstrap')) throw Error('Use --bootstrap on an empty database');
    for (const role of ['anon', 'authenticated', 'service_role']) if (!(await db.query('select 1 from pg_roles where rolname=$1', [role])).rowCount) await db.query(`create role ${role}`);
    const base = migration('20261105_scan_marking.sql');
    for (const table of ['scan_marking_prices', 'scan_marking_spend']) {
      const definition = base.match(new RegExp('create table public\\.' + table + ' \\([\\s\\S]*?\n\\);')); assert(definition); await db.query(definition[0]);
    }
    await db.query(migration('20261106_scan_marking_evaluation.sql'));
    await db.query(migration('20261107015353_scan_marking_evaluation_clean429.sql'));
    const oldFunctions = (await db.query("select oid::regprocedure::text n,md5(prosrc) h from pg_proc where proname in ('reserve_scan_marking_evaluation','reserve_scan_marking_evaluation_checked','settle_scan_marking_evaluation','defer_scan_marking_evaluation') order by 1")).rows;
    await db.query(migration('20261107_scan_marking_physical_evaluation.sql'));
    assert.deepEqual((await db.query("select oid::regprocedure::text n,md5(prosrc) h from pg_proc where proname in ('reserve_scan_marking_evaluation','reserve_scan_marking_evaluation_checked','settle_scan_marking_evaluation','defer_scan_marking_evaluation') order by 1")).rows, oldFunctions);
    const model = 'anthropic/claude-sonnet-5.5', endpoint = 'google-vertex/global', evidence = hash('local-synthetic-bound'); let tests = 0;
    const reset = async () => {
      await db.query('truncate scan_marking_evaluation_deferrals,scan_marking_evaluation_attempts,scan_marking_evaluations,scan_marking_spend,scan_marking_evaluation_prices');
      await db.query("insert into scan_marking_evaluation_prices(model,endpoint,evidence_hash,maximum_micros,max_pixels,evidence,verified_at,enabled) values($1,$2,$3,2000000,1400000,'LOCAL SYNTHETIC BOUND',now(),true)", [model, endpoint, evidence]);
    };
    const admit = async (c, label, run = label) => (await c.query('select reserve_scan_marking_physical_evaluation_checked($1,$2,$3,$4,$5,1400000,2000000,15000000) v', [hash(run), hash(label), model, endpoint, evidence])).rows[0].v;
    const production = async (amount, charged = amount) => db.query("insert into scan_marking_spend(period,model,reserved_micros,charged_micros) values('2020-01-01',$1,$2,$3)", [model, amount, charged]);
    const test = async (name, fn) => { await reset(); await fn(); tests++; console.log('PASS', name); };
    await test('reads current all-time charges, including production test spend', async () => {
      await production(14000000); assert.equal((await admit(a, 'over')).refused, 'aggregate-marking-test-budget');
      await db.query('update scan_marking_spend set charged_micros=12000000');
      const accepted = await admit(a, 'after-current-liability-change'); assert(accepted.id); assert.equal(accepted.prior_liability_micros, 12000000);
    });
    await test('unknown production result stops dispatch', async () => { await production(1, null); assert.equal((await admit(a, 'unknown')).refused, 'unresolved-marking-cost'); });
    await test('unclassified evaluation hold stops a different run', async () => {
      assert((await admit(a, 'first')).id); assert.equal((await admit(b, 'second')).refused, 'unresolved-marking-cost');
    });
    await test('clean429 retained hold stays in aggregate liability', async () => {
      await production(12000000); const run = hash('clean429'), attempt = hash('deferred'), admitted = await admit(a, 'deferred', 'clean429'); assert(admitted.id);
      const envelope = { error: { code: 429, message: 'Local synthetic rate limit' } };
      const response = { status: 429, body: JSON.stringify(envelope), envelope, openrouter_metadata: null };
      assert.equal((await a.query('select defer_scan_marking_evaluation($1,$2,$3,$4,$5) v', [run, attempt, admitted.id, response, Date.now()])).rows[0].v, true);
      assert.equal((await admit(b, 'retry-after-hold')).refused, 'aggregate-marking-test-budget');
      assert.equal((await db.query('select sum(coalesce(charged_micros,reserved_micros))::text n from scan_marking_spend')).rows[0].n, '14000000');
    });
    await test('one production lock serializes concurrent physical runs', async () => {
      await production(12000000); await a.query('begin'); await a.query("select pg_advisory_xact_lock(hashtextextended('scan-marking-global-budget',0))");
      const waiting = admit(b, 'waiting');
      await a.query('update scan_marking_spend set charged_micros=14000000,reserved_micros=14000000'); await a.query('commit');
      assert.equal((await waiting).refused, 'aggregate-marking-test-budget');
      assert.equal((await db.query('select count(*)::int n from scan_marking_evaluation_attempts')).rows[0].n, 0);
    });
    await test('browser roles cannot call physical admission', async () => {
      for (const role of ['anon', 'authenticated']) { await a.query(`set role ${role}`); try { await assert.rejects(() => admit(a, role), /permission denied/); } finally { await a.query('reset role'); } }
      await a.query('set role service_role'); try { assert((await admit(a, 'service-only')).id); } finally { await a.query('reset role'); }
    });
    console.log(`SCAN_MARKING_PHYSICAL_EVALUATION_SQL_OK ${tests} cases`);
  } finally { await Promise.all([db.end(), a.end(), b.end()]); }
})().catch(e => { console.error(e); process.exitCode = 1; });
