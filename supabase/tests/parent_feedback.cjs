// Local synthetic PostgreSQL proof. Starts and stops its own disposable cluster. No network or hosted credentials.
const { mkdtempSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const root = resolve(__dirname, '../..');
const bin = process.env.PD680_PG_BIN || '/opt/homebrew/opt/postgresql@18/bin';
const dir = mkdtempSync(join(tmpdir(), 'pd680-feedback-'));
const socket = join(dir, 'socket');
require('node:fs').mkdirSync(socket);
let pool, started = false;
const originalFunction = (file, name) => {
  const source = readFileSync(join(root, 'supabase/migrations', file), 'utf8');
  const found = source.match(new RegExp('create (?:or replace )?function public\\.' + name + '\\([\\s\\S]*?\\$\\$;'));
  if (!found) throw Error('Missing production function ' + name);
  return found[0];
};
let passed = 0;
async function test(name, run) { await run(); passed++; console.log('PASS', name); }
(async () => {
 try {
  execFileSync(join(bin, 'initdb'), ['-D', join(dir,'data'), '-A','trust','--no-locale','-E','UTF8'], {stdio:'ignore'});
  execFileSync(join(bin, 'pg_ctl'), ['-D',join(dir,'data'),'-l',join(dir,'postgres.log'),'-o',`-k ${socket} -h '' -p 55480`,'-w','start'], {stdio:'ignore'}); started = true;
  pool = new Pool({host:socket,port:55480,database:'postgres',user:process.env.USER,max:24});
  await pool.query(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.parents(id uuid primary key, deletion_requested_at timestamptz);
    create table public.children(id uuid primary key,parent_id uuid not null references parents on delete cascade,unique(id,parent_id));
    create table public.child_deletions(child_id uuid primary key references children on delete cascade,parent_id uuid references parents on delete cascade);
    create function public.is_admin() returns boolean language sql as $$ select coalesce(current_setting('test.admin',true),'no')='yes' $$;`);
  await pool.query(originalFunction('20261011_add_family_deletion.sql','assert_family_writable'));
  await pool.query(originalFunction('20261011_add_family_deletion.sql','fence_family_write'));
  await pool.query(originalFunction('20261105_child_delete.sql','child_delete_row_child'));
  await pool.query(originalFunction('20261105_child_delete.sql','fence_child_delete_write'));
  await pool.query(readFileSync(join(root,'supabase/migrations/20261106_parent_feedback.sql'),'utf8'));
  const family = async () => { const p=randomUUID(),c=randomUUID();await pool.query('insert into parents(id) values($1)',[p]); await pool.query('insert into children values($1,$2)',[c,p]);return {p,c}; };
  const body = (extra={}) => ({id:randomUUID(),child:null,product:'workbook',text:'More room for working, please.',source:'/account/workbooks',...extra});
  const send = async (f,b=body(),db=pool) => (await db.query('select public.submit_feedback($1,$2,$3,$4,$5,$6) v',[f.p,b.id,b.child,b.product,b.text,b.source])).rows[0].v;
  const count = async p => Number((await pool.query('select count(*) n from feedback where parent_id=$1',[p])).rows[0].n);
  const rejected = (run, code) => assert.rejects(run,e=>e.code===code);
  await test('no-child parent saves, identical retry is idempotent, every changed payload conflicts',async()=>{
    const f=await family();await pool.query('delete from children where id=$1',[f.c]);const b=body();
    assert.equal(await send(f,b),'saved');assert.equal(await send(f,b),'duplicate');
    for(const changed of [{text:'different'},{product:'maya'},{source:'/account'}])assert.equal(await send(f,{...b,...changed}),'conflict');
    assert.equal(await count(f.p),1);
  });
  await test('database refuses empty, oversized, invalid product and token-bearing source; exact Unicode bound saves intact',async()=>{
    const f=await family();for(const b of [body({text:''}),body({text:'\t \n'}),body({text:'x'.repeat(5001)}),body({product:'fake'}),body({source:'/account?token=secret'}),body({source:'/account/report/private'})])await rejected(()=>send(f,b),'23514');
    assert.equal(await count(f.p),0);const b=body({text:'🙂'.repeat(5000)});assert.equal(await send(f,b),'saved');
    assert.equal((await pool.query('select text from feedback where parent_id=$1',[f.p])).rows[0].text,b.text);
  });
  await test('foreign children, queued child deletion and family deletion refuse new rows and retries',async()=>{
    const f=await family(),g=await family();assert.equal(await send(f,body({child:g.c})),'child_unavailable');
    const b=body({child:f.c});assert.equal(await send(f,b),'saved');await pool.query('insert into child_deletions values($1,$2)',[f.c,f.p]);
    assert.equal(await send(f,b),'child_unavailable');
    await pool.query('update parents set deletion_requested_at=clock_timestamp() where id=$1',[f.p]);
    assert.equal(await send(f,body()),'family_unavailable');assert.equal(await send(f,b),'family_unavailable');
  });
  await test('twenty simultaneous calls admit exactly five; duplicate stays safe at the limit; another parent is independent',async()=>{
    const f=await family(),b=body();const all=await Promise.all([b,...Array.from({length:19},()=>body())].map(b=>send(f,b)));
    const distribution=all.reduce((a,x)=>(a[x]=(a[x]||0)+1,a),{});console.log('RATE_DISTRIBUTION',JSON.stringify(distribution));
    assert.deepEqual(distribution,{saved:5,rate_limited:15});assert.equal(await count(f.p),5);assert.equal(await send(f,b),'duplicate');
    assert.equal(await send(await family()),'saved');
  });
  await test('hour boundary uses database time',async()=>{
    const f=await family();for(let i=0;i<5;i++)assert.equal(await send(f),'saved');assert.equal(await send(f),'rate_limited');
    await pool.query("update feedback set created_at=clock_timestamp()-interval '1 hour 1 second' where parent_id=$1",[f.p]);assert.equal(await send(f),'saved');
  });
  await test('parents read no rows and cannot write or call admission; anon cannot read/write/call; admins read by RLS',async()=>{
    const f=await family();await send(f);const db=await pool.connect();
    try {
      await db.query('set role authenticated');assert.equal((await db.query('select * from feedback')).rowCount,0);
      await rejected(()=>db.query("insert into feedback(parent_id,request_id,product,text,source) values($1,$2,'other','test','/account')",[f.p,randomUUID()]),'42501');
      await rejected(()=>send(f,body(),db),'42501');
      await db.query("set test.admin='yes'");assert.ok((await db.query('select * from feedback')).rowCount>0);
      await db.query('reset role');await db.query('set role anon');await rejected(()=>db.query('select * from feedback'),'42501');await rejected(()=>send(f,body(),db),'42501');
      await rejected(()=>db.query("insert into feedback(parent_id,request_id,product,text,source) values($1,$2,'other','test','/account')",[f.p,randomUUID()]),'42501');
      await db.query('reset role');await db.query('set role service_role');assert.equal(await send(f,body(),db),'saved');
      await rejected(()=>db.query("insert into feedback(parent_id,request_id,product,text,source) values($1,$2,'other','test','/account')",[f.p,randomUUID()]),'42501');
    } finally {await db.query('reset role');db.release();}
  });
  await test('production family and child triggers independently fence writes',async()=>{
    const f=await family(),b=body({child:null});await send(f,b);
    await pool.query('update parents set deletion_requested_at=clock_timestamp() where id=$1',[f.p]);
    await rejected(()=>pool.query("update feedback set status='read' where parent_id=$1",[f.p]),'55000');
    const g=await family();await send(g,body({child:g.c}));await pool.query('insert into child_deletions values($1,$2)',[g.c,g.p]);
    await rejected(()=>pool.query("update feedback set status='read' where parent_id=$1",[g.p]),'55000');
  });
  await test('child cascade removes child-scoped rows only; family cascade removes all remaining rows',async()=>{
    const f=await family();await send(f,body({child:f.c}));await send(f);await pool.query('delete from children where id=$1',[f.c]);assert.equal(await count(f.p),1);
    await pool.query('delete from parents where id=$1',[f.p]);assert.equal(await count(f.p),0);
  });
  const blockedOnLock = async pid => {
    const until=Date.now()+3000;
    while(Date.now()<until) {if((await pool.query("select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock'",[pid])).rowCount)return;await new Promise(r=>setTimeout(r,10));}
    throw Error('Concurrent path never waited on the parent lock');
  };
  await test('queued family deletion wins while feedback is waiting on the same parent lock',async()=>{
    const f=await family(),a=await pool.connect(),b=await pool.connect();
    try {await a.query('begin');await a.query('update parents set deletion_requested_at=clock_timestamp() where id=$1',[f.p]);
      const pid=(await b.query('select pg_backend_pid() p')).rows[0].p;const pending=send(f,body(),b);await blockedOnLock(pid);await a.query('commit');assert.equal(await pending,'family_unavailable');assert.equal(await count(f.p),0);
    } finally {await a.query('rollback');a.release();b.release();}
  });
  await test('feedback wins first; concurrent child deletion waits, cascades it, and no late feedback survives',async()=>{
    const f=await family(),a=await pool.connect(),b=await pool.connect();
    try {await a.query('begin');assert.equal(await send(f,body({child:f.c}),a),'saved');
      await b.query('begin');const pid=(await b.query('select pg_backend_pid() p')).rows[0].p;
      const locked=b.query('select 1 from parents where id=$1 for update',[f.p]);await blockedOnLock(pid);await a.query('commit');await locked;
      await b.query('insert into child_deletions values($1,$2)',[f.c,f.p]);await b.query('delete from children where id=$1',[f.c]);await b.query('commit');
      assert.equal(await count(f.p),0);assert.equal(await send(f,body({child:f.c})),'child_unavailable');
    } finally {await a.query('rollback');await b.query('rollback');a.release();b.release();}
  });
  console.log(`PARENT_FEEDBACK_SQL_PASS ${passed} cases; real PostgreSQL, production migration and fence bodies; synthetic identity/deletion tables`);
 } finally {
  if(pool)await pool.end();
  if(started)execFileSync(join(bin,'pg_ctl'),['-D',join(dir,'data'),'-m','fast','-w','stop'],{stdio:'ignore'});
  console.log('LOCAL_CLUSTER_STOPPED',dir);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
