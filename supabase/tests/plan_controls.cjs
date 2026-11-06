// Disposable local PostgreSQL only. No hosted URL, password or provider key.
const {Client}=require('pg');
const {readFileSync}=require('node:fs');
const {randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
if(!['/tmp/pd559-postgres','/tmp/pd-controls-bf76-pg'].includes(process.env.PD559_SOCKET)) throw Error('Disposable socket required');
const database=process.env.PD559_DATABASE??'postgres';
if(database!=='postgres'&&!/^pd559_[a-z_]+$/.test(database))throw Error('Disposable database required');
const connect=async()=>{const db=new Client({host:process.env.PD559_SOCKET,port:process.env.PD559_SOCKET==='/tmp/pd-controls-bf76-pg'?55629:55559,database,user:process.env.USER});await db.connect();await db.query("set statement_timeout='5s'");return db;};
const sql=name=>readFileSync('supabase/migrations/'+name,'utf8');
const functionSql=(source,name)=>{const m=source.match(new RegExp('create(?: or replace)? function public\\.'+name+'\\([\\s\\S]*?\\$\\$;'));if(!m)throw Error(name);return m[0];};
(async()=>{
const db=await connect();
if(process.argv.includes('--bootstrap')) {
 for(const role of ['anon','authenticated','service_role']) if(!(await db.query('select 1 from pg_roles where rolname=$1',[role])).rowCount)await db.query('create role '+role);
 await db.query(`create schema auth;
 create function public.is_admin() returns boolean language sql as $$select false$$;
 create function auth.uid() returns uuid language sql as $$select null::uuid$$;
 create table parents(id uuid primary key,time_zone text,postal text,deletion_requested_at timestamptz);
 create table children(id uuid primary key,parent_id uuid references parents(id) on delete cascade,created_at timestamptz default now(),province text default 'BC',unique(id,parent_id));
 create table card_setups(id uuid primary key,parent_id uuid references parents(id) on delete cascade,child_id uuid references children(id) on delete cascade);
 create table child_card_updates(child_id uuid primary key references children(id) on delete cascade,parent_id uuid);
 create table child_deletions(child_id uuid primary key,parent_id uuid);
 create table family_deletions(parent_id uuid primary key,phase text);
 create table family_delete_holds(parent_id uuid primary key,lease_until timestamptz);
 create table family_card_operations(id uuid primary key,parent_id uuid references parents(id) on delete cascade);
 create table workbooks(id uuid primary key,parent_id uuid,child_id uuid references children(id) on delete cascade,number int,status text,shipped_at timestamptz);
 create table workbook_runs(id uuid primary key,parent_id uuid,child_id uuid references children(id) on delete cascade,number int,status text);
 create table workbook_delivery_receipts(workbook_id uuid,child_id uuid,parent_id uuid,delivered_at timestamptz);
 create table workbook_delivery_corrections(workbook_id uuid,audit_id int,delivered_at timestamptz);
 create table child_plan_states(kind text constraint child_plan_states_kind_check check(kind in ('paying')));
 `);
 const family=sql('20261011_add_family_deletion.sql');
 await db.query(functionSql(family,'assert_family_writable'));
 await db.query(functionSql(family,'fence_family_write'));
 await db.query(`create function public.fence_child_delete_write() returns trigger language plpgsql set search_path='' as $$ begin if exists(select 1 from public.child_deletions where child_id=new.child_id) then raise exception 'child_unavailable' using errcode='55000';end if;return new;end $$;`);
 const zones=sql('20261102164821_maya_window_zones.sql');
 for(const name of ['_maya_normalize_zone','_maya_period_window','_maya_family_window']) await db.query(functionSql(zones,name));
 await db.query(functionSql(sql('20261102172026_supported_family_zones.sql'),'_maya_zone_at'));
 const starts=sql('20261105_plan_starts.sql');
 await db.query(starts.match(/create table public\.plan_starts \([\s\S]*?\n\);/)[0]);
 await db.query(functionSql(starts,'finish_plan_start'));
 await db.query(sql('20261105234500_plan_controls.sql'));
}
if(process.argv.includes('--refresh')) {
 const source=sql('20261105234500_plan_controls.sql');
 await db.query('alter table plan_control_operations add column if not exists mailing_retired_at timestamptz');
 for(const name of ['plan_control_context','admit_plan_pause','finish_plan_control','admit_plan_cancel','admit_plan_start_terms','record_paid_restart','plan_mailing_obligations','plan_mailing_weeks','assert_plan_workbook_allowed','fence_plan_workbook','admit_plan_start']) await db.query(functionSql(source,name).replace(/^create function/,'create or replace function'));
 await db.query(source.slice(source.indexOf('do $$ declare f record;'),source.indexOf('alter table public.child_plan_states')));
}
async function family(){const p=randomUUID(),c=randomUUID(),s=randomUUID(),k=randomUUID(),b=randomUUID();
 await db.query("insert into parents(id,time_zone) values($1,'America/Vancouver')",[p]);
 await db.query('insert into children(id,parent_id) values($1,$3),($2,$3)',[c,s,p]);
 await db.query('insert into card_setups values($1,$2,$3)',[k,p,c]);
 await db.query("insert into workbooks values($1,$2,$3,1,'shipped',now()-interval '2 days')",[b,p,c]);
 await db.query("insert into workbook_delivery_receipts values($1,$3,$2,now()-interval '1 day')",[b,p,c]);return {p,c,s,k,b};}
const rpc=async(name,args,conn=db)=>(await conn.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
async function quote(f,weeks=2){const ctx=await rpc('plan_control_context',[f.p,f.k]);const today=(await db.query("select period::text from _maya_family_window($1,'day',now())",[f.p])).rows[0].period;return {location:{...ctx.family,province:ctx.province},weeks,year:+today.slice(0,4),today,used:0,bookId:f.b,shippedAt:ctx.book.shippedAt,deliveredAt:ctx.book.deliveredAt,targetNumber:2,kind:'trial',subscription:'sub',previousCharge:'2027-01-01T12:00:00Z',chargeAt:'2027-01-15T12:00:00Z',earliest:null,latest:null,late:false};}
let passed=0;
async function test(name,run){await run();passed++;console.log('PASS',name);}
await test('service-only grants and private helpers',async()=>{
 for(const role of ['anon','authenticated']) for(const fn of ['admit_plan_pause(uuid,uuid,text,jsonb)','admit_plan_cancel(uuid,uuid)','plan_start_terms(uuid,integer)']) assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') v',[role,fn])).rows[0].v,false);
 assert.equal((await db.query("select has_function_privilege('service_role','plan_control_owner(uuid,uuid)','EXECUTE') v")).rows[0].v,false);
});
await test('simultaneous duplicate quota admission sends once and holds deletion without expiry',async()=>{
 const f=await family(),q=await quote(f), other=await connect();
 try{const result=await Promise.all([rpc('admit_plan_pause',[f.p,f.k,'token',q]),rpc('admit_plan_pause',[f.p,f.k,'token',q],other)]);assert.equal(result.filter(r=>r.send).length,1);assert.equal(result[0].id,result[1].id);
 assert.equal(await rpc('admit_plan_cancel',[f.p,f.k]),null);
 assert.equal((await db.query('select count(*)::int n from family_card_operations where parent_id=$1',[f.p])).rows[0].n,1);
 await rpc('finish_plan_control',[result[0].id,'applied']);
 assert.equal((await db.query('select sum(weeks)::int n from plan_control_operations where child_id=$1',[f.c])).rows[0].n,2);
 assert.equal((await db.query('select count(*)::int n from family_card_operations where parent_id=$1',[f.p])).rows[0].n,0);
 }finally{await other.end();}
});
await test('different concurrent requests cannot overspend eight weeks',async()=>{
 const f=await family(),q=await quote(f,5),other=await connect();
 try{const r=await Promise.all([rpc('admit_plan_pause',[f.p,f.k,'a',q]),rpc('admit_plan_pause',[f.p,f.k,'b',{...q,weeks:4}],other)]);assert.equal(r.filter(Boolean).length,1);assert.equal((await db.query('select count(*)::int n from plan_control_operations where child_id=$1',[f.c])).rows[0].n,1);}finally{await other.end();}
});
await test('foreign card, stale book, stale year and cutoff cannot admit',async()=>{
 const f=await family(),q=await quote(f);const foreign=await family();assert.equal(await rpc('admit_plan_pause',[foreign.p,f.k,'foreign',q]),null);
 for(const change of [{bookId:randomUUID()},{year:q.year-1},{targetNumber:3},{weeks:9}]) assert.equal(await rpc('admit_plan_pause',[f.p,f.k,randomUUID(),{...q,...change}]),null);
});
await test('early pause blocks prepare and shipment, sibling remains writable',async()=>{
 const f=await family(),q=await quote(f),o=await rpc('admit_plan_pause',[f.p,f.k,'early',q]);await rpc('finish_plan_control',[o.id,'applied']);
 await assert.rejects(()=>db.query("insert into workbook_runs values($1,$2,$3,2,'queued')",[randomUUID(),f.p,f.c]),e=>e.code==='55000');
 await db.query("insert into workbooks values($1,$2,$3,2,'printed',null)",[randomUUID(),f.p,f.c]);
 await assert.rejects(()=>db.query("update workbooks set status='shipped',shipped_at=now() where child_id=$1 and number=2",[f.c]),e=>e.code==='55000');
 await db.query("insert into workbook_runs values($1,$2,$3,1,'queued')",[randomUUID(),f.p,f.s]);
});
await test('late pause leaves next shipment unchanged and binds the following book',async()=>{
 const f=await family();await db.query("update workbooks set shipped_at=now()-interval '10 days' where id=$1",[f.b]);const q={...await quote(f),targetNumber:3,late:true};const o=await rpc('admit_plan_pause',[f.p,f.k,'late',q]);assert(o);await rpc('finish_plan_control',[o.id,'applied']);
 await db.query("insert into workbooks values($1,$2,$3,2,'shipped',now())",[randomUUID(),f.p,f.c]);
 await assert.rejects(()=>db.query("insert into workbook_runs values($1,$2,$3,3,'queued')",[randomUUID(),f.p,f.c]),e=>e.code==='55000');
});
await test('cancel serializes with new starts and rejects a stale Restart revision',async()=>{
 const f=await family(),id=await rpc('admit_plan_cancel',[f.p,f.k]);assert(id);
 await assert.rejects(()=>rpc('admit_plan_start_terms',[f.k,1,f.k+'-key','pm','restart',7999,'']),e=>e.code==='55000');
 await rpc('finish_plan_control',[id,'applied']);
 await assert.rejects(()=>rpc('admit_plan_start_terms',[f.k,1,f.k+'-key','pm','restart',7999,'']),e=>e.code==='55000');
 const start=await rpc('admit_plan_start_terms',[f.k,1,f.k+'-key','pm','restart',7999,id]);assert.equal(start.purpose,'restart');
 assert.equal(await rpc('admit_plan_cancel',[f.p,f.k]),null);
 await rpc('finish_plan_start',[f.k,1,'started','sub',null,false]);
 assert.equal((await db.query('select count(*)::int n from workbook_restart_requests where child_id=$1 and run_id is null',[f.c])).rows[0].n,1);
 await db.query("insert into workbook_runs values($1,$2,$3,2,'queued')",[randomUUID(),f.p,f.c]);
 assert.equal((await db.query('select count(*)::int n from workbook_restart_requests where child_id=$1 and run_id is null',[f.c])).rows[0].n,0);
});
await test('initial successful history cannot receive another initial free month, refused initial retries keep their terms',async()=>{
 const f=await family(),a=await rpc('admit_plan_start_terms',[f.k,1,f.k+'-a','pm','initial',7999,'']);
 await assert.rejects(()=>rpc('admit_plan_start_terms',[f.k,1,f.k+'-b','pm_other','restart',5999,'']),e=>e.message==='restart_required');
 const b=await rpc('admit_plan_start_terms',[f.k,1,f.k+'-b','pm_other','initial',5999,'']);assert.equal(a.key,b.key);assert.equal(b.purpose,'initial');assert.equal(b.monthly_cents,7999);
 await rpc('finish_plan_start',[f.k,1,'refused',null,null,false]);const retry=await rpc('admit_plan_start_terms',[f.k,2,f.k+'-b','pm','initial',7999,'']);assert.equal(retry.generation,2);
 await rpc('finish_plan_start',[f.k,2,'started','sub',null,false]);await assert.rejects(()=>rpc('admit_plan_start',[f.k,3,f.k+'-c','pm']),e=>e.code==='55000');
});
await test('pending controls refuse the real family deletion check, and child/family fences refuse new controls',async()=>{
 await db.query('create table if not exists public.admin_users(user_id uuid)');
 await db.query(functionSql(sql('20261105_plan_start_holds_deletion.sql'),'family_plan_start_open').replace(/^create function/,'create or replace function'));
 await db.query(functionSql(sql('20261105_plan_start_holds_deletion.sql'),'check_parent_family_deletion'));
 const f=await family(),q=await quote(f);await rpc('admit_plan_pause',[f.p,f.k,'open',q]);
 assert.equal(await rpc('check_parent_family_deletion',[f.p]),'busy');
 const child=await family();await db.query('insert into child_deletions values($1,$2)',[child.c,child.p]);
 await assert.rejects(()=>rpc('admit_plan_cancel',[child.p,child.k]),e=>e.code==='55000');
 const deleted=await family();await db.query('update parents set deletion_requested_at=now() where id=$1',[deleted.p]);
 await assert.rejects(()=>rpc('admit_plan_pause',[deleted.p,deleted.k,'fenced',q]),e=>e.code==='55000');
});
await test('Pause and Cancel run concurrently under the same child lock',async()=>{
 const f=await family(),q=await quote(f),other=await connect();
 try {
  await db.query('begin');const o=await rpc('admit_plan_pause',[f.p,f.k,'race',q]);
  const cancel=rpc('admit_plan_cancel',[f.p,f.k],other);
  await db.query('commit');assert.equal(await cancel,null);assert(o.send);
 } finally {await other.end();}
});
await test('family deletion wins its lock before a concurrent Pause admission',async()=>{
 const f=await family(),q=await quote(f),other=await connect();
 try {
  await db.query('begin');await db.query('update parents set deletion_requested_at=now() where id=$1',[f.p]);
  const admission=rpc('admit_plan_pause',[f.p,f.k,'delete-race',q],other);
  const refused=assert.rejects(()=>admission,e=>e.code==='55000');
  await db.query('commit');await refused;
  assert.equal((await db.query('select count(*)::int n from plan_control_operations where child_id=$1',[f.c])).rows[0].n,0);
 } finally {await other.end();}
});
await test('a changed family location invalidates the quote before a provider call',async()=>{
 const f=await family(),q=await quote(f);await db.query("update parents set time_zone='America/Toronto' where id=$1",[f.p]);
 assert.equal(await rpc('admit_plan_pause',[f.p,f.k,'location',q]),null);
});
console.log('PLAN_CONTROLS_PROBE_OK',passed);await db.end();
})().catch(e=>{console.error(e);process.exit(1);});
