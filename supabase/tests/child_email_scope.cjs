// Local PostgreSQL public-interface regressions. Use only the disposable fixture database.
// CHILD_EMAIL_SCOPE_SOCKET must name its Unix socket directory. No network or credentials.
const { Client } = require('pg');
const { readFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const sql = name => readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
if (!process.env.CHILD_EMAIL_SCOPE_SOCKET?.startsWith('/tmp/pd657-')) throw Error('Disposable local socket required');
const connect = async () => {
  const database = process.env.CHILD_EMAIL_SCOPE_DATABASE ?? 'postgres';
  if (database !== 'postgres' && !database.startsWith('pd657_')) throw Error('Disposable database required');
  const db = new Client({ host: process.env.CHILD_EMAIL_SCOPE_SOCKET, database, user: process.env.USER });
  await db.connect();
  await db.query("set statement_timeout='5s'");
  return db;
};
(async () => {
const db = await connect();
if (process.argv.includes('--bootstrap')) {
  for (const role of ['anon','authenticated','service_role']) {
    if (!(await db.query('select 1 from pg_roles where rolname=$1',[role])).rowCount) await db.query(`create role ${role}`);
  }
  await db.query(readFileSync(path.join(__dirname, 'child_email_scope_fixture.sql'), 'utf8'));
  const family = sql('20261011_add_family_deletion.sql');
  for (const name of ['assert_family_writable', 'fence_family_write']) {
    const match = family.match(new RegExp('create function public\\.' + name + '\\([\\s\\S]*?end \\$\\$;'));
    assert(match, name); await db.query(match[0]);
  }
  const hold = sql('20261105_family_delete_hold.sql').match(/create function public\.begin_family_delete_hold\([\s\S]*?end \$\$;/);
  assert(hold); await db.query(hold[0]);
  for (const table of ['email_log', 'email_copies']) await db.query(`create trigger fence_family_write before insert or update on ${table} for each row execute function fence_family_write()`);
  for (const name of ['child_delete','child_delete_child_insert','child_delete_copy_link','child_delete_queue_permissions','child_delete_file_guards','child_delete_plan_recovery','child_delete_email_copies']) await db.query(sql('20261105_'+name+'.sql'));
  if (!process.argv.includes('--before')) await db.query(sql('20261105_child_email_scope.sql'));
}
const scoped = (await db.query("select 1 from information_schema.columns where table_name='email_log' and column_name='copy_child_ids'")).rowCount === 1;
async function family() {
  const p=randomUUID(), c=randomUUID(), s=randomUUID(), h=randomUUID(), token=randomUUID();
  await db.query('insert into auth.users(id) values($1)',[p]);
  await db.query('insert into parents values($1,null)',[p]);
  await db.query("insert into children values($1,$3,'Al',array['Lee']),($2,$3,'Sally',array['Al'])",[c,s,p]);
  await db.query("insert into family_delete_holds values($1,$2,clock_timestamp()+interval '5 minutes')",[p,h]);
  return {p,c,s,h,token};
}
async function claim(f, children, kind='monthly_summary', calls=null, conn=db) {
  const id=randomUUID();
  const cols = scoped ? ',copy_child_ids' : '';
  const vals = scoped ? ',$6' : '';
  await conn.query(`insert into email_log(id,parent_id,kind,status,summary_month,call_ids${cols}) values($1,$2,$3,'claimed',$4,$5${vals})`,
    [id,f.p,kind,kind==='monthly_summary'?'2026-10-01':null,calls,...(scoped?[children]:[])]);
  return id;
}
const copy = (f,id,body='Sally only',conn=db) => conn.query('insert into email_copies(parent_id,email_log_id,subject,text_body) values($1,$2,$3,$3)',[f.p,id,body]);
const request = (f,conn=db) => conn.query('select request_child_deletion_held($1,$2,$3) v',[f.p,f.c,f.h]);
async function finish(f) {
  assert.equal((await db.query('select claim_child_deletion($1,$2,$3) v',[f.p,f.c,f.token])).rows[0].v,true);
  assert.equal((await db.query('select complete_child_deletion($1,$2,$3) v',[f.p,f.c,f.token])).rows[0].v,true);
}
async function blocked(run, message) { await assert.rejects(run, e=>e.code==='55000', message); }
let failures=0, passed=0;
async function test(name, run) {
  try {await run(); passed++;console.log('PASS',name);} catch(e){failures++;console.log('FAIL',name,e.message);}
}
await test('claim before delete, absent body, delayed copy refused and ledger retained',async()=>{
 const f=await family(), id=await claim(f,[f.c,f.s]);
 assert.equal((await request(f)).rows[0].v,'requested');await finish(f);
 await blocked(()=>copy(f,id,'Al and Sally /account?child='+f.c),'late copy restored deleted child');
 assert.equal((await db.query('select copy_redacted from email_log where id=$1',[id])).rows[0].copy_redacted,true);
});
await test('Al/Sally, former names and repeated names never determine ownership',async()=>{
 const f=await family();await db.query("update children set first_name='Al' where id=$1",[f.s]);
 const id=await claim(f,[f.s],'maya_weekly');await copy(f,id,'Sally and Al (former name), Lee');
 await request(f);await finish(f);
 assert.equal((await db.query('select count(*)::int n from email_copies where email_log_id=$1',[id])).rows[0].n,1);
 await copy(f,await claim(f,[f.s],'maya_daily'),'Al surviving sibling');
});
await test('exact Al/Sally reproduction preserves the known Sally-only copy',async()=>{
 const f=await family(),id=await claim(f,[f.s],'maya_weekly');await copy(f,id,'Sally with Maya. Sally had one call.');
 await request(f);await finish(f);
 assert.equal((await db.query('select count(*)::int n from email_copies where email_log_id=$1',[id])).rows[0].n,1);
});
await test('mixed scopes remove the whole copy, sibling data stays',async()=>{
 const f=await family(), id=await claim(f,[f.c,f.s]);await copy(f,id,'Both children');await request(f);await finish(f);
 assert.equal((await db.query('select count(*)::int n from email_copies where email_log_id=$1',[id])).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from children where id=$1',[f.s])).rows[0].n,1);
});
await test('old unknown daily and monthly claims stop deletion without touching sibling copies',async()=>{
 for(const kind of ['maya_daily','monthly_summary']) {
  const f=await family();
  // Seed a pre-migration row. The fixture owner disables only the new capture trigger.
  if(scoped)await db.query('alter table email_log disable trigger capture_email_copy_scope');
  let id;try {id=await claim(f,null,kind);}finally{if(scoped)await db.query('alter table email_log enable trigger capture_email_copy_scope');}
  // The old body can predate the new copy fence too.
  if(scoped)await db.query('alter table email_copies disable trigger fence_redacted_email_copy');
  try{await copy(f,id);}finally{if(scoped)await db.query('alter table email_copies enable trigger fence_redacted_email_copy');}
  await blocked(()=>request(f),'unknown scope was guessed');
  assert.equal((await db.query('select count(*)::int n from child_deletions where parent_id=$1',[f.p])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from email_copies where email_log_id=$1',[id])).rows[0].n,1);
 }
});
await test('Maya daily and weekly call references supply complete child scope',async()=>{
 for(const kind of ['maya_daily','maya_weekly']) {
  const f=await family(), a=randomUUID(),b=randomUUID();
  await db.query('insert into maya_calls values($1,$3,$4),($2,$3,$5)',[a,b,f.p,f.c,f.s]);
  const id=await claim(f,null,kind,[a,b]);await request(f);await finish(f);await blocked(()=>copy(f,id));
 }
});
await test('legacy complete call references preserve a known sibling copy without name matching',async()=>{
 const f=await family(),a=randomUUID();await db.query('insert into maya_calls values($1,$2,$3)',[a,f.p,f.s]);
 if(scoped)await db.query('alter table email_log disable trigger capture_email_copy_scope');
 let id;try{id=await claim(f,null,'maya_weekly',[a]);}finally{if(scoped)await db.query('alter table email_log enable trigger capture_email_copy_scope');}
 await copy(f,id,'Sally');await request(f);await finish(f);
 assert.equal((await db.query('select count(*)::int n from email_copies where email_log_id=$1',[id])).rows[0].n,1);
});
await test('incomplete old call references stop deletion, names cannot fill the gap',async()=>{
 const f=await family(),a=randomUUID();await db.query('insert into maya_calls values($1,$2,$3)',[a,f.p,f.s]);
 if(scoped)await db.query('alter table email_log disable trigger capture_email_copy_scope');
 try{await claim(f,null,'maya_weekly',[a,randomUUID()]);}finally{if(scoped)await db.query('alter table email_log enable trigger capture_email_copy_scope');}
 await blocked(()=>request(f));
});
await test('new unknown scopes and foreign child scopes cannot be claimed',async()=>{
 const f=await family(), other=await family();
 await blocked(()=>claim(f,null));await blocked(()=>claim(f,[other.s]));await blocked(()=>claim(f,[]));
});
await test('retry retains all attempt scopes and refuses narrowing or redaction reset',async()=>{
 const f=await family(),id=await claim(f,[f.c]);await copy(f,id,'Al failed attempt');
 await db.query("update email_log set status='failed' where id=$1",[id]);
 if(scoped)await db.query("update email_log set status='claimed',attempts=2,copy_child_ids=$2 where id=$1",[id,[f.s]]);
 await request(f);await finish(f);await blocked(()=>copy(f,id));
 await blocked(()=>db.query('update email_log set copy_redacted=false where id=$1',[id]));
});
await test('delivery outcomes can still be recorded after child deletion, without restoring a copy',async()=>{
 const f=await family(),id=await claim(f,[f.c,f.s]);await request(f);await finish(f);
 await db.query("update email_log set status='sent',sent_at=now(),email_id='synthetic-delivery' where id=$1",[id]);
 assert.equal((await db.query('select status from email_log where id=$1',[id])).rows[0].status,'sent');
 await blocked(()=>copy(f,id));
});
await test('the shared copy guard preserves child-owned reminders and report copies',async()=>{
 const f=await family(),reminder=randomUUID(),report=randomUUID();
 await db.query("insert into email_log(id,parent_id,child_id,kind,status) values($1,$2,$3,'start','claimed')",[reminder,f.p,f.s]);
 await copy(f,reminder,'Sally reminder');
 await db.query('insert into reports values($1,$2)',[report,f.s]);
 await db.query("insert into email_copies(parent_id,report_id,subject,text_body) values($1,$2,'Sally report','Sally')",[f.p,report]);
 await request(f);await finish(f);
 assert.equal((await db.query('select count(*)::int n from email_copies where parent_id=$1',[f.p])).rows[0].n,2);
 const other=await family();
 await blocked(()=>db.query("insert into email_copies(parent_id,report_id,subject,text_body) values($1,$2,'Wrong parent','Sally')",[other.p,report]));
});
await test('an old queued request rechecks unknown scope before completion',async()=>{
 const f=await family();
 if(scoped)await db.query('alter table email_log disable trigger capture_email_copy_scope');
 try{await claim(f,null);}finally{if(scoped)await db.query('alter table email_log enable trigger capture_email_copy_scope');}
 await db.query('alter table child_deletions disable trigger mark_child_email_copies');
 try{await db.query('insert into child_deletions(parent_id,child_id) values($1,$2)',[f.p,f.c]);}finally{await db.query('alter table child_deletions enable trigger mark_child_email_copies');}
 await db.query('select claim_child_deletion($1,$2,$3)',[f.p,f.c,f.token]);
 await blocked(()=>db.query('select complete_child_deletion($1,$2,$3)',[f.p,f.c,f.token]));
 assert.equal((await db.query('select count(*)::int n from children where id=$1',[f.c])).rows[0].n,1);
});
await test('unchanged family deletion cascades through scoped logs and copies',async()=>{
 const f=await family(),id=await claim(f,[f.c,f.s]);await copy(f,id);
 await db.query('delete from auth.users where id=$1',[f.p]);
 assert.equal((await db.query('select count(*)::int n from parents where id=$1',[f.p])).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from email_log where id=$1',[id])).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from email_copies where email_log_id=$1',[id])).rows[0].n,0);
});
// Observe the real server wait, then commit the winner. No scheduling delay substitutes for a lock assertion.
async function waiting(pid) {
 for(let i=0;i<200;i++) {
  const r=await db.query("select wait_event_type from pg_stat_activity where pid=$1",[pid]);
  if(r.rows[0]?.wait_event_type==='Lock')return;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 throw Error('second connection did not wait on the parent lock');
}
await test('claim first: two concurrent connections serialize with deletion',async()=>{
 const f=await family(),a=await connect(),b=await connect();
 try{
  await a.query('begin');const id=await claim(f,[f.c,f.s],'monthly_summary',null,a);
  const done=request(f,b);await waiting(b.processID);await a.query('commit');assert.equal((await done).rows[0].v,'requested');
  await finish(f);await blocked(()=>copy(f,id));
 }finally{await a.query('rollback');await a.end();await b.end();}
});
await test('delete first: two concurrent connections refuse the late claim',async()=>{
 const f=await family(),a=await connect(),b=await connect();
 try{
  await a.query('begin');await request(f,a);
  const done=claim(f,[f.c,f.s],'monthly_summary',null,b).then(()=>null,e=>e);
  await waiting(b.processID);await a.query('commit');assert.equal((await done)?.code,'55000');
  await finish(f);await copy(f,await claim(f,[f.s]),'Sally survives');
 }finally{await a.query('rollback');await a.end();await b.end();}
});
if(process.argv.includes('--rollback-probes')) {
 for(const file of ['child_email_scope.sql','child_delete_email_copies.sql']) {
  await test('rollback probe '+file,async()=>{
   await db.query(readFileSync(path.join(__dirname,file),'utf8'));
   assert.equal((await db.query("select count(*)::int n from auth.users where email like '%@example.invalid'")).rows[0].n,0);
  });
 }
}
console.log(JSON.stringify({passed,failures,scopeColumn:scoped}));
await db.end();process.exitCode=failures?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
