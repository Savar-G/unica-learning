// Actual PostgreSQL sessions, actual migration/functions. No hosted connection or environment URL is accepted.
const { Client } = require('pg');
const { readFileSync, mkdtempSync, rmSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const sql = name => readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
const command = (name, args) => execFileSync('/opt/homebrew/bin/' + name, args, { encoding: 'utf8' });
const clients = new Set();
let directory, started = false, passed = 0;
function cleanup() {
  if (started) { command('pg_ctl', ['-D', path.join(directory, 'data'), '-m', 'immediate', '-w', 'stop']); started = false; }
  if (directory) { rmSync(directory, { recursive: true, force: true }); console.log('LOCAL_CLUSTER_REMOVED', directory); }
}
process.on('SIGINT', () => { try { cleanup(); } finally { process.exit(130); } });
process.on('SIGTERM', () => { try { cleanup(); } finally { process.exit(143); } });
function functionSql(source, name) {
  const start = source.search(new RegExp('create (?:or replace )?function public\\.' + name + '\\('));
  assert(start >= 0, name);
  const tail = source.slice(start), end = tail.indexOf('$$;', tail.indexOf('as $$') + 5);
  assert(end >= 0, name);
  return tail.slice(0, end + 3);
}
async function open(role = null) {
  const c = new Client({ host: directory, port: 5432, database: 'postgres', user: 'fixture_owner', password: '',
    application_name: 'scan-receipts-475', connectionTimeoutMillis: 5000 });
  clients.add(c); await c.connect(); await c.query("set statement_timeout='12s'; set deadlock_timeout='100ms'");
  if (role) await c.query('set role ' + role);
  return c;
}
async function close(c) { await c.end(); clients.delete(c); }
const rpc = async (c, name, args) => (await c.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`, args)).rows[0].value;
const outcome = p => p.then(value => ({ value }), error => ({ error }));
const revision = '0123456789abcdef0123456789ab';
(async () => {
  console.log('FALSIFIER: invalid scans create receipts, retries move acceptance, or image cleanup erases history.');
  console.log('FALSIFIER: incomplete frozen sets claim Day7, missing delivery claims, HOLD consumes a claim, or local days use fixed hours.');
  console.log('FALSIFIER: concurrent final scans leave zero/two claims, either delivery order deadlocks, or raw grants permit forgery.');
  for (const name of ['psql', 'initdb', 'pg_ctl', 'pg_config']) console.log(command(name, ['--version']).trim());
  directory = mkdtempSync('/tmp/unica475-pg-');
  command('initdb', ['-D', path.join(directory, 'data'), '-A', 'trust', '--no-locale', '-U', 'fixture_owner']);
  started = true;
  command('pg_ctl', ['-D', path.join(directory, 'data'), '-l', path.join(directory, 'postgres.log'),
    '-o', `-F -k ${directory} -p 5432 -c listen_addresses=''`, '-w', '-t', '10', 'start']);
  const db = await open();
  await db.query(readFileSync(path.join(__dirname, 'workbook_scan_receipts_fixture.sql'), 'utf8'));
  for (const name of ['assert_family_writable', 'fence_family_write']) await db.query(functionSql(sql('20261011_add_family_deletion.sql'), name));
  await db.query(sql('20261029_add_learning_events.sql').replace('alter table public.children add constraint children_id_parent_key unique (id, parent_id);', '')
    .replace('alter table public.assessments add constraint assessments_id_child_key unique (id, child_id);', ''));
  for (const file of ['20261102_scan_page_photos.sql', '20261105_scan_crops.sql', '20261105_scan_crops_previous_lease.sql',
    '20261105_scan_stack.sql', '20261105_scan_sheet_check.sql', '20261105_scan_sent_check.sql']) await db.query(sql(file));
  await db.query(functionSql(sql('20261105_child_delete.sql'), 'child_delete_row_child'));
  await db.query(sql('20261105_child_delete_plan_recovery.sql'));
  await db.query(sql('20261105_child_profile_skill_changes_from_tests.sql'));
  for (const file of ['20261105_scan_marking.sql', '20261106_scan_calibration_previous.sql', '20261106_scan_marking_sheet_check.sql',
    '20261106_scan_recheck_admission.sql', '20261106_scan_mark_changes.sql']) await db.query(sql(file));
  for (const name of ['_maya_normalize_zone', '_maya_zone_at']) await db.query(functionSql(sql('20261102172026_supported_family_zones.sql'), name));
  await db.query(sql('20261102223812_workbook_delivery_receipts.sql'));
  await db.query(sql('20261102225721_workbook_delivery_corrections.sql'));
  await db.query('create trigger fixture_scan_delivery_barrier before insert on public.workbook_delivery_receipts for each row execute function public.fixture_scan_delivery_barrier()');
  const before = (await db.query(`select oid::regprocedure::text name, pg_get_functiondef(oid) definition,proacl from pg_proc
    where pronamespace='public'::regnamespace order by 1`)).rows;
  await db.query(sql('20261106224500_workbook_scan_receipts.sql'));
  const adminId = randomUUID();
  await db.query('insert into admin_users values($1,$2)', [adminId, 'admin@example.invalid']);
  const service = await open('service_role'), admin = await open('authenticated');
  await admin.query("select set_config('test.viewer',$1,false)", [adminId]);
  async function test(name, run) { console.log('FALSIFIER', name); await run(); passed++; console.log('PASS', name); }
  const receipts = f => db.query('select * from workbook_scan_receipts where workbook_id=$1 order by accepted_at,id', [f.w]).then(x => x.rows);
  const claims = f => db.query('select * from workbook_scan_trigger_claims where workbook_id=$1', [f.w]).then(x => x.rows);
  const events = f => db.query('select * from workbook_scan_progress_events where workbook_id=$1 order by admitted_at,id', [f.w]).then(x => x.rows);
  async function book({ parent = randomUUID(), child = randomUUID(), number = 1, testBook = false, single = false, delivered = null } = {}) {
    const f = { p: parent, c: child, w: randomUUID(), pages: [], number, revision };
    await db.query('insert into auth.users values($1) on conflict do nothing', [parent]);
    await db.query('insert into parents values($1,null) on conflict do nothing', [parent]);
    await db.query('insert into children values($1,$2) on conflict do nothing', [child, parent]);
    const manifest = { version: 1, snapshotDay: 7, curriculum: { key: 'bc', version: 'v1' }, testWorkbook: testBook,
      days: [{ day: 1, pages: [1] }, { day: 7, pages: single ? [2] : [2, 3] }, { day: 8, pages: [4] }, { day: 10, pages: [5] }],
      levelTest: testBook ? { day: 7, pages: single ? [2] : [2, 3] } : null };
    await db.query(`insert into workbooks(id,parent_id,child_id,number,status,printed_revision,print_manifest,shipped_at)
      values($1,$2,$3,$4,'shipped',$5,$6,'2024-01-01Z')`, [f.w, f.p, f.c, number, revision, manifest]);
    for (let n = 1; n <= 8; n++) {
      const page = randomUUID(), type = n === 7 ? 'cover' : n === 8 ? 'blank' : 'day';
      const day = { 1: 'Day 1', 2: 'Day 7', 3: 'Day 7', 4: 'Day 8', 5: 'Day 10' }[n] ?? null;
      f.pages.push(page);
      const contract = { version: 1, workbookId: f.w, page: n, day: n === 6 ? null : Number(day?.slice(4)), coordinates: { image: { width: 1000, height: 1400 } } };
      await db.query(`insert into workbook_pages(id,workbook_id,parent_id,page_number,day_label,page_type,print_contract,image_width,image_height,image_path,qr_token)
        values($1,$2,$3,$4,$5,$6,$7,1000,1400,'fixture.jpg',$8)`, [page, f.w, f.p, n, day, type, contract, 'token-' + page]);
      if (n < 8) await db.query('insert into workbook_questions(parent_id,workbook_id,page_id,question_number,package) values($1,$2,$3,1,$4)', [f.p, f.w, page, { id: 'item1', skill: { standard: '2.4', skills: [] } }]);
    }
    if (delivered) await confirm(f, delivered);
    return f;
  }
  const asLocal = s => new Date(s).toISOString().slice(0, 16);
  const confirm = (f, at = '2026-11-01T12:00:00Z', c = admin, zone = 'UTC', override = false, local = asLocal(at)) =>
    rpc(c, 'confirm_workbook_delivery', [f.w, f.c, f.number, at, local, zone, override]);
  async function photo(f, n = 2, c = service, { readyFirst = false, ready = true, save = true, source = true, derived = true, result = {}, metadata = { size: 100, mimetype: 'image/jpeg' } } = {}) {
    const x = { ...f, page: f.pages[n - 1], photo: randomUUID(), cal: randomUUID(), token: randomUUID(), n };
    // Synthetic reserved/identified row. The save and calibration finish calls below are production RPCs.
    await db.query(`insert into scan_photos(id,parent_id,child_id,page_id,workbook_id,printed_revision,state,reserved_bytes,width,height)
      values($1,$2,$3,$4,$5,$6,'processing',10000,1000,1400)`, [x.photo, f.p, f.c, x.page, f.w, revision]);
    if (source) await db.query("insert into storage.objects(bucket_id,name,metadata) values('scan-photos',$1,$2)", [f.p + '/' + x.photo + '/photo.jpg', metadata]);
    const finished = await rpc(c, 'finish_scan_photo', [f.p, x.photo, 100]);
    if (!source) { assert.equal(finished, 'refused'); return x; }
    assert.equal(finished, 'pending');
    if (!readyFirst && save) assert.equal(await rpc(c, 'change_scan_photo', [f.p, x.photo, 'save']), 'saved');
    assert.equal((await rpc(c, 'begin_scan_calibration', [f.p, x.photo, x.cal, 90])).status, 'started');
    if (derived) await db.query("insert into storage.objects(bucket_id,name,metadata) values('scan-photos',$1,$2)", [f.p + '/' + x.photo + '/' + x.cal + '-straight.jpg', metadata]);
    x.result = { calibration: { version: 1, revision, photo: { width: 1000, height: 1400 } }, parts: ['straight'], sheetCheck: 1, ...result };
    if (ready) {
      const done = await rpc(c, 'finish_scan_calibration', [f.p, x.photo, x.cal, 'ready', x.result, 100]);
      assert.equal(done, derived ? 'ready' : 'missing');
    }
    if (readyFirst && save) assert.equal(await rpc(c, 'change_scan_photo', [f.p, x.photo, 'save']), 'saved');
    return x;
  }
  const marking = (action, f, data = {}, c = service) => rpc(c, 'scan_marking_command', [action, f.p, f.photo, f.token, data]);
  function item(f, method = 'code') {
    const identity = { workbookId: f.w, printedRevision: revision, pageId: f.page, itemId: 'item1' };
    const expected = { identity, number: 1, method, mastery: { eligible: false, reason: 'try-first' }, scoredRegions: ['a'] };
    const observation = { version: 1, identity, evidence: { photoRevision: f.photo }, state: method === 'parent' ? 'parent-pending' : 'pending',
      method, readAnswerText: null, regions: [], certainty: 'not-read', result: null, teaching: null, mastery: expected.mastery, help: 'none', actor: 'system', resultVersion: 1 };
    return { expected, observation };
  }
  async function claimMark(f) {
    await rpc(service, 'send_scan_photos', [f.p, f.c, [f.photo]]);
    const i = item(f);
    const result = await marking('claim', f, { hash: 'fixture', items: [i] });
    assert.equal(result.token, f.token); return i;
  }
  async function applyMark(f, base, { state = 'scored', result = 'right', actor = 'system', method = 'code' } = {}) {
    const o = { ...base, evidence: { photoRevision: f.photo }, state, result, actor, method, certainty: 'certain', readAnswerText: '42', regions: [{ regionId: 'a', text: '42', value: '42', certainty: 'certain' }] };
    assert.equal(await marking('extract', f, { observations: [o], model: 'synthetic', prompt: 'synthetic' }), true);
    assert.equal(await marking('apply', f, { events: [], at: new Date().toISOString() }), true);
  }
  async function terminate(f) { await marking('finish', f); assert.equal(await rpc(service, 'change_scan_photo', [f.p, f.photo, 'delete']), 'deleted'); }
  async function blocked(waiter, holder) {
    const end = Date.now() + 5000;
    do {
      const r = (await db.query('select wait_event_type,pg_blocking_pids(pid) blockers from pg_stat_activity where pid=$1', [waiter.processID])).rows[0];
      if (r?.wait_event_type === 'Lock' && r.blockers.includes(holder.processID)) return;
      await new Promise(resolve => setImmediate(resolve));
    } while (Date.now() < end);
    throw Error('Missing explicit lock barrier');
  }
  await test('existing RPC bodies, signatures, ACLs and search paths remain unchanged', async () => {
    for (const row of before) {
      const current = (await db.query('select pg_get_functiondef($1::regprocedure) definition,proacl from pg_proc where oid=$1::regprocedure', [row.name])).rows[0];
      assert.deepEqual(current, { definition: row.definition, proacl: row.proacl });
    }
  });
  await test('save before ready and ready before save accept once, independently of Send or marking', async () => {
    for (const readyFirst of [false, true]) {
      const f = await book(), x = await photo(f, 2, service, { readyFirst });
      const [first] = await receipts(f); assert.equal(first.photo_revision, x.photo);
      assert.equal((await db.query('select sent_at from scan_photos where id=$1', [x.photo])).rows[0].sent_at, null);
      for (let i = 0; i < 2; i++) assert.equal(await rpc(service, 'change_scan_photo', [f.p, x.photo, 'save']), 'saved');
      assert.deepEqual(await receipts(f), [first]); assert.equal((await claims(f)).length, 0);
    }
  });
  await test('S1, unsaved, running, stale sheet and missing source/derived bytes refuse acceptance', async () => {
    for (const options of [{ ready: false }, { save: false }, { source: false }, { derived: false }, { result: { sheetCheck: 0 } },
      { result: { sheetCheck: '1' } }, { result: { calibration: { version: 1, revision: 'other' } } },
      { metadata: { size: 0, mimetype: 'image/jpeg' } }, { metadata: { size: 100, mimetype: 'text/plain' } }]) {
      const f = await book(); await photo(f, 2, service, options); assert.equal((await receipts(f)).length, 0);
    }
  });
  await test('wrong family/child/page/revision, absent contract, excluded pages and pre-install photos refuse receipts', async () => {
    for (const kind of ['family', 'child', 'revision', 'calibration', 'contract', 'printing', 'terminal', 'expiry', 'old']) {
      const f = await book(), x = await photo(f, 2, service, { save: false });
      if (kind === 'family') { const other = await book(); await db.query('update workbooks set parent_id=$2 where id=$1', [f.w, other.p]); }
      if (kind === 'child') { const other = await book({ parent: f.p }); await db.query('update workbooks set child_id=$2 where id=$1', [f.w, other.c]); }
      if (kind === 'revision') await db.query("update scan_photos set printed_revision='ffffffffffffffffffffffffffff' where id=$1", [x.photo]);
      if (kind === 'calibration') await db.query("update scan_calibrations set printed_revision='ffffffffffffffffffffffffffff' where photo_id=$1", [x.photo]);
      if (kind === 'contract') await db.query('update workbook_pages set print_contract=null where id=$1', [x.page]);
      if (kind === 'printing') await db.query("update workbooks set status='approved' where id=$1", [f.w]);
      if (kind === 'terminal') await rpc(service, 'change_scan_photo', [f.p, x.photo, 'reject']);
      if (kind === 'expiry') await db.query("update scan_photos set expires_at=clock_timestamp()-interval '1 second' where id=$1", [x.photo]);
      if (kind === 'old') await db.query("update scan_photos set created_at='2025-01-01Z' where id=$1", [x.photo]);
      await rpc(service, 'change_scan_photo', [f.p, x.photo, 'save']); assert.equal((await receipts(f)).length, 0, kind);
    }
    for (const n of [7, 8]) { const f = await book(); await photo(f, n); assert.equal((await receipts(f)).length, 0); }
  });
  await test('expiry after transaction start or missing files after calibration cannot admit a scan', async () => {
    const f = await book(), x = await photo(f, 2, service, { save: false });
    const c = await open('service_role');
    try {
      await c.query('begin');
      await db.query(`update scan_photos set expires_at=(select xact_start+interval '1 microsecond' from pg_stat_activity where pid=$2) where id=$1`, [x.photo, c.processID]);
      assert.equal(await rpc(c, 'change_scan_photo', [f.p, x.photo, 'save']), 'saved');
      await c.query('commit'); assert.equal((await receipts(f)).length, 0);
    } finally { await c.query('rollback'); await close(c); }
    for (const part of ['photo.jpg', 'straight.jpg']) {
      const g = await book(), y = await photo(g, 2, service, { save: false });
      const name = g.p + '/' + y.photo + '/' + (part === 'photo.jpg' ? part : y.cal + '-' + part);
      await db.query("delete from storage.objects where bucket_id='scan-photos' and name=$1", [name]);
      await rpc(service, 'change_scan_photo', [g.p, y.photo, 'save']); assert.equal((await receipts(g)).length, 0);
    }
  });
  await test('accepted history survives photo expiry and hard deletion; child/family cascades remove it', async () => {
    const f = await book(), x = await photo(f), initial = await receipts(f);
    await db.query("update scan_photos set state='expired',terminal_at=clock_timestamp() where id=$1", [x.photo]);
    assert.deepEqual(await receipts(f), initial);
    await db.query('delete from scan_photos where id=$1', [x.photo]); assert.deepEqual(await receipts(f), initial);
    await db.query('delete from children where id=$1', [f.c]); assert.equal((await receipts(f)).length, 0);
    const g = await book(); await photo(g); await db.query('delete from auth.users where id=$1', [g.p]); assert.equal((await receipts(g)).length, 0);
  });
  await test('Days 8/10 and partial Day7 cannot claim; full Day7 permits Days 1-6 gaps', async () => {
    const f = await book({ delivered: '2026-11-01T12:00:00Z' });
    for (const n of [4, 5, 2]) { await photo(f, n); assert.equal((await claims(f)).length, 0); }
    await photo(f, 3); const [claim] = await claims(f); assert.equal(claim.reason, 'day7_scanned');
    assert.equal(claim.receipt_ids.length, 4); assert.equal(claim.printed_revision, revision);
    await photo(f, 1); assert.deepEqual(await claims(f), [claim]);
  });
  await test('test workbooks require every frozen level-test part; a genuine one-page test is sufficient', async () => {
    for (const single of [false, true]) {
      const f = await book({ testBook: true, single, delivered: '2026-11-01T12:00:00Z' }); await photo(f, 2);
      assert.equal((await claims(f)).length, single ? 1 : 0);
      if (!single) { await photo(f, 3); assert.equal((await claims(f)).length, 1); }
    }
    const f = await book({ testBook: true });
    await db.query("update workbooks set print_manifest=jsonb_set(print_manifest,'{levelTest,pages}','[2]') where id=$1", [f.w]);
    await photo(f); assert.equal((await receipts(f)).length, 0);
  });
  await test('receipts before delivery claim on confirmation; repeat confirmation preserves every anchor', async () => {
    const f = await book(); await photo(f, 2); await photo(f, 3); assert.equal((await claims(f)).length, 0);
    const first = await confirm(f); assert.equal(first.status, 'confirmed'); const [claim] = await claims(f);
    assert.equal(Number(claim.delivery_audit_id), first.receipt.audit_id);
    assert.deepEqual(await confirm(f), first); assert.deepEqual(await claims(f), [claim]);
  });
  await test('effective correction rechecks receipts and each numbered book has its own delivery', async () => {
    const f = await book({ delivered: '2026-11-01T12:00:00Z' }); await photo(f, 6);
    const g = await book({ parent: f.p, child: f.c, number: 2 }); await photo(g, 2); await photo(g, 3);
    assert.equal((await claims(g)).length, 0); await confirm(g, '2026-11-02T12:00:00Z');
    const original = (await confirm(f)).receipt;
    assert.equal((await rpc(admin, 'correct_workbook_delivery', [f.w, f.c, 1, '2026-10-01T12:00:00Z', '2026-10-01T12:00', 'UTC', false,
      'Synthetic corrected date', randomUUID(), original.audit_id])).status, 'corrected');
    const [claim] = await claims(f); assert.equal(claim.reason, 'delivery_backstop'); assert.equal(claim.delivered_at.toISOString(), '2026-10-01T12:00:00.000Z');
    assert(claim.delivery_correction_id); assert.notEqual((await claims(g))[0].delivery_audit_id, claim.delivery_audit_id);
    assert.equal((await confirm(f)).receipt.delivered_at, original.delivered_at);
  });
  await test('zero-scan HOLD at 21 local days does not consume trigger; Extra practice alone is valid work', async () => {
    const f = await book({ number: 2 }); await confirm(f);
    assert.equal((await rpc(db, '_claim_workbook_scan_trigger', [f.w, '2026-11-22T11:59:59.999Z'])).status, 'waiting');
    assert.equal((await db.query('select count(*)::integer n from workbook_scan_backstop_holds where workbook_id=$1', [f.w])).rows[0].n, 0);
    assert.equal((await rpc(db, '_claim_workbook_scan_trigger', [f.w, '2026-11-22T12:00:00Z'])).status, 'hold');
    assert.equal((await claims(f)).length, 0);
    await photo(f, 6);
    assert.equal((await rpc(db, '_claim_workbook_scan_trigger', [f.w, '2026-11-22T12:00:00Z'])).claim.reason, 'delivery_backstop');
    assert.equal((await claims(f))[0].reason, 'delivery_backstop');
    const overdue = await book({ number: 2 }); await confirm(overdue, '2026-01-01T12:00:00Z');
    await photo(overdue, 6); assert.equal((await claims(overdue))[0].reason, 'delivery_backstop');
    assert.equal((await db.query('select count(*)::integer n from workbook_scan_backstop_holds where workbook_id=$1', [f.w])).rows[0].n, 1);
    const noDelivery = await book(); await photo(noDelivery, 6);
    assert.equal((await rpc(service, 'reconcile_workbook_scan_progress', [[noDelivery.w]]))[0].result.status, 'missing-delivery');
  });
  await test('local-calendar deadlines match actual deliveryDeadlines including gaps, folds and dated overrides', async () => {
    const { buildSync } = require('esbuild'); const { Module } = require('node:module');
    const output = buildSync({ stdin: { contents: 'export { deliveryDeadlines } from "./src/lib/workbook-delivery";', resolveDir: root },
      bundle: true, platform: 'node', format: 'cjs', write: false, tsconfig: path.join(root, 'tsconfig.json') }).outputFiles[0].text;
    const loaded = new Module(path.join(root, 'unica475-family-time.cjs'));
    loaded.paths = module.paths;
    loaded._compile(output, path.join(root, 'unica475-family-time.cjs'));
    const cases = [
      ['2025-02-16T08:30:00Z', 'America/Chicago', false], // Target 02:30 in spring gap: first valid 03:00.
      ['2025-10-12T06:30:00Z', 'America/Chicago', false], // Target repeated 01:30: earlier occurrence.
      ['2026-10-15T12:00:00Z', 'America/Vancouver', true],
      ['2026-10-15T12:00:00Z', 'America/Edmonton', true],
      ['2026-10-15T12:00:00Z', 'America/Winnipeg', true],
      ['2026-10-15T12:00:00Z', 'America/Yellowknife', true],
      ['2026-10-15T12:00:00Z', 'America/Chicago', false],
      ['2026-03-01T12:00:00Z', 'America/Vancouver', true],
      ['2026-10-15T12:00:00Z', 'Asia/Kolkata', true],
    ];
    for (const [deliveredAt, zone, override] of cases) {
      const expected = loaded.exports.deliveryDeadlines({ deliveredAt, timeZone: override ? zone : { zone, override: false } }).backstopAt;
      const actual = await rpc(db, '_workbook_scan_backstop', [deliveredAt, zone, override]);
      assert.equal(actual.toISOString(), expected, [deliveredAt, zone, override].join(' '));
    }
    const nativeAt = '2026-10-15T12:00:00Z';
    const nativeSql = (await rpc(db, '_workbook_scan_backstop', [nativeAt, 'America/Edmonton', false])).toISOString();
    const nativeNode = loaded.exports.deliveryDeadlines({ deliveredAt: nativeAt, timeZone: { zone: 'America/Edmonton', override: false } }).backstopAt;
    console.log('NATIVE_TZDATA_PARITY', JSON.stringify({ zone: 'America/Edmonton', override: false, sql: nativeSql, node: nativeNode, equal: nativeSql === nativeNode }));
    assert.equal((await rpc(db, '_workbook_scan_backstop', [cases[0][0], cases[0][1], false])).toISOString(), '2025-03-09T08:00:00.000Z');
    assert.equal((await rpc(db, '_workbook_scan_backstop', [cases[1][0], cases[1][1], false])).toISOString(), '2025-11-02T06:30:00.000Z');
  });
  await test('ordinary first-photo completion has no resolution event; accepted retake resolves once at scan time', async () => {
    const f = await book(), x = await photo(f), i = await claimMark(x);
    await applyMark(x, i.observation, { state: 'pending', result: null });
    assert.equal((await events(f)).length, 0); await terminate(x);
    const retake = await photo(f); const [_, receipt] = await receipts(f);
    await claimMark(retake); await applyMark(retake, i.observation);
    const [event] = await events(f); assert.equal(event.receipt_id, receipt.id); assert.equal(event.item_id, 'item1');
    assert.equal(event.to_version, event.from_version + 1); assert(event.admitted_at >= receipt.accepted_at);
    assert.equal(await marking('apply', retake, { events: [], at: new Date().toISOString() }), true);
    assert.equal((await events(f)).length, 1);
    const first = await book(), firstPhoto = await photo(first), firstItem = await claimMark(firstPhoto);
    await applyMark(firstPhoto, firstItem.observation); assert.equal((await events(first)).length, 0);
  });
  await test('unchanged pending/word-form mismatch and two-ways parent-pending do not report a resolution', async () => {
    for (const state of ['pending', 'parent-pending']) {
      const f = await book(), x = await photo(f), i = await claimMark(x);
      await applyMark(x, i.observation, { state: 'pending', result: null }); await terminate(x);
      const retake = await photo(f); await claimMark(retake);
      await applyMark(retake, i.observation, { state, result: null, method: state === 'parent-pending' ? 'parent' : 'code' });
      assert.equal((await events(f)).length, 0);
      if (state === 'parent-pending') {
        const m = (await marking('effective', retake, { child: f.c }))[0];
        assert.equal((await marking('change', retake, { itemId: 'item1', version: m.result_version, result: 'right' })).status, 'saved');
        assert.equal((await events(f)).length, 1); // Explicit parent resolution of the retained retake reading.
      }
    }
  });
  await test('finalized originals and parent changes survive retakes and stale versions without progress events', async () => {
    const f = await book(), x = await photo(f), i = await claimMark(x);
    await applyMark(x, i.observation, { result: 'wrong' });
    const original = (await marking('effective', x, { child: f.c }))[0];
    assert.equal((await marking('change', x, { itemId: 'item1', version: original.result_version, result: 'blank' })).status, 'saved');
    const saved = (await marking('effective', x, { child: f.c }))[0]; await terminate(x);
    const retake = await photo(f); await claimMark(retake); await applyMark(retake, i.observation);
    assert.deepEqual((await marking('effective', retake, { child: f.c }))[0], saved);
    assert.equal((await events(f)).length, 0);
    assert.equal((await marking('change', retake, { itemId: 'item1', version: original.result_version, result: 'right' })).status, 'conflict');
    assert.equal((await events(f)).length, 0);
  });
  await test('expected/mastery policy changes cannot create resolution events', async () => {
    for (const kind of ['expected', 'observation-mastery', 'observation-teaching']) {
      const f = await book(), x = await photo(f), i = await claimMark(x);
      await applyMark(x, i.observation, { state: 'pending', result: null }); await terminate(x);
      const retake = await photo(f); await claimMark(retake);
      const base = { ...i.observation };
      if (kind === 'expected') await db.query("update scan_marking_items set expected=jsonb_set(expected,'{mastery,reason}','\"policy-change\"') where page_id=$1", [x.page]);
      if (kind === 'observation-mastery') base.mastery = { eligible: false, reason: 'changed-policy' };
      if (kind === 'observation-teaching') base.teaching = { curriculum: { key: 'changed-policy', version: 'v2' } };
      await applyMark(retake, base); assert.equal((await events(f)).length, 0, kind);
    }
  });
  await test('parent resolution during retake publication wins its version and cannot be overwritten', async () => {
    const f = await book(), x = await photo(f), i = await claimMark(x);
    await applyMark(x, i.observation, { state: 'pending', result: null }); await terminate(x);
    const retake = await photo(f); await claimMark(retake);
    const current = (await marking('effective', retake, { child: f.c }))[0];
    assert.equal((await marking('change', retake, { itemId: 'item1', version: current.result_version, result: 'wrong' })).status, 'saved');
    await applyMark(retake, i.observation);
    assert.equal((await marking('effective', retake, { child: f.c }))[0].observation.result, 'wrong');
    assert.equal((await events(f)).length, 0); // That parent change retained the earlier photo, not new retake evidence.
  });
  await test('two sessions race parent correction and resolving publication through production version locks', async () => {
    for (const parentFirst of [false, true]) {
      const f = await book(), x = await photo(f), i = await claimMark(x);
      await applyMark(x, i.observation, { state: 'pending', result: null }); await terminate(x);
      const retake = await photo(f); await claimMark(retake);
      const old = (await marking('effective', retake, { child: f.c }))[0];
      const observation = { ...i.observation, evidence: { photoRevision: retake.photo }, state: 'scored', result: 'right', certainty: 'certain', readAnswerText: '42' };
      await marking('extract', retake, { observations: [observation], model: 'synthetic', prompt: 'synthetic' });
      const a = await open('service_role'), b = await open('service_role'); let pending;
      const change = c => marking('change', retake, { itemId: 'item1', version: old.result_version, result: 'wrong' }, c);
      const apply = c => marking('apply', retake, { events: [], at: new Date().toISOString() }, c);
      try {
        await a.query('begin');
        if (parentFirst) assert.equal((await change(a)).status, 'saved'); else assert.equal(await apply(a), true);
        pending = outcome(parentFirst ? apply(b) : change(b)); await blocked(b, a);
        await a.query('commit'); const result = await pending; assert.ifError(result.error);
        const current = (await marking('effective', retake, { child: f.c }))[0];
        assert.equal(current.observation.result, parentFirst ? 'wrong' : 'right');
        assert.equal((await events(f)).length, parentFirst ? 0 : 1);
        if (!parentFirst) {
          assert.equal(result.value.status, 'conflict'); const captured = await events(f);
          assert.equal((await marking('change', retake, { itemId: 'item1', version: current.result_version, result: 'wrong' })).status, 'saved');
          assert.deepEqual(await events(f), captured);
        }
      } finally { await a.query('rollback'); if (pending) await pending; await close(a); await close(b); }
    }
  });
  await test('two actual sessions supplying the last two receipts leave exactly one claim after a lock barrier', async () => {
    const f = await book({ delivered: '2026-11-01T12:00:00Z' });
    const x = await photo(f, 2, service, { save: false }), y = await photo(f, 3, service, { save: false });
    const a = await open('service_role'), b = await open('service_role'); let pending;
    try {
      await a.query('begin');
      assert.equal(await rpc(a, 'change_scan_photo', [f.p, x.photo, 'save']), 'saved');
      pending = outcome(rpc(b, 'change_scan_photo', [f.p, y.photo, 'save']));
      await blocked(b, a); console.log('BARRIER final-receipt B waits for A book gate');
      await a.query('commit'); const result = await pending; assert.ifError(result.error); assert.equal(result.value, 'saved');
      assert.equal((await receipts(f)).length, 2); assert.equal((await claims(f)).length, 1);
    } finally { await a.query('rollback'); if (pending) await pending; await close(a); await close(b); }
  });
  await test('delivery versus receipt completes in both lock orders with the book KEY SHARE before the gate', async () => {
    for (const deliveryFirst of [false, true]) {
      const f = await book({ single: true }), x = await photo(f, 2, service, { save: false });
      const a = await open(deliveryFirst ? 'authenticated' : 'service_role');
      const b = await open(deliveryFirst ? 'service_role' : 'authenticated'); let pending;
      await (deliveryFirst ? a : b).query("select set_config('test.viewer',$1,false)", [adminId]);
      const finish = c => rpc(c, 'change_scan_photo', [f.p, x.photo, 'save']);
      try {
        await a.query('begin');
        if (deliveryFirst) assert.equal((await confirm(f, undefined, a)).status, 'confirmed');
        else assert.equal(await finish(a), 'saved');
        pending = outcome(deliveryFirst ? finish(b) : confirm(f, undefined, b));
        await blocked(b, a); console.log('BARRIER', deliveryFirst ? 'scan waits for delivery book UPDATE' : 'delivery waits for scan book KEY SHARE');
        await a.query('commit'); const result = await pending; assert.ifError(result.error);
        assert.equal(deliveryFirst ? result.value : result.value.status, deliveryFirst ? 'saved' : 'confirmed');
        assert.equal((await receipts(f)).length, 1); assert.equal((await claims(f)).length, 1);
      } finally { await a.query('rollback'); if (pending) await pending; await close(a); await close(b); }
    }
  });
  await test('delivery owns book UPDATE before its hook: the waiting scan must not own the book gate', async () => {
    const f = await book({ single: true }), x = await photo(f, 2, service, { save: false });
    const a = await open('authenticated'), b = await open('service_role'); let pendingA, pendingB;
    await a.query("select set_config('test.viewer',$1,false)", [adminId]);
    try {
      await db.query('select pg_advisory_lock(475,41)');
      await a.query("begin; set local test.delivery_barrier='on'");
      pendingA = outcome(confirm(f, undefined, a)); await blocked(a, db);
      pendingB = outcome(rpc(b, 'change_scan_photo', [f.p, x.photo, 'save'])); await blocked(b, a);
      const gate = (await db.query("select pg_try_advisory_xact_lock(hashtextextended('workbook-scan:'||$1,0)) free", [f.w])).rows[0].free;
      assert.equal(gate, true, 'Scan must wait at book KEY SHARE before it acquires the gate');
      console.log('BARRIER delivery owns book, scan waits at KEY SHARE, book gate is free');
      await db.query('select pg_advisory_unlock(475,41)');
      const first = await pendingA; assert.ifError(first.error); assert.equal(first.value.status, 'confirmed');
      await a.query('commit'); const second = await pendingB; assert.ifError(second.error); assert.equal(second.value, 'saved');
      assert.equal((await claims(f)).length, 1);
    } finally {
      await db.query('select pg_advisory_unlock(475,41)');
      if (pendingA) await pendingA; await a.query('rollback');
      if (pendingB) await pendingB; await close(a); await close(b);
    }
  });
  await test('Day7 versus backstop and duplicate callbacks arbitrate the same unique claim in both orders', async () => {
    for (const backstopFirst of [false, true]) {
      // The private clock is controlled only by the fixture owner. Public callers cannot set time.
      const f = await book(); await photo(f, 1); const x = await photo(f, 2, service, { save: false }); await photo(f, 3);
      await confirm(f); const a = await open(), b = await open('service_role'); let pending;
      const deadline = '2026-11-22T12:00:00Z';
      try {
        await a.query('begin');
        if (backstopFirst) assert.equal((await rpc(a, '_claim_workbook_scan_trigger', [f.w, deadline])).claim.reason, 'delivery_backstop');
        else assert.equal(await rpc(a, 'change_scan_photo', [f.p, x.photo, 'save']), 'saved');
        pending = outcome(backstopFirst ? rpc(b, 'change_scan_photo', [f.p, x.photo, 'save'])
          : rpc(b, 'reconcile_workbook_scan_progress', [[f.w]]));
        await blocked(b, a); await a.query('commit'); const result = await pending; assert.ifError(result.error);
        const [claim] = await claims(f); assert.equal(claim.reason, backstopFirst ? 'delivery_backstop' : 'day7_scanned');
        await Promise.all([rpc(service, 'change_scan_photo', [f.p, x.photo, 'save']), rpc(b, 'change_scan_photo', [f.p, x.photo, 'save'])]);
        assert.deepEqual(await claims(f), [claim]); assert.equal((await receipts(f)).filter(r => r.photo_revision === x.photo).length, 1);
      } finally { await a.query('rollback'); if (pending) await pending; await close(a); await close(b); }
    }
  });
  await test('delivery correction and last receipt serialize in both orders and keep the winning delivery identity', async () => {
    for (const correctionFirst of [false, true]) {
      const f = await book({ delivered: '2026-11-01T12:00:00Z' }); await photo(f, 2);
      const x = await photo(f, 3, service, { save: false }), original = (await confirm(f)).receipt;
      const a = await open(correctionFirst ? 'authenticated' : 'service_role'), b = await open(correctionFirst ? 'service_role' : 'authenticated');
      await (correctionFirst ? a : b).query("select set_config('test.viewer',$1,false)", [adminId]); let pending;
      const request = randomUUID();
      const correct = c => rpc(c, 'correct_workbook_delivery', [f.w, f.c, f.number, '2026-10-01T12:00:00Z', '2026-10-01T12:00', 'UTC', false,
        'Synthetic concurrent correction', request, original.audit_id]);
      const save = c => rpc(c, 'change_scan_photo', [f.p, x.photo, 'save']);
      try {
        await a.query('begin');
        if (correctionFirst) assert.equal((await correct(a)).status, 'corrected'); else assert.equal(await save(a), 'saved');
        pending = outcome(correctionFirst ? save(b) : correct(b)); await blocked(b, a);
        await a.query('commit'); const result = await pending; assert.ifError(result.error);
        const [claim] = await claims(f); assert.equal((await claims(f)).length, 1);
        assert.equal(claim.reason, correctionFirst ? 'delivery_backstop' : 'day7_scanned');
        assert.equal(claim.delivery_correction_id, correctionFirst ? request : null);
        if (!correctionFirst) assert.equal(Number(claim.delivery_audit_id), original.audit_id);
      } finally { await a.query('rollback'); if (pending) await pending; await close(a); await close(b); }
    }
  });
  await test('all new history tables cascade with child and family deletion, including holds and resolution events', async () => {
    for (const family of [false, true]) {
      const f = await book(), x = await photo(f), i = await claimMark(x);
      await applyMark(x, i.observation, { state: 'pending', result: null }); await terminate(x);
      const retake = await photo(f); await claimMark(retake); await applyMark(retake, i.observation);
      await confirm(f, '2026-01-01T12:00:00Z'); // Partial scans claim the backstop.
      const held = await book({ parent: f.p, child: f.c, number: 2 }); await confirm(held, '2026-01-01T12:00:00Z');
      assert.equal((await events(f)).length, 1); assert.equal((await claims(f)).length, 1);
      assert.equal((await db.query('select count(*)::integer n from workbook_scan_backstop_holds where child_id=$1', [f.c])).rows[0].n, 1);
      if (family) await db.query('delete from auth.users where id=$1', [f.p]); else await db.query('delete from children where id=$1', [f.c]);
      for (const table of ['workbook_scan_receipts', 'workbook_scan_pending_items', 'workbook_scan_progress_events', 'workbook_scan_trigger_claims', 'workbook_scan_backstop_holds'])
        assert.equal((await db.query(`select count(*)::integer n from ${table} where child_id=$1`, [f.c])).rows[0].n, 0, table);
    }
  });
  await test('family and child fences reject new facts; deletion waits for an admitted transaction in both orders', async () => {
    for (const childFence of [false, true]) {
      const f = await book(), x = await photo(f, 2, service, { ready: false });
      if (childFence) await db.query('insert into child_deletions values($1,$2)', [f.c, f.p]);
      else await db.query('update parents set deletion_requested_at=clock_timestamp() where id=$1', [f.p]);
      await assert.rejects(() => rpc(service, 'finish_scan_calibration', [f.p, x.photo, x.cal, 'ready', x.result, 100]), e => e.code === '55000');
      await assert.rejects(() => rpc(service, 'reconcile_workbook_scan_progress', [[f.w]]), e => e.code === '55000');
      assert.equal((await receipts(f)).length, 0); assert.equal((await claims(f)).length, 0);
    }
    for (const freezeFirst of [false, true]) {
      const f = await book(), x = await photo(f, 2, service, { ready: false });
      const a = await open(), b = await open(); let pending;
      const finish = c => rpc(c, 'finish_scan_calibration', [f.p, x.photo, x.cal, 'ready', x.result, 100]);
      try {
        await a.query('begin');
        if (freezeFirst) await a.query('update parents set deletion_requested_at=clock_timestamp() where id=$1', [f.p]);
        else assert.equal(await finish(a), 'ready');
        pending = outcome(freezeFirst ? finish(b) : b.query('update parents set deletion_requested_at=clock_timestamp() where id=$1', [f.p]));
        await blocked(b, a); await a.query('commit'); const result = await pending;
        if (freezeFirst) assert.equal(result.error?.code, '55000'); else assert.ifError(result.error);
        assert.equal((await receipts(f)).length, freezeFirst ? 0 : 1);
      } finally { await a.query('rollback'); if (pending) await pending; await close(a); await close(b); }
    }
  });
  await test('all new raw RLS/grants and direct RPC attempts deny anon/own/other parent and permit checked admin/service paths', async () => {
    const f = await book(); await photo(f); const other = await book();
    const tables = ['workbook_scan_receipts', 'workbook_scan_pending_items', 'workbook_scan_progress_events', 'workbook_scan_trigger_claims', 'workbook_scan_backstop_holds'];
    for (const [role, viewer, isAdmin] of [['anon', null, false], ['authenticated', f.p, false], ['authenticated', other.p, false], ['authenticated', adminId, true], ['service_role', null, false]]) {
      const c = await open(role);
      try {
        if (viewer) await c.query("select set_config('test.viewer',$1,false)", [viewer]);
        for (const table of tables) {
          if (role === 'anon') await assert.rejects(() => c.query('select * from ' + table), e => e.code === '42501');
          else { const rows = (await c.query(`select * from ${table} where parent_id=$1`, [f.p])).rows;
            if (role === 'authenticated' && !isAdmin) assert.equal(rows.length, 0);
            if (table === 'workbook_scan_receipts' && (isAdmin || role === 'service_role')) assert.equal(rows.length, 1);
          }
          for (const verb of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) assert.equal((await db.query('select has_table_privilege($1,$2,$3) allowed', [role, table, verb])).rows[0].allowed, false);
          await assert.rejects(() => c.query('insert into ' + table + ' default values'), e => e.code === '42501');
          await assert.rejects(() => c.query('delete from ' + table), e => e.code === '42501');
        }
        await assert.rejects(() => rpc(c, '_admit_workbook_scan_receipt', [randomUUID()]), e => e.code === '42501');
        await assert.rejects(() => rpc(c, '_claim_workbook_scan_trigger', [f.w, '2099-01-01Z']), e => e.code === '42501');
        if (role === 'service_role') assert.equal((await rpc(c, 'reconcile_workbook_scan_progress', [[f.w]]))[0].result.status, 'missing-delivery');
        else await assert.rejects(() => rpc(c, 'reconcile_workbook_scan_progress', [[f.w]]), e => e.code === '42501');
        if (isAdmin) assert.equal((await rpc(c, 'admin_reconcile_workbook_scan_progress', [[f.w]]))[0].result.status, 'missing-delivery');
        else await assert.rejects(() => rpc(c, 'admin_reconcile_workbook_scan_progress', [[f.w]]), e => e.code === '42501');
      } finally { await close(c); }
    }
    const metadata = (await db.query(`select proname,prosecdef,proconfig from pg_proc where proname in
      ('_admit_workbook_scan_receipt','_claim_workbook_scan_trigger','capture_workbook_scan_receipt','capture_workbook_scan_resolution',
      'reconcile_workbook_scan_progress','admin_reconcile_workbook_scan_progress')`)).rows;
    assert.equal(metadata.length, 6); for (const m of metadata) { assert(m.prosecdef); assert.deepEqual(m.proconfig, ['search_path=""']); }
    await assert.rejects(() => rpc(service, 'reconcile_workbook_scan_progress', [Array(101).fill(f.w)]), /invalid_scan_batch/);
    await assert.rejects(() => rpc(service, 'reconcile_workbook_scan_progress', [[null]]), /invalid_scan_batch/);
  });
  console.log('WORKBOOK_SCAN_RECEIPTS_OK', passed);
  console.log('PROOF receipt: production hooks/RPC admission and durable rows; synthetic image quality/Storage metadata only.');
  console.log('PROOF marking: production S4/S5 versions and publication; no model, learning-event publication or profile policy.');
  console.log('PROOF claims: actual concurrent PostgreSQL sessions and explicit barriers; reduced dependency schema, not hosted proof.');
  console.log('PROOF calendar: actual deliveryDeadlines/family-time compared with SQL; no hosted tzdata or scheduler activated.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  await Promise.allSettled([...clients].map(c => c.end()));
  try { cleanup(); } catch (e) { console.error('CLEANUP FAILED', e); process.exitCode = 1; }
});
