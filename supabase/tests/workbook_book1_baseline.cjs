// #472 Book 1 baseline, correction ledger and saved preview v2. Local PostgreSQL only: no environment URL or external
// database is accepted, and the cluster is removed at the end. Synthetic rows only.
const { Client } = require('pg');
const { readFileSync, mkdtempSync, rmSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const sql = f => readFileSync(path.join(root, 'supabase/migrations', f), 'utf8');
function functionSql(file, name) {
  const source = sql(file), start = source.search(new RegExp('create (?:or replace )?function public\\.' + name + '\\('));
  assert(start >= 0, name); const tail = source.slice(start), end = tail.indexOf('$$;', tail.indexOf('as $$') + 5); assert(end > 0);
  return tail.slice(0, end + 3);
}
const cmd = (name, args) => execFileSync('/opt/homebrew/bin/' + name, args, { encoding: 'utf8' });
const sha = s => createHash('sha256').update(s, 'utf8').digest('hex');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const outcome = p => p.then(value => ({ value }), error => ({ error }));
let directory, started = false; const cases = [], clients = new Set();
function cleanup() {
  if (started) { cmd('pg_ctl', ['-D', path.join(directory, 'data'), '-m', 'immediate', '-w', 'stop']); started = false; }
  if (directory) { rmSync(directory, { recursive: true, force: true }); console.log('LOCAL_CLUSTER_REMOVED', directory); }
}
process.on('SIGTERM', () => { try { cleanup(); } finally { process.exit(143); } });
process.on('SIGINT', () => { try { cleanup(); } finally { process.exit(130); } });
async function open(role) {
  const c = new Client({ host: directory, port: 5432, user: 'fixture_owner', database: 'postgres', password: '', connectionTimeoutMillis: 5000 });
  clients.add(c); await c.connect(); await c.query("set statement_timeout='12s'; set deadlock_timeout='100ms'");
  if (role) await c.query('set role ' + role); return c;
}
async function waitForLock(observer, worker) {
  for (let n = 0; n < 300; n++) {
    const row = (await observer.query('select wait_event_type from pg_stat_activity where pid=$1', [worker.processID])).rows[0];
    if (row?.wait_event_type === 'Lock') return;
    await new Promise(r => setTimeout(r, 10));
  }
  throw Error('worker did not reach its lock');
}
async function test(name, run) { await run(); cases.push(name); console.log('PASS', name); }

const PARENT = id(1), CHILD = id(2), RUN = id(3), DRAFT = id(4), ADMIN = id(5), OTHER = id(6), OTHER_CHILD = id(7);
const PRINTED = 'a'.repeat(28), PDF = 'b'.repeat(64);
function baselineDoc(request, o = {}) {
  return { version: 1, engine: 'book1-baseline/1', id: request, parentId: PARENT, childId: CHILD, runId: RUN, draftId: DRAFT, draftRevision: o.revision ?? 2, number: 1,
    binding: { printedRevision: o.printed ?? PRINTED, printHash: o.pdf ?? PDF, contentHash: 'c'.repeat(64), renderHash: 'd'.repeat(64), workbookHash: 'e'.repeat(64), frameHash: 'f'.repeat(64), levels: [4] },
    curriculum: { key: 'bc', version: 'v', skills: [] }, planning: { kind: 'prospective-capture', inputHash: '1'.repeat(64) },
    priorMastery: { policy: 'book1-empty-passed/1', passed: {}, evidence: '1'.repeat(64) }, initialIssues: [], ...(o.extra ?? {}) };
}
const record = doc => { const payload = JSON.stringify(doc); return { payload, hash: sha(payload) }; };
const save = (c, request, rec, o = {}) => c.query('select public.workbook_book1_baseline_command($1,$2,$3,$4,$5,$6,$7,$8,$9) v',
  ['save', o.actor ?? ADMIN, o.parent ?? PARENT, o.child ?? CHILD, RUN, DRAFT, request, rec.payload, rec.hash]).then(r => r.rows[0].v);
const read = (c, request) => c.query('select public.workbook_book1_baseline_command($1,$2,$3,$4,$5,$6,$7) v', ['read', ADMIN, PARENT, CHILD, RUN, DRAFT, request]).then(r => r.rows[0].v);
const sources = (c, workbook = DRAFT) => c.query('select public.workbook_book1_sources($1,$2,$3) v', [PARENT, CHILD, workbook]).then(r => r.rows[0].v);
const tryIt = (c, a) => c.query('select public.record_workbook_second_try($1,$2,$3,$4,$5,$6,$7) v', a).then(r => r.rows[0].v);
const count = async (c, t) => (await c.query(`select count(*)::int n from public.${t}`)).rows[0].n;

(async () => {
  console.log('FALSIFIER: two saves of one revision both land, a stale revision or prior activity saves, a record changes after save, parents read evidence,');
  console.log('FALSIFIER: a frozen or deleted family saves, a second try links to a version that is not current, or v1 preview records stop saving.');
  console.log(cmd('pg_config', ['--version']).trim());
  directory = mkdtempSync('/tmp/unica472-book1-pg-');
  cmd('initdb', ['-D', path.join(directory, 'data'), '-A', 'trust', '--no-locale', '-E', 'UTF8', '-U', 'fixture_owner']);
  started = true;
  cmd('pg_ctl', ['-D', path.join(directory, 'data'), '-l', path.join(directory, 'postgres.log'), '-o', `-F -k ${directory} -p 5432 -c listen_addresses=''`, '-w', '-t', '10', 'start']);
  const db = await open();
  await db.query(readFileSync(path.join(__dirname, 'workbook_preview_sources_fixture.sql'), 'utf8'));
  await db.query(readFileSync(path.join(__dirname, 'workbook_book1_baseline_fixture.sql'), 'utf8'));
  for (const n of ['assert_family_writable', 'fence_family_write']) await db.query(functionSql('20261011_add_family_deletion.sql', n));
  await db.query(functionSql('20261105_child_delete.sql', 'child_delete_row_child'));
  await db.query(sql('20261105_child_delete_plan_recovery.sql'));
  await db.query(sql('20261107144016_workbook_preview_sources.sql'));
  await db.query(sql('20261107161035_workbook_book1_baseline.sql'));
  await db.query('insert into public.admin_users values($1)', [ADMIN]);
  await db.query('insert into public.parents(id) values($1),($2)', [PARENT, OTHER]);
  await db.query('insert into public.children values($1,$2),($3,$4)', [CHILD, PARENT, OTHER_CHILD, OTHER]);
  await db.query('insert into public.workbook_drafts values($1,$2,$3,1,$4)', [DRAFT, PARENT, CHILD, { id: DRAFT, pages: [] }]);
  await db.query("insert into public.workbook_runs values($1,$2,$3,1,'done',$4)", [RUN, PARENT, CHILD, DRAFT]);
  await db.query('insert into public.workbook_draft_revisions values($1,1,$2,$3,null,null),($1,2,$2,$3,$4,$5)', [DRAFT, PARENT, CHILD, { id: DRAFT, pages: [1] }, { pdfPath: 'p.pdf', pdfSha256: PDF, pages: [] }]);
  await db.query('insert into public.workbook_run_frames values($1,$2,$3,$4)', [RUN, PARENT, CHILD, { version: 1, plan: {} }]);
  const a = await open('service_role'), b = await open('service_role'), parent = await open('authenticated'), admin = await open('authenticated'), anon = await open('anon');
  await parent.query("select set_config('request.jwt.claim.sub',$1,false)", [PARENT]);
  await admin.query("select set_config('request.jwt.claim.sub',$1,false)", [ADMIN]);
  const R1 = id(901), main = record(baselineDoc(R1));

  await test('two concurrent exact saves leave one immutable baseline with a zero-activity boundary', async () => {
    const results = await Promise.all([save(a, R1, main), save(b, R1, main)]);
    assert.deepEqual(results.map(x => x.status).sort(), ['duplicate', 'saved']);
    assert.equal(await count(db, 'workbook_book1_baselines'), 1);
    const got = await read(a, R1);
    assert.equal(got.payload, main.payload); assert.equal(got.hash, main.hash);
    assert.deepEqual(got.initial_activity, { items: 0, changes: 0, events: 0, receipts: 0, secondTries: 0 });
    assert.match(String(got.boundary_at), /^\d{4}-\d\d-\d\dT/);
  });
  await test('a second request for the same draft revision, or another payload at the same id, cannot replace it', async () => {
    assert.equal((await save(a, id(902), record(baselineDoc(id(902))))).status, 'conflict');
    assert.equal((await save(a, R1, record(baselineDoc(R1, { extra: { note: 'x' } })))).status, 'conflict');
    assert.equal((await save(a, R1, { ...main, hash: '0'.repeat(64) })).status, 'conflict');
    assert.equal(await count(db, 'workbook_book1_baselines'), 1);
  });
  await test('records are immutable, never deleted by the service, and read only by live admins', async () => {
    assert.equal((await outcome(db.query('update public.workbook_book1_baselines set actor_id=actor_id'))).error.code, '55000');
    assert.equal((await outcome(a.query('delete from public.workbook_book1_baselines'))).error.code, '42501');
    assert.equal((await outcome(a.query('insert into public.workbook_book1_baselines select * from public.workbook_book1_baselines'))).error.code, '42501');
    assert.equal(await count(parent, 'workbook_book1_baselines'), 0);
    assert.equal(await count(admin, 'workbook_book1_baselines'), 1);
    assert.equal((await outcome(anon.query('select * from public.workbook_book1_baselines'))).error.code, '42501');
    assert.equal((await outcome(save(parent, id(903), record(baselineDoc(id(903)))))).error.code, '42501');
    assert.equal((await outcome(parent.query('select public.workbook_book1_sources($1,$2,$3)', [PARENT, CHILD, DRAFT]))).error.code, '42501');
  });
  await test('missing or malformed payload fields refuse null-safely', async () => {
    const R = id(904);
    for (const extra of [{ engine: null }, { binding: null }, { priorMastery: { passed: { s: 1 } } }, { number: 2 }, { draftRevision: '2' }]) {
      assert.equal((await save(a, R, record({ ...baselineDoc(R), ...extra }))).status, 'conflict', JSON.stringify(extra));
    }
  });
  await test('a stale revision, another rendering, an earlier activity or another printed workbook is refused', async () => {
    // A new run and draft so the existing baseline does not answer first.
    const RUN2 = id(30), DRAFT2 = id(31), R = id(905);
    await db.query('insert into public.workbook_drafts values($1,$2,$3,1,$4)', [DRAFT2, PARENT, CHILD, { id: DRAFT2 }]);
    await db.query("insert into public.workbook_runs values($1,$2,$3,1,'done',$4)", [RUN2, PARENT, CHILD, DRAFT2]);
    await db.query('insert into public.workbook_run_frames values($1,$2,$3,$4)', [RUN2, PARENT, CHILD, { version: 1 }]);
    await db.query('insert into public.workbook_draft_revisions values($1,1,$2,$3,null,null),($1,2,$2,$3,$4,$5)', [DRAFT2, PARENT, CHILD, { id: DRAFT2 }, { pdfSha256: PDF }]);
    const doc = o => record({ ...baselineDoc(R, o), runId: RUN2, draftId: DRAFT2 });
    const save2 = (rec) => a.query('select public.workbook_book1_baseline_command($1,$2,$3,$4,$5,$6,$7,$8,$9) v', ['save', ADMIN, PARENT, CHILD, RUN2, DRAFT2, R, rec.payload, rec.hash]).then(r => r.rows[0].v);
    assert.deepEqual(await save2(doc({ revision: 1 })), { status: 'refused', reason: 'revision-changed' });
    assert.deepEqual(await save2(doc({ pdf: '9'.repeat(64) })), { status: 'refused', reason: 'rendering-differs' });
    await db.query("update public.workbook_runs set status='running' where id=$1", [RUN2]);
    assert.deepEqual(await save2(doc()), { status: 'refused', reason: 'not-book1-run' });
    await db.query("update public.workbook_runs set status='done' where id=$1", [RUN2]);
    await db.query("insert into public.workbooks values($1,$2,$3,1,'approved',$4,null)", [DRAFT2, PARENT, CHILD, 'c'.repeat(28)]);
    assert.deepEqual(await save2(doc()), { status: 'refused', reason: 'workbook-revision-differs' });
    await db.query('delete from public.workbooks where id=$1', [DRAFT2]);
    for (const [table, insert, values] of [['learning_events', 'insert into public.learning_events values($1,$2,$3,$4)', [id(40), PARENT, CHILD, DRAFT2]],
      ['workbook_scan_receipts', 'insert into public.workbook_scan_receipts values($1,$2)', [id(41), DRAFT2]]]) {
      await db.query(insert, values);
      assert.deepEqual(await save2(doc()), { status: 'refused', reason: 'activity-before-boundary' }, table);
      await db.query(`delete from public.${table}`);
    }
    await db.query("insert into public.scan_marking_items values($1,$2,$3,$4,$5,$6,'i1','{}',1)", [id(42), PARENT, CHILD, DRAFT2, PRINTED, id(43)]);
    assert.deepEqual(await save2(doc()), { status: 'refused', reason: 'activity-before-boundary' });
    await db.query('delete from public.scan_marking_items');
    assert.equal((await save2(doc())).status, 'saved');
  });
  await test('a revision written while the save waits is seen: the save refuses the old revision', async () => {
    const RUN3 = id(50), DRAFT3 = id(51), R = id(906);
    await db.query('insert into public.workbook_drafts values($1,$2,$3,1,$4)', [DRAFT3, PARENT, CHILD, { id: DRAFT3 }]);
    await db.query("insert into public.workbook_runs values($1,$2,$3,1,'done',$4)", [RUN3, PARENT, CHILD, DRAFT3]);
    await db.query('insert into public.workbook_run_frames values($1,$2,$3,$4)', [RUN3, PARENT, CHILD, { version: 1 }]);
    await db.query('insert into public.workbook_draft_revisions values($1,1,$2,$3,null,null),($1,2,$2,$3,$4,$5)', [DRAFT3, PARENT, CHILD, { id: DRAFT3 }, { pdfSha256: PDF }]);
    const editor = await open();
    await editor.query('begin');
    await editor.query('select 1 from public.workbook_drafts where id=$1 for no key update', [DRAFT3]);
    await editor.query('insert into public.workbook_draft_revisions values($1,3,$2,$3,$4,$5)', [DRAFT3, PARENT, CHILD, { id: DRAFT3, r: 3 }, { pdfSha256: PDF }]);
    const rec = record({ ...baselineDoc(R), runId: RUN3, draftId: DRAFT3 });
    const pending = a.query('select public.workbook_book1_baseline_command($1,$2,$3,$4,$5,$6,$7,$8,$9) v', ['save', ADMIN, PARENT, CHILD, RUN3, DRAFT3, R, rec.payload, rec.hash]);
    await waitForLock(db, a);
    await editor.query('commit');
    assert.deepEqual((await pending).rows[0].v, { status: 'refused', reason: 'revision-changed' });
  });
  await test('a parent freeze wins before a waiting save, and deletion fences refuse', async () => {
    const R = id(907), rec = record(baselineDoc(R, { revision: 2 }));
    await db.query('begin'); await db.query('update public.parents set deletion_requested_at=clock_timestamp() where id=$1', [PARENT]);
    const pending = outcome(save(a, R, rec));
    await waitForLock(db, a);
    await db.query('commit');
    assert.equal((await pending).error.code, '55000');
    assert.equal(await count(admin, 'workbook_book1_baselines'), 0);
    assert.deepEqual(await sources(a), { status: 'unavailable' });
    await db.query('update public.parents set deletion_requested_at=null');
    for (const table of ['family_deletions', 'child_deletions']) {
      await db.query(table === 'family_deletions' ? 'insert into public.family_deletions values($1)' : 'insert into public.child_deletions values($2,$1)', table === 'family_deletions' ? [PARENT] : [PARENT, CHILD]);
      assert.equal((await save(a, R, rec)).status, 'unavailable');
      assert.deepEqual(await sources(a), { status: 'unavailable' });
      assert.equal(await count(admin, 'workbook_book1_baselines'), 0);
      await db.query(`delete from public.${table}`);
    }
  });
  const ITEM = id(60), RIGHT_ITEM = id(61);
  await test('second tries link only to the current resolved wrong result of a bound book', async () => {
    await db.query('insert into public.scan_marking_items values($1,$2,$3,$4,$5,$6,$7,$8,2)', [ITEM, PARENT, CHILD, DRAFT, PRINTED, id(62), 'item-1', { result: 'wrong', state: 'scored', certainty: 'certain' }]);
    await db.query('insert into public.scan_marking_items values($1,$2,$3,$4,$5,$6,$7,$8,2)', [RIGHT_ITEM, PARENT, CHILD, DRAFT, PRINTED, id(63), 'item-2', { result: 'right', state: 'scored', certainty: 'certain' }]);
    const T = id(70), args = [T, R1, ITEM, 2, 'right', 'none', 'scan-photo:1'];
    const both = await Promise.all([tryIt(a, args), tryIt(b, args)]);
    assert.deepEqual(both.map(x => x.status).sort(), ['duplicate', 'saved']);
    assert.equal((await tryIt(a, [T, R1, ITEM, 2, 'wrong', 'none', 'scan-photo:1'])).status, 'conflict');
    for (const bad of [[id(71), R1, ITEM, 1, 'right', 'none', 'p'], [id(72), R1, RIGHT_ITEM, 2, 'right', 'none', 'p'], [id(73), id(999), ITEM, 2, 'right', 'none', 'p'],
      [id(74), R1, ITEM, 2, 'maybe', 'none', 'p'], [id(75), R1, ITEM, 2, 'right', null, 'p'], [id(76), R1, ITEM, 2, 'right', 'none', '']]) {
      assert.equal((await tryIt(a, bad)).status, 'refused', JSON.stringify(bad));
    }
    const row = (await db.query('select * from public.workbook_second_tries')).rows[0];
    assert.equal(row.source, 'child-written-answer'); assert.equal(row.page_id, id(62)); assert.equal(row.item_id, 'item-1');
    assert.equal((await outcome(db.query('update public.workbook_second_tries set help=help'))).error.code, '55000');
    assert.equal((await outcome(parent.query('select public.record_workbook_second_try($1,$2,$3,$4,$5,$6,$7)', [id(77), R1, ITEM, 2, 'right', 'none', 'p']))).error.code, '42501');
    assert.equal(await count(parent, 'workbook_second_tries'), 0);
    assert.equal(await count(admin, 'workbook_second_tries'), 1);
  });
  await test('the source read binds the approved revision, returns the whole ledger, and detects changes', async () => {
    assert.deepEqual(await sources(a), { status: 'missing' });
    await db.query("insert into public.workbook_audit(parent_id,child_id,workbook_id,run_id,action,detail) values($1,$2,$3,$4,'workbook-approved',$5)", [PARENT, CHILD, DRAFT, RUN, { revision: 2, printedRevision: PRINTED }]);
    const found = await sources(a);
    assert.equal(found.status, 'found'); assert.equal(found.id, R1); assert.equal(found.payload, main.payload); assert.equal(found.count, 1);
    assert.equal(found.rows[0].based_on_version, 2); assert.match(found.rows[0].recorded_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/);
    await db.query("insert into public.workbook_audit(parent_id,child_id,workbook_id,run_id,action,detail) values($1,$2,$3,$4,'workbook-approved',$5)", [PARENT, CHILD, DRAFT, RUN, { revision: 3 }]);
    assert.deepEqual(await sources(a), { status: 'missing' });
    await db.query("delete from public.workbook_audit where detail->>'revision'='3'");
    await db.query("update public.workbook_run_frames set frame=frame||'{\"x\":1}' where run_id=$1", [RUN]);
    assert.deepEqual(await sources(a), { status: 'stale' });
    await db.query("update public.workbook_run_frames set frame=frame-'x' where run_id=$1", [RUN]);
    await db.query('insert into public.workbook_draft_revisions values($1,3,$2,$3,$4,$5)', [DRAFT, PARENT, CHILD, { id: DRAFT, r: 3 }, { pdfSha256: PDF }]);
    assert.deepEqual(await sources(a), { status: 'stale' });
    await db.query('delete from public.workbook_draft_revisions where draft_id=$1 and revision=3', [DRAFT]);
    assert.equal((await sources(a)).status, 'found');
  });
  await test('saved previews accept version 2 with the live baseline, and keep version 1 rules', async () => {
    const delivered = '2026-01-01T00:00:00.000Z', manifest = { version: 1 };
    await db.query("insert into public.workbooks values($1,$2,$3,1,'shipped',$4,$5)", [DRAFT, PARENT, CHILD, PRINTED, manifest]);
    await db.query('insert into public.workbook_delivery_receipts values($1,$2,$3,1,7,$4)', [DRAFT, PARENT, CHILD, delivered]);
    await db.query('insert into public.scan_marking_revisions values($1,$2,3)', [PARENT, CHILD]);
    const found = await sources(a);
    const request = (rid) => ({ version: 1, requestId: rid, parentId: PARENT, childId: CHILD, workbookId: DRAFT, printedRevision: PRINTED, selection: { unit: '1.1', skill: 's', step: 1 }, cutoff: Date.parse('2026-02-01T00:00:00Z'), scope: 'day7' });
    const books = [{ book: { id: DRAFT, printed_revision: PRINTED, print_manifest: manifest }, delivery: { auditId: 7, deliveredAt: delivered } }];
    const v2 = (rid, o = {}) => ({ version: 2, engine: 'workbook-preview-sources/2;progress/1;history/1;plan-preview/1;book1-baseline/1', actorId: ADMIN, request: request(rid),
      frozen: { version: 2, parentId: PARENT, childId: CHILD, markingRevision: 3, books, book1: { version: 1, baseline: { id: R1, payload: found.payload, hash: o.hash ?? found.hash },
        corrections: { baselineId: R1, boundaryAt: found.boundary_at, count: o.count ?? found.count, rows: found.rows } } },
      outcome: { availability: 'complete', decision: { action: 'advance' }, plan: { days: [] }, ...(o.outcome ?? {}) } });
    const v1 = rid => ({ version: 1, engine: 'workbook-preview-sources/1;progress/1;history/1;plan-preview/1', actorId: ADMIN, request: request(rid),
      frozen: { version: 1, parentId: PARENT, childId: CHILD, markingRevision: 3, books }, outcome: { availability: 'unavailable', decision: null, plan: null, consumedVersions: [] } });
    const prev = (rid, doc) => { const r = record(doc); return a.query('select public.workbook_preview_command($1,$2,$3,$4,$5,$6,$7,$8,$9) v', ['save', ADMIN, PARENT, CHILD, DRAFT, PRINTED, rid, r.payload, r.hash]).then(x => x.rows[0].v.status); };
    assert.equal(await prev(id(801), v2(id(801))), 'saved');
    assert.equal(await prev(id(801), v2(id(801))), 'duplicate');
    assert.equal(await prev(id(802), v1(id(802))), 'saved');
    assert.equal(await prev(id(803), v2(id(803), { hash: '0'.repeat(64) })), 'unavailable');
    assert.equal(await prev(id(804), v2(id(804), { count: 0 })), 'unavailable');
    assert.equal(await prev(id(805), v2(id(805), { outcome: { plan: null } })), 'conflict');
    assert.equal(await prev(id(806), v2(id(806), { outcome: { availability: 'unavailable' } })), 'conflict');
    assert.equal(await prev(id(807), { ...v1(id(807)), outcome: { availability: 'complete', decision: {}, plan: {}, consumedVersions: [] } }), 'conflict');
    const missing = v2(id(808)); delete missing.frozen.book1;
    assert.equal(await prev(id(808), missing), 'conflict');
    assert.equal((await outcome(db.query("insert into public.workbook_plan_previews(id,parent_id,child_id,workbook_id,number,printed_revision,actor_id,engine,cutoff,payload,payload_hash) values($1,$2,$3,$4,1,$5,$6,'other',now(),'{}',$7)",
      [id(809), PARENT, CHILD, DRAFT, PRINTED, ADMIN, sha('{}')]))).error.code, '23514');
    assert.equal(await count(db, 'workbook_plan_previews'), 2);
  });
  await test('child deletion cascades every baseline, ledger row and preview', async () => {
    await db.query('delete from public.children where id=$1', [CHILD]);
    for (const t of ['workbook_book1_baselines', 'workbook_second_tries', 'workbook_plan_previews']) assert.equal(await count(db, t), 0, t);
  });
  console.log('LOCAL_SQL_CASES', JSON.stringify(cases)); console.log('LOCAL_SQL_PASS', cases.length);
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { for (const c of clients) try { await c.end(); } catch {} cleanup(); });
