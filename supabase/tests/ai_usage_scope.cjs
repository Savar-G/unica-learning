// Local synthetic PostgreSQL only. Creates and stops its own temporary cluster. Never reads project credentials.
// Run: node supabase/tests/ai_usage_scope.cjs
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir, userInfo } = require('node:os');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const dir = mkdtempSync(join(tmpdir(), 'ai-sql-'));
let started = false;
const run = (bin, args) => execFileSync(bin, args, { encoding: 'utf8', stdio: 'pipe' });
(async () => {
  let db;
  try {
    run('initdb', ['-D', join(dir, 'db'), '-A', 'trust', '--no-locale']);
    run('pg_ctl', ['-D', join(dir, 'db'), '-l', join(dir, 'server.log'), '-o', `-k ${dir} -p 55431 -c listen_addresses=''`, '-w', 'start']);
    started = true;
    db = new Client({ host: dir, port: 55431, user: userInfo().username, database: 'postgres' }); await db.connect();
    await db.query(`
      create role anon; create role authenticated; create role service_role;
      create function public.is_admin() returns boolean language sql as $$ select coalesce(nullif(current_setting('test.admin', true), ''), 'on') = 'on' $$;
      create function public.fence_family_write() returns trigger language plpgsql as $$ begin return new; end $$;
      create function public.fence_child_delete_write() returns trigger language plpgsql as $$ begin return new; end $$;
      create table parents(id uuid primary key, name text, email text);
      create table children(id uuid primary key, parent_id uuid references parents(id), first_name text, unique(id,parent_id));
      create table test_accounts(parent_id uuid); create table admin_users(user_id uuid);
      create table child_plan_states(parent_id uuid, kind text, monthly_cents integer, ends_at timestamptz);
      create table workbook_run_ai_calls(created_at timestamptz, kind text, provider text, model text, usd numeric, requests integer, parent_id uuid, child_id uuid, run_id uuid);
      create table maya_calls(id uuid, kind text);
      create table maya_spend(created_at timestamptz, what text, cost_micros bigint, parent_id uuid, child_id uuid, call_id uuid);
      create table scan_marking_spend(created_at timestamptz, model text, charged_micros bigint);
      create table parent_explanation_spend(created_at timestamptz, model text, charged_micros bigint);
      create table workbooks(parent_id uuid, child_id uuid, shipped_at timestamptz);
      create table budget_entries(category_id uuid, amount_cad numeric, deleted_at timestamptz, kind text, entry_date date);
      create table budget_categories(id uuid, name text);
    `);
    const baseline = readFileSync('supabase/migrations/20261112060000_ai_usage_events.sql', 'utf8');
    await db.query(baseline.slice(0, baseline.indexOf('-- p_day_starts:')));
    const p = '00000000-0000-4000-8000-000000000001', t = '00000000-0000-4000-8000-000000000002';
    const c1 = '00000000-0000-4000-8000-000000000011', c2 = '00000000-0000-4000-8000-000000000012', ct = '00000000-0000-4000-8000-000000000021';
    await db.query('insert into parents values ($1,\'Real\',\'real@example.invalid\'),($2,\'Test\',\'test@example.invalid\')', [p,t]);
    await db.query('insert into children values ($1,$2,\'Ada\'),($3,$2,\'Ben\'),($4,$5,\'Test child\')', [c1,p,c2,ct,t]);
    await db.query('insert into test_accounts values ($1)', [t]);
    await db.query("insert into ai_usage_events(created_at,feature,provider,model,cost_usd) values ('2026-11-16T18:00Z','other','openrouter','old',0.5)");
    await db.query(readFileSync('supabase/migrations/20261116183028_ai_usage_scope_and_receipts.sql','utf8'));
    assert.equal((await db.query("select usage_context from ai_usage_events where model='old'")).rows[0].usage_context, 'unknown');
    const runId = '00000000-0000-4000-8000-000000000099';
    const rows = [
      [p,c1,'production','workbook',1,'provider','a','gen-1','workbook_run',runId],
      [p,c2,'production','maya',3,'provider','a','gen-2',null,null],
      [t,ct,'production','maya',7,'provider','a','gen-3',null,null],
      [null,null,'practice','maya',4,'provider','a','gen-4',null,null],
      [null,null,'evaluation','marking',2,'provider','b','gen-5',null,null],
      [null,null,'unknown','other',5,'unknown',null,null,null,null],
      [p,c2,'production','other',null,'unknown',null,null,null,null],
      [null,null,'unknown','other',null,'unknown',null,null,null,null],
    ];
    for (const [i,r] of rows.entries()) await db.query(`insert into ai_usage_events(created_at,parent_id,child_id,usage_context,feature,cost_usd,cost_basis,key_id,generation_id,source_kind,source_id,provider,model) values ('2026-11-16T18:00Z',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'model')`, [...r.slice(0,6),r[6]?.repeat(64)??null,...r.slice(7),i===6?'subscription':'openrouter']);
    await db.query("insert into ai_usage_events(created_at,feature,provider,model,cost_usd,cost_basis,key_id,generation_id) values ('2026-11-02T18:00Z','maya','openrouter','model',99,'provider',repeat('a',64),'outside-range')");
    await db.query("insert into workbook_run_ai_calls values ('2026-11-16T18:00Z','write','openrouter','model',100,1,$1,$2,$3)", [p,c1,runId]);
    await db.query("insert into maya_spend values ('2026-11-16T18:00Z','voice',1400000,$1,$2,null)", [p,c1]);
    await db.query("insert into maya_calls values ($1,'admin_test')", [runId]);
    await db.query("insert into ai_usage_events(created_at,feature,provider,model,cost_usd,usage_context,parent_id,child_id,source_kind,source_id) values ('2026-11-16T18:00Z','maya','openrouter','admin-test',0,'production',$1,$2,'maya_call',$3)", [p,c1,runId]);
    const report = async (tests) => (await db.query("select admin_ai_usage('2026-11-16T08:00Z','2026-11-17T08:00Z',$1,1.4,array['2026-11-16T08:00Z'::timestamptz]) as v", [tests])).rows[0].v;
    const all = await report(true), filtered = await report(false);
    assert.equal(Number(all.totals.cost_usd),23.5); assert.equal(Number(filtered.totals.cost_usd),16.5);
    assert.equal(all.totals.subscription_calls,1); assert.equal(all.totals.unpriced_calls,1);
    assert.deepEqual(Object.fromEntries(all.by_context.map(r=>[r.context,Number(r.cost_usd)])), {production:4,test:0,'test-family':7,practice:4,evaluation:2,unknown:6.5});
    for (const dim of ['by_context','by_key','by_basis','by_feature','by_model']) assert.equal(all[dim].reduce((s,r)=>s+Number(r.cost_usd),0),23.5);
    assert.equal(all.dimensions.reduce((s,r)=>s+Number(r.cost_usd),0),23.5);
    assert.equal(Number(all.lifetime_receipts.find(r=>r.key_id==='a'.repeat(64)).cost_usd),114);
    assert.deepEqual(filtered.lifetime_receipts,all.lifetime_receipts);
    const bounds = [{parent_id:p,from:'2026-11-16T17:00Z',to:'2026-11-17T17:00Z'},{parent_id:t,from:'2026-11-16T19:00Z',to:'2026-11-17T19:00Z'}];
    const child = (await db.query('select admin_child_unit_cost($1::jsonb,\'2026-11\') as v',[JSON.stringify(bounds)])).rows[0].v;
    assert.equal(child.sums.length,2);
    const ada = child.sums.find(r=>r.child_id===c1), ben = child.sums.find(r=>r.child_id===c2);
    assert.equal(Number(ada.ai_usd),1); assert.equal(Number(ada.voice_micros),1400000);
    assert.equal(ada.details.find(r=>r.feature==='workbook').model,'model');
    assert.equal(ada.details.find(r=>r.model==='admin-test').context,'test');
    assert.equal(Number(ben.ai_usd),3); assert.equal(ben.details.length,2);
    await assert.rejects(db.query("insert into ai_usage_events(feature,provider,model,generation_id) values ('other','openrouter','repeat','gen-1')"), e=>e.code==='23505');
    await db.query("insert into ai_usage_events(feature,provider,model,receipt_id) values ('other','subscription','receipt','abcdef12-1234-4123-8123-123456789abc')");
    await assert.rejects(db.query("insert into ai_usage_events(feature,provider,model,receipt_id) values ('other','subscription','receipt','abcdef12-1234-4123-8123-123456789abc')"), e=>e.code==='23505');
    await db.query("insert into ai_usage_events(created_at,feature,provider,model,cost_usd) select '2026-11-16T18:00Z','other','openrouter','extra-'||i,0 from generate_series(1,5001) i");
    const capped=await report(true);
    assert.equal(capped.dimensions.length,5000); assert.equal(capped.dimensions_more,true);
    assert.equal(Number(capped.totals.cost_usd),23.5);
    assert.equal(capped.by_context.reduce((s,r)=>s+Number(r.calls),0),Number(capped.totals.calls));
    await db.query("set test.admin = 'off'");
    await assert.rejects(report(true),e=>e.code==='42501');
    console.log('PASS: account-independent scope, complete dimension sums, sibling attribution, family-local bounds, estimates, unpriced/subscription calls, legacy deduplication and admin refusal. Synthetic PostgreSQL only.');
  } finally { if(db) await db.end(); if(started) run('pg_ctl',['-D',join(dir,'db'),'-m','immediate','-w','stop']); rmSync(dir,{recursive:true,force:true}); }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
