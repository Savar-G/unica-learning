// Run after plan_controls.cjs --bootstrap on the repair-only disposable socket.
if(process.env.PD559_SOCKET!=='/tmp/pd-controls-bf76-pg')throw Error('Disposable repair socket required');
const {Client}=require('pg');const {readFileSync}=require('node:fs');const {randomUUID}=require('node:crypto');const assert=require('node:assert/strict');
const sql=n=>readFileSync(process.cwd()+'/supabase/migrations/'+n,'utf8');
const fn=(s,n)=>{const m=s.match(new RegExp('create(?: or replace)? function public\\.'+n+'\\([\\s\\S]*?\\$\\$;'));if(!m)throw Error(n);return m[0].replace(/^create function/,'create or replace function');};
const connect=async()=>{const d=new Client({host:'/tmp/pd-controls-bf76-pg',port:55629,database:process.env.PD559_DATABASE??'postgres',user:process.env.USER});await d.connect();await d.query("set statement_timeout='4s';set deadlock_timeout='100ms'");return d;};
(async()=>{const db=await connect();
await db.query(fn(sql('20261105_family_delete_hold.sql'),'begin_family_card_operation'));
await db.query(fn(sql('20261011_add_family_deletion.sql'),'end_family_card_operation'));
// Replace the reduced trigger with the exact production definitions. Restore matching-key recovery.
await db.query(fn(sql('20261105_child_delete.sql'),'child_delete_row_child'));
await db.query(fn(sql('20261105_child_delete_plan_recovery.sql'),'fence_child_delete_write'));
await db.query(fn(sql('20261105210902_plan_start_recovery_matching_key.sql'),'fence_plan_start_write'));
await db.query('create or replace trigger fence_family_write before insert or update on public.plan_starts for each row execute function public.fence_plan_start_write()');
await db.query('create or replace trigger fence_child_delete_write before insert or update on public.plan_starts for each row execute function public.fence_child_delete_write()');
await db.query(fn(sql('20261105204651_plan_start_deletion_recovery.sql'),'finish_plan_start'));
for(const t of ['workbooks','workbook_runs','child_card_updates']){
 await db.query(`create or replace trigger fence_child_delete_write before insert or update on public.${t} for each row execute function public.fence_child_delete_write()`);
 await db.query(`create or replace trigger fence_family_write before insert or update on public.${t} for each row execute function public.fence_family_write()`);
}

await db.query(`alter table workbooks add column if not exists printed_at timestamptz,add column if not exists approved_at timestamptz,add column if not exists levels smallint[],add column if not exists pdf_path text,add column if not exists profile_build text;
alter table workbook_runs alter column id set default gen_random_uuid(),alter column status set default 'queued',add column if not exists lease uuid,add column if not exists heartbeat_at timestamptz,add column if not exists created_at timestamptz default now(),add column if not exists resumes int default 0,add column if not exists attempts int default 0,add column if not exists step text,add column if not exists started_at timestamptz,add column if not exists finished_at timestamptz,add column if not exists error text,add column if not exists max_attempts int,add column if not exists started_by uuid,add column if not exists started_by_email text;
create table if not exists workbook_drafts(id uuid primary key);
create table if not exists workbook_audit(parent_id uuid,child_id uuid,run_id uuid,draft_id uuid,workbook_id uuid,actor_id uuid,actor_email text,action text,detail jsonb);`);
await db.query(fn(sql('20261031_workbook_run_resume.sql'),'start_workbook_run'));
await db.query(fn(sql('20261102_workbook_ship_lock_order.sql'),'mark_workbook'));
await db.query(fn(sql('20261101_workbook_ship.sql'),'lock_printed_workbook'));
await db.query('create or replace trigger lock_printed_workbook before update on public.workbooks for each row execute function public.lock_printed_workbook()');
const rpc=async(n,a,d=db)=>(await d.query(`select public.${n}(${a.map((_,i)=>'$'+(i+1)).join(',')}) value`,a)).rows[0].value;
async function family(days=2){const p=randomUUID(),c=randomUUID(),k=randomUUID(),b=randomUUID();await db.query("insert into parents(id,time_zone) values($1,'America/Vancouver')",[p]);await db.query('insert into children(id,parent_id) values($1,$2)',[c,p]);await db.query('insert into card_setups values($1,$2,$3)',[k,p,c]);await db.query("insert into workbooks(id,parent_id,child_id,number,status,shipped_at) values($1,$2,$3,1,'shipped',now()-make_interval(days=>$4))",[b,p,c,days]);await db.query("insert into workbook_delivery_receipts values($1,$3,$2,now()-make_interval(days=>$4)+interval '1 day')",[b,p,c,days]);return {p,c,k,b};}
async function quote(f,weeks=2){const ctx=await rpc('plan_control_context',[f.p,f.k]);const today=(await db.query("select period::text from _maya_family_window($1,'day',now())",[f.p])).rows[0].period;return {location:{...ctx.family,province:ctx.province},weeks,year:+today.slice(0,4),today,used:0,bookId:f.b,shippedAt:ctx.book.shippedAt,deliveredAt:ctx.book.deliveredAt,targetNumber:2,kind:'trial',subscription:'sub-old',previousCharge:'2027-01-01T12:00:00Z',chargeAt:'2027-01-15T12:00:00Z',earliest:null,latest:null,late:false};}
let passed=0,failed=0;
async function test(name,run){try{await run();passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e.message);}}
await test('S1 legacy initial admission refuses an open paid Restart',async()=>{
 const f=await family();await rpc('admit_plan_start_terms',[f.k,1,'paid-'+f.k,'pm','restart',7999,'']);
 await assert.rejects(()=>rpc('admit_plan_start',[f.k,1,'trial-'+f.k,'pm']),e=>e.message==='restart_required');
 const row=(await db.query('select purpose,state,start_key from plan_starts where card_setup_id=$1',[f.k])).rows[0];assert.equal(row.state,'open');assert.equal(row.start_key,'paid-'+f.k);
});
await test('P2 refused Cancel preserves active state and invalidates the old revision',async()=>{
 const f=await family(),id=await rpc('admit_plan_cancel',[f.p,f.k]);
 const pending=await rpc('plan_control_context',[f.p,f.k]);assert.equal(pending.blocked,true);assert.equal(pending.cancelled,false);
 await assert.rejects(()=>rpc('start_workbook_run',[f.c,randomUUID(),'synthetic@invalid',3,360]),e=>e.message==='plan_control_pending');
 await rpc('finish_plan_control',[id,'refused']);const ctx=await rpc('plan_control_context',[f.p,f.k]);assert.equal(ctx.blocked,false);assert.equal(ctx.cancelled,false);assert.equal(ctx.revision,id);
 assert.equal((await rpc('start_workbook_run',[f.c,randomUUID(),'synthetic@invalid',3,360])).status,'started');
 await assert.rejects(()=>rpc('admit_plan_start_terms',[f.k,1,'stale-'+f.k,'pm','restart',7999,'']),e=>e.message==='stale_restart');
});
await test('P1 printed target cannot be skipped by public prepare or later shipment',async()=>{
 const f=await family(),b2=randomUUID(),b3=randomUUID();
 await db.query("insert into workbooks(id,parent_id,child_id,number,status) values($1,$2,$3,2,'printed'),($4,$2,$3,3,'printed')",[b2,f.p,f.c,b3]);
 const op=await rpc('admit_plan_pause',[f.p,f.k,'prepared',await quote(f)]);await rpc('finish_plan_control',[op.id,'applied']);
 for(const book of [b2,b3])await assert.rejects(()=>rpc('mark_workbook',[book,'shipped',randomUUID(),'synthetic@invalid']),e=>e.message==='plan_paused');
 await assert.rejects(()=>rpc('start_workbook_run',[f.c,randomUUID(),'synthetic@invalid',3,360]),e=>e.message==='plan_paused');
 assert.equal((await db.query("select sum(weeks)::int n from plan_control_operations where child_id=$1 and state='applied'",[f.c])).rows[0].n,2);
});
await test('the promised mailing day satisfies an obligation once without returning allowance',async()=>{
 const f=await family(60),op=await rpc('admit_plan_pause',[f.p,f.k,'elapsed',{...await quote(f),targetNumber:3,late:true}]);await rpc('finish_plan_control',[op.id,'applied']);
 const b2=randomUUID(),b3=randomUUID();
 await db.query("insert into workbooks(id,parent_id,child_id,number,status,shipped_at) values($1,$2,$3,2,'shipped',now()-interval '28 days')",[b2,f.p,f.c]);
 await db.query("insert into workbooks(id,parent_id,child_id,number,status) values($1,$2,$3,3,'printed')",[b3,f.p,f.c]);
 assert.equal(await rpc('plan_mailing_weeks',[f.p,f.c,3]),2);
 assert.equal((await rpc('mark_workbook',[b3,'shipped',randomUUID(),'synthetic@invalid'])).status,'marked');
 assert.equal(await rpc('plan_mailing_weeks',[f.p,f.c,4]),0);
 assert.equal((await rpc('start_workbook_run',[f.c,randomUUID(),'synthetic@invalid',3,360])).status,'started');
 assert.equal((await db.query("select sum(weeks)::int n from plan_control_operations where child_id=$1 and state='applied'",[f.c])).rows[0].n,2);
});
await test('P3 dated eight-week late pause retires on paid Restart and retains allowance',async()=>{
 const f=await family(100),q={...await quote(f,8),targetNumber:3,late:true};
 const op=await rpc('admit_plan_pause',[f.p,f.k,'historic-valid',q]);await rpc('finish_plan_control',[op.id,'applied']);
 await db.query("update plan_control_operations set created_at=now()-interval '90 days',finished_at=now()-interval '90 days',quote=quote||jsonb_build_object('today',((now()-interval '90 days') at time zone 'America/Vancouver')::date::text,'previousCharge',now()-interval '69 days','chargeAt',now()-interval '13 days') where id=$1",[op.id]);
 // Provider-ended plan: there need not be a local cancellation record.
 await rpc('admit_plan_start_terms',[f.k,1,'paid-'+f.k,'pm','restart',7999,op.id]);await rpc('finish_plan_start',[f.k,1,'started','new-paid',null,false]);
 const run=await rpc('start_workbook_run',[f.c,randomUUID(),'synthetic@invalid',3,360]);assert.equal(run.status,'started');
 const b2=randomUUID();await db.query("insert into workbooks(id,parent_id,child_id,number,status) values($1,$2,$3,2,'printed')",[b2,f.p,f.c]);await rpc('mark_workbook',[b2,'shipped',randomUUID(),'synthetic@invalid']);await db.query("update workbook_runs set status='done' where id=$1",[run.run]);
 assert.equal((await rpc('start_workbook_run',[f.c,randomUUID(),'synthetic@invalid',3,360])).status,'started');
 const ctx=await rpc('plan_control_context',[f.p,f.k]);assert.equal(ctx.pauses.reduce((n,p)=>n+p.weeks,0),8);
 assert.equal(await rpc('plan_mailing_weeks',[f.p,f.c,3]),0);
});
await test('matching paid recovery after family fence closes without a workbook request',async()=>{
 const f=await family();await rpc('admit_plan_start_terms',[f.k,1,'recover-'+f.k,'pm','restart',7999,'']);await db.query('update parents set deletion_requested_at=now() where id=$1',[f.p]);
 assert.equal(await rpc('finish_plan_start',[f.k,1,'started','matching-sub',null,false]),true);
 assert.equal((await db.query('select count(*)::int n from workbook_restart_requests where child_id=$1',[f.c])).rows[0].n,0);
});
// Simultaneous public Pause admission and mark_workbook. The first holder wins. Use exact production trigger bodies.
for(const first of ['pause','ship'])await test('concurrent Pause/public shipment: '+first+' first',async()=>{
 const f=await family(),b2=randomUUID(),other=await connect();await db.query("insert into workbooks(id,parent_id,child_id,number,status) values($1,$2,$3,2,'printed')",[b2,f.p,f.c]);const q=await quote(f);
 try{await db.query('begin');
 if(first==='pause'){
  const o=await rpc('admit_plan_pause',[f.p,f.k,'simultaneous',q]);
  const ship=rpc('mark_workbook',[b2,'shipped',randomUUID(),'synthetic@invalid'],other);const checked=assert.rejects(()=>ship,e=>e.message==='plan_control_pending');await db.query('commit');await checked;assert(o.send);
 }else{
  const shipped=await rpc('mark_workbook',[b2,'shipped',randomUUID(),'synthetic@invalid']);
  const pause=rpc('admit_plan_pause',[f.p,f.k,'stale-ship',q],other);await db.query('commit');assert.equal(await pause,null);assert.equal(shipped.status,'marked');
 }

 }finally{await other.end();}
});
for(const first of ['pause','prepare'])await test('concurrent Pause/public prepare with printed target: '+first+' first',async()=>{
 const f=await family(),b2=randomUUID(),other=await connect();await db.query("insert into workbooks(id,parent_id,child_id,number,status) values($1,$2,$3,2,'printed')",[b2,f.p,f.c]);const q=await quote(f);
 try{
  await db.query('begin');
  if(first==='pause'){
   const op=await rpc('admit_plan_pause',[f.p,f.k,'race-prepare',q]);
   const prepare=rpc('start_workbook_run',[f.c,randomUUID(),'synthetic@invalid',3,360],other);
   const checked=assert.rejects(()=>prepare,e=>e.message==='plan_control_pending');await db.query('commit');await checked;await rpc('finish_plan_control',[op.id,'applied']);
  }else{
   assert.equal((await rpc('start_workbook_run',[f.c,randomUUID(),'synthetic@invalid',3,360])).status,'started');
   const pause=rpc('admit_plan_pause',[f.p,f.k,'race-prepare',q],other);await db.query('commit');const op=await pause;assert(op.send);await rpc('finish_plan_control',[op.id,'applied']);
  }
  await assert.rejects(()=>rpc('mark_workbook',[b2,'shipped',randomUUID(),'synthetic@invalid']),e=>e.message==='plan_paused');
 }finally{await db.query('rollback');await other.end();}
});
await test('a refused repeat Cancel preserves the prior confirmed cancelled state',async()=>{
 const f=await family(),id=await rpc('admit_plan_cancel',[f.p,f.k]);await rpc('finish_plan_control',[id,'applied']);
 const retry=await rpc('admit_plan_cancel',[f.p,f.k]);await rpc('finish_plan_control',[retry,'refused']);
 assert.equal((await rpc('plan_control_context',[f.p,f.k])).cancelled,true);
 await assert.rejects(()=>rpc('start_workbook_run',[f.c,randomUUID(),'synthetic@invalid',3,360]),e=>e.message==='plan_cancelled');
});
await test('mailing helper is private, the ownership-filtered read is service only',async()=>{
 for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,'plan_mailing_obligations(uuid,integer)','EXECUTE') v",[role])).rows[0].v,false);
 for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'plan_mailing_weeks(uuid,uuid,integer)','EXECUTE') v",[role])).rows[0].v,false);
 assert.equal((await db.query("select has_function_privilege('service_role','plan_mailing_weeks(uuid,uuid,integer)','EXECUTE') v")).rows[0].v,true);
 const f=await family(),op=await rpc('admit_plan_pause',[f.p,f.k,'private',await quote(f)]);await rpc('finish_plan_control',[op.id,'applied']);assert.equal(await rpc('plan_mailing_weeks',[randomUUID(),f.c,2]),0);
});
// Cross-check the parent-first admin lock from the already merged, fixed PR656 object.
// The repair base predates that migration. Read the exact cached commit; do not fetch or merge it here.
await db.query(`create or replace function public.is_admin() returns boolean language sql as $$select true$$;
create or replace function auth.uid() returns uuid language sql as $$select '${randomUUID()}'::uuid$$;
create table if not exists test_accounts(parent_id uuid primary key references parents(id) on delete cascade,marked_by uuid);
create table if not exists maya_chat_families(parent_id uuid primary key references parents(id) on delete cascade,added_by uuid,rehearsal boolean default false);`);
const adminSql=require('node:child_process').execFileSync('git',['show','bf59c33ae127c2f45d72e24efbfcd757e4b01778:supabase/migrations/20261105211718_maya_admin_lock_order.sql'],{encoding:'utf8'});
await db.query(fn(adminSql,'admin_set_test_account'));
for(const first of ['admin','pause'])await test('PR656 parent-first admin/Pause locks: '+first+' first',async()=>{
 const f=await family(),other=await connect(),q=await quote(f);
 try{await db.query('begin');
  if(first==='admin'){
   await rpc('admin_set_test_account',[f.p,true]);const pause=rpc('admit_plan_pause',[f.p,f.k,'admin-race',q],other);await db.query('commit');assert((await pause).send);
  }else{
   const op=await rpc('admit_plan_pause',[f.p,f.k,'admin-race',q]);const admin=rpc('admin_set_test_account',[f.p,true],other);await db.query('commit');await admin;assert(op.send);
  }
 }finally{await db.query('rollback');await other.end();}
});
console.log('PLAN_CONTROLS_REPAIRS',JSON.stringify({passed,failed}));await db.end();if(failed)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1;});
