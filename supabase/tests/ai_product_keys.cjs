// Local synthetic PostgreSQL only. No project credentials or hosted connection.
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir, userInfo } = require('node:os');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const dir = mkdtempSync(join(tmpdir(), 'ai-product-keys-'));
const run = (bin, args) => execFileSync(bin, args, { encoding: 'utf8', stdio: 'pipe' });
const historical = ['main', 'marking', 'explanations', 'decisions', 'local', 'anthropic', 'unknown'];
const added = ['maya', 'workbook', 'assessments', 'profiles'];
let started = false, db;
(async () => {
  try {
    run('initdb', ['-D', join(dir, 'db'), '-A', 'trust', '--no-locale']);
    run('pg_ctl', ['-D', join(dir, 'db'), '-l', join(dir, 'server.log'), '-o', `-k ${dir} -p 55432 -c listen_addresses=''`, '-w', 'start']);
    started = true;
    db = new Client({ host: dir, port: 55432, user: userInfo().username, database: 'postgres' });
    await db.connect();
    await db.query(`create table public.ai_usage_events (
      key_alias text not null default 'unknown',
      constraint ai_usage_events_key_alias_check check (key_alias in ('main','marking','explanations','decisions','local','anthropic','unknown'))
    )`);
    for (const alias of historical) await db.query('insert into ai_usage_events(key_alias) values ($1)', [alias]);
    await db.query(readFileSync('supabase/migrations/20261116213019_ai_product_key_aliases.sql', 'utf8'));
    assert.equal((await db.query('select count(*)::int as n from ai_usage_events')).rows[0].n, historical.length);
    for (const alias of added) await db.query('insert into ai_usage_events(key_alias) values ($1)', [alias]);
    assert.deepEqual((await db.query('select key_alias from ai_usage_events order by key_alias')).rows.map(r => r.key_alias), [...historical, ...added].sort());
    await assert.rejects(db.query("insert into ai_usage_events(key_alias) values ('unassigned-secret-like-value')"), e => e.code === '23514');
    assert.equal((await db.query('select count(*)::int as n from ai_usage_events')).rows[0].n, 11);
    console.log('PASS: alias migration retains 7 historical rows, accepts 4 product labels, and refuses an unregistered label. Local PostgreSQL only.');
  } finally {
    if (db) await db.end();
    if (started) run('pg_ctl', ['-D', join(dir, 'db'), '-m', 'immediate', '-w', 'stop']);
    rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
