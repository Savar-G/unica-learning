// Disposable local PostgreSQL only. No hosted connections or model calls.
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const dir = mkdtempSync(join(tmpdir(), 'unica-or-'));
const pgBin = process.env.OPENROUTER_PROBE_PG_BIN || '/opt/homebrew/bin';
const run = (name, args) => execFileSync(join(pgBin, name), args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
let started = false;
(async () => {
  run('initdb', ['-D', join(dir,'data'), '-A', 'trust', '--no-locale']);
  run('pg_ctl', ['-D', join(dir,'data'), '-l', join(dir,'log'), '-o', `-k ${dir} -h '' -p 55489`, '-w', 'start']);
  started = true;
  const config = { host: dir, port: 55489, database: 'postgres' };
  const db = new Client(config); await db.connect();
  try {
    await db.query(`create role anon; create role authenticated; create role service_role bypassrls;
      create function public.is_admin() returns boolean language sql stable as $$ select coalesce(current_setting('test.admin',true),'false') = 'true' $$;
      create table public.ai_usage_events(id bigint generated always as identity, provider text, generation_id text, feature text, parent_id uuid, child_id uuid);
      create table public.test_accounts(parent_id uuid); create table public.admin_users(user_id uuid);`);
    await db.query(readFileSync(process.env.OPENROUTER_PROBE_MIGRATION || 'supabase/migrations/20261116192429_openrouter_provider_receipts.sql','utf8'));
    await db.query(readFileSync('supabase/tests/openrouter_provider_receipts.sql','utf8'));
    // Concurrent, reversed deliveries and lost acknowledgements share the actual database unique transaction.
    const rows = [1,2,3].map(n => ({ workspace_id:'local', generation_id:`gen-concurrent-${n}`, occurred_at:'2026-11-16T12:00:00Z', model:'test/model', cost_usd:0.01 }));
    const second = new Client(config); await second.connect();
    try {
      await Promise.all([db,second].map(async (client,i) => {
        await client.query('set role service_role');
        await client.query('select public.ingest_openrouter_provider_receipts($1::jsonb)', [JSON.stringify(i ? [...rows].reverse() : rows)]);
      }));
      await db.query('reset role');
      const result = await db.query('select count(*)::int n, sum(cost_usd)::text cost from public.openrouter_provider_receipts');
      assert.equal(result.rows[0].n,3); assert.equal(Number(result.rows[0].cost),0.03);
      await db.query('set role service_role');
      await db.query('select public.ingest_openrouter_provider_receipts($1::jsonb)',[JSON.stringify(rows)]);
      await db.query('reset role');
      assert.equal((await db.query('select count(*)::int n from public.openrouter_provider_receipts')).rows[0].n,3);
    } finally { await second.end(); }
    console.log('PASS: migration, duplicate/reordered/concurrent retry, atomic conflict rollback, privacy allowlist, RLS/grants, append-only, periods, delayed/test-family attribution, workspace ambiguity. Local PostgreSQL only.');
  } finally { await db.end(); }
})().catch(e => { console.error(e.message); process.exitCode=1; }).finally(() => {
  if (started) run('pg_ctl',['-D',join(dir,'data'),'-m','immediate','-w','stop']);
  rmSync(dir,{recursive:true,force:true});
});
