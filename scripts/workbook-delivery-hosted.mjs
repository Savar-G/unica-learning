// #474: synthetic families only. Run against a local Next server backed by the hosted project.
// prepare -> check -> browser check -> delete. Secret fixture files stay under /tmp.
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { build } from 'esbuild';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire, Module } from 'node:module';
import { resolve } from 'node:path';
process.env.NODE_PATH=resolve('node_modules'); Module._initPaths();
const require = createRequire(import.meta.url);
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(x=>/^[A-Z_]+=/.test(x)).map(x=>{const at=x.indexOf('=');return [x.slice(0,at),x.slice(at+1).replace(/^"|"$/g,'')];}));
const url='https://cdjobwsyzndtltzfpyqa.supabase.co', pub='sb_publishable_QkL33gGZ-E1gOVdnLJsUEg_RgrRyqUs';
const service=createClient(url,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const base=process.env.DELIVERY_TEST_BASE ?? 'http://localhost:3474', fixtureFile='/tmp/r474-fixture.json', evidence='.design/experiments/r474';
mkdirSync(evidence,{recursive:true});
function ok(r){if(r.error)throw new Error(r.error.message);return r.data;}
function save(f){writeFileSync(fixtureFile,JSON.stringify(f),{mode:0o600});}
async function session(f){
 const cookies=[];
 const db=createServerClient(url,pub,{cookies:{getAll:()=>cookies,setAll:values=>{for(const v of values){const i=cookies.findIndex(x=>x.name===v.name);if(i<0)cookies.push(v);else cookies[i]=v;}}}});
 ok(await db.auth.signInWithPassword({email:f.email,password:f.password}));
 return {db,cookies,header:cookies.map(x=>`${x.name}=${x.value}`).join('; ')};
}
async function action(s,book,input){
 const r=await fetch(`${base}/api/admin/workbooks/${book}/delivery`,{method:'POST',headers:{origin:base,'content-type':'application/json',...(s?{cookie:s.header}:{})},body:JSON.stringify(input)});
 return {http:r.status,result:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};
}
const mode=process.argv[2];
if(mode==='prepare'){
 const f={families:[],started:new Date().toISOString()};
 for(const role of ['owner','other','admin']){
  const email=`delivery474-${role}-${randomUUID()}@example.test`,password=randomUUID()+'aA!7';
  const user=ok(await service.auth.admin.createUser({email,password,email_confirm:true})).user;
  f.families.push({role,id:user.id,email,password,child:randomUUID(),books:[]});save(f);
  const a=f.families.at(-1);
  ok(await service.from('parents').insert({id:a.id,email,name:'Delivery QA',source:{qa:'474'},time_zone:'America/Toronto'}));
  ok(await service.from('test_accounts').insert({parent_id:a.id,marked_by:a.id}));
  ok(await service.from('children').insert({id:a.child,parent_id:a.id,first_name:'Alex',grade:3,province:'ON'}));
  if(role==='admin')ok(await service.from('admin_users').insert({user_id:a.id,email,name:'Delivery QA Admin'}));
  for(const number of [1,2,3]){
   const id=randomUUID();a.books.push(id);save(f);
   ok(await service.from('workbooks').insert({id,parent_id:a.id,child_id:a.child,number,levels:[4],status:'draft'}));
   if(number<3)ok(await service.from('workbooks').update({status:'shipped',shipped_at:'2026-10-01T12:00Z'}).eq('id',id));
  }
 }
 const adm=await session(f.families[2]);
 f.browserCookies=adm.cookies.map(c=>({name:c.name,value:c.value,domain:'localhost',path:'/',httpOnly:false,secure:false,sameSite:'Lax'}));save(f);
 console.log('Prepared three marked synthetic families, with three numbered workbooks each.');
} else if(mode==='check'){
 await build({entryPoints:['src/lib/workbook-delivery.ts','src/lib/workbook-delivery-store.ts'],bundle:true,platform:'node',format:'cjs',outdir:'/tmp/r474-modules',packages:'external',tsconfig:'tsconfig.json'});
 const core=require('/tmp/r474-modules/workbook-delivery.js'),{workbookDeliveryStore}=require('/tmp/r474-modules/workbook-delivery-store.js');
 const f=JSON.parse(readFileSync(fixtureFile)),[owner,other,admin]=f.families;
 const [a,o,x]=await Promise.all([session(admin),session(owner),session(other)]);
 const store=workbookDeliveryStore(a.db), checks=[];
 const input={childId:owner.child,number:1,localTime:'2026-10-25T09:37',timeZone:'America/Toronto'};
 assert.equal(await store.receipt(owner.books[0]),null);
 for(const s of [null,o,x]) assert.equal((await action(s,owner.books[0],input)).http,404);
 for(const s of [o,x]){const r=await s.db.rpc('confirm_workbook_delivery',{p_workbook:owner.books[0],p_child:owner.child,p_number:1,p_delivered:'2026-10-25T13:37Z',p_local:input.localTime,p_zone:input.timeZone,p_override:true});assert.equal(ok(r).reason,'admin_required');}
 const anonymous=createClient(url,pub,{auth:{persistSession:false}});
 assert((await anonymous.rpc('confirm_workbook_delivery',{p_workbook:owner.books[0],p_child:owner.child,p_number:1,p_delivered:'2026-10-25T13:37Z',p_local:input.localTime,p_zone:input.timeZone,p_override:true})).error);
 checks.push('Anonymous, owning parent and other non-admin denied through HTTP and direct RPC.');
 const concurrent=await Promise.all(Array.from({length:8},()=>action(a,owner.books[0],input)));
 assert(concurrent.every(r=>r.http===200),JSON.stringify(concurrent));
 const first=await store.receipt(owner.books[0]);assert(first);assert(concurrent.every(r=>JSON.stringify(r.result.receipt)===JSON.stringify(first)));
 assert.equal(first.actorId,admin.id);assert.equal(first.deliveredAt,'2026-10-25T13:37:00.000Z');assert(Date.parse(first.recordedAt)>Date.parse(first.deliveredAt));
 assert.deepEqual((await action(a,owner.books[0],input)).result.receipt,first);
 assert.deepEqual(await workbookDeliveryStore((await session(admin)).db).receipt(owner.books[0]),first);
 const audits=ok(await service.from('workbook_audit').select('id,actor_id').eq('workbook_id',owner.books[0]).eq('action','workbook-delivered'));assert.equal(audits.length,1);assert.equal(audits[0].actor_id,admin.id);
 checks.push('Eight concurrent identical public HTTP confirms, reload in fresh session, retry: one receipt and one original actor/audit.');
 const conflicting=await action(a,owner.books[0],{...input,localTime:'2026-10-26T09:37'});assert.equal(conflicting.result.reason,'delivery_conflict');
 assert.deepEqual(await store.receipt(owner.books[0]),first);
 const secondInput={...input,number:2,localTime:'2026-10-30T09:37'};
 assert.equal((await action(a,owner.books[1],secondInput)).http,200);
 const second=await store.receipt(owner.books[1]);assert(second);assert.notEqual(first.auditId,second.auditId);assert.notEqual(first.workbookId,second.workbookId);
 assert.deepEqual(core.deliveryDeadlines(first),{reminderAt:'2026-10-29T13:37:00.000Z',backstopAt:'2026-11-15T14:37:00.000Z'});
 assert.deepEqual(core.deliveryDeadlines(second),{reminderAt:'2026-11-03T14:37:00.000Z',backstopAt:'2026-11-20T14:37:00.000Z'});
 assert.deepEqual(await store.receipt(owner.books[0]),first);
 checks.push('Book 2 has distinct persisted receipt/deadlines; book 1 and its four/21-day anchors unchanged.');
 for(const [book,change,reason] of [[owner.books[0],{childId:other.child},'identity_mismatch'],[owner.books[0],{number:2},'identity_mismatch'],[owner.books[2],{number:3},'not_shipped'],[owner.books[0],{localTime:'2099-01-01T09:37'},'invalid_delivery_time'],[owner.books[0],{localTime:'2026-02-30T09:37'},'invalid_delivery_time'],[owner.books[0],{localTime:'2026-03-08T02:37'},'invalid_delivery_time'],[owner.books[0],{timeZone:'bad'},'zone_changed']]) assert.equal((await action(a,book,{...input,...change})).result.reason,reason);
 assert.equal((await action(a,randomUUID(),input)).http,404);
 checks.push('Missing/not-shipped workbook, wrong child/number, future/calendar/gap time, and changed zone refused.');
 assert.deepEqual(await workbookDeliveryStore(o.db).receipt(owner.books[0]),first);
 assert.equal(await workbookDeliveryStore(x.db).receipt(owner.books[0]),null);
 assert((await anonymous.from('workbook_delivery_receipts').select('*')).error);
 for(const s of [a,o,x]){
  assert((await s.db.from('workbook_delivery_receipts').insert({workbook_id:randomUUID()})).error);
  assert((await s.db.from('workbook_delivery_receipts').update({local_time:'2026-10-30T10:00'}).eq('workbook_id',owner.books[0])).error);
  assert((await s.db.from('workbook_delivery_receipts').delete().eq('workbook_id',owner.books[0])).error);
 }
 assert((await service.from('workbook_delivery_receipts').update({local_time:'2026-10-30T10:00'}).eq('workbook_id',owner.books[0])).error);
 checks.push('RLS: admin and owner read; other family sees none; anon denied. All browser roles denied direct writes; service update immutable.');
 // The direct RPC validates instants too; bypassing the app cannot inject a mismatched clock or future time.
 for(const [delivered,local] of [['2099-01-01T14:37Z','2099-01-01T09:37'],['2026-10-25T14:37Z',input.localTime]]){
  const r=ok(await a.db.rpc('confirm_workbook_delivery',{p_workbook:owner.books[0],p_child:owner.child,p_number:1,p_delivered:delivered,p_local:local,p_zone:'America/Toronto',p_override:true}));assert.equal(r.status,'refused');
 }
 const before=await fetch(`${base}/admin/workbooks/${other.books[0]}`,{headers:{cookie:a.header}});assert.equal(before.status,200);assert((await before.text()).includes('Delivery needs confirmation'));
 const after=await fetch(`${base}/admin/workbooks/${owner.books[0]}`,{headers:{cookie:a.header}});assert.equal(after.status,200);assert((await after.text()).includes('Delivery confirmed.'));
 checks.push('Admin reload renders missing delivery work and the saved receipt. Direct RPC time checks hold.');
 writeFileSync(`${evidence}/hosted-actions.json`,JSON.stringify({checks,first,second,firstDeadlines:core.deliveryDeadlines(first),secondDeadlines:core.deliveryDeadlines(second),proofLimits:['Synthetic families only. No paid AI or real Stripe request. S11b progress/re-evaluation remains future work.']},null,2)+'\n');
 console.log(checks.join('\n'));
} else if(mode==='delete'){
 const f=JSON.parse(readFileSync(fixtureFile)),[owner,,admin]=f.families,a=await session(admin);
 const workerKey=JSON.parse(readFileSync('/tmp/r474-worker-key.json')).api_key;
 const worker=createClient(url,workerKey,{auth:{persistSession:false,autoRefreshToken:false}});
 await build({entryPoints:['src/lib/family-deletion-store.ts'],bundle:true,platform:'node',format:'cjs',outfile:'/tmp/r474-deletion.cjs',packages:'external',tsconfig:'tsconfig.json',plugins:[{name:'server-only',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:'',loader:'js'}));}}]});
 const {runFamilyDeletion}=require('/tmp/r474-deletion.cjs');
 assert.equal(ok(await a.db.rpc('request_family_deletion',{p:owner.id,confirmation:owner.email})),'requested');
 const input={childId:owner.child,number:1,localTime:'2026-10-25T09:37',timeZone:'America/Toronto'};
 assert.equal((await action(a,owner.books[0],input)).result.reason,'family_frozen');
 const result=await runFamilyDeletion(worker,owner.id,worker,Date.now()+45000);assert.equal(result.state,'deleted',JSON.stringify(result));
 assert.equal(ok(await service.from('workbook_delivery_receipts').select('*').eq('parent_id',owner.id)).length,0);
 assert.equal(ok(await service.from('workbook_audit').select('*').eq('parent_id',owner.id)).length,0);
 assert((await worker.auth.admin.getUserById(owner.id)).error);
 writeFileSync(`${evidence}/hosted-deletion.json`,JSON.stringify({credential:'Existing retention_worker key',result,checks:['Family freeze refuses receipt retries','Real worker deletes dedicated synthetic family','Receipt and audit rows cascade','Auth user absent'],proofLimits:['No image bucket added in this slice. Existing scan storage tests belong to S1. Retention eligibility code is unchanged.']},null,2)+'\n');
 for(const fam of f.families.slice(1))ok(await service.auth.admin.deleteUser(fam.id));
 console.log('PASS: hosted family deletion with actual retention_worker credentials; all three synthetic families removed.');
} else throw new Error('Use prepare, check, or delete');
