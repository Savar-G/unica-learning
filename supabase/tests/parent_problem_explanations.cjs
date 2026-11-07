// #675. Disposable local PostgreSQL only. Starts no TCP listener and accepts no URL, password or hosted target.
const { Client } = require('pg');
const { build } = require('esbuild');
const { Module } = require('node:module');
const { mkdtempSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const bin = '/opt/homebrew/opt/postgresql@18/bin';
const temp = mkdtempSync('/tmp/pd675-pg-'), data = path.join(temp, 'data'), socket = path.join(temp, 'socket');
mkdirSync(socket);
const sql = name => readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
const migration = sql('20261106220000_parent_problem_explanations.sql');
let started = false, db, production, passed = 0, failed = 0;
const clients = new Set();
async function open() { const c = new Client({ host: socket, port: 51475, database: 'postgres', user: process.env.USER }); await c.connect(); await c.query("set statement_timeout='8s'"); clients.add(c); return c; }
async function close(c) { await c.end(); clients.delete(c); }
const call = async (action, f, token = null, extra = {}, c = db) => (await c.query('select public.parent_explanation_command($1,$2,$3,$4,$5) v', [action, f?.p ?? null, f?.photo ?? null, token, { itemId: f?.item, version: f?.version, context: f?.context, ...extra }])).rows[0].v;
async function test(name, run) { try { await run(); passed++; console.log('PASS', name); } catch (e) { failed++; console.log('FAIL', name, e.stack); } }
async function price(maximum = 100_000) { await db.query("update parent_explanation_prices set enabled=true,maximum_micros=$1,verified_at=clock_timestamp(),evidence='Synthetic bound only; not production pricing'", [maximum]); }
async function clearBudget() { await db.query('delete from parent_explanation_dispatches'); await db.query('delete from parent_explanation_spend'); }
async function fixture(options = {}) {
 const p = options.p ?? randomUUID(), c = randomUUID(), w = randomUUID(), page = randomUUID(), photo = randomUUID(), item = 'item1', token = randomUUID();
 await db.query('insert into auth.users values($1) on conflict do nothing', [p]); await db.query('insert into parents values($1,null) on conflict do nothing', [p]); await db.query('insert into children values($1,$2)', [c, p]);
 await db.query("insert into workbooks(id,parent_id,child_id,status,printed_revision) values($1,$2,$3,'shipped','immutable')", [w, p, c]);
 await db.query("insert into workbook_pages(id,workbook_id,parent_id,page_number,print_contract,image_width,image_height) values($1,$2,$3,2,'{}',1000,1400)", [page, w, p]);
 const identity = { workbookId: w, printedRevision: 'immutable', pageId: page, itemId: item };
 const pkg = { ...production.sampleWorkbook({parentId:p,childId:c,workbookId:w,qrTokens:['sample-token-00000001','sample-token-00000002','sample-token-00000003']}).pages[1].questions[0].package, id:item };
 await db.query('insert into workbook_questions(parent_id,workbook_id,page_id,question_number,package,schema_version) values($1,$2,$3,1,$4,2)', [p, w, page, pkg]);
 await db.query("insert into scan_photos(id,parent_id,child_id,page_id,workbook_id,printed_revision,state,reserved_bytes,width,height,sent_at) values($1,$2,$3,$4,$5,'immutable','saved',0,1000,1400,now())", [photo, p, c, page, w]);
 const expected = { identity, number: 1, method: 'code' }, observation = { identity, certainty: 'certain', state: 'scored', result: 'wrong', resultVersion: 2, readAnswerText: '41' };
 const m = (await db.query("insert into scan_marking_items(parent_id,child_id,workbook_id,printed_revision,page_id,item_id,expected,observation,result_version) values($1,$2,$3,'immutable',$4,$5,$6,$7,2) returning id", [p, c, w, page, item, expected, observation])).rows[0].id;
 const f = { p, c, w, page, photo, item, token, version: 2, m, pkg };
 f.context = (await call('context', f)).context; return f;
}
const explanation = { steps: ['Add the ones and carry one ten.', 'Add the tens.'], say: 'Let us start with the ones.' };
const claim = f => call('claim', f, f.token);
const admit = (f, c = db) => call('admit', f, f.token, { model: 'anthropic/claude-haiku-5.5' }, c);
async function waiting(c) { for (let n = 0; n < 1000; n++) { const r = await db.query('select wait_event_type from pg_stat_activity where pid=$1', [c.processID]); if (r.rows[0]?.wait_event_type === 'Lock') return; } throw Error('Expected lock wait did not occur'); }
(async () => {
 execFileSync(path.join(bin, 'initdb'), ['-D', data, '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'ignore' });
 execFileSync(path.join(bin, 'pg_ctl'), ['-D', data, '-l', path.join(temp, 'postgres.log'), '-o', `-h '' -k ${socket} -p 51475 -c shared_buffers=16MB -c max_connections=12`, '-w', 'start'], { stdio: 'ignore' }); started = true;
 const built = await build({stdin:{contents:`export {explainParentProblem} from './src/lib/parent-problem-explanation'; export {parentExplanationStore} from './src/lib/parent-problem-explanation-store'; export {fakeAiClient} from './src/lib/ai-client-fake'; export {sampleWorkbook} from './src/lib/workbook-sample';`,resolveDir:root,sourcefile:'pd675-harness.ts',loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'no-server-only',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'',loader:'js'}));}}]});
 const compiled = new Module(path.join(root,'supabase/tests/.pd675-bundle.cjs'),module); compiled.filename=path.join(root,'supabase/tests/.pd675-bundle.cjs');compiled.paths=module.paths;compiled._compile(built.outputFiles[0].text,compiled.filename);production=compiled.exports;
 db = await open();
 for (const role of ['anon', 'authenticated', 'service_role']) await db.query(`create role ${role}${role === 'service_role' ? ' bypassrls' : ''}`);
 await db.query(readFileSync(path.join(__dirname, 'scan_marking_fixture.sql'), 'utf8'));
 await db.query('alter table workbook_questions add column schema_version smallint not null default 2');
 const family = sql('20261011_add_family_deletion.sql');
 for (const name of ['assert_family_writable', 'fence_family_write']) { const f = family.match(new RegExp('create function public\\.' + name + '\\([\\s\\S]*?end \\$\\$;')); assert(f); await db.query(f[0]); }
 await db.query(sql('20261029_add_learning_events.sql').replace('alter table public.children add constraint children_id_parent_key unique (id, parent_id);', '').replace('alter table public.assessments add constraint assessments_id_child_key unique (id, child_id);', ''));
 await db.query(sql('20261102_scan_page_photos.sql'));
 await db.query(sql('20261105_scan_crops.sql'));
 await db.query(sql('20261105_scan_stack.sql'));
 const child = sql('20261105_child_delete.sql');
 for (const name of ['child_delete_row_child', 'fence_child_delete_write']) { const f = child.match(new RegExp('create function public\\.' + name + '\\([\\s\\S]*?end \\$\\$;')); assert(f); await db.query(f[0]); }
 await db.query(sql('20261105_scan_marking.sql'));
 await db.query(sql('20261106_scan_mark_changes.sql'));
 await db.query(migration);
 await test('disabled price, service-only RPC/table rights and RLS fail closed', async () => {
  const f = await fixture(); assert.equal(await claim(f), 'claimed'); assert.equal(await admit(f), 'unavailable');
  for (const role of ['anon', 'authenticated', 'service_role']) {
   const c = await open(); try { await c.query('set role ' + role);
    if (role !== 'service_role') await assert.rejects(() => call('context', f, null, {}, c), e => e.code === '42501');
    for (const t of ['parent_explanation_prices', 'parent_explanations', 'parent_explanation_spend', 'parent_explanation_dispatches']) {
     assert.equal((await db.query('select relrowsecurity ok from pg_class where oid=$1::regclass', ['public.' + t])).rows[0].ok, true);
     if (role !== 'service_role') await assert.rejects(() => c.query('select * from public.' + t), e => e.code === '42501');
     await assert.rejects(() => c.query('delete from public.' + t), e => e.code === '42501');
    }
   } finally { await close(c); }
  }
 });
 await price();
 await test('simultaneous claim, durable success and current-context cached read', async () => {
  const f = await fixture(), a = await open(), b = await open();
  try { await a.query('begin'); assert.equal(await call('claim', f, f.token, {}, a), 'claimed'); const pending = call('claim', f, randomUUID(), {}, b); await waiting(b); await a.query('commit'); assert.equal(await pending, 'busy'); }
  finally { await a.query('rollback'); await close(a); await close(b); }
  const dispatch = await admit(f); assert(dispatch.dispatch); assert.equal(await call('finish', f, f.token, { explanation }), true);
  assert.deepEqual(await call('read', f), explanation); assert.deepEqual(await claim(f), { explanation });
  assert.equal((await db.query('select count(*)::int n from parent_explanation_dispatches where item_id=$1', [f.m])).rows[0].n, 1);
 });
 await test('wrong-to-right before dispatch, after dispatch and on cached read refuses the old version', async () => {
  for (const phase of ['before', 'after', 'cache']) {
   const f = await fixture(); await claim(f); if (phase !== 'before') await admit(f); if (phase === 'cache') assert.equal(await call('finish', f, f.token, { explanation }), true);
   // Use the production public marking-correction RPC, without changing scoring semantics.
   const change = (await db.query("select scan_marking_command('change',$1,$2,null,$3) v", [f.p, f.photo, { itemId: f.item, version: 2, result: 'right' }])).rows[0].v;
   assert.equal(change.status, 'saved'); assert.equal(await call('context', f), null); assert.equal(await admit(f), null); assert.equal(await call('finish', f, f.token, { explanation }), null); assert.equal(await call('read', f), null);
  }
 });
 await test('wrong reading, question version and immutable print changes cannot reuse the old cache', async () => {
  const f = await fixture(); await claim(f); await call('finish', f, f.token, { explanation });
  await db.query("update scan_marking_items set observation=jsonb_set(observation,'{readAnswerText}','\"40\"') where id=$1", [f.m]);
  assert.equal(await call('read', f), 'refused'); const newer = await call('context', f); assert.notEqual(newer.context, f.context);
  f.context = newer.context; assert.equal(await claim(f), 'claimed');
  await db.query("update workbook_questions set package=jsonb_set(package,'{text}','\"Add 24 and 18.\"') where page_id=$1", [f.page]); assert.equal(await call('finish', f, f.token, { explanation }), 'refused');
  f.context = (await call('context', f)).context; await claim(f);
  await db.query("update workbooks set printed_revision='new-print' where id=$1", [f.w]); assert.equal(await call('context', f), null);
 });
 await test('other-family, sibling mismatch, unavailable state and missing reading never claim', async () => {
  const f = await fixture(), g = await fixture({ p: f.p });
  assert.equal(await call('context', { ...f, p: randomUUID() }).catch(() => null), null);
  await db.query('update scan_photos set child_id=$1 where id=$2', [g.c, f.photo]); assert.equal(await call('context', f), null);
  await db.query('update scan_photos set child_id=$1 where id=$2', [f.c, f.photo]);
  for (const obs of [{ certainty: 'uncertain' }, { certainty: 'certain', state: 'pending', result: 'wrong', readAnswerText: '41' }, { state: 'unscored', result: 'wrong', readAnswerText: '41' }, { state: 'scored', result: 'wrong', readAnswerText: null }, { state: 'scored', result: 'right', readAnswerText: '42' }]) {
   await db.query('update scan_marking_items set observation=observation||$1 where id=$2', [obs, f.m]); assert.equal(await call('context', f), null);
  }
 });
 await test('family and child deletion fences refuse reads and late saves; cascades preserve anonymous spend', async () => {
  for (const which of ['family', 'child']) {
   const f = await fixture(); await claim(f); const held = await admit(f); assert(held.dispatch);
   if (which === 'family') await db.query('update parents set deletion_requested_at=now() where id=$1', [f.p]);
   else await db.query('insert into child_deletions(child_id,parent_id) values($1,$2)', [f.c, f.p]);
   assert.equal(await call('read', f).catch(() => null), null); assert.equal(await call('finish', f, f.token, { explanation }).catch(() => null), null);
   if (which === 'family') await db.query('delete from auth.users where id=$1', [f.p]); else await db.query('delete from children where id=$1', [f.c]);
   assert.equal((await db.query('select count(*)::int n from parent_explanations where item_id=$1', [f.m])).rows[0].n, 0);
   assert.equal((await db.query('select count(*)::int n from parent_explanation_dispatches where id=$1', [held.dispatch])).rows[0].n, 0);
   assert.equal((await db.query('select reserved_micros,charged_micros from parent_explanation_spend where id=$1', [held.dispatch])).rows[0].charged_micros, null);
   assert.equal(await call('settle', null, held.dispatch, { cost: 20_000 }), true);
  }
 });
 await clearBudget();
 await test('concurrent admission across two families cannot exceed USD 10 and null usage never frees money', async () => {
  await price(6_000_000); const f = await fixture(), g = await fixture(); await claim(f); await claim(g);
  const a = await open(), b = await open(); try {
   const values = await Promise.all([admit(f, a), admit(g, b)]); assert.equal(values.filter(v => v.dispatch).length, 1); assert.equal(values.filter(v => v === 'cap').length, 1);
   const id = values.find(v => v.dispatch).dispatch; await call('settle', null, id, { cost: null }); assert.equal(await admit(f), 'cap'); assert.equal(await admit(g), 'cap');
   assert.equal((await db.query('select sum(coalesce(charged_micros,reserved_micros))::bigint n from parent_explanation_spend')).rows[0].n, '6000000');
  } finally { await close(a); await close(b); }
 });
 await clearBudget(); await price();
 await test('each retry reserves independently; actual cost settles monotonically; overrun is recorded and stops dispatch', async () => {
  const f = await fixture(); await claim(f); const a = await admit(f), b = await admit(f); assert.notEqual(a.dispatch, b.dispatch);
  await call('settle', null, a.dispatch, { cost: null }); await call('settle', null, b.dispatch, { cost: 20_000 }); await call('settle', null, b.dispatch, { cost: 0 });
  assert.equal((await db.query('select charged_micros from parent_explanation_spend where id=$1', [b.dispatch])).rows[0].charged_micros, '20000');
  await call('settle', null, a.dispatch, { cost: 200_000 }); assert.equal((await db.query('select charged_micros from parent_explanation_spend where id=$1', [a.dispatch])).rows[0].charged_micros, '200000'); assert.equal(await admit(f), 'cap');
 });
 await clearBudget();
 await test('stale lease recovery fences the old worker and does not expire its unknown money hold', async () => {
  const f = await fixture(); await claim(f); const first = await admit(f);
  await db.query("update parent_explanations set lease_until=clock_timestamp()-interval '1 second' where item_id=$1", [f.m]);
  assert.equal(await call('finish', f, f.token, { explanation }), 'refused'); const old = f.token; f.token = randomUUID(); assert.equal(await claim(f), 'claimed');
  assert.equal(await call('finish', f, old, { explanation }), 'refused'); assert.equal(await call('release', f, old), 'refused'); assert.equal(await call('finish', f, f.token, { explanation }), true);
  assert.equal((await db.query('select charged_micros from parent_explanation_spend where id=$1', [first.dispatch])).rows[0].charged_micros, null);
 });
 await test('expired/future price and malformed output fail closed', async () => {
  const f = await fixture(); await claim(f);
  for (const offset of ["-interval '25 hours'", "+interval '1 hour'"]) { await db.query('update parent_explanation_prices set verified_at=clock_timestamp()' + offset); assert.equal(await admit(f), 'unavailable'); }
  await price();
  for (const invalid of [{ steps: [], say: 'short' }, { steps: ['x'.repeat(241)], say: 'short' }, { steps: ['good'], say: '<img>' }, { steps: ['good'], say: 'See https://evil.invalid' }, { steps: ['good'], say: 'short', answer: '99' }]) assert.equal(await call('finish', f, f.token, { explanation: invalid }), false);
 });
 await test('production module and Supabase adapter use the public RPC with fake AI, cache once and fence a correction during dispatch', async () => {
  await clearBudget(); await price();
  const store = production.parentExplanationStore({async rpc(name,args){assert.equal(name,'parent_explanation_command');try{return {data:(await db.query('select parent_explanation_command($1,$2,$3,$4,$5) v',[args.p_action,args.p_parent,args.p_photo,args.p_token,args.p_data])).rows[0].v,error:null};}catch(e){return {data:null,error:{code:e.code}};}}});
  const f = await fixture(), ref={parent:f.p,photo:f.photo,itemId:f.item,version:f.version};
  const fake=production.fakeAiClient({model:'anthropic/claude-haiku-5.5',answer:()=>explanation});
  const factory=before=>({client:{model:fake.model,async json(r,s){await before();return fake.json(r,s);}},costMicros:()=>20000});
  const run=()=>production.explainParentProblem(store,ref,randomUUID(),factory);
  const results=await Promise.all([run(),run()]);assert.deepEqual(results.map(r=>r.status).sort(),['busy','ready']);assert.equal(fake.requests.length,1);assert.equal(results.find(r=>r.status==='ready').correctAnswer,'425');assert.equal((await run()).status,'ready');assert.equal(fake.requests.length,1);
  const g=await fixture();let resume,notify;const began=new Promise(r=>{notify=r}),pendingAnswer=new Promise(r=>{resume=r});
  const pending=production.explainParentProblem(store,{parent:g.p,photo:g.photo,itemId:g.item,version:g.version},randomUUID(),before=>({client:{model:fake.model,async json(){await before();notify();return pendingAnswer;}},costMicros:()=>null}));
  await began;await db.query("select scan_marking_command('change',$1,$2,null,$3)",[g.p,g.photo,{itemId:g.item,version:2,result:'right'}]);resume(explanation);assert.equal((await pending).status,'refused');
  assert.equal((await db.query('select explanation from parent_explanations where item_id=$1',[g.m])).rows[0].explanation,null);
 });
 await test('lease expiry during global lock wait cannot admit a paid attempt', async () => {
  const f = await fixture(); await claim(f); await db.query("update parent_explanations set lease_until=clock_timestamp()+interval '500 milliseconds' where item_id=$1", [f.m]);
  const lock = await open(), worker = await open(); try {
   await lock.query('begin'); await lock.query("select pg_advisory_xact_lock(hashtextextended('parent-explanation-budget',0))"); const pending = admit(f, worker); await waiting(worker);
   await lock.query('select pg_sleep(0.6)'); await lock.query('commit'); assert.equal(await pending, 'refused');
  } finally { await lock.query('rollback'); await close(lock); await close(worker); }
 });
 await clearBudget();
 await test('UTC month is selected after global lock wait (synthetic database-clock seam, with old-order control)', async () => {
  // The RPC and lock path remain real. Only clock_timestamp is replaced to cross a month without changing the Mac clock.
  await db.query("create table public.pd675_clock_value(at timestamptz); insert into public.pd675_clock_value values('2026-11-30T23:59:59Z'); create function public.pd675_clock() returns timestamptz language sql volatile as 'select at from public.pd675_clock_value'");
  const body = migration.slice(migration.indexOf('create function public.parent_explanation_command'), migration.indexOf('revoke all on function public.parent_explanation_command')).replace('create function', 'create or replace function').replaceAll('clock_timestamp()', 'public.pd675_clock()');
  for (const control of [true, false]) {
   await db.query("update pd675_clock_value set at='2026-11-30T23:59:59Z'; update parent_explanation_prices set verified_at='2026-11-30T23:59:59Z',enabled=true,maximum_micros=100000");
   const source = control ? body.replace("    perform pg_advisory_xact_lock(hashtextextended('parent-explanation-budget',0));\n    -- Database clock", "    at_time:=public.pd675_clock();\n    perform pg_advisory_xact_lock(hashtextextended('parent-explanation-budget',0));\n    -- Database clock").replace('    at_time:=public.pd675_clock();\n    if cached.lease_until', '    if cached.lease_until') : body;
   await db.query(source);
   const f = await fixture(); await claim(f); const lock = await open(), worker = await open();
   try { await lock.query('begin'); await lock.query("select pg_advisory_xact_lock(hashtextextended('parent-explanation-budget',0))"); const pending = admit(f, worker); await waiting(worker); await db.query("update pd675_clock_value set at='2026-12-01T00:00:01Z'"); await lock.query('commit'); const admitted = await pending; assert(admitted.dispatch);
    const actual = (await db.query("select to_char(period,'YYYY-MM-DD') period from parent_explanation_spend where id=$1", [admitted.dispatch])).rows[0].period;
    assert.equal(actual, control ? '2026-11-01' : '2026-12-01');
   } finally { await lock.query('rollback'); await close(lock); await close(worker); }
  }
  const production = migration.slice(migration.indexOf('create function public.parent_explanation_command'), migration.indexOf('revoke all on function public.parent_explanation_command')).replace('create function', 'create or replace function'); await db.query(production);
 });
 const report = { passed, failed, proof: 'local PostgreSQL public RPC; no hosted, browser or provider proof', temporary: temp };
 writeFileSync(path.join(temp, 'results.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
 for (const client of clients) await client.end().catch(() => {});
 if (started) { execFileSync(path.join(bin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' }); console.log('STOPPED owned PostgreSQL', temp); }
});
