// Standalone disposable PostgreSQL. No hosted URL, environment file or private input is read.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import pg from 'pg';
import { build } from 'esbuild';
const { Client } = pg;
const dir = mkdtempSync(join(tmpdir(), 'unica-history-probe-'));
const pgBin = process.env.AI_HISTORY_PROBE_PG_BIN || '/opt/homebrew/bin';
const run = (name,args) => execFileSync(join(pgBin,name),args,{ encoding:'utf8', stdio:['ignore','pipe','pipe'] });
let started = false, stage = 'setup';
(async () => {
  const bundle = join(dir,'fixtures.cjs');
  await build({ stdin:{ contents:'export {historyFixture} from "./src/lib/ai-cost-history.fixtures"; export {parseHistoryView,historySum} from "./src/lib/ai-cost-history";', resolveDir:process.cwd() }, outfile:bundle, bundle:true,platform:'node',format:'cjs' });
  const { historyFixture, parseHistoryView, historySum } = (await import(pathToFileURL(bundle).href)).default;
  run('initdb',['-D',join(dir,'data'),'-A','trust','--no-locale']);
  run('pg_ctl',['-D',join(dir,'data'),'-l',join(dir,'log'),'-o',`-k ${dir} -h '' -p 55491`,'-w','start']); started = true;
  const config = { host:dir, port:55491, database:'postgres' };
  const db = new Client(config); await db.connect();
  const other = new Client(config); await other.connect();
  const service = async (name,args,client=db) => {
    await client.query('set role service_role');
    try { return await client.query(`select public.${name}(${args.map((_,i) => '$'+(i+1)).join(',')}) as result`,args); }
    finally { await client.query('reset role'); }
  };
  const begin = f => service('begin_ai_cost_history',[JSON.stringify(f.manifest)]);
  const batch = (f,rows=f.rows,client=db) => service('ingest_ai_cost_history_rows',[f.manifest.export_id,JSON.stringify(rows)],client);
  const finalize = (f,client=db) => service('finalize_ai_cost_history',[f.manifest.export_id],client);
  const read = async id => {
    await db.query('set role authenticated'); await db.query("set test.admin = 'true'");
    try { return parseHistoryView((await db.query('select public.admin_ai_cost_history($1::uuid) as view',[id??null])).rows[0].view); }
    finally { await db.query('reset role'); }
  };
  const rowCount = async f => (await db.query('select count(*)::int as n from public.ai_cost_history_rows where export_id=$1',[f.manifest.export_id])).rows[0].n;
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  try {
    await db.query(`create role anon; create role authenticated; create role service_role bypassrls;
      create function public.is_admin() returns boolean language sql stable as $$ select coalesce(current_setting('test.admin',true),'false') = 'true' $$;
      create table public.parents(id uuid primary key,name text);
      create table public.children(id uuid primary key,parent_id uuid references public.parents on delete cascade,first_name text);
      create table public.ai_usage_events(id bigint generated always as identity,provider text,generation_id text,feature text,parent_id uuid references public.parents on delete cascade,child_id uuid references public.children on delete cascade,cost_usd numeric);
      create index on public.ai_usage_events(provider,generation_id);
      create table public.test_accounts(parent_id uuid); create table public.admin_users(user_id uuid);
      create table public.maya_spend(cost_usd numeric); insert into public.maya_spend values(9.75);
      create table public.scan_marking_spend(cost_usd numeric); insert into public.scan_marking_spend values(8.125);
      insert into public.ai_usage_events(provider,generation_id,feature,cost_usd) values('openrouter','gen-existing-app','maya',0.37);`);
    await db.query(readFileSync('supabase/migrations/20261116192429_openrouter_provider_receipts.sql','utf8'));
    await service('ingest_openrouter_provider_receipts',[JSON.stringify([{workspace_id:'baseline',generation_id:'gen-synthetic-baseline',occurred_at:'2026-11-16T12:00:00Z',model:'test/model',cost_usd:'0.77'}])]);
    const oldTotals = async () => (await db.query(`select (select sum(cost_usd)::text from public.ai_usage_events) as app,
      (select sum(cost_usd)::text from public.maya_spend) as maya,(select sum(cost_usd)::text from public.scan_marking_spend) as marking,
      (select count(*)::int from public.openrouter_provider_receipts) as canonical,
      (select coalesce(sum(cost_usd),0)::text from public.openrouter_provider_receipts) as canonical_cost`)).rows[0];
    const before = await oldTotals();
    stage = 'migration preserves ordinary totals';
    await db.query(readFileSync(process.env.AI_HISTORY_PROBE_MIGRATION || 'supabase/migrations/20261117030145_ai_cost_history.sql','utf8'));
    assert.deepEqual(await oldTotals(),before);
    const f = historyFixture();
    stage = 'immutable manifest and validation';
    await begin(f); await begin(f);
    await assert.rejects(begin({ ...f,manifest:{ ...f.manifest,known_cost_usd:'1' } }));
    for (const key of ['workspace_id','source_kind','headers','rows_sha256','captured_at','row_time_zone','verified_at','export_id']) {
      const manifest = { ...f.manifest,export_id:id(10),[key]:key === 'captured_at' || key === 'row_time_zone' ? 'UTC' : null };
      await assert.rejects(begin({ ...f,manifest }));
    }
    await assert.rejects(begin({ ...f,manifest:{ ...f.manifest,export_id:id(11),source:{...f.manifest.source,sha256:null} } }));
    stage = 'bounded atomic batches and privacy';
    await assert.rejects(batch(f,Array(129).fill(f.rows[0])));
    await assert.rejects(batch(f,[{ ...f.rows[0],private:'dropped' }]));
    for (const patch of [{created_at_text:'2026-02-30 01:00:00.000'},{api_key_label:'sk-or-secret'},{cost_total_text:'-1'},{model_permaslug:'<bad>'}]) await assert.rejects(batch(f,[{...f.rows[0],...patch}]));
    await batch(f,[f.rows[3]]); await batch(f,[f.rows[3]]);
    // The first new row must roll back when a later row conflicts in the same transaction.
    await assert.rejects(batch(f,[f.rows[0],{...f.rows[3],cost_total_text:'1'}]));
    assert.equal(await rowCount(f),1);
    stage = 'hidden incomplete export';
    assert.equal((await read()).selection,'empty'); assert.equal((await read(f.manifest.export_id)).selection,'missing');
    await assert.rejects(finalize(f));
    stage = 'concurrent retries and finalization';
    const settled = await Promise.allSettled([batch(f,f.rows.slice(0,3),other),finalize(f)]);
    assert.equal(settled[0].status,'fulfilled');
    await finalize(f); await finalize(f);
    await Promise.all([batch(f,[...f.rows].reverse()),batch(f,f.rows,other)]);
    assert.equal(await rowCount(f),4);
    let view = await read();
    assert.equal(view.selected.export_id,f.manifest.export_id);
    assert.equal(view.selected.known_cost_usd,'0.300000000000000000001');
    assert.equal(view.selected.unknown_cost_count,1); assert.equal(view.selected.unknown_time_count,4);
    assert.equal(view.selected.matched_rows,0); assert.equal(view.selected.unknown_child_rows,4);
    stage = 'same-total content hash mismatch';
    const altered = historyFixture(undefined,id(2)); await begin(altered);
    await batch(altered,altered.rows.map((r,i) => i ? r : {...r,api_key_label:'changed-safe-label'}));
    await assert.rejects(finalize(altered)); assert.equal((await read(id(2))).selection,'missing');
    stage = 'overlap remains separate and missing selection stays missing';
    const overlap = historyFixture(undefined,id(3)); await begin(overlap); await batch(overlap); await finalize(overlap);
    view = await read(id(3)); assert.equal(view.selected.rows,4); assert.equal(view.selected.known_cost_usd,f.manifest.known_cost_usd);
    assert.equal(view.exports.length,2); assert.equal((await read(id(99))).selection,'missing');
    stage = 'current exact attribution with ambiguity and no row multiplication';
    await db.query('insert into public.parents values($1,$2)',[id(101),'Synthetic parent']);
    await db.query('insert into public.children values($1,$2,$3)',[id(102),id(101),'Synthetic child']);
    const addApp = (generation,provider,parent,child,feature='maya') => db.query('insert into public.ai_usage_events(provider,generation_id,feature,parent_id,child_id) values($1,$2,$3,$4,$5)',[provider,generation,feature,parent,child]);
    await addApp(f.rows[0].generation_id,'openrouter',id(101),id(102));
    await addApp(f.rows[1].generation_id,'openrouter',id(101),null);
    await addApp(f.rows[2].generation_id,'anthropic',id(101),id(102));
    await addApp(f.rows[3].generation_id,'openrouter',id(101),id(102));
    await addApp(f.rows[3].generation_id,'openrouter',id(101),id(102),'report');
    view = await read(f.manifest.export_id);
    assert.equal(view.selected.rows,4); assert.equal(view.selected.matched_rows,2); assert.equal(view.selected.ambiguous_rows,1);
    assert.equal(view.selected.unknown_family_rows,2); assert.equal(view.selected.unknown_child_rows,3);
    assert.equal(view.selected.ownership.reduce((s,r) => s+r.rows,0),4);
    assert.equal(view.selected.known_cost_usd,f.manifest.known_cost_usd);
    stage = 'canonical richer receipt still writable';
    // Imports and reads must preserve the nonzero existing canonical subtotal before any new webhook receipt.
    assert.deepEqual(await oldTotals(),before);
    // A later webhook supplies model, event time, key identity and cost components. The CSV did not reserve this identity.
    const receipt = {workspace_id:f.manifest.workspace_id,generation_id:f.rows[0].generation_id,occurred_at:'2026-11-16T12:00:00Z',model:'test/richer-model',api_key_id:'synthetic-key-id',cost_usd:0.12,input_cost_usd:0.05,output_cost_usd:0.07,input_tokens:42,output_tokens:17};
    await service('ingest_openrouter_provider_receipts',[JSON.stringify([receipt])]);
    await service('ingest_openrouter_provider_receipts',[JSON.stringify([receipt])]);
    assert.equal((await db.query('select count(*)::int n from public.openrouter_provider_receipts')).rows[0].n,2);
    stage = 'cross-workspace ambiguity';
    await service('ingest_openrouter_provider_receipts',[JSON.stringify([{...receipt,workspace_id:'other-workspace',generation_id:f.rows[1].generation_id}])]);
    view = await read(f.manifest.export_id); assert.equal(view.selected.matched_rows,1); assert.equal(view.selected.ambiguous_rows,2);
    stage = 'deleted ownership does not survive in evidence';
    await db.query('delete from public.parents where id=$1',[id(101)]);
    view = await read(f.manifest.export_id); assert.equal(view.selected.matched_rows,0); assert.equal(view.selected.unknown_family_rows,4); assert.equal(view.selected.unknown_child_rows,4);
    assert.equal(view.selected.known_cost_usd,f.manifest.known_cost_usd);
    stage = 'no writes to existing app or legacy totals';
    const after = await oldTotals();
    assert.deepEqual({...after,canonical:before.canonical,canonical_cost:before.canonical_cost},before);
    assert.equal(after.canonical,before.canonical+2);
    assert.equal(historySum([after.canonical_cost]),historySum([before.canonical_cost,'0.12','0.12']));
    stage = 'group, row and completed-list limits';
    const capped = historyFixture(Array.from({length:1005},(_,i) => ({generation_id:`gen-synthetic-cap-${i}`,cost_total:'0.000001000',model_permaslug:`test/model-${i}`,api_key_name:`synthetic label ${i}`})),id(200));
    await begin(capped);
    for (let i=0;i<capped.rows.length;i+=128) await batch(capped,capped.rows.slice(i,i+128));
    await finalize(capped);
    view = await read(id(200));
    assert.equal(view.selected.rows,1005); assert.equal(view.selected.models.length,1000); assert.equal(view.selected.keys.length,1000);
    assert.equal(view.selected.omitted_groups,10); assert.equal(view.selected.technical_rows.length,100); assert.equal(view.selected.omitted_rows,905);
    assert.equal(historySum([view.selected.known_cost_usd]),'0.001005');
    for (let n=201;n<251;n++) {
      const small = historyFixture([{generation_id:'gen-synthetic-list-limit',cost_total:'0'}],id(n));
      await begin(small); await batch(small); await finalize(small);
    }
    view = await read(); assert.equal(view.exports.length,50); assert.equal(view.omitted_exports,3);
    assert.equal((await read(f.manifest.export_id)).selected.export_id,f.manifest.export_id);
    stage = 'privileges and immutable storage';
    for (const role of ['anon','authenticated','service_role']) {
      for (const table of ['ai_cost_history_manifests','ai_cost_history_rows','ai_cost_history_completions']) {
        for (const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed',[role,'public.'+table,privilege])).rows[0].allowed,false);
      }
    }
    for (const role of ['anon','authenticated']) {
      await db.query('set role '+role); await db.query("set test.admin = 'false'");
      await assert.rejects(db.query('select public.begin_ai_cost_history($1)',[JSON.stringify(f.manifest)]));
      await assert.rejects(db.query('select public.ingest_ai_cost_history_rows($1,$2)',[f.manifest.export_id,JSON.stringify(f.rows)]));
      await assert.rejects(db.query('select public.finalize_ai_cost_history($1)',[f.manifest.export_id]));
      await assert.rejects(db.query('select public.admin_ai_cost_history(null)'));
      await db.query('reset role');
    }
    for (const table of ['ai_cost_history_manifests','ai_cost_history_rows','ai_cost_history_completions']) {
      await assert.rejects(db.query(`delete from public.${table}`));
      const column = table === 'ai_cost_history_rows' ? 'evidence' : 'export_id';
      await assert.rejects(db.query(`update public.${table} set ${column}=${column}`));
    }
    const funcs = await db.query("select proconfig from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and (proname like '%ai_cost_history%' or proname like '%ai_history%')");
    assert.ok(funcs.rows.length >= 7); assert.ok(funcs.rows.every(r => r.proconfig.includes('search_path=""')));
    console.log('PASS: local synthetic manifest/row privacy, exact decimals, hidden interruption, atomic conflict, retry/concurrency/finalization, content hash, overlapping snapshots, exact/ambiguous/deleted ownership, unchanged old totals, later richer canonical receipt, RLS/grants and append-only storage. No hosted proof.');
  } finally { await other.end(); await db.end(); }
})().catch(e => { console.error(`FAIL: local history probe at ${stage}: ${e.message}`); process.exitCode=1; }).finally(() => {
  if (started) run('pg_ctl',['-D',join(dir,'data'),'-m','immediate','-w','stop']);
  rmSync(dir,{ recursive:true,force:true });
});
