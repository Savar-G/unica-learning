// Run against an empty local test database with the migrations through #425 applied.
// Requires node-postgres: npm install --prefix /tmp/maya-window-probe pg
// NODE_PATH=/tmp/maya-window-probe/node_modules PGHOST=127.0.0.1 PGPORT=5432 PGPASSWORD=... node supabase/tests/maya_expired_window.cjs [--fixed]
// Baseline loads the function from 638a798. --fixed loads this PR's replacement.
const pg = require('pg');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const root = process.cwd();
const config = {host:'127.0.0.1',port:Number(process.env.PGPORT || 5432),user:process.env.PGUSER || 'postgres',password:process.env.PGPASSWORD,database:process.env.PGDATABASE || 'postgres'};
const p='ff433000-0000-4000-8000-000000000001', child='ff433000-0000-4000-8000-000000000002';
const id=n=>'ff433000-0000-4000-8000-'+String(n).padStart(12,'0');
const fixed=process.argv.includes('--fixed');
(async()=>{
 const a=new pg.Client(config),b=new pg.Client(config); await a.connect();await b.connect();
 const saved=(await a.query(`select pg_get_functiondef(oid) def from pg_proc where pronamespace='public'::regnamespace and proname in ('grant_maya_minutes','_maya_minutes_used','reserve_maya_minutes_on_call')`)).rows;
 try {
  // Only a local, empty review database. Inject the clock without changing production SQL.
  assert.equal((await a.query('select count(*)::int n from public.parents')).rows[0].n,0);
  if(fixed) await a.query(fs.readFileSync(root+'/supabase/migrations/20261102155713_current_maya_minute_window.sql','utf8'));
  else {
   const source=execFileSync('git',['show','638a798:supabase/migrations/20261101_maya_minute_time_windows.sql'],{encoding:'utf8'});
   await a.query(source.slice(source.indexOf('create or replace function')));
  }
  await a.query(`create or replace function public.probe_clock() returns timestamptz language sql volatile as $$select current_setting('probe.now')::timestamptz$$`);
  const defs=(await a.query(`select pg_get_functiondef(oid) def from pg_proc where pronamespace='public'::regnamespace and proname in ('grant_maya_minutes','_maya_minutes_used','reserve_maya_minutes_on_call')`)).rows;
  for(const {def} of defs) await a.query(def.replaceAll('clock_timestamp()', 'public.probe_clock()'));
  for(const conn of [a,b]) await conn.query(`select set_config('request.jwt.claim.role','service_role',false),set_config('probe.now','2026-11-09T06:30:00Z',false)`);
  await a.query(`insert into auth.users(id,email) values($1,'minutes-window@example.invalid')`,[p]);
  await a.query(`insert into public.parents(id,name,email,time_zone) values($1,'Probe','minutes-window@example.invalid','America/Toronto')`,[p]);
  await a.query(`insert into public.children(id,parent_id,first_name,grade,province) values($1,$2,'Probe',3,'ON')`,[child,p]);
  await a.query(`insert into public.test_accounts(parent_id,marked_by) values($1,$1)`,[p]);
  for(let n=10;n<13;n++) await a.query(`insert into public.maya_minute_grants(call_id,parent_id,child_id,kind,period,granted_seconds,used_seconds,settled_at,created_at,period_start) values($1,$2,$3,'child','2026-11-02',600,600,'2026-11-08T20:00Z','2026-11-08T19:00Z','2026-11-02T05:00Z')`,[id(n),p,child]);
  assert.equal((await a.query(`select * from public.grant_maya_minutes($1,$2,$3,'child','2026-11-09',1800,600,60,'2026-11-09T05:00Z')`,[id(20),p,child])).rows[0].granted,600);
  for(const conn of [a,b]) await conn.query(`select set_config('probe.now','2026-11-09T06:33:00Z',false)`);
  await b.query(`update public.parents set time_zone='America/Vancouver' where id=$1`,[p]);
  await b.query('begin');
  await b.query(`select pg_advisory_xact_lock(hashtextextended('maya_minutes:child:'||$1,0))`,[child]);
  const pending=a.query(`insert into public.maya_calls(id,parent_id,child_id,kind,question_source,workbook_id,workbook_page,workbook_question,package_id,package_hash,model,prompt_version,versions,live) values($1,$2,$3,'admin_test','workbook',gen_random_uuid(),1,1,'probe','sha256:'||repeat('0',64),'probe','probe','{}','{}')`,[id(20),p,child]).then(()=>null,e=>e);
  let blocked=false;
  for(let i=0;i<100;i++) {
   if((await b.query(`select 1 from pg_locks where pid=$1 and not granted and locktype='advisory'`,[a.processID])).rowCount){blocked=true;break;}
   await new Promise(r=>setTimeout(r,10));
  }
  assert.equal(blocked,true,'delayed insertion must wait on the same child lock');
  const before=(await b.query(`select public.maya_minutes_used($1,$2,'child','2026-11-02T07:00Z'::timestamptz) used`,[p,child])).rows[0].used;
  assert.equal(before,1800);
  await b.query('commit');
  const error=await pending;
  const after=(await a.query(`select public.maya_minutes_used($1,$2,'child','2026-11-02T07:00Z'::timestamptz) used`,[p,child])).rows[0].used;
  assert.equal(after,fixed?1800:2400);
  assert.equal(error?.message??null,fixed?'maya_minute_grant_expired':null);
  console.log(JSON.stringify({mode:fixed?'fixed':'638a798',connections:2,childLockWait:blocked,before,after,insertion:error?.message??'accepted'}));
  if (fixed) {
   // With 1,200 seconds spent, the same full expired grant fits in the new window.
   await a.query('delete from public.maya_minute_grants where call_id=$1',[id(12)]);
   await a.query(`insert into public.maya_calls(id,parent_id,child_id,kind,question_source,workbook_id,workbook_page,workbook_question,package_id,package_hash,model,prompt_version,versions,live) values($1,$2,$3,'admin_test','workbook',gen_random_uuid(),1,1,'probe','sha256:'||repeat('0',64),'probe','probe','{}','{}')`,[id(20),p,child]);
   await a.query(`select set_config('probe.now','2026-11-09T06:40:00Z',false)`);
   // A crashed call has a row but no settlement. It still counts after the grant wait expires.
   assert.equal((await a.query(`select public.maya_minutes_used($1,$2,'child','2026-11-02T07:00Z'::timestamptz) used`,[p,child])).rows[0].used,1800);
   const refreshed=(await a.query('select period::text,period_start from public.maya_minute_grants where call_id=$1',[id(20)])).rows[0];
   assert.equal(refreshed.period,'2026-11-02');
   assert.equal(refreshed.period_start.toISOString(),'2026-11-02T07:00:00.000Z');
   const denied=(await a.query(`select * from public.grant_maya_minutes($1,$2,$3,'child','2026-11-02',86400,600,60,'2026-11-02T07:00Z')`,[id(21),p,child])).rows[0];
   assert.equal(denied.granted,0);
   // A new child grant cannot exceed ten minutes even with an oversized period cap.
   await a.query('delete from public.maya_calls where parent_id=$1',[p]);
   await a.query('delete from public.maya_minute_grants where parent_id=$1',[p]);
   assert.equal((await a.query(`select * from public.grant_maya_minutes($1,$2,$3,'child','2026-11-02',86400,600,60,'2026-11-02T07:00Z')`,[id(22),p,child])).rows[0].granted,600);
   // A demo grant must also re-reserve against the current day, including legacy grants without period_start.
   await a.query(`insert into public.maya_minute_grants(call_id,parent_id,kind,period,granted_seconds,used_seconds,settled_at,created_at) values($1,$2,'parent_demo','2026-11-08',120,120,'2026-11-08T20:00Z','2026-11-08T19:00Z')`,[id(30),p]);
   await a.query(`insert into public.maya_minute_grants(call_id,parent_id,kind,period,granted_seconds,created_at) values($1,$2,'parent_demo','2026-11-09',120,'2026-11-09T06:30Z')`,[id(31),p]);
   const demoError=await a.query(`insert into public.maya_calls(id,parent_id,child_id,kind,question_source,workbook_id,workbook_page,workbook_question,package_id,package_hash,model,prompt_version,versions,live) values($1,$2,$3,'admin_test','workbook',gen_random_uuid(),1,1,'probe','sha256:'||repeat('0',64),'probe','probe','{}','{}')`,[id(31),p,child]).then(()=>null,e=>e);
   assert.equal(demoError?.message,'maya_minute_grant_expired');
   console.log('PASS full re-reservation, updated window, crashed call counted, weekly and call caps, legacy demo current-day refusal');
  }
 } finally {
  await b.query('rollback'); await a.query('rollback');
  await a.query('delete from public.parents where id=$1',[p]);await a.query('delete from auth.users where id=$1',[p]);
  for(const {def} of saved) await a.query(def);
  await a.query('drop function if exists public.probe_clock()');
  console.log('remaining probe families',(await a.query('select count(*)::int n from public.parents where id=$1',[p])).rows[0].n);
  await a.end();await b.end();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
