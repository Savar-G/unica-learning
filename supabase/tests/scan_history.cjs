// S8 synthetic public reader + actual production SQL. Dedicated local Unix socket only, no network.
const { Pool } = require('pg');
const { readFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { build } = require('esbuild');
const { Module } = require('node:module');
const path = require('node:path');
const assert = require('node:assert/strict');
const socket=process.env.SCAN_MARKING_SOCKET, database=process.env.SCAN_MARKING_DATABASE??'postgres';
if(!socket?.startsWith('/tmp/pd457-pg-s5-pd470-')||(database!=='postgres'&&!database.startsWith('pd457_')))throw Error('Dedicated disposable S8 socket/database required');
const pool=new Pool({host:socket,database,user:process.env.USER}), root=path.resolve(__dirname,'../..');
const call=async(action,parent,data={},client=pool)=>(await client.query('select scan_marking_command($1,$2,null,null,$3) v',[action,parent,data])).rows[0].v;
const db={async rpc(name,a){assert.equal(name,'scan_marking_command');try{return {data:await call(a.p_action,a.p_parent,a.p_data),error:null};}catch(e){return {data:null,error:{message:e.message}};}}};
const copy=v=>JSON.parse(JSON.stringify(v));
async function load(){const r=await build({stdin:{contents:`export { scanHistoryStore } from './src/lib/scan-history-reader';export { readScanHistory } from './src/lib/scan-history';`,resolveDir:root,loader:'ts'},bundle:true,write:false,metafile:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'synthetic',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));}}]});
 assert(!Object.keys(r.metafile.inputs).some(p=>/scan-crops|workbook-render|scan-marking-store|sharp/.test(p)),'History reader imported image dependencies');
 const m=new Module(path.join(root,'supabase/tests/.pd470-memory.cjs'),module);m.filename=path.join(root,'supabase/tests/.pd470-memory.cjs');m.paths=module.paths;m._compile(r.outputFiles[0].text,m.filename);return m.exports;}
