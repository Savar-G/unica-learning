// Owns a disposable socket-only PostgreSQL cluster. No hosted URL or credential input.
// NODE_PATH may point to a temporary installation of the repository's pinned pg@8.16.3.
const { Client } = require('pg');
const { mkdtempSync, readFileSync } = require('node:fs');
const { execFileSync, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { userInfo } = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const pgBin = process.env.SCAN_MARKING_PG_BIN || '/opt/homebrew/opt/postgresql@18/bin';
const socket = mkdtempSync('/tmp/pd542-pg-full-');
const data = path.join(socket, 'data'), port = 55446, user = userInfo().username;
const childEnv = { PATH: process.env.PATH, HOME: process.env.HOME, USER: user, LC_ALL: 'C', NODE_PATH: process.env.NODE_PATH };
const hash = v => createHash('sha256').update(v).digest('hex');
const sql = name => readFileSync(path.join(__dirname, '../migrations', name), 'utf8');
const migration = sql('20261107034950_scan_marking_evaluation_full_reservation.sql');
const runPg = (name, args) => execFileSync(path.join(pgBin, name), args, { env: childEnv, encoding: 'utf8' });
let started = false;
const clients = [];
const open = async database => {
  const c = new Client({ host: socket, port, database, user, password: '', application_name: 'evaluation-full-reservation-probe' });
  await c.connect(); clients.push(c);
  await c.query("set statement_timeout='8s'");
  return c;
};
const model = 'xiaomi/mimo-v2.6-flash', endpoint = 'fixture/standard', priceHash = hash('LOCAL SYNTHETIC PRICE');
const runHash = hash('LOCAL SYNTHETIC RUN'), actor = 'local probe actor only';
const rpc = 'public.resolve_scan_marking_evaluation_full_reservation(text,text,uuid,jsonb,text)';
const table = 'public.scan_marking_evaluation_resolutions';
let passed = 0;
async function main() {
  console.log(runPg('postgres', ['--version']).trim());
  runPg('initdb', ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8']);
  runPg('pg_ctl', ['-D', data, '-l', path.join(socket, 'postgres.log'), '-o', `-k ${socket} -p ${port} -c listen_addresses= -c shared_buffers=16MB -c max_connections=10`, 'start']);
  started = true;
  const admin = await open('postgres');
  await admin.query('create database pd542_resolution');
  const db = await open('pd542_resolution'), a = await open('pd542_resolution'), b = await open('pd542_resolution');
  for (const role of ['anon', 'authenticated', 'service_role']) await db.query(`create role ${role}`);
  // Actual price/spend DDL and every public evaluation RPC. Family tables are not needed.
  for (const name of ['scan_marking_prices', 'scan_marking_spend']) {
    const ddl = sql('20261105_scan_marking.sql').match(new RegExp('create table public\\.' + name + ' \\([\\s\\S]*?\n\\);'));
    assert(ddl); await db.query(ddl[0]);
    await db.query(`alter table public.${name} enable row level security`);
    await db.query(`revoke all on public.${name} from public,anon,authenticated,service_role`);
    await db.query(`grant select on public.${name} to service_role`);
  }
  for (const name of ['20261106_scan_marking_evaluation.sql', '20261106220640_scan_marking_evaluation_price_refresh.sql', '20261107015353_scan_marking_evaluation_clean429.sql']) await db.query(sql(name));
  const baseline = (await db.query(`select proname,pg_get_functiondef(oid) definition from pg_proc
    where pronamespace='public'::regnamespace order by proname`)).rows;
  const scalar = async (query, params = [], c = db) => (await c.query(query, params)).rows[0].v;
  const seedPrice = async (maximum = 6000000) => db.query(`insert into scan_marking_evaluation_prices
    (model,endpoint,evidence_hash,maximum_micros,max_pixels,evidence,verified_at,enabled)
    values($1,$2,$3,$4,1400000,'LOCAL SYNTHETIC PRICE',clock_timestamp(),true)`, [model, endpoint, priceHash, maximum]);
  const admit = async (key, { c = db, run = runHash, cap = 15000000, maximum = 6000000, checked = true } = {}) => scalar(
    `select public.reserve_scan_marking_evaluation${checked ? '_checked' : ''}($1,$2,$3,$4,$5,1400000,$6,$7) v`,
    [run, hash(key), model, endpoint, priceHash, maximum, cap], c);
  const evidence = (id, key, maximum = 6000000, run = runHash) => {
    const response = { status: 200, body: null, envelope: null, openrouter_metadata: null };
    const attempt = { id, reservedMicros: maximum, latencyMs: 60003, error: null,
      usage: Object.fromEntries(['generationId', 'provider', 'model', 'costMicros', 'inputTokens', 'outputTokens', 'reasoningTokens', 'imageTokens'].map(k => [k, null])), response };
    return { run, key: hash(key), model, photo: 'synthetic-local-only', batch: 1, state: 'unknown', attempt, response, ...response,
      result: { run, model, photo: 'synthetic-local-only', batch: 1, status: 'failed', failure: 'unknown-usage', evidenceHash: priceHash, attempts: [attempt] } };
  };
  const resolve = async (id, key, raw = evidence(id, key), who = actor, c = db, run = runHash) => scalar(
    'select public.resolve_scan_marking_evaluation_full_reservation($1,$2,$3,$4,$5) v', [run, hash(key), id, raw, who], c);
  const settle = async (id, cost, c = db) => scalar('select public.settle_scan_marking_evaluation($1,$2) v', [id, cost], c);
  const liability = () => scalar('select coalesce(sum(coalesce(charged_micros,reserved_micros)),0)::text v from scan_marking_spend');
  const defer = async (id, key, run = runHash) => {
    const envelope = { error: { code: 429, message: 'LOCAL SYNTHETIC RATE LIMIT' } };
    return scalar('select public.defer_scan_marking_evaluation($1,$2,$3,$4,1000000) v', [run, hash(key), id, {
      status: 429, body: JSON.stringify(envelope), envelope, openrouter_metadata: null,
    }]);
  };
  const rejectedStatement = async (query, params = [], pattern = /permission denied/, c = db) => {
    await c.query('savepoint expected_failure');
    await assert.rejects(() => c.query(query, params), pattern);
    await c.query('rollback to expected_failure');
  };
  const test = async (name, fn) => {
    await db.query('begin');
    try { await seedPrice(); await fn(); passed++; console.log('PASS', name); }
    finally { await db.query('rollback'); }
  };

  await db.query('begin');
  await seedPrice();
  const prior = await admit('prior'); assert(prior.id);
  assert.equal(await settle(prior.id, null), true);
  assert.equal((await admit('prior-next')).refused, 'unresolved-evaluation-cost');
  assert.equal(await scalar("select to_regprocedure($1) is null v", [rpc]), true);
  assert.equal(await liability(), '6000000');
  await db.query('rollback');
  console.log('PRIOR_CONTROL unknown remains held and globally blocks; resolution RPC is absent');

  // DDL transaction rollback: no migration history, data or code survives this control.
  await db.query('begin'); await db.query(migration);
  assert.equal(await scalar('select to_regprocedure($1) is not null v', [rpc]), true);
  await db.query('rollback');
  assert.equal(await scalar('select to_regprocedure($1) is null v', [rpc]), true);
  assert.equal(await scalar('select to_regclass($1) is null v', [table]), true);
  console.log('MIGRATION_ROLLBACK_OK');
  await db.query(migration);
  for (const original of baseline) assert.deepEqual((await db.query('select pg_get_functiondef(oid) definition from pg_proc where pronamespace=\'public\'::regnamespace and proname=$1', [original.proname])).rows.map(r => r.definition), [original.definition]);
  console.log('EXISTING_PUBLIC_FUNCTIONS_UNCHANGED');

  await test('service RPC stores exact evidence and full charge with one database clock time', async () => {
    const { id } = await admit('valid'), raw = evidence(id, 'valid');
    const before = await scalar('select clock_timestamp() v');
    await db.query('set local role service_role');
    assert.equal(await resolve(id, 'valid', raw), true);
    const audit = (await db.query(`select * from ${table}`)).rows[0];
    assert.deepEqual(audit.evidence, raw); assert.equal(audit.actor, actor);
    for (const field of ['reserved_micros', 'maximum_micros', 'amount_micros']) assert.equal(audit[field], '6000000');
    assert.equal(audit.run_maximum_micros, '15000000'); assert.equal(audit.outcome, 'unknown, charged at its full reservation');
    assert.equal(audit.dispatch_id, id); assert.equal(audit.attempt_hash, hash('valid')); assert.equal(audit.run_hash, runHash);
    assert.equal(audit.model, model); assert.equal(audit.endpoint, endpoint); assert.equal(audit.evidence_hash, priceHash); assert.equal(audit.pixels, '1400000');
    await db.query('reset role');
    const spend = (await db.query('select * from scan_marking_spend where id=$1', [id])).rows[0];
    assert.equal(spend.charged_micros, '6000000'); assert.equal(+spend.settled_at, +audit.recorded_at); assert(+audit.recorded_at >= +before);
    assert.equal(await liability(), '6000000');
    assert.equal(await resolve(id, 'valid', raw), false);
    assert.equal(await settle(id, 0), false); assert.equal(await settle(id, 1234), false);
    assert.equal(await settle(id, null), true); assert.equal(await settle(id, 6000000), true);
    assert.equal(await liability(), '6000000');
  });
  await test('two old clean429 holds and prior charges retain exact USD 1.308144 liability', async () => {
    await db.query('update scan_marking_evaluation_prices set maximum_micros=147948');
    for (const key of ['clean-one', 'clean-two']) {
      const { id } = await admit(key, { maximum: 147948 }); assert(id); assert.equal(await defer(id, key), true);
    }
    const { id } = await admit('timeout', { maximum: 147948 }); assert(id);
    await db.query(`insert into scan_marking_spend(period,model,reserved_micros,charged_micros)
      values(date_trunc('month',clock_timestamp() at time zone 'UTC')::date,$1,864300,864300)`, [model]);
    assert.equal(await liability(), '1308144');
    assert.equal(await resolve(id, 'timeout', evidence(id, 'timeout', 147948)), true);
    assert.equal(await liability(), '1308144');
    assert.equal(await scalar('select count(*)::text v from scan_marking_spend where charged_micros is null'), '2');
    assert.equal(await scalar('select count(*)::text v from scan_marking_evaluation_deferrals'), '2');
    assert.equal(await scalar('select amount_micros::text v from scan_marking_evaluation_resolutions'), '147948');
  });
  await test('full charge remains binding at the run cap; original attempt cannot dispatch again', async () => {
    const first = await admit('one'); assert.equal(await defer(first.id, 'one'), true);
    const second = await admit('two'); assert.equal(await resolve(second.id, 'two'), true);
    assert.equal((await admit('three')).refused, 'run-budget');
    assert.equal((await admit('one')).refused, 'existing-attempt-no-redispatch');
    assert.equal((await admit('changed', { cap: 14000000 })).refused, 'run-cap-changed');
    assert.equal(await liability(), '12000000');
  });
  for (const oldMonth of [false, true]) await test(`full charge and all old holds bind the ${oldMonth ? 'lifetime' : 'UTC-month'} cap`, async () => {
    const one = await admit('one'); assert.equal(await defer(one.id, 'one'), true);
    const two = await admit('two'); assert.equal(await resolve(two.id, 'two'), true);
    await db.query(`insert into scan_marking_spend(period,model,reserved_micros,charged_micros)
      values((date_trunc('month',clock_timestamp() at time zone 'UTC')${oldMonth ? "-interval '1 month'" : ''})::date,$1,32000001,32000001)`, [model]);
    assert.equal((await admit('over', { run: hash('next-run') })).refused, oldMonth ? 'key-total-budget' : 'shared-month-budget');
    await db.query('update scan_marking_spend set reserved_micros=32000000,charged_micros=32000000 where charged_micros=32000001');
    assert((await admit('exact', { run: hash('next-run') })).id);
    assert.equal(await liability(), '50000000');
  });
  await test('resolution rollback restores the hold, stop, and empty audit together', async () => {
    const { id } = await admit('one'); await db.query('savepoint before_resolution');
    assert.equal(await resolve(id, 'one'), true); await db.query('rollback to before_resolution');
    assert.equal(await scalar(`select count(*)::text v from ${table}`), '0');
    assert.equal((await admit('next')).refused, 'unresolved-evaluation-cost'); assert.equal(await liability(), '6000000');
  });
  await test('audit insert failure rolls back the charge atomically', async () => {
    const { id } = await admit('one');
    await db.query(`create function public.local_probe_fail_insert() returns trigger language plpgsql as $$ begin raise exception 'LOCAL_PROBE_INSERT_FAIL'; end $$;
      create trigger local_probe_fail_insert before insert on ${table} for each row execute function public.local_probe_fail_insert()`);
    await rejectedStatement('select public.resolve_scan_marking_evaluation_full_reservation($1,$2,$3,$4,$5)', [runHash, hash('one'), id, evidence(id, 'one'), actor], /LOCAL_PROBE_INSERT_FAIL/);
    assert.equal(await scalar('select charged_micros is null v from scan_marking_spend where id=$1', [id]), true);
    assert.equal(await scalar(`select count(*)::text v from ${table}`), '0');
  });
  await test('a separate unknown still blocks checked admission across runs after resolution', async () => {
    const one = await admit('one'), two = await admit('two', { run: hash('other'), checked: false });
    assert.equal(await resolve(one.id, 'one'), true);
    assert.equal((await admit('blocked', { run: hash('third') })).refused, 'unresolved-evaluation-cost');
    assert.equal(await settle(two.id, null), true); assert.equal((await admit('still-blocked')).refused, 'unresolved-evaluation-cost');
  });
  const malformed = {
    'null evidence': () => null,
    'array evidence': () => [],
    'oversized evidence': r => ({ ...r, extra: 'x'.repeat(1000001) }),
    'wrong run': r => ({ ...r, run: hash('wrong') }),
    'wrong attempt key': r => ({ ...r, key: hash('wrong') }),
    'wrong model': r => ({ ...r, model: 'other' }),
    'nonunknown state': r => ({ ...r, state: 'settled' }),
    'wrong dispatch': r => { r.attempt.id = '00000000-0000-4000-8000-000000000001'; return r; },
    'missing reservation': r => { delete r.attempt.reservedMicros; return r; },
    'zero reservation claim': r => { r.attempt.reservedMicros = 0; return r; },
    'changed reservation claim': r => { r.attempt.reservedMicros = 5999999; return r; },
    'string reservation claim': r => { r.attempt.reservedMicros = '6000000'; return r; },
    'missing usage': r => { delete r.attempt.usage; return r; },
    'known zero cost': r => { r.attempt.usage.costMicros = 0; return r; },
    'known generation': r => { r.attempt.usage.generationId = 'LOCAL-FAKE-NOT-A-PROVIDER-ID'; return r; },
    'known tokens': r => { r.attempt.usage.inputTokens = 1; return r; },
    'missing usage field': r => { delete r.attempt.usage.reasoningTokens; return r; },
    'short latency': r => { r.attempt.latencyMs = 59999; return r; },
    'nonnumeric latency': r => { r.attempt.latencyMs = '60003'; return r; },
    'non200 response': r => { r.response.status = 500; r.status = 500; return r; },
    'known body': r => { r.response.body = '{}'; r.body = '{}'; return r; },
    'known envelope': r => { r.response.envelope = {}; r.envelope = {}; return r; },
    'known metadata': r => { r.response.openrouter_metadata = {}; r.openrouter_metadata = {}; return r; },
    'missing response field': r => { delete r.response.body; return r; },
    'conflicting transport copy': r => ({ ...r, status: 429 }),
    'wrong result run': r => { r.result.run = hash('wrong'); return r; },
    'wrong result evidence hash': r => { r.result.evidenceHash = hash('wrong'); return r; },
    'wrong result photo': r => { r.result.photo = 'synthetic-wrong'; return r; },
    'wrong result batch': r => { r.result.batch = 0; return r; },
    'missing result attempt': r => { r.result.attempts = []; return r; },
    'duplicate result attempt': r => { r.result.attempts.push(r.attempt); return r; },
    'conflicting result attempt': r => { r.result.attempts = [{ ...r.attempt, reservedMicros: 1 }]; return r; },
  };
  for (const [name, mutate] of Object.entries(malformed)) await test(`refuse ${name} without accounting changes`, async () => {
    const { id } = await admit('bad');
    assert.equal(await resolve(id, 'bad', mutate(evidence(id, 'bad'))), false);
    assert.equal(await scalar(`select count(*)::text v from ${table}`), '0');
    assert.equal((await admit('after')).refused, 'unresolved-evaluation-cost');
    assert.equal(await liability(), '6000000');
  });
  for (const who of [null, '', '   ', '\n\t', 'x'.repeat(201), ' '.repeat(201) + 'x']) await test(`refuse actor ${JSON.stringify(who)}`, async () => {
    const { id } = await admit('bad'); assert.equal(await resolve(id, 'bad', evidence(id, 'bad'), who), false);
  });
  for (const mutation of [
    'update scan_marking_spend set reserved_micros=6000001',
    'update scan_marking_spend set reserved_micros=16000000',
    'update scan_marking_evaluation_prices set maximum_micros=5999999',
    'delete from scan_marking_evaluation_prices',
    "update scan_marking_evaluation_attempts set endpoint='wrong'",
    "update scan_marking_evaluation_attempts set evidence_hash=repeat('0',64)",
    'update scan_marking_evaluation_attempts set pixels=1400001',
    'update scan_marking_evaluations set maximum_micros=5999999',
  ]) await test(`refuse invalid durable admission: ${mutation}`, async () => {
    const { id } = await admit('bad'); await db.query(mutation);
    assert.equal(await resolve(id, 'bad'), false); assert.equal(await scalar(`select count(*)::text v from ${table}`), '0');
  });
  for (const bound of ['0', '-1', 'null']) await test(`database and resolver refuse invalid reservation ${bound}`, async () => {
    const { id } = await admit('bad');
    await rejectedStatement(`update scan_marking_spend set reserved_micros=${bound}`, [], /constraint/);
    // Deliberately damaged local legacy fixture. DDL and data both roll back after this case.
    await db.query('alter table scan_marking_spend drop constraint scan_marking_spend_reserved_micros_check');
    await db.query('alter table scan_marking_spend alter column reserved_micros drop not null');
    await db.query(`update scan_marking_spend set reserved_micros=${bound}`);
    assert.equal(await resolve(id, 'bad'), false);
    assert.equal(await scalar(`select count(*)::text v from ${table}`), '0');
  });
  await test('a disabled old price still supplies the original known bound', async () => {
    const { id } = await admit('old'); await db.query('update scan_marking_evaluation_prices set enabled=false');
    assert.equal(await resolve(id, 'old'), true);
  });
  await test('missing, production-only, wrong identity, settled and classified429 attempts refuse', async () => {
    const { id } = await admit('one');
    assert.equal(await resolve(id, 'not-one'), false);
    assert.equal(await resolve(id, 'one', evidence(id, 'one'), actor, db, hash('wrong-run')), false);
    assert.equal(await resolve('00000000-0000-4000-8000-000000000000', 'missing'), false);
    const production = await scalar(`insert into scan_marking_spend(period,model,reserved_micros)
      values(current_date,$1,6000000) returning id v`, [model]);
    assert.equal(await resolve(production, 'production'), false);
    assert.equal(await defer(id, 'one'), true); assert.equal(await resolve(id, 'one'), false);
    assert.equal(await settle(id, 1250), true); assert.equal(await resolve(id, 'one'), false);
  });
  await test('browser roles and direct service writes refuse; service read works without BYPASSRLS', async () => {
    const { id } = await admit('roles'); assert.equal(await resolve(id, 'roles'), true);
    assert.equal(await scalar("select rolbypassrls v from pg_roles where rolname='service_role'"), false);
    for (const role of ['anon', 'authenticated']) {
      await db.query(`set local role ${role}`);
      for (const query of [
        `select * from ${table}`,
        `select public.resolve_scan_marking_evaluation_full_reservation('${runHash}','${hash('roles')}','${id}',null,'actor')`,
        `insert into ${table} select * from ${table}`,
      ]) await rejectedStatement(query);
      await db.query('reset role');
    }
    await db.query('set local role service_role');
    assert.equal(await scalar(`select count(*)::text v from ${table}`), '1');
    for (const query of [`insert into ${table} select * from ${table}`, `update ${table} set actor='changed'`, `delete from ${table}`, `truncate ${table}`]) await rejectedStatement(query);
    await db.query('reset role');
    assert.equal(await scalar("select relrowsecurity v from pg_class where oid=$1::regclass", [table]), true);
    for (const role of ['anon', 'authenticated', 'service_role']) assert.equal(await scalar("select has_function_privilege($1,'public.scan_marking_evaluation_resolution_immutable()','EXECUTE') v", [role]), false);
  });
  await test('privileged update/delete/truncate and parent cleanup cannot erase the audit', async () => {
    const { id } = await admit('immutable'); assert.equal(await resolve(id, 'immutable'), true);
    for (const query of [`update ${table} set actor='changed'`, `delete from ${table}`, `truncate ${table}`]) await rejectedStatement(query, [], /append only/);
    for (const parent of ['scan_marking_evaluation_attempts', 'scan_marking_evaluations', 'scan_marking_spend', 'scan_marking_evaluation_prices']) await rejectedStatement(`delete from ${parent}`, [], /foreign key constraint/);
  });

  // All transactional controls left the candidate database empty.
  assert.equal(await scalar('select count(*)::text v from scan_marking_spend'), '0');
  await seedPrice(147948);
  const first = await admit('race-resolution', { maximum: 147948 });
  const both = await Promise.all([resolve(first.id, 'race-resolution', evidence(first.id, 'race-resolution', 147948), actor, a), resolve(first.id, 'race-resolution', evidence(first.id, 'race-resolution', 147948), actor, b)]);
  assert.deepEqual(both.sort(), [false, true]);
  assert.equal(await scalar(`select count(*)::text v from ${table}`), '1');
  assert.equal(await liability(), '147948');
  console.log('PASS concurrent resolutions record exactly one permanent full charge'); passed++;

  const raceLower = await admit('race-lower', { maximum: 147948 });
  await a.query('begin');
  assert.equal(await resolve(raceLower.id, 'race-lower', evidence(raceLower.id, 'race-lower', 147948), actor, a), true);
  const lowerWaiting = settle(raceLower.id, 1, b);
  // Prove the second connection is blocked on the shared lock, without a timing sleep.
  const pid = b.processID;
  let blocked = false;
  for (let i = 0; i < 100 && !blocked; i++) blocked = await scalar('select cardinality(pg_blocking_pids($1))>0 v', [pid]);
  assert.equal(blocked, true); await a.query('commit'); assert.equal(await lowerWaiting, false);
  assert.equal(await scalar('select charged_micros::text v from scan_marking_spend where id=$1', [raceLower.id]), '147948');
  console.log('PASS concurrent later normal settlement cannot lower the full charge'); passed++;

  const raceSettled = await admit('settlement-first', { maximum: 147948 });
  await a.query('begin'); assert.equal(await settle(raceSettled.id, 1, a), true);
  const resolutionWaiting = resolve(raceSettled.id, 'settlement-first', evidence(raceSettled.id, 'settlement-first', 147948), actor, b);
  blocked = false;
  for (let i = 0; i < 100 && !blocked; i++) blocked = await scalar('select cardinality(pg_blocking_pids($1))>0 v', [pid]);
  assert.equal(blocked, true); await a.query('commit'); assert.equal(await resolutionWaiting, false);
  console.log('PASS a normal settlement that wins the lock prevents resolution'); passed++;

  // Run inherited SQL suites in independent databases; their reset code predates append-only audit.
  for (const [database, script] of [
    ['pd542_inherited_evaluation', 'scan_marking_evaluation.cjs'],
    ['pd542_inherited_evaluation', 'scan_marking_evaluation_price_refresh.cjs'],
    ['pd542_inherited_clean429', 'scan_marking_evaluation_clean429.cjs'],
  ]) {
    if (!await scalar('select exists(select 1 from pg_database where datname=$1) v', [database], admin)) await admin.query(`create database ${database}`);
    const result = spawnSync(process.execPath, [path.join(__dirname, script), '--bootstrap'], {
      env: { ...childEnv, SCAN_MARKING_SOCKET: socket, SCAN_MARKING_DATABASE: database, PGPORT: String(port) }, encoding: 'utf8', timeout: 60000,
    });
    process.stdout.write(result.stdout); process.stderr.write(result.stderr);
    assert.equal(result.status, 0, `inherited ${script}`);
  }
  console.log(`SCAN_MARKING_FULL_RESERVATION_SQL_OK ${passed} cases`);
}
(async () => {
  try { await main(); }
  finally {
    await Promise.allSettled(clients.map(async c => { try { await c.query('rollback'); } finally { await c.end(); } }));
    if (started) { runPg('pg_ctl', ['-D', data, 'stop', '-m', 'fast']); console.log('OWNED_POSTGRES_STOPPED', socket); }
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
