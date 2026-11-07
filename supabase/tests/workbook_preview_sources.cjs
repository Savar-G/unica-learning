// Local PostgreSQL only. No environment URL or external database is accepted.
const { Client } = require('pg');
const { readFileSync, mkdtempSync, rmSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { Module } = require('node:module');
const path = require('node:path');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '../..');
const sql = f => readFileSync(path.join(root, 'supabase/migrations', f), 'utf8');
function functionSql(file, name) {
  const source = sql(file), start = source.search(new RegExp('create (?:or replace )?function public\\.' + name + '\\('));
  assert(start >= 0, name); const tail = source.slice(start), end = tail.indexOf('$$;', tail.indexOf('as $$') + 5); assert(end > 0);
  return tail.slice(0, end + 3);
}
const bundle = buildSync({ stdin: { contents: 'export { previewSourceFixture, previewActor } from "./src/lib/workbook-progress-source.fixture"; export { createWorkbookPreviewRecord, replayWorkbookPreview, previewPayloadHash } from "./src/lib/workbook-preview-record"; export { workbookPreviewRepository } from "./src/lib/workbook-preview-store";', resolveDir: root },
  bundle: true, platform: 'node', format: 'cjs', write: false, alias: { 'server-only': path.join(__dirname, 'workbook_preview_sources_empty.cjs') }, tsconfig: path.join(root, 'tsconfig.json') }).outputFiles[0].text;