let passed=0,failures=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS',name);}catch(e){failures++;console.error('FAIL',name,e.stack);}}
(async()=>{
 await pool.query("alter table children add column if not exists first_name text not null default 'Synthetic';alter table workbooks add column if not exists number int not null default 1;alter table workbook_pages add column if not exists day_label text default 'Day 1';create table if not exists admin_users(user_id uuid primary key references auth.users(id) on delete cascade)");
 const f=(await pool.query(`select m.*,s.id photo from scan_marking_items m join scan_photos s on s.page_id=m.page_id and s.printed_revision=m.printed_revision
  join parents p on p.id=m.parent_id and p.deletion_requested_at is null
  where m.observation->>'actor'='parent' and m.original_event is not null and not exists(select 1 from child_deletions d where d.child_id=m.child_id)
  and (s.state in ('deleted','expired') or s.expires_at<=clock_timestamp()) order by m.id,s.id limit 1`)).rows[0];assert(f,'Run S4 bootstrap then S5 fixtures first');
 const parent=f.parent_id,child=f.child_id,workbook=f.workbook_id,admin=randomUUID();
 await pool.query('insert into auth.users values($1);',[admin]);await pool.query('insert into admin_users values($1)',[admin]);
 const before=await call('history',parent,{child});if(!process.argv.includes('--installed'))assert.equal(before,'terminal','Old command unexpectedly implements history');console.log('CONTROL old command has no page-history projection');
 const previous=(await pool.query("select prosrc from pg_proc where oid='public.scan_marking_command(text,uuid,uuid,uuid,jsonb)'::regprocedure")).rows[0].prosrc;
 const send=(await pool.query("select prosrc from pg_proc where proname='send_scan_photos'")).rows;
 if(!process.argv.includes('--installed'))await pool.query(readFileSync(path.join(root,'supabase/migrations/20261106_scan_page_history.sql'),'utf8'));
 if(!process.argv.includes('--installed'))assert.equal((await pool.query("select prosrc from pg_proc where oid='public.scan_marking_saved_command(text,uuid,uuid,uuid,jsonb)'::regprocedure")).rows[0].prosrc,previous);
 assert.deepEqual((await pool.query("select prosrc from pg_proc where proname='send_scan_photos'")).rows,send);console.log('CONTROL S4/S5 command and Send bodies unchanged');
 const api=await load(),read=(filter={},monitor=false,limit=25)=>api.readScanHistory(api.scanHistoryStore(db,monitor?{admin}:{parent}),{child,workbook,...filter},Date.now(),limit);
 const pages=[];
 for(let n=0;n<110;n++){const id=randomUUID();pages.push(id);await pool.query("insert into workbook_pages(id,workbook_id,parent_id,page_number,day_label,print_contract,image_width,image_height) values($1,$2,$3,$4,$5,'{}',1000,1400)",[id,workbook,parent,n+10,'Day '+(n%7+1)]);}
 const addPhoto=async(page,state='saved')=>{const id=randomUUID();await pool.query("insert into scan_photos(id,parent_id,child_id,page_id,workbook_id,printed_revision,state,reserved_bytes,width,height,sent_at) values($1,$2,$3,$4,$5,$6,$7,0,1000,1400,now())",[id,parent,child,page,workbook,f.printed_revision,state]);return id;};
 const reviewPhoto=await addPhoto(pages[0]),failedPhoto=await addPhoto(pages[1]);
 const expected=copy(f.expected),observation=copy(f.observation);expected.identity.pageId=pages[0];observation.identity.pageId=pages[0];Object.assign(observation,{state:'pending',method:'code',result:null,actor:'system',resultVersion:1,evidence:{photoRevision:reviewPhoto}});
 await pool.query("insert into scan_marking_items(parent_id,child_id,workbook_id,printed_revision,page_id,item_id,expected,observation) values($1,$2,$3,$4,$5,$6,$7,$8)",[parent,child,workbook,f.printed_revision,pages[0],f.item_id,expected,observation]);
 for(const [photo,page,state,blocked,dispatches,extraction]of[[reviewPhoto,pages[0],'finished',null,1,[observation]],[failedPhoto,pages[1],'queued','pending',1,null]])await pool.query("insert into scan_marking_jobs(photo_id,parent_id,child_id,workbook_id,page_id,printed_revision,state,blocked_reason,dispatches,frame_hash,extraction) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'synthetic',$10)",[photo,parent,child,workbook,page,f.printed_revision,state,blocked,dispatches,extraction === null ? null : JSON.stringify(extraction)]);
 await pool.query('delete from scan_marking_dispatches;delete from scan_marking_spend');
 await pool.query('update scan_marking_jobs set dispatches=2 where photo_id=$1',[f.photo]);
 const model='anthropic/claude-sonnet-5.5',period=(await pool.query("select date_trunc('month',now() at time zone 'UTC')::date::text p")).rows[0].p;
 const insertSpend=async(photo,attempt,charged)=>{const id=randomUUID();await pool.query('insert into scan_marking_spend(id,period,model,reserved_micros,charged_micros) values($1,$2,$3,10000,$4)',[id,period,model,charged]);if(photo)await pool.query('insert into scan_marking_dispatches(id,photo_id,parent_id,child_id,attempt) values($1,$2,$3,$4,$5)',[id,photo,parent,child,attempt]);return id;};
 await insertSpend(f.photo,1,1000);const unknown=await insertSpend(f.photo,2,null);await insertSpend(reviewPhoto,1,2000);await insertSpend(failedPhoto,1,3000);const orphan=await insertSpend(null,1,null);await pool.query('update scan_marking_spend set reserved_micros=7000 where id=$1',[orphan]);
 await test('full cursor history contains every printed page, one corrected canonical original and expired reading',async()=>{
  let after;const seen=[];for(let n=0;n<20;n++){const r=await read({after});assert(r);assert.equal(Object.values(r.counts).reduce((a,b)=>a+b,0),r.pages.length);seen.push(...r.pages);after=r.after;if(!after)break;}
  const actual=(await pool.query('select count(*)::int n from workbook_pages where workbook_id=$1 and day_label is not null',[workbook])).rows[0].n;
  assert.equal(seen.length,actual);assert.equal(new Set(seen.map(p=>p.id)).size,actual);assert.equal(seen.filter(p=>p.id===f.page_id).length,1);assert(seen.find(p=>p.id===f.page_id).photo);
  const raw=(await call('history',parent,{child,workbook})).pages;let retained=raw.find(p=>p.id===f.page_id);if(!retained){const all=await call('history',parent,{child,workbook,after:raw.at(-1).id});retained=all.pages.find(p=>p.id===f.page_id);}assert(retained);assert.equal(retained.marks[0].observation.readAnswerText,f.observation.readAnswerText);assert.equal(retained.marks[0].observation.actor,'parent');
 });
 await test('same filtered machine pages determine counts, dispatch attempts and cost totals',async()=>{
  let after,reported=0,reserved=0,attempts=0;for(let n=0;n<20;n++){const r=await read({after},true);const ids=r.pages.map(p=>p.id);
   const costs=(await pool.query(`select coalesce(sum(x.charged_micros),0)::int reported,coalesce(sum(x.reserved_micros) filter(where x.charged_micros is null),0)::int reserved,count(*)::int attempts from scan_marking_jobs j join scan_marking_dispatches d on d.photo_id=j.photo_id join scan_marking_spend x on x.id=d.id where j.page_id=any($1)`,[ids])).rows[0];assert.equal(r.costs.reported,costs.reported);assert.equal(r.costs.reserved,costs.reserved);assert.equal(r.costs.attempts,costs.attempts);reported+=r.costs.reported;reserved+=r.costs.reserved;attempts+=r.costs.attempts;after=r.after;if(!after)break;}
  assert.equal(reported,6000);assert.equal(reserved,10000);assert.equal(attempts,4);
 });
 await test('unresolved and failed job filters use the same parent/Admin reader',async()=>{
  const parentReview=await read({status:'review'}),adminReview=await read({status:'review'},true);assert.deepEqual(parentReview.pages,adminReview.pages);assert(parentReview.pages.some(p=>p.id===pages[0]));assert(parentReview.pages.every(p=>p.status==='review'));
  const failed=await read({status:'failed'},true);assert(failed.pages.some(p=>p.id===pages[1]));assert(failed.costs.split.some(s=>s.outcome==='failed'));assert(failed.pages.every(p=>p.failedJob));
 });
 await test('global cap includes other and deleted-link reservations, independent of list filters',async()=>{
  const r=await read({status:'review'},true);assert.equal(r.budget.cap,50000000);assert.equal(r.budget.reported,6000);assert.equal(r.budget.reserved,17000);assert.equal(r.budget.held,23000);assert.equal(r.budget.unknown,2);assert.equal(r.costs.reported,2000);assert.equal(r.costs.logicalCalls,1);assert.equal(r.costs.attempts,1);
 });
 await test('unknown cost stays reserved until actual settlement and failed/uncertain spend stays counted',async()=>{
  assert.equal(await call('settle',null,{cost:2000}),false); // No dispatch token cannot settle anything.
  assert.equal((await pool.query("select scan_marking_command('settle',null,null,$1,'{\"cost\":2000}') v",[unknown])).rows[0].v,true);
  let after,reported=0;for(let n=0;n<20;n++){const r=await read({after},true);reported+=r.costs.reported;after=r.after;if(!after)break;}assert.equal(reported,8000);assert.equal((await read({},true)).budget.held,15000);
 });
 await test('concurrent devices read one canonical item while a parent correction commits',async()=>{
  const before=(await pool.query('select observation,result_version from scan_marking_items where id=$1',[f.id])).rows[0];const target=before.observation.result==='blank'?'right':'blank';
  const [a,change,b]=await Promise.all([call('history',parent,{child,workbook}),pool.query("select scan_marking_command('change',$1,$2,null,$3) v",[parent,f.photo,{itemId:f.item_id,version:before.result_version,result:target}]),call('history',parent,{child,workbook})]);assert.equal(change.rows[0].v.status,'saved');
  for(const r of [a,b]){const page=r.pages.find(p=>p.id===f.page_id);if(!page)continue;assert.equal(page.marks.length,1);const o=page.marks[0].observation;assert([before.result_version,before.result_version+1].includes(o.resultVersion));assert.equal(o.result,o.resultVersion===before.result_version?before.observation.result:target);assert.equal(o.readAnswerText,before.observation.readAnswerText);}
 });
 await test('clock expiry changes image availability without removing canonical marks or dispatch history',async()=>{
  const before=await call('history',parent,{child,workbook});await pool.query("update scan_photos set expires_at=clock_timestamp()-interval '1 second' where id=$1",[reviewPhoto]);const after=await call('history',parent,{child,workbook});assert.deepEqual(after.pages.map(p=>p.marks),before.pages.map(p=>p.marks));assert.deepEqual(after.pages.map(p=>p.spend),before.pages.map(p=>p.spend));
 });
 await test('foreign families, fake admins and direct browser roles cannot use the service reader',async()=>{
  const other=randomUUID();await pool.query('insert into auth.users values($1)',[other]);await pool.query('insert into parents(id) values($1)',[other]);assert.equal(await call('history',other,{child,workbook}),null);assert.equal(await call('monitor',null,{admin:other}),null);
  for(const role of ['anon','authenticated']){const c=await pool.connect();try{await c.query('set role '+role);await assert.rejects(()=>call('history',parent,{child},c),e=>e.code==='42501');await assert.rejects(()=>call('monitor',null,{admin},c),e=>e.code==='42501');}finally{await c.query('reset role');c.release();}}
 });
 await test('family/child freezes hide history, deletion cascades records and keeps anonymous global holds',async()=>{
  await pool.query('insert into child_deletions(child_id,parent_id) values($1,$2)',[child,parent]);assert.equal(await call('history',parent,{child}),null);assert(!(await call('monitor',null,{admin,child})).pages.length);await pool.query('delete from child_deletions where child_id=$1',[child]);
  await pool.query('update parents set deletion_requested_at=now() where id=$1',[parent]);await assert.rejects(()=>call('history',parent,{child}),e=>e.code==='55000');assert(!(await call('monitor',null,{admin,child})).pages.length);
  const budget=(await call('monitor',null,{admin})).budget;await pool.query('delete from auth.users where id=$1',[parent]);assert.equal((await pool.query('select count(*)::int n from scan_marking_items where child_id=$1',[child])).rows[0].n,0);assert.equal((await pool.query('select count(*)::int n from scan_mark_changes where child_id=$1',[child])).rows[0].n,0);assert.deepEqual((await call('monitor',null,{admin})).budget,budget);
 });
 console.log(JSON.stringify({passed,failures,proof:'synthetic local SQL and real lean public reader; no hosted auth, Storage HTTP, provider or recognition proof'}));await pool.end();process.exitCode=failures?1:0;
})().catch(async e=>{console.error(e);await pool.end();process.exitCode=1;});
