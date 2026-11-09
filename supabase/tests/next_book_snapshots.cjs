// #476 next-book snapshots on a local throwaway PostgreSQL cluster. Setup copied from workbook_scan_receipts.cjs.
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
    application_name: 'next-book-snapshots-476', connectionTimeoutMillis: 5000 });
  clients.add(c); await c.connect(); await c.query("set statement_timeout='12s'; set deadlock_timeout='100ms'");
  if (role) await c.query('set role ' + role);
  return c;
}
async function close(c) { await c.end(); clients.delete(c); }
const rpc = async (c, name, args) => (await c.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`, args)).rows[0].value;
const outcome = p => p.then(value => ({ value }), error => ({ error }));
const revision = '0123456789abcdef0123456789ab';
// Bundle only the real exported clock functions. Do not copy their algorithms into this fixture.
const { buildSync } = require('esbuild'); const { Module } = require('node:module');
const output = buildSync({ stdin: { contents: 'export { deliveryDeadlines } from "./src/lib/workbook-delivery"; export { localDateTime } from "./src/lib/family-time";', resolveDir: root },
  bundle: true, platform: 'node', format: 'cjs', write: false, tsconfig: path.join(root, 'tsconfig.json') }).outputFiles[0].text;
const loaded = new Module(path.join(root, 'unica475-family-time.cjs'));
loaded.paths = module.paths;
loaded._compile(output, path.join(root, 'unica475-family-time.cjs'));
const { deliveryDeadlines, localDateTime } = loaded.exports;
const clockVersion = 'family-time/deliveryDeadlines:542e4a5b;node=' + process.version + ';tz=' + process.versions.tz;
(async () => {
  console.log('FALSIFIER: two chains or two runs for one delivered book, a second freeze or plan, consumed outside the ledger, a refresh after approval.');
  for (const name of ['psql', 'initdb', 'pg_ctl', 'pg_config']) console.log(command(name, ['--version']).trim());
  directory = mkdtempSync('/tmp/unica476-pg-');
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
  await db.query(sql('20261106213840_workbook_scan_receipts.sql'));
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
  const clockRequest = f => db.query('select * from workbook_scan_clock_requests where workbook_id=$1 order by delivery_audit_id desc limit 1', [f.w]).then(x => x.rows[0]);
  const calendarArgs = request => [request.workbook_id, request.delivery_audit_id, request.delivered_at.toISOString(), request.time_zone, request.zone_override,
    deliveryDeadlines({ deliveredAt: request.delivered_at.toISOString(), timeZone: request.zone_override ? request.time_zone : { zone: request.time_zone, override: false } }).backstopAt, clockVersion];
  const materialize = async (f, c = service, request = null) => rpc(c, 'record_workbook_scan_delivery_calendar', calendarArgs(request ?? await clockRequest(f)));
  async function confirm(f, at = '2026-11-01T12:00:00Z', c = admin, zone = 'UTC', override = false, local = asLocal(at), calendar = c === admin) {
    const result = await rpc(c, 'confirm_workbook_delivery', [f.w, f.c, f.number, at, local, zone, override]);
    if (calendar && result.status === 'confirmed') await materialize(f);
    return result;
  }
  // ---- #476 next-book snapshots: reduced dependency schema for the run tables, then the real migration. ----
  await db.query(`alter table workbook_audit add column if not exists run_id uuid, add column if not exists draft_id uuid, add column if not exists at timestamptz default now();
    create table public.workbook_drafts(id uuid primary key,parent_id uuid not null references parents(id) on delete cascade,child_id uuid not null,number int not null,
      foreign key(child_id,parent_id) references children(id,parent_id) on delete cascade);
    create table public.workbook_runs(id uuid primary key default gen_random_uuid(),created_at timestamptz not null default now(),parent_id uuid not null references parents(id) on delete cascade,
      child_id uuid not null,number int not null,status text not null default 'queued',step text,attempts smallint not null default 0,max_attempts smallint not null,
      lease uuid,heartbeat_at timestamptz,started_at timestamptz,finished_at timestamptz,error text,resumes int not null default 0,
      draft_id uuid references workbook_drafts(id) on delete set null,started_by uuid,started_by_email text,
      foreign key(child_id,parent_id) references children(id,parent_id) on delete cascade);
    create unique index workbook_runs_one_active on public.workbook_runs(child_id) where status in ('queued','running');
    alter table workbook_runs enable row level security; alter table workbook_drafts enable row level security;
    grant select on workbook_runs, workbook_drafts to service_role;
    create trigger fence_family_write before insert or update on public.workbook_runs for each row execute function public.fence_family_write();`);
  await db.query(functionSql(sql('20261106120000_workbook_start_resume_lock.sql'), 'start_workbook_run'));
  // Fixture only: a test session can make start_workbook_run's run carry another number, as a workbook written without a
  // draft lock between the later-book check and the run would.
  await db.query(`create function public.fixture_force_run_number() returns trigger language plpgsql as $$
    begin if nullif(current_setting('test.force_run_number', true), '') is not null then new.number := current_setting('test.force_run_number')::int; end if;
    return new; end $$;
    create trigger fixture_force_run_number before insert on public.workbook_runs for each row execute function public.fixture_force_run_number();`);
  await db.query(sql('20261109050245_next_book_snapshots.sql'));
  const snaps = f => db.query('select * from next_book_snapshots where workbook_id=$1 order by revision,created_at', [f.w]).then(x => x.rows);
  async function delivered(number = 1) {
    const f = await book({ number, delivered: '2026-11-01T12:00:00Z' });
    return f;
  }
  async function claim(f, reason = 'day7_scanned', claimedAt = null) {
    const audit = (await db.query('select audit_id from workbook_delivery_receipts where workbook_id=$1', [f.w])).rows[0].audit_id;
    const r = await db.query(`insert into workbook_scan_trigger_claims(workbook_id,parent_id,child_id,number,printed_revision,reason,effective_at,
      delivery_audit_id,delivered_at,time_zone,zone_override,backstop_at,receipt_ids,claimed_at) values($1,$2,$3,$4,$5,$6,now(),$7,'2026-11-01T12:00:00Z','UTC',false,
      case when $6='delivery_backstop' then now() end,$8,coalesce($9::timestamptz,clock_timestamp())) returning id`, [f.w, f.p, f.c, f.number, revision, reason, audit, [randomUUID()], claimedAt]);
    return r.rows[0].id;
  }
  const hex = c => c.repeat(64);
  const frozenData = (f, s, extra = {}) => ({ frozenAt: Date.now() + 500, scope: { kind: 'day7', cutoff: Date.now() + 500 }, sources: { parentId: f.p, childId: f.c },
    historyFence: { parentId: f.p, childId: f.c }, snapshot: { parentId: f.p, childId: f.c }, history: { originals: [] },
    ledger: [{ key: 'k1', version: 2, day: 1, pageId: 'p1' }, { key: 'k2', version: 1, day: 7, pageId: 'p2' }], pending: [], held: [{ key: 'k8', version: 1, day: 8, pageId: 'p8', reason: 'outside-days' }], ...extra });
  async function frozenPlanned(f, c = service) {
    const t = await claim(f);
    const s = (await rpc(c, 'claim_next_book_snapshot', [t, null, null, null])).snapshot;
    assert.equal((await rpc(c, 'save_next_book_snapshot', [s.id, frozenData(f, s), hex('a')])).status, 'ok');
    assert.equal((await rpc(c, 'save_next_book_plan', [s.id, { workbook: 2 }, hex('b'), JSON.stringify([{ key: 'k1', version: 2 }]), JSON.stringify([{ key: 'k8', reason: 'outside-days' }])])).status, 'ok');
    return { t, s };
  }

  await test('one chain: concurrent Day 7 claim, repeat claim and admin action return one revision 1', async () => {
    const f = await delivered(), t = await claim(f);
    const [a, b] = [await open('service_role'), await open('service_role')];
    try {
      const answers = await Promise.all([rpc(a, 'claim_next_book_snapshot', [t, null, null, null]), rpc(b, 'claim_next_book_snapshot', [null, f.w, adminId, 'admin@example.invalid']),
        rpc(service, 'claim_next_book_snapshot', [t, null, null, null])]);
      assert.deepEqual(answers.map(x => x.status), ['ok', 'ok', 'ok']);
      assert.equal(new Set(answers.map(x => x.snapshot.id)).size, 1);
      const rows = await snaps(f);
      assert.equal(rows.length, 1); assert.equal(rows[0].trigger_reason, 'day7_scanned'); assert.equal(rows[0].revision, 1);
    } finally { await close(a); await close(b); }
    const g = await delivered();
    assert.deepEqual(await rpc(service, 'claim_next_book_snapshot', [null, g.w, randomUUID(), 'x@example.invalid']), { status: 'refused', reason: 'admin-required' });
    assert.deepEqual(await rpc(service, 'claim_next_book_snapshot', [null, g.w, adminId, null]), { status: 'refused', reason: 'no-accepted-scans' });
    const two = await delivered(2), t2 = await claim(two);
    assert.deepEqual(await rpc(service, 'claim_next_book_snapshot', [t2, null, null, null]), { status: 'refused', reason: 'unsupported-source-book' });
    assert.equal((await snaps(two)).length, 0);
  });

  await test('#628 hold: recorded once, refused when a claim exists, and a later claim starts the live chain', async () => {
    const f = await delivered();
    const audit = (await db.query('select audit_id from workbook_delivery_receipts where workbook_id=$1', [f.w])).rows[0].audit_id;
    assert.deepEqual(await rpc(service, 'hold_next_book_snapshot', [f.w, audit]), { status: 'refused', reason: 'hold-not-found' });
    await db.query(`insert into workbook_scan_backstop_holds(workbook_id,parent_id,child_id,printed_revision,delivery_audit_id,delivered_at,backstop_at)
      values($1,$2,$3,$4,$5,'2026-11-01T12:00:00Z','2026-11-22T12:00:00Z')`, [f.w, f.p, f.c, revision, audit]);
    const held = await rpc(service, 'hold_next_book_snapshot', [f.w, audit]);
    assert.equal(held.status, 'held'); assert.equal(held.snapshot.held_reason, 'no-accepted-scans-at-backstop');
    assert.equal((await rpc(service, 'hold_next_book_snapshot', [f.w, audit])).snapshot.id, held.snapshot.id);
    const t = await claim(f, 'delivery_backstop');
    assert.deepEqual(await rpc(service, 'hold_next_book_snapshot', [f.w, audit]), { status: 'refused', reason: 'claimed' });
    const live = await rpc(service, 'claim_next_book_snapshot', [t, null, null, null]);
    assert.equal(live.status, 'ok'); assert.equal(live.snapshot.held_reason, null);
    assert.equal((await snaps(f)).length, 2);
    assert.equal((await rpc(service, 'admit_next_book_run', [held.snapshot.id, null, null, 2, 360])).reason, 'held');
  });

  await test('freeze once, plan once, consumed only inside the ledger, malformed input refused without an error', async () => {
    const f = await delivered(), t = await claim(f);
    const s = (await rpc(service, 'claim_next_book_snapshot', [t, null, null, null])).snapshot;
    assert.deepEqual(await rpc(service, 'save_next_book_plan', [s.id, {}, hex('b'), JSON.stringify([]), JSON.stringify([])]), { status: 'refused', reason: 'not-frozen' });
    assert.equal((await rpc(service, 'save_next_book_snapshot', [s.id, frozenData(f, s, { ledger: [{ key: 'k', version: 'x' }] }), hex('a')])).reason, 'invalid-snapshot');
    assert.equal((await rpc(service, 'save_next_book_snapshot', [s.id, frozenData(f, s, { ledger: [{ key: 'k', version: 1 }, { key: 'k', version: 1 }] }), hex('a')])).reason, 'invalid-snapshot');
    assert.equal((await rpc(service, 'save_next_book_snapshot', [s.id, frozenData(f, s, { scope: { kind: 'backstop' } }), hex('a')])).reason, 'invalid-snapshot');
    assert.equal((await rpc(service, 'save_next_book_snapshot', [s.id, frozenData(f, s, { frozenAt: Date.now() + 3600e3 }), hex('a')])).reason, 'invalid-snapshot');
    assert.equal((await rpc(service, 'save_next_book_snapshot', [s.id, frozenData(f, s, { snapshot: { parentId: randomUUID(), childId: f.c } }), hex('a')])).reason, 'invalid-snapshot');
    const first = await rpc(service, 'save_next_book_snapshot', [s.id, frozenData(f, s), hex('a')]);
    assert.equal(first.status, 'ok', JSON.stringify(first));
    const second = await rpc(service, 'save_next_book_snapshot', [s.id, frozenData(f, s, { ledger: [] }), hex('c')]);
    assert.equal(second.snapshot.snapshot_hash, hex('a')); assert.equal(second.snapshot.consumed_ledger.length, 2);
    for (const bad of [[{ key: 'k8', version: 1 }], [{ key: 'k1', version: 1 }], [{ key: 'k1', version: 2 }, { key: 'k1', version: 2 }],
      [{ key: 'k1', version: 2, extra: 1 }], ['k1'], [7]]) {
      assert.deepEqual(await rpc(service, 'save_next_book_plan', [s.id, {}, hex('b'), JSON.stringify(bad), JSON.stringify([])]), { status: 'refused', reason: 'consumed-outside-ledger' }, JSON.stringify(bad));
    }
    assert.equal((await rpc(service, 'save_next_book_plan', [s.id, {}, 'nothex', JSON.stringify([]), JSON.stringify([])])).reason, 'invalid-plan');
    assert.equal((await rpc(service, 'save_next_book_plan', [s.id, { w: 2 }, hex('b'), JSON.stringify([{ key: 'k1', version: 2 }]), JSON.stringify([])])).status, 'ok');
    assert.equal((await rpc(service, 'save_next_book_plan', [s.id, { w: 2 }, hex('b'), JSON.stringify([{ key: 'k1', version: 2 }]), JSON.stringify([])])).status, 'ok');
    assert.deepEqual(await rpc(service, 'save_next_book_plan', [s.id, { w: 3 }, hex('b'), JSON.stringify([{ key: 'k1', version: 2 }]), JSON.stringify([])]), { status: 'refused', reason: 'plan-conflict' });
    await assert.rejects(() => db.query("update next_book_snapshots set snapshot_hash=$2 where id=$1", [s.id, hex('d')]), /next_book_snapshot_immutable/);
    await assert.rejects(() => db.query("update next_book_snapshots set plan_hash=$2 where id=$1", [s.id, hex('d')]), /next_book_snapshot_immutable/);
    await assert.rejects(() => db.query("update next_book_snapshots set revision=9 where id=$1", [s.id]), /next_book_snapshot_immutable/);
  });

  await test('one run per chain: concurrent admissions start one run through start_workbook_run and link it both ways', async () => {
    const f = await delivered(), { s } = await frozenPlanned(f);
    const [a, b] = [await open('service_role'), await open('service_role')];
    try {
      const answers = await Promise.all([rpc(a, 'admit_next_book_run', [s.id, null, null, 2, 360]), rpc(b, 'admit_next_book_run', [s.id, adminId, 'admin@example.invalid', 2, 360])]);
      assert.deepEqual(answers.map(x => x.status), ['started', 'started']);
      assert.equal(answers[0].run, answers[1].run);
      assert.deepEqual(answers.map(x => x.existing).sort(), [false, true]);
    } finally { await close(a); await close(b); }
    const runs = (await db.query('select * from workbook_runs where child_id=$1', [f.c])).rows;
    assert.equal(runs.length, 1); assert.equal(runs[0].snapshot_id, s.id); assert.equal(runs[0].number, 2);
    assert.equal((await snaps(f))[0].run_id, runs[0].id);
    // A child with another active run is busy, and that run is never adopted.
    const g = await delivered(), other = await frozenPlanned(g);
    await db.query("insert into workbook_runs(parent_id,child_id,number,max_attempts) values($1,$2,2,2)", [g.p, g.c]);
    const busy = await rpc(service, 'admit_next_book_run', [other.s.id, null, null, 2, 360]);
    assert.equal(busy.status, 'busy');
    assert.equal((await snaps(g))[0].run_id, null);
  });

  await test('retake: revision 2 for the chain draft, retried once, refused after approval, for an old revision and after a source change', async () => {
    const f = await delivered(), { s } = await frozenPlanned(f);
    const run = (await rpc(service, 'admit_next_book_run', [s.id, null, null, 2, 360])).run, draft = randomUUID();
    await db.query('insert into workbook_drafts values($1,$2,$3,2)', [draft, f.p, f.c]);
    await db.query('update workbook_runs set draft_id=$2,status=$3 where id=$1', [run, draft, 'done']);
    assert.deepEqual(await rpc(service, 'retake_next_book_snapshot', [s.id, randomUUID(), adminId, null]), { status: 'refused', reason: 'draft-not-found' });
    assert.deepEqual(await rpc(service, 'retake_next_book_snapshot', [s.id, draft, randomUUID(), null]), { status: 'refused', reason: 'admin-required' });
    const r2 = await rpc(service, 'retake_next_book_snapshot', [s.id, draft, adminId, 'admin@example.invalid']);
    assert.equal(r2.status, 'ok'); assert.equal(r2.snapshot.revision, 2); assert.equal(r2.snapshot.draft_id, draft);
    assert.equal((await rpc(service, 'retake_next_book_snapshot', [s.id, draft, adminId, null])).snapshot.id, r2.snapshot.id);
    assert.deepEqual(await rpc(service, 'retake_next_book_snapshot', [r2.snapshot.id, draft, adminId, null]), { status: 'refused', reason: 'not-planned' });
    assert.equal((await rpc(service, 'admit_next_book_run', [r2.snapshot.id, null, null, 2, 360])).reason, 'refresh-does-not-start-run');
    const audit = (await db.query("select * from workbook_audit where action='snapshot-retaken' and draft_id=$1", [draft])).rows;
    assert.equal(audit.length, 1); assert.equal(audit[0].run_id, run);
    // Approval locks the draft as approve_workbook_draft does; afterwards neither a freeze nor a retake passes.
    await db.query("insert into workbooks(id,parent_id,child_id,number,status) values($1,$2,$3,2,'approved')", [draft, f.p, f.c]);
    const data = frozenData(f, r2.snapshot, { scope: { kind: 'refresh', cutoff: Date.now() } });
    assert.deepEqual(await rpc(service, 'save_next_book_snapshot', [r2.snapshot.id, data, hex('e')]), { status: 'refused', reason: 'already-approved' });
    assert.deepEqual(await rpc(service, 'retake_next_book_snapshot', [r2.snapshot.id, draft, adminId, null]), { status: 'refused', reason: 'already-approved' });
    const g = await delivered(), other = await frozenPlanned(g);
    const run2 = (await rpc(service, 'admit_next_book_run', [other.s.id, null, null, 2, 360])).run, draft2 = randomUUID();
    await db.query('insert into workbook_drafts values($1,$2,$3,2)', [draft2, g.p, g.c]);
    await db.query('update workbook_runs set draft_id=$2 where id=$1', [run2, draft2]);
    await db.query('alter table workbooks disable trigger user');
    await db.query('update workbooks set printed_revision=$2 where id=$1', [g.w, 'f'.repeat(28)]);
    await db.query('alter table workbooks enable trigger user');
    assert.deepEqual(await rpc(service, 'retake_next_book_snapshot', [other.s.id, draft2, adminId, null]), { status: 'refused', reason: 'source-changed' });
  });

  await test('raw access: service and parents cannot write; only admins read; functions are service-only definers', async () => {
    const f = await delivered(), { s } = await frozenPlanned(f);
    await assert.rejects(() => service.query('insert into next_book_snapshots(parent_id,child_id,workbook_id,number,printed_revision,trigger_reason,trigger_at,prepare_from,revision,receipt_ids,actor_id) values($1,$2,$3,1,$4,$5,now(),now(),9,$6,$7)',
      [f.p, f.c, f.w, revision, 'admin_prepare', [], adminId]), e => e.code === '42501');
    await assert.rejects(() => service.query('update next_book_snapshots set run_id=null where id=$1', [s.id]), e => e.code === '42501');
    assert.equal((await admin.query('select count(*)::int n from next_book_snapshots where id=$1', [s.id])).rows[0].n, 1);
    const parent = await open('authenticated');
    try {
      await parent.query("select set_config('test.viewer',$1,false)", [f.p]);
      assert.equal((await parent.query('select count(*)::int n from next_book_snapshots')).rows[0].n, 0);
      await assert.rejects(() => rpc(parent, 'claim_next_book_snapshot', [null, f.w, f.p, null]), e => e.code === '42501');
    } finally { await close(parent); }
    const fns = (await db.query(`select proname,prosecdef,proconfig,proacl::text acl from pg_proc where proname in ('claim_next_book_snapshot','hold_next_book_snapshot',
      'save_next_book_snapshot','save_next_book_plan','retake_next_book_snapshot','admit_next_book_run')`)).rows;
    assert.equal(fns.length, 6);
    for (const x of fns) { assert(x.prosecdef, x.proname); assert.deepEqual(x.proconfig, ['search_path=""']); assert(/service_role=X/.test(x.acl) && !/authenticated|anon|=X\//.test(x.acl.replace(/fixture_owner=X\/fixture_owner/, '').replace(/service_role=X\/fixture_owner/, '')), x.acl); }
  });

  await test('family fence and deletion: a requested deletion refuses claims; deleting the family removes every row and run link', async () => {
    const f = await delivered(), { s } = await frozenPlanned(f);
    await rpc(service, 'admit_next_book_run', [s.id, null, null, 2, 360]);
    const g = await delivered(), tg = await claim(g);
    await db.query('update parents set deletion_requested_at=now() where id=$1', [g.p]);
    await assert.rejects(() => rpc(service, 'claim_next_book_snapshot', [tg, null, null, null]), e => e.code === '55000');
    await db.query('delete from auth.users where id=$1', [f.p]);
    assert.equal((await snaps(f)).length, 0);
    assert.equal((await db.query('select count(*)::int n from workbook_runs where child_id=$1', [f.c])).rows[0].n, 0);
    const h = await delivered(), other = await frozenPlanned(h);
    await rpc(service, 'admit_next_book_run', [other.s.id, null, null, 2, 360]);
    await db.query('insert into child_deletions values($1,$2)', [h.c, h.p]);
    assert.deepEqual(await rpc(service, 'claim_next_book_snapshot', [other.t, null, null, null]), { status: 'refused', reason: 'child-unavailable' });
    await db.query('delete from children where id=$1', [h.c]);
    assert.equal((await snaps(h)).length, 0);
  });
  await test('P2-1: an approval of book 2 racing the admission is serialized; the book 1 snapshot never queues book 3', async () => {
    const f = await delivered(), { s } = await frozenPlanned(f), draft = randomUUID();
    await db.query('insert into workbook_drafts values($1,$2,$3,2)', [draft, f.p, f.c]);
    const approval = await open(), admitting = await open('service_role');
    try {
      // The approval holds the draft as approve_workbook_draft does and has written book 2, not yet committed.
      await approval.query('begin');
      await approval.query('select 1 from workbook_drafts where id=$1 for no key update', [draft]);
      await approval.query("insert into workbooks(id,parent_id,child_id,number,status) values($1,$2,$3,2,'approved')", [draft, f.p, f.c]);
      let settled = false;
      const pending = rpc(admitting, 'admit_next_book_run', [s.id, null, null, 2, 360]).finally(() => { settled = true; });
      await new Promise(r => setTimeout(r, 400));
      assert.equal(settled, false, 'the admission must wait for the approval');
      await approval.query('commit');
      assert.deepEqual(await pending, { status: 'refused', reason: 'next-book-exists' });
    } finally { await close(approval); await close(admitting); }
    assert.equal((await db.query('select count(*)::int n from workbook_runs where child_id=$1', [f.c])).rows[0].n, 0);
    assert.equal((await snaps(f))[0].run_id, null);
    // A run that would not be book 2 (a workbook written with no draft lock) is rolled back with its audit row.
    const g = await delivered(), other = await frozenPlanned(g), c = await open('service_role');
    try {
      await c.query("select set_config('test.force_run_number','3',false)");
      assert.deepEqual(await rpc(c, 'admit_next_book_run', [other.s.id, null, null, 2, 360]), { status: 'refused', reason: 'next-book-exists' });
    } finally { await close(c); }
    assert.equal((await db.query('select count(*)::int n from workbook_runs where child_id=$1', [g.c])).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int n from workbook_audit where child_id=$1 and action='run-started'", [g.c])).rows[0].n, 0);
    assert.equal((await rpc(service, 'admit_next_book_run', [other.s.id, null, null, 2, 360])).status, 'started');
  });

  await test('P2-3: a cutoff at the millisecond the app reads for a microsecond prepare_from is accepted', async () => {
    const f = await delivered(), t = await claim(f, 'day7_scanned', '2026-11-08T10:00:12.500717Z');
    const s = (await rpc(service, 'claim_next_book_snapshot', [t, null, null, null])).snapshot;
    assert.equal((await db.query("select extract(microseconds from prepare_from)::int % 1000 n from next_book_snapshots where id=$1", [s.id])).rows[0].n, 717);
    const at = Date.parse('2026-11-08T10:00:12.500Z');
    assert.deepEqual(await rpc(service, 'save_next_book_snapshot', [s.id, frozenData(f, s, { frozenAt: at - 1, scope: { kind: 'day7', cutoff: at - 1 } }), hex('a')]),
      { status: 'refused', reason: 'invalid-snapshot' });
    const saved = await rpc(service, 'save_next_book_snapshot', [s.id, frozenData(f, s, { frozenAt: at, scope: { kind: 'day7', cutoff: at } }), hex('a')]);
    assert.equal(saved.status, 'ok', JSON.stringify(saved));
    assert.equal(Date.parse(saved.snapshot.frozen_at), at);
    // The first refresh: its prepare_from comes from clock_timestamp() and is read back at milliseconds.
    assert.equal((await rpc(service, 'save_next_book_plan', [s.id, {}, hex('b'), JSON.stringify([{ key: 'k1', version: 2 }]), JSON.stringify([])])).status, 'ok');
    const run = (await rpc(service, 'admit_next_book_run', [s.id, null, null, 2, 360])).run, draft = randomUUID();
    await db.query('insert into workbook_drafts values($1,$2,$3,2)', [draft, f.p, f.c]);
    await db.query('update workbook_runs set draft_id=$2 where id=$1', [run, draft]);
    const r2 = (await rpc(service, 'retake_next_book_snapshot', [s.id, draft, adminId, null])).snapshot;
    const read = (await db.query('select prepare_from from next_book_snapshots where id=$1', [r2.id])).rows[0].prepare_from.getTime();
    const refresh = await rpc(service, 'save_next_book_snapshot', [r2.id, frozenData(f, r2, { frozenAt: read, scope: { kind: 'refresh', cutoff: read } }), hex('c')]);
    assert.equal(refresh.status, 'ok', JSON.stringify(refresh));
  });
  console.log('NEXT_BOOK_SNAPSHOTS_OK', passed);
  console.log('PROOF: actual concurrent PostgreSQL sessions on a local throwaway cluster with a reduced dependency schema; not hosted proof.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  await Promise.allSettled([...clients].map(c => c.end()));
  try { cleanup(); } catch (e) { console.error('CLEANUP FAILED', e); process.exitCode = 1; }
});
