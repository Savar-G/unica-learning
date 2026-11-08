// #715 review P1. Disposable local PostgreSQL only (no TCP listener, no URL, password or hosted target).
// A team mark (state parent-checked, actor admin) finishes its item like a parent's mark, so the page's explanations stay
// available: the explanation for the AI's Wrong on the same page and for the team-marked Wrong itself.
// Same setup as parent_problem_explanations.cjs, with the real parent_explanation_command, then the #715 follow-up.
// Run: node supabase/tests/scan_team_mark_explanation.cjs
const { Client } = require('pg');
const { build } = require('esbuild');
const { Module } = require('node:module');
const { mkdtempSync, readFileSync, readdirSync, mkdirSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const bin = '/opt/homebrew/opt/postgresql@18/bin';
const temp = mkdtempSync('/tmp/pd715-pg-'), data = path.join(temp, 'data'), socket = path.join(temp, 'socket');
mkdirSync(socket);
const sql = name => readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
const followup = readdirSync(path.join(root, 'supabase/migrations')).find(n => n.endsWith('_scan_team_mark_followups.sql'));
let started = false, db, production, passed = 0, failed = 0;
const clients = new Set();
async function open() { const c = new Client({ host: socket, port: 51476, database: 'postgres', user: process.env.USER }); await c.connect(); await c.query("set statement_timeout='8s'"); clients.add(c); return c; }
const call = async (action, f, item, version) => (await db.query('select public.parent_explanation_command($1,$2,$3,$4,$5) v', [action, f.p, f.photo, null, { itemId: item, version }])).rows[0].v;
async function test(name, run) { try { await run(); passed++; console.log('PASS', name); } catch (e) { failed++; console.log('FAIL', name, e.stack); } }
/**
 * One page, two questions: Q1 the AI marked Wrong; Q2 a person marked Wrong (actor given). Q2's reading is sure by default
 * (the AI read it clearly but code could not judge it, as for a write-words form); `sure: false` keeps an unsure reading.
 */
async function page(actor, sure = true) {
  const p = randomUUID(), c = randomUUID(), w = randomUUID(), pg = randomUUID(), photo = randomUUID();
  await db.query('insert into auth.users values($1) on conflict do nothing', [p]); await db.query('insert into parents values($1,null) on conflict do nothing', [p]); await db.query('insert into children values($1,$2)', [c, p]);
  await db.query("insert into workbooks(id,parent_id,child_id,status,printed_revision) values($1,$2,$3,'shipped','immutable')", [w, p, c]);
  await db.query("insert into workbook_pages(id,workbook_id,parent_id,page_number,print_contract,image_width,image_height) values($1,$2,$3,2,'{}',1000,1400)", [pg, w, p]);
  await db.query("insert into scan_photos(id,parent_id,child_id,page_id,workbook_id,printed_revision,state,reserved_bytes,width,height,sent_at) values($1,$2,$3,$4,$5,'immutable','saved',0,1000,1400,now())", [photo, p, c, pg, w]);
  const sample = production.sampleWorkbook({ parentId: p, childId: c, workbookId: w, qrTokens: ['sample-token-00000001', 'sample-token-00000002', 'sample-token-00000003'] }).pages[1].questions;
  for (const n of [1, 2]) {
    const pkg = { ...sample[n - 1].package, id: `item${n}`, ref: { ...sample[n - 1].package.ref, workbookId: w, page: 2, question: n } };
    await db.query('insert into workbook_questions(parent_id,workbook_id,page_id,question_number,package,schema_version) values($1,$2,$3,$4,$5,2)', [p, w, pg, n, pkg]);
    const expected = production.expectedItems({ workbookId: w, printedRevision: 'immutable', pageId: pg, questions: [{ number: n, package: pkg, teaching: null }] })[0];
    const certainty = n === 1 || sure ? 'certain' : 'uncertain';
    const read = { ...production.firstObservation(expected, photo), certainty, readAnswerText: '41',
      regions: expected.scoredRegions.map(regionId => ({ regionId, text: '41', certainty, result: n === 1 ? 'wrong' : null })) };
    const observation = n === 1 ? { ...read, state: 'scored', result: 'wrong', resultVersion: 2 }
      : { ...read, state: 'parent-checked', method: 'parent', actor, result: 'wrong', resultVersion: 3 };
    await db.query("insert into scan_marking_items(parent_id,child_id,workbook_id,printed_revision,page_id,item_id,expected,observation,result_version,model) values($1,$2,$3,'immutable',$4,$5,$6,$7,$8,'model')",
      [p, c, w, pg, `item${n}`, expected, observation, observation.resultVersion]);
  }
  return { p, photo };
}
(async () => {
  execFileSync(path.join(bin, 'initdb'), ['-D', data, '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'ignore' });
  execFileSync(path.join(bin, 'pg_ctl'), ['-D', data, '-l', path.join(temp, 'postgres.log'), '-o', `-h '' -k ${socket} -p 51476 -c shared_buffers=16MB -c max_connections=8`, '-w', 'start'], { stdio: 'ignore' }); started = true;
  const built = await build({ stdin: { contents: "export {sampleWorkbook} from './src/lib/workbook-sample'; export {expectedItems,firstObservation} from './src/lib/scan-observation';", resolveDir: root, sourcefile: 'pd715-harness.ts', loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    plugins: [{ name: 'no-server-only', setup(b) { b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'empty', namespace: 'fixture' })); b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: '', loader: 'js' })); } }] });
  const compiled = new Module(path.join(root, 'supabase/tests/.pd715-bundle.cjs'), module); compiled.filename = path.join(root, 'supabase/tests/.pd715-bundle.cjs'); compiled.paths = module.paths;
  compiled._compile(built.outputFiles[0].text, compiled.filename); production = compiled.exports;
  db = await open();
  for (const role of ['anon', 'authenticated', 'service_role']) await db.query(`create role ${role}${role === 'service_role' ? ' bypassrls' : ''}`);
  await db.query(readFileSync(path.join(__dirname, 'scan_marking_fixture.sql'), 'utf8'));
  await db.query('alter table workbook_questions add column schema_version smallint not null default 2');
  const family = sql('20261011_add_family_deletion.sql');
  for (const name of ['assert_family_writable', 'fence_family_write']) { const f = family.match(new RegExp('create function public\\.' + name + '\\([\\s\\S]*?end \\$\\$;')); assert(f); await db.query(f[0]); }
  await db.query(sql('20261029_add_learning_events.sql').replace('alter table public.children add constraint children_id_parent_key unique (id, parent_id);', '').replace('alter table public.assessments add constraint assessments_id_child_key unique (id, child_id);', ''));
  for (const name of ['20261102_scan_page_photos.sql', '20261105_scan_crops.sql', '20261105_scan_stack.sql']) await db.query(sql(name));
  const child = sql('20261105_child_delete.sql');
  for (const name of ['child_delete_row_child', 'fence_child_delete_write']) { const f = child.match(new RegExp('create function public\\.' + name + '\\([\\s\\S]*?end \\$\\$;')); assert(f); await db.query(f[0]); }
  await db.query(sql('20261105_scan_marking.sql'));
  await db.query(sql('20261106_scan_mark_changes.sql'));
  await db.query(sql('20261106220000_parent_problem_explanations.sql'));
  const before = await page('admin');
  await test('before the follow-up, a team mark blocks the page (the bug)', async () => {
    assert.equal(await call('context', before, 'item1', 2), null);
  });
  if (followup) await db.query(sql(followup));
  await test('after the follow-up, a team mark finishes its item: the AI Wrong and the team Wrong both get a context', async () => {
    assert.ok(followup, 'the #715 follow-up migration exists');
    const f = await page('admin');
    const one = await call('context', f, 'item1', 2), two = await call('context', f, 'item2', 3);
    assert.equal(typeof one?.context, 'string'); assert.equal(one.itemId, 'item1');
    assert.equal(typeof two?.context, 'string'); assert.equal(two.itemId, 'item2');
  });
  await test('a team mark of an unsure reading finishes the page, but that answer gets no explanation (as for a parent mark)', async () => {
    for (const actor of ['admin', 'parent']) {
      const f = await page(actor, false);
      assert.equal(typeof (await call('context', f, 'item1', 2))?.context, 'string');
      assert.equal(await call('context', f, 'item2', 3), null);
    }
  });
  await test('a parent mark still finishes its item, and an unknown actor still blocks the page', async () => {
    assert.equal(typeof (await call('context', await page('parent'), 'item1', 2))?.context, 'string');
    assert.equal(await call('context', await page('robot'), 'item1', 2), null);
  });
  console.log(JSON.stringify({ passed, failed, proof: 'local PostgreSQL; no hosted, browser or provider proof', temporary: temp }));
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  for (const client of clients) await client.end().catch(() => {});
  if (started) execFileSync(path.join(bin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
});