const loaded = new Module(path.join(root, 'unica472-preview.cjs')); loaded.paths = module.paths; loaded._compile(bundle, path.join(root, 'unica472-preview.cjs'));
const { previewSourceFixture, previewActor, createWorkbookPreviewRecord, replayWorkbookPreview, previewPayloadHash, workbookPreviewRepository } = loaded.exports;
const cmd = (name, args) => execFileSync('/opt/homebrew/bin/' + name, args, { encoding: 'utf8' });
let directory, started = false, cases = [];
const clients = new Set();
function cleanup() {
  if (started) { cmd('pg_ctl', ['-D', path.join(directory,'data'), '-m','immediate','-w','stop']); started = false; }
  if (directory) { rmSync(directory, {recursive:true,force:true}); console.log('LOCAL_CLUSTER_REMOVED', directory); }
}
process.on('SIGTERM', () => { try { cleanup(); } finally { process.exit(143); } });
process.on('SIGINT', () => { try { cleanup(); } finally { process.exit(130); } });
async function open(role) {
  const c = new Client({ host: directory, port:5432, user:'fixture_owner', database:'postgres', password:'', connectionTimeoutMillis:5000 });
  clients.add(c); await c.connect(); await c.query("set statement_timeout='12s'; set deadlock_timeout='100ms'");
  if (role) await c.query('set role ' + role); return c;
}
function args(action, req, record, actor = previewActor) { return [action,actor,req.parentId,req.childId,req.workbookId,req.printedRevision,req.requestId,record?.payload ?? null,record?.hash ?? null]; }
const call = async (c, values) => (await c.query('select public.workbook_preview_command($1,$2,$3,$4,$5,$6,$7,$8,$9) value', values)).rows[0].value;
const status = async (c, values, expected) => assert.equal((await call(c,values)).status, expected);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const outcome = p => p.then(value => ({value}), error => ({error}));
async function waitForLock(observer, worker) {
  for (let n=0;n<200;n++) {
    const row = (await observer.query('select wait_event_type from pg_stat_activity where pid=$1',[worker.processID])).rows[0];
    if (row?.wait_event_type==='Lock') return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw Error('concurrent worker did not reach its lock');
}
async function test(name, run) { await run(); cases.push(name); console.log('PASS', name); }
(async () => {
  console.log('FALSIFIER: parent/anon can read or write, an unchecked actor can save, or a frozen/deleted family can read/save.');
  console.log('FALSIFIER: concurrent retries duplicate rows, a payload/scope/hash conflict overwrites truth, or stale source fences save.');
  console.log('FALSIFIER: a persisted restart changes outcome or uses mutable profiles, or cascade deletion leaves retained text.');
  console.log(cmd('pg_config',['--version']).trim());
  directory = mkdtempSync('/tmp/unica472-preview-pg-');
  cmd('initdb',['-D',path.join(directory,'data'),'-A','trust','--no-locale','-E','UTF8','-U','fixture_owner']);
  started = true;
  cmd('pg_ctl',['-D',path.join(directory,'data'),'-l',path.join(directory,'postgres.log'),'-o',`-F -k ${directory} -p 5432 -c listen_addresses=''`,'-w','-t','10','start']);
  const db = await open();
  await db.query(readFileSync(path.join(__dirname,'workbook_preview_sources_fixture.sql'),'utf8'));
  for (const n of ['assert_family_writable','fence_family_write']) await db.query(functionSql('20261011_add_family_deletion.sql',n));
  await db.query(functionSql('20261105_child_delete.sql','child_delete_row_child'));
  await db.query(sql('20261105_child_delete_plan_recovery.sql'));
  await db.query(sql('20261107140215_workbook_preview_sources.sql'));
  const f = previewSourceFixture(12), r = f.request;
  await db.query('insert into public.admin_users values($1)',[previewActor]);
  await db.query('insert into public.parents(id) values($1),($2)',[r.parentId,id(600)]);
  await db.query('insert into public.children values($1,$2)',[r.childId,r.parentId]);
  for (const b of f.frozen.books) {
    const w = b.book;
    await db.query('insert into public.workbooks values($1,$2,$3,$4,$5,$6,$7)',[w.id,w.parent_id,w.child_id,w.number,w.status,w.printed_revision,w.print_manifest]);
    await db.query('insert into public.workbook_delivery_receipts values($1,$2,$3,$4,$5,$6)',[w.id,w.parent_id,w.child_id,w.number,b.delivery.auditId,b.delivery.deliveredAt]);
  }
  await db.query('insert into public.scan_marking_revisions values($1,$2,50)',[r.parentId,r.childId]);
  const a = await open('service_role'), b = await open('service_role'), parent = await open('authenticated'), admin = await open('authenticated'), anon = await open('anon');
  await parent.query("select set_config('request.jwt.claim.sub',$1,false)",[r.parentId]);
  await admin.query("select set_config('request.jwt.claim.sub',$1,false)",[previewActor]);
  const record = createWorkbookPreviewRecord(previewActor,r,f.frozen);
  await test('two concurrent exact saves leave one immutable row', async () => {
    const results = await Promise.all([call(a,args('save',r,record)),call(b,args('save',r,record))]);
    assert.deepEqual(results.map(x=>x.status).sort(),['duplicate','saved']);
    assert.equal((await db.query('select count(*)::int n from public.workbook_plan_previews')).rows[0].n,1);
  });
  await test('new SQL repository reads and replays the exact saved document after restart', async () => {
    const repo = workbookPreviewRepository({command: async p => call(a,[p.p_action,p.p_actor,p.p_parent,p.p_child,p.p_book,p.p_revision,p.p_request,p.p_payload,p.p_hash])});
    const got = await repo.read(previewActor,r); assert.deepEqual(got,record);
    assert.equal(replayWorkbookPreview(got,previewActor,r).outcome.plan,null);
  });
  await test('parents have zero rows and Admin has its live scoped read', async () => {
    assert.equal((await parent.query('select count(*)::int n from public.workbook_plan_previews')).rows[0].n,0);
    assert.equal((await admin.query('select count(*)::int n from public.workbook_plan_previews')).rows[0].n,1);
    await parent.query("select set_config('request.jwt.claim.sub',$1,false)",[id(600)]);
    assert.equal((await parent.query('select count(*)::int n from public.workbook_plan_previews')).rows[0].n,0);
  });
  await test('anonymous read and browser RPC/table writes are denied', async () => {
    assert.equal((await outcome(anon.query('select * from public.workbook_plan_previews'))).error.code,'42501');
    assert.equal((await outcome(call(parent,args('save',r,record)))).error.code,'42501');
    assert.equal((await outcome(a.query('delete from public.workbook_plan_previews'))).error.code,'42501');
    assert.equal((await outcome(parent.query('update public.workbook_plan_previews set payload=payload'))).error.code,'42501');
    assert.equal((await outcome(a.query('insert into public.workbook_plan_previews select * from public.workbook_plan_previews'))).error.code,'42501');
  });
  await test('immutable payload cannot be updated even by the schema owner', async () => {
    assert.equal((await outcome(db.query('update public.workbook_plan_previews set payload=payload'))).error.code,'55000');
  });
  await test('denied actor and foreign scope cannot save or read', async () => {
    await status(a,args('read',r,null,id(600)),'unavailable');
    await status(a,args('read',{...r,parentId:id(600)},null),'unavailable');
    await status(a,args('read',{...r,printedRevision:'b'.repeat(28)},null),'unavailable');
  });
  await test('request ID, payload and hash conflicts cannot replace a record', async () => {
    const changed = {...r,cutoff:r.cutoff+1};
    await status(a,args('save',changed,createWorkbookPreviewRecord(previewActor,changed,f.frozen)),'conflict');
    await status(a,args('save',r,{...record,hash:'a'.repeat(64)}),'conflict');
    assert.equal((await call(a,args('read',r))).payload,record.payload);
  });
  await test('concurrent different payloads at one ID settle one save and one conflict', async () => {
    const first = {...r,requestId:id(902)}, second = {...first,cutoff:r.cutoff+1};
    const results = await Promise.all([call(a,args('save',first,createWorkbookPreviewRecord(previewActor,first,f.frozen))),call(b,args('save',second,createWorkbookPreviewRecord(previewActor,second,f.frozen)))]);
    assert.deepEqual(results.map(x=>x.status).sort(),['conflict','saved']);
  });
  await test('stale marking revision is refused while exact lost-response retry remains stable', async () => {
    await db.query('update public.scan_marking_revisions set revision=51');
    const next = {...r,requestId:id(903)};
    await status(a,args('save',next,createWorkbookPreviewRecord(previewActor,next,f.frozen)),'unavailable');
    await status(a,args('save',r,record),'duplicate');
    await db.query('update public.scan_marking_revisions set revision=50');
  });
  await test('delivery identity and manifest drift refuse new saves', async () => {
    const next = {...r,requestId:id(904)}, rec = createWorkbookPreviewRecord(previewActor,next,f.frozen);
    await db.query('insert into public.workbook_delivery_corrections values($1,99,$2)',[r.workbookId,'2026-02-01T00:00:00Z']);
    await status(a,args('save',next,rec),'unavailable');
    await db.query('delete from public.workbook_delivery_corrections');
    await db.query("update public.workbooks set print_manifest='{}' where id=$1",[r.workbookId]);
    await status(a,args('save',next,rec),'unavailable');
    await db.query('update public.workbooks set print_manifest=$2 where id=$1',[r.workbookId,f.frozen.books[0].book.print_manifest]);
  });
  await test('bounded malformed payloads do not create records', async () => {
    const next = {...r,requestId:id(905)};
    for (const payload of ['{}','x'.repeat(4000001)]) await status(a,args('save',next,{payload,hash:previewPayloadHash(payload)}),'conflict');
  });
  await test('parent freeze wins before a waiting save and suppresses Admin reads', async () => {
    const next = {...r,requestId:id(906)}, rec = createWorkbookPreviewRecord(previewActor,next,f.frozen);
    await db.query('begin'); await db.query('update public.parents set deletion_requested_at=clock_timestamp() where id=$1',[r.parentId]);
    const pending = outcome(call(a,args('save',next,rec)));
    await waitForLock(db,a);
    await db.query('commit');
    assert.equal((await pending).error.code,'55000');
    assert.equal((await admin.query('select count(*)::int n from public.workbook_plan_previews')).rows[0].n,0);
    assert.equal((await outcome(call(a,args('read',r)))).error.code,'55000');
    await db.query('update public.parents set deletion_requested_at=null');
  });
  await test('family and child deletion fences suppress live read and write', async () => {
    for (const table of ['family_deletions','child_deletions']) {
      if (table==='family_deletions') await db.query('insert into public.family_deletions values($1)',[r.parentId]);
      else await db.query('insert into public.child_deletions values($1,$2)',[r.childId,r.parentId]);
      await status(a,args('read',r),'unavailable');
      await status(a,args('save',r,record),'unavailable');
      assert.equal((await admin.query('select count(*)::int n from public.workbook_plan_previews')).rows[0].n,0);
      await db.query('delete from public.'+table);
    }
  });
  await test('revoked Admin cannot read saved data', async () => {
    await db.query('delete from public.admin_users'); await status(a,args('read',r),'unavailable');
    assert.equal((await admin.query('select count(*)::int n from public.workbook_plan_previews')).rows[0].n,0);
    await db.query('insert into public.admin_users values($1)',[previewActor]);
  });
  await test('child cascade removes all preview text and blocks late resurrection', async () => {
    await db.query('delete from public.children where id=$1',[r.childId]);
    assert.equal((await db.query('select count(*)::int n from public.workbook_plan_previews')).rows[0].n,0);
    await status(a,args('save',r,record),'unavailable');
  });
  console.log('LOCAL_SQL_CASES',JSON.stringify(cases)); console.log('LOCAL_SQL_PASS',cases.length);
})().catch(e=>{ console.error(e); process.exitCode=1; }).finally(async()=>{ for (const c of clients) try{await c.end();}catch{} cleanup(); });
