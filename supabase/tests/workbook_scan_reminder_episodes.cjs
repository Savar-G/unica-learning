// Disposable real PostgreSQL only. No environment URL, hosted service, credentials or external transport.
const { Client } = require('pg');
const { readFileSync, mkdtempSync, rmSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { Module } = require('node:module');
const { buildSync } = require('esbuild');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const migration = '20261106230000_workbook_scan_reminder_episodes.sql';
const sql = name => readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
const command = (name, args) => execFileSync('/opt/homebrew/bin/' + name, args, { encoding: 'utf8' });
const clients = new Set(), distribution = new Map();
let directory, started = false, passed = 0;
function cleanup() {
  if (started) { command('pg_ctl', ['-D', path.join(directory, 'data'), '-m', 'immediate', '-w', 'stop']); started = false; }
  if (directory) { rmSync(directory, { recursive: true, force: true }); console.log('LOCAL_CLUSTER_REMOVED', directory); }
}
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) process.on(signal, () => { try { cleanup(); } finally { process.exit(code); } });
function functionSql(source, name) {
  const start = source.search(new RegExp('create (?:or replace )?function public\\.' + name + '\\('));
  assert(start >= 0, name);
  const tail = source.slice(start), end = tail.indexOf('$$;', tail.indexOf('as $$') + 5);
  assert(end >= 0, name); return tail.slice(0, end + 3);
}
async function open(role = null) {
  const c = new Client({ host: directory, port: 5432, database: 'postgres', user: 'fixture_owner', password: '',
    application_name: 'scan-reminder-episodes-475', connectionTimeoutMillis: 5000 });
  clients.add(c); await c.connect(); await c.query("set statement_timeout='15s'; set deadlock_timeout='100ms'");
  if (role) await c.query('set role ' + role);
  return c;
}
async function close(c) { await c.end(); clients.delete(c); }
const rpc = async (c, name, args = []) => (await c.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`, args)).rows[0].value;
const outcome = p => p.then(value => ({ value }), error => ({ error }));
const revision = '0123456789abcdef0123456789ab';
const hash = () => createHash('sha256').update(randomUUID()).digest('hex');
const clockVersion = 'scanInactivityCandidate:597c04c1;node=' + process.version + ';tz=' + process.versions.tz;
function bundle(contents) {
  // server-only is a deployment guard. Removing that import in this in-memory bundle does not replace module code.
  const output = buildSync({ stdin: { contents, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', write: false,
    alias: { 'server-only': path.join(root, 'supabase/tests/workbook_scan_reminder_episodes_empty.cjs') },
    tsconfig: path.join(root, 'tsconfig.json') }).outputFiles[0].text;
  const loaded = new Module(path.join(root, 'unica475-reminder-test.cjs')); loaded.paths = module.paths;
  loaded._compile(output, path.join(root, 'unica475-reminder-test.cjs')); return loaded.exports;
}
const { scanInactivityCandidate, familyZone, deliveryDeadlines, deliveryLocalTime, localDateTime, localDay,
  sendEmailOnce, pacedTransport, copyRow } = bundle(`
  export { scanInactivityCandidate } from './src/lib/workbook-scan-progress';
  export { familyZone, localDateTime, localDay } from './src/lib/family-time';
  export { deliveryDeadlines, deliveryLocalTime } from './src/lib/workbook-delivery';
  export { sendEmailOnce, pacedTransport } from './src/lib/email-delivery';
  export { copyRow } from './src/lib/email-copies';`);

(async () => {
  console.log('FALSIFIER: unsupported/fenced/completed recovery rows starve a bounded batch, or a stored calendar is replaced by SQL arithmetic.');
  console.log('FALSIFIER: duplicate/rejected/unchanged work or clock-only changes create a new episode, or admission time replaces scan time.');
  console.log('FALSIFIER: schedulers split siblings, a scan/unsubscribe/freeze crosses last admission, or either lock order deadlocks.');
  console.log('FALSIFIER: unknown/lost/busy resends, a stale attempt finalizes a replacement, or child/family deletion leaves new data/copies.');
  for (const name of ['psql', 'initdb', 'pg_ctl', 'pg_config']) console.log(command(name, ['--version']).trim());
  directory = mkdtempSync('/tmp/unica475-reminders-pg-');
  command('initdb', ['-D', path.join(directory, 'data'), '-A', 'trust', '--no-locale', '-U', 'fixture_owner']);
  started = true;
  command('pg_ctl', ['-D', path.join(directory, 'data'), '-l', path.join(directory, 'postgres.log'),
    '-o', `-F -k ${directory} -p 5432 -c listen_addresses=''`, '-w', '-t', '10', 'start']);
  const db = await open();
  await db.query(readFileSync(path.join(__dirname, 'workbook_scan_receipts_fixture.sql'), 'utf8'));
  await db.query(readFileSync(path.join(__dirname, 'workbook_scan_reminder_episodes_fixture.sql'), 'utf8'));
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
  for (const file of ['20261102223812_workbook_delivery_receipts.sql', '20261102225721_workbook_delivery_corrections.sql',
    '20261011_add_email_log.sql', '20261015_add_start_followup_reminder.sql', '20261101_add_maya_daily_email.sql',
    '20261102014354_add_maya_weekly_email.sql', '20261105_monthly_summary_email.sql', '20261015_add_email_copies.sql',
    '20261015_add_email_events.sql']) await db.query(sql(file));
  // The call coverage RPC is outside scope. Only its actual schema column is needed by the unchanged copy scope code.
  await db.query('alter table public.email_log add column call_ids uuid[]');
  for (const file of ['20261104_add_child_plan_states.sql', '20261105_child_plan_state_latest_read.sql',
    '20261105_child_plan_state_read_order.sql', '20261105_child_delete_email_copies.sql', '20261105_child_email_scope.sql']) await db.query(sql(file));
  await db.query("alter table public.child_plan_states drop constraint child_plan_states_kind_check; alter table public.child_plan_states add constraint child_plan_states_kind_check check(kind in ('not_started','free_month','paying','payment_failed','ending','ended','paused'))");
  for (const table of ['children','email_log','card_setups','plan_starts','child_plan_controls','plan_control_operations'])
    await db.query(`create trigger fence_family_write before insert or update on public.${table} for each row execute function public.fence_family_write()`);
  await db.query('create trigger zz_unsubscribe_barrier before insert on public.email_log for each row execute function public.fixture_scan_unsubscribe_barrier()');
  await db.query('create trigger fixture_scan_delivery_barrier before insert on public.workbook_delivery_receipts for each row execute function public.fixture_scan_delivery_barrier()');
  await db.query('grant all on public.email_log,public.email_copies to service_role');
  await db.query(sql('20261106224500_workbook_scan_receipts.sql'));
  const before = (await db.query(`select oid::regprocedure::text name,pg_get_functiondef(oid) definition,proacl
    from pg_proc where pronamespace='public'::regnamespace order by 1`)).rows;
  const oldConstraints = (await db.query("select conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.email_log'::regclass order by conname")).rows;
  await db.query(sql(migration));
  const adminId = randomUUID(); await db.query('insert into admin_users values($1,$2)', [adminId, 'admin@example.invalid']);
  const service = await open('service_role'), admin = await open('authenticated');
  await admin.query("select set_config('test.viewer',$1,false)", [adminId]);
  const now = async () => +(await db.query('select clock_timestamp() at')).rows[0].at;
  const iso = at => new Date(at).toISOString();
  const dateBefore = async days => iso(await now() - days * 86400000).slice(0, 16) + ':00.000Z';
  async function test(group, name, run) {
    console.log('FALSIFIER', group, name); await run(); passed++;
    distribution.set(group, (distribution.get(group) ?? 0) + 1); console.log('PASS', group, name);
  }
  async function book({ parent = randomUUID(), child = randomUUID(), number = 1, delivered = null, zone = 'UTC', override = false } = {}) {
    const f = { p: parent, c: child, w: randomUUID(), pages: [], number };
    await db.query('insert into auth.users(id) values($1) on conflict do nothing', [parent]);
    await db.query("insert into parents(id,email,time_zone,postal) values($1,'parent@example.invalid','UTC','V3S 1A1') on conflict do nothing", [parent]);
    await db.query("insert into children(id,parent_id,province) values($1,$2,'BC') on conflict do nothing", [child, parent]);
    f.manifest = { version: 1, snapshotDay: 7, curriculum: { key: 'bc', version: 'v1' }, testWorkbook: false,
      days: [{ day: 1, pages: [1] }, { day: 7, pages: [2, 3] }, { day: 8, pages: [4] }, { day: 10, pages: [5] }], levelTest: null };
    await db.query(`insert into workbooks(id,parent_id,child_id,number,status,printed_revision,print_manifest,shipped_at)
      values($1,$2,$3,$4,'shipped',$5,$6,'2024-01-01Z')`, [f.w, parent, child, number, revision, f.manifest]);
    for (let n = 1; n <= 8; n++) {
      const id = randomUUID(), type = n === 7 ? 'cover' : n === 8 ? 'blank' : 'day';
      const day = { 1: 'Day 1', 2: 'Day 7', 3: 'Day 7', 4: 'Day 8', 5: 'Day 10', 6: 'Extra practice' }[n] ?? null;
      f.pages.push({ id, number: n, type, dayLabel: day, questions: n < 8 ? [{}] : [] });
      await db.query(`insert into workbook_pages(id,workbook_id,parent_id,page_number,day_label,page_type,print_contract,image_width,image_height,image_path,qr_token)
        values($1,$2,$3,$4,$5,$6,$7,1000,1400,'synthetic.jpg',$8)`, [id, f.w, parent, n, day, type,
        { version: 1, workbookId: f.w, page: n, coordinates: { image: { width: 1000, height: 1400 } } }, 'synthetic-' + id]);
      if (n < 8) await db.query('insert into workbook_questions(parent_id,workbook_id,page_id,question_number,package) values($1,$2,$3,1,$4)',
        [parent, f.w, id, { id: 'item1', skill: { standard: '2.4', skills: [] } }]);
    }
    await db.query("insert into child_plan_states(child_id,parent_id,kind,read_at) values($1,$2,'paying',clock_timestamp()) on conflict do nothing", [child, parent]);
    if (delivered) await confirm(f, delivered, zone, override);
    return f;
  }
  async function confirm(f, at, zone = 'UTC', override = false, c = admin) {
    return rpc(c, 'confirm_workbook_delivery', [f.w, f.c, f.number, at, deliveryLocalTime(at, override ? zone : { zone, override: false }), zone, override]);
  }
  async function correct(f, at, c = admin) {
    const r = (await db.query('select * from workbook_delivery_receipts where workbook_id=$1', [f.w])).rows[0];
    const audit = (await db.query('select max(audit_id) audit from workbook_delivery_corrections where workbook_id=$1', [f.w])).rows[0].audit ?? r.audit_id;
    return rpc(c, 'correct_workbook_delivery', [f.w, f.c, f.number, at, deliveryLocalTime(at, r.zone_override ? r.time_zone : { zone: r.time_zone, override: false }),
      r.time_zone, r.zone_override, 'Synthetic correction', randomUUID(), audit]);
  }
  const context = (f, c = service) => rpc(c, 'read_workbook_scan_inactivity_context', [f.w]);
  async function projection(f) {
    const r = (await db.query('select * from workbook_delivery_receipts where workbook_id=$1', [f.w])).rows[0];
    const correction = (await db.query('select * from workbook_delivery_corrections where workbook_id=$1 order by audit_id desc limit 1', [f.w])).rows[0];
    const delivery = r ? { workbookId: f.w, childId: f.c, parentId: f.p, number: f.number, deliveredAt: iso(correction?.delivered_at ?? r.delivered_at),
      timeZone: r.zone_override ? r.time_zone : { zone: r.time_zone, override: false }, auditId: Number(correction?.audit_id ?? r.audit_id) } : null;
    const rows = (await db.query('select * from workbook_scan_receipts where workbook_id=$1 order by accepted_at,id', [f.w])).rows;
    const receipts = rows.map(x => ({ id: x.id, status: 'accepted', workbookId: f.w, parentId: f.p, childId: f.c,
      printedRevision: revision, pageId: x.page_id, photoRevision: x.photo_revision, acceptedAt: iso(x.accepted_at) }));
    const progressEvents = (await db.query('select * from workbook_scan_progress_events where workbook_id=$1', [f.w])).rows.map(x => ({ id: x.id,
      workbookId: f.w, parentId: f.p, childId: f.c, printedRevision: revision, pageId: x.page_id, reason: x.reason,
      receiptId: x.receipt_id, admittedAt: iso(x.admitted_at), resolvedItemIds: [x.item_id] }));
    const parent = (await db.query('select * from parents where id=$1', [f.p])).rows[0];
    const oldest = (await db.query('select * from children where parent_id=$1 order by created_at,id limit 1', [f.p])).rows[0];
    const input = { parentId: f.p, childId: f.c, books: [{ workbookId: f.w, parentId: f.p, childId: f.c, number: f.number,
      printedRevision: revision, manifest: f.manifest, pages: f.pages, delivery }], receipts, progressEvents,
      timeZone: familyZone({ timeZone: parent.time_zone, postal: parent.postal, province: oldest?.province }), now: await now() };
    return { input, candidate: scanInactivityCandidate(input) };
  }
  async function propose(f, c = service, supplied = null) {
    const read = supplied ?? await context(f); assert.equal(read.status, 'read');
    const ident = read.identity; assert(ident, 'candidate identity required');
    const { candidate } = await projection(f); assert.equal(candidate.status, 'candidate');
    assert.equal(candidate.anchorAt, iso(ident.anchor_at));
    return rpc(c, 'propose_workbook_scan_inactivity', [f.w, ident.delivery_audit_id, ident.activity_receipt_id,
      candidate.anchorAt, candidate.dueAt, ident.clock_context, clockVersion]);
  }
  const due = (f, c = service) => rpc(c, 'read_workbook_scan_reminder_due', [f.p]);
  const claim = (f, ids, c = service, tokenHash = hash()) => rpc(c, 'claim_workbook_scan_reminder', [f.p, ids, tokenHash]);
  const admit = (m, c = service) => rpc(c, 'admit_workbook_scan_reminder', [m.message_id, m.attempt_token]);
  const finish = (m, state, c = service, emailId = state === 'sent' ? 'synthetic-provider-id' : null) => rpc(c, 'finish_workbook_scan_reminder', [m.message_id, m.attempt_token, state, emailId]);
  const release = (m, c = service) => rpc(c, 'release_workbook_scan_reminder', [m.message_id, m.attempt_token]);
  async function dueBook(options = {}) { const f = await book({ delivered: await dateBefore(5), ...options }); await propose(f); return f; }
  async function take(f) { const set = await due(f); assert.equal(set.status, 'ready'); return claim(f, set.episode_ids); }
  async function materialize(f) {
    const q = (await db.query('select * from workbook_scan_clock_requests where workbook_id=$1 order by delivery_audit_id desc limit 1', [f.w])).rows[0];
    return rpc(service, 'record_workbook_scan_delivery_calendar', [f.w, q.delivery_audit_id, iso(q.delivered_at), q.time_zone,q.zone_override,
      deliveryDeadlines({ deliveredAt: iso(q.delivered_at), timeZone: q.zone_override ? q.time_zone : { zone: q.time_zone, override: false } }).backstopAt,clockVersion]);
  }
  async function photo(f, n = 1, c = service, { save = true, ready = true } = {}) {
    const x = { ...f, page: f.pages[n - 1].id, photo: randomUUID(), cal: randomUUID(), token: randomUUID() };
    await db.query(`insert into scan_photos(id,parent_id,child_id,page_id,workbook_id,printed_revision,state,reserved_bytes,width,height)
      values($1,$2,$3,$4,$5,$6,'processing',10000,1000,1400)`, [x.photo, f.p, f.c, x.page, f.w, revision]);
    await db.query("insert into storage.objects(bucket_id,name,metadata) values('scan-photos',$1,$2)", [f.p + '/' + x.photo + '/photo.jpg', { size: 100, mimetype: 'image/jpeg' }]);
    assert.equal(await rpc(c, 'finish_scan_photo', [f.p, x.photo, 100]), 'pending');
    if (save) assert.equal(await rpc(c, 'change_scan_photo', [f.p, x.photo, 'save']), 'saved');
    assert.equal((await rpc(c, 'begin_scan_calibration', [f.p, x.photo, x.cal, 90])).status, 'started');
    await db.query("insert into storage.objects(bucket_id,name,metadata) values('scan-photos',$1,$2)", [f.p + '/' + x.photo + '/' + x.cal + '-straight.jpg', { size: 100, mimetype: 'image/jpeg' }]);
    x.result = { calibration: { version: 1, revision, photo: { width: 1000, height: 1400 } }, parts: ['straight'], sheetCheck: 1 };
    if (ready) assert.equal(await rpc(c, 'finish_scan_calibration', [f.p, x.photo, x.cal, 'ready', x.result, 100]), 'ready');
    return x;
  }
  const marking = (action, x, data = {}, c = service) => rpc(c, 'scan_marking_command', [action, x.p, x.photo, x.token, data]);
  async function pendingMark(x) {
    await rpc(service, 'send_scan_photos', [x.p, x.c, [x.photo]]);
    const identity = { workbookId: x.w, printedRevision: revision, pageId: x.page, itemId: 'item1' };
    const expected = { identity, number: 1, method: 'code', mastery: { eligible: false, reason: 'try-first' }, scoredRegions: ['a'] };
    const observation = { version: 1, identity, evidence: { photoRevision: x.photo }, state: 'pending', method: 'code',
      readAnswerText: null, regions: [], certainty: 'not-read', result: null, teaching: null, mastery: expected.mastery, help: 'none', actor: 'system', resultVersion: 1 };
    assert.equal((await marking('claim', x, { hash: 'synthetic', items: [{ expected, observation }] })).token, x.token);
    return observation;
  }
  async function applyMark(x, base, resolve = false) {
    const observation = { ...base, evidence: { photoRevision: x.photo }, ...(resolve ? { state: 'scored', result: 'right', certainty: 'certain', readAnswerText: '42' } : {}) };
    assert.equal(await marking('extract', x, { observations: [observation], model: 'synthetic', prompt: 'synthetic' }), true);
    assert.equal(await marking('apply', x, { events: [], at: iso(await now()) }), true);
  }
  async function terminal(x) { await marking('finish', x); await rpc(service, 'change_scan_photo', [x.p, x.photo, 'delete']); }
  async function historicalReceiptTime(x, at) {
    // Fixture clock input only. Admission first runs through real photo/calibration hooks.
    // Only the disposable owner ages that admitted receipt. Public roles cannot perform this write.
    await db.query('alter table workbook_scan_receipts disable trigger immutable_scan_fact');
    try { await db.query('update workbook_scan_receipts set accepted_at=$2 where photo_revision=$1',[x.photo,at]); }
    finally { await db.query('alter table workbook_scan_receipts enable trigger immutable_scan_fact'); }
  }
  async function blocked(waiter, holder) {
    const end = Date.now() + 5000;
    do {
      const r = (await db.query('select wait_event_type,pg_blocking_pids(pid) blockers from pg_stat_activity where pid=$1', [waiter.processID])).rows[0];
      if (r?.wait_event_type === 'Lock' && r.blockers.includes(holder.processID)) return;
      await new Promise(resolve => setImmediate(resolve));
    } while (Date.now() < end);
    throw Error('Missing explicit lock barrier');
  }

  // TESTS
  await test('schema', 'all pre-existing function bodies, ACLs and unexpanded email checks remain identical', async () => {
    for (const row of before) {
      const current = (await db.query('select pg_get_functiondef($1::regprocedure) definition,proacl from pg_proc where oid=$1::regprocedure', [row.name])).rows[0];
      assert.deepEqual(current, { definition: row.definition, proacl: row.proacl });
    }
    for (const row of oldConstraints.filter(x => !['email_log_kind_check', 'email_log_check'].includes(x.conname))) {
      assert.equal((await db.query("select pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.email_log'::regclass and conname=$1", [row.conname])).rows[0].definition, row.definition);
    }
  });
  await test('recovery', 'invalid limits/modes fail; recovery has stable distinct IDs and a finite 103-book drain', async () => {
    for (const limit of [null, 0, -1, 101]) await assert.rejects(() => rpc(service, 'list_workbook_scan_recovery_books', ['unseeded', limit, null]), /invalid_scan_recovery_batch/);
    await assert.rejects(() => rpc(service, 'list_workbook_scan_recovery_books', ['other', 10, null]), /invalid_scan_recovery_batch/);
    const books = [];
    // These are pre-migration delivery fixtures: disable only the new delivery recheck while production confirmation runs.
    await db.query('alter table workbook_delivery_receipts disable trigger recheck_scan_delivery');
    try { for (let i = 0; i < 103; i++) books.push(await book({ delivered: await dateBefore(5) })); }
    finally { await db.query('alter table workbook_delivery_receipts enable trigger recheck_scan_delivery'); }
    const first = await rpc(service, 'list_workbook_scan_recovery_books', ['unseeded', 100, null]);
    assert.equal(first.length, 100); assert.equal(new Set(first.map(x => x.workbook_id)).size, 100);
    assert.deepEqual(first.map(x => x.workbook_id), first.map(x => x.workbook_id).sort());
    await rpc(service, 'reconcile_workbook_scan_progress', [first.map(x => x.workbook_id)]);
    const tail = await rpc(service, 'list_workbook_scan_recovery_books', ['unseeded', 100, null]); assert.equal(tail.length, 3);
    assert(tail.every(x => !first.some(y => y.workbook_id === x.workbook_id)));
    await rpc(service, 'reconcile_workbook_scan_progress', [tail.map(x => x.workbook_id)]);
    assert.deepEqual(await rpc(service, 'list_workbook_scan_recovery_books', ['unseeded', 100, null]), []);
    for (const seeded of books) await materialize(seeded);
    const f = books[0]; await correct(f, await dateBefore(6));
    const requests = await rpc(service, 'list_workbook_scan_clock_requests', [100]);
    assert.equal(requests.filter(x => x.workbook_id === f.w).length, 1, 'only effective correction survives the existing missing-clock selector');
  });
  await test('recovery', 'unsupported/frozen/tombstoned deliveries cannot fill unseeded batches', async () => {
    const bad = [];
    await db.query('alter table workbook_delivery_receipts disable trigger recheck_scan_delivery');
    try {
      for (const kind of ['legacy','freeze','child']) {
        const f = await book({ delivered: await dateBefore(5) }); bad.push(f.w);
        if (kind === 'legacy') await db.query("update workbooks set print_manifest='{}' where id=$1", [f.w]);
        if (kind === 'freeze') await db.query('update parents set deletion_requested_at=clock_timestamp() where id=$1', [f.p]);
        if (kind === 'child') await db.query('insert into child_deletions(child_id,parent_id) values($1,$2)', [f.c,f.p]);
      }
      const good = await book({ delivered: await dateBefore(5) });
      const rows = await rpc(service, 'list_workbook_scan_recovery_books', ['unseeded', 1, null]);
      assert.deepEqual(rows.map(x => x.workbook_id), [good.w]);
      await rpc(service, 'reconcile_workbook_scan_progress', [[good.w]]);
      assert.deepEqual(await rpc(service, 'list_workbook_scan_recovery_books', ['unseeded', 100, null]), []);
    } finally { await db.query('alter table workbook_delivery_receipts enable trigger recheck_scan_delivery'); }
  });
  await test('recovery','a current correction without a clock request is seeded once; keyset sweeps advance past completed books',async()=>{
    const f=await dueBook();await materialize(f);
    await db.query('alter table workbook_delivery_corrections disable trigger recheck_scan_delivery');
    try{assert.equal((await correct(f,await dateBefore(6))).status,'corrected');}
    finally{await db.query('alter table workbook_delivery_corrections enable trigger recheck_scan_delivery');}
    const rows=await rpc(service,'list_workbook_scan_recovery_books',['unseeded',100,null]);assert(rows.some(x=>x.workbook_id===f.w));
    await rpc(service,'reconcile_workbook_scan_progress',[[f.w]]);assert(!(await rpc(service,'list_workbook_scan_recovery_books',['unseeded',100,null])).some(x=>x.workbook_id===f.w));
    const all=[];let after=null;
    for(let i=0;i<10;i++){
      const page=await rpc(service,'list_workbook_scan_recovery_books',['inactivity',17,after]);if(!page.length)break;
      assert(page.every(x=>after===null||x.workbook_id>after));all.push(...page.map(x=>x.workbook_id));after=page.at(-1).workbook_id;
    }
    assert(all.length>100);assert.equal(new Set(all).size,all.length);assert.deepEqual(all,[...all].sort());
  });
  await test('episodes', 'missing/repeated/corrected delivery uses one effective book identity and one episode', async () => {
    const f = await book(); assert.equal((await context(f)).identity, null);
    const delivery = await dateBefore(5); assert.equal((await confirm(f, delivery)).status, 'confirmed');
    const first = await propose(f), repeat = await confirm(f, delivery); assert.equal(repeat.status, 'confirmed');
    assert.equal((await propose(f)).episode.id, first.episode.id);
    const saved = await context(f); assert.equal((await correct(f, await dateBefore(6))).status, 'corrected');
    const { candidate } = await projection(f);
    assert.equal((await rpc(service,'propose_workbook_scan_inactivity',[f.w,saved.identity.delivery_audit_id,null,saved.identity.anchor_at,candidate.dueAt,saved.identity.clock_context,clockVersion])).status,'stale');
    const current = await propose(f); assert.equal(current.episode.id, first.episode.id);
    assert.notEqual(current.episode.delivery_audit_id, first.episode.delivery_audit_id);
    assert.equal((await db.query('select count(*)::int n from workbook_scan_inactivity_episodes where workbook_id=$1',[f.w])).rows[0].n,1);
  });
  await test('episodes', 'delivery-only uses saved delivery zone; scans use current family zone, with microseconds truncated', async () => {
    const f = await book({ delivered: await dateBefore(5), zone:'America/Toronto', override:true });
    const deliveryEpisode = await propose(f); assert.equal(deliveryEpisode.status,'recorded');
    const x = await photo(f); const read = await context(f); assert.equal(read.identity.zone_mode,'family');
    const raw = (await db.query('select accepted_at::text raw,date_trunc(\'milliseconds\',accepted_at) anchor from workbook_scan_receipts where photo_revision=$1',[x.photo])).rows[0];
    assert.equal(iso(read.identity.anchor_at), iso(raw.anchor));
    assert.equal((await propose(f)).status,'recorded'); console.log('MILLISECOND_ANCHOR',raw.raw,read.identity.anchor_at);
    await db.query("update parents set time_zone='America/Toronto' where id=$1",[f.p]);
    assert.equal((await due(f)).status,'refresh-required');
    const updated = await propose(f); assert.equal(updated.episode.activity_receipt_id,read.identity.activity_receipt_id);
    assert.notEqual(updated.episode.id, deliveryEpisode.episode.id);
  });
  await test('episodes', 'same calendar identity refuses a conflicting deadline; version or raw context can refresh it', async () => {
    const f = await dueBook(), saved = await context(f), before = (await propose(f)).episode;
    const args = [f.w,saved.identity.delivery_audit_id,saved.identity.activity_receipt_id,before.anchor_at,iso(Date.parse(before.due_at)+1),saved.identity.clock_context,clockVersion];
    assert.equal((await rpc(service,'propose_workbook_scan_inactivity',args)).status,'calendar-conflict');
    args[6] += ';reviewed-v2'; assert.equal((await rpc(service,'propose_workbook_scan_inactivity',args)).status,'recorded');
    for (const [index,value] of [[1,999999],[2,randomUUID()],[3,iso(Date.parse(before.anchor_at)+1)],[5,{}]]) {
      const wrong=[...args];wrong[index]=value;assert.equal((await rpc(service,'propose_workbook_scan_inactivity',wrong)).status,'stale');
    }
  });
  await test('episodes', 'unchanged/duplicate/rejected retakes do not reset; production S4 resolving retake does', async () => {
    const f=await dueBook(), first=await photo(f), base=await pendingMark(first); await applyMark(first,base); await terminal(first);
    const original=(await propose(f)).episode;
    const unchanged=await photo(f);await pendingMark(unchanged);await applyMark(unchanged,base);await terminal(unchanged);
    assert.equal((await propose(f)).episode.id,original.id);
    const rejected=await photo(f,1,service,{save:false});await rpc(service,'change_scan_photo',[f.p,rejected.photo,'reject']);
    assert.equal((await propose(f)).episode.id,original.id);
    const retake=await photo(f);await pendingMark(retake);
    // Ensure separate millisecond scan instants without inventing an expected calendar.
    await db.query('select pg_sleep(0.003)');await applyMark(retake,base,true);
    const resolved=(await propose(f)).episode;assert.notEqual(resolved.id,original.id);
    assert.equal(resolved.activity_receipt_id,(await db.query('select id from workbook_scan_receipts where photo_revision=$1',[retake.photo])).rows[0].id);
    const event=(await db.query('select * from workbook_scan_progress_events where receipt_id=$1',[resolved.activity_receipt_id])).rows[0];
    assert(Date.parse(resolved.anchor_at)<+event.admitted_at);assert.equal(iso(resolved.anchor_at),(await projection(f)).candidate.anchorAt);
    assert.equal(await rpc(service,'change_scan_photo',[f.p,retake.photo,'save']),'saved');
    assert.equal((await propose(f)).episode.id,resolved.id);
  });
  await test('episodes', 'scored Extra practice qualifies; full Day7 allows earlier gaps; complete required sets end inactivity', async () => {
    const f=await dueBook();const initial=(await propose(f)).episode;await photo(f,6);
    const extra=(await propose(f)).episode;assert.notEqual(extra.id,initial.id);
    await photo(f,2);assert.equal((await db.query('select count(*)::int n from workbook_scan_trigger_claims where workbook_id=$1',[f.w])).rows[0].n,0);
    await photo(f,3);assert.equal((await db.query('select reason from workbook_scan_trigger_claims where workbook_id=$1',[f.w])).rows[0].reason,'day7_scanned');
    assert((await context(f)).identity,'earlier gaps remain unfinished');
    for(const n of [1,4,5])await photo(f,n);
    assert.equal((await context(f)).identity,null);assert.deepEqual((await due(f)).episode_ids,[]);
  });
  await test('episodes', 'newer confirmed book suppresses only old reminder and retains scans; completed latest never revives old', async () => {
    const old=await dueBook(), newer=await book({parent:old.p,child:old.c,number:2});
    assert((await context(old)).identity,'shipment alone is insufficient');
    await confirm(newer,await dateBefore(5));await propose(newer);
    assert.equal((await context(old)).identity,null);await photo(old,1);
    assert.equal((await db.query('select count(*)::int n from workbook_scan_receipts where workbook_id=$1',[old.w])).rows[0].n,1);
    assert.deepEqual((await due(newer)).episode_ids,[(await propose(newer)).episode.id]);
    for(const n of [1,2,3,4,5])await photo(newer,n);
    assert.equal((await context(newer)).identity,null);assert.deepEqual((await due(old)).episode_ids,[]);
  });
  await test('episodes', 'raw parent/postal/oldest-child changes force fresh canonical computation; fallback uses actual helper', async () => {
    const f=await dueBook();await photo(f);let previous=(await propose(f)).episode;
    const sibling=await book({parent:f.p});
    for(const change of [
      () => db.query("update parents set time_zone='invalid',postal='R3C 1A1' where id=$1",[f.p]),
      () => db.query("update parents set postal=null where id=$1",[f.p]),
      () => db.query("update children set province='ON' where id=$1",[f.c]),
      () => db.query("update children set created_at='2020-01-01Z',province='NL' where id=$1",[sibling.c]),
      () => db.query("update parents set time_zone='America/Toronto' where id=$1",[f.p]),
    ]){
      await change();assert.equal((await due(f)).status,'refresh-required');const current=(await propose(f)).episode;
      assert.equal(current.id,previous.id);assert.notDeepEqual(current.clock_context,previous.clock_context);previous=current;
    }
  });
  await test('calendar', 'canonical four-day boundaries cover gap/fold, overrides and fixed zones without SQL timezone arithmetic', async () => {
    const cases=[
      ['America/Toronto',true,'2026-03-04T07:37:00Z'],['America/Toronto',true,'2026-10-28T05:37:00Z'],
      ['America/Toronto',true,'2026-03-06T15:00:00Z'],['America/Toronto',true,'2026-10-30T14:00:00Z'],
      ['America/Vancouver',true,'2026-10-30T16:00:00Z'],['America/Edmonton',true,'2026-10-30T15:00:00Z'],
      ['America/Edmonton',false,'2026-10-30T15:00:00Z'],['America/Chicago',false,'2026-03-04T08:37:00Z'],
      ['America/St_Johns',true,'2026-10-28T05:07:00Z'],['America/Winnipeg',true,'2026-10-30T15:00:00Z'],
    ];
    for(const mode of ['delivery','scan'])for(const [zone,override,at]of cases){
      const f=await book({delivered:mode==='delivery'?at:'2026-01-01T12:00:00Z',zone,override});
      if(mode==='scan'){
        await db.query('update parents set time_zone=$2,postal=$3 where id=$1',[f.p,zone==='America/Chicago'?null:zone,zone==='America/Chicago'?'P0V1G0':null]);
        const x=await photo(f);await historicalReceiptTime(x,at.replace('00Z','00.123456Z'));
      }
      const saved=await propose(f),e=saved.episode;
      const {input,candidate}=await projection(f);assert.equal(iso(e.due_at),candidate.dueAt);
      for(const delta of [-1,0,1]){
        const at=Date.parse(e.due_at)+delta;
        const expected=scanInactivityCandidate({...input,now:at});
        const actual=await rpc(db,'_workbook_scan_reminder_due_set',[f.p,iso(at),null]);
        assert.equal(actual.episode_ids.includes(e.id),expected.due);assert.equal(expected.due,delta>=0);
      }
      console.log('CALENDAR',mode,zone,override,at,e.due_at,'before/at/after');
    }
  });
  await test('claim', 'two due siblings require one complete atomic set; foreign/partial/duplicate IDs cannot claim', async () => {
    const f=await dueBook(),s=await dueBook({parent:f.p}),other=await dueBook();const set=await due(f);
    assert.equal(set.episode_ids.length,2);
    assert.equal((await claim(f,[set.episode_ids[0]])).status,'set-changed');
    assert.equal((await claim(f,[...set.episode_ids,(await due(other)).episode_ids[0]])).status,'set-changed');
    await assert.rejects(()=>claim(f,[set.episode_ids[0],set.episode_ids[0]]),/invalid_scan_reminder_claim/);
    const m=await claim(f,set.episode_ids);assert.equal(m.status,'claimed');assert.equal(m.child_ids.length,2);
    assert.equal((await db.query('select count(*)::int n from workbook_scan_reminder_links where message_id=$1 and not released',[m.message_id])).rows[0].n,2);
    assert.equal((await db.query('select count(*)::int n from email_log where parent_id=$1 and kind=\'scan_inactivity\'',[f.p])).rows[0].n,1);
    assert.equal((await take(other)).status,'claimed');assert.equal((await admit(m)).status,'admitted');
    assert.equal((await finish(m,'sent')).status,'recorded');
    assert.deepEqual((await due(s)).episode_ids,[]);
  });
  await test('claim', 'uncomputed due sibling refuses the whole set instead of silently splitting it', async () => {
    const f=await dueBook(),s=await book({parent:f.p,delivered:await dateBefore(5)});
    assert.equal((await due(f)).status,'refresh-required');await propose(s);assert.equal((await due(f)).episode_ids.length,2);
  });
  await test('outcomes', 'explicit refusals retry at most three times with new tokens and preserve old attempt evidence', async () => {
    const f=await dueBook();let last=null;
    for(let i=1;i<=3;i++){
      const m=await take(f);assert.equal(m.status,'claimed');assert.equal(m.attempt,i);
      if(last){assert.equal(m.message_id,last.message_id);assert.notEqual(m.attempt_token,last.attempt_token);assert.equal((await finish(last,'sent')).status,'stale');assert.equal((await release(last)).status,'stale');}
      assert.equal((await admit(m)).status,'admitted');assert.equal((await finish(m,'refused')).status,'recorded');last=m;
    }
    assert.deepEqual((await due(f)).episode_ids,[]);
    assert.equal((await db.query('select count(*)::int n from workbook_scan_reminder_attempts where message_id=$1 and state=\'refused\'',[last.message_id])).rows[0].n,3);
  });
  await test('outcomes', 'unknown, lost claim, lost admission and lost outcome remain once with no automatic release', async () => {
    for(const loss of ['unknown','claim','admission','outcome']){
      const f=await dueBook(),m=await take(f);assert.equal(m.status,'claimed');
      if(loss!=='claim')assert.equal((await admit(m)).status,'admitted');
      if(loss==='unknown')assert.equal((await finish(m,'unknown')).status,'recorded');
      assert.deepEqual((await due(f)).episode_ids,[]);
      if(loss!=='claim')assert.equal((await release(m)).status,'stale');
      if(loss!=='claim')assert.equal((await admit(m)).status,'busy');
      assert.notEqual((await claim(f,m.episode_ids)).status,'claimed');
    }
  });
  await test('outcomes', 'pre-dispatch release keeps evidence and does not consume an unsent episode', async () => {
    const f=await dueBook(),m=await take(f);assert.equal((await release(m)).status,'released');
    assert.equal((await db.query('select state from workbook_scan_reminder_attempts where token=$1',[m.attempt_token])).rows[0].state,'released');
    assert.equal((await db.query('select count(*)::int n from workbook_scan_reminder_links where message_id=$1 and released',[m.message_id])).rows[0].n,1);
    const next=await take(f);assert.equal(next.status,'claimed');assert.notEqual(next.message_id,m.message_id);
    assert.equal((await admit(m)).status,'busy');assert.equal((await finish(m,'sent')).status,'stale');
  });
  await test('outcomes', 'release after two refusals preserves the cap and gives back only the unstarted third attempt', async () => {
    const f=await dueBook();let m;
    for(let i=0;i<2;i++){m=await take(f);await admit(m);await finish(m,'refused');}
    const unsent=await take(f);assert.equal(unsent.attempt,3);assert.equal((await release(unsent)).status,'released');
    const third=await take(f);assert.equal(third.attempt,3);assert.equal(third.message_id,m.message_id);assert.notEqual(third.attempt_token,unsent.attempt_token);
    assert.equal((await finish(unsent,'sent')).status,'stale');await admit(third);await finish(third,'refused');
    assert.deepEqual((await due(f)).episode_ids,[]);
    assert.equal((await db.query('select dispatch_count from workbook_scan_inactivity_episodes where id=$1',[m.episode_ids[0]])).rows[0].dispatch_count,3);
    assert.equal((await db.query('select count(*)::int n from workbook_scan_reminder_attempts where message_id=$1',[m.message_id])).rows[0].n,4);
  });
  await test('outcomes', 'refused aggregate cannot retry after a sibling changes or new due set joins', async () => {
    const f=await dueBook(),s=await dueBook({parent:f.p}),m=await take(f);await admit(m);await finish(m,'refused');
    await photo(s);await propose(s);assert.equal((await take(f)).status,'set-changed');
    assert.equal((await db.query('select attempt_count from workbook_scan_reminder_messages where id=$1',[m.message_id])).rows[0].attempt_count,1);
  });
  await test('dispatch', 'new scan, unsubscribe, changed context, program pause or sibling deletion prevents admission', async () => {
    for(const reason of ['scan','unsubscribe','zone','pause','child']){
      const f=await dueBook(),m=await take(f);
      if(reason==='scan')await photo(f);
      if(reason==='unsubscribe')await service.query("insert into email_log(parent_id,kind) values($1,'unsubscribe')",[f.p]);
      if(reason==='zone')await db.query("update parents set time_zone='America/Toronto' where id=$1",[f.p]);
      if(reason==='pause')await db.query("update child_plan_states set kind='paused' where child_id=$1",[f.c]);
      if(reason==='child')await db.query('insert into child_deletions(child_id,parent_id) values($1,$2)',[f.c,f.p]);
      const result=await admit(m);assert.equal(result.status,'not-due',reason);
      assert.equal((await db.query('select state from workbook_scan_reminder_messages where id=$1',[m.message_id])).rows[0].state,'released');
    }
  });
  await test('dispatch', 'same-episode zone/delivery refresh after sent remains consumed and admitted requests cannot be recalled', async () => {
    const f=await dueBook(),m=await take(f);await admit(m);await finish(m,'sent');const id=m.episode_ids[0];
    await db.query("update parents set time_zone='America/Toronto',postal='M5V 1A1' where id=$1",[f.p]);
    assert.equal((await propose(f)).episode.id,id);assert.deepEqual((await due(f)).episode_ids,[]);
    await correct(f,await dateBefore(6));assert.equal((await propose(f)).episode.id,id);assert.deepEqual((await due(f)).episode_ids,[]);
    const g=await dueBook(),n=await take(g);await admit(n);await photo(g);assert.equal((await finish(n,'sent')).status,'recorded');
    assert.equal((await release(n)).status,'stale');
  });
  await test('dispatch','unchanged accepted retake permits dispatch; later qualifying work starts the next four-day episode',async()=>{
    const f=await book({delivered:await dateBefore(6)}),first=await photo(f),base=await pendingMark(first);await applyMark(first,base);await terminal(first);
    await historicalReceiptTime(first,await dateBefore(5));const old=(await propose(f)).episode,m=await take(f);
    const unchanged=await photo(f);await pendingMark(unchanged);await applyMark(unchanged,base);await terminal(unchanged);
    assert.equal((await context(f)).identity.activity_receipt_id,old.activity_receipt_id);assert.equal((await admit(m)).status,'admitted');await finish(m,'sent');
    await photo(f,4);const next=(await propose(f)).episode;assert.notEqual(next.id,old.id);assert.deepEqual((await due(f)).episode_ids,[]);
    const {input}=await projection(f);const expected=scanInactivityCandidate({...input,now:Date.parse(next.due_at)});
    assert.equal(expected.due,true);assert.deepEqual((await rpc(db,'_workbook_scan_reminder_due_set',[f.p,next.due_at,null])).episode_ids,[next.id]);
  });
  await test('policy', 'known stored eligibility fails closed; progress facts ignore program state and unsubscribe', async () => {
    const f=await dueBook();
    for(const kind of ['not_started','payment_failed','paused','ended']){
      await db.query('update child_plan_states set kind=$2 where child_id=$1',[f.c,kind]);assert.deepEqual((await due(f)).episode_ids,[]);
    }
    await db.query('delete from child_plan_states where child_id=$1',[f.c]);assert.deepEqual((await due(f)).episode_ids,[]);
    await db.query("insert into child_plan_states(child_id,parent_id,kind,read_at,next_charge_at) values($1,$2,'free_month',clock_timestamp(),clock_timestamp()+interval '20 days')",[f.c,f.p]);
    assert.equal((await due(f)).episode_ids.length,1);
    await service.query("insert into email_log(parent_id,kind) values($1,'unsubscribe')",[f.p]);
    await photo(f,2);await photo(f,3);
    assert.equal((await due(f)).status,'unsubscribed');
    assert.equal((await db.query('select reason from workbook_scan_trigger_claims where workbook_id=$1',[f.w])).rows[0].reason,'day7_scanned');
    const g=await book({delivered:await dateBefore(25)});await service.query("insert into email_log(parent_id,kind) values($1,'unsubscribe')",[g.p]);
    await db.query("update child_plan_states set kind='paused' where child_id=$1",[g.c]);assert.equal((await materialize(g)).status,'hold');
    assert.equal((await db.query('select count(*)::int n from workbook_scan_trigger_claims where workbook_id=$1',[g.w])).rows[0].n,0);
  });
  await test('policy','cancelled, pending and unretired pause states block email; known paid Restart state restores only reminder eligibility',async()=>{
    const f=await dueBook();await db.query('insert into child_plan_controls(child_id,parent_id,cancelled) values($1,$2,true)',[f.c,f.p]);
    assert.deepEqual((await due(f)).episode_ids,[]);await db.query('update child_plan_controls set cancelled=false where child_id=$1',[f.c]);
    const op=(await db.query("insert into plan_control_operations(parent_id,child_id,kind,state) values($1,$2,'pause','open') returning id",[f.p,f.c])).rows[0].id;
    assert.deepEqual((await due(f)).episode_ids,[]);await db.query("update plan_control_operations set state='applied' where id=$1",[op]);assert.deepEqual((await due(f)).episode_ids,[]);
    // These are the stored fields the unchanged record_paid_restart hook sets. No provider/start action is run.
    await db.query('update plan_control_operations set mailing_retired_at=clock_timestamp() where id=$1',[op]);assert.equal((await due(f)).episode_ids.length,1);
    const card=(await db.query("insert into card_setups(parent_id,child_id,stripe_customer_id,card_saved_at) values($1,$2,'synthetic',clock_timestamp()) returning id",[f.p,f.c])).rows[0].id;
    await db.query("insert into plan_starts(card_setup_id,state) values($1,'open')",[card]);assert.deepEqual((await due(f)).episode_ids,[]);
    await db.query("update plan_starts set state='started' where card_setup_id=$1",[card]);assert.equal((await due(f)).episode_ids.length,1);
  });
  await test('schema','all old email kinds retain valid bodies and grants; new kind cannot bypass child/status/summary constraints',async()=>{
    for(const kind of ['continue','come_back','start','start_followup','unsubscribe','maya_daily','maya_weekly','maya_unsubscribe','monthly_summary','monthly_summary_unsubscribe']){
      const f=await book(),off=kind.endsWith('unsubscribe'),child=['continue','come_back','start','start_followup'].includes(kind),assessment=['continue','come_back'].includes(kind)?randomUUID():null;
      if(assessment)await db.query('insert into assessments(id,child_id,parent_id) values($1,$2,$3)',[assessment,f.c,f.p]);
      await service.query(`insert into email_log(parent_id,child_id,assessment_id,kind,status,attempts,unsubscribe_hash,day,week_start,summary_month,copy_child_ids)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[f.p,child?f.c:null,assessment,kind,off?null:'claimed',off?0:1,off?null:hash(),kind==='maya_daily'?'2026-11-01':null,kind==='maya_weekly'?'2026-11-02':null,kind==='monthly_summary'?'2026-11-01':null,off?null:[f.c]]);
    }
    const f=await dueBook(),m=await take(f);
    for(const expression of ["summary_month='2026-11-01'","child_id='"+f.c+"'",'status=null','unsubscribe_hash=null'])
      await assert.rejects(()=>db.query('update email_log set '+expression+' where id=$1',[m.email_log_id]),e=>['23514','55000'].includes(e.code));
    assert.equal((await db.query("select has_table_privilege('service_role','email_log','INSERT,UPDATE,DELETE') allowed")).rows[0].allowed,true);
  });

  await test('concurrency', 'two schedulers cannot split two siblings under a real parent-lock barrier', async () => {
    const f=await dueBook();await dueBook({parent:f.p});const set=(await due(f)).episode_ids;
    const a=await open('service_role'),b=await open('service_role');let pending;
    try{
      await a.query('begin');const m=await claim(f,set,a);assert.equal(m.status,'claimed');
      pending=outcome(claim(f,set,b));await blocked(b,a);console.log('BARRIER schedulers parent serialization');
      await a.query('commit');const second=await pending;assert.ifError(second.error);assert.notEqual(second.value.status,'claimed');
      assert.equal((await db.query('select count(*)::int n from workbook_scan_reminder_messages where parent_id=$1',[f.p])).rows[0].n,1);
      assert.equal((await db.query('select count(*)::int n from workbook_scan_reminder_links where parent_id=$1 and not released',[f.p])).rows[0].n,2);
    }finally{await a.query('rollback');if(pending)await pending;await close(a);await close(b);}
  });
  for(const phase of ['claim','dispatch'])for(const competing of ['scan','unsubscribe','freeze','zone','pause','correction'])for(const otherFirst of [true,false]){
    await test('concurrency',`${competing} versus ${phase}, ${otherFirst?'competing write':'reminder'} first`,async()=>{
      const f=await dueBook(),set=(await due(f)).episode_ids,m=phase==='dispatch'?await take(f):null;
      const x=competing==='scan'?await photo(f,1,service,{ready:false}):null;
      const a=await open(otherFirst?null:'service_role'),b=await open(otherFirst?'service_role':null);let pending;
      if(competing==='correction')for(const c of [a,b])await c.query("select set_config('test.viewer',$1,false)",[adminId]);
      const correctedAt=competing==='correction'?await dateBefore(1):null;
      const writer=c=>competing==='scan'?rpc(c,'finish_scan_calibration',[f.p,x.photo,x.cal,'ready',x.result,100])
        :competing==='unsubscribe'?c.query("insert into email_log(parent_id,kind) values($1,'unsubscribe')",[f.p])
        :competing==='freeze'?c.query('update parents set deletion_requested_at=clock_timestamp() where id=$1',[f.p])
        :competing==='zone'?c.query("update parents set time_zone='America/Toronto' where id=$1",[f.p])
        :competing==='correction'?correct(f,correctedAt,c)
        :c.query("update child_plan_states set kind='paused' where child_id=$1",[f.c]);
      const reminder=c=>phase==='dispatch'?admit(m,c):claim(f,set,c);
      try{
        await a.query('begin');const first=await(otherFirst?writer(a):reminder(a));
        if(!otherFirst)assert.equal(first.status,phase==='dispatch'?'admitted':'claimed');
        pending=outcome(otherFirst?reminder(b):writer(b));await blocked(b,a);
        console.log('BARRIER',phase,competing,otherFirst?'write-first':'reminder-first');
        await a.query('commit');const result=await pending;
        if(otherFirst&&competing==='freeze')assert.equal(result.error?.code,'55000');
        else{assert.ifError(result.error);if(otherFirst)assert.notEqual(result.value.status,phase==='dispatch'?'admitted':'claimed');}
        if(!otherFirst&&phase==='dispatch'){
          assert.equal((await db.query('select state from workbook_scan_reminder_messages where id=$1',[m.message_id])).rows[0].state,'admitted');
          if(competing!=='freeze')assert.equal((await finish(m,'sent')).status,'recorded');
        }
      }finally{await a.query('rollback');if(pending)await pending;await close(a);await close(b);}
    });
  }
  for(const phase of ['claim','dispatch'])for(const resolutionFirst of [true,false]){
    await test('concurrency',`pending-resolution publication versus ${phase}, ${resolutionFirst?'resolution':'reminder'} first`,async()=>{
      const f=await book({delivered:await dateBefore(6)}),first=await photo(f),base=await pendingMark(first);
      await applyMark(first,base);await terminal(first);await historicalReceiptTime(first,await dateBefore(5));await propose(f);
      const retake=await photo(f);await pendingMark(retake);
      await marking('extract',retake,{observations:[{...base,evidence:{photoRevision:retake.photo},state:'scored',result:'right',certainty:'certain',readAnswerText:'42'}],model:'synthetic',prompt:'synthetic'});
      const ids=(await due(f)).episode_ids,m=phase==='dispatch'?await take(f):null;
      const a=await open('service_role'),b=await open('service_role');let pending;
      const publish=c=>marking('apply',retake,{events:[],at:iso(Date.now())},c);
      const reminder=c=>phase==='dispatch'?admit(m,c):claim(f,ids,c);
      try{
        await a.query('begin');const initial=await(resolutionFirst?publish(a):reminder(a));
        if(!resolutionFirst)assert.equal(initial.status,phase==='dispatch'?'admitted':'claimed');
        pending=outcome(resolutionFirst?reminder(b):publish(b));await blocked(b,a);await a.query('commit');const result=await pending;assert.ifError(result.error);
        if(resolutionFirst)assert.notEqual(result.value.status,phase==='dispatch'?'admitted':'claimed');
        else if(phase==='claim')assert.equal((await admit(initial)).status,'not-due');
        else assert.equal((await finish(m,'sent')).status,'recorded');
        assert.equal((await db.query('select count(*)::int n from workbook_scan_progress_events where workbook_id=$1',[f.w])).rows[0].n,1);
      }finally{await a.query('rollback');if(pending)await pending;await close(a);await close(b);}
    });
  }
  await test('concurrency','delivery already owns book UPDATE before its hook; reminder waits at parent without owning book gate',async()=>{
    const f=await dueBook(),set=(await due(f)).episode_ids,newer=await book({parent:f.p,child:f.c,number:2});
    const a=await open('authenticated'),b=await open('service_role');let delivery,reminder;
    await a.query("select set_config('test.viewer',$1,false)",[adminId]);
    try{
      await db.query('select pg_advisory_lock(475,41)');await a.query("begin;set local test.delivery_barrier='on'");
      delivery=outcome(confirm(newer,await dateBefore(1),'UTC',false,a));await blocked(a,db);
      reminder=outcome(claim(f,set,b));await blocked(b,a);
      assert.equal((await db.query("select pg_try_advisory_xact_lock(hashtextextended('workbook-scan:'||$1,0)) free",[f.w])).rows[0].free,true);
      await db.query('select pg_advisory_unlock(475,41)');assert.ifError((await delivery).error);await a.query('commit');
      const result=await reminder;assert.ifError(result.error);assert.notEqual(result.value.status,'claimed');
    }finally{await db.query('select pg_advisory_unlock(475,41)');if(delivery)await delivery;await a.query('rollback');if(reminder)await reminder;await close(a);await close(b);}
  });
  await test('concurrency','reminder first holds parent; later new-book delivery completes and cancels old dispatch',async()=>{
    const f=await dueBook(),set=(await due(f)).episode_ids,newer=await book({parent:f.p,child:f.c,number:2});
    const a=await open('service_role'),b=await open('authenticated');let pending;
    await b.query("select set_config('test.viewer',$1,false)",[adminId]);
    try{
      await a.query('begin');const m=await claim(f,set,a);assert.equal(m.status,'claimed');
      pending=outcome(confirm(newer,await dateBefore(1),'UTC',false,b));await blocked(b,a);await a.query('commit');
      const result=await pending;assert.ifError(result.error);assert.equal(result.value.status,'confirmed');
      await propose(newer);assert.equal((await admit(m)).status,'not-due');
    }finally{await a.query('rollback');if(pending)await pending;await close(a);await close(b);}
  });
  await test('concurrency','unsubscribe in progress owns family SHARE; final dispatch waits until marker is committed',async()=>{
    const f=await dueBook(),m=await take(f),a=await open('service_role'),b=await open('service_role');let insert,dispatch;
    try{
      await db.query('select pg_advisory_lock(475,42)');await a.query("begin;set local test.unsubscribe_barrier='on'");
      insert=outcome(a.query("insert into email_log(parent_id,kind) values($1,'unsubscribe')",[f.p]));await blocked(a,db);
      dispatch=outcome(admit(m,b));await blocked(b,a);
      await db.query('select pg_advisory_unlock(475,42)');assert.ifError((await insert).error);await a.query('commit');
      const result=await dispatch;assert.ifError(result.error);assert.equal(result.value.status,'not-due');
    }finally{await db.query('select pg_advisory_unlock(475,42)');if(insert)await insert;await a.query('rollback');if(dispatch)await dispatch;await close(a);await close(b);}
  });
  await test('concurrency','fresh database clock after a wait crosses canonical four-day and 21-day boundaries',async()=>{
    const target=Math.ceil((await now()+2500)/60000)*60000;
    const targetDay=localDay(target,'UTC');
    const {addDays,partsInZone}=bundle("export { addDays,partsInZone } from './src/lib/family-time'");
    const clock=partsInZone(target,'UTC',{hour:'numeric',minute:'numeric',hourCycle:'h23'});
    const delivery4=iso(localDateTime(addDays(targetDay,-4),'UTC',+clock.hour,+clock.minute));
    const delivery21=iso(localDateTime(addDays(targetDay,-21),'UTC',+clock.hour,+clock.minute));
    const f=await book({delivered:delivery4}),g=await book({delivered:delivery21});const e=(await propose(f)).episode;
    assert.equal(Date.parse(e.due_at),target);assert.equal((await materialize(g)).status,'waiting');
    assert(!(await rpc(service,'list_workbook_scan_recovery_books',['due',100,null])).some(x=>x.workbook_id===g.w));
    const a=await open(),b=await open('service_role');let pending;
    await b.query("set statement_timeout='75s'");
    try{
      await a.query('begin');assert.equal(await rpc(a,'_lock_workbook_scan_reminder_parent',[f.p]),true);
      pending=outcome(claim(f,[e.id],b));await blocked(b,a);
      console.log('BOUNDARY_WAIT_MS',target-await now());
      while(await now()<target)await new Promise(resolve=>setTimeout(resolve,Math.min(250,target-Date.now()+1)));
      const dueBooks=await rpc(service,'list_workbook_scan_recovery_books',['due',100,null]);assert(dueBooks.some(x=>x.workbook_id===g.w));
      await a.query('commit');const result=await pending;assert.ifError(result.error);assert.equal(result.value.status,'claimed');
      assert.equal((await rpc(service,'reconcile_workbook_scan_progress',[[g.w]]))[0].result.status,'hold');
      assert(!(await rpc(service,'list_workbook_scan_recovery_books',['due',100,null])).some(x=>x.workbook_id===g.w));
    }finally{await a.query('rollback');if(pending)await pending;await close(a);await close(b);}
  });
  await test('email','sendEmailOnce uses SQL ledger, post-pacing admission, existing token hiding and copy/provider links',async()=>{
    for(const state of ['sent','refused','unknown']){
      const f=await dueBook(),ids=(await due(f)).episode_ids;let handle,dispatched=0,pendingResult;
      const message={sender:{to:'parent'},to:'qa@example.invalid',subject:'Synthetic reminder',text:'https://example.invalid/unsubscribe?t=secret-test-token',html:'<p>Synthetic</p>'};
      const ledger={
        async claim(key,fields){const m=await claim(f,key,service,fields.unsubscribe_hash);if(m.status!=='claimed')return null;handle=m;return m;},
        async sent(m,id){pendingResult={state:'sent',id};},
        async refused(){pendingResult={state:'refused',id:null};},
        async unknown(){pendingResult={state:'unknown',id:null};},
        async keepCopy(m,key,copy){
          const row=copyRow({emailLogId:m.email_log_id},f.p,copy);assert(!row.text_body.includes('secret-test-token'));assert(row.text_body.includes('t=hidden'));
          const current=(await service.query('select * from workbook_scan_reminder_messages where id=$1',[m.message_id])).rows[0];
          if(current?.attempt_token!==m.attempt_token||current.state!=='admitted')return;
          const columns=Object.keys(row);await service.query(`insert into email_copies(${columns.join(',')}) values(${columns.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(row));
          assert.equal((await finish(m,pendingResult.state,service,pendingResult.id)).status,'recorded');
        }
      };
      const transport={async send(){assert.equal((await admit(handle)).status,'admitted');dispatched++;return state==='sent'?{status:state,emailId:'synthetic-475-'+randomUUID()}:{status:state,error:'Synthetic transport result'};}};
      const result=await sendEmailOnce(ledger,ids,message,{transport:pacedTransport(transport,1),claimFields:{unsubscribe_hash:hash()}});
      assert.equal(result.status,state);assert.equal(dispatched,1);
      const copy=(await db.query('select * from email_copies where email_log_id=$1',[handle.email_log_id])).rows[0];
      assert.equal(copy.outcome,state);if(state==='sent')assert.equal(copy.email_id,result.emailId);
      if(state!=='refused')assert.equal((await sendEmailOnce(ledger,ids,message,{transport,claimFields:{unsubscribe_hash:hash()}})).status,'busy');
    }
  });
  await test('email','transport pacing ends before the separate DB admission; intervening scan prevents a request',async()=>{
    const f=await dueBook(),m=await take(f);let enter,go,requests=0;
    const entered=new Promise(resolve=>{enter=resolve;}),wait=new Promise(resolve=>{go=resolve;});
    const transport={async send(){enter();await wait;const admission=await admit(m);if(admission.status!=='admitted')return{status:'refused',error:'not dispatched'};requests++;return{status:'sent',emailId:'synthetic'};}};
    const sending=transport.send();await entered;await photo(f);go();assert.equal((await sending).status,'refused');assert.equal(requests,0);
    assert.equal((await db.query('select state from workbook_scan_reminder_messages where id=$1',[m.message_id])).rows[0].state,'released');
  });
  await test('deletion','child/family cascade removes owned rows/copies; child deletion retains parent tokens and sibling once-state',async()=>{
    for(const family of [false,true])for(const released of [false,true]){
      const f=await dueBook(),s=await dueBook({parent:f.p}),m=await take(f);
      if(released)await release(m);else{await admit(m);await finish(m,'unknown');}
      await service.query("insert into email_copies(parent_id,email_log_id,outcome,to_address,subject,text_body) values($1,$2,'unknown','qa@example.invalid','Synthetic','Synthetic')",[f.p,m.email_log_id]);
      if(family)await db.query('delete from auth.users where id=$1',[f.p]);
      else{await db.query('insert into child_deletions(child_id,parent_id) values($1,$2)',[f.c,f.p]);await db.query('delete from children where id=$1',[f.c]);}
      for(const table of ['workbook_scan_reminder_messages','workbook_scan_reminder_links','workbook_scan_reminder_attempts','email_copies'])
        assert.equal((await db.query(`select count(*)::int n from ${table} where parent_id=$1`,[f.p])).rows[0].n,0,table);
      assert.equal((await db.query('select count(*)::int n from workbook_scan_inactivity_episodes where child_id=$1',[f.c])).rows[0].n,0);
      if(family)assert.equal((await db.query('select count(*)::int n from email_log where parent_id=$1',[f.p])).rows[0].n,0);
      else{
        assert.equal((await db.query('select count(*)::int n from children where id=$1',[s.c])).rows[0].n,1);
        const log=(await db.query('select * from email_log where id=$1',[m.email_log_id])).rows[0];assert(log.unsubscribe_hash);assert.equal(log.copy_redacted,true);
        await propose(s);assert.equal((await due(s)).episode_ids.length,released?1:0);
      }
    }
  });
  await test('deletion','deleting one child after two aggregate refusals cannot reset the remaining episode dispatch cap',async()=>{
    const f=await dueBook(),s=await dueBook({parent:f.p});
    for(let i=0;i<2;i++){const m=await take(f);await admit(m);await finish(m,'refused');}
    await db.query('insert into child_deletions(child_id,parent_id) values($1,$2)',[f.c,f.p]);await db.query('delete from children where id=$1',[f.c]);
    await propose(s);const last=await take(s);assert.equal(last.status,'claimed');await admit(last);await finish(last,'refused');
    assert.deepEqual((await due(s)).episode_ids,[]);
    assert.equal((await db.query('select dispatch_count from workbook_scan_inactivity_episodes where child_id=$1',[s.c])).rows[0].dispatch_count,3);
  });
  await test('access','raw tables deny all external writes; anon/own/foreign/admin roles cannot invoke service RPCs',async()=>{
    const f=await dueBook(),m=await take(f),tables=['workbook_scan_inactivity_episodes','workbook_scan_reminder_messages','workbook_scan_reminder_links','workbook_scan_reminder_attempts'];
    const external=['list_workbook_scan_recovery_books','read_workbook_scan_inactivity_context','propose_workbook_scan_inactivity','read_workbook_scan_reminder_due','claim_workbook_scan_reminder','release_workbook_scan_reminder','admit_workbook_scan_reminder','finish_workbook_scan_reminder'];
    const privateNames=['guard_workbook_scan_reminder_email','delete_child_workbook_scan_reminders','_workbook_scan_family_clock_context','_workbook_scan_inactivity_identity','_lock_workbook_scan_reminder_parent','_workbook_scan_reminder_program','_workbook_scan_reminder_due_set'];
    for(const[role,viewer,isAdmin]of [['anon',null,false],['authenticated',f.p,false],['authenticated',randomUUID(),false],['authenticated',adminId,true],['service_role',null,false]]){
      const c=await open(role);try{
        if(viewer)await c.query("select set_config('test.viewer',$1,false)",[viewer]);
        for(const table of tables){
          if(role==='anon')await assert.rejects(()=>c.query('select * from '+table),e=>e.code==='42501');
          else{const rows=(await c.query(`select * from ${table} where parent_id=$1`,[f.p])).rows;assert.equal(rows.length,isAdmin||role==='service_role'?1:0);}
          for(const verb of ['INSERT','UPDATE','DELETE','TRUNCATE'])assert.equal((await db.query('select has_table_privilege($1,$2,$3) allowed',[role,table,verb])).rows[0].allowed,false);
          await assert.rejects(()=>c.query('insert into '+table+' default values'),e=>e.code==='42501');
        }
        const funcs=(await db.query('select oid::regprocedure::text name,proname from pg_proc where pronamespace=\'public\'::regnamespace and proname=any($1)',[[...external,...privateNames]])).rows;
        assert.equal(funcs.length,15);
        for(const fn of funcs)assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,fn.name])).rows[0].allowed,role==='service_role'&&external.includes(fn.proname));
        if(role!=='service_role')await assert.rejects(()=>rpc(c,'read_workbook_scan_reminder_due',[f.p]),e=>e.code==='42501');
        await assert.rejects(()=>rpc(c,'_workbook_scan_reminder_due_set',[f.p,'2099-01-01Z',null]),e=>e.code==='42501');
      }finally{await close(c);}
    }
    await assert.rejects(()=>service.query("update email_log set status='failed' where id=$1",[m.email_log_id]),e=>e.code==='42501');
    await assert.rejects(()=>service.query('delete from email_log where id=$1',[m.email_log_id]),e=>e.code==='42501');
    await assert.rejects(()=>service.query("insert into email_log(parent_id,kind,status,attempts,unsubscribe_hash,copy_child_ids) values($1,'scan_inactivity','claimed',1,$2,$3)",[f.p,hash(),[f.c]]),e=>e.code==='42501');
  });
  console.log('WORKBOOK_SCAN_REMINDER_EPISODES_OK', passed);
  for (const [group, count] of [...distribution].sort()) console.log('DISTRIBUTION', group, count);
  console.log('PROOF local production scan/delivery/marking/reminder RPCs and concurrent PostgreSQL sessions; reduced Auth/Storage/plan dependency fixture.');
  console.log('PROOF canonical calendar expectations use the actual public shared helpers; SQL stores identities and compares the database clock.');
  console.log('PROOF email protocol uses sendEmailOnce and a synthetic transport; no provider, hosted RLS, deployed adapter, cron or release proof.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  await Promise.allSettled([...clients].map(c => c.end()));
  try { cleanup(); } catch (e) { console.error('CLEANUP FAILED', e); process.exitCode = 1; }
});
