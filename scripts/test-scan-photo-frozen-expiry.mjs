// Integration regression for R477-1. Requires a disposable local Supabase instance, never a hosted database.
// SCAN_TEST_CONFIG=/path/to/supabase-status.json node scripts/test-scan-photo-frozen-expiry.mjs --bootstrap
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { build } from 'esbuild';
import sharp from 'sharp';
import QRCode from 'qrcode';
import assert from 'node:assert/strict';
const cfg = JSON.parse(readFileSync(process.env.SCAN_TEST_CONFIG, 'utf8'));
assert(['127.0.0.1', 'localhost'].includes(new URL(cfg.API_URL).hostname), 'Disposable local database only');
assert(['127.0.0.1', 'localhost'].includes(new URL(cfg.DB_URL).hostname), 'Disposable local database only');
const sql = new Client({ connectionString: cfg.DB_URL });
await sql.connect();
const file = name => readFileSync(`supabase/migrations/${name}.sql`, 'utf8');
if (process.argv.includes('--bootstrap')) {
  await sql.query(file('20261010_add_parents_children'));
  await sql.query(`alter table public.parents add column deletion_requested_at timestamptz;
    create table public.assessments(id uuid,parent_id uuid);
    create table public.family_payment_operations(parent_id uuid,outcome text);
    create table public.family_deletions(parent_id uuid,lease_token uuid,phase text);`);
  const fence = file('20261011_add_family_deletion');
  await sql.query(fence.slice(fence.indexOf('create function public.assert_family_writable'), fence.indexOf('\ndo $$\ndeclare t text;')));
  const admin = file('20261011_add_admin_area');
  await sql.query(admin.slice(admin.indexOf('create table public.admin_users'), admin.indexOf('-- Tables parents cannot read')));
  await sql.query(file('20261012_add_test_accounts'));
  await sql.query(file('20261029_add_workbooks'));
  await sql.query(`create trigger fence_work_upload before insert or update on storage.objects for each row execute function public.fence_work_upload(); create extension if not exists pg_cron;`);
  for (const name of ['20261102_scan_page_photos','20261102_scan_photo_abandonment_margin','20261102_scan_photo_active_session','20261102_scan_photo_notice']) await sql.query(file(name));
  await sql.query("notify pgrst,'reload schema'");
}
const ok = r => { if (r.error) throw new Error(r.error.message); return r.data; };
const admin = createClient(cfg.API_URL, cfg.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = createClient(cfg.API_URL, cfg.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `frozen477-${randomUUID()}@example.test`, password = randomUUID()+'aA!7';
const user = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user;
ok(await admin.from('parents').insert({ id: user.id, name: 'Synthetic QA', email, postal: 'V3S 0A1' }));
ok(await admin.from('test_accounts').insert({ parent_id: user.id, marked_by: user.id }));
const child = randomUUID(), book = randomUUID();
ok(await admin.from('children').insert({ id: child, parent_id: user.id, first_name: 'Alex', grade: 3, province: 'BC' }));
ok(await admin.from('workbooks').insert({ id: book, parent_id: user.id, child_id: child, number: 1, levels: [4], status: 'draft', approved_at: new Date().toISOString(), printed_at: new Date().toISOString() }));
const photos = Array.from({ length: 3 }, (_, index) => ({ id: randomUUID(), token: 'frozen477'+randomUUID().replaceAll('-',''), page: randomUUID(), number: index+1 }));
for (const p of photos) ok(await admin.from('workbook_pages').insert({ id: p.page, parent_id: user.id, workbook_id: book, page_number: p.number, day_label: 'Day 1', page_type: 'practice', qr_token: p.token }));
ok(await admin.from('workbooks').update({ status: 'shipped', shipped_at: new Date().toISOString() }).eq('id',book));
ok(await browser.auth.signInWithPassword({ email, password }));
const rpc = (name,args) => admin.rpc(name,args).then(ok);
const path = p => `${user.id}/${p.id}/photo.jpg`;
for (const p of photos) p.bytes = await sharp(await QRCode.toBuffer(`https://unicalearning.com/tutor/p/${p.token}`, { width: 600 })).jpeg().toBuffer();
const admit = p => rpc('admit_scan_photo',{ p_parent:user.id,p_child:child,p_id:p.id,p_bytes:p.bytes.length });
for (const p of photos.slice(0,2)) {
  assert.equal(await admit(p),'reserved');
  assert.equal(await rpc('start_scan_photo',{p_parent:user.id,p_id:p.id}),'started');
  assert.equal(await rpc('identify_scan_photo',{p_parent:user.id,p_id:p.id,p_token:p.token,p_width:600,p_height:600}),'identified');
  ok(await admin.storage.from('scan-photos').upload(path(p),p.bytes,{contentType:'image/jpeg'}));
  assert.equal(await rpc('finish_scan_photo',{p_parent:user.id,p_id:p.id,p_bytes:p.bytes.length}),'pending');
  if (p.number===1) assert.equal(ok(await browser.from('scan_photo_notices').select('parent_id')).length,0);
  if (p.number===2) assert.equal(await rpc('change_scan_photo',{p_parent:user.id,p_id:p.id,p_action:'save'}),'saved');
}
assert.equal(ok(await browser.from('scan_photo_notices').select('parent_id')).length,1,'First save remembers notice');
assert((await browser.rpc('acknowledge_scan_photo_notice',{p_parent:user.id})).error,'No browser RPC bypass');
// Bundle the real handlers and cleanup. Replace only request-cookie extraction with a real local Auth client.
mkdirSync('/tmp/scan477-fix-runtime',{recursive:true});
globalThis.__scan477Admin=admin; globalThis.__scan477Browser=browser;
await build({ stdin: { contents: `export { PUT } from ${JSON.stringify(process.cwd()+'/src/app/api/account/scans/[id]/route.ts')}; export { cleanupScanPhotos } from ${JSON.stringify(process.cwd()+'/src/lib/scan-photo-server.ts')};`, resolveDir:process.cwd(),loader:'ts' },bundle:true,platform:'node',format:'cjs',external:['sharp'],outfile:process.cwd()+'/.next/scan477-fix-runtime.cjs',plugins:[{
  name:'request-session-seam',setup(b){b.onResolve({filter:/^@\/lib\/supabase-auth$/},()=>({path:'request-auth',namespace:'test-seam'}));b.onLoad({filter:/.*/,namespace:'test-seam'},()=>({contents:'export async function sessionClient(){return globalThis.__scan477Browser} export function adminClient(){return globalThis.__scan477Admin}',loader:'js'}));b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:'',loader:'js'}));}
}] });
const product = createRequire(import.meta.url)(process.cwd()+'/.next/scan477-fix-runtime.cjs');
const flight=photos[2]; assert.equal(await admit(flight),'reserved');
let controller;
const body = new ReadableStream({ start(c){ controller=c; } });
const request = new Request(`http://127.0.0.1/api/account/scans/${flight.id}`,{method:'PUT',headers:{Origin:'http://127.0.0.1'},body,duplex:'half'});
const inFlight = product.PUT(request,{params:Promise.resolve({id:flight.id})});
const until=Date.now()+10000;
for (;;) {
  const row=ok(await admin.from('scan_photos').select('state').eq('id',flight.id).single());
  if (row.state==='processing') break;
  assert(Date.now()<until,'Upload reached processing'); await new Promise(r=>setTimeout(r,50));
}
await sql.query("update public.scan_photos set created_at=now()-interval '25 hours' where id=$1",[photos[0].id]);
await sql.query("update public.scan_photos set created_at=now()-interval '91 days',expires_at=now()-interval '1 day' where id=$1",[photos[1].id]);
await sql.query("update public.scan_photos set lease_until=now()-interval '1 second' where id=$1",[flight.id]);
await sql.query('update public.parents set deletion_requested_at=now() where id=$1',[user.id]);
await rpc('expire_scan_photos');
assert.equal(await product.cleanupScanPhotos(admin,Date.now()+10000),0);
const old=ok(await admin.from('scan_photos').select('state').eq('parent_id',user.id));
assert.deepEqual(old.map(x=>x.state).sort(),['pending','processing','saved']);
for(const p of photos.slice(0,2)) assert(ok(await admin.storage.from('scan-photos').download(path(p))).size>0);
console.log('RED control: 25-hour pending and 91-day saved photos remain in frozen family; cleanup removes 0.');
await sql.query(file('20261102_scan_photo_frozen_expiry'));
await rpc('expire_scan_photos');
const terminal=ok(await admin.from('scan_photos').select('state,stored_bytes,reserved_bytes').eq('parent_id',user.id));
assert(terminal.every(x=>x.state==='expired'));
assert(terminal.filter(x=>x.stored_bytes>0).length===2,'Physical bytes remain charged before cleanup');
assert(terminal.some(x=>x.reserved_bytes===20971520),'In-flight reservation remains charged');
assert((await admin.rpc('admit_scan_photo',{p_parent:user.id,p_child:child,p_id:randomUUID(),p_bytes:100})).error);
assert((await admin.rpc('change_scan_photo',{p_parent:user.id,p_id:photos[0].id,p_action:'save'})).error);
assert((await admin.from('scan_photos').update({state:'saved'}).eq('id',photos[1].id)).error);
assert((await admin.from('scan_photos').update({width:601}).eq('id',photos[1].id)).error);
assert((await admin.from('scan_photos').update({stored_bytes:0}).eq('id',photos[1].id)).error,'No early quota release');
assert((await browser.rpc('expire_scan_photos')).error);
assert((await admin.storage.from('scan-photos').upload(path(flight),flight.bytes,{contentType:'image/jpeg'})).error);
controller.enqueue(flight.bytes);controller.close();
assert.notEqual((await inFlight).status,200);
assert.equal(ok(await admin.storage.from('scan-photos').list(`${user.id}/${flight.id}`)).length,0);
assert.equal(await product.cleanupScanPhotos(admin,Date.now()+10000),2);
const clean=ok(await admin.from('scan_photos').select('state,stored_bytes,reserved_bytes').eq('parent_id',user.id));
assert(clean.every(x=>x.state==='expired'&&x.stored_bytes===0&&x.reserved_bytes===0));
for(const p of photos) assert((await admin.storage.from('scan-photos').download(path(p))).error);
assert.equal(await product.cleanupScanPhotos(admin,Date.now()+10000),0);
assert.equal(ok(await browser.from('scan_photo_notices').select('parent_id')).length,1,'Notice survives image expiry');
ok(await admin.auth.admin.deleteUser(user.id));
assert.equal(ok(await admin.from('scan_photo_notices').select('parent_id').eq('parent_id',user.id)).length,0,'Notice removed with family');
const report={finding:'R477-1',redControl:'Both overdue photos stayed; cleanup removed zero.',fixed:{pending25Hours:'expired and physically removed',saved91Days:'expired and physically removed',inFlight:'expired; delayed body refused; no object',quota:'Retained until actual removal, then zero',repeatCleanup:0},fence:['new admissions denied','active-state restoration denied','identity edits denied','premature byte release denied','browser expiry RPC denied','secret-key object creation denied'],notice:['first save remembered server-side','survives image expiry','removed with family'],proof:'Disposable local Supabase Auth, Storage and PostgreSQL; real PUT and cleanup modules with cookie extraction seam.'};
mkdirSync('.design/experiments/r454',{recursive:true});writeFileSync('.design/experiments/r454/r477-1-frozen-expiry.json',JSON.stringify(report,null,2)+'\n');
console.log('PASS: frozen-family expiry, physical cleanup, held upload, byte accounting, write fence and notice lifecycle.');
await sql.end();
