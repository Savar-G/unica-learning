// Local synthetic PostgreSQL proof of the report retries' rule (#771). Starts and stops its own disposable cluster. No
// network or hosted credentials. It loads the production migrations report_retries and report_retry_send_check whole
// (with the family write fence they use) over a reduced fixture of the tables they read, then:
//   1. runs report_retries.sql, the hosted probe: send at 47 h 59 min, nothing at 48 h 1 min, a test family, a team
//      account, a 9-minute test, a family being deleted, the bound and the give-up, and the send-time check;
//   2. claims one test from two sessions at once: the second waits for the first's row lock, then gets nothing;
//   3. claims one give-up from two sessions at once: one alert claim.
// Run: node supabase/tests/report_retries.cjs (REPORT_RETRIES_PG_BIN names another PostgreSQL bin folder).
const { mkdtempSync, mkdirSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const root = resolve(__dirname, '../..');
const bin = process.env.REPORT_RETRIES_PG_BIN || '/opt/homebrew/opt/postgresql@18/bin';
const dir = mkdtempSync(join(tmpdir(), 'report-retries-'));
const socket = join(dir, 'socket');
mkdirSync(socket);
const migration = (name) => readFileSync(join(root, 'supabase/migrations', name), 'utf8');
const productionFunction = (file, name) => {
  const found = migration(file).match(new RegExp('create (?:or replace )?function public\\.' + name + '\\([\\s\\S]*?end \\$\\$;'));
  if (!found) throw Error('Missing production function ' + name);
  return found[0];
};
const AGES = [600, 172800];
const DELAYS = [900, 1800, 3600, 900];
let pool, started = false, passed = 0;
async function test(name, run) { await run(); passed++; console.log('PASS', name); }
const pending = (promise, ms = 300) => Promise.race([promise.then(() => 'done'), new Promise((r) => setTimeout(() => r('waiting'), ms))]);

(async () => {
 try {
  execFileSync(join(bin, 'initdb'), ['-D', join(dir, 'data'), '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'ignore' });
  execFileSync(join(bin, 'pg_ctl'), ['-D', join(dir, 'data'), '-l', join(dir, 'postgres.log'), '-o', `-k ${socket} -h '' -p 55771`, '-w', 'start'], { stdio: 'ignore' });
  started = true;
  pool = new Pool({ host: socket, port: 55771, database: 'postgres', user: process.env.USER, max: 8 });
  // The reduced fixture: only the columns the functions and the probe use, with the same keys and cascades.
  await pool.query(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key, email text);
    create table public.parents(id uuid primary key references auth.users on delete cascade, name text not null, email text not null, postal text, deletion_requested_at timestamptz);
    create table public.admin_users(user_id uuid primary key references auth.users on delete cascade, email text not null, name text not null);
    create table public.test_accounts(parent_id uuid primary key references public.parents on delete cascade, marked_at timestamptz not null default now(), marked_by uuid not null);
    create table public.children(id uuid primary key, parent_id uuid not null references public.parents on delete cascade, first_name text not null, grade smallint not null, province text not null);
    create table public.assessments(id uuid primary key default gen_random_uuid(), parent_id uuid not null references public.parents on delete cascade,
      child_id uuid not null references public.children on delete cascade, grade smallint not null, province text not null, seed integer not null, test jsonb not null,
      status text not null default 'in_progress', completed_at timestamptz, placement jsonb);
    create table public.reports(id uuid primary key default gen_random_uuid(), assessment_id uuid not null unique references public.assessments on delete cascade,
      parent_id uuid not null references public.parents on delete cascade, child_id uuid not null references public.children on delete cascade,
      model jsonb not null, questions smallint not null, minutes smallint not null, emailed_at timestamptz, email_id text, email_error text);`);
  await pool.query(productionFunction('20261011_add_family_deletion.sql', 'assert_family_writable'));
  await pool.query(productionFunction('20261011_add_family_deletion.sql', 'fence_family_write'));
  await pool.query(migration('20261109205535_report_retries.sql'));
  await pool.query(migration('20261109214236_report_retry_send_check.sql'));

  await test('the hosted probe passes here too: ages, families, the bound, the give-up and the send-time check', async () => {
    await assert.rejects(pool.query(readFileSync(join(__dirname, 'report_retries.sql'), 'utf8')), (e) => e.message === 'PROBE_OK');
    assert.equal((await pool.query('select count(*)::int n from public.report_retries')).rows[0].n, 0);
  });

  /** A real family's test finished `age` ago, with no report. */
  const finished = async (age) => {
    const { rows: [r] } = await pool.query(`with u as (insert into auth.users(id) values (gen_random_uuid()) returning id),
      p as (insert into public.parents(id, name, email) select id, 'Probe', id::text || '@example.invalid' from u returning id),
      c as (insert into public.children(id, parent_id, first_name, grade, province) select gen_random_uuid(), id, 'Probe', 3, 'BC' from p returning id, parent_id)
      insert into public.assessments(parent_id, child_id, grade, province, seed, test, status, completed_at, placement)
      select parent_id, id, 3, 'BC', 1, '{}', 'completed', clock_timestamp() - $1::interval, '{}' from c returning id`, [age]);
    return r.id;
  };
  const claim = (db, id) => db.query('select * from public.claim_report_retry($1, $2, $3, 4, $4)', [id, ...AGES, DELAYS]);

  await test('two sessions claim one test at once: the second waits for the row lock, then gets nothing', async () => {
    // A test whose first retry is done and whose delay has passed: only the row lock keeps the second claim out.
    const id = await finished('2 hours');
    await claim(pool, id);
    await pool.query("update public.report_retries set next_at = clock_timestamp() - interval '1 second' where assessment_id = $1", [id]);
    const a = await pool.connect(), b = await pool.connect();
    try {
      await a.query('begin');
      assert.deepEqual((await claim(a, id)).rows, [{ out_attempt: 2, out_email: true }]);
      await b.query('begin');
      const second = claim(b, id);
      assert.equal(await pending(second), 'waiting');
      await a.query('commit');
      assert.deepEqual((await second).rows, []);
      await b.query('commit');
    } finally { a.release(); b.release(); }
    assert.equal((await pool.query('select attempts from public.report_retries where assessment_id = $1', [id])).rows[0].attempts, 2);
  });

  await test('two sessions claim the first retry of a new test at once: one row, one attempt', async () => {
    const id = await finished('30 minutes');
    const results = await Promise.all([claim(pool, id), claim(pool, id), claim(pool, id)]);
    assert.deepEqual(results.map((r) => r.rows.length).sort(), [0, 0, 1]);
    assert.equal((await pool.query('select attempts from public.report_retries where assessment_id = $1', [id])).rows[0].attempts, 1);
  });

  await test('two sessions claim one give-up at once: one claim', async () => {
    const id = await finished('3 hours');
    await claim(pool, id);
    await pool.query("update public.report_retries set attempts = 4, next_at = clock_timestamp() - interval '1 second' where assessment_id = $1", [id]);
    const a = await pool.connect(), b = await pool.connect();
    try {
      await a.query('begin');
      const first = (await a.query('select public.claim_report_give_up($1, $2, $3, 4) v', [id, ...AGES])).rows[0].v;
      assert.ok(first);
      await b.query('begin');
      const second = b.query('select public.claim_report_give_up($1, $2, $3, 4) v', [id, ...AGES]);
      assert.equal(await pending(second), 'waiting');
      await a.query('commit');
      assert.equal((await second).rows[0].v, null);
      await b.query('commit');
    } finally { a.release(); b.release(); }
  });

  await test('the send-time check follows the clock: yes inside 48 hours, no once the test passes them', async () => {
    const id = await finished('47 hours 59 minutes');
    assert.deepEqual((await claim(pool, id)).rows, [{ out_attempt: 1, out_email: true }]);
    assert.equal((await pool.query('select public.report_retry_may_email($1, $2, $3) v', [id, ...AGES])).rows[0].v, true);
    await pool.query("update public.assessments set completed_at = completed_at - interval '2 minutes' where id = $1", [id]);
    assert.equal((await pool.query('select public.report_retry_may_email($1, $2, $3) v', [id, ...AGES])).rows[0].v, false);
  });

  console.log(`report_retries: ${passed} passed`);
 } catch (e) {
  console.error('FAIL', e.message);
  process.exitCode = 1;
 } finally {
  await pool?.end();
  if (started) execFileSync(join(bin, 'pg_ctl'), ['-D', join(dir, 'data'), '-m', 'immediate', 'stop'], { stdio: 'ignore' });
  rmSync(dir, { recursive: true, force: true });
 }
})();
