// Run: node supabase/tests/workbook_start_resume.cjs
// Requires pg (the repository dev dependency) and local initdb/pg_ctl.
// No connection URL or existing database is accepted. Every run owns its cluster.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');

const candidate = process.argv[2] ?? 'both';
assert(['both', 'old', 'fixed'].includes(candidate), 'Use both, old, or fixed');
const bin = process.env.PG_BIN ?? '/opt/homebrew/bin';
const root = path.resolve(__dirname, '../..');
const sql = name => readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
const migration = sql('20261106120000_workbook_start_resume_lock.sql');
const functionSql = (source, name) => {
  const match = source.match(new RegExp(`create(?: or replace)? function public\\.${name}\\([\\s\\S]*?\\$\\$;`));
  assert(match, `Missing production function ${name}`);
  return match[0];
};
const clients = new Set();
let directory;
let started = false;
let passed = 0;
function command(name, args) {
  const result = spawnSync(path.join(bin, name), args, { encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, `${name}: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
function cleanup() {
  if (!directory) return;
  if (started) {
    const status = spawnSync(path.join(bin, 'pg_ctl'), ['-D', path.join(directory, 'data'), 'status'], { timeout: 5000 });
    if (status.status === 0) command('pg_ctl', ['-D', path.join(directory, 'data'), '-m', 'immediate', '-w', '-t', '10', 'stop']);
    else assert.equal(status.status, 3, 'Cannot establish local cluster state; keep its directory');
    const stopped = spawnSync(path.join(bin, 'pg_ctl'), ['-D', path.join(directory, 'data'), 'status'], { timeout: 5000 });
    assert.equal(stopped.status, 3, 'Local cluster still runs; keep its directory');
    started = false;
  }
  rmSync(directory, { recursive: true, force: true });
  console.log('CLEANUP local cluster stopped and removed', directory);
  directory = null;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  try { cleanup(); } finally { process.exit(130); }
});
async function open(role = false, deadlockTimeout = '100ms') {
  const client = new Client({ host: directory, port: 5432, database: 'postgres', user: 'fixture_owner',
    password: '', connectionTimeoutMillis: 5000, application_name: 'workbook-start-resume-fixture' });
  clients.add(client);
  await client.connect();
  await client.query("set statement_timeout='12s'");
  await client.query("select set_config('deadlock_timeout',$1,false)", [deadlockTimeout]);
  if (role) await client.query('set role service_role');
  return client;
}
async function close(client) { await client.end(); clients.delete(client); }
const rpc = async (client, name, args) => (await client.query(
  `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`, args)).rows[0].value;
const start = (client, child) => rpc(client, 'start_workbook_run', [child, null, 'fixture@example.invalid', 3, 360]);
const resume = (client, run, lease = randomUUID(), runner = 'server') =>
  rpc(client, 'resume_workbook_run', [run, lease, 360, runner]);
const outcome = promise => promise.then(value => ({ value }), error => ({ error }));

(async () => {
  console.log('FALSIFIER: old must raise 40P01 at the audit foreign key; fixed must complete the identical lock sequence.');
  console.log('FALSIFIER: duplicate active runs, changed RPC results, lost fences, or browser-role execute access fail.');
  console.log(command('pg_ctl', ['--version']));
  directory = mkdtempSync('/tmp/pd612-pg-');
  command('initdb', ['-D', path.join(directory, 'data'), '-A', 'trust', '--no-locale', '-U', 'fixture_owner']);
  started = true; // Also attempt cleanup if pg_ctl starts a server but fails to report success.
  command('pg_ctl', ['-D', path.join(directory, 'data'), '-l', path.join(directory, 'postgres.log'),
    '-o', `-F -k ${directory} -p 5432 -c listen_addresses=''`, '-w', '-t', '10', 'start']);
  const db = await open();
  console.log('LOCAL_SOCKET', directory);
  await db.query(readFileSync(path.join(__dirname, 'workbook_start_resume_fixture.sql'), 'utf8'));
  const family = sql('20261011_add_family_deletion.sql');
  for (const name of ['assert_family_writable', 'fence_family_write']) await db.query(functionSql(family, name));
  for (const file of ['20261031_add_workbook_runs.sql', '20261031_workbook_run_resume.sql',
    '20261101_workbook_mac_runner.sql', '20261101_workbook_runner_checks.sql']) await db.query(sql(file));
  const deletion = sql('20261105_child_delete.sql');
  await db.query(functionSql(deletion, 'child_delete_row_child'));
  await db.query(sql('20261105_child_delete_plan_recovery.sql'));
  for (const table of ['children', 'workbook_runs', 'workbook_audit', 'workbook_run_pages']) {
    await db.query(`create trigger fence_child_delete_write before insert or update on public.${table}
      for each row execute function public.fence_child_delete_write()`);
  }
  await db.query('create trigger fence_family_write before insert or update on public.children for each row execute function public.fence_family_write()');
  await db.query(sql('20261105_child_rename_stops_runs.sql'));
  const zones = sql('20261102164821_maya_window_zones.sql');
  for (const name of ['_maya_period_window', '_maya_family_window']) await db.query(functionSql(zones, name));
  const supportedZones = sql('20261102172026_supported_family_zones.sql');
  for (const name of ['_maya_normalize_zone', '_maya_zone_at']) await db.query(functionSql(supportedZones, name));
  const plans = sql('20261105234500_plan_controls.sql');
  // Load the exact plan tables and write-boundary functions. Unrelated billing RPCs are outside this fixture.
  await db.query(plans.slice(plans.indexOf('create table'), plans.indexOf('alter table public.plan_starts')));
  for (const name of ['plan_mailing_obligations', 'assert_plan_workbook_allowed', 'fence_plan_workbook',
    'fulfil_paid_restart_request']) await db.query(functionSql(plans, name));
  await db.query(`create trigger fence_plan_workbook before insert on public.workbook_runs
      for each row execute function public.fence_plan_workbook();
    create trigger fulfil_paid_restart_request after insert on public.workbook_runs
      for each row execute function public.fulfil_paid_restart_request();
    create trigger fixture_resume_barrier before update on public.workbook_runs
      for each row execute function public.fixture_resume_barrier()`);

  async function test(name, run) { await run(); passed++; console.log('PASS', name); }
  async function fixture({ running = false, resumes = 0, stale = false, runner = 'server' } = {}) {
    const p = randomUUID(), c = randomUUID(), run = randomUUID(), lease = randomUUID();
    await db.query('insert into parents(id) values($1)', [p]);
    await db.query('insert into children(id,parent_id) values($1,$2)', [c, p]);
    if (running) await db.query(`insert into workbook_runs(id,parent_id,child_id,number,status,max_attempts,attempts,lease,heartbeat_at,resumes,runner)
      values($1,$2,$3,1,'running',3,1,$4,now()-make_interval(secs=>$5),$6,$7)`,
      [run, p, c, lease, stale ? 600 : 0, resumes, runner]);
    return { p, c, run, lease };
  }
  async function blocked(waiter, holder) {
    const deadline = Date.now() + 5000;
    do {
      const row = (await db.query(`select wait_event_type, pg_blocking_pids(pid) blockers
        from pg_stat_activity where pid=$1`, [waiter.processID])).rows[0];
      if (row?.wait_event_type === 'Lock' && row.blockers.includes(holder.processID)) return;
      // Poll database state. Elapsed time never releases a barrier or proves a lock.
      await new Promise(resolve => setImmediate(resolve));
    } while (Date.now() < deadline);
    throw Error(`Required lock barrier not reached: ${waiter.processID} waits for ${holder.processID}`);
  }
  const runRow = async id => (await db.query('select * from workbook_runs where id=$1', [id])).rows[0];
  const active = async child => (await db.query("select id from workbook_runs where child_id=$1 and status in ('queued','running')", [child])).rows;

  async function cycle(expectDeadlock, legacy = false) {
    const f = await fixture({ running: true, resumes: 30, stale: true });
    const a = await open(true), b = await open(true, '8s');
    let pendingA, pendingB;
    try {
      await db.query('select pg_advisory_lock(612,1)');
      await a.query("begin; set local fixture.resume_barrier='on'");
      await b.query('begin');
      pendingA = outcome(legacy ? rpc(a, 'resume_workbook_run', [f.run, randomUUID(), 360]) : resume(a, f.run));
      await blocked(a, db); // Resume owns the run and reached its UPDATE.
      pendingB = outcome(start(b, f.c));
      await blocked(b, a); // Start owns the child and waits to update that same run.
      if (expectDeadlock) {
        await assert.rejects(() => db.query('select id from children where id=$1 for key share nowait', [f.c]), e => e.code === '55P03');
      } else {
        assert.equal((await db.query('select id from children where id=$1 for key share nowait', [f.c])).rowCount, 1);
      }
      console.log('BARRIER resume owns run; start waits for run; child KEY SHARE', expectDeadlock ? 'blocked' : 'allowed');
      await db.query('select pg_advisory_unlock(612,1)');
      const resultA = await pendingA;
      if (resultA.error) {
        await a.query('rollback');
        assert.equal(resultA.error.code, '40P01');
        assert.match(resultA.error.where, /FOR KEY SHARE/);
        assert.match(resultA.error.where, /workbook_audit/);
        console.log('OLD_CANDIDATE_FAILURE', resultA.error.code, resultA.error.message);
        console.log('DEADLOCK_DETAIL', resultA.error.detail);
        console.log('DEADLOCK_CONTEXT', resultA.error.where);
      } else {
        assert.equal(resultA.value, false);
        await a.query('commit');
      }
      const resultB = await pendingB;
      assert.ifError(resultB.error);
      assert.equal(resultB.value.status, 'started');
      await b.query('commit');
      assert.equal(Boolean(resultA.error), expectDeadlock, 'Candidate deadlock result');
      assert.equal((await active(f.c)).length, 1);
      const old = await runRow(f.run);
      assert.equal(old.status, 'stale'); // Keep the existing start result after it waited.
      assert.equal(old.lease, null);
      assert.equal(old.resumes, 30);
      assert(old.finished_at);
      const audit = (await db.query('select action from workbook_audit where run_id=$1 order by id', [f.run])).rows.map(r => r.action);
      assert.deepEqual(audit, expectDeadlock ? ['run-stopped'] : ['run-failed', 'run-stopped']);
    } finally {
      await db.query('select pg_advisory_unlock_all()');
      // Roll back A first to release the run if a barrier assertion fails.
      if (pendingA) await pendingA;
      await a.query('rollback');
      if (pendingB) await pendingB;
      await b.query('rollback');
      await close(a); await close(b);
    }
  }
  if (candidate !== 'fixed') {
    for (const legacy of [false, true]) await test(
      `old function deadlocks at the audit child foreign key (${legacy ? 3 : 4}-argument resume)`, () => cycle(true, legacy));
    if (candidate === 'old') throw Error('OLD_CANDIDATE_REJECTED: SQLSTATE 40P01');
  }
  const definition = async () => (await db.query("select pg_get_functiondef('public.start_workbook_run(uuid,uuid,text,integer,integer)'::regprocedure) v")).rows[0].v;
  const before = await definition();
  const triggers = async () => (await db.query(`select tgrelid::regclass::text relation,tgname,pg_get_triggerdef(oid) definition
    from pg_trigger where not tgisinternal and tgrelid in ('public.workbook_runs'::regclass,'public.children'::regclass)
    order by tgrelid,tgname`)).rows;
  const beforeTriggers = await triggers();
  await db.query(migration);
  await test('migration changes only the lock mode and keeps all attached fences', async () => {
    assert.equal(await definition(), before.replace('from public.children where id = p_child for update;',
      'from public.children where id = p_child for no key update;'));
    assert.deepEqual(await triggers(), beforeTriggers);
  });
  for (const legacy of [false, true]) await test(
    `fixed function completes the same real concurrent RPC sequence (${legacy ? 3 : 4}-argument resume)`, () => cycle(false, legacy));
  const service = await open(true);
  await test('two same-child starts serialize and keep one active run', async () => {
    const f = await fixture(), a = await open(true), b = await open(true);
    let pending;
    try {
      await a.query('begin');
      const first = await start(a, f.c);
      assert.equal(first.status, 'started');
      pending = outcome(start(b, f.c));
      await blocked(b, a);
      await a.query('commit');
      const second = await pending;
      assert.ifError(second.error);
      assert.deepEqual(second.value, { status: 'busy', run: first.run });
      assert.deepEqual(await active(f.c), [{ id: first.run }]);
    } finally { await a.query('rollback'); if (pending) await pending; await close(a); await close(b); }
  });
  await test('normal start, busy, missing child, claim and resume keep their results', async () => {
    const f = await fixture();
    await db.query("insert into workbooks(parent_id,child_id,number,status) values($1,$2,4,'shipped')", [f.p, f.c]);
    const first = await start(service, f.c);
    assert.equal(first.status, 'started');
    const row = await runRow(first.run);
    assert.equal(row.number, 5); assert.equal(row.status, 'queued'); assert.equal(row.max_attempts, 3);
    assert.equal(row.started_by_email, 'fixture@example.invalid');
    assert.deepEqual(await start(service, f.c), { status: 'busy', run: first.run });
    assert.deepEqual(await start(service, randomUUID()), { status: 'refused', reason: 'the child is not known' });
    const lease = randomUUID();
    assert.equal(await rpc(service, 'claim_workbook_run', [first.run, lease, 'mac']), false);
    assert.equal(await rpc(service, 'claim_workbook_run', [first.run, lease, 'server']), true);
    assert.equal(await resume(service, first.run), false);
    assert.equal(await rpc(service, 'yield_workbook_run', [first.run, lease]), true);
    const next = randomUUID();
    assert.equal(await resume(service, first.run, next, 'mac'), false);
    assert.equal(await resume(service, first.run, next), true);
    const resumed = await runRow(first.run);
    assert.equal(resumed.resumes, 1); assert.equal(resumed.lease, next); assert.equal(resumed.status, 'running');
    const audit = (await db.query('select action,detail from workbook_audit where run_id=$1 order by id', [first.run])).rows;
    assert.deepEqual(audit, [{ action: 'run-started', detail: { number: 5 } },
      { action: 'run-resumed', detail: { pages: 0, after: 'handover' } }]);
  });
  await test('stalled queued/running and max-resume/terminal branches keep their results', async () => {
    const queued = await fixture(), started = await start(service, queued.c);
    await db.query("update workbook_runs set created_at=now()-interval '3 minutes' where id=$1", [started.run]);
    assert.deepEqual(await start(service, queued.c), { status: 'stalled', run: started.run });
    assert.equal((await runRow(started.run)).status, 'running');
    assert.equal((await runRow(started.run)).attempts, 1);
    const stopped = await fixture({ running: true, stale: true });
    assert.deepEqual(await start(service, stopped.c), { status: 'stalled', run: stopped.run });
    const replacement = randomUUID();
    assert.equal(await resume(service, stopped.run, replacement), true);
    assert.equal((await runRow(stopped.run)).lease, replacement);
    assert.equal((await runRow(stopped.run)).resumes, 1);
    assert.deepEqual((await db.query("select detail from workbook_audit where run_id=$1 and action='run-resumed'", [stopped.run])).rows,
      [{ detail: { pages: 0, after: 'no progress' } }]);
    const max = await fixture({ running: true, stale: true, resumes: 30 });
    assert.equal(await resume(service, max.run), false);
    const failed = await runRow(max.run);
    assert.equal(failed.status, 'failed'); assert.equal(failed.lease, null); assert(failed.finished_at);
    assert.equal(failed.error, 'The run stopped and was taken up again 30 times without finishing.');
    assert.equal(await resume(service, max.run), false);
    assert.equal((await db.query("select count(*)::int n from workbook_audit where run_id=$1 and action='run-failed'", [max.run])).rows[0].n, 1);
    assert.equal((await start(service, max.c)).status, 'started');
    for (const status of ['done', 'failed', 'stale']) {
      const f = await fixture({ running: true });
      await db.query('update workbook_runs set status=$2,lease=null where id=$1', [f.run, status]);
      assert.equal(await resume(service, f.run), false);
    }
    assert.equal(await resume(service, randomUUID()), false);
  });
  await test('rename and start still exclude each other in both orders', async () => {
    for (const renameFirst of [false, true]) {
      const f = await fixture(), a = await open(true), b = await open(true);
      let pending;
      const rename = client => rpc(client, 'rename_child', [f.p, f.c, 'Mira', 360]);
      try {
        await a.query('begin');
        if (renameFirst) assert.equal(await rename(a), 'saved');
        else assert.equal((await start(a, f.c)).status, 'started');
        pending = outcome(renameFirst ? start(b, f.c) : rename(b));
        await blocked(b, a);
        await a.query('commit');
        const result = await pending; assert.ifError(result.error);
        if (renameFirst) assert.equal(result.value.status, 'started');
        else assert.equal(result.value, 'book_in_progress');
      } finally { await a.query('rollback'); if (pending) await pending; await close(a); await close(b); }
    }
  });
  await test('family and child deletion fences reject starts and resumes without partial writes', async () => {
    for (const kind of ['family', 'child']) {
      const f = await fixture({ running: true, stale: true });
      if (kind === 'family') await db.query('update parents set deletion_requested_at=now() where id=$1', [f.p]);
      else await db.query('insert into child_deletions values($1,$2)', [f.c, f.p]);
      await assert.rejects(() => resume(service, f.run), e => e.code === '55000');
      assert.equal((await runRow(f.run)).resumes, 0);
      const idle = await fixture();
      if (kind === 'family') await db.query('update parents set deletion_requested_at=now() where id=$1', [idle.p]);
      else await db.query('insert into child_deletions values($1,$2)', [idle.c, idle.p]);
      await assert.rejects(() => start(service, idle.c), e => e.code === '55000');
      assert.equal((await active(idle.c)).length, 0);
      assert.equal((await db.query('select count(*)::int n from workbook_audit where child_id=$1', [idle.c])).rows[0].n, 0);
    }
  });
  await test('plan cancellation, pending control and mailing pause still reject start', async () => {
    for (const kind of ['cancelled', 'pending', 'paused']) {
      const f = await fixture();
      if (kind === 'cancelled') await db.query('insert into child_plan_controls(child_id,parent_id,cancelled) values($1,$2,true)', [f.c, f.p]);
      else {
        const card = randomUUID();
        await db.query('insert into card_setups values($1,$2,$3)', [card, f.p, f.c]);
        await db.query("insert into workbooks(parent_id,child_id,number,status,shipped_at) values($1,$2,1,'shipped',now())", [f.p, f.c]);
        await db.query(`insert into plan_control_operations(parent_id,child_id,card_setup_id,kind,token,state,weeks,allowance_year,target_number,finished_at)
          values($1,$2,$3,'pause','fixture',$4,2,2026,2,case when $4='applied' then now() end)`,
          [f.p, f.c, card, kind === 'pending' ? 'open' : 'applied']);
      }
      const message = { cancelled: 'plan_cancelled', pending: 'plan_control_pending', paused: 'plan_paused' }[kind];
      await assert.rejects(() => start(service, f.c), e => e.code === '55000' && e.message === message);
      assert.equal((await active(f.c)).length, 0);
    }
  });
  await test('service-only execute grants, security definer and empty search path remain', async () => {
    for (const role of ['anon', 'authenticated']) {
      const client = await open();
      try {
        await client.query('set role ' + role);
        await assert.rejects(() => start(client, randomUUID()), e => e.code === '42501');
        await assert.rejects(() => resume(client, randomUUID()), e => e.code === '42501');
        await assert.rejects(() => rpc(client, 'resume_workbook_run', [randomUUID(), randomUUID(), 360]), e => e.code === '42501');
      } finally { await close(client); }
    }
    const metadata = (await db.query(`select prosecdef,proconfig from pg_proc
      where oid='public.start_workbook_run(uuid,uuid,text,integer,integer)'::regprocedure`)).rows[0];
    assert.equal(metadata.prosecdef, true);
    assert.deepEqual(metadata.proconfig, ['search_path=""']);
  });
  console.log('WORKBOOK_START_RESUME_OK', passed);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await Promise.allSettled([...clients].map(client => client.end()));
  try { cleanup(); } catch (error) { console.error('CLEANUP FAILED', error); process.exitCode = 1; }
});
