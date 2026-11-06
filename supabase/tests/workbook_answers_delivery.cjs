// Disposable local PostgreSQL only. Reduced RLS fixture; no hosted URL or Storage signing API.
const { Client } = require('pg');
const { readFileSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = mkdtempSync(join(tmpdir(), 'unica-answer-policy-'));
const data = join(root, 'data');
const port = 55476; // Unix socket is unique to this run; TCP listening is disabled.
const run = (command, args) => execFileSync(command, args, { stdio: 'pipe', timeout: 30000 });
const migration = name => readFileSync(join(__dirname, '..', 'migrations', name), 'utf8');
let started = false, db, passed = 0;
const P = '11111111-1111-4111-8111-111111111111', C = '22222222-2222-4222-8222-222222222222';
const B = '33333333-3333-4333-8333-333333333333', F = '44444444-4444-4444-8444-444444444444';
const A = '55555555-5555-4555-8555-555555555555', SIBLING = '66666666-6666-4666-8666-666666666666';
(async () => {
  run('initdb', ['-D', data, '-A', 'trust', '--no-locale']);
  run('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-k ${root} -p ${port} -c listen_addresses=''`, '-w', 'start']); started = true;
  db = new Client({ host: root, port, database: 'postgres', user: process.env.USER }); await db.connect();
  await db.query("set statement_timeout='5s'");
  await db.query(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function public.is_admin() returns boolean language sql stable as $$select auth.uid()='${A}'::uuid$$;
    create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
    create function storage.extension(text) returns text language sql immutable as $$select (regexp_match($1,'\\.([^.]+)$'))[1]$$;
    create table parents(id uuid primary key);
    create table children(id uuid primary key,parent_id uuid references parents,unique(id,parent_id));
    create table workbook_audit(id bigint primary key);
    create table workbooks(id uuid primary key,parent_id uuid references parents,child_id uuid references children,number int,status text,unique(id,parent_id,child_id,number));
    create table workbook_pages(id uuid primary key,workbook_id uuid references workbooks,parent_id uuid,image_path text);
    create table workbook_questions(id uuid primary key,workbook_id uuid references workbooks,parent_id uuid,package jsonb);
    create table storage.objects(bucket_id text,name text,metadata jsonb);
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    grant select on all tables in schema public,storage to authenticated,service_role;
    grant select on workbook_questions to anon;
    alter table storage.objects enable row level security;
    create policy "Parents read their own workbook files" on storage.objects for select to authenticated using(false);
    create policy "Admin files" on storage.objects for select to authenticated using(public.is_admin());
  `);
  for (const table of ['workbooks', 'workbook_pages', 'workbook_questions']) {
    await db.query(`alter table ${table} enable row level security;
      create policy "Parents read their own workbooks" on ${table} for select to authenticated using(parent_id=auth.uid());
      create policy "Admins read all workbooks" on ${table} for select to authenticated using(public.is_admin());`);
  }
  for (const [file, table, policy] of [
    ['20261102223812_workbook_delivery_receipts.sql', 'workbook_delivery_receipts', 'delivery_read'],
    ['20261102225721_workbook_delivery_corrections.sql', 'workbook_delivery_corrections', 'delivery_corrections_read'],
  ]) {
    const sql = migration(file);
    await db.query(sql.match(new RegExp(`create table public\\.${table} \\([\\s\\S]*?\\n\\);`))[0]);
    await db.query(`alter table ${table} enable row level security; grant select on ${table} to authenticated,service_role`);
    await db.query(sql.match(new RegExp(`create policy ${policy}[\\s\\S]*?;`))[0]);
  }
  await db.query(migration('20261030_workbooks_parent_shipped_only.sql'));
  await db.query(migration('20261106_workbook_parent_files_no_pdf.sql'));
  await db.query(`insert into parents values('${P}'),('${F}'); insert into children values('${C}','${P}'),('${SIBLING}','${P}'),('${F}','${F}');
    insert into workbooks values('${B}','${P}','${C}',1,'shipped'),('${F}','${F}','${F}',1,'shipped');
    insert into workbook_pages values('${B}','${B}','${P}','${P}/${B}/page.png');
    insert into workbook_questions values('${B}','${B}','${P}','{"answer":{"value":425}}'),('${F}','${F}','${F}','{"answer":{"value":99}}');
    insert into storage.objects values('workbook-pages','${P}/${B}/page.png','{"mimetype":"image/png"}'),
      ('workbook-pages','${P}/${B}/book.pdf','{"mimetype":"application/pdf"}'),
      ('workbook-pages','${P}/${B}/disguised.png','{"mimetype":"application/pdf"}');
    insert into workbook_audit select generate_series(1,50);
  `);
  async function as(role, parent, sql) {
    await db.query(`set role ${role}`); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [parent]);
    try { return (await db.query(sql)).rows; } finally { await db.query('reset role'); }
  }
  const answers = (parent = P, role = 'authenticated') => as(role, parent, 'select package from workbook_questions order by id');
  const count = async (n, parent = P, role = 'authenticated') => assert.equal((await answers(parent, role)).length, n);
  const test = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
  const reset = () => db.query('delete from workbook_delivery_corrections; delete from workbook_delivery_receipts');
  const receipt = async () => { await reset(); await db.query(`insert into workbook_delivery_receipts values('${B}','${P}','${C}',1,now()-interval '1 day','2026-11-01T12:00','America/Vancouver',true,now(),'${A}',1)`); };
  const correct = (audit, date) => db.query(`insert into workbook_delivery_corrections values(gen_random_uuid(),'${B}','${P}','${C}',1,${date},now()-interval '1 day','2026-11-01T12:00','correction',now()+interval '100 years','${A}',${audit},1)`);
  await test('old shipped policy exposes the stored answer before a receipt', async () => {
    assert.equal((await answers())[0].package.answer.value, 425);
  });
  await db.query(migration('20261106_workbook_answers_after_delivery.sql'));
  await test('no receipt gives zero answers but keeps shipped book/page and true PNG metadata', async () => {
    await count(0);
    assert.equal((await as('authenticated', P, 'select * from workbooks')).length, 1);
    assert.equal((await as('authenticated', P, 'select * from workbook_pages')).length, 1);
    const files = await as('authenticated', P, 'select name from storage.objects');
    assert.deepEqual(files.map(x => x.name), [`${P}/${B}/page.png`]);
  });
  await test('matching confirmed receipt releases the stored answer', async () => { await receipt(); assert.equal((await answers())[0].package.answer.value,425); });
  await test('highest audit wins over the date and insertion order', async () => {
    await correct(3, "now()-interval '2 days'"); await correct(2, "now()+interval '1 day'"); await count(1);
    await correct(4, "now()+interval '1 day'"); await count(0);
  });
  await test('future original receipt and deleted receipt give zero rows', async () => {
    await receipt(); await db.query("update workbook_delivery_receipts set delivered_at=now()+interval '1 day',recorded_at=now()+interval '2 days'"); await count(0);
    await reset(); await count(0);
  });
  // Invalid identity cannot be inserted under the real composite foreign keys. Also fault-inject visible
  // mismatches without those two keys to prove the policy checks the latest row rather than an older row.
  await test('real delivery identity foreign keys reject foreign parent, child and number', async () => {
    await receipt();
    for (const change of ["parent_id='"+F+"'", "child_id='"+SIBLING+"'", 'number=2']) {
      await assert.rejects(db.query('update workbook_delivery_receipts set '+change), e => e.code==='23503');
    }
  });
  await test('real correction foreign keys reject a foreign parent, sibling or wrong book number', async () => {
    await receipt(); await correct(2, "now()-interval '2 days'");
    for (const change of ["parent_id='"+F+"'", "child_id='"+SIBLING+"'", 'number=2']) {
      await assert.rejects(db.query('update workbook_delivery_corrections set '+change), e => e.code==='23503');
    }
  });
  await test('latest visible correction with the wrong child or number blocks an earlier valid receipt', async () => {
    await receipt(); await correct(2,"now()-interval '2 days'");
    const constraints = (await db.query("select conname from pg_constraint where conrelid='workbook_delivery_corrections'::regclass and contype='f' and confrelid='workbooks'::regclass")).rows;
    for (const {conname} of constraints) await db.query(`alter table workbook_delivery_corrections drop constraint "${conname}"`);
    await db.query(`update workbook_delivery_corrections set child_id='${SIBLING}'`); await count(0);
    await db.query(`update workbook_delivery_corrections set child_id='${C}',number=2`); await count(0);
  });
  await test('invalid visible receipt identity fails closed', async () => {
    await receipt();
    const constraints=(await db.query("select conname from pg_constraint where conrelid='workbook_delivery_receipts'::regclass and contype='f' and confrelid='workbooks'::regclass")).rows;
    for(const {conname} of constraints) await db.query(`alter table workbook_delivery_receipts drop constraint "${conname}"`);
    await db.query(`update workbook_delivery_receipts set child_id='${SIBLING}'`); await count(0);
    await db.query(`update workbook_delivery_receipts set child_id='${C}',number=2`); await count(0);
  });
  await test('other family and anonymous role cannot read answer rows', async () => { await receipt(); await count(0,F); await count(0,'','anon'); });
  await test('Admin and service keep every answer and printing file without receipts', async () => {
    await reset(); await count(2,A); await count(2,'','service_role');
    assert.equal((await as('authenticated', A, 'select * from storage.objects')).length,3);
    assert.equal((await as('service_role', '', 'select * from storage.objects')).length,3);
  });
  await test('an added permissive answer policy cannot bypass the restrictive delivery policy', async () => {
    await db.query('create policy accidental_grant on workbook_questions for select to authenticated using(true)'); await count(0);
  });
  console.log(JSON.stringify({ passed, failed: 0, baselineLeak: true, localPostgres: true, hosted: false, storageSigningApi: false }));
})().catch(error => { console.error(error); process.exitCode=1; }).finally(async () => {
  if (db) await db.end();
  if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
  rmSync(root, { recursive: true, force: true });
});
