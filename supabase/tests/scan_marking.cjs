// Synthetic, disposable Unix-socket PostgreSQL tests. Never accepts a URL, password or hosted connection.
const { Client } = require('pg');
const { readFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const path = require('node:path');
const socket = process.env.SCAN_MARKING_SOCKET;
if (!socket?.startsWith('/tmp/pd457-pg-')) throw Error('Disposable local socket required');
const database=process.env.SCAN_MARKING_DATABASE??'postgres';
if(database!=='postgres'&&!database.startsWith('pd457_'))throw Error('Disposable database required');
const root = path.resolve(__dirname,'../..');
const sql = name => readFileSync(path.join(root,'supabase/migrations',name),'utf8');
const open = async () => { const c = new Client({host:socket,database,user:process.env.USER});await c.connect();await c.query("set statement_timeout='8s'");return c; };
const call = async (c,action,f,token=null,data={}) => (await c.query('select scan_marking_command($1,$2,$3,$4,$5) v',[action,f?.p??null,f?.photo??null,token,data])).rows[0].v;
const copy = v => JSON.parse(JSON.stringify(v));
(async()=>{
 const db=await open();
 if(process.argv.includes('--bootstrap')) {
  for(const role of ['anon','authenticated','service_role']) if(!(await db.query('select 1 from pg_roles where rolname=$1',[role])).rowCount) await db.query(`create role ${role}${role==='service_role'?' bypassrls':''}`);
  await db.query(readFileSync(path.join(__dirname,'scan_marking_fixture.sql'),'utf8'));
  const family=sql('20261011_add_family_deletion.sql');
  for(const name of ['assert_family_writable','fence_family_write']) {const f=family.match(new RegExp('create function public\\.'+name+'\\([\\s\\S]*?end \\$\\$;'));assert(f);await db.query(f[0]);}
  await db.query(sql('20261029_add_learning_events.sql').replace('alter table public.children add constraint children_id_parent_key unique (id, parent_id);','').replace('alter table public.assessments add constraint assessments_id_child_key unique (id, child_id);',''));
  await db.query(sql('20261102_scan_page_photos.sql'));
  await db.query(sql('20261105_scan_crops.sql'));
  await db.query(sql('20261105_scan_stack.sql'));
  const child=sql('20261105_child_delete.sql');
  for(const name of ['child_delete_row_child']) {const f=child.match(new RegExp('create function public\\.'+name+'\\([\\s\\S]*?end \\$\\$;'));assert(f);await db.query(f[0]);}
  await db.query(sql('20261105_child_delete_plan_recovery.sql'));
  await db.query(sql('20261105_child_profile_skill_changes_from_tests.sql'));
  await db.query(sql('20261105_scan_marking.sql'));
 }
 let passed=0,failures=0;
 async function test(name,run){try{await run();passed++;console.log('PASS',name);}catch(e){failures++;console.log('FAIL',name,e.stack);}}
 async function fixture(p=null,c=null) {
  p??=randomUUID();c??=randomUUID();const w=randomUUID(),page=randomUUID(),photo=randomUUID(),cal=randomUUID();
  await db.query('insert into auth.users values($1) on conflict do nothing',[p]);await db.query('insert into parents values($1,null) on conflict do nothing',[p]);await db.query('insert into children values($1,$2) on conflict do nothing',[c,p]);
  await db.query("insert into workbooks(id,parent_id,child_id,status,printed_revision) values($1,$2,$3,'shipped','immutable')",[w,p,c]);
  await db.query("insert into workbook_pages(id,workbook_id,parent_id,page_number,print_contract,image_width,image_height) values($1,$2,$3,3,'{}',1000,1400)",[page,w,p]);
  await db.query("insert into workbook_questions(parent_id,workbook_id,page_id,question_number,package) values($1,$2,$3,1,'{\"id\":\"item1\"}')",[p,w,page]);
  await db.query("insert into scan_photos(id,parent_id,child_id,page_id,workbook_id,printed_revision,state,reserved_bytes,width,height,sent_at) values($1,$2,$3,$4,$5,'immutable','saved',0,1000,1400,now())",[photo,p,c,page,w]);
  await db.query("insert into scan_calibrations(photo_id,parent_id,printed_revision,state,lease_token,lease_until,result) values($1,$2,'immutable','ready',$3,now(),'{\"parts\":[\"straight\"]}')",[photo,p,cal]);
  const identity={workbookId:w,printedRevision:'immutable',pageId:page,itemId:'item1'};
  const expected={identity,number:1,method:'code',scoredRegions:['a'],mastery:{eligible:true,reason:null},teaching:{curriculum:{key:'bc',version:'v1'},part:'practice',slot:'1',practiceType:'now-you',itemStep:{unit:'U1',skill:'add',step:1}}};
  const observation={version:1,identity,evidence:{photoRevision:photo},readAnswerText:null,regions:[],certainty:'not-read',state:'pending',method:'code',result:null,teaching:expected.teaching,mastery:expected.mastery,help:'none',actor:'system',resultVersion:1};
  return {p,c,w,page,photo,cal,expected,observation,token:randomUUID(),hash:'fixed-frame'};
 }
 const claim = (f,c=db) => call(c,'claim',f,f.token,{hash:f.hash,items:[{expected:f.expected,observation:f.observation}]});
 async function extraction(f,result='right',c=db) {
  const o={...copy(f.observation),state:'scored',result,readAnswerText:result==='blank'?'':'56',certainty:'certain',regions:[{regionId:'a',text:result==='blank'?'':'56',value:result==='blank'?null:'56',certainty:'certain'}]};
  assert.equal(await call(c,'extract',f,f.token,{observations:[o],model:'anthropic/claude-sonnet-5.5',prompt:'whole-page-numbers-v1'}),true);
  return o;
 }
 function event(f,result='right') {return {key:`marking:${f.w}:immutable:${f.page}:item1`,parentId:f.p,childId:f.c,source:'marking',question:{source:'workbook',workbookId:f.w,page:3,question:1},skill:{standard:'2.4',skills:[]},result,stuckStep:null,mistake:null,hints:0,timeMs:null,occurredAt:new Date().toISOString(),evidence:{kind:'scan',id:f.photo}};}
 const apply = (f,result='right',c=db) => call(c,'apply',f,f.token,{events:[event(f,result)],at:new Date().toISOString()});
 async function price(max=10000) {await db.query("update scan_marking_prices set enabled=true,maximum_micros=$1,verified_at=now(),evidence='synthetic verified bound, not production pricing'",[max]);}
 const budget = () => db.query('delete from scan_marking_dispatches').then(()=>db.query('delete from scan_marking_spend'));
 const reserve = (f,c=db,model='anthropic/claude-sonnet-5.5') => call(c,'admit',f,f.token,{model,evaluation:model.includes('haiku')?'approved-fixed-set':undefined});
 const rows = f => call(db,'effective',{p:f.p},null,{child:f.c});
 async function waitLock(c){for(let n=0;n<500;n++){const r=await db.query('select wait_event_type from pg_stat_activity where pid=$1',[c.processID]);if(r.rows[0]?.wait_event_type==='Lock')return;}throw Error('no database lock wait observed');}
 await test('defaults fail closed before dispatch and RPC/table grants exclude all browser roles',async()=>{
  const f=await fixture();await claim(f);assert.equal(await reserve(f),'price-unverified');
  for(const role of ['anon','authenticated']) {
   await db.query('set role '+role);
   try {await assert.rejects(()=>call(db,'admit',f,f.token,{model:'anthropic/claude-sonnet-5.5'}),e=>e.code==='42501');await assert.rejects(()=>db.query('select * from scan_marking_items'),e=>e.code==='42501');} finally {await db.query('reset role');}
  }
  assert.equal((await db.query('select count(*)::int n from scan_marking_spend')).rows[0].n,0);
 });
 await test('two simultaneous connections serialize one active family/page job and one canonical original',async()=>{
  const f=await fixture(),a=await open(),b=await open();
  try {await a.query('begin');const first=await claim(f,a);assert.equal(first.items.length,1);const pending=claim({...f,token:randomUUID()},b);await waitLock(b);await a.query('commit');assert.equal(await pending,'busy');assert.equal((await rows(f)).length,1);}finally{await a.query('rollback');await a.end();await b.end();}
 });
 await test('version compare-and-set protects a parent change from an already extracted response',async()=>{
  const f=await fixture();await claim(f);await extraction(f);
  await db.query("update scan_marking_items set result_version=2,observation=jsonb_set(jsonb_set(jsonb_set(observation,'{resultVersion}','2'),'{actor}','\"parent\"'),'{result}','\"wrong\"') where page_id=$1",[f.page]);
  assert.equal(await apply(f),true);const [m]=await rows(f);assert.equal(m.result_version,2);assert.equal(m.observation.result,'wrong');assert.equal(m.original_event,null);
 });
 await test('retake resolves pending only, finalized original and its reading survive image expiry',async()=>{
  const f=await fixture();await claim(f);await extraction(f,'wrong');assert.equal(await apply(f,'wrong'),true);await call(db,'finish',f,f.token);
  const before=await rows(f);await db.query("update scan_photos set state='expired',terminal_at=now() where id=$1",[f.photo]);
  assert.deepEqual(await rows(f),before);assert.equal(before[0].observation.readAnswerText,'56');assert.equal(await reserve(f),'terminal');
  const next=randomUUID();await db.query("insert into scan_photos(id,parent_id,child_id,page_id,workbook_id,printed_revision,state,reserved_bytes,width,height,sent_at) values($1,$2,$3,$4,$5,'immutable','saved',0,1000,1400,now())",[next,f.p,f.c,f.page,f.w]);
  await db.query("insert into scan_calibrations(photo_id,parent_id,printed_revision,state,lease_token,lease_until,result) values($1,$2,'immutable','ready',$3,now(),'{\"parts\":[\"straight\"]}')",[next,f.p,randomUUID()]);
  const retake={...f,photo:next,token:randomUUID()};await claim(retake);await extraction(retake,'right');await apply(retake,'right');assert.deepEqual(await rows(f),before);
 });
 await test('old lease cannot overwrite newer photo; extraction is durable and takeover sends no additional request',async()=>{
  const f=await fixture();await claim(f);await extraction(f,'wrong');await db.query("update scan_marking_jobs set lease_until=now()-interval '1 second' where photo_id=$1",[f.photo]);
  const replacement={...f,token:randomUUID()};const j=await claim(replacement);assert.equal(j.extraction[0].result,'wrong');assert.equal(await apply(f),'terminal');assert.equal(await apply(replacement,'wrong'),true);
  assert.equal((await db.query('select dispatches from scan_marking_jobs where photo_id=$1',[f.photo])).rows[0].dispatches,0);
 });
 await test('delete and clock expiry independently refuse held results, retries and late derivative writes',async()=>{
  for(const kind of ['deleted','expired']) {
   const f=await fixture();await claim(f);await extraction(f);if(kind==='expired')await db.query("update scan_photos set expires_at=now()-interval '1 second' where id=$1",[f.photo]);else await db.query("select change_scan_photo($1,$2,'delete')",[f.p,f.photo]);
   assert.equal(await apply(f),'terminal');assert.equal(await reserve(f),'terminal');assert.equal(await claim(f),'terminal');
   await assert.rejects(()=>db.query("insert into storage.objects(bucket_id,name) values('scan-photos',$1)",[`${f.p}/${f.photo}/${f.cal}-crop-1.jpg`]),e=>e.code==='P0001');assert.equal((await rows(f))[0].original_event,null);
  }
 });
 await test('global 49.99 budget across families and models admits one concurrently; unknown holds survive restart and rollover',async()=>{
  await budget();await price();const f=await fixture(),g=await fixture();await claim(f);await claim(g);
  await db.query("insert into scan_marking_spend(period,model,reserved_micros,charged_micros) values(date_trunc('month',now() at time zone 'UTC')::date,'anthropic/claude-sonnet-5.5',49990000,49990000)");
  const a=await open(),b=await open();try {
   await a.query('begin');const first=await reserve(f,a);assert(first.dispatch);const pending=reserve(g,b,'anthropic/claude-haiku-5.5');await waitLock(b);await a.query('commit');assert.equal(await pending,'budget');
   assert.equal(await call(db,'settle',null,first.dispatch,{cost:null}),true);assert.equal(await reserve(g),'budget');
   await db.query("update scan_marking_spend set period=(date_trunc('month',now() at time zone 'UTC')-interval '1 month')::date");const next=await reserve(g);assert(next.dispatch);assert.equal(await call(db,'settle',null,first.dispatch,{cost:2000}),true);
   assert.equal((await db.query('select charged_micros from scan_marking_spend where id=$1',[first.dispatch])).rows[0].charged_micros,'2000');
  }finally{await a.query('rollback');await a.end();await b.end();}
 });
 await test('two transport attempts are the total job limit; cost reconciliation cannot release unknown or exceed maximum',async()=>{
  await budget();const f=await fixture();await claim(f);const a=await reserve(f),b=await reserve(f);assert(a.dispatch&&b.dispatch);assert.equal(await reserve(f),'attempts');
  assert.equal(await call(db,'settle',null,a.dispatch,{cost:10001}),false);assert.equal(await call(db,'settle',null,a.dispatch,{cost:null}),true);assert.equal((await db.query('select charged_micros from scan_marking_spend where id=$1',[a.dispatch])).rows[0].charged_micros,null);
  await db.query("update scan_marking_jobs set lease_until=now()-interval '1 second' where photo_id=$1",[f.photo]);f.token=randomUUID();await claim(f);assert.equal(await reserve(f),'attempts');
 });
 await test('family freeze and one-child request fence every job/result write, while anonymous provider outcomes remain reconcilable',async()=>{
  await budget();for(const mode of ['family','child']) {
   const f=await fixture();await claim(f);const d=await reserve(f);assert(d.dispatch);await extraction(f);
   if(mode==='family')await db.query('update parents set deletion_requested_at=now() where id=$1',[f.p]);else await db.query('insert into child_deletions values($1,$2)',[f.c,f.p]);
   if(mode==='family')await assert.rejects(()=>apply(f),e=>e.code==='55000');else assert.equal(await apply(f),'terminal');
   assert.equal(await call(db,'settle',null,d.dispatch,{cost:1000}),true);
   await assert.rejects(()=>db.query("update scan_marking_jobs set model='late' where photo_id=$1",[f.photo]),e=>e.code==='55000');
  }
 });
 await test('durable event intent publishes once and published child/family deletion has no cross-cascade restoration',async()=>{
  const f=await fixture();await claim(f);await extraction(f,'wrong');await apply(f,'wrong');const [m]=await rows(f), ev=m.original_event;
  const published=await db.query(`insert into learning_events(idempotency_key,parent_id,child_id,source,question_source,workbook_id,workbook_page,workbook_question,skill_standard,skills,result,hints,time_ms,occurred_at,evidence_kind,evidence_id)
    values($1,$2,$3,'marking','workbook',$4,3,1,'2.4','{}','wrong',0,null,$5,'scan',$6) returning id`,[ev.key,f.p,f.c,f.w,ev.occurredAt,f.photo]);
  assert.equal(await call(db,'ack',{p:f.p},null,{child:f.c,item:m.id,event:published.rows[0].id}),true);
  assert.equal(await call(db,'ack',{p:f.p},null,{child:f.c,item:m.id,event:published.rows[0].id}),true);
  assert.equal((await call(db,'outbox',{p:f.p},null,{child:f.c})).length,0);
  await db.query('delete from children where id=$1',[f.c]);
  assert.equal((await db.query('select count(*)::int n from learning_events where child_id=$1',[f.c])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from scan_marking_items where child_id=$1',[f.c])).rows[0].n,0);
 });
 await test('child cascade removes all sensitive tables, keeps sibling and anonymous charge holds, forbids late restoration',async()=>{
  await budget();const f=await fixture(),s=await fixture(f.p);await claim(f);const d=await reserve(f);await extraction(f);await apply(f);await call(db,'finish',f,f.token);await claim(s);
  await db.query('delete from children where id=$1',[f.c]);
  for(const table of ['scan_marking_jobs','scan_marking_items','scan_marking_revisions','scan_marking_dispatches'])assert.equal((await db.query(`select count(*)::int n from ${table} where child_id=$1`,[f.c])).rows[0].n,0);
  assert.equal((await rows(s)).length,1);assert.equal(await claim(f),'terminal');assert.equal(await call(db,'settle',null,d.dispatch,{cost:1000}),true);
  await db.query('delete from auth.users where id=$1',[f.p]);for(const table of ['scan_marking_jobs','scan_marking_items','scan_marking_revisions','scan_marking_dispatches'])assert.equal((await db.query(`select count(*)::int n from ${table} where parent_id=$1`,[f.p])).rows[0].n,0);
 });
 await test('existing sent photos recover without another Send',async()=>{
  const f=await fixture();let seen=false;
  for(let n=0;n<100;n++){const batch=(await db.query('select recover_scan_marking(10) v')).rows[0].v;if(batch.some(r=>r.photo===f.photo)){seen=true;break;}}
  assert(seen);assert.equal((await db.query('select sent_at is not null v from scan_photos where id=$1',[f.photo])).rows[0].v,true);
 });
 await test('real profile compare-and-set refuses stale effective snapshots, including first build',async()=>{
  const f=await fixture();await claim(f);await extraction(f);await apply(f);const rev=(await db.query('select revision from scan_marking_revisions where child_id=$1',[f.c])).rows[0].revision;
  const save = revision=>db.query("select save_marked_child_profile($1,$2,$3,null,null,2::smallint,'{}','[]','{}') v",[f.c,f.p,revision]);
  assert.equal((await save(Number(rev)-1)).rows[0].v,null);assert((await save(Number(rev))).rows[0].v.build_token);
 });
 await test('concurrent upload and queued-job boundaries admit only available slots, without objects or paid work',async()=>{
  const f=await fixture(),a=await open(),b=await open();await db.query('update scan_limits set active_jobs=1,queued_jobs=1,concurrent_uploads=2 where singleton');
  try {const ids=[randomUUID(),randomUUID()];const got=await Promise.all([a.query('select admit_scan_photo($1,$2,$3,100) v',[f.p,f.c,ids[0]]),b.query('select admit_scan_photo($1,$2,$3,100) v',[f.p,f.c,ids[1]])]);assert.deepEqual(got.map(r=>r.rows[0].v).sort(),['busy','reserved']);assert.equal((await db.query('select count(*)::int n from storage.objects where name like $1',[`${f.p}/%`])).rows[0].n,0);}finally{await a.end();await b.end();await db.query('update scan_limits set active_jobs=1,queued_jobs=8 where singleton');}
 });
 await test('simultaneous frequency, stored-byte and concurrent-upload boundaries refuse before objects',async()=>{
  for(const mode of ['frequency','day','quota','uploads']) {
   const f=await fixture(),a=await open(),b=await open();
   await db.query('update scan_limits set per_ten_minutes=40,per_day=60,concurrent_uploads=2,family_bytes=2147483648 where singleton');
   if(mode==='frequency')await db.query('update scan_limits set per_ten_minutes=2 where singleton');
   if(mode==='day')await db.query('update scan_limits set per_day=2 where singleton');
   if(mode==='quota')await db.query('update scan_limits set family_bytes=20971520 where singleton');
   if(mode==='uploads')await db.query('update scan_limits set concurrent_uploads=1 where singleton');
   try {const results=await Promise.all([a.query('select admit_scan_photo($1,$2,$3,100) v',[f.p,f.c,randomUUID()]),b.query('select admit_scan_photo($1,$2,$3,100) v',[f.p,f.c,randomUUID()])]);const vals=results.map(r=>r.rows[0].v);assert.equal(vals.filter(v=>v==='reserved').length,1);assert.equal(vals.filter(v=>v===({frequency:'frequency',day:'frequency',quota:'quota',uploads:'busy'}[mode])).length,1);assert.equal((await db.query('select count(*)::int n from storage.objects where name like $1',[f.p+'/%'])).rows[0].n,0);}finally{await a.end();await b.end();}
  }
  await db.query('update scan_limits set per_ten_minutes=40,per_day=60,concurrent_uploads=2,family_bytes=2147483648 where singleton');
 });
 await test('upload processing and marking share one active family slot in both directions',async()=>{
  const f=await fixture(),upload=randomUUID();
  assert.equal((await db.query('select admit_scan_photo($1,$2,$3,100) v',[f.p,f.c,upload])).rows[0].v,'reserved');
  assert.equal((await db.query('select start_scan_photo($1,$2) v',[f.p,upload])).rows[0].v,'started');
  assert.equal(await claim(f),'busy');await db.query("update scan_photos set state='rejected',terminal_at=now() where id=$1",[upload]);assert((await claim(f)).items);
  const next=randomUUID();assert.equal((await db.query('select admit_scan_photo($1,$2,$3,100) v',[f.p,f.c,next])).rows[0].v,'reserved');
  assert.equal((await db.query('select start_scan_photo($1,$2) v',[f.p,next])).rows[0].v,'busy');
 });
 await test('budget/off pause records its reason and releases the lease without resetting dispatch attempts',async()=>{
  const f=await fixture();await claim(f);await price();await reserve(f);
  assert.equal(await call(db,'pause',f,f.token,{status:'budget'}),true);
  let detail=await call(db,'detail',f);assert.equal(detail.job.blocked_reason,'budget');assert.equal(detail.job.lease_until,null);
  f.token=randomUUID();const job=await claim(f);assert(job.items);detail=await call(db,'detail',f);assert.equal(detail.job.dispatches,1);assert.equal(detail.job.blocked_reason,null);
 });
 await test('all-unscored rollback probe restores its fixture and produces no event',async()=>{
  const before=(await db.query('select count(*)::int n from auth.users')).rows[0].n;
  await db.query(readFileSync(path.join(__dirname,'scan_marking.sql'),'utf8'));
  assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,before);
 });
 await test('child image policy admits owner/admin and refuses copied family identity or a pending child deletion',async()=>{
  const f=await fixture();
  async function live(viewer,admin='false') {await db.query("select set_config('test.viewer',$1,false),set_config('test.admin',$2,false)",[viewer,admin]);await db.query('set role authenticated');try{return (await db.query('select scan_child_images_live($1) v',[f.c])).rows[0].v;}finally{await db.query('reset role');}}
  assert.equal(await live(f.p),true);assert.equal(await live(randomUUID()),false);assert.equal(await live(randomUUID(),'true'),true);
  await db.query('insert into child_deletions values($1,$2)',[f.c,f.p]);assert.equal(await live(f.p),false);assert.equal(await live(randomUUID(),'true'),false);
 });
 await test('RLS denies existing private photo/crop objects despite broad policies for owner, admin and anonymous',async()=>{
  const f=await fixture();await db.query("update scan_calibrations set state='running',result=null,lease_until=now()+interval '1 minute' where photo_id=$1",[f.photo]);
  const name=`${f.p}/${f.photo}/${f.cal}-crop-1.jpg`;await db.query("insert into storage.objects(bucket_id,name) values('scan-photos',$1)",[name]);
  for(const role of ['authenticated','anon'])for(const admin of ['false','true']) {
    await db.query("select set_config('test.viewer',$1,false),set_config('test.admin',$2,false)",[f.p,admin]);await db.query('set role '+role);
    try{assert.equal((await db.query('select * from storage.objects where name=$1',[name])).rowCount,0);await assert.rejects(()=>db.query("insert into storage.objects(bucket_id,name) values('scan-photos',$1)",[name+'x']),e=>['42501','P0001'].includes(e.code));}finally{await db.query('reset role');}
  }
  await db.query("update scan_photos set state='deleted',terminal_at=now() where id=$1",[f.photo]);assert.equal((await db.query('select * from storage.objects where name=$1',[name])).rowCount,1);
  await db.query("select set_config('test.viewer',$1,false)",[f.p]);await db.query('set role authenticated');try{assert.equal((await db.query('select * from storage.objects where name=$1',[name])).rowCount,0);}finally{await db.query('reset role');}
 });
 console.log(JSON.stringify({passed,failures,limits:{perTenMinutes:40,perDay:60,concurrentUploads:2,activeJobs:1,queuedJobs:8,inputBytes:20971520,decodedPixels:48000000,familyBytes:2147483648},proof:'local synthetic SQL, not hosted Storage API'}));await db.end();process.exitCode=failures?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
